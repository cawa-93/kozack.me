// Борода чоловічого персонажа (§5.1). Жіночого циклу немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4).

import { BEARD } from "./config";
import { emit } from "./events";
import type { GameState } from "./types";

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
