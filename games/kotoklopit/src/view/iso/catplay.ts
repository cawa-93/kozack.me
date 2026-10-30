// Що грає кіт ізометричного вигляду цього кадру (крок 16, T1): поза й накладка з `catAnim`, поверх — разова анімація чи
// вираз (`catEventAnims`, `catTransition`), поки вона триває; і висота стрибка на меблі й з них. Чисті розрахунки без Phaser
// (`tests/isocats.test.ts`), їх кличе частина котів (`cats.ts`).

import type { CatFace } from "../anim/catface";
import { CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId, type CatOneShotId } from "../anim/ids";
import type { CatAnimChoice } from "../pose";

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

/** Що грати котові цього кадру. */
export interface CatPlay {
  anim: CatAnimId;
  overlay: CatAnimId | null;
  /** Швидкість: хода — за швидкістю кота (`catAnim`), разова — як є. */
  speed: number;
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
  const play: CatPlay = { anim: choice.anim, overlay: choice.overlay, speed: choice.speed, restart: false, face };
  if (!shot || time >= shot.until) return { play, shot: null };
  if (shot.anim !== null) {
    if (CAT_OVERLAYS.has(shot.anim)) play.overlay = shot.anim;
    else {
      play.anim = shot.anim;
      play.speed = 1;
    }
    play.restart = !shot.started;
  }
  if (shot.face) play.face = { ...face, ...shot.face };
  shot.started = true;
  return { play, shot };
}

// --- Стрибок -----------------------------------------------------------------------------------

/** Стрибок на меблі й з них (`jumpUp`, `jumpDown`): скільки триває і наскільки вище дуга, одиниці арту. */
export const JUMP = { ms: CAT_ONE_SHOT_MS.jumpUp, arc: 14 } as const;

/** Висота кота над підлогою, що змінюється стрибком: звідки, куди й коли почалося. */
export interface Lift {
  from: number;
  to: number;
  start: number;
}

/** Висота в момент `time`: від `from` до `to` за `JUMP.ms` з дугою вгору; потім — `to`. */
export function liftAt(lift: Lift, time: number): number {
  const u = Math.min(1, Math.max(0, (time - lift.start) / JUMP.ms));
  if (u >= 1 || lift.from === lift.to) return lift.to;
  const ease = u * u * (3 - 2 * u);
  return lift.from + (lift.to - lift.from) * ease + Math.sin(u * Math.PI) * JUMP.arc;
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
