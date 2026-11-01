// Позначки ізометричного світу (крок 16, T4) — чисті розрахунки без Phaser: що зараз на екрані комп'ютера й де цей екран на
// моніторі, де висять смуги прогресу дії й плити та смужка пошуку роботи, пульс підсвітки цілі (§8.2, §8.6) і дуга, якою
// летять запаси з ящиків (§6.4). Малює це `marks.ts` (і `marksflight.ts`); перевіряє `tests/isomarks.test.ts`.

import { useProgress } from "../../sim/actions";
import { catOnComputer } from "../../sim/catai";
import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH, MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES } from "../../sim/config";
import { objectById } from "../../sim/home";
import { targetOf, type Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { isWorkday, isWorking, searchProgress } from "../../sim/work";
import { isoObjectLook } from "../world/objects";
import type { Point } from "../world/part";
import { ISO, ISO_TILE } from "../world/projection";
import { artOffset, objectScreen } from "./geometry";

// --- Підсвітка цілі (§8.2) ---------------------------------------------------------------------------

/**
 * Ціль, яку підсвічують цього кадру: та, з якою персонаж зараз щось зробить (`targetOf`), — лише поки він нічим не зайнятий
 * і гра не стоїть (як у старому вигляді).
 */
export function highlightTarget(state: GameState, blocked: boolean): Target | null {
  if (blocked || state.character.activity !== null) return null;
  return targetOf(state);
}

/** Пульс підсвітки 0,2–0,9 — той самий, що в старому вигляді: частини світу роблять з нього яскравість сяйва чи контуру. */
export function highlightPulse(time: number): number {
  return 0.55 + 0.35 * Math.sin(time / 180);
}

// --- Екран комп'ютера (§8.6) ---------------------------------------------------------------------------

/**
 * Що на екрані: `work` — робота (документ, що пишеться), `meeting` — летучка чи нарада (відеодзвінок), `search` — пошук
 * роботи (вакансії), `keyboard` — кіт сидить на клавіатурі (рядки однієї літери), `off` — нічого (монітор погашений, кадр
 * `env/computer` у стані `off`).
 */
export type ScreenShow = "off" | "work" | "meeting" | "search" | "keyboard";

/**
 * Летучка (10:00, 15 хвилин) чи нарада дня «Нарада» — у робочий день, як над комп'ютером у сцени (бабл дзвінка): звільненого
 * чи на лікарняному камера не чекає.
 */
export function callNow(state: GameState): boolean {
  if (!isWorkday(state)) return false;
  const standup = state.minute >= STANDUP_MINUTE && state.minute < STANDUP_MINUTE + STANDUP_MINUTES;
  const day = state.minute % 1440;
  const meeting = state.modifiers.day === "meeting" && day >= MODIFIERS.meeting.from && day < MODIFIERS.meeting.from + MODIFIERS.meeting.minutes;
  return standup || meeting;
}

/**
 * Що зараз на екрані. Кіт на клавіатурі — понад усе: він зупиняє роботу (§9.12, «Кіт і робота»), а екран від його лап
 * прокидається й друкує одну літеру. Сплячий на комп'ютері кіт екрана не вмикає.
 */
export function screenShow(state: GameState): ScreenShow {
  if (catOnComputer(state)?.act.kind === "keyboard") return "keyboard";
  if (!isWorking(state)) return "off";
  if (state.job.unemployed) return "search";
  return callNow(state) ? "meeting" : "work";
}

/**
 * Екран на моніторі: площина лицьової грані монітора (y = стала, бо стіл стоїть під стіною ряду 5 і дивиться в кімнату), тож
 * його горизонталь іде вздовж осі x — на екрані гри праворуч-униз, а вертикаль — угору.
 */
export interface ScreenQuad {
  /** Середина екрана (точка `screen` запису `env/computer`), px світу. */
  readonly center: Point;
  /** Півширина: від середини до правого краю вздовж горизонталі монітора, px світу. */
  readonly u: Point;
  /** Піввисота: від середини до верхнього краю, px світу. */
  readonly v: Point;
}

/**
 * Запасний розмір скла, поки в маніфесті немає його кутів: півширина в клітинках уздовж x і піввисота в одиницях арту
 * (монітор — від стільниці 54 до 112, скло ≈ 0,6 клітинки × 32 з серединою на висоті 86); трохи менший за скло.
 */
export const SCREEN_HALF = { cells: 0.27, height: 15 } as const;
/** На стільки зміст відступає від кутів скла: половина чорнильної лінії довкола скла (2,5) лишається видною. */
export const GLASS_INSET = 1.5;
/** Кути скла в маніфесті (`env/computer`, A4): лівий і правий верхні, лівий і правий нижні. */
const GLASS_CORNERS = ["screen-tl", "screen-tr", "screen-bl", "screen-br"] as const;

/**
 * Скло екрана монітора: за кутами `screen-tl`/`-tr`/`-bl`/`-br` запису `env/computer` (зсув від pivot речі), відступивши на
 * `GLASS_INSET`, а поки їх немає — довкола точки `screen` (без неї — над серединою стола на висоті 86) розміру `SCREEN_HALF`.
 */
export function computerScreen(): ScreenQuad {
  const at = objectScreen(objectById("computer"));
  const corners = GLASS_CORNERS.map((name) => artOffset("env/computer", name));
  const [tl, tr, bl, br] = corners;
  if (tl && tr && bl && br) {
    const u = { x: (tr.x - tl.x + br.x - bl.x) / 4, y: (tr.y - tl.y + br.y - bl.y) / 4 };
    const v = { x: (tl.x - bl.x + tr.x - br.x) / 4, y: (tl.y - bl.y + tr.y - br.y) / 4 };
    return {
      center: { x: at.x + (tl.x + tr.x + bl.x + br.x) / 4, y: at.y + (tl.y + tr.y + bl.y + br.y) / 4 },
      u: shorter(u, GLASS_INSET),
      v: shorter(v, GLASS_INSET),
    };
  }
  const offset = artOffset("env/computer", "screen") ?? { x: 0, y: -86 };
  const half = SCREEN_HALF.cells;
  return {
    center: { x: at.x + offset.x, y: at.y + offset.y },
    u: { x: (half * ISO_TILE.width) / 2, y: (half * ISO_TILE.height) / 2 },
    v: { x: 0, y: -SCREEN_HALF.height },
  };
}

/** Той самий вектор, коротший на `by`. */
function shorter(p: Point, by: number): Point {
  const length = Math.hypot(p.x, p.y);
  const k = length > by ? (length - by) / length : 0;
  return { x: p.x * k, y: p.y * k };
}

/**
 * Куток скла, який зміст лишає порожнім: у лівому верхньому куті монітора (A4) приліплена записка, що заходить на скло, —
 * зміст її не закриває (координати екрана: ліворуч від `s`, вище за `t`).
 */
export const NOTE_CORNER = { s: -0.6, t: 0.66 } as const;

/** Точка на екрані за координатами (−1…1 праворуч, −1…1 угору від середини). */
export function onScreen(quad: ScreenQuad, s: number, t: number): Point {
  return { x: quad.center.x + quad.u.x * s + quad.v.x * t, y: quad.center.y + quad.u.y * s + quad.v.y * t };
}

/** Чотирикутник на екрані від (s0, t0) до (s1, t1): лівий верхній, правий верхній, правий нижній, лівий нижній кути. */
export function screenRect(quad: ScreenQuad, s0: number, t0: number, s1: number, t1: number): Point[] {
  return [onScreen(quad, s0, t1), onScreen(quad, s1, t1), onScreen(quad, s1, t0), onScreen(quad, s0, t0)];
}

// --- Смуги (§8.2, §8.6) --------------------------------------------------------------------------------------

/**
 * Смуга прогресу, одиниці арту: ширина й висота заливки, товщина чорнильної рамки (`LINE.inner`). На масштабі гри ≈ 0,72 px
 * CSS на одиницю — ≈ 52 × 10 px, як смуга старого вигляду на телефоні.
 */
export const BAR = { width: 72, height: 10, ink: 3.5 } as const;
/** Смужка пошуку роботи: ширша, з кружечками етапів на межах. */
export const SEARCH_BAR = { width: 132, height: 10, ink: 3.5, stage: 7 } as const;
/** Відступ смуги від якоря (точки бабла над річчю): смуга висить під ним, над верхом речі, а бабл — над нею. */
export const BAR_GAP = 4;
/** Скільки триває червона смужка відмови в пошуку роботи (§8.6), мс. */
export const REJECTION_MS = 1500;

/** Прямокутник смуги на екрані, px світу: x, y — лівий верхній кут заливки. */
export interface BarBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Де смуга під якорем `anchor` (точка бабла над річчю): по центру, під ним. */
export function barBox(anchor: Point, size: { width: number; height: number; ink: number }): BarBox {
  return { x: anchor.x - size.width / 2, y: anchor.y + BAR_GAP + size.ink, w: size.width, h: size.height };
}

/** На стільки одиниць арту середина смуги плити нижча за верх її лицьової грані (стільницю). */
export const STOVE_BAR_DROP = 18;

/**
 * Смуга плити (§8.7) — на лицьовій грані плити, під стільницею, як у старому вигляді: над плитою висить бабл страви, а сама
 * страва (A2 малює її сирою, готовою й пригорілою) — на конфорці, і смуга під якорем закривала б її. Середина — посередині
 * грані (вона дивиться в кімнату, y = y1 сліду).
 */
export function stoveBarBox(stove: { id: string }): BarBox {
  const look = isoObjectLook(stove.id);
  const f = look.footprint;
  const front = ISO.toScreen({ x: (f.x0 + f.x1) / 2, y: f.y1 });
  const middle = front.y - look.top + STOVE_BAR_DROP;
  return { x: front.x - BAR.width / 2, y: middle - BAR.height / 2, w: BAR.width, h: BAR.height };
}

/** Рамка монітора довкола скла: стільки одиниць арту від верхнього краю екрана до верху монітора. */
export const SCREEN_BEZEL = 8;

/**
 * Смужка пошуку роботи над монітором (§8.6): під якорем стола, як інші смуги, але не нижче за верх монітора — екран
 * похилий (лівий край вищий), і смуга під якорем налазила б на нього; персонаж за столом її не закриває.
 */
export function searchBarBox(anchor: Point, quad: ScreenQuad): BarBox {
  const box = barBox(anchor, SEARCH_BAR);
  const top = Math.min(onScreen(quad, -1, 1).y, onScreen(quad, 1, 1).y) - SCREEN_BEZEL;
  const lowest = top - BAR_GAP - SEARCH_BAR.ink - box.h;
  return { ...box, y: Math.min(box.y, lowest) };
}

/** Смуга тривалої дії (§8.2): над її ціллю, скільки зроблено (0–1). */
export function actionBar(state: GameState): { target: string; value: number } | null {
  const progress = useProgress(state);
  const activity = state.character.activity;
  if (progress === null || activity?.kind !== "use") return null;
  return { target: activity.target, value: progress };
}

/**
 * Смуга плити (§8.7): поки страва готується — зелена, скільки зварилося; готова — червона, скільки лишилося до «підгоріло».
 * Підгоріла чи порожня — смуги немає.
 */
export function stoveBar(state: GameState): { value: number; danger: boolean } | null {
  const stove = state.home.stove;
  if (!stove.item || stove.item.kind === "burnt") return null;
  const cooking = stove.item.kind === "raw";
  const value = cooking ? stove.minutes / COOK_MINUTES : (stove.minutes - COOK_MINUTES) / (BURN_MINUTES[state.difficulty] - COOK_MINUTES);
  return { value: clamp01(value), danger: !cooking };
}

/** Остання відмова в пошуку роботи: коли (мс сцени) і на якому місці смужки (0–1). */
export interface Rejection {
  at: number;
  end: number;
}

/**
 * Смужка пошуку роботи (§8.6): етапи поточної вакансії; півтори секунди після відмови — червона, до місця, де все
 * скінчилося. Лише для безробітного.
 */
export function searchBar(state: GameState, rejection: Rejection | null, time: number): { value: number; stages: number; rejected: boolean } | null {
  if (!state.job.unemployed) return null;
  const rejected = rejection !== null && time - rejection.at < REJECTION_MS;
  const value = rejected ? rejection.end : searchProgress(state).progress;
  return { value: clamp01(value), stages: JOB_SEARCH.stages, rejected };
}

/** Відмова з вакансії `vacancy` (подія `job-rejected`): смужка червона до кінця k-го етапу (k-та вакансія — k етапів). */
export function rejectionAt(vacancy: number, time: number): Rejection {
  return { at: time, end: vacancy / JOB_SEARCH.stages };
}

/** Кружечок етапу `i` (1…stages): пройдений, де скінчилася відмова, чи ще попереду. */
export function stageMark(value: number, stages: number, i: number, rejected: boolean): "passed" | "failed" | "ahead" {
  const mark = i / stages;
  if (rejected && Math.abs(value - mark) < 1e-6) return "failed";
  return value >= mark - 1e-6 ? "passed" : "ahead";
}

// --- Політ запасів (§6.4, §9.12) ---------------------------------------------------------------------------

/** Політ іконки запасу: розмір іконки (одиниці арту), тривалість (мс) і найменша та найбільша висота дуги. */
export const FLIGHT = { icon: 56, ms: 900, arcMin: 120, arcMax: 260, arcShare: 0.35 } as const;

/**
 * Висота дуги між точками: пропорційна відстані (в ізометрії квартира вдвічі більша за старий вигляд, і стала дуга була б
 * пласкою), але в межах `arcMin…arcMax`.
 */
export function flightArc(from: Point, to: Point): number {
  return Math.min(FLIGHT.arcMax, Math.max(FLIGHT.arcMin, Math.hypot(to.x - from.x, to.y - from.y) * FLIGHT.arcShare));
}

/** Де іконка на частці шляху `t` (0–1): прямо від `from` до `to` і вгору дугою `arc`. */
export function flightPoint(from: Point, to: Point, t: number, arc = flightArc(from, to)): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc };
}

/**
 * Масштаб іконки в польоті: вискакує з ящика (0,6 → 1 за першу п'яту шляху) і пірнає у сховище (1 → 0,55 за останню п'яту).
 */
export function flightScale(t: number): number {
  const edge = 0.2;
  if (t < edge) return 0.6 + 0.4 * easeOut(t / edge);
  if (t > 1 - edge) return 1 - 0.45 * easeIn((t - (1 - edge)) / edge);
  return 1;
}

/** Нахил іконки в польоті, радіани: хитається, як кинута річ, і приземляється рівно. */
export function flightTilt(t: number): number {
  return Math.sin(t * Math.PI * 2) * 0.18 * (1 - t);
}

// --- Допоміжне ---------------------------------------------------------------------------------------------

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t;
