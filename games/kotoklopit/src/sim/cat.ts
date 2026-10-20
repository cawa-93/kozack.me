// Модель кота (§9.1, §9.5–9.7, §7): створення, риси, приховані шкали настрою, здоров'я й любові,
// підсумок дня й тижня.

import { breedLevel, MIXED } from "./breeds";
import {
  ADAPTATION_DAYS,
  CAT_AGE_LIMIT,
  CAT_START,
  KITTEN_MAX_AGE,
  LOVE,
  LOVE_TRAIT_STEP,
  MAX_TRAITS,
  MOOD_HEALTH_DAMAGE,
  MOOD_HEALTH_RECOVERY,
  RECOVERY_BY_AGE,
  RECOVERY_TRAIT_STEP,
  STRESS_STEP,
  STRONG_TRAIT_CHANCE,
} from "./config";
import { emit } from "./events";
import { randomGenes, randomShape } from "./genetics";
import { pickCatName } from "./names";
import type { Rng } from "./rng";
import { characterLevel, levelOf, TRAIT_GROUPS, traitGroup } from "./traits";
import type { Cat, CatAct, CatSource, GameState, Sex } from "./types";

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

/** Скільки днів зберігати журнал втрат здоров'я: за тиждень обирається причина смерті (§9.7). */
const HEALTH_LOG_DAYS = 7;
/** Тиждень для щотижневої риси — 7 останніх днів історії настрою (§9.1). */
const WEEK_DAYS = 7;

/** Рівень параметра кота: риса характеру й порода разом, від −4 до +4 (§9.1, §9.11). */
export function traitLevel(cat: Pick<Cat, "traits" | "breed">, group: string): number {
  return clamp(characterLevel(cat, group) + breedLevel(cat.breed, group), -4, 4);
}

export function idleAct(minutes = 0): CatAct {
  return { kind: "idle", target: null, goal: null, minutes, elapsed: 0 };
}

export interface CatOptions {
  source: CatSource;
  ageWeeks: number;
  sex?: Sex;
  name?: string;
  breed?: [string, string];
  /** Скільки рис гравець бачить одразу: показав притулок чи розплідник (§9.9). */
  knownTraits?: number;
  /** Де кіт з'являється. */
  at?: { x: number; y: number };
}

/**
 * Новий кіт (§9.1): рис стільки, скільки тижнів, знак кожної — 50 на 50 (§9.1);
 * настрій і любов — за тим, звідки кіт (§9.6, §7).
 */
export function createCat(state: GameState, rng: Rng, options: CatOptions): Cat {
  const sex = options.sex ?? (rng.chance(0.5) ? "female" : "male");
  const born = options.source === "born";
  const start = born ? CAT_START.born : CAT_START.outside;
  const at = options.at ?? { x: 10.5, y: 10.5 };
  const cat: Cat = {
    id: state.nextId++,
    name: options.name ?? pickCatName(rng, sex, state.cats.map((c) => c.name)),
    sex,
    source: options.source,
    ageWeeks: options.ageWeeks,
    arrivedDay: state.day,
    traits: [],
    breed: options.breed ?? [MIXED, MIXED],
    genes: randomGenes(rng, sex),
    shape: randomShape(rng),
    health: 100,
    mood: start.mood,
    love: start.love,
    needs: { hunger: 50, thirst: 30, toilet: 30, fatigue: 30, attention: 40, play: 30 },
    moodHistory: [],
    moodToday: { sum: 0, minutes: 0 },
    interacted: false,
    healthLog: [],
    diseases: [],
    x: at.x,
    y: at.y,
    facing: 1,
    act: idleAct(),
    away: null,
    parents: { mother: null, father: null },
  };
  for (let i = 0; i < options.ageWeeks; i++) addTrait(cat, rng, 0.5);
  const known = Math.min(options.knownTraits ?? 0, cat.traits.length);
  for (const trait of cat.traits.slice(0, known)) trait.known = true;
  return cat;
}

/** Найбільше рис: 12, а «Довголіття» додає по половині тижня за одиницю (§9.1). */
export function maxTraits(cat: Cat): number {
  return MAX_TRAITS + Math.max(0, traitLevel(cat, "longevity")) / 2;
}

/**
 * Нова риса (§9.1): позитивна з імовірністю `positive`; група — серед тих, яких у кота ще немає;
 * сильна (±2) з імовірністю 30%. Повертає false, якщо додати нічого.
 */
export function addTrait(cat: Cat, rng: Rng, positive: number): boolean {
  const free = TRAIT_GROUPS.filter((g) => !cat.traits.some((t) => t.group === g.id));
  if (free.length === 0) return false;
  const group = free[rng.int(0, free.length - 1)];
  if (!group) return false;
  const good = rng.chance(positive);
  const sign = (good ? group.good : -group.good) as 1 | -1;
  cat.traits.push({ group: group.id, level: levelOf(sign, rng.chance(STRONG_TRAIT_CHANCE)), seen: 0, known: false });
  return true;
}

/** Кіт адаптується в новому домі перші 2 дні (§9.6). */
export function isAdapting(state: GameState, cat: Cat): boolean {
  return cat.source !== "born" && state.day - cat.arrivedDay < ADAPTATION_DAYS;
}

export function isKitten(cat: Cat): boolean {
  return cat.ageWeeks <= KITTEN_MAX_AGE;
}

export function isOld(cat: Cat): boolean {
  return cat.ageWeeks > CAT_AGE_LIMIT;
}

/** Змінити настрій кота. Втрати масштабує «Стресостійкість» (§9.12); причину бачить журнал. */
export function changeMood(state: GameState, cat: Cat, delta: number, reason?: string): void {
  const scaled = delta < 0 ? delta * Math.max(0, 1 - STRESS_STEP * traitLevel(cat, "stress")) : delta;
  cat.mood = clamp(cat.mood + scaled);
  if (reason) emit(state, { type: "cat-mood", cat: cat.id, delta: scaled, reason });
}

/** Змінити любов кота (§7): «Відданість» прискорює зростання, «Образливість» — втрати (§9.12). */
export function changeLove(state: GameState, cat: Cat, delta: number, reason?: string): void {
  const step = delta > 0 ? traitLevel(cat, "devotion") : traitLevel(cat, "touchy");
  const scaled = delta * Math.max(0, 1 + LOVE_TRAIT_STEP * step);
  cat.love = clamp(cat.love + scaled);
  if (reason) emit(state, { type: "cat-love", cat: cat.id, delta: scaled, reason });
}

/** Додати хвилини до середнього настрою дня (§9.6). */
export function recordMood(cat: Cat, minutes: number): void {
  cat.moodToday.sum += cat.mood * minutes;
  cat.moodToday.minutes += minutes;
}

/** Зміна здоров'я за день від середнього настрою (§9.6), без множників відновлення. */
export function moodHealth(average: number): number {
  for (const { atMost, health } of MOOD_HEALTH_DAMAGE) if (average <= atMost) return health;
  for (const { atLeast, health } of MOOD_HEALTH_RECOVERY) if (average >= atLeast) return health;
  return 0;
}

/** Множник відновлення здоров'я: вік і «Одужання» (§9.5). */
export function recoveryMultiplier(cat: Cat): number {
  const age = cat.ageWeeks <= KITTEN_MAX_AGE ? RECOVERY_BY_AGE.young : isOld(cat) ? RECOVERY_BY_AGE.old : RECOVERY_BY_AGE.adult;
  return age * Math.max(0, 1 + RECOVERY_TRAIT_STEP * traitLevel(cat, "recovery"));
}

/** Змінити здоров'я; втрати записуються з джерелом для причини смерті (§9.7). */
export function changeHealth(state: GameState, cat: Cat, delta: number, source: string): void {
  const before = cat.health;
  cat.health = clamp(cat.health + delta);
  const lost = before - cat.health;
  if (lost > 0) cat.healthLog.push({ day: state.day, source, amount: lost });
  cat.healthLog = cat.healthLog.filter((entry) => state.day - entry.day < HEALTH_LOG_DAYS);
}

export interface CatDay {
  cat: number;
  mood: number;
  health: number;
  love: number;
}

/**
 * Підсумок дня (§9.6, §7): середній настрій — в історію; день без взаємодії — любов −1;
 * дрейф настрою від любові; здоров'я від середнього настрою.
 */
export function closeCatDay(state: GameState, cat: Cat): CatDay {
  const { sum, minutes } = cat.moodToday;
  const average = minutes > 0 ? sum / minutes : cat.mood;
  cat.moodHistory.push(average);
  cat.moodToday = { sum: 0, minutes: 0 };
  const loveBefore = cat.love;
  if (!cat.interacted) changeLove(state, cat, LOVE.noInteractionPerDay);
  cat.interacted = false;
  cat.mood = clamp(cat.mood + (cat.love - 50) * LOVE.driftPerPoint);
  const healthBefore = cat.health;
  const change = moodHealth(average);
  changeHealth(state, cat, change > 0 ? change * recoveryMultiplier(cat) : change, "mood");
  const day: CatDay = { cat: cat.id, mood: average, health: cat.health - healthBefore, love: cat.love - loveBefore };
  emit(state, { type: "cat-day", ...day });
  return day;
}

/** Середній настрій за останні 7 днів (§9.1); без історії — поточний. */
export function weekMood(cat: Cat): number {
  const week = cat.moodHistory.slice(-WEEK_DAYS);
  return week.length > 0 ? week.reduce((a, b) => a + b, 0) / week.length : cat.mood;
}

/** Середня якість життя — середнє всіх записаних днів (§9.7). */
export function lifeMood(cat: Cat): number {
  return cat.moodHistory.length > 0 ? cat.moodHistory.reduce((a, b) => a + b, 0) / cat.moodHistory.length : cat.mood;
}

/** Ніч на понеділок (§4, §9.1): вік +1 і нова риса, знак — за середнім настроєм тижня. */
export function ageCat(state: GameState, cat: Cat, rng: Rng): void {
  cat.ageWeeks += 1;
  if (cat.traits.length >= Math.min(cat.ageWeeks, maxTraits(cat))) return;
  if (addTrait(cat, rng, weekMood(cat) / 100)) {
    const trait = cat.traits[cat.traits.length - 1];
    if (trait) emit(state, { type: "cat-trait", cat: cat.id, group: trait.group, level: trait.level, title: traitGroup(trait.group).title });
  }
}
