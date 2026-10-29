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
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SLIP_CHANCE,
  STUN_MINUTES,
  STUN_PAUSE_MINUTES,
  WALK_TILES_PER_MINUTE,
} from "./config";
import { traitLevel } from "./cat";
import { dashHunger, firstWeekProtected } from "./character";
import { emit } from "./events";
import { cycleDash, cycleMove } from "./grooming";
import { moveFactor } from "./modifiers";
import { canDashWhenIll, illnessSpeed, isIll, maybeInjure } from "./illness";
import { observe } from "./knowledge";
import { visibleFloorNear } from "./catmove";
import { isSolid, SPAWN } from "./home";
import { hearSteps, loudNoise } from "./noise";
import { stateRng } from "./rng";
import { isDrowsy } from "./sleep";
import { absoluteMinute } from "./time";
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
  const inside = activity?.kind === "use" && activity.inside === true;
  return body.dashCooldown <= 0 && stats.health >= LOW_STAT && activity?.kind !== "work" && !inside && canDashWhenIll(state);
}

/**
 * Чому ривка немає надовго (§11.4, загальна ревізія 2026-10-29): застуда чи травма (§6.5) чи здоров'я нижче 25 (§6.3) — гравець
 * бачить причину, а не мовчазну кнопку. Перезарядка, робота за комп'ютером і душова кабіна — без відмови: ривок от-от повернеться, а
 * персонаж за комп'ютером чи в кабіні і так не рухається.
 */
function dashRefusal(state: GameState): "cold" | "injured" | "weak" | null {
  const { stats, activity } = state.character;
  if (activity?.kind === "work" || (activity?.kind === "use" && activity.inside === true)) return null;
  if (isIll(state, "cold")) return "cold";
  // Травма — без ривка, як застуда (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, дрібні питання — «Травма й ривок»).
  if (isIll(state, "injury")) return "injured";
  if (stats.health < LOW_STAT) return "weak";
  return null;
}

export function dash(state: GameState): boolean {
  if (state.end !== null) return false;
  if (!canDash(state)) {
    const reason = dashRefusal(state);
    if (reason !== null) emit(state, { type: "refused", object: "dash", reason });
    return false;
  }
  const character = state.character;
  const body = character.body;
  body.dash = DASH_MINUTES;
  body.dashCooldown = DASH_COOLDOWN_MINUTES * cycleDash(state);
  // Ривок — теж рух: тривалу дію (їжу, прибирання, пестощі, гру) він перериває, як джойстик (§10; загальна ревізія 2026-10-29 —
  // раніше дія добігала кінця за кілька клітинок від цілі). Роботу й душову кабіну відсікає canDash. Нова дія не почнеться, поки
  // кнопку не відпустили: holdSpent скидає tickActivity, щойно її відпустили.
  if (character.activity !== null) {
    character.activity = null;
    character.holdSpent = true;
  }
  dashHunger(state);
  emit(state, { type: "dash" });
  return true;
}

/**
 * Шанс збою керування за ігрову хвилину руху: від 0 при 25 до 40% при 0 (§6.3). Поки діє захист першого тижня (котів ще
 * не було), збоїв немає: відновити глузд ще нічим, і це виглядало б як зламане керування (§8.3; рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А2).
 */
export function glitchChance(state: GameState): number {
  const sanity = state.character.stats.sanity;
  if (sanity >= LOW_STAT || firstWeekProtected(state)) return 0;
  return (GLITCH_MAX_CHANCE_PER_MINUTE * (LOW_STAT - sanity)) / LOW_STAT;
}

/** Кіт треться об ноги: хоче уваги чи супроводжує персонажа, поруч і не тримає дистанції (§9.12). */
export function rubbingCat(state: GameState): Cat | null {
  const body = state.character.body;
  return (
    state.cats.find(
      (c) =>
        c.away === null &&
        (c.act.kind === "attention" || c.act.kind === "follow") &&
        traitLevel(c, "legs") >= 0 &&
        Math.hypot(c.x - body.x, c.y - body.y) < LEGS.distance,
    ) ?? null
  );
}

/**
 * Персонаж оглушений на пів хвилини: спіткнувся, посковзнувся, збило зумі (§9.12). Спільна пауза: від
 * попереднього оглушення минуло менше 5 хвилин — не валить з ніг (false), і той, хто кличе, нічого не показує.
 */
export function stun(state: GameState): boolean {
  // У душовій кабіні персонажа не збити з ніг: його там і не видно (перевірка побуту 2026-10-28: збивав кіт у «зумі»).
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.inside === true) return false;
  const body = state.character.body;
  const now = absoluteMinute(state.day, state.minute);
  if (body.stunAt !== undefined && now - body.stunAt < STUN_PAUSE_MINUTES) return false;
  body.stunAt = now;
  body.stun = Math.max(body.stun, STUN_MINUTES);
  body.dash = 0;
  // Упав — можна й травмуватися (§6.5); гупнув — гучний звук для котів поруч (§9.12).
  maybeInjure(state, stateRng(state, "behavior"));
  loudNoise(state, "fall", body);
  return true;
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
  const speed = WALK_TILES_PER_MINUTE * actionSpeed(state) * illnessSpeed(state) * cycleMove(state) * moveFactor(state) * magnitude * (dashing ? DASH_SPEED : 1) * (rubbing ? LEGS.slow : 1);
  const from = { x: body.x, y: body.y };
  slide(state, body, dir.x * speed * minutes, dir.y * speed * minutes);
  // Кроки поруч будять чуйних котів (§9.12).
  hearSteps(state, from);
  keptAway(state);
  const rng = stateRng(state, "behavior");
  if (rubbing) {
    const chance = LEGS.tripBase + LEGS.tripStep * traitLevel(rubbing, "legs");
    if (rng.chance(1 - (1 - chance) ** minutes) && stun(state)) {
      emit(state, { type: "tripped", cat: rubbing.id });
      // Раз на годину, спільно з «вісімкою» (§9.12 «Тертя об ноги»; крок 17, звірка з довідниками 2026-10-28).
      observe(state, rubbing, "legs", 1, false, MINUTES_PER_HOUR);
      return;
    }
  }
  // Шерстяна грудка й калюжа слизькі: ступив — може посковзнутися.
  for (const mess of state.home.messes) {
    if (mess.kind !== "hairball" && mess.kind !== "puddle") continue;
    const now = Math.hypot(mess.x - body.x, mess.y - body.y) < 0.35;
    const before = Math.hypot(mess.x - from.x, mess.y - from.y) < 0.35;
    if (now && !before && rng.chance(SLIP_CHANCE) && stun(state)) {
      emit(state, { type: "slipped", mess: mess.id });
      return;
    }
  }
}

/**
 * Персонаж проходить повз кота, що прийшов по увагу й сидить поруч, а той під ноги не лізе — прояв «Тертя об ноги −»,
 * раз на день (§9.12, рішення автора 2026-10-25).
 */
function keptAway(state: GameState): void {
  const body = state.character.body;
  for (const cat of state.cats) {
    if (cat.away !== null || (cat.act.kind !== "attention" && cat.act.kind !== "follow") || cat.act.goal !== null) continue;
    if (traitLevel(cat, "legs") >= 0 || Math.hypot(cat.x - body.x, cat.y - body.y) > LEGS.passBy) continue;
    observe(state, cat, "legs", -1, false, MINUTES_PER_DAY);
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

/**
 * Персонаж стоїть у речі (стара гра, збережена, коли на цьому місці ще нічого не стояло: шафа в спальні з'явилася 2026-10-26,
 * §9.12 «Лазіння») — переставити його на найближчу вільну клітинку, інакше він не зрушить з місця.
 */
export function unstickBody(state: GameState): void {
  const body = state.character.body;
  if (!overlapsSolid(state, body.x, body.y)) return;
  const free = visibleFloorNear(state, body);
  body.x = Math.floor(free.x) + 0.5;
  body.y = Math.floor(free.y) + 0.5;
}

function overlapsSolid(state: GameState, x: number, y: number): boolean {
  const r = BODY_RADIUS;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r - GAP); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r - GAP); tx++) {
      if (isSolid(state, tx, ty)) return true;
    }
  }
  return false;
}

// Рух по осях окремо: персонаж ковзає вздовж стіни, а не застрягає.
function slide(state: GameState, body: Body, dx: number, dy: number): void {
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUBSTEP_TILES);
  for (let i = 0; i < steps; i++) {
    body.x = moveAxis(body.x, dx / steps, (x) => overlapsSolid(state, x, body.y));
    body.y = moveAxis(body.y, dy / steps, (y) => overlapsSolid(state, body.x, y));
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
