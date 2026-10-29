// Особливості персонажів (§5.1, §4.1): жіночий цикл і борода чоловічого персонажа.

import { BEARD, CYCLE } from "./config";
import { emit } from "./events";
import type { GameState } from "./types";

/** День циклу 1–28 (§4.1). */
export function cycleDay(state: GameState): number {
  const days = CYCLE.days;
  return ((((state.day - state.character.cycleStart) % days) + days) % days) + 1;
}

export type CyclePhase = "period" | "energy" | null;

/** Фаза циклу: менструація, приплив енергії чи без ефектів; лише жіночий персонаж. */
export function cyclePhase(state: GameState): CyclePhase {
  if (state.character.sex !== "female") return null;
  const day = cycleDay(state);
  if (day >= CYCLE.period.from && day <= CYCLE.period.to) return "period";
  if (day >= CYCLE.energy.from && day <= CYCLE.energy.to) return "energy";
  return null;
}

/** Множник руху від циклу (§4.1). */
export function cycleMove(state: GameState): number {
  const phase = cyclePhase(state);
  return phase === null ? 1 : CYCLE[phase].move;
}

/** Множник «ціни» ривка — перезарядки (§4.1). */
export function cycleDash(state: GameState): number {
  const phase = cyclePhase(state);
  return phase === null ? 1 : CYCLE[phase].dash;
}

/** Множник падіння гігієни (§4.1): під час менструації — швидше. */
export const cycleHygiene = (state: GameState): number => (cyclePhase(state) === "period" ? CYCLE.period.hygiene : 1);

export type BeardLook = "clean" | "neat" | "stubble" | "unkempt";

/**
 * Вигляд бороди (§5.1): після гоління охайно 2 дні, далі щетина неохайна; через 4 дні борода
 * відросла — підрівняна охайна 3 дні, інакше неохайна.
 */
export function beardLook(state: GameState): BeardLook {
  const { shaved, trimmed } = state.character.beard;
  const since = state.day - shaved;
  if (since < BEARD.neatAfterShave) return "clean";
  if (since < BEARD.grows) return "stubble";
  return state.day - trimmed < BEARD.neatAfterTrim ? "neat" : "unkempt";
}

/** Чи доглянутий вигляд на відеодзвінку: +1 охайний, −1 неохайний, 0 — жіночий персонаж. */
export function beardImpression(state: GameState): number {
  if (state.character.sex !== "male") return 0;
  const look = beardLook(state);
  return look === "clean" || look === "neat" ? BEARD.impression : -BEARD.impression;
}

/**
 * Поголитися (будь-коли, але раз на день) чи підрівняти відрослу бороду (§5.1). Повертає хвилини дії або null. Удруге того самого
 * дня — null: вигляд від цього не змінюється, а час ішов би даремно (загальна ревізія 2026-10-29).
 */
export function groomBeard(state: GameState, kind: "shave" | "trim"): number | null {
  if (!canGroomBeard(state, kind)) return null;
  const beard = state.character.beard;
  if (kind === "trim") beard.trimmed = state.day;
  else beard.shaved = state.day;
  emit(state, { type: "beard", kind });
  return kind === "trim" ? BEARD.trimMinutes : BEARD.shaveMinutes;
}

/** Чи має сенс поголитися чи підрівняти бороду зараз (§5.1): підрівнюють відрослу, і те, й те — не вдруге за день. */
export function canGroomBeard(state: GameState, kind: "shave" | "trim"): boolean {
  if (state.character.sex !== "male") return false;
  const { shaved, trimmed } = state.character.beard;
  if (kind === "shave") return shaved !== state.day;
  return state.day - shaved >= BEARD.grows && trimmed !== state.day;
}
