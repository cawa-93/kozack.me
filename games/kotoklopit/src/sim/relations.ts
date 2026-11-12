// Стосунки між котами (§9.4): прихована шкала пари −100…+100, друзі й вороги.
// Поведінку друзів і ворогів (ігри, вилизування, бійки) веде `catai.ts`.

import { daysAtHome, isKitten, traitLevel } from "./cat";
import { feudDrop, peaceNightlyFactor } from "./catfeud";
import { KITTEN_MAX_AGE, NURTURING, RELATIONS } from "./config";
import type { Cat, GameState } from "./types";

const clamp = (value: number): number => Math.min(100, Math.max(-100, value));

/** Номери котів, для яких ключ пари пам'ятається: у грі їх стільки не буває, а більші не збігаються з меншими. */
const KEY_SPAN = 2 ** 26;
const keys = new Map<number, string>();

/**
 * Ключ пари в `relations`. Рядок пам'ятаємо: стосунки пар котів читаються щокадру, а свіжозібраний рядок щоразу ще й
 * хешується заново для пошуку.
 */
function key(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (!Number.isInteger(lo) || lo < 0 || hi >= KEY_SPAN) return `${lo}-${hi}`;
  const n = lo * KEY_SPAN + hi;
  let k = keys.get(n);
  if (k === undefined) {
    k = `${lo}-${hi}`;
    keys.set(n, k);
  }
  return k;
}

export function relation(state: GameState, a: Cat, b: Cat): number {
  return state.relations[key(a.id, b.id)] ?? 0;
}

export function changeRelation(state: GameState, a: Cat, b: Cat, delta: number): void {
  if (a.id === b.id) return;
  const k = key(a.id, b.id);
  state.relations[k] = clamp((state.relations[k] ?? 0) + feudDrop(state, k, delta));
}

export const isFriend = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) >= RELATIONS.friend;
/** Приятелі чи друзі (§9.4, рішення автора 2026-10-26, Г1): від +20 коти граються разом. */
export const isPal = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) >= RELATIONS.pal;
export const isEnemy = (state: GameState, a: Cat, b: Cat): boolean => relation(state, a, b) <= RELATIONS.enemy;

/**
 * Новий дорослий кіт (§9.4 «Хто з ким грається», рішення автора 2026-10-26, Б5 а): прийшов ззовні (не народився вдома) не
 * кошеням і живе тут менше 2 днів. Кіт, якого сценарій чи тест додає «давнім» (день появи в минулому), — не новий. За ці 2 дні
 * кіт не старшає: вік росте раз на 7 днів від дня появи (§9.1, рішення автора 2026-10-27), тож вік зараз — і вік у день появи.
 */
export function isNewcomer(state: GameState, cat: Cat): boolean {
  if (cat.source === "born" || cat.ageWeeks <= KITTEN_MAX_AGE) return false;
  return daysAtHome(state, cat) < RELATIONS.newcomer.days;
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
 * 2026-10-26, Б6): уночі від цього залежить зближення: і сварка, і бійка однаково забирають нічні +3 (А12 (2)).
 */
export function noteStrife(state: GameState, a: Cat, b: Cat, kind: "quarrel" | "fight"): void {
  if (a.id === b.id) return;
  ((state.strife ??= {})[key(a.id, b.id)] ??= {})[kind] = true;
}

/**
 * Ніч: життя разом потроху зближує (§9.4) — пару, що того дня ані сварилася, ані билася; такі вороги зближуються ще (Б6, А12).
 * Потім день сварок починається заново.
 */
export function nightlyRelations(state: GameState): void {
  for (const k of Object.keys(state.relations)) {
    const [a, b] = k.split("-").map(Number);
    const cats = state.cats.filter((c) => c.id === a || c.id === b);
    // «Товариськість» діє щодня, а не лише в мить знайомства (рішення автора 2026-10-25).
    const sociability = cats.reduce((sum, c) => sum + traitLevel(c, "sociability"), 0) * RELATIONS.sociabilityNightly;
    const value = state.relations[k] ?? 0;
    // Сварка (Б6 (3)) і бійка (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А12 (2): раніше бійка лишала нічні +3, і для
    // стосунків була дешевша за шипіння біля миски) однаково забирають життя разом, а ворогам — і надбавку за спокійний день.
    const peaceful = state.strife?.[k] === undefined;
    const together = peaceful ? RELATIONS.nightly * peaceNightlyFactor(state) : 0;
    const calm = peaceful && value <= RELATIONS.enemy ? RELATIONS.enemyCalm : 0;
    state.relations[k] = clamp(value + together + sociability + calm);
  }
  delete state.strife;
}
