// Рух персонажа квартирою (§8.4): ходьба, ривок, зіткнення зі стінами й речами,
// збої керування (§6.3) і річ, на яку дивиться персонаж.

import {
  BODY_RADIUS,
  DASH_COOLDOWN_MINUTES,
  DASH_MINUTES,
  DASH_SPEED,
  DROWSY_SPEED,
  GLITCH_ANGLE_MAX,
  GLITCH_ANGLE_MIN,
  GLITCH_MAX_CHANCE_PER_MINUTE,
  GLITCH_MINUTES,
  INPUT_DEADZONE,
  LOW_STAT,
  LEGS,
  LOW_STAT_SPEED,
  SLIP_CHANCE,
  STUN_MINUTES,
  WALK_TILES_PER_MINUTE,
} from "./config";
import { traitLevel } from "./cat";
import { emit } from "./events";
import { cycleDash, cycleMove } from "./grooming";
import { canDashWhenIll, illnessSpeed, maybeInjure } from "./illness";
import { observe } from "./knowledge";
import { isSolid, SPAWN } from "./home";
import { stateRng } from "./rng";
import { isDrowsy } from "./sleep";
import type { Body, Cat, GameState, Vec } from "./types";

/** Найбільший крок перевірки зіткнень, щоб не проскочити крізь стіну. */
const SUBSTEP_TILES = 0.1;
const GAP = 1e-6;

export function newBody(): Body {
  return { x: SPAWN.x, y: SPAWN.y, facing: { x: 0, y: 1 }, dash: 0, dashCooldown: 0, glitch: 0, glitchAngle: 0, stun: 0 };
}

/**
 * Множник швидкості рухів і фізичних дій (§8.8, §6.3). Робота за комп'ютером від нього
 * не залежить: вона рахується годинами.
 */
export function actionSpeed(state: GameState): number {
  const { stats, sleepSpeed } = state.character;
  let speed = (1 + sleepSpeed) * (isDrowsy(state) ? DROWSY_SPEED : 1);
  if (stats.health < LOW_STAT) speed *= LOW_STAT_SPEED;
  if (stats.satiety < LOW_STAT) speed *= LOW_STAT_SPEED;
  return speed;
}

export function isMoving(move: Vec): boolean {
  return Math.hypot(move.x, move.y) >= INPUT_DEADZONE;
}

/** Ривок доступний після перезарядки; з низьким здоров'ям ривка немає (§6.3). */
export function canDash(state: GameState): boolean {
  const { body, stats, activity } = state.character;
  return body.dashCooldown <= 0 && stats.health >= LOW_STAT && activity?.kind !== "work" && canDashWhenIll(state);
}

export function dash(state: GameState): boolean {
  if (state.end !== null || !canDash(state)) return false;
  const body = state.character.body;
  body.dash = DASH_MINUTES;
  body.dashCooldown = DASH_COOLDOWN_MINUTES * cycleDash(state);
  emit(state, { type: "dash" });
  return true;
}

/** Шанс збою керування за ігрову хвилину руху: від 0 при 25 до 40% при 0 (§6.3). */
export function glitchChance(state: GameState): number {
  const sanity = state.character.stats.sanity;
  if (sanity >= LOW_STAT) return 0;
  return (GLITCH_MAX_CHANCE_PER_MINUTE * (LOW_STAT - sanity)) / LOW_STAT;
}

/** Кіт треться об ноги: хоче уваги, сидить поруч і не тримає дистанції (§9.12). */
export function rubbingCat(state: GameState): Cat | null {
  const body = state.character.body;
  return (
    state.cats.find(
      (c) =>
        c.away === null &&
        c.act.kind === "attention" &&
        traitLevel(c, "legs") >= 0 &&
        Math.hypot(c.x - body.x, c.y - body.y) < LEGS.distance,
    ) ?? null
  );
}

/** Персонаж оглушений на пів хвилини: спіткнувся, посковзнувся, збило зумі (§9.12). */
export function stun(state: GameState): void {
  const body = state.character.body;
  body.stun = Math.max(body.stun, STUN_MINUTES);
  body.dash = 0;
  // Упав — можна й травмуватися (§6.5).
  maybeInjure(state, stateRng(state, "behavior"));
}

/** Рух за ігрові хвилини. Під час ривка персонаж рухається вперед, навіть без керування. */
export function moveBody(state: GameState, move: Vec, minutes: number): void {
  const body = state.character.body;
  const dashing = body.dash > 0;
  body.dash = Math.max(0, body.dash - minutes);
  body.dashCooldown = Math.max(0, body.dashCooldown - minutes);
  body.glitch = Math.max(0, body.glitch - minutes);
  // Оглушений персонаж стоїть на місці (§9.12).
  if (body.stun > 0) {
    body.stun = Math.max(0, body.stun - minutes);
    return;
  }

  let dir: Vec;
  let magnitude: number;
  if (isMoving(move)) {
    magnitude = Math.min(1, Math.hypot(move.x, move.y));
    let angle = Math.atan2(move.y, move.x);
    rollGlitch(state, minutes);
    if (body.glitch > 0) angle += body.glitchAngle;
    dir = { x: Math.cos(angle), y: Math.sin(angle) };
    body.facing = dir;
  } else if (dashing) {
    dir = body.facing;
    magnitude = 1;
  } else {
    return;
  }
  // Кіт під ногами сповільнює й може змусити спіткнутися (§9.12).
  const rubbing = rubbingCat(state);
  const speed = WALK_TILES_PER_MINUTE * actionSpeed(state) * illnessSpeed(state) * cycleMove(state) * magnitude * (dashing ? DASH_SPEED : 1) * (rubbing ? LEGS.slow : 1);
  const from = { x: body.x, y: body.y };
  slide(body, dir.x * speed * minutes, dir.y * speed * minutes);
  const rng = stateRng(state, "behavior");
  if (rubbing) {
    const chance = LEGS.tripBase + LEGS.tripStep * traitLevel(rubbing, "legs");
    if (rng.chance(1 - (1 - chance) ** minutes)) {
      stun(state);
      emit(state, { type: "tripped", cat: rubbing.id });
      observe(state, rubbing, "legs");
      return;
    }
  }
  // Шерстяна грудка слизька: ступив на неї — може посковзнутися.
  for (const mess of state.home.messes) {
    if (mess.kind !== "hairball") continue;
    const now = Math.hypot(mess.x - body.x, mess.y - body.y) < 0.35;
    const before = Math.hypot(mess.x - from.x, mess.y - from.y) < 0.35;
    if (now && !before && rng.chance(SLIP_CHANCE)) {
      stun(state);
      emit(state, { type: "slipped", mess: mess.id });
      return;
    }
  }
}

/** Збої керування — поведінка, тож вони з потоку behavior (§6.1). */
function rollGlitch(state: GameState, minutes: number): void {
  const body = state.character.body;
  const chance = glitchChance(state);
  if (body.glitch > 0 || chance <= 0) return;
  const rng = stateRng(state, "behavior");
  if (!rng.chance(1 - (1 - chance) ** minutes)) return;
  const degrees = GLITCH_ANGLE_MIN + rng.next() * (GLITCH_ANGLE_MAX - GLITCH_ANGLE_MIN);
  const angle = ((rng.chance(0.5) ? 1 : -1) * degrees * Math.PI) / 180;
  body.glitch = GLITCH_MINUTES;
  body.glitchAngle = angle;
  emit(state, { type: "glitch", chance, angle: degrees });
}

function overlapsSolid(x: number, y: number): boolean {
  const r = BODY_RADIUS;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r - GAP); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r - GAP); tx++) {
      if (isSolid(tx, ty)) return true;
    }
  }
  return false;
}

// Рух по осях окремо: персонаж ковзає вздовж стіни, а не застрягає.
function slide(body: Body, dx: number, dy: number): void {
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUBSTEP_TILES);
  for (let i = 0; i < steps; i++) {
    body.x = moveAxis(body.x, dx / steps, (x) => overlapsSolid(x, body.y));
    body.y = moveAxis(body.y, dy / steps, (y) => overlapsSolid(body.x, y));
  }
}

function moveAxis(from: number, delta: number, blocked: (to: number) => boolean): number {
  const to = from + delta;
  if (delta === 0 || !blocked(to)) return to;
  // Упертися в межу клітинки, у яку не вдалося ввійти.
  const r = BODY_RADIUS;
  return delta > 0
    ? Math.max(from, Math.floor(to + r) - r - GAP)
    : Math.min(from, Math.floor(to - r) + 1 + r + GAP);
}
