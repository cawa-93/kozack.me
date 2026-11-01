// Що грає кіт ізометричного вигляду цього кадру (крок 16, T1): поза й накладка з `catAnim`, поверх — разова анімація чи
// вираз (`catEventAnims`, `catTransition`), поки вона триває; з якою швидкістю грати ходу й біг, щоб лапи не ковзали; і
// висота стрибка на меблі й з них. Чисті розрахунки без Phaser (`tests/isocats.test.ts`), їх кличе частина котів
// (`cats.ts`).

import type { CatFace } from "../anim/catface";
import { CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId, type CatOneShotId } from "../anim/ids";
import type { CatAnimChoice } from "../pose";
import { catJumpLift, catLegLength, catRunRate, catWalkRate } from "../rig/anims/cat/basic";

/** Разова анімація чи вираз кота, що зараз грає. */
export interface CatShot {
  /** Анімація тіла чи накладка (`CAT_ONE_SHOT_MS`); null — лише вираз. */
  anim: CatOneShotId | null;
  /** Кадри обличчя поверх `catFace`; null — від `catFace`. */
  face: Partial<CatFace> | null;
  /** До якого часу сцени, мс. */
  until: number;
  /** Уже почалася (перший кадр її грає з початку). */
  started: boolean;
}

/** Разова від цього моменту на `ms` мс; нульова — нічого. */
export function startShot(anim: CatOneShotId | null, face: Partial<CatFace> | null, ms: number, time: number): CatShot | null {
  return ms > 0 ? { anim, face, until: time + ms, started: false } : null;
}

/** Що грати котові цього кадру (швидкість — `gaitRate`: хода й біг — за тим, як кіт іде на екрані, решта — 1). */
export interface CatPlay {
  anim: CatAnimId;
  overlay: CatAnimId | null;
  /** Разова щойно почалася: грати з початку, навіть якщо та сама вже грала. */
  restart: boolean;
  face: CatFace;
}

/**
 * Поза й накладка (`catAnim`) з обличчям (`catFace`), а поверх — разова, поки триває: анімація тіла (чухання, стрибок) замінює
 * позу, накладка (чхання, шипіння, задишка) — накладку пози; вираз — кадри обличчя. Повертає, що грати, і разову, що лишилася
 * (null — скінчилася).
 */
export function catPlay(choice: CatAnimChoice, face: CatFace, shot: CatShot | null, time: number): { play: CatPlay; shot: CatShot | null } {
  const play: CatPlay = { anim: choice.anim, overlay: choice.overlay, restart: false, face };
  if (!shot || time >= shot.until) return { play, shot: null };
  if (shot.anim !== null) {
    if (CAT_OVERLAYS.has(shot.anim)) play.overlay = shot.anim;
    else play.anim = shot.anim;
    play.restart = !shot.started;
  }
  if (shot.face) play.face = { ...face, ...shot.face };
  shot.started = true;
  return { play, shot };
}

// --- Хода й біг ----------------------------------------------------------------------------------
//
// Лапи стоять на підлозі, лише коли анімація ходи йде в такт тому, як кіт пересувається на екрані (N1: `catWalkRate`,
// `catRunRate`): швидкість відтворення — з його швидкості на екрані й довжини лап (`catLegLength` × масштаб кота: кошеня,
// порода, клубочок). Повільніша хода хворого чи повного (§9.5) — уже в тому, як повільно сим веде кота.

/**
 * Анімації ходи, у яких той самий цикл і крок, що в `walk` (рись N1): кульгає, незграбна й сумна хода (N3), несе в зубах
 * (N2) — тож і швидкість відтворення та сама, `catWalkRate`.
 */
export const WALK_GAITS: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["walk", "limp", "clumsy", "sadWalk", "carry"]);

/**
 * Далі за це (одиниці арту) за кадр — кота переставили (на руки, з рук, у пару), а не він пройшов: такий кадр швидкості не
 * змінює. Найшвидший кіт (зумі, ≈ 640 одиниць за секунду) за кадр 60 Гц проходить ≈ 11.
 */
export const GAIT_TELEPORT = 60;
/** За скільки мс згладжена швидкість доходить до нової на ≈ 63 %: кадри нерівні, і темп лап не має смикатися. */
export const GAIT_SMOOTH_MS = 80;

/**
 * Швидкість, з якою кіт іде на екрані для лап (одиниці арту за секунду; `dx`, `dy` — зсув точки підлоги під ним за `seconds`):
 * горизонтальна складова — лапи ходять уздовж кота, а на екрані він профілем; коли кіт іде майже прямовисно (вглиб чи до
 * камери), — вертикальна, інакше він плив би на нерухомих лапах. У сітці 2:1 уздовж осі клітинок горизонтальна вдвічі
 * більша за вертикальну, тож там це рівно «горизонтальна складова» `catWalkRate`.
 */
export function gaitSpeed(dx: number, dy: number, seconds: number): number {
  if (!(seconds > 0)) return 0;
  return Math.max(Math.abs(dx), Math.abs(dy)) / seconds;
}

/** Що частина котів пам'ятає між кадрами для темпу лап: де була точка підлоги під котом і згладжена швидкість. */
export interface GaitMemory {
  x: number;
  y: number;
  speed: number;
}

/**
 * Згладжена швидкість кота на екрані цього кадру (`GAIT_SMOOTH_MS`) з пам'яттю `mem` (null — перший кадр: стоїть). Нову
 * точку підлоги `x`, `y` записує в `mem` (той самий об'єкт — щокадру нічого не створюється); переставлений кіт
 * (`GAIT_TELEPORT`) швидкості не міняє.
 */
export function nextGait(mem: GaitMemory | null, x: number, y: number, seconds: number): GaitMemory {
  if (mem === null) return { x, y, speed: 0 };
  const dx = x - mem.x;
  const dy = y - mem.y;
  mem.x = x;
  mem.y = y;
  if (!(seconds > 0) || Math.hypot(dx, dy) > GAIT_TELEPORT) return mem;
  const k = 1 - Math.exp((-seconds * 1000) / GAIT_SMOOTH_MS);
  mem.speed += (gaitSpeed(dx, dy, seconds) - mem.speed) * k;
  return mem;
}

/**
 * Швидкість відтворення анімації кота: хода (`WALK_GAITS`) і біг — за швидкістю на екрані `speed` (одиниці арту за секунду)
 * і довжиною лап (`catLegLength(kitten, shortLegs)` × `scale` — масштаб спрайта кота), щоб лапи не ковзали; решта — 1.
 */
export function gaitRate(anim: CatAnimId, speed: number, kitten: number, shortLegs: boolean, scale: number): number {
  if (anim !== "run" && !WALK_GAITS.has(anim)) return 1;
  const leg = catLegLength(kitten, shortLegs) * scale;
  return anim === "run" ? catRunRate(speed, leg) : catWalkRate(speed, leg);
}

// --- Стрибок -----------------------------------------------------------------------------------

/** Стрибок на меблі й з них (`jumpUp`, `jumpDown`): скільки триває. */
export const JUMP = { ms: Math.max(CAT_ONE_SHOT_MS.jumpUp, CAT_ONE_SHOT_MS.jumpDown) } as const;

/** Висота кота над підлогою, що змінюється стрибком: звідки, куди й коли почалося. */
export interface Lift {
  from: number;
  to: number;
  start: number;
}

/**
 * Висота в момент `time`: від `from` до `to` за ходом стрибка N1 (`catJumpLift`: угору — як `jumpUp`, униз — як `jumpDown`;
 * анімація стрибка лише показує форму, а з висоти на висоту кота веде вигляд); після стрибка — `to`.
 */
export function liftAt(lift: Lift, time: number): number {
  if (lift.from === lift.to || time - lift.start >= JUMP.ms) return lift.to;
  const u = catJumpLift(lift.to > lift.from ? "jumpUp" : "jumpDown", Math.max(0, time - lift.start));
  return lift.from + (lift.to - lift.from) * u;
}

/**
 * Висота поверхні під котом у момент `time` — там його тінь: у стрибку тінь не злітає з котом, а лишається на підлозі чи на
 * верху меблів. На меблі тінь лишається на підлозі, поки кіт не долетів до їхнього верху, і тоді перескакує нагору; з меблів —
 * одразу на підлозі, куди кіт стрибає. Тінь ніколи не вища за кота.
 */
export function groundAt(lift: Lift, time: number): number {
  if (lift.to > lift.from && liftAt(lift, time) < lift.to) return lift.from;
  return lift.to;
}

/**
 * Нова висота кота: `target` — де він тепер (верх меблів чи підлога); `jumping` — між підлогою й меблями стрибають (на руки,
 * у переноску тощо — одразу). Повертає стан стрибка на наступний кадр і висоту зараз.
 */
export function nextLift(prev: Lift | null, target: number, jumping: boolean, time: number): { lift: Lift; now: number } {
  if (!jumping || prev === null) return { lift: { from: target, to: target, start: time - JUMP.ms }, now: target };
  if (prev.to === target) return { lift: prev, now: liftAt(prev, time) };
  const lift = { from: liftAt(prev, time), to: target, start: time };
  return { lift, now: liftAt(lift, time) };
}
