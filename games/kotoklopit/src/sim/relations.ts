// Стосунки між котами (§9.4): прихована шкала пари −100…+100, друзі й вороги.
// Поведінку друзів і ворогів (ігри, вилизування, бійки) веде `catai.ts`.

import { daysAtHome, isKitten, traitLevel } from "./cat";
import { KITTEN_MAX_AGE, NURTURING, RELATIONS } from "./config";
import { weekOf } from "./time";
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
/** Приятелі чи друзі (§9.4, рішення автора 2026-10-26, Г1): від +20 коти граються разом. */
export const isPal = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) >= RELATIONS.pal;
export const isEnemy = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) <= RELATIONS.enemy;

/**
 * Новий дорослий кіт (§9.4 «Хто з ким грається», рішення автора 2026-10-26, Б5 а): прийшов ззовні (не народився вдома) не
 * кошеням і живе тут менше 2 днів. Кіт, якого сценарій чи тест додає «давнім» (день появи в минулому), — не новий. Кошеня, що
 * подорослішало за ці 2 дні (вік росте в ніч на понеділок, §9.1), — теж: прийшло воно кошеням (перевірка блоку 2: кошеня від
 * заводчика, взяте в неділю, з понеділка вважалося новим дорослим котом, і на нього шипіли).
 */
export function isNewcomer(state: GameState, cat: Cat): boolean {
  if (cat.source === "born" || daysAtHome(state, cat) >= RELATIONS.newcomer.days) return false;
  // Вік у день появи: відтоді він ріс щоночі на понеділок. Кіт, що з'явився вночі, має днем появи наступний — тоді різниця
  // від'ємна, тож не менше нуля.
  const grew = Math.max(0, weekOf(state.day) - weekOf(cat.arrivedDay));
  return cat.ageWeeks - grew > KITTEN_MAX_AGE;
}

/** Початкові стосунки нового кота з кожним, хто вже живе вдома (§9.4). */
export function initRelations(state: GameState, cat: Cat): void {
  const newcomer = isNewcomer(state, cat);
  for (const other of state.cats) {
    if (other.id === cat.id) continue;
    const sociability = traitLevel(cat, "sociability") + traitLevel(other, "sociability");
    // Новий дорослий кіт — з легкої ворожості, −30…−10 (рішення автора 2026-10-26, Б5 а).
    let value = newcomer ? RELATIONS.newcomer.start + RELATIONS.newcomer.sociabilityStep * sociability : sociability * RELATIONS.sociabilityStep;
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
    if (a === cat.id || b === cat.id) {
      delete state.relations[k];
      if (state.strife) delete state.strife[k];
    }
  }
}

/**
 * Пара сьогодні сварилася за ресурс (сварка за миску чи лоток, охорона) чи билася (§9.4 «Згода, охорона й сварки», рішення автора
 * 2026-10-26, Б6): уночі від цього залежить зближення.
 */
export function noteStrife(state: GameState, a: Cat, b: Cat, kind: "quarrel" | "fight"): void {
  if (a.id === b.id) return;
  ((state.strife ??= {})[key(a.id, b.id)] ??= {})[kind] = true;
}

/**
 * Ніч: життя разом потроху зближує (§9.4) — пару, що того дня не сварилася; вороги, що ані билися, ані сварилися, зближуються
 * ще (Б6). Потім день сварок починається заново.
 */
export function nightlyRelations(state: GameState): void {
  for (const k of Object.keys(state.relations)) {
    const [a, b] = k.split("-").map(Number);
    const cats = state.cats.filter((c) => c.id === a || c.id === b);
    // «Товариськість» діє щодня, а не лише в мить знайомства (рішення автора 2026-10-25).
    const sociability = cats.reduce((sum, c) => sum + traitLevel(c, "sociability"), 0) * RELATIONS.sociabilityNightly;
    const value = state.relations[k] ?? 0;
    const strife = state.strife?.[k];
    const together = strife?.quarrel === true ? 0 : RELATIONS.nightly;
    const calm = value <= RELATIONS.enemy && strife === undefined ? RELATIONS.enemyCalm : 0;
    state.relations[k] = clamp(value + together + sociability + calm);
  }
  delete state.strife;
}
