// Джерела світла квартири в темний час (§8.9 «День і ніч», §4.1 «Планове відключення»; рішення автора 2026-11-02): що
// зараз світить, де, яким кольором і наскільки яскраво. Карта світла й сяйва (`iso/light.ts`) малюють із цього переліку.
// Чиста функція стану гри й світла доби, без Phaser і DOM (`tests/lightsources.test.ts`).
//
// - Невидимі стельові світильники (`CEILING_LAMPS`), бра (`SCONCES`) і настільна лампа (`DESK_LAMP`) — лише коли є електрика
//   й лампи доби горять (стельові — зі зсувом по кімнатах, `DAYLIGHT.lampShift`; бра й лампа — лише разом зі станом арту
//   `lampsOn`, `litStrength`).
// - Свічки на поличках (`CANDLE_SHELVES`), свічка на столі з комп'ютером замість настільної лампи (`DESK_CANDLE`) і дисплей
//   зарядної станції (`POWER_STATION`) — лише в день відключення (свічки — лише разом зі станом арту `lit`, `candlesLit`).
// - Індикатор бойлера (`BOILER`) — коли є електрика (у відключення не горить).
// - Газовий пальник на плиті — у відключення, поки на плиті страва: синє полум'я.
// - Екран комп'ютера — поки на ньому щось є (робота, пошук, кіт на клавіатурі): на станції він працює і у відключення.
//
// Мерехтіння свічок — детерміноване від часу кадру (`candleFlicker`): той самий час — та сама яскравість.

import { DAYLIGHT } from "../../sim/config";
import { objectById, type RoomId } from "../../sim/home";
import { powerOut } from "../../sim/modifiers";
import type { GameState, Vec } from "../../sim/types";
import type { ArtId } from "../art/types";
import {
  BOILER,
  CANDLE_SHELVES,
  CEILING_HEIGHT,
  CEILING_LAMPS,
  DESK_CANDLE,
  DESK_LAMP,
  POWER_STATION,
  POWER_STATION_ID,
  SCONCES,
  type CandleShelf,
  type WallFace,
} from "../decor";
import { artOffset, objectScreen } from "../iso/geometry";
import { screenShow } from "../iso/markslayout";
import type { Point } from "../world/part";
import { ISO } from "../world/projection";
import { candlesLit, LIT_FROM, lampsAt, lampsOn, type Daylight } from "./daylight";
import { BOILER_LIGHT, CANDLE_LIGHT, CEILING_LIGHT, DESK_LAMP_LIGHT, GAS_LIGHT, SCONCE_LIGHT, SCREEN_LIGHT, STATION_LIGHT } from "./lightlook";

/**
 * Що світить: стельовий світильник, бра, настільна лампа, свічка (на поличці чи на столі), дисплей станції, індикатор
 * бойлера, газове полум'я, екран комп'ютера.
 */
export type LightKind = "ceiling" | "sconce" | "lamp" | "candle" | "station" | "boiler" | "gas" | "screen";

export interface LightSource {
  /**
   * Сталий id джерела між кадрами: `ceiling:2`, `sconce:0`, `lamp`, `candle:3` (поличка), `candle:desk` (свічка на столі),
   * `station`, `boiler`, `gas`, `screen`.
   */
  readonly id: string;
  readonly kind: LightKind;
  /** Кімната, у якій джерело (для стельових — чия лампа). */
  readonly room: RoomId | null;
  /** Точка підлоги — центр плями світла, клітинки. */
  readonly at: Vec;
  /** Звідки світить на екрані (лампа, полум'я, дисплей), px світу. */
  readonly screen: Point;
  /** Радіус плями на підлозі, клітинки; 0 — плями немає, лише сяйво. */
  readonly radius: number;
  /** Колір плями, 0xrrggbb. */
  readonly color: number;
  /** Яскравість 0–1 (для свічок — до мерехтіння): лампа, що вмикається, — між 0 і 1. */
  readonly strength: number;
  /**
   * Над чим сяйво — id речі квартири (лампа й свічка на столі, полум'я на плиті) чи коробки/точки реєстру глибини (дисплей
   * зарядної станції — коробка `POWER_STATION_ID`): у її проміжку глибини, над її кадром.
   */
  readonly host?: string;
  /** Настінне (бра, свічка на поличці, бойлер): на якому лиці стіни. */
  readonly face?: WallFace;
  /** Зерно мерехтіння (свічки). */
  readonly flicker?: number;
}

/** Лампи кімнати 0–1: світло доби зі зсувом увімкнення цієї кімнати (`DAYLIGHT.lampShift`, §8.9). */
export function roomLamps(d: Daylight, room: RoomId): number {
  if (!d.power) return 0;
  return lampsAt(d.minute - DAYLIGHT.lampShift[room]);
}

/**
 * Яскравість бра чи свічки за рівнем ламп (свічок) доби `level`: світять, лише поки їхній кадр арту горить (`lampsOn`,
 * `candlesLit` — з 0,5), і розгоряються від 0 на цій межі до 1 на повну: погашена свічка не світиться.
 */
export function litStrength(level: number): number {
  return Math.min(1, Math.max(0, (level - LIT_FROM) / (1 - LIT_FROM)));
}

/** Точка на екрані над точкою підлоги `at` на висоті `z` (одиниці арту). */
function lifted(at: Vec, z: number): Point {
  const p = ISO.toScreen(at);
  return { x: p.x, y: p.y - z };
}

/**
 * Звідки світить декор на екрані: точка `name` кадру `id` (абажур бра, індикатор бойлера, дисплей станції, полум'я свічки), коли
 * pivot кадру стоїть у `pivot`, — там, де її намальовано (настінне світить не з лиця стіни, а з абажура на відстані від нього).
 * Запису чи точки в маніфесті немає — запасний варіант: на висоті `z` просто над pivot (числа `decor.ts`).
 */
export function decorPoint(id: ArtId, name: string, pivot: Point, z: number): Point {
  const offset = artOffset(id, name);
  return offset ? { x: pivot.x + offset.x, y: pivot.y + offset.y } : { x: pivot.x, y: pivot.y - z };
}

/**
 * Pivot кадру полички зі свічкою на екрані: точка лиця стіни під серединою дошки на висоті верху дошки (`CANDLE_SHELVES`), так
 * її ставить квартира (`iso/apartment.ts`).
 */
export function shelfPivot(shelf: CandleShelf): Point {
  return lifted(shelf.at, shelf.z);
}

/** Pivot кадру настільної лампи на екрані: центр основи на стільниці (`DESK_LAMP`), так її ставить квартира. */
export function deskLampPivot(): Point {
  return lifted(DESK_LAMP.at, DESK_LAMP.z);
}

/** Pivot кадру свічки на столі на екрані: центр підсвічника на стільниці (`DESK_CANDLE`), так її ставить квартира. */
export function deskCandlePivot(): Point {
  return lifted(DESK_CANDLE.at, DESK_CANDLE.z);
}

/** Точка кріплення речі квартири на екрані (`pan` плити, `screen` комп'ютера): перша, яка є в маніфесті. */
function objectPoint(id: string, points: readonly string[]): Point {
  const object = objectById(id);
  const base = objectScreen(object);
  for (const name of points) {
    const offset = artOffset(`env/${id}`, name);
    if (offset) return { x: base.x + offset.x, y: base.y + offset.y };
  }
  return base;
}

/**
 * Точка підлоги на `out` клітинки від лиця стіни вглиб кімнати: центр плями настінного світла (бра, свічки на поличках; у
 * поличок біля сусідньої кімнати — своя точка `CandleShelf.pool`).
 */
function offWall(at: Vec, face: WallFace, out: number): Vec {
  return face === "y" ? { x: at.x, y: at.y + out } : { x: at.x + out, y: at.y };
}

/** Центр плями настільної лампи на підлозі: перед лампою, куди дивиться абажур (`DESK_LAMP_LIGHT.floor`). */
const DESK_LAMP_FLOOR: Vec = { x: DESK_LAMP.at.x + DESK_LAMP_LIGHT.floor.x, y: DESK_LAMP.at.y + DESK_LAMP_LIGHT.floor.y };

/** Перед столом із комп'ютером, де сидить персонаж: туди падає світло екрана. */
const SCREEN_FLOOR: Vec = { x: 7, y: 7.1 };

/** Джерело без яскравості: стала частина, її рахують раз (`fixedSources`). */
type Fixed = Omit<LightSource, "strength">;

/** Стала геометрія всіх джерел квартири: місця, кольори й радіуси не змінюються, щокадру — лише яскравість. */
interface FixedSources {
  readonly ceiling: readonly Fixed[];
  readonly sconces: readonly Fixed[];
  readonly lamp: Fixed;
  readonly shelves: readonly Fixed[];
  readonly deskCandle: Fixed;
  /** Ці світять завжди на повну: той самий об'єкт щокадру. */
  readonly station: LightSource;
  readonly boiler: LightSource;
  readonly gas: LightSource;
  readonly screen: LightSource;
}

let fixed: FixedSources | null = null;

/** Стала геометрія джерел — з першого запиту (точки кадрів — з маніфесту арту). */
function fixedSources(): FixedSources {
  if (fixed) return fixed;
  const stove = objectById("stove");
  fixed = {
    ceiling: CEILING_LAMPS.map((lamp, i) => ({
      id: `ceiling:${i}`,
      kind: "ceiling",
      room: lamp.room,
      at: lamp.at,
      screen: lifted(lamp.at, CEILING_HEIGHT),
      radius: lamp.radius,
      color: CEILING_LIGHT.color,
    })),
    sconces: SCONCES.map((sconce, i) => ({
      id: `sconce:${i}`,
      kind: "sconce",
      room: sconce.room,
      at: offWall(sconce.at, sconce.face, SCONCE_LIGHT.floor.out),
      screen: decorPoint(sconce.id, "lamp", ISO.toScreen(sconce.at), sconce.lamp),
      radius: SCONCE_LIGHT.floor.radius,
      color: SCONCE_LIGHT.color,
      face: sconce.face,
    })),
    // Настільна лампа — разом із бра (той самий стан арту): тепла пляма на столі й на підлозі перед ним.
    lamp: {
      id: "lamp",
      kind: "lamp",
      room: "living",
      at: DESK_LAMP_FLOOR,
      screen: decorPoint("env/desk-lamp", "lamp", deskLampPivot(), DESK_LAMP.lamp - DESK_LAMP.z),
      radius: DESK_LAMP_LIGHT.radius,
      color: DESK_LAMP_LIGHT.color,
      host: DESK_LAMP.host,
    },
    shelves: CANDLE_SHELVES.map((shelf, i) => ({
      id: `candle:${i}`,
      kind: "candle",
      room: shelf.room,
      at: shelf.pool ?? offWall(shelf.at, shelf.face, CANDLE_LIGHT.floor.out),
      screen: decorPoint(shelf.id, "flame", shelfPivot(shelf), shelf.flame - shelf.z),
      radius: CANDLE_LIGHT.radius,
      color: CANDLE_LIGHT.color,
      face: shelf.face,
      flicker: i + 1,
    })),
    // Свічка на столі з комп'ютером замість лампи: світить, як свічка на поличці (колір, радіус, мерехтіння зі своїм зерном),
    // але стоїть на столі — сяйво над столом, у його проміжку глибини, як у лампи (`host`), а пляма тягнеться до підлоги
    // перед столом (`DESK_CANDLE.pool`).
    deskCandle: {
      id: "candle:desk",
      kind: "candle",
      room: "living",
      at: DESK_CANDLE.pool,
      screen: decorPoint("env/desk-candle", "flame", deskCandlePivot(), DESK_CANDLE.flame - DESK_CANDLE.z),
      radius: CANDLE_LIGHT.radius,
      color: CANDLE_LIGHT.color,
      host: DESK_CANDLE.host,
      flicker: CANDLE_SHELVES.length + 1,
    },
    station: {
      id: "station",
      kind: "station",
      room: "living",
      at: POWER_STATION.at,
      screen: decorPoint("env/power-station", "display", ISO.toScreen(POWER_STATION.at), POWER_STATION.display),
      radius: STATION_LIGHT.radius,
      color: STATION_LIGHT.color,
      strength: 1,
      host: POWER_STATION_ID,
    },
    boiler: {
      id: "boiler",
      kind: "boiler",
      room: "bathroom",
      at: BOILER.at,
      screen: decorPoint("env/boiler", "led", ISO.toScreen(BOILER.at), BOILER.led),
      radius: 0,
      color: BOILER_LIGHT.color,
      strength: 1,
      face: BOILER.face,
    },
    gas: {
      id: "gas",
      kind: "gas",
      room: "kitchen",
      at: { x: stove.x + 0.5, y: stove.y + 1.1 },
      screen: objectPoint("stove", ["pan-gas", "pan"]),
      radius: GAS_LIGHT.radius,
      color: GAS_LIGHT.color,
      strength: 1,
      host: "stove",
    },
    screen: {
      id: "screen",
      kind: "screen",
      room: "living",
      at: SCREEN_FLOOR,
      screen: objectPoint("computer", ["screen"]),
      radius: SCREEN_LIGHT.radius,
      color: SCREEN_LIGHT.color,
      strength: 1,
      host: "computer",
    },
  };
  return fixed;
}

/**
 * Джерела світла цього кадру. Удень (`d` = null) — жодного. Порядок сталий: стельові, бра, настільна лампа, свічки (полички,
 * потім стіл), станція, бойлер, газ, екран.
 */
export function lightSources(state: GameState, d: Daylight | null): LightSource[] {
  if (!d) return [];
  const all = fixedSources();
  const out: LightSource[] = [];
  const outage = powerOut(state);
  if (!outage) {
    CEILING_LAMPS.forEach((lamp, i) => {
      const strength = roomLamps(d, lamp.room);
      if (strength > 0) out.push({ ...all.ceiling[i]!, strength });
    });
    if (lampsOn(d)) {
      const strength = litStrength(d.lamps);
      for (const sconce of all.sconces) out.push({ ...sconce, strength });
      out.push({ ...all.lamp, strength });
    }
  }
  if (outage) {
    if (candlesLit(d)) {
      const strength = litStrength(d.candles);
      for (const shelf of all.shelves) out.push({ ...shelf, strength });
      out.push({ ...all.deskCandle, strength });
    }
    out.push(all.station);
  } else if (d.dark > 0) {
    out.push(all.boiler);
  }
  if (outage && state.home.stove.item !== null) out.push(all.gas);
  if (screenShow(state) !== "off") out.push(all.screen);
  return out;
}

/**
 * Мерехтіння свічки 0–1 у мить `time` (мс сцени): сума кількох синусоїд з несумірними частотами й фазою від зерна — жива, але
 * детермінована. 1 — повна яскравість, нижче на `CANDLE_LIGHT.flicker` у найглибшому спаді.
 */
export function candleFlicker(seed: number, time: number): number {
  const t = time / 1000;
  const wave = Math.sin(t * 7.3 + seed * 1.7) * 0.5 + Math.sin(t * 13.1 + seed * 4.1) * 0.3 + Math.sin(t * 2.9 + seed * 0.6) * 0.2;
  // wave — від −1 до 1.
  return 1 - CANDLE_LIGHT.flicker * (0.5 + 0.5 * wave);
}

/**
 * Середня яскравість мерехтіння (`candleFlicker`: середнє хвилі — 0). На карті світла свічка стоїть на ній, а мерехтить лише
 * сяйво: карту на всю квартиру заради мерехтіння не перемальовують.
 */
export const CANDLE_MEAN = 1 - CANDLE_LIGHT.flicker / 2;
