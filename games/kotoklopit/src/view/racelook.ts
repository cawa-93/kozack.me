// Гонка (крок 16, пакет A14; §8.5): де лежать плитки дороги й узбіччя, де стоять машини, якого вони вигляду й як розтягнути
// смугу прогресу. Чисті розрахунки без Phaser і DOM (`tests/racelook.test.ts`); малює `RaceScene`.
//
// Масштаб: арт гонки намальовано для полотна заввишки 720 (1 одиниця = 1 px), а вище полотно (екран вужчий за 16:9)
// збільшує все разом — `raceScale`. Відстані дороги переводить у пікселі той самий множник, що й у старому вигляді
// (`racePixelsPerUnit`: видно `RACE.view` дороги на ¾ висоти), тож машина завдовжки 58 одиниць займає ≈ 0,27 дороги за будь-якої
// висоти — трохи більше, ніж довжина зіткнення (`RACE.carLength` 0,15), як і прямокутник старого вигляду (0,24).

import { PALETTE } from "../../art/palette";
import { RACE } from "../sim/config";
import type { RaceCar } from "../sim/types";
import { RACE_TILES } from "./art/manifest/a14-race";

/** Висота полотна, для якої намальовано арт гонки: на ній 1 одиниця арту = 1 px. */
export const RACE_ART_HEIGHT = 720;
/** Де стоїть своя машина: частка висоти полотна (як у старому вигляді). */
export const RACE_PLAYER_Y = 0.78;
/** Скільки ширше за зовнішній край бордюру трава узбіччя заходить під дорогу (одиниці арту): щоб між ними не було щілини. */
const VERGE_UNDER_CURB = 6;
/** Смуга прогресу: середина — стільки одиниць арту від середини дороги (за стовпчиками). */
export const RACE_BAR_X = 214;
/** Своя машинка на смузі прогресу: її масштаб відносно арту й наскільки (одиниці арту) вона тримається від кінців смуги. */
export const RACE_MARKER_SCALE = 0.42;
const RACE_MARKER_INSET = 15;
/** Нахил своєї машини, поки вона перестроюється, радіан на смугу різниці (найбільше — на одну смугу). */
const STEER_TILT = 0.2;

/** Скільки пікселів полотна на одиницю дороги — як у старому вигляді: `RACE.view` дороги видно на ¾ висоти. */
export function racePixelsPerUnit(height: number): number {
  return (height * 0.75) / RACE.view;
}

/** Масштаб арту гонки (пікселів на одиницю арту) для полотна заввишки `height`. */
export function raceScale(height: number): number {
  return height / RACE_ART_HEIGHT;
}

/** Зсув плиток, що біжать донизу, коли проїхано `distance` пікселів: 0…`period` (не включно). */
export function scrollOffset(distance: number, period: number): number {
  if (!(period > 0)) return 0;
  const offset = distance % period;
  return offset < 0 ? offset + period : offset;
}

/** Ряд плиток: верхній край вмісту (y екрана) і номер плитки на дорозі — сталий, поки вона їде екраном донизу. */
export interface TileRow {
  y: number;
  n: number;
}

/**
 * Ряди плиток з кроком `period`, що разом вкривають 0…`height`, перший — вище за 0. `offset` — скільки проїхано (пікселі,
 * плюс фаза стовпця): що більше, то нижче ряди.
 */
export function tileRows(offset: number, period: number, height: number): TileRow[] {
  if (!(period > 0)) return [];
  const shift = scrollOffset(offset, period);
  // Номер верхнього ряду: скільки цілих кроків проїхано (з того самого залишку, що й зсув, — без розбіжності округлень).
  const first = Math.round((offset - shift) / period);
  const rows: TileRow[] = [];
  for (let y = shift - period, i = 0; y < height; y += period, i++) rows.push({ y, n: first - i });
  return rows;
}

/**
 * Чи віддзеркалити ряд плиток з номером `n`: через один. Смуги перекриття плиток симетричні (`RACE_TILES`), тож шва немає,
 * а люк, латка й дерева переходять на інший бік — малюнок повторюється вдвічі рідше й не впізнається на одному екрані.
 */
export function rowFlipped(n: number): boolean {
  return ((n % 2) + 2) % 2 === 1;
}

/** Стовпець узбіччя: x pivot плитки (її середини), чи віддзеркалити й вертикальна фаза (0…1 кроку). */
export interface VergeColumn {
  x: number;
  flip: boolean;
  phase: number;
}

/**
 * Стовпці узбіччя ліворуч і праворуч від дороги з серединою `cx` до країв полотна завширшки `width`. Плитки стовпця — з
 * кроком `period`; сусідні стовпці перекриваються на смугу трави біля країв плитки, тож їх можна зсувати по вертикалі (фаза)
 * і віддзеркалювати — так поле не повторюється рядами. Перший стовпець заходить краєм трави під бордюр.
 */
export function vergeColumns(width: number, cx: number, k: number): VergeColumn[] {
  const { period, top, bottom } = RACE_TILES.verge;
  const half = (bottom - top) / 2; // від середини плитки (pivot) до краю вмісту
  const columns: VergeColumn[] = [];
  const edge = (RACE_TILES.road.curb - VERGE_UNDER_CURB) * k;
  for (const side of [-1, 1] as const) {
    for (let j = 0; ; j++) {
      const x = cx + side * (edge + half * k + j * period * k);
      if (side < 0 ? x + half * k <= 0 : x - half * k >= width) break;
      const phase = (j * 0.37 + (side < 0 ? 0.19 : 0.61)) % 1;
      columns.push({ x, flip: (j + (side > 0 ? 1 : 0)) % 2 === 1, phase });
      if (j > 64) break;
    }
  }
  return columns;
}

/** X середини смуги `lane` (дробової, поки машина перестроюється) на дорозі з серединою `cx`. */
export function laneX(cx: number, lane: number, k: number): number {
  return cx + (lane - (RACE.lanes - 1) / 2) * RACE_TILES.road.lane * k;
}

/** Нахил своєї машини під час перестроювання: у бік смуги, куди вона їде; стала в смузі — рівно. */
export function steerTilt(lane: number, targetLane: number): number {
  return Math.max(-1, Math.min(1, targetLane - lane)) * STEER_TILT;
}

/** Види машин потоку — стани `race/car/traffic`. */
export const TRAFFIC_KINDS = ["sedan", "hatch", "van"] as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];

/**
 * Кольори кузовів потоку — основні тони барвистих сімей палітри арту (`art/STYLE.md` §11 race: машини — барвисті сім'ї).
 * Червоного немає: червона лише своя машина.
 */
export const TRAFFIC_COLORS: readonly number[] = [PALETTE.blue, PALETTE.plum, PALETTE.green, PALETTE.mustard, PALETTE.grey, PALETTE.teal].map((hex) =>
  Number.parseInt(hex.slice(1), 16),
);

export interface TrafficLook {
  kind: TrafficKind;
  /** Номер кольору в `TRAFFIC_COLORS`. */
  color: number;
}

const wrap = (value: number, n: number): number => ((Math.floor(value) % n) + n) % n;

/**
 * Вид і колір машини потоку — з того місця дороги, де вона з'явилася (`start`), як і колір у старому вигляді. Сцена запам'ятовує
 * вигляд машини, коли вперше її побачила: машину позаду, що пригальмовує за персонажем, сим відсуває (`start` змінюється),
 * а перефарбовуватися вона не повинна.
 */
export function trafficLook(car: Pick<RaceCar, "start">): TrafficLook {
  return { kind: TRAFFIC_KINDS[wrap(car.start * 11, TRAFFIC_KINDS.length)] ?? "sedan", color: wrap(car.start * 7, TRAFFIC_COLORS.length) };
}

/** Частина розтягнутої смуги: де на екрані верх кадру, скільки пікселів на одиницю по вертикалі й який шматок кадру видно. */
export interface BarPart {
  /** Y екрана, де стоїть верх кадру (origin 0 по вертикалі). */
  y: number;
  /** Пікселів екрана на одиницю арту по вертикалі. */
  scaleY: number;
  /** Видимий шматок кадру по вертикалі, одиниці арту від верху полотна. */
  cropY: number;
  cropH: number;
}

/**
 * Смуга прогресу трьома частинами: верх кадру (0…`slice`) і низ (`frameH − slice`…`frameH`) — у масштабі `k`, середина —
 * розтягнута на решту висоти `height`. Коротша смуга, ніж два краї, — краї стиснуті навпіл, середини немає (null).
 */
export function barParts(top: number, height: number, k: number, frameH: number, slice: number): { top: BarPart; middle: BarPart | null; bottom: BarPart } {
  const h = Math.max(0, height);
  const cap = Math.min(slice * k, h / 2);
  const capScale = slice > 0 ? cap / slice : k;
  const middleUnits = frameH - 2 * slice;
  const middleLength = h - 2 * cap;
  const middleScale = middleUnits > 0 ? middleLength / middleUnits : 0;
  return {
    top: { y: top, scaleY: capScale, cropY: 0, cropH: slice },
    middle: middleLength > 0 && middleUnits > 0 ? { y: top + cap - slice * middleScale, scaleY: middleScale, cropY: slice, cropH: middleUnits } : null,
    bottom: { y: top + h - frameH * capScale, scaleY: capScale, cropY: frameH - slice, cropH: slice },
  };
}

/**
 * Де на смузі прогресу (верх `top`, висота `height`) стоїть своя машинка, коли пройдено частку `done`: на межі пройденого,
 * але не ближче за півмашинки до заокруглених кінців смуги.
 */
export function barMarkerY(top: number, height: number, done: number, k: number): number {
  const inset = Math.min(RACE_MARKER_INSET * k, height / 2);
  const at = top + height * (1 - Math.max(0, Math.min(1, done)));
  return Math.max(top + inset, Math.min(top + height - inset, at));
}
