// Стосунки між котами (§9.4): прихована шкала пари −100…+100, друзі й вороги.
// Поведінку друзів і ворогів (ігри, вилизування, бійки) веде `catai.ts`.

import { isKitten, traitLevel } from "./cat";
import { NURTURING, RELATIONS } from "./config";
import type { Cat, GameState } from "./types";

const clamp = (value: number): number => Math.min(100, Math.max(-100, value));

const key = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function relation(state: GameState, a: Cat, b: Cat): number {
  return state.relations[key(a.id, b.id)] ?? 0;
}

export function changeRelation(state: GameState, a: Cat, b: Cat, delta: number): void {
  if (a.id === b.id) return;
  const k = key(a.id, b.id);
  state.relations[k] = clamp((state.relations[k] ?? 0) + delta);
}

export const isFriend = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) >= RELATIONS.friend;
export const isEnemy = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) <= RELATIONS.enemy;

/** Початкові стосунки нового кота з кожним, хто вже живе вдома (§9.4). */
export function initRelations(state: GameState, cat: Cat): void {
  for (const other of state.cats) {
    if (other.id === cat.id) continue;
    let value = (traitLevel(cat, "sociability") + traitLevel(other, "sociability")) * RELATIONS.sociabilityStep;
    // З кошеням дорослі ладнають легше, а «Турбота про кошенят» дорослого — ще й ±10 за одиницю (§9.12).
    if (isKitten(cat) !== isKitten(other)) value += RELATIONS.kittenBonus + NURTURING.relationStep * traitLevel(isKitten(cat) ? other : cat, "nurturing");
    const mother = cat.parents.mother === other.id || other.parents.mother === cat.id;
    const siblings = cat.parents.mother !== null && cat.parents.mother === other.parents.mother;
    if (mother) value += RELATIONS.motherKitten;
    else if (siblings) value += RELATIONS.siblings;
    state.relations[key(cat.id, other.id)] = clamp(value);
  }
}

/** Кота більше немає вдома: його стосунки зникають. */
export function forgetRelations(state: GameState, cat: Cat): void {
  for (const k of Object.keys(state.relations)) {
    const [a, b] = k.split("-").map(Number);
    if (a === cat.id || b === cat.id) delete state.relations[k];
  }
}

/** Ніч: життя разом потроху зближує (§9.4). */
export function nightlyRelations(state: GameState): void {
  for (const k of Object.keys(state.relations)) {
    const [a, b] = k.split("-").map(Number);
    const cats = state.cats.filter((c) => c.id === a || c.id === b);
    // «Товариськість» діє щодня, а не лише в мить знайомства (рішення автора 2026-10-25).
    const sociability = cats.reduce((sum, c) => sum + traitLevel(c, "sociability"), 0) * RELATIONS.sociabilityNightly;
    state.relations[k] = clamp((state.relations[k] ?? 0) + RELATIONS.nightly + sociability);
  }
}
