// Модель кота (§9.1, §9.5–9.7, §7): створення, риси, приховані шкали настрою, здоров'я й любові,
// підсумок дня й тижня.

import { breedById, breedLevel, MIXED } from "./breeds";
import {
  INHERIT_TRAIT_CHANCE,
  ADAPTATION_BRAVERY,
  ADAPTATION_DAYS,
  CAT_AGE_LIMIT,
  CAT_START,
  KITTEN_MAX_AGE,
  LOVE,
  LOVE_TRAIT_STEP,
  MAX_TRAITS,
  MINUTES_PER_DAY,
  MOOD_HEALTH_DAMAGE,
  MOOD_HEALTH_RECOVERY,
  RECOVERY_BY_AGE,
  RECOVERY_TRAIT_STEP,
  STRESS_EFFECTS,
  STRESS_STEP,
  MOOD_SATURATION,
  TOUCHY,
  STRONG_TRAIT_CHANCE,
  WEIGHT,
} from "./config";
import { emit } from "./events";
import { applyBreedLook, randomGenes, randomShape } from "./genetics";
import { pickCatName } from "./names";
import { absoluteMinute } from "./time";
import type { Rng } from "./rng";
import { characterLevel, isPositive, levelOf, TRAIT_GROUPS, traitGroup } from "./traits";
import type { Cat, CatAct, CatSource, GameState, Sex, Trait } from "./types";

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

/** Скільки днів зберігати журнал втрат здоров'я: за тиждень обирається причина смерті (§9.7). */
const HEALTH_LOG_DAYS = 7;
/** Тиждень для щотижневої риси — 7 останніх днів історії настрою (§9.1). */
const WEEK_DAYS = 7;

/** Рівень параметра кота: риса характеру й порода разом, від −4 до +4 (§9.1, §9.11). */
export function traitLevel(cat: Pick<Cat, "traits" | "breed">, group: string): number {
  return clamp(characterLevel(cat, group) + breedLevel(cat.breed, group), -4, 4);
}

/** Вага кота 0–100 (§9.12, «Схильність до повноти»): без поля — норма. */
export const weightOf = (cat: Pick<Cat, "weight">): number => cat.weight ?? WEIGHT.norm;

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
    groomedUntil: -1,
    sterilized: false,
    sterilizedKnown: false,
    recoveryUntil: -1,
    heatUntil: -1,
    nextHeat: -1,
    pregnancy: null,
    litters: 0,
    restUntil: -1,
    breedKnown: [false, false],
    collar: null,
    treatsToday: 0,
    hurt: null,
    bathedDay: state.day,
    x: at.x,
    y: at.y,
    facing: 1,
    act: idleAct(),
    away: null,
    parents: { mother: null, father: null },
  };
  // Зовнішність породи поверх випадкових генів (§9.11).
  const [a, b] = cat.breed;
  const pure = a === b && a !== MIXED;
  for (const half of pure ? [a] : [a, b]) if (half !== MIXED) applyBreedLook(rng, cat.genes, cat.shape, breedById(half), pure);
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
export function addTrait(cat: Cat, rng: Rng, positive: number, inherited: readonly Trait[] = []): boolean {
  // Безшерстому «Догляду за шерстю» не видають: линяти нічим (рішення автора 2026-10-25, `TRAITS_REVIEW.md`).
  const free = TRAIT_GROUPS.filter((g) => !cat.traits.some((t) => t.group === g.id) && !(g.id === "shedding" && cat.shape.coat === "hairless"));
  if (free.length === 0) return false;
  const good = rng.chance(positive);
  // «Природа й виховання» (§9.8): знак — від догляду, а з шансом 50% сама риса — від батьків.
  const fromParents = inherited.filter((t) => isPositive(t) === good && free.some((g) => g.id === t.group));
  const parent = fromParents[rng.int(0, fromParents.length - 1)];
  if (parent && rng.chance(INHERIT_TRAIT_CHANCE)) {
    cat.traits.push({ group: parent.group, level: parent.level, seen: 0, known: false });
    return true;
  }
  const group = free[rng.int(0, free.length - 1)];
  if (!group) return false;
  const sign = (good ? group.good : -group.good) as 1 | -1;
  cat.traits.push({ group: group.id, level: levelOf(sign, rng.chance(STRONG_TRAIT_CHANCE)), seen: 0, known: false });
  return true;
}

/**
 * Кіт ззовні адаптується в новому домі (§9.6): 2 дні, «Сміливість» — на пів дня менше за одиницю, від 1 до 3 днів
 * (рішення автора 2026-10-25). Дні рахуються від ранку дня появи разом із часом доби.
 */
export function isAdapting(state: GameState, cat: Cat): boolean {
  if (cat.source === "born") return false;
  const a = ADAPTATION_BRAVERY;
  const days = Math.min(a.max, Math.max(a.min, ADAPTATION_DAYS - a.step * traitLevel(cat, "bravery")));
  return daysAtHome(state, cat) < days;
}

/**
 * Полохливий ще звикає, хоча кіт без риси вже звик би (§9.12 «Спільні механіки рис», перевірка 2026-10-25): лише тоді
 * схованка в новому домі — видима різниця, прояв «Сміливості −». Перші 2 дні ховається кожен новий кіт.
 */
export function adaptsLonger(state: GameState, cat: Cat): boolean {
  return isAdapting(state, cat) && daysAtHome(state, cat) >= ADAPTATION_DAYS;
}

/** Скільки днів кіт удома: від ранку дня появи разом із часом доби. */
export function daysAtHome(state: GameState, cat: Cat): number {
  return state.day + state.minute / MINUTES_PER_DAY - cat.arrivedDay;
}

export function isKitten(cat: Cat): boolean {
  return cat.ageWeeks <= KITTEN_MAX_AGE;
}

export function isOld(cat: Cat): boolean {
  return cat.ageWeeks > CAT_AGE_LIMIT;
}

/**
 * Скільки насправді зміниться настрій (§9.6, §9.12): втрати масштабує «Стресостійкість», а що
 * щасливіший кіт, то менше йому дає приємне (правка автора 2026-10-25).
 */
function moodDelta(cat: Cat, delta: number): number {
  if (delta < 0) return delta * Math.max(0, 1 - STRESS_STEP * traitLevel(cat, "stress"));
  return delta * Math.min(1, Math.max(0, (100 - cat.mood) / (100 - MOOD_SATURATION.from)));
}

/** Змінити настрій кота. Втрати масштабує «Стресостійкість» (§9.12); причину бачить журнал. */
export function changeMood(state: GameState, cat: Cat, delta: number, reason?: string): void {
  const scaled = moodDelta(cat, delta);
  cat.mood = clamp(cat.mood + scaled);
  // Нервовий кіт сильно засмутився, не спить і не на руках — щойно звільниться, може нервово вилизатися (§9.12).
  const held = state.character.held;
  const carried = held?.kind === "cat" && held.cat === cat.id;
  const sleeping = cat.act.kind === "sleep" && cat.act.goal === null;
  if (scaled <= -STRESS_EFFECTS.shaken && !sleeping && !carried && traitLevel(cat, "stress") < 0) cat.shaken = absoluteMinute(state.day, state.minute);
  // Сцена показує кожну зміну сердечками (§9.12), навіть якщо настрій уже на межі: сердечка кажуть, що
  // котові сподобалося, тож приємне — повністю, хоч щасливому настрій і росте менше (§9.6).
  const felt = delta > 0 ? delta : scaled;
  if (felt !== 0) emit(state, { type: "cat-felt", cat: cat.id, delta: felt });
  if (reason) emit(state, { type: "cat-mood", cat: cat.id, delta: scaled, reason });
}

/** Змінити любов кота (§7): «Відданість» прискорює зростання, «Образливість» — втрати (§9.12). */
export function changeLove(state: GameState, cat: Cat, delta: number, reason?: string): void {
  const step = delta > 0 ? traitLevel(cat, "devotion") : traitLevel(cat, "touchy");
  const scaled = delta * Math.max(0, 1 + LOVE_TRAIT_STEP * step);
  cat.love = clamp(cat.love + scaled);
  // Неприємне запам'ятовується: ласощі одразу після нього зменшують втрату (§7).
  if (scaled < 0) cat.hurt = { at: absoluteMinute(state.day, state.minute), amount: -scaled };
  if (reason) emit(state, { type: "cat-love", cat: cat.id, delta: scaled, reason });
}

/**
 * Неприємне від персонажа (§9.12, «Увага й ласка»): прогнали з місця, узяли на руки проти волі, купали, возили до
 * ветеринара, дали ліки. Любов падає (з «Образливістю»), а кіт це запам'ятовує: «Образливий» дметься, мстивий може
 * помститися. Брудний лоток і день без уваги — не образа: персонаж котові нічого не зробив. Неприємне в поїздці
 * рахується з повернення додому.
 */
export function offend(state: GameState, cat: Cat, delta: number, reason: string): void {
  changeLove(state, cat, delta, reason);
  if (delta >= 0) return;
  cat.offense = { at: absoluteMinute(state.day, state.minute), ...(cat.away === "trip" ? { away: true } : {}) };
}

/** Кіт пережив стрес — бійку чи переноску (§9.12): мстивий може помститися. */
export function stress(state: GameState, cat: Cat): void {
  cat.stressedAt = absoluteMinute(state.day, state.minute);
}

/** Коли було останнє, за що мстивий кіт може помститися: неприємне від персонажа чи стрес; null — нічого. */
export function grudgeAt(cat: Cat): number | null {
  const offense = cat.offense && cat.offense.away !== true ? cat.offense.at : null;
  const stressed = cat.stressedAt ?? null;
  if (offense === null) return stressed;
  return stressed === null ? offense : Math.max(offense, stressed);
}

/** Кіт відтанув чи помстився (§9.12): образа й стрес минають. */
export function forgive(cat: Cat): void {
  delete cat.offense;
  delete cat.stressedAt;
}

/**
 * Скільки хвилин після неприємного кіт сам не приходить по ласку (§9.12, «Образливість»): кіт без риси — 15,
 * «Образливий» дметься 30 × рівень, «Відхідливий» приходить одразу.
 */
export function sulkMinutes(cat: Cat): number {
  const level = traitLevel(cat, "touchy");
  if (level < 0) return 0;
  return level > 0 ? TOUCHY.sulkMinutes * level : TOUCHY.baseMinutes;
}

/** Хвилин від неприємного, якщо воно було вдома чи кіт уже повернувся з поїздки; null — не було. */
export function sinceOffense(state: GameState, cat: Cat): number | null {
  const offense = cat.offense;
  if (!offense || offense.away === true) return null;
  return absoluteMinute(state.day, state.minute) - offense.at;
}

/** Кіт після неприємного ще сам не приходить по ласку (§9.12). */
export function avoiding(state: GameState, cat: Cat): boolean {
  const since = sinceOffense(state, cat);
  return since !== null && since < sulkMinutes(cat);
}

/** «Образливий» дметься: сам не приходить і відходить від персонажа (§9.12). */
export function sulking(state: GameState, cat: Cat): boolean {
  return traitLevel(cat, "touchy") > 0 && avoiding(state, cat);
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
  // Дрейф від любові — як і будь-яка зміна настрою: втрати зі «Стресостійкістю», приріст — що вище, то менший.
  cat.mood = clamp(cat.mood + moodDelta(cat, (cat.love - 50) * LOVE.driftPerPoint));
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

/** Риси батьків: живих чи з альбому пам'яті (§9.8). */
function parentTraits(state: GameState, cat: Cat): Trait[] {
  const ids = [cat.parents.mother, cat.parents.father];
  return ids.flatMap((id) => state.cats.find((c) => c.id === id)?.traits ?? state.album.find((e) => e.id === id)?.traits ?? []);
}

/** Ніч на понеділок (§4, §9.1): вік +1 і нова риса, знак — за середнім настроєм тижня. */
export function ageCat(state: GameState, cat: Cat, rng: Rng): void {
  cat.ageWeeks += 1;
  if (cat.traits.length >= Math.min(cat.ageWeeks, maxTraits(cat))) return;
  if (addTrait(cat, rng, weekMood(cat) / 100, cat.source === "born" ? parentTraits(state, cat) : [])) {
    const trait = cat.traits[cat.traits.length - 1];
    if (trait) emit(state, { type: "cat-trait", cat: cat.id, group: trait.group, level: trait.level, title: traitGroup(trait.group).title });
  }
}
