// Що малює світло доби квартири (§8.9 «День і ніч»): чистий план без Phaser і DOM — `iso/light.ts` лише виконує його на
// Canvas2D. Карта світла (множенням над усією квартирою) — тон доби в силуеті квартири, світлі плями від джерел (`sources.ts`)
// і трохи світліші смуги сонця; шар скла (просто над вікнами, під усім, що стоїть) — темне чи тепле скло; смуги сонця на
// підлозі (додаванням). Кольори й числа — `lightlook.ts`.
//
// Карта множить: колір 1 — нічого не змінює, менший — темнить. Тож удень і на межах дня (темрява й тепло 0) план — тотожність:
// тон і скло білі, плям і смуг немає, і перехід у день без стрибка. Скла в карті немає: над ним, як і над котом на підвіконні
// перед ним, — тон. Шар скла під речами доводить скло до кольору `glassOf`: множником скло / тон, де скло темніше за тон, і
// додаванням (скло − тон) / тон × колір шибки (`GLASS.art`), де тепле скло світліше за тон (`glassLayers`).

import { MAP_HEIGHT, MAP_WIDTH } from "../../sim/home";
import type { Vec } from "../../sim/types";
import { GLASS_RECESS, type Pane } from "../decor";
import type { Point } from "../world/part";
import { ISO, ISO_TILE, ISO_WALLS } from "../world/projection";
import { lightKey, type Daylight } from "./daylight";
import {
  CANDLE_LIGHT,
  CEILING_LIGHT,
  DESK_LAMP_LIGHT,
  GAS_LIGHT,
  GLASS,
  HIGHLIGHT_DARK,
  LIGHTMAP,
  POOL_LIFT,
  POOL_ROUND,
  SCONCE_LIGHT,
  SCREEN_LIGHT,
  SUN,
  TONE,
  WHITE,
  rgb,
  toHex,
  type Rgb,
} from "./lightlook";
import { candleFlicker, type LightKind, type LightSource } from "./sources";
import { sunStrips } from "./sunstrips";

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function times(a: Rgb, b: Rgb): Rgb {
  return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b };
}

/** Тон доби: білий удень, синьо-сірий уночі (у відключення — темніший), з теплим відтінком світанку чи заходу. */
export function toneOf(d: Daylight): Rgb {
  const base = mix(WHITE, d.power ? TONE.night : TONE.outage, d.dark);
  const tint = d.phase === "morning" ? TONE.morning : TONE.evening;
  return times(base, mix(WHITE, tint, d.warm));
}

/** Колір скла вікон: темно-синій уночі, теплий на світанку й увечері, білий (як удень) на межах дня. */
export function glassOf(d: Daylight): Rgb {
  return mix(mix(WHITE, GLASS.night, d.dark), GLASS.warm, d.warm * GLASS.warmMix);
}

/** Шар скла під речами: множник (≤ 1) і додаток (≥ 0) за каналами, `glassLayers`. */
export interface GlassLayers {
  readonly mul: Rgb;
  readonly add: Rgb;
}

/**
 * Шар скла під речами для тону карти `tone` і кольору скла `glass`: скло на малюнку `w` стає t · (w · mul + add). Де скло
 * темніше за тон — mul = скло / тон, add = 0: рівно w · скло. Де тепле скло світліше за тон — mul = 1, add = (скло − тон) / тон
 * × `GLASS.art`: для кольору шибки рівно w · скло, для відблисків — трохи тьмяніше.
 */
export function glassLayers(tone: Rgb, glass: Rgb): GlassLayers {
  const mul = (t: number, g: number): number => (t <= 0 ? 1 : Math.min(1, g / t));
  const add = (t: number, g: number, w: number): number => (t <= 0 ? 0 : Math.max(0, g / t - 1) * w);
  const w = GLASS.art;
  return {
    mul: { r: mul(tone.r, glass.r), g: mul(tone.g, glass.g), b: mul(tone.b, glass.b) },
    add: { r: add(tone.r, glass.r, w.r), g: add(tone.g, glass.g, w.g), b: add(tone.b, glass.b, w.b) },
  };
}

/** Колір для Canvas2D: `rgba(r, g, b, a)`. */
export function cssColor(c: Rgb, alpha = 1): string {
  const ch = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Math.min(1, Math.max(0, alpha))})`;
}

const screen = (p: Vec, z = 0): Point => {
  const s = ISO.toScreen(p);
  return { x: s.x, y: s.y - z };
};

/**
 * Опуклий многокутник, ширший на `margin` з кожного боку: кожну грань зсунуто назовні, вершини — перетини сусідніх граней.
 * Обхід — будь-який.
 */
export function expandConvex(points: readonly Point[], margin: number): Point[] {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  // Зовнішня нормаль грані a→b: для обходу з додатною площею (на екрані, де y донизу, — за годинниковою) — (dy, −dx).
  const shifted = points.map((a, i) => {
    const b = points[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (sign * (b.y - a.y)) / len;
    const ny = (sign * -(b.x - a.x)) / len;
    return { a: { x: a.x + nx * margin, y: a.y + ny * margin }, b: { x: b.x + nx * margin, y: b.y + ny * margin } };
  });
  return shifted.map((edge, i) => {
    const prev = shifted[(i - 1 + n) % n]!;
    return intersect(prev.a, prev.b, edge.a, edge.b) ?? edge.a;
  });
}

function intersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * Силует квартири на екрані, px світу: ромб підлоги з задніми стінами заввишки `ISO_WALLS.back` над рядом y = 0 і стовпцем
 * x = 0, ширший на `LIGHTMAP.margin`. Поза ним карта світла прозора — тло екрана ніч не темнить.
 */
export function apartmentOutline(): Point[] {
  const h = ISO_WALLS.back;
  return expandConvex(
    [
      screen({ x: 0, y: 0 }, h),
      screen({ x: MAP_WIDTH, y: 0 }, h),
      screen({ x: MAP_WIDTH, y: 0 }),
      screen({ x: MAP_WIDTH, y: MAP_HEIGHT }),
      screen({ x: 0, y: MAP_HEIGHT }),
      screen({ x: 0, y: MAP_HEIGHT }, h),
    ],
    LIGHTMAP.margin,
  );
}

/** Отвір вікна на екрані, px світу: чотирикутник на лиці стіни (`Pane.span` × `Pane.z`). */
export function paneQuad(pane: Pane): Point[] {
  const plane = pane.face === "y" ? pane.wall.y + 1 : pane.wall.x + 1;
  const at = (u: number): Vec => (pane.face === "y" ? { x: u, y: plane } : { x: plane, y: u });
  const [u0, u1] = pane.span;
  const [z0, z1] = pane.z;
  return [screen(at(u0), z0), screen(at(u1), z0), screen(at(u1), z1), screen(at(u0), z1)];
}

/**
 * Видиме скло вікна на екрані, px світу: многокутники `Pane.glass` у площині скла (`GLASS_RECESS` від лиця стіни) — лише скло
 * стулок, без рами, укосів, фіранок і штори (§8.9: темніє й теплішає лише скло).
 */
export function paneGlass(pane: Pane): Point[][] {
  const plane = (pane.face === "y" ? pane.wall.y : pane.wall.x) + 1 - GLASS_RECESS;
  const at = (u: number): Vec => (pane.face === "y" ? { x: u, y: plane } : { x: plane, y: u });
  return pane.glass.map((poly) => poly.map(([u, z]) => screen(at(u), z)));
}

/** Пів діагоналі ромба: радіус кола на підлозі в клітинках → піввісь еліпса на екрані по горизонталі. */
export const CELL_RX = Math.SQRT2 * (ISO_TILE.width / 2);

/** Світла пляма на карті: еліпс з центром (x, y), піввісями rx × ry, повне світло до частки `core`, далі — спадає. */
export interface PoolPaint {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly core: number;
  readonly color: Rgb;
  readonly alpha: number;
}

/**
 * Як спадає пляма від краю ядра до краю: частка шляху від ядра до краю → частка `alpha` (між точками — лінійно, як градієнт
 * Canvas2D у `iso/light.ts`).
 */
export const POOL_FALLOFF: readonly (readonly [at: number, k: number])[] = [
  [0, 1],
  [0.25, 0.74],
  [0.5, 0.4],
  [0.75, 0.13],
  [1, 0],
];

/** Прозорість плями `pool` у точці `p` (px світу): `alpha` до ядра, далі спадає за `POOL_FALLOFF`, за краєм — 0. */
export function poolAlphaAt(pool: PoolPaint, p: Point): number {
  if (pool.rx <= 0 || pool.ry <= 0 || pool.alpha <= 0) return 0;
  const r = Math.hypot((p.x - pool.x) / pool.rx, (p.y - pool.y) / pool.ry);
  if (r >= 1) return 0;
  if (r <= pool.core) return pool.alpha;
  const u = (r - pool.core) / (1 - pool.core);
  for (let i = 1; i < POOL_FALLOFF.length; i++) {
    const [a, ka] = POOL_FALLOFF[i - 1]!;
    const [b, kb] = POOL_FALLOFF[i]!;
    if (u <= b) return pool.alpha * (ka + ((kb - ka) * (u - a)) / (b - a));
  }
  return 0;
}

/** Многокутник на карті чи шарі (px світу) кольору `color` з прозорістю `alpha`. */
export interface PolyPaint {
  readonly points: readonly Point[];
  readonly color: Rgb;
  readonly alpha: number;
}

/** Смуга сонця на підлозі (px світу): градієнт від ближнього до вікна краю (`near`) до дальнього (`far`). */
export interface StripPaint extends PolyPaint {
  readonly near: Point;
  readonly far: Point;
}

export interface LightmapPlan {
  /** Тон доби всієї квартири. */
  readonly tone: Rgb;
  /** Світлі плями (найсвітліше з тону й плями — `lighten`). */
  readonly pools: readonly PoolPaint[];
  /** Трохи світліші смуги сонця (`SUN.lift`). */
  readonly strips: readonly PolyPaint[];
  /** Ключ смуг (`sunKey`): поки він той самий, смуги не перемальовують, навіть коли карта змінилася. */
  readonly stripsKey: string;
}

/** Яскравість джерела в мить `time` (мс сцени): свічки мерехтять. */
export function sourceLevel(source: LightSource, time: number): number {
  return source.flicker === undefined ? source.strength : source.strength * candleFlicker(source.flicker, time);
}

/** Час, за яким мерехтять свічки на карті світла: крок `CANDLE_LIGHT.flickerStep` (не частіше ≈ 4 разів на секунду). */
export function flickerTime(time: number): number {
  return Math.floor(time / CANDLE_LIGHT.flickerStep) * CANDLE_LIGHT.flickerStep;
}

/** Наскільки центр плями піднято від підлоги до джерела (частка шляху до `LightSource.screen`). */
const LIFT: Record<LightKind, number> = { ceiling: 0, sconce: 0, lamp: POOL_LIFT, candle: POOL_LIFT, station: 0, boiler: 0, gas: POOL_LIFT, screen: 0 };

/** Плями одного джерела на карті світла (`time` — уже крокований час мерехтіння). */
function poolsOf(source: LightSource, time: number): PoolPaint[] {
  const level = sourceLevel(source, time);
  if (level <= 0) return [];
  const color = rgb(source.color);
  const pools: PoolPaint[] = [];
  if (source.radius > 0) {
    const floor = ISO.toScreen(source.at);
    const lift = LIFT[source.kind];
    const x = floor.x + (source.screen.x - floor.x) * lift;
    const y = floor.y + (source.screen.y - floor.y) * lift;
    const spread = source.kind === "ceiling" ? CEILING_LIGHT.spread : 1;
    const rx = source.radius * spread * CELL_RX;
    // Свічка, газ і настільна лампа — над поверхнею: пляма й на речах і стіні довкола, не лише на підлозі — кругліша.
    const ry = rx * (lift > 0 ? POOL_ROUND.raised : POOL_ROUND.floor);
    const core = source.kind === "ceiling" ? CEILING_LIGHT.core : source.kind === "candle" ? CANDLE_LIGHT.poolCore : 0.12;
    pools.push({ x, y, rx, ry, core, color, alpha: level });
  }
  if (source.kind === "sconce") {
    const r = SCONCE_LIGHT.wall;
    pools.push({ x: source.screen.x, y: source.screen.y, rx: r, ry: r, core: 0.15, color, alpha: level * 0.85 });
  }
  if (source.kind === "lamp") {
    // Абажур із лампочкою: світле нутро не темніє під тоном ночі.
    const r = DESK_LAMP_LIGHT.bulb;
    pools.push({ x: source.screen.x, y: source.screen.y, rx: r, ry: r, core: 0.25, color, alpha: level * 0.9 });
  }
  if (source.kind === "screen") {
    // Сам екран (`iso/marks.ts`, у реєстрі глибини) — під картою: світиться, а не темніє.
    pools.push({ x: source.screen.x, y: source.screen.y, rx: 44, ry: 36, core: 0.45, color: rgb(SCREEN_LIGHT.color), alpha: level });
  }
  if (source.kind === "gas") pools.push({ x: source.screen.x, y: source.screen.y, rx: 22, ry: 16, core: 0.3, color: rgb(GAS_LIGHT.color), alpha: level });
  if (source.kind === "candle") pools.push({ x: source.screen.x, y: source.screen.y, rx: 16, ry: 18, core: 0.3, color: rgb(CANDLE_LIGHT.coreColor), alpha: level });
  return pools;
}

/** Смуги сонця від вікон `panes` (px світу), кольору сонця цієї частини доби й прозорості `alpha` на повну силу сонця. */
export function stripsOf(d: Daylight, panes: readonly Pane[], color: Rgb, alpha: number): StripPaint[] {
  const sun = d.sun;
  if (!sun || sun.strength <= 0) return [];
  const out: StripPaint[] = [];
  for (const pane of panes) {
    for (const strip of sunStrips(pane, sun)) {
      out.push({ points: strip.points.map((p) => screen(p)), near: screen(strip.near), far: screen(strip.far), color, alpha: alpha * sun.strength });
    }
  }
  return out;
}

/** Колір смуги сонця на підлозі (ADD): уранці — золотавий, увечері — помаранчевий. */
export function sunColor(d: Daylight): Rgb {
  return rgb(d.phase === "morning" ? SUN.morning : SUN.evening);
}

/** План карти світла для світла доби `d`, джерел `sources` і вікон `panes` у мить `time` (мс сцени). */
export function lightmapPlan(d: Daylight, sources: readonly LightSource[], panes: readonly Pane[], time: number): LightmapPlan {
  const tone = toneOf(d);
  const t = flickerTime(time);
  return {
    tone,
    pools: sources.flatMap((source) => poolsOf(source, t)),
    strips: stripsOf(d, panes, rgb(SUN.mapColor), SUN.lift),
    stripsKey: sunKey(d),
  };
}

/**
 * Колір карти світла плану `plan` у точці `p` (px світу): тон, над ним плями — найсвітліше з того, що є, і плями з її
 * прозорістю (`lighten`, як їх кладе `iso/light.ts`). Смуг сонця тут немає: вони світлішають карту щонайбільше на `SUN.lift`,
 * і для підсвітки цілі (`highlightBoost`) це не важить.
 */
export function lightAt(plan: LightmapPlan, p: Point): Rgb {
  let c = plan.tone;
  for (const pool of plan.pools) {
    const a = poolAlphaAt(pool, p);
    if (a <= 0) continue;
    const up = (dst: number, src: number): number => dst + a * (Math.max(dst, src) - dst);
    c = { r: up(c.r, pool.color.r), g: up(c.g, pool.color.g), b: up(c.b, pool.color.b) };
  }
  return c;
}

/** Підсилення сяйва цілі (`HIGHLIGHT_DARK`): у скільки разів сильніше (`strength`) і наскільки ближче до білого (`whiten`). */
export interface HighlightBoost {
  readonly strength: number;
  readonly whiten: number;
}

/**
 * Підсилення сяйва цілі, на якій яскравість карти світла `level` (0–1, `lightAt`): 1 / level, щонайбільше `HIGHLIGHT_DARK.boost`;
 * колір — ближчий до білого пропорційно підсиленню. Світло повне (удень, під лампою) — без змін.
 */
export function highlightBoost(level: number): HighlightBoost {
  const { boost, whiten } = HIGHLIGHT_DARK;
  const strength = level > 0 ? Math.min(boost, Math.max(1, 1 / level)) : boost;
  return { strength, whiten: (whiten * (strength - 1)) / (boost - 1) };
}

/** Колір 0xrrggbb, ближчий до білого на частку `t` (0 — той самий). */
export function whitened(color: number, t: number): number {
  return t <= 0 ? color : toHex(mix(rgb(color), WHITE, Math.min(1, t)));
}

const q = (v: number): number => Math.round(v * LIGHTMAP.steps);

/**
 * Ключ карти світла: той самий ключ — та сама картинка з точністю до кроку (`lightKey` доби, джерела з яскравістю й крок
 * мерехтіння, поки горять свічки). Перемальовують лише за новим ключем.
 */
export function lightmapKey(d: Daylight, sources: readonly LightSource[], time: number): string {
  let key = lightKey(d);
  let flicker = false;
  for (const source of sources) {
    key += `|${source.id}:${q(source.strength)}`;
    if (source.flicker !== undefined) flicker = true;
  }
  return flicker ? `${key}|f${flickerTime(time)}` : key;
}

/** Ключ смуг сонця на підлозі: стіна, сила й висота сонця (як у `lightKey`); сонця немає — "-". */
export function sunKey(d: Daylight): string {
  const sun = d.sun;
  if (!sun || sun.strength <= 0) return "-";
  return `${d.phase}|${sun.wall}${Math.round(sun.strength * 16)}:${Math.round(sun.elevation * 16)}`;
}
