// Ніч у гонці (§8.9 «День і ніч», рішення автора 2026-11-02 «Те саме + світло ліхтарів», вигляд — «М'які градієнти»): у темний
// час дорога й узбіччя темнішають (увечері й уранці — з теплим відтінком), машини світять фарами вперед і червоними задніми
// вогнями, на парковці фари гаснуть, табличка пункту світиться, а вздовж дороги й на парковці лежать плями світла вуличних
// ліхтарів (самих стовпів не видно). Удень (`daylight` — null) нічого цього немає: дорога рівно як до блоку.
//
// Чисті розрахунки без Phaser і DOM (`tests/racelight.test.ts`): де вогні машини й куди вони світять, коли вмикаються фари, де
// плями ліхтарів, який тон ночі й на яку хвилину світло в поїздці (`tripLightMinute`). Малює `RaceNight`
// (`src/view/racenight.ts`). Числа вигляду (кольори, прозорості, довжини, радіуси) — тут, як `PARKING` чи `HOME_ROAD`; межі
// доби — `DAYLIGHT` (`src/sim/config.ts`) через `daylight`. Вуличні ліхтарі горять і в день відключення електрики (рішення
// виконавця: «у районі» світло вимкнули лише в квартирі персонажа) — тож світло гонки рахується з `power` = true.
//
// Одиниці й координати — як у `parking.ts`: px — одиниці кадру сцени дороги (x праворуч, y донизу), одиниці арту — 1 = k px
// (`raceScale`), поворот — радіани за годинниковою стрілкою, 0 — носом угору.

import { MODIFIERS } from "../sim/config";
import { roadMinutes, visitMinutes } from "../sim/trips";
import type { GameState } from "../sim/types";
import { RACE_BUILDING, RACE_TILES } from "./art/manifest/a14-race";
import { CAR_REACH, HOME_ROAD } from "./homeroad";
import type { Daylight } from "./light/daylight";
import { CAR_BODY, DEPARTURE, LOT_BOUNDS, type CarPose } from "./parking";
import { scrollOffset, TRAFFIC_COLORS, TRAFFIC_KINDS, type TrafficKind, type TrafficLook } from "./racelook";

/** Вид машини: своя чи машина потоку. */
export type CarKind = "player" | TrafficKind;

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Вогні машин від pivot (одиниці арту; полотно `race/car/*` 72 × 84, pivot 36, 40 — середина кузова, як у `CAR_BODY`): середини
 * фар (`head`, попереду — y < 0) і задніх вогнів (`tail`) правого боку; лівий — дзеркально (x < 0). Звірено з
 * `art/race/car/player.svg` і `traffic.svg` (групи вогнів).
 */
export const CAR_LIGHTS: Readonly<Record<CarKind, { head: Point; tail: Point }>> = {
  player: { head: { x: 14.5, y: -24 }, tail: { x: 14.5, y: 24.6 } },
  sedan: { head: { x: 14.5, y: -24 }, tail: { x: 14.5, y: 24.6 } },
  hatch: { head: { x: 14, y: -21 }, tail: { x: 14, y: 21.6 } },
  van: { head: { x: 16, y: -26 }, tail: { x: 16, y: 26.6 } },
};

/**
 * Тон ночі на дорозі (множення поверх дороги, узбіччя, парковки, машин і будівлі; HUD — над ним). Канали 0–1: `night` — глуха
 * ніч (синювато-сірий, щоб не плутався з фіолетовим серпанком глузду), `warm` — теплий вечір і ранок. Вуличні ліхтарі й
 * табличка пункту розгоряються, поки темрява (`Daylight.dark`) росте від `lamps.from` до `lamps.to`.
 */
export const RACE_NIGHT = {
  night: { r: 0.34, g: 0.38, b: 0.55 },
  warm: { r: 1, g: 0.8, b: 0.6 },
  lamps: { from: 0.2, to: 0.45 },
} as const;

/**
 * Фари: машина вмикає їх, коли темрява доходить до її порога — `threshold` ± `spread` за зерном машини (своя — рівно
 * `threshold`). Поріг сталий, а темрява за вечір лише росте (уранці — лише спадає), тож кожна машина вмикає (вимикає) фари
 * раз, без блимання.
 */
export const HEADLIGHTS = { threshold: 0.25, spread: 0.1 } as const;

/**
 * Промінь фари — конус від фари вперед: довжина й половина кута (одиниці арту, радіани), прозорість у світлі ночі
 * (`RaceNight`). Кольори всіх вогнів — `LIGHT_COLORS`.
 */
export const BEAM = { length: 170, half: (18 * Math.PI) / 180, alpha: 0.62 } as const;

/**
 * Задні вогні: червоне світло на асфальті позаду (`glow` — радіус, одиниці арту; середина — на `behind` радіуса позаду вогню,
 * щоб світився асфальт, а не кузов) і самі ліхтарі (`dot`); `running` — як світять на ходу, гальмування (прибуття) — на повну.
 * Задній хід (від'їзд задки з місця) — білі вогні там само (`reverse`).
 */
export const TAIL = { glow: 36, glowAlpha: 0.7, behind: 0.55, dot: 7, dotAlpha: 0.9, running: 0.6, reverse: 0.7 } as const;

/** Самі фари — світлі цятки поверх кузова (одиниці арту). */
export const BULB = { radius: 8, alpha: 0.85 } as const;

/**
 * Вуличні ліхтарі (стовпів не видно — лише плями світла): на кожен ряд плиток дороги — один ліворуч і один праворуч, урозбіг
 * (`at` — частка кроку ряду від його верху), на `x` одиниць арту від середини дороги — над крайньою смугою й бордюром.
 */
export const STREET_LAMPS = {
  x: 122,
  radius: 210,
  alpha: 0.62,
  lamps: [
    { side: -1, at: 0.15 },
    { side: 1, at: 0.65 },
  ],
} as const;

/**
 * Ліхтарі парковки пункту (рамка парковки, як `RACE_LOT`: x від середини дороги, y від середньої лінії з'їзду): над місцями
 * біля будівлі й над з'їздом. Вуличні праворуч на парковку не лягають (`streetPools`).
 */
export const LOT_LAMPS = {
  radius: 150,
  alpha: 0.6,
  at: [
    { x: 250, y: -80 },
    { x: 400, y: -80 },
    { x: 190, y: 20 },
  ],
} as const;

/** Середина таблички на даху будівлі в рамці парковки: точка `sign` полотна `race/building`, що лягає pivot у `pivotAt`. */
export const SIGN_AT: Point = {
  x: RACE_BUILDING.pivotAt.x + RACE_BUILDING.sign.x - RACE_BUILDING.pivot.x,
  y: RACE_BUILDING.pivotAt.y + RACE_BUILDING.sign.y - RACE_BUILDING.pivot.y,
};

/**
 * Табличка пункту світиться: світло ночі над нею — на повну, з плавним краєм на дах (`radius`, одиниці арту; рівне до
 * половини радіуса — уся табличка 64 × 64), і ледь помітний ореол поверх (`halo`).
 */
export const SIGN_GLOW = { radius: 96, alpha: 0.85, halo: 64, haloAlpha: 0.14 } as const;

/**
 * Світло ночі (lightmap, `RaceNight`): пікселів текстури на одиницю інтерфейсу. М'яким градієнтам вистачає половини, а
 * текстура вчетверо менша за кадр — і на програмному WebGL.
 */
export const LIGHTMAP = { res: 0.5 } as const;

/** Кольори світла (0xRRGGBB): вуличні ліхтарі, фари, задні вогні, задній хід, самі фари, табличка. */
export const LIGHT_COLORS = {
  pool: 0xffd28a,
  beam: 0xfff3d6,
  tail: 0xff3424,
  reverse: 0xfff8ee,
  bulb: 0xfffae6,
  sign: 0xffdca0,
} as const;

/**
 * Своя машина на парковці (§8.5 «На місці — кадр парковки»): фари гаснуть за `offMs` до кінця прибуття (машина вже стає), на
 * місці не горять, а на від'їзді вмикаються з `onFrom` за `onMs`; задній хід — поки машина задкує з місця (`DEPARTURE.reverse`).
 * Світло доби на від'їзді доганяє час після візиту за `catchUp` (`departureLightMinute`).
 */
export const OWN_LIGHTS = { offMs: 350, onFrom: 120, onMs: 250, reverseOff: 150, catchUp: 600 } as const;

/**
 * Запас відсікання машин уночі, одиниці арту: від середини машини до кінчика променя фари (найдовша машина). Машина, далі за
 * нього від краю кадру, нічим не світить у кадр.
 */
export const LIGHT_REACH = Math.max(...Object.values(CAR_LIGHTS).map((lights) => -lights.head.y)) + BEAM.length;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
/** Плавно 0 → 1 (smoothstep). */
const smooth = (u: number): number => {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
};

// --- Світло доби в поїздці ----------------------------------------------------------------------------------

/**
 * Етап поїздки для світла: гонка, прибуття, аварія й кадр на місці — `drive` (годинник гри); від'їзд із парковки —
 * `departure`; дорога додому — `home`.
 */
export type TripLightStage = "drive" | "departure" | "home";

/**
 * На яку хвилину світло в поїздці. Від'їзд і дорогу додому сцена показує ще з часом прибуття: час візиту й дороги сим додає,
 * коли катсцена скінчилася (`goHome` → `returnHome`, `src/sim/game.ts`), — тож без цього світло стрибало б наприкінці
 * дороги додому. Від'їзд — уже після візиту (`visitMinutes` і пошук шкарпетки `trip.search`), дорога додому — ще й частка
 * `progress` (0–1) дороги (`roadMinutes`). Знайду відносять у притулок без поїздки (`carryFoundling`): дві години — уся подія,
 * дороги окремо немає.
 */
export function tripLightMinute(state: GameState, stage: TripLightStage, progress = 0): number {
  if (stage === "drive") return state.minute;
  const trip = state.trip;
  if (!trip) return state.minute + (state.today.foundling ? MODIFIERS.foundlingShelterMinutes : 0);
  const visit = visitMinutes(trip) + (trip.search ?? 0);
  if (stage === "departure") return state.minute + visit;
  return state.minute + visit + roadMinutes(state, trip.destination) * clamp01(progress);
}

/**
 * Світло від'їзду з парковки через `ms` мс від «Додому»: від'їзд без розриву переходить у дорогу додому (`departureFrame`, уся
 * катсцена — `HOME_ROAD.ms`), тож хвилина — як у дорозі додому з часткою `ms / HOME_ROAD.ms`. Перший кадр — той самий, що на
 * місці, тож від хвилини на місці світло доганяє час після візиту плавно, за `OWN_LIGHTS.catchUp`, а не стрибком.
 */
export function departureLightMinute(state: GameState, ms: number): number {
  const parked = tripLightMinute(state, "drive");
  const home = tripLightMinute(state, "home", ms / HOME_ROAD.ms);
  return parked + (home - parked) * smooth(ms / OWN_LIGHTS.catchUp);
}

// --- Рівень ночі ------------------------------------------------------------------------------------------------

/** Ніч гонки з світла доби. */
export interface RaceNightLevel {
  /** Тон (множення), 0xRRGGBB: білий — як удень. */
  tone: number;
  /** Темрява 0–1 (`Daylight.dark`): від неї — фари (`headlightsOn`). */
  dark: number;
  /** Вуличні ліхтарі й табличка пункту, 0–1. */
  lamps: number;
}

/** Ніч гонки зі світла доби `d` (`daylight(хвилина, true)`); удень (null) — null: нічого не малюється. */
export function raceNight(d: Daylight | null): RaceNightLevel | null {
  if (!d) return null;
  const { night, warm } = RACE_NIGHT;
  const channel = (n: number, w: number): number => Math.round(255 * clamp01((1 - d.dark * (1 - n)) * (1 - d.warm * (1 - w))));
  const tone = (channel(night.r, warm.r) << 16) | (channel(night.g, warm.g) << 8) | channel(night.b, warm.b);
  return { tone, dark: d.dark, lamps: smooth((d.dark - RACE_NIGHT.lamps.from) / (RACE_NIGHT.lamps.to - RACE_NIGHT.lamps.from)) };
}

// --- Фари ------------------------------------------------------------------------------------------------------

/** Зерно машини потоку для порога фар — з її вигляду (`TrafficLook` сталий від першої зустрічі й на прибутті). */
export function lookSeed(look: TrafficLook): number {
  return 1 + TRAFFIC_KINDS.indexOf(look.kind) * TRAFFIC_COLORS.length + look.color;
}

/** Поріг фар машини: темрява, з якої вона їх вмикає; null — своя машина (рівно `HEADLIGHTS.threshold`). */
export function headlightThreshold(seed: number | null): number {
  if (seed === null) return HEADLIGHTS.threshold;
  // Множення на золотий перетин за модулем 2³²: сусідні зерна дають рівномірно розкидані частки.
  const unit = (Math.imul(seed | 0, 0x9e3779b1) >>> 0) / 2 ** 32;
  return HEADLIGHTS.threshold + HEADLIGHTS.spread * (2 * unit - 1);
}

/** Чи горять фари машини із зерном `seed` (null — своя), коли темрява `level`. */
export function headlightsOn(level: number, seed: number | null): boolean {
  return level >= headlightThreshold(seed);
}

// --- Вогні машини ----------------------------------------------------------------------------------------------

/** Вогонь машини в кадрі. */
export interface CarLight {
  kind: "head" | "tail";
  /** Px кадру (x — разом із серединою дороги, як у пози). */
  x: number;
  y: number;
  /** Куди світить, радіани за годинниковою (0 — угору): фари — куди ніс машини, задні — назад. */
  rotation: number;
}

/**
 * Вогні машини виду `kind` у позі `pose` (px; поворот — як у арту: нахил ±0,2 під час перестроювання, π — носом донизу) на
 * кадрі з `k` px на одиницю арту: дві фари й два задні вогні, повернуті разом із кузовом навколо pivot.
 */
export function carLights(pose: CarPose, kind: CarKind, k = 1): CarLight[] {
  const { head, tail } = CAR_LIGHTS[kind];
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  const at = (x: number, y: number): { x: number; y: number } => ({ x: pose.x + (x * cos - y * sin) * k, y: pose.y + (x * sin + y * cos) * k });
  const lights: CarLight[] = [];
  for (const side of [-1, 1]) lights.push({ kind: "head", ...at(side * head.x, head.y), rotation: pose.rotation });
  for (const side of [-1, 1]) lights.push({ kind: "tail", ...at(side * tail.x, tail.y), rotation: pose.rotation + Math.PI });
  return lights;
}

/**
 * Чи точка `point` (px) під кузовом машини виду `kind` у позі `pose` на кадрі з `k` px на одиницю арту: кузов — прямокутник
 * `CAR_BODY` навколо pivot, повернутий разом із машиною.
 */
export function underBody(point: Point, pose: CarPose, kind: CarKind, k = 1): boolean {
  const body = CAR_BODY[kind];
  const dx = point.x - pose.x;
  const dy = point.y - pose.y;
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  // У рамку кузова — поворот назад, на −rotation (`carLights` повертає на +rotation).
  const x = (dx * cos + dy * sin) / k;
  const y = (dy * cos - dx * sin) / k;
  return Math.abs(x) < body.w / 2 && Math.abs(y) < body.h / 2;
}

/**
 * Вогні машини потоку виду `kind` у позі `pose`, яких не закриває своя машина (`own` — її поза; null — своєї в кадрі немає).
 * Своя — над потоком, а цятки вогнів і світло в lightmap — над усіма кузовами (`RACE_DEPTH`), тож вогонь під кузовом своєї
 * світив би крізь нього: фари машини, що пригальмовує впритул позаду (сим тримає її за `RACE.carLength`), і задні вогні тієї,
 * у яку врізалися (кадр аварії з наїздом камери). Такий вогонь не горить зовсім — ні цятки, ні світла (промінь, пляма).
 */
export function trafficLights(pose: CarPose, kind: TrafficKind, own: CarPose | null, k = 1): CarLight[] {
  const lights = carLights(pose, kind, k);
  return own === null ? lights : lights.filter((light) => !underBody(light, own, "player", k));
}

/**
 * Наскільки світять вогні машини, середина якої на `y` px кадру заввишки `height`: у кадрі — на повну, а за краєм плавно
 * гаснуть до `band` одиниць арту від нього. Прибуття й від'їзд відсікають машини, далі за `CAR_REACH` від краю, гонка — за
 * довжиною кадру машини (84), а сим прибирає машини позаду за 1 одиницею дороги (≈ 58 одиниць арту під нижнім краєм), тож з
 * `band` = `CAR_REACH` промінь машини, що виїжджає з кадру, гасне до того, як її не стане, — без стрибка, і запасу на промінь
 * там не треба. Дорога додому відсікає попутні аж до `LIGHT_REACH` від краю (запас `homeRoadFrame`) і гасить їх за ним
 * (`band` = `LIGHT_REACH`): попутні, що виїжджають угору, світять фарами донизу — у кадр.
 */
export function lightFade(y: number, height: number, k: number, band: number = CAR_REACH): number {
  const outside = Math.max(0, y - height, -y) / k;
  return 1 - smooth(outside / band);
}

// --- Своя машина на парковці --------------------------------------------------------------------------------------

/** Вогні своєї машини: фари, задні (0 — не горять, `TAIL.running` — на ходу, 1 — гальмує) і задній хід, кожне 0–1. */
export interface OwnLights {
  head: number;
  tail: number;
  reverse: number;
}

/** У гонці й у дорозі додому: фари й задні на ходу. */
export const DRIVING_LIGHTS: OwnLights = { head: 1, tail: TAIL.running, reverse: 0 };
/** На місці (§8.5 «На місці — кадр парковки»): вимкнено. */
export const PARKED_LIGHTS: OwnLights = { head: 0, tail: 0, reverse: 0 };

/** Прибуття через `ms` мс із `total` (`arrivalMs`): гальмує (задні — на повну), а за `offMs` до кінця все гасне. */
export function arrivalLights(ms: number, total: number): OwnLights {
  const on = 1 - smooth((ms - (total - OWN_LIGHTS.offMs)) / OWN_LIGHTS.offMs);
  return { head: on, tail: on, reverse: 0 };
}

/** Від'їзд через `ms` мс від «Додому»: вогні вмикаються, задній хід — поки машина задкує з місця. */
export function departureLights(ms: number): OwnLights {
  const on = smooth((ms - OWN_LIGHTS.onFrom) / OWN_LIGHTS.onMs);
  const reverse = on * (1 - smooth((ms - DEPARTURE.reverse) / OWN_LIGHTS.reverseOff));
  return { head: on, tail: TAIL.running * on, reverse };
}

// --- Вуличні ліхтарі й парковка ------------------------------------------------------------------------------------

/** Пляма світла: середина (px кадру), радіус (px) і сила 0–1 (на повну, коли ліхтарі розгорілися, `RaceNightLevel.lamps`). */
export interface LightPool {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/** Кадр дороги для плям: висота, масштаб арту й середина дороги (px). */
export interface PoolView {
  height: number;
  k: number;
  cx: number;
}

/**
 * Плями вуличних ліхтарів уздовж дороги, зсунутої на `distance` px (як у `drawRoad`: що більше, то нижче ряди плиток): на
 * кожен ряд плиток дороги (крок `RACE_TILES.road.period`) — ліхтар ліворуч і праворуч урозбіг (`STREET_LAMPS`), тож вони їдуть
 * разом із дорогою. Лише ті, що світять у кадр. Праворуч поруч із парковкою пункту (`lotY` — середня лінія з'їзду, px; null —
 * парковки немає) — ні: там свої ліхтарі (`lotPools`).
 */
export function streetPools(distance: number, view: PoolView, lotY: number | null): LightPool[] {
  const { height, k, cx } = view;
  const period = RACE_TILES.road.period * k;
  const radius = STREET_LAMPS.radius * k;
  const lot = lotY === null ? null : { top: lotY + LOT_BOUNDS.top * k - radius / 2, bottom: lotY + LOT_BOUNDS.bottom * k + radius / 2 };
  const pools: LightPool[] = [];
  for (let row = scrollOffset(distance, period) - 2 * period; row < height + period; row += period) {
    for (const lamp of STREET_LAMPS.lamps) {
      const y = row + lamp.at * period;
      if (!reachesFrame(y, radius, height)) continue;
      if (lamp.side > 0 && lot !== null && y > lot.top && y < lot.bottom) continue;
      pools.push({ x: cx + lamp.side * STREET_LAMPS.x * k, y, radius, alpha: STREET_LAMPS.alpha });
    }
  }
  return pools;
}

/** Чи світить у кадр заввишки `height` пляма з серединою на `y` і радіусом `radius` (px). */
function reachesFrame(y: number, radius: number, height: number): boolean {
  return y >= -radius && y <= height + radius;
}

/** Плями ліхтарів парковки пункту, коли середня лінія з'їзду — на `lotY` px, а середина дороги — на `cx` px. */
export function lotPools(lotY: number, cx: number, k: number): LightPool[] {
  return LOT_LAMPS.at.map((at) => ({ x: cx + at.x * k, y: lotY + at.y * k, radius: LOT_LAMPS.radius * k, alpha: LOT_LAMPS.alpha }));
}

/** Сяйво таблички пункту (середина таблички й радіус світла, px). */
export function signGlow(lotY: number, cx: number, k: number): LightPool {
  return { x: cx + SIGN_AT.x * k, y: lotY + SIGN_AT.y * k, radius: SIGN_GLOW.radius * k, alpha: SIGN_GLOW.alpha };
}

/** Світло парковки пункту в кадрі: плями її ліхтарів і сяйво таблички (null — не світить у кадр). */
export interface LotLights {
  pools: LightPool[];
  sign: LightPool | null;
}

/**
 * Світло парковки пункту (`lotY` — середня лінія з'їзду, px; null — парковки немає): плями ліхтарів (`lotPools`) і сяйво
 * таблички (`signGlow`), кожне — поки воно світить у кадр за власним радіусом, як `streetPools`, а не поки в кадрі малюнок
 * парковки (`lotInFrame`): пляма ліхтаря над з'їздом сягає далеко нижче за край парковки (`LOT_BOUNDS.bottom`), тож інакше
 * на верхньому краї кадру вона з'являлася б стрибком, а вуличних праворуч там уже немає (`streetPools`).
 */
export function lotLights(lotY: number | null, view: PoolView): LotLights {
  if (lotY === null) return { pools: [], sign: null };
  const { height, k, cx } = view;  const pools = lotPools(lotY, cx, k).filter((pool) => reachesFrame(pool.y, pool.radius, height));
  const sign = signGlow(lotY, cx, k);
  return { pools, sign: reachesFrame(sign.y, sign.radius, height) ? sign : null };
}

// --- Текстури м'яких градієнтів -----------------------------------------------------------------------------------

/**
 * Прозорість плями (вуличний ліхтар, задні вогні, ореол) на відстані `r` від середини, у радіусах (0–1): рівна середина й
 * плавний край; `flat` — частка радіуса, де світло ще на повну (табличка).
 */
export function poolAlpha(r: number, flat = 0): number {
  if (r >= 1) return 0;
  const t = clamp01((r - flat) / (1 - flat));
  const edge = 1 - smooth(t);
  return edge * edge;
}

/**
 * Прозорість променя фари в точці, що на `along` довжин променя попереду фари й на кут `angle` (радіани) від його осі: найясніше
 * біля фари (крім самого вістря), до кінчика гасне; краї конуса м'які — повна сила до 0,6 половини кута, нуль — на 1,25.
 */
export function beamAlpha(along: number, angle: number): number {
  if (along <= 0 || along >= 1) return 0;
  const length = (1 - along) ** 1.4 * smooth(along / 0.06);
  const across = 1 - smooth((Math.abs(angle) - 0.6 * BEAM.half) / (0.65 * BEAM.half));
  return length * across;
}

/** Найширший кут променя від осі (радіани), де `beamAlpha` ще не нуль: з нього — ширина текстури променя. */
export const BEAM_SPREAD = 1.25 * BEAM.half;
