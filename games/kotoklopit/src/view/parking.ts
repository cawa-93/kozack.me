// Кадр парковки (§8.5 «На місці — кадр парковки», рішення автора 2026-11-02). Кінець гонки: попереду на правому узбіччі —
// парковка й будівля пункту. Прибуття без керування: машина гальмує від своєї швидкості, перестроюється праворуч, звертає на
// з'їзд і стає на своє місце носом угору, а потік їде далі. На місці — нерухомий кадр під карткою пункту. «Додому» — машина
// задки виїжджає з місця, проїздом їде до з'їзду, звертає на дорогу носом донизу й без розриву переходить у дорогу додому.
// Виїзд із дому (§8.5 «Виїзд із дому», рішення автора 2026-11-03) — дзеркало: та сама парковка біля свого будинку, машина задки
// виїжджає з місця, звертає на дорогу носом угору в середню смугу й стає там, де починається гонка, — і без розриву гонка.
//
// Чисті розрахунки без Phaser і DOM (`tests/parking.test.ts`); малює `RaceScene`. Як і в `homeroad.ts`, кадр — функція часу від
// початку анімації: кадри з різним кроком показують те саме. Кінець прибуття, кадр на місці й початок від'їзду — той самий кадр.
//
// Одиниці й координати:
// - px — одиниці кадру сцени дороги (`RaceView`, одиниці інтерфейсу): x праворуч, y донизу від лівого верхнього кута кадру;
// - одиниці арту: 1 одиниця = k px, k = `raceScale(height)` = height / 720. Кадр завжди 720 одиниць арту заввишки, тож усе, що
//   тут рахується по вертикалі, однакове на будь-якому екрані;
// - одиниці дороги (`race.done`, `race.road`): 1 одиниця = `ppu` px = `ROAD_UNIT` (216) одиниць арту (`racePixelsPerUnit`);
// - рамка парковки — як у `RACE_LOT`: x — одиниці арту від середини дороги (праворуч більше), y — від середньої лінії з'їзду
//   (донизу більше, тобто назад дорогою). Полотна `race/lot` і `race/building` лягають у неї точками `pivot` / `pivotAt`;
// - x машин у кадрі — px від середини дороги: сцена додає до нього `cx` — середину дороги разом зі зсувом убік
//   (`cx = width / 2 + frame.pan × parkingLayout(…).pan`), і так само ставить дорогу, узбіччя, парковку й будівлю;
// - поворот — радіани за годинниковою стрілкою, 0 — носом угору (як `setRotation` арту машин у Phaser).

import { PALETTE } from "../../art/palette";
import { RACE } from "../sim/config";
import { carAt, driveRace, newRace } from "../sim/race";
import { createRng, deriveSeed } from "../sim/rng";
import { gameMinutes } from "../sim/time";
import type { Destination, Difficulty, Race, RaceCar, Trip } from "../sim/types";
import { LOT_AHEAD, RACE_BUILDING, RACE_LOT } from "./art/manifest/a14-race";
import type { ArtId } from "./art/types";
import { CAR_REACH, HOME_ROAD, TRAFFIC } from "./homeroad";
import {
  laneX,
  RACE_ART_HEIGHT,
  RACE_PLAYER_Y,
  racePixelsPerUnit,
  raceScale,
  steerTilt,
  TRAFFIC_COLORS,
  TRAFFIC_KINDS,
  trafficLook,
  type TrafficKind,
  type TrafficLook,
} from "./racelook";

/** Одиниць арту в одиниці дороги: `ppu / k` — те саме на будь-якій висоті кадру (216). */
export const ROAD_UNIT = racePixelsPerUnit(RACE_ART_HEIGHT) / raceScale(RACE_ART_HEIGHT);

/**
 * Прибуття й кадр на місці. Відстані — одиниці арту, час — мс.
 */
export const PARKING = {
  /** На місці середина парковки з будівлею (від верху полотна будівлі до низу полотна парковки) — на цій частці висоти кадру. */
  middle: 0.5,
  /**
   * Тривалість прибуття, мс: найдовше — коли машина ледь котиться (вона ще розганяється до парковки), а що швидше, то коротше
   * й різкіше гальмування — до `arrivalMin`. На швидкості `arrivalFast` одиниць арту за секунду (≈ ×3 гонки; ×1 — 288)
   * прибуття коротшає на 63 % різниці: ×1 — ≈ 2,1 с, ×4 — ≈ 1,4 с, ×10 — ≈ 1,06 с.
   */
  arrivalMax: 2500,
  arrivalMin: 1000,
  arrivalFast: 900,
  /** Машина потоку на шляху своєї згасає за стільки мс до зустрічі; та, що до кінця прибуття лишилася б у кадрі, — за `vanishMs`. */
  fadeMs: 300,
  vanishMs: 600,
  /** Запас між кузовами: ближче — машина потоку вже на шляху своєї. */
  gap: 4,
  /** Радіуси поворотів: з правої смуги на з'їзд; з проїзду на місце (і задки з місця в проїзд); з проїзду на дорогу. */
  turnIn: 56,
  park: 70,
  turnOut: 70,
  /** Поле між карткою (і правим краєм кадру) та парковкою (`parkingLayout`). */
  margin: 16,
  /** Смуга прогресу гонки згасає, поки нижній край парковки опускається від верхнього краю кадру на стільки. */
  barFade: 120,
} as const;

/**
 * Від'їзд (≈ 3 с, як дорога додому; час — мс від натискання «Додому»). Машина задки виїжджає з місця в проїзд (`reverse`),
 * рушає проїздом до з'їзду (розганяється до `lotSpeed` одиниць арту за секунду за `lotRamp`), а з початку повороту на дорогу —
 * до `roadSpeed` висот кадру за секунду за `roadRamp`: швидша за камеру, обганяє її й до `ms − fadeOut` зникає за нижнім
 * краєм (≈ 1,95–2,4 с, залежно від місця; у дорозі додому — 2,45 с). Камера з `cameraFrom` (машина ще задкує, а камера ледь
 * рушає) за `cameraRamp` розганяється вниз до швидкості дороги додому (`HOME_ROAD.camera`), а зсув убік за `panMs` від того
 * самого `cameraFrom` повертається до середини дороги — парковка ще в кадрі (вона зникає вгорі ≈ за 1,6 с). Камера вдвічі
 * швидша за попутні машини, тож з ≈ 1,9 с вони з'являються з-за нижнього краю. Наприкінці кадр темніє (`fadeOut`, як у
 * дорозі додому), на початку — ні: він той самий, що на місці.
 */
export const DEPARTURE = {
  ms: HOME_ROAD.ms,
  reverse: 700,
  lotSpeed: 600,
  lotRamp: 300,
  roadSpeed: 2.4,
  roadRamp: 600,
  cameraFrom: 700,
  cameraRamp: 800,
  panMs: 900,
  /** Перестроювання з правої смуги в середню (`HOME_ROAD.lane`) після повороту, одиниці арту дороги. */
  laneChange: 200,
  fadeOut: HOME_ROAD.fadeOut,
} as const;

/**
 * Кузови машин разом із колесами й дзеркалами (одиниці арту, `art/race/car/*.svg`): ширина, довжина; середина — pivot. Звідси
 * — чи машини накладаються (`carsOverlap`): кузови самих машин — 42 × 58, хетчбек 41 × 52, фургон 46 × 62.
 */
export const CAR_BODY: Record<"player" | TrafficKind, { w: number; h: number }> = {
  player: { w: 52, h: 62 },
  sedan: { w: 52, h: 62 },
  hatch: { w: 52, h: 56 },
  van: { w: 56, h: 66 },
};

/**
 * Межі малюнка парковки з будівлею в рамці парковки (одиниці арту): полотна `race/lot` і `race/building` разом. Сцена малює
 * їх, лише коли вони в кадрі (`lotInFrame`).
 */
export const LOT_BOUNDS = {
  top: RACE_BUILDING.pivotAt.y - RACE_BUILDING.pivot.y,
  bottom: RACE_LOT.entrance.y - RACE_LOT.pivot.y + RACE_LOT.canvas.h,
  left: Math.min(RACE_LOT.entrance.x - RACE_LOT.pivot.x, RACE_BUILDING.pivotAt.x - RACE_BUILDING.pivot.x),
  right: Math.max(RACE_LOT.entrance.x - RACE_LOT.pivot.x + RACE_LOT.canvas.w, RACE_BUILDING.pivotAt.x - RACE_BUILDING.pivot.x + RACE_BUILDING.canvas.w),
} as const;

// --- Вертикаль кадру (одиниці арту від верху кадру) ----------------------------------------------------

/** Кадр заввишки, одиниці арту (за будь-якої висоти в px). */
const SCREEN = RACE_ART_HEIGHT;
/** Де своя машина в гонці. */
const PLAYER_Y = RACE_PLAYER_Y * SCREEN;
/** Середня лінія з'їзду в мить фінішу (`race.done = race.road`): `LOT_AHEAD` попереду своєї машини. */
const FINISH_LOT_Y = PLAYER_Y - LOT_AHEAD;
/** Середня лінія з'їзду на місці: середина парковки з будівлею — на `PARKING.middle` висоти кадру. */
const PARKED_LOT_Y = PARKING.middle * SCREEN - (LOT_BOUNDS.top + LOT_BOUNDS.bottom) / 2;
/** На скільки світ зсувається донизу за прибуття (камера доїжджає вперед). */
const LOT_SHIFT = PARKED_LOT_Y - FINISH_LOT_Y;

// --- Місця, смуги, проїзд -------------------------------------------------------------------------------------

/** Середня лінія проїзду (і з'їзду) у рамці парковки. */
const AISLE = (RACE_LOT.aisle.top + RACE_LOT.aisle.bottom) / 2;
/** Права смуга, з якої звертають на з'їзд, і середня — смуга дороги додому (x від середини дороги, одиниці арту). */
const RIGHT_LANE = laneX(0, RACE.lanes - 1, 1);
const HOME_LANE = laneX(0, HOME_ROAD.lane, 1);

/** Звідки береться вигляд парковки: інша сіль, ніж у знижок магазину з того самого зерна поїздки. */
const LOT_SALT = 0x10_7a_12;

/** Що на парковці з цього зерна поїздки: своє місце й запарковані машини. */
interface LotLayout {
  own: number;
  cars: { slot: number; look: TrafficLook }[];
}

function lotLayout(seed: number): LotLayout {
  const rng = createRng(deriveSeed(seed, LOT_SALT));
  const slots = RACE_LOT.slots.length;
  // Крайнє праве місце — ніколи не своє: задки з нього праворуч машина виїхала б за майданчик.
  const own = rng.int(0, slots - 2);
  const free = Array.from({ length: slots }, (_, i) => i).filter((i) => i !== own);
  // Поруч «кілька запаркованих машин» (§8.5): дві чи три — з трьох вільних місць, тож порожньою парковка не буває.
  const count = rng.int(2, 3);
  const colors = TRAFFIC_COLORS.map((_, i) => i);
  const cars: LotLayout["cars"] = [];
  for (let n = 0; n < count && free.length > 0; n++) {
    const slot = free.splice(rng.int(0, free.length - 1), 1)[0] ?? 0;
    const color = colors.splice(rng.int(0, colors.length - 1), 1)[0] ?? 0;
    cars.push({ slot, look: { kind: TRAFFIC_KINDS[rng.int(0, TRAFFIC_KINDS.length - 1)] ?? "sedan", color } });
  }
  cars.sort((a, b) => a.slot - b.slot);
  return { own, cars };
}

/** Своє місце (номер у `RACE_LOT.slots`) — із зерна поїздки (`trip.seed`): те саме й після перезавантаження. */
export function ownSlot(seed: number): number {
  return lotLayout(seed).own;
}

/** Запарковані машини (2–3) на інших місцях: номер місця й вигляд (вид і колір потоку, різні кольори) — із зерна поїздки. */
export function lotCars(seed: number): readonly { slot: number; look: TrafficLook }[] {
  return lotLayout(seed).cars;
}

/** Де закінчилася гонка й чия поїздка: від цього зсув дороги на місці й своє місце. */
export interface ParkingSpot {
  /** Скільки проїхано в мить фінішу, одиниці дороги (`race.done`, тобто `race.road`): на місці дорога стоїть від нього. */
  done: number;
  /** Зерно поїздки (`trip.seed`): своє місце й запарковані машини. */
  seed: number;
}

/** Місце поїздки, що вже на місці (фаза `visit`): після перезавантаження кадр той самий. */
export function parkingSpot(trip: Pick<Trip, "race" | "seed">): ParkingSpot {
  return { done: trip.race.done, seed: trip.seed };
}

/** Машина в кадрі парковки. */
export interface ParkingCar {
  /** Px від середини дороги (сцена додає `cx`). */
  x: number;
  /** Y середини кузова, px кадру. */
  y: number;
  /** Поворот, радіани за годинниковою: 0 — носом угору, π — донизу. */
  rotation: number;
  look: TrafficLook;
  /** Непрозорість: машина потоку на шляху своєї згасає. */
  alpha: number;
}

/** Своя машина: x — px від середини дороги, y — px кадру (середина кузова), поворот (0 — носом угору). */
export interface CarPose {
  x: number;
  y: number;
  rotation: number;
}

/** Кадр парковки: прибуття, на місці чи від'їзд. */
export interface ParkingFrame {
  /** Зсув дороги й узбіччя, px — як `race.done × ppu` у гонці (`drawRoad`): більше — плитки нижче. */
  offset: number;
  /** Y середньої лінії з'їзду, px кадру: від неї — рамка парковки (`RACE_LOT`, `RACE_BUILDING`), x — від середини дороги. */
  lot: number;
  /** Частка зсуву світу вбік: 0 — дорога посередині кадру, 1 — зсунута на `parkingLayout(…).pan`. */
  pan: number;
  car: CarPose;
  /** Запарковані машини (рухаються разом із парковкою). */
  parked: ParkingCar[];
  /** Машини потоку (лише ті, що в кадрі й не згасли зовсім). */
  traffic: ParkingCar[];
  /** Темрява поверх кадру: 0 — немає, 1 — чорний екран. */
  dark: number;
}

/** Кадр анімації: те саме й чи вона скінчилася. */
export interface ParkingAnimationFrame extends ParkingFrame {
  done: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
/** Плавно рушає й плавно стає. */
const smooth = (u: number): number => {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
};
/** Площа під `smooth` від 0 до `u` (і далі, де `smooth` = 1): скільки проїдено з розгоном `smooth`. */
const smoothArea = (u: number): number => (u <= 0 ? 0 : u >= 1 ? u - 0.5 : u * u * u - (u * u * u * u) / 2);
/** −0 → 0: кадри порівнюються точно. */
const zero = (value: number): number => (value === 0 ? 0 : value);

/**
 * Частка шляху за частку часу `u` (0…1), коли на старті швидкість — `m` шляхів за весь час, а наприкінці — нуль, без
 * перельоту. До `m` = 3 — кубічна Ерміта (за малої швидкості машина ще трохи розганяється), далі — 1 − (1 − u)^m: що
 * більше `m`, то різкіше гальмування на початку. На `m` = 3 обидві — та сама крива 1 − (1 − u)³.
 */
function brake(u: number, m: number): number {
  const t = clamp01(u);
  if (m <= 3) return ((m - 2) * t + (3 - 2 * m)) * t * t + m * t;
  return 1 - (1 - t) ** m;
}

// --- Шлях своєї машини --------------------------------------------------------------------------------------

interface Vec {
  x: number;
  y: number;
}

/** Відрізок шляху — кубічна крива Безьє (у рамці парковки); `back` — машина їде задки (ніс — проти руху). */
interface Segment {
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
  back: boolean;
  straight: boolean;
}

const NORTH: Vec = { x: 0, y: -1 };
const SOUTH: Vec = { x: 0, y: 1 };
const EAST: Vec = { x: 1, y: 0 };
const WEST: Vec = { x: -1, y: 0 };
/** Чверть кола кривою Безьє: ручки — стільки радіусів. */
const KAPPA = 0.5523;

const along = (p: Vec, dir: Vec, length: number): Vec => ({ x: p.x + dir.x * length, y: p.y + dir.y * length });
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function line(a: Vec, b: Vec, back = false): Segment {
  return { p0: a, p1: lerp(a, b, 1 / 3), p2: lerp(a, b, 2 / 3), p3: b, back, straight: true };
}

/** Крива з `a` (рух у напрямку `ta`) до `b` (рух `tb`), ручки — `ha` і `hb`; чверть кола — ручки `KAPPA × r`. */
function curve(a: Vec, ta: Vec, b: Vec, tb: Vec, ha: number, hb = ha, back = false): Segment {
  return { p0: a, p1: along(a, ta, ha), p2: along(b, tb, -hb), p3: b, back, straight: false };
}

/** Шлях, розкладений за довжиною: точки, пройдене до них і поворот машини (безперервний, без стрибків на 2π). */
interface Path {
  s: number[];
  x: number[];
  y: number[];
  a: number[];
  /** Пройдене до початку кожного відрізка. */
  marks: number[];
  length: number;
}

function buildPath(segments: readonly Segment[]): Path {
  const path: Path = { s: [], x: [], y: [], a: [], marks: [], length: 0 };
  let total = 0;
  for (const seg of segments) {
    if (Math.hypot(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y) < 1e-9) continue;
    path.marks.push(total);
    const rough = Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y) + Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y) + Math.hypot(seg.p3.x - seg.p2.x, seg.p3.y - seg.p2.y);
    const n = seg.straight ? 1 : Math.max(16, Math.ceil(rough / 2));
    for (let i = path.s.length === 0 ? 0 : 1; i <= n; i++) {
      const u = i / n;
      const v = 1 - u;
      const x = v * v * v * seg.p0.x + 3 * v * v * u * seg.p1.x + 3 * v * u * u * seg.p2.x + u * u * u * seg.p3.x;
      const y = v * v * v * seg.p0.y + 3 * v * v * u * seg.p1.y + 3 * v * u * u * seg.p2.y + u * u * u * seg.p3.y;
      const tx = 3 * v * v * (seg.p1.x - seg.p0.x) + 6 * v * u * (seg.p2.x - seg.p1.x) + 3 * u * u * (seg.p3.x - seg.p2.x);
      const ty = 3 * v * v * (seg.p1.y - seg.p0.y) + 6 * v * u * (seg.p2.y - seg.p1.y) + 3 * u * u * (seg.p3.y - seg.p2.y);
      let a = seg.back ? Math.atan2(-tx, ty) : Math.atan2(tx, -ty);
      const prev = path.a.at(-1);
      if (prev !== undefined) {
        while (a - prev > Math.PI) a -= 2 * Math.PI;
        while (a - prev < -Math.PI) a += 2 * Math.PI;
      }
      const last = path.s.length - 1;
      if (last >= 0) total += Math.hypot(x - (path.x[last] ?? x), y - (path.y[last] ?? y));
      path.s.push(total);
      path.x.push(x);
      path.y.push(y);
      path.a.push(zero(a));
    }
  }
  path.length = total;
  return path;
}

/** Точка й поворот машини, що проїхала шляхом `s` (одиниці арту): до початку — на початку, після кінця — у кінці. */
function pathAt(path: Path, s: number): { x: number; y: number; rotation: number } {
  const n = path.s.length;
  if (n === 0) return { x: 0, y: 0, rotation: 0 };
  if (s <= 0 || n === 1) return { x: path.x[0] ?? 0, y: path.y[0] ?? 0, rotation: path.a[0] ?? 0 };
  if (s >= path.length) return { x: path.x[n - 1] ?? 0, y: path.y[n - 1] ?? 0, rotation: path.a[n - 1] ?? 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((path.s[mid] ?? 0) <= s) lo = mid;
    else hi = mid;
  }
  const s0 = path.s[lo] ?? 0;
  const s1 = path.s[hi] ?? s0;
  const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  const at = (list: number[]): number => (list[lo] ?? 0) + ((list[hi] ?? 0) - (list[lo] ?? 0)) * t;
  return { x: at(path.x), y: at(path.y), rotation: zero(at(path.a)) };
}

const slotAt = (slot: number): Vec => {
  const spot = RACE_LOT.slots[slot] ?? RACE_LOT.slots[0];
  return { x: spot.x, y: spot.y };
};

/**
 * Шлях прибуття: зі смуги `lane` (нахилена, як у гонці, коли ще перестроювалася) — у праву смугу, поворот праворуч на з'їзд
 * (вже рівно на схід посеред проїзду), проїздом до свого місця й поворот ліворуч на нього — носом угору.
 */
function arrivalPath(lane: number, targetLane: number, slot: number): Path {
  const end = slotAt(slot);
  const tilt = steerTilt(lane, targetLane);
  const start = { x: laneX(0, lane, 1), y: LOT_AHEAD };
  const turnIn = { x: RIGHT_LANE, y: AISLE + PARKING.turnIn };
  const onAisle = { x: RIGHT_LANE + PARKING.turnIn, y: AISLE };
  const toSlot = { x: Math.max(onAisle.x, end.x - PARKING.park), y: AISLE };
  const r = end.x - toSlot.x;
  const inSlot = { x: end.x, y: AISLE - r };
  const third = (start.y - turnIn.y) / 3;
  return buildPath([
    curve(start, { x: Math.sin(tilt), y: -Math.cos(tilt) }, turnIn, NORTH, third),
    curve(turnIn, NORTH, onAisle, EAST, KAPPA * PARKING.turnIn),
    line(onAisle, toSlot),
    curve(toSlot, EAST, inSlot, NORTH, KAPPA * r),
    line(inSlot, end),
  ]);
}

/** Від'їзд: задки з місця в проїзд (корма — праворуч, ніс — до з'їзду), далі вперед — до повороту на дорогу. */
interface DeparturePath {
  back: Path;
  ahead: Path;
  /** Шлях уперед до початку повороту на дорогу: звідси машина розганяється до швидкості дороги. */
  turn: number;
  /** Скільки секунд від початку руху вперед машина доїжджає до `turn` (розгін `lotRamp` до `lotSpeed`). */
  turnAt: number;
}

/** Задки з місця `slot` у проїзд: корма звертає праворуч, ніс — до з'їзду (і на від'їзді від пункту, і від свого будинку). */
function reversePath(slot: number): { path: Path; cusp: Vec } {
  const start = slotAt(slot);
  const r = PARKING.park;
  const out = { x: start.x, y: AISLE - r };
  const cusp = { x: start.x + r, y: AISLE };
  return { path: buildPath([line(start, out, true), curve(out, SOUTH, cusp, EAST, KAPPA * r, KAPPA * r, true)]), cusp };
}

/**
 * За скільки секунд від рушання машина проїжджає `distance` одиниць арту, коли розганяється `smooth` до `speed` одиниць арту
 * за секунду за `ramp` секунд: за `ramp` вона проїжджає половину того, що проїхала б за той час на повній швидкості.
 */
function rampTime(distance: number, speed: number, ramp: number): number {
  const full = (speed * ramp) / 2;
  if (distance >= full) return ramp + (distance - full) / speed;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (speed * ramp * smoothArea(mid) < distance) lo = mid;
    else hi = mid;
  }
  return ramp * hi;
}

function departurePath(slot: number): DeparturePath {
  const { path: back, cusp } = reversePath(slot);
  const turnOut = { x: RIGHT_LANE + PARKING.turnOut, y: AISLE };
  const onRoad = { x: RIGHT_LANE, y: AISLE + PARKING.turnOut };
  const inLane = { x: HOME_LANE, y: onRoad.y + DEPARTURE.laneChange };
  const ahead = buildPath([
    line(cusp, turnOut),
    curve(turnOut, WEST, onRoad, SOUTH, KAPPA * PARKING.turnOut),
    curve(onRoad, SOUTH, inLane, SOUTH, DEPARTURE.laneChange / 3),
    // Далі — прямо середньою смугою, аж поки не зникне за нижнім краєм.
    line(inLane, { x: HOME_LANE, y: inLane.y + 100 * SCREEN }),
  ]);
  const turn = ahead.marks[1] ?? 0;
  return { back, ahead, turn, turnAt: rampTime(turn, DEPARTURE.lotSpeed, DEPARTURE.lotRamp / 1000) };
}

// --- Накладання кузовів ------------------------------------------------------------------------------------

/** Кузов у площині: середина, поворот (0 — носом угору), ширина й довжина. */
export interface CarBox {
  x: number;
  y: number;
  rotation: number;
  w: number;
  h: number;
}

/** Половина проєкції кузова на вісь `axis` (одиничну). */
function reach(box: CarBox, axis: Vec): number {
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  // Вісь «праворуч» кузова — (cos, sin), «уперед» — (sin, −cos).
  return (box.w / 2) * Math.abs(cos * axis.x + sin * axis.y) + (box.h / 2) * Math.abs(sin * axis.x - cos * axis.y);
}

/** Чи накладаються два кузови (з запасом `gap` між ними): перевірка розділяючої осі для двох прямокутників. */
export function carsOverlap(a: CarBox, b: CarBox, gap = 0): boolean {
  for (const rotation of [a.rotation, b.rotation]) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const axis of [
      { x: cos, y: sin },
      { x: sin, y: -cos },
    ]) {
      const distance = Math.abs((b.x - a.x) * axis.x + (b.y - a.y) * axis.y);
      if (distance >= reach(a, axis) + reach(b, axis) + gap) return false;
    }
  }
  return true;
}

// --- Кінець гонки ---------------------------------------------------------------------------------------------

/**
 * Y середньої лінії з'їзду на екрані в гонці, px кадру заввишки `height`, коли проїхано `done` з `road` (одиниці дороги):
 * парковка стоїть у світі за фінішем (`LOT_AHEAD` попереду своєї машини в мить фінішу), тож з'являється згори ще в гонці й
 * їде донизу разом із дорогою.
 */
export function lotScreenY(done: number, road: number, height: number): number {
  return (FINISH_LOT_Y - Math.max(0, road - done) * ROAD_UNIT) * raceScale(height);
}

/** Чи видно парковку з будівлею (`LOT_BOUNDS`), коли середня лінія з'їзду — на `lotY` px кадру заввишки `height`. */
export function lotInFrame(lotY: number, height: number): boolean {
  const k = raceScale(height);
  return lotY + LOT_BOUNDS.bottom * k > 0 && lotY + LOT_BOUNDS.top * k < height;
}

/**
 * Непрозорість смуги прогресу гонки (і машинки на ній), коли середня лінія з'їзду — на `lotY` px: смуга стоїть там, де
 * парковка (`RACE_BAR_X`), тож згасає, щойно парковка в'їжджає в кадр згори, — і до фінішу її вже немає.
 */
export function raceBarAlpha(lotY: number, height: number): number {
  const k = raceScale(height);
  return 1 - smooth((lotY + LOT_BOUNDS.bottom * k) / (PARKING.barFade * k));
}

/** Запарковані машини в кадрі, коли середня лінія з'їзду — на `lotY` px (і в гонці, і на місці): носом угору. */
export function parkedCars(seed: number, lotY: number, height: number): ParkingCar[] {
  const k = raceScale(height);
  return lotCars(seed).map(({ slot, look }) => {
    const spot = slotAt(slot);
    return { x: spot.x * k, y: lotY + spot.y * k, rotation: 0, look, alpha: 1 };
  });
}

// --- Прибуття ------------------------------------------------------------------------------------------------

/** Машина потоку в мить фінішу: смуга, скільки одиниць дороги попереду своєї (позаду — менше нуля) і вигляд. */
export interface ArrivalCar {
  lane: number;
  ahead: number;
  look: TrafficLook;
}

/**
 * Знімок гонки в мить фінішу — з нього прибуття (`arrivalFrame`). Швидкості — одиниць дороги за секунду реального часу, тож
 * прибуття те саме й після зміни розміру кадру. Об'єкт не змінювати: план прибуття з нього рахується раз.
 */
export interface ArrivalStart extends ParkingSpot {
  /** Своя машина: `race.speed × gameMinutes(1) × швидкість сесії` — на екрані дорога біжить донизу на `speed × ppu` px/с. */
  speed: number;
  /** Машини потоку: `RACE.carSpeed × gameMinutes(1) × швидкість сесії`. */
  trafficSpeed: number;
  /** Смуга своєї машини (дробова, поки перестроюється) і та, куди вона їхала. */
  lane: number;
  targetLane: number;
  cars: readonly ArrivalCar[];
}

/**
 * Знімок гонки в мить фінішу (`race` — після кроку, що привіз): `seed` — зерно поїздки, `sessionSpeed` — швидкість гри
 * (`session.speed`), `lookOf` — вигляд машини потоку, який сцена вже показувала (`trafficLook` з першої зустрічі).
 */
export function arrivalStart(race: Race, seed: number, sessionSpeed: number, lookOf: (car: RaceCar) => TrafficLook = trafficLook): ArrivalStart {
  const perSecond = gameMinutes(1) * sessionSpeed;
  return {
    done: race.done,
    seed,
    speed: Math.max(0, race.speed) * perSecond,
    trafficSpeed: RACE.carSpeed * perSecond,
    lane: race.lane,
    targetLane: race.targetLane,
    cars: race.cars.map((car) => ({ lane: car.lane, ahead: carAt(race, car) - race.done, look: lookOf(car) })),
  };
}

/** Скільки мс триває прибуття з цієї швидкості (одиниць дороги за секунду). */
export function arrivalMs(start: Pick<ArrivalStart, "speed">): number {
  const speed = Math.max(0, start.speed) * ROAD_UNIT;
  return PARKING.arrivalMin + (PARKING.arrivalMax - PARKING.arrivalMin) * Math.exp(-speed / PARKING.arrivalFast);
}

/** Машина потоку в плані прибуття: x і y на старті в рамці парковки, вигляд і коли згасає (мс; `to` = ∞ — не згасає). */
interface PlannedCar {
  x: number;
  y: number;
  look: TrafficLook;
  from: number;
  to: number;
}

interface ArrivalPlan {
  ms: number;
  path: Path;
  /** Швидкість на старті в шляхах за все прибуття (`brake`): своя машина й камера. */
  car: number;
  camera: number;
  /** Машини потоку, одиниць арту за секунду. */
  speed: number;
  traffic: PlannedCar[];
}

const plans = new WeakMap<ArrivalStart, ArrivalPlan>();

/** Чи середина машини (y, одиниці арту від верху кадру) у кадрі разом із кузовом. */
const inFrame = (y: number): boolean => y > -CAR_REACH && y < SCREEN + CAR_REACH;

function planArrival(start: ArrivalStart): ArrivalPlan {
  const cached = plans.get(start);
  if (cached) return cached;
  const ms = arrivalMs(start);
  const seconds = ms / 1000;
  const v0 = Math.max(0, start.speed) * ROAD_UNIT;
  const path = arrivalPath(start.lane, start.targetLane, ownSlot(start.seed));
  const car = path.length > 0 ? (v0 * seconds) / path.length : 0;
  const camera = (v0 * seconds) / LOT_SHIFT;
  const speed = start.trafficSpeed * ROAD_UNIT;
  // Кроки перевірки зустрічей: за крок машини зближуються не більше, ніж на запас `gap`, — тож між двома кроками, на яких
  // вони ще не впритул, кузови не накладаються.
  const steps = Math.max(120, Math.ceil((seconds * (v0 + speed)) / PARKING.gap));
  const own = Array.from({ length: steps + 1 }, (_, j): CarBox => ({ ...pathAt(path, path.length * brake(j / steps, car)), ...CAR_BODY.player }));
  const traffic: PlannedCar[] = [];
  for (const entry of start.cars) {
    const x = laneX(0, entry.lane, 1);
    const y = LOT_AHEAD - entry.ahead * ROAD_UNIT;
    // Не в кадрі в мить фінішу (позаду за нижнім краєм) — і не з'являється: дорога на місці порожня.
    if (!inFrame(FINISH_LOT_Y + y)) continue;
    const box = CAR_BODY[entry.look.kind];
    // Перший крок, на якому машини впритул (ближче за `gap`), і перший, на якому кузови вже накладаються.
    let near = -1;
    let touch = -1;
    for (let j = 0; j <= steps; j++) {
      const pose = own[j];
      if (!pose) break;
      const other: CarBox = { x, y: y - (speed * seconds * j) / steps, rotation: 0, ...box };
      if (near < 0 && carsOverlap(pose, other, PARKING.gap)) near = j;
      if (near > 0) break;
      if (near === 0 && carsOverlap(pose, other)) {
        touch = j;
        break;
      }
    }
    const at = (j: number): number => (ms * j) / steps;
    let from = Infinity;
    let to = Infinity;
    if (near > 0) {
      // Згасає зовсім до останнього кроку, на якому машини ще не впритул.
      to = at(near - 1);
      from = Math.max(0, to - PARKING.fadeMs);
    } else if (near === 0) {
      // Уже впритул у мить фінішу (машина позаду, яку сим тримає за `RACE.carLength`): згасає одразу — встигаючи до
      // накладання, якщо воно ще попереду (а якщо кузови вже накладалися в гонці, то як вийде).
      from = 0;
      to = Math.min(PARKING.fadeMs, ms, touch > 0 ? at(touch - 1) : Infinity);
    } else if (inFrame(PARKED_LOT_Y + y - speed * seconds)) {
      // Лишилася б у кадрі на місці — згасає наприкінці: на місці дорога порожня.
      from = Math.max(0, ms - PARKING.vanishMs);
      to = ms;
    }
    traffic.push({ x, y, look: entry.look, from, to });
  }
  const plan: ArrivalPlan = { ms, path, car, camera, speed, traffic };
  plans.set(start, plan);
  return plan;
}

/** Зсув дороги, px, коли середня лінія з'їзду — на `lotY` одиниць арту від верху кадру. */
const roadOffset = (spot: ParkingSpot, lotY: number, k: number): number => (spot.done * ROAD_UNIT + lotY - FINISH_LOT_Y) * k;

/**
 * Кадр прибуття через `ms` мс від фінішу на кадрі заввишки `height` px. На `ms` = 0 — кадр гонки в мить фінішу: зсув дороги
 * `done × ppu`, своя машина в своїй смузі на `RACE_PLAYER_Y` з нахилом перестроювання, машини потоку там, де були; дорога
 * біжить зі швидкістю гонки (`speed × ppu` px/с) — без стрибка. Далі камера плавно гальмує й стає так, що парковка з будівлею
 * посередині кадру (на великій швидкості — коротко й різко), своя машина тим часом звертає на своє місце, а світ зсувається
 * вбік (`pan` 0 → 1). З `arrivalMs(start)` — кадр на місці (`parkedFrame`) і `done`.
 */
export function arrivalFrame(ms: number, height: number, start: ArrivalStart): ParkingAnimationFrame {
  const plan = planArrival(start);
  const time = Math.max(0, ms);
  if (time >= plan.ms) return { ...parkedFrame(height, start), done: true };
  const k = raceScale(height);
  const u = time / plan.ms;
  const lotY = FINISH_LOT_Y + LOT_SHIFT * brake(u, plan.camera);
  const pose = pathAt(plan.path, plan.path.length * brake(u, plan.car));
  const traffic: ParkingCar[] = [];
  for (const car of plan.traffic) {
    const alpha = time <= car.from ? 1 : time >= car.to ? 0 : 1 - smooth((time - car.from) / (car.to - car.from));
    const y = lotY + car.y - (plan.speed * time) / 1000;
    if (alpha > 0 && inFrame(y)) traffic.push({ x: car.x * k, y: y * k, rotation: 0, look: car.look, alpha });
  }
  return {
    offset: roadOffset(start, lotY, k),
    lot: lotY * k,
    pan: smooth(u),
    car: { x: pose.x * k, y: (lotY + pose.y) * k, rotation: pose.rotation },
    parked: parkedCars(start.seed, lotY * k, height),
    traffic,
    dark: 0,
    done: false,
  };
}

// --- На місці --------------------------------------------------------------------------------------------------

/**
 * Кадр на місці на кадрі заввишки `height` px: нерухомий, парковка з будівлею посередині висоти кадру, своя машина на своєму
 * місці носом угору, поруч запарковані (із зерна поїздки — ті самі й після перезавантаження), дорога порожня, світ зсунутий
 * убік (`pan` = 1). Це кінець прибуття й початок від'їзду.
 */
export function parkedFrame(height: number, spot: ParkingSpot): ParkingFrame {
  const k = raceScale(height);
  const slot = slotAt(ownSlot(spot.seed));
  return {
    offset: roadOffset(spot, PARKED_LOT_Y, k),
    lot: PARKED_LOT_Y * k,
    pan: 1,
    car: { x: slot.x * k, y: (PARKED_LOT_Y + slot.y) * k, rotation: 0 },
    parked: parkedCars(spot.seed, PARKED_LOT_Y * k, height),
    traffic: [],
    dark: 0,
  };
}

// --- Від'їзд ---------------------------------------------------------------------------------------------------

const departures = new Map<number, DeparturePath>();

function planDeparture(slot: number): DeparturePath {
  let plan = departures.get(slot);
  if (!plan) {
    plan = departurePath(slot);
    departures.set(slot, plan);
  }
  return plan;
}

/** Скільки проїхала камера вниз за `ms` мс від'їзду, одиниці арту (дорога біжить угору на стільки). */
function departureCamera(ms: number): number {
  const ramp = DEPARTURE.cameraRamp / 1000;
  return HOME_ROAD.camera * SCREEN * ramp * smoothArea((ms - DEPARTURE.cameraFrom) / DEPARTURE.cameraRamp);
}

/** Де своя машина через `ms` мс від'їзду, у рамці парковки (одиниці арту). */
function departurePose(ms: number, plan: DeparturePath): { x: number; y: number; rotation: number } {
  if (ms < DEPARTURE.reverse) return pathAt(plan.back, plan.back.length * smooth(ms / DEPARTURE.reverse));
  const t = (ms - DEPARTURE.reverse) / 1000;
  const lotRamp = DEPARTURE.lotRamp / 1000;
  const roadRamp = DEPARTURE.roadRamp / 1000;
  const road = DEPARTURE.roadSpeed * SCREEN;
  const s = DEPARTURE.lotSpeed * lotRamp * smoothArea(t / lotRamp) + (road - DEPARTURE.lotSpeed) * roadRamp * smoothArea((t - plan.turnAt) / roadRamp);
  return pathAt(plan.ahead, s);
}

/**
 * Кадр від'їзду через `ms` мс від «Додому» на кадрі заввишки `height` px. На `ms` = 0 — кадр на місці (`parkedFrame`), без
 * затемнення. Машина задки виїжджає з місця в проїзд, їде до з'їзду й звертає на дорогу носом донизу в середню смугу
 * (`HOME_ROAD.lane`); камера рушає вниз (дорога й парковка пливуть угору), зсув убік плавно повертається до середини дороги,
 * поки парковка ще в кадрі; попутні машини дороги додому (`TRAFFIC`, ті самі вигляди) з'являються з-за нижнього краю, своя
 * обганяє камеру й зникає за нижнім краєм, тоді кадр темніє (`fadeOut`) і `done`. Пропуск натисканням — `canSkipHomeRoad`.
 */
export function departureFrame(ms: number, height: number, spot: ParkingSpot): ParkingAnimationFrame {
  const time = Math.max(0, ms);
  const k = raceScale(height);
  const plan = planDeparture(ownSlot(spot.seed));
  const camera = departureCamera(time);
  const lotY = PARKED_LOT_Y - camera;
  const pose = departurePose(time, plan);
  const traffic: ParkingCar[] = [];
  const lag = (HOME_ROAD.traffic * SCREEN * time) / 1000 - camera;
  TRAFFIC.forEach((car, i) => {
    // На старті всі попутні — під нижнім краєм кадру (на місці дорога порожня), перша — впритул до нього, решта — з тими самими
    // проміжками, що в дорозі додому: камера, швидша за них, наздоганяє їх, і вони з'являються знизу одна за одною.
    const y = SCREEN + CAR_REACH + (car.y - (TRAFFIC[0]?.y ?? 0)) * SCREEN + lag;
    if (inFrame(y)) traffic.push({ x: laneX(0, car.lane, 1) * k, y: y * k, rotation: Math.PI, look: trafficLook({ start: i }), alpha: 1 });
  });
  return {
    offset: roadOffset(spot, PARKED_LOT_Y, k) - camera * k,
    lot: lotY * k,
    pan: 1 - smooth((time - DEPARTURE.cameraFrom) / DEPARTURE.panMs),
    car: { x: pose.x * k, y: (lotY + pose.y) * k, rotation: pose.rotation },
    parked: parkedCars(spot.seed, lotY * k, height),
    traffic,
    dark: clamp01((time - (DEPARTURE.ms - DEPARTURE.fadeOut)) / DEPARTURE.fadeOut),
    done: time >= DEPARTURE.ms,
  };
}

// --- Виїзд із дому ---------------------------------------------------------------------------------------------

/**
 * Свій будинок (§8.5 «Виїзд із дому — від'їзд від свого будинку», рішення автора 2026-11-03): та сама парковка з будівлею, що
 * біля пунктів, але дах — свого кольору, а на табличці — дім. Рішення виконавця: дах — дерево `wood` (дахи — барвисті сім'ї,
 * картон чи дерево, `art/STYLE.md` §11 race; дерева не має жоден пункт, `DESTINATION_ROOFS`, і воно темніше за картонний дах
 * офісу); табличка — гліф дому `ui/glyph/home`, той самий, що в «🏠 Речі» телефона й «🏠 кіт» наприкінці гри: значення те
 * саме — дім (§11.4 «унікальна іконка на унікальний кейс»). Своє місце й машини сусідів — із зерна гри (`homeLotSeed`): щоразу
 * ті самі, бо це свій двір.
 */
export const HOME_LOT = {
  roof: Number.parseInt(PALETTE.wood.slice(1), 16),
  sign: "ui/glyph/home" as ArtId,
} as const;

/** Чия парковка в кадрі: пункту чи свого будинку. */
export type LotPlace = Destination | "home";

/** Звідки береться вигляд парковки свого будинку: інша сіль, ніж у поїздок (`LOT_SALT` — уже поверх неї). */
const HOME_SALT = 0x40_3e;

/** Зерно парковки свого будинку (`lotCars`, `ownSlot`) із зерна гри (`state.seed`): та сама в кожній поїздці й після перезавантаження. */
export function homeLotSeed(gameSeed: number): number {
  return deriveSeed(gameSeed, HOME_SALT);
}

/**
 * Виїзд із дому (≈ 3 с; час — мс від запуску сцени дороги, коли квартира вже темна). Кадр проступає з чорного (`fadeIn`), поки
 * машина стоїть на своєму місці носом угору й вмикає фари; з `reverseFrom` вона задки виїжджає з місця в проїзд (`reverse`, як від
 * пункту), рушає проїздом до з'їзду (розгін до `lotSpeed` за `lotRamp`, як від пункту), звертає праворуч на дорогу носом угору,
 * перестроюється в середню смугу (`laneChange`) і без перельоту стає там, де починається гонка (`brake`: трохи розганяється й
 * гальмує до нуля — гонка починається з місця). Камера стоїть, поки машина на майданчику, а щойно та звертає на дорогу, їде
 * вгору разом із нею: на скільки машина просунулася вгору дорогою, на таку частку шляху камери (`HOME_SHIFT`), — тож машина на
 * екрані лише трохи опускається на своє місце в гонці, розганяється й гальмує дорога, як у гонці, а парковка з будинком
 * відпливає вниз і до кінця вся на `clear` одиниць арту під нижнім краєм кадру. Зсув убік (вузьке вікно) за `panMs` від рушання
 * повертається до середини дороги. Наприкінці кадр — рівно кадр старту гонки; напис і смуга прогресу гонки проступають за
 * `hud` мс до кінця. Числа — рішення виконавця; перестроювання (`laneChange`) — довше, ніж від пункту: машина звертає в
 * середню смугу без різкого нахилу.
 *
 * `clear`: верх парковки з будинком (`LOT_BOUNDS.top`) — під нижнім краєм, і так далеко, що ні кадр парковки, ні те, що поруч із
 * нею інакше (дерева на плитках узбіччя під нею, `RaceScene.drawRoad`; вуличні ліхтарі праворуч поруч із нею, `streetPools`,
 * яких там немає на 1,5 радіуса плями — 315), уже не сягає кадру: кадр старту гонки без неї той самий
 * (`tests/homedeparture.test.ts`).
 */
export const HOME_DEPARTURE = {
  fadeIn: HOME_ROAD.fadeIn,
  reverseFrom: 350,
  reverse: DEPARTURE.reverse,
  lotSpeed: DEPARTURE.lotSpeed,
  lotRamp: DEPARTURE.lotRamp,
  laneChange: 320,
  ms: 3000,
  panMs: DEPARTURE.panMs,
  clear: 320,
  hud: 300,
} as const;

/** Коли машина рушає вперед (задки — позаду), мс. */
const HOME_FORWARD = HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse;
/** Смуга старту гонки (`newRace`) і своя машина там на екрані (одиниці арту від верху кадру; x — від середини дороги). */
const START_LANE = newRace(0, 0).lane;
/** Середня лінія з'їзду свого будинку наприкінці від'їзду: верх парковки з будинком — на `clear` під нижнім краєм кадру. */
const HOME_LOT_END = SCREEN - LOT_BOUNDS.top + HOME_DEPARTURE.clear;
/** На скільки камера їде вгору за від'їзд (світ — донизу). */
const HOME_SHIFT = HOME_LOT_END - PARKED_LOT_Y;
/** Де своя машина стає наприкінці, у рамці парковки: там, де вона на старті гонки. */
const HOME_END: Vec = { x: laneX(0, START_LANE, 1), y: PLAYER_Y - HOME_LOT_END };
/** Машини потоку гонки на ×1, одиниць арту за секунду: на від'їзді час гри не йде, і швидкість гри (×N розробника) не діє. */
const HOME_TRAFFIC = RACE.carSpeed * gameMinutes(1) * ROAD_UNIT;

/** Шлях від'їзду від свого будинку й рух ним. */
interface HomeDeparturePlan {
  back: Path;
  ahead: Path;
  /** Шлях уперед до кінця повороту на дорогу: досі — розгін проїздом (`lotSpeed`), далі — дорогою до старту гонки. */
  turn: number;
  /** За скільки секунд від рушання вперед машина доїжджає до `turn` і з якою швидкістю (одиниць арту за секунду). */
  turnAt: number;
  turnSpeed: number;
  /** Скільки секунд від `turn` до старту гонки й швидкість на початку цього відрізка в шляхах за той час (`brake`). */
  road: number;
  pace: number;
}

function homeDeparturePath(slot: number): HomeDeparturePlan {
  const { path: back, cusp } = reversePath(slot);
  const turnOut = { x: RIGHT_LANE + PARKING.turnOut, y: AISLE };
  const onRoad = { x: RIGHT_LANE, y: AISLE - PARKING.turnOut };
  const inLane = { x: HOME_END.x, y: onRoad.y - HOME_DEPARTURE.laneChange };
  const ahead = buildPath([
    line(cusp, turnOut),
    curve(turnOut, WEST, onRoad, NORTH, KAPPA * PARKING.turnOut),
    curve(onRoad, NORTH, inLane, NORTH, HOME_DEPARTURE.laneChange / 3),
    line(inLane, HOME_END),
  ]);
  const turn = ahead.marks[2] ?? 0;
  const ramp = HOME_DEPARTURE.lotRamp / 1000;
  const turnAt = rampTime(turn, HOME_DEPARTURE.lotSpeed, ramp);
  const turnSpeed = HOME_DEPARTURE.lotSpeed * smooth(turnAt / ramp);
  const road = (HOME_DEPARTURE.ms - HOME_FORWARD) / 1000 - turnAt;
  const rest = ahead.length - turn;
  return { back, ahead, turn, turnAt, turnSpeed, road, pace: rest > 0 ? (turnSpeed * road) / rest : 0 };
}

const homeDepartures = new Map<number, HomeDeparturePlan>();

function planHomeDeparture(slot: number): HomeDeparturePlan {
  let plan = homeDepartures.get(slot);
  if (!plan) {
    plan = homeDeparturePath(slot);
    homeDepartures.set(slot, plan);
  }
  return plan;
}

/** Де своя машина через `ms` мс від'їзду від свого будинку, у рамці парковки (одиниці арту). */
function homeDeparturePose(ms: number, plan: HomeDeparturePlan): { x: number; y: number; rotation: number } {
  if (ms < HOME_FORWARD) return pathAt(plan.back, plan.back.length * smooth((ms - HOME_DEPARTURE.reverseFrom) / HOME_DEPARTURE.reverse));
  const t = (ms - HOME_FORWARD) / 1000;
  if (t < plan.turnAt) {
    const ramp = HOME_DEPARTURE.lotRamp / 1000;
    return pathAt(plan.ahead, HOME_DEPARTURE.lotSpeed * ramp * smoothArea(t / ramp));
  }
  const u = plan.road > 0 ? (t - plan.turnAt) / plan.road : 1;
  return pathAt(plan.ahead, plan.turn + (plan.ahead.length - plan.turn) * brake(u, plan.pace));
}

/**
 * Від'їзд від свого будинку: де стала гонка (`done` — 0 на свіжій), зерно парковки свого будинку (`homeLotSeed`) і машини потоку
 * гонки в мить її старту (`ahead` — одиниць дороги попереду своєї машини, вигляд — `trafficLook`, як їх покаже гонка).
 */
export interface HomeDepartureStart extends ParkingSpot {
  cars: readonly ArrivalCar[];
}

/**
 * Знімок старту гонки для від'їзду від свого будинку: сим ставить машини потоку лише з першим кроком гонки (`driveRace`), тож
 * перший крок робиться на копії (`race` не змінюється) — і ті самі машини гонка поставить сама, коли від'їзд скінчиться.
 * `gameSeed` — зерно гри (`state.seed`), `difficulty` і `traffic` — як у `driveTrip` (складність і `trafficFactor`).
 */
export function homeDepartureStart(race: Race, gameSeed: number, difficulty: Difficulty, traffic = 1): HomeDepartureStart {
  const probe = structuredClone(race);
  driveRace(probe, RACE.step, { steer: 0, throttle: 0 }, difficulty, traffic);
  return {
    done: race.done,
    seed: homeLotSeed(gameSeed),
    cars: probe.cars.map((car) => ({ lane: car.lane, ahead: carAt(probe, car) - probe.done, look: trafficLook(car) })),
  };
}

/**
 * Кадр від'їзду від свого будинку через `ms` мс від запуску сцени дороги на кадрі заввишки `height` px (`HOME_DEPARTURE`). На
 * `ms` = 0 — кадр парковки, як на місці біля пункту (парковка з будинком посередині висоти кадру, машина на своєму місці носом
 * угору, дорога порожня), але чорний: він проступає за `fadeIn`. Зсув убік (`pan`) — частка `lotFitPan`: картки немає, тож
 * парковку лише вміщено в кадр. З `HOME_DEPARTURE.ms` — `done` і кадр старту гонки: зсув дороги `done × ppu`, своя машина в
 * смузі старту на `RACE_PLAYER_Y` носом угору, машини потоку там, де їх поставить перший крок гонки (`homeDepartureStart`), —
 * вони весь від'їзд їдуть дорогою зі швидкістю потоку гонки на ×1 і з'являються згори, бо камера їх обганяє; парковка з
 * будинком — уся під нижнім краєм кадру.
 */
export function homeDepartureFrame(ms: number, height: number, start: HomeDepartureStart): ParkingAnimationFrame {
  const time = Math.min(Math.max(0, ms), HOME_DEPARTURE.ms);
  const k = raceScale(height);
  const plan = planHomeDeparture(ownSlot(start.seed));
  const pose = homeDeparturePose(time, plan);
  // Камера — за машиною вгору дорогою: частка шляху вгору від проїзду до старту гонки (задки — ще ні).
  const up = time < HOME_FORWARD ? 0 : clamp01((AISLE - pose.y) / (AISLE - HOME_END.y));
  const lotY = PARKED_LOT_Y + HOME_SHIFT * up;
  const behind = (HOME_TRAFFIC * (HOME_DEPARTURE.ms - time)) / 1000;
  const traffic: ParkingCar[] = [];
  for (const car of start.cars) {
    const y = lotY + HOME_END.y - car.ahead * ROAD_UNIT + behind;
    if (inFrame(y)) traffic.push({ x: laneX(0, car.lane, 1) * k, y: y * k, rotation: 0, look: car.look, alpha: 1 });
  }
  return {
    offset: zero((start.done * ROAD_UNIT + lotY - HOME_LOT_END) * k),
    lot: lotY * k,
    pan: 1 - smooth((time - HOME_FORWARD) / HOME_DEPARTURE.panMs),
    car: { x: zero(pose.x * k), y: (lotY + pose.y) * k, rotation: pose.rotation },
    parked: parkedCars(start.seed, lotY * k, height),
    traffic,
    dark: clamp01(1 - time / HOME_DEPARTURE.fadeIn),
    done: ms >= HOME_DEPARTURE.ms,
  };
}

/** Напис і смуга прогресу гонки через `ms` мс від'їзду від свого будинку: проступають за `HOME_DEPARTURE.hud` до кінця (0–1). */
export function homeDepartureHud(ms: number): number {
  return smooth((ms - (HOME_DEPARTURE.ms - HOME_DEPARTURE.hud)) / HOME_DEPARTURE.hud);
}

// --- Де парковка в кадрі ---------------------------------------------------------------------------------------

/** Кадр сцени дороги в одиницях інтерфейсу (`RaceView`): розмір, масштаб арту й безпечна зона. */
export interface ParkingView {
  width: number;
  height: number;
  k: number;
  safe: { readonly right: number };
}

/** Де стоїть парковка на місці. */
export interface ParkingLayout {
  /** Картку пункту притиснуто ліворуч: праворуч від неї вміщається парковка з будівлею. */
  aside: boolean;
  /** Зсув середини дороги, одиниці інтерфейсу (+ праворуч, − ліворуч): парковка — посередині вільної смуги. */
  pan: number;
  /** Вільна смуга праворуч від картки (від її правого краю до безпечної зони праворуч), одиниці інтерфейсу; без `aside` — null. */
  strip: { left: number; right: number } | null;
}

/**
 * Де парковка на місці (§8.5 «На місці — кадр парковки»): `view` — кадр в одиницях інтерфейсу, `cardRight` — правий край картки,
 * притиснутої ліворуч, в одиницях інтерфейсу (`asideCardRight(…)` × одиниць інтерфейсу на px CSS). Якщо вільна смуга праворуч
 * від картки (мінус безпечна зона й поля `PARKING.margin`) вміщає парковку з будівлею (`RACE_LOT.reach`), картку притиснуто
 * ліворуч, а дорогу зсунуто так, що парковка — посередині смуги; інакше картка посередині, а дорогу зсунуто ліворуч рівно
 * настільки, щоб парковка з будівлею вміщалася в кадр з полем праворуч (уміщається й так — не зсунуто: 667 × 375). Зсув робить
 * сцена через `cx`, не камерою.
 */
export function parkingLayout(view: ParkingView, cardRight: number): ParkingLayout {
  const margin = PARKING.margin * view.k;
  const left = cardRight + margin;
  const right = view.width - view.safe.right - margin;
  const need = (RACE_LOT.reach.right - RACE_LOT.reach.left) * view.k;
  // Картка посередині, але парковка з будівлею однаково в кадрі (§8.5, рецензія реалізації 2026-11-02): на вузькому високому
  // вікні (800 × 900) вона виходила за правий край разом зі своєю машиною на місці.
  if (!(right - left >= need)) return { aside: false, pan: lotFitPan(view), strip: null };
  const lotMiddle = view.width / 2 + ((RACE_LOT.reach.left + RACE_LOT.reach.right) / 2) * view.k;
  return { aside: true, pan: (left + right) / 2 - lotMiddle, strip: { left: cardRight, right: view.width - view.safe.right } };
}

/**
 * Зсув середини дороги (одиниці інтерфейсу, ≤ 0), за якого парковка з будівлею вміщається в кадр з полем `PARKING.margin`
 * праворуч від безпечної зони: уміщається й так — 0. Так стоїть парковка під карткою посередині (`parkingLayout`) і біля свого
 * будинку на виїзді з дому (`homeDepartureFrame`: картки там немає).
 */
export function lotFitPan(view: ParkingView): number {
  const right = view.width - view.safe.right - PARKING.margin * view.k;
  const lotRight = view.width / 2 + RACE_LOT.reach.right * view.k;
  return Math.min(0, right - lotRight);
}
