// Показники персонажа й гроші (§6, §6.1, §6.3).

import { hygieneFactor } from "./household";
import { unpleasantFactor } from "./modifiers";
import {
  ACCIDENT,
  CHRONOTYPE_WINDOWS,
  DASH_SATIETY,
  DEPRESSION_CEILING,
  FIRST_WEEK_PROTECTION,
  HUNGER_HEALTH_PER_HOUR,
  HUNGER_HEALTH_THRESHOLD,
  HOUSEHOLD,
  HYGIENE_PER_HOUR,
  MALE_METABOLISM,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SANITY_FLOOR,
  SATIETY_PER_HOUR,
  LOW_STAT,
  SLEEP_DEBT_HEALTH_PER_HOUR,
  SLEEP_DECAY_DIVIDER,
  SLEEP_HEALTH_PER_HOUR,
  SLEEP_NEED_HOURS,
  SLEEP_STAT_FLOOR,
  STAT_MAX,
} from "./config";
import { endGame } from "./events";
import type { GameState, Ledger, Spending, StatName } from "./types";

export const STAT_NAMES: readonly StatName[] = ["health", "satiety", "hygiene", "sanity"];

/** Нижче цієї межі показник зараз не падає. */
export function statFloor(state: GameState, stat: StatName): number {
  if (stat !== "sanity") return 0;
  // «Пригніченість» (§6.2): здоровий глузд не опускається нижче 10%.
  if (state.character.depressed) return SANITY_FLOOR;
  // Захист першого тижня (§8.3): не нижче 1%, поки в домі не з'явився перший кіт.
  if (firstWeekProtected(state)) return FIRST_WEEK_PROTECTION.floor;
  return 0;
}

/** Перший тиждень гри, і в домі ще жодного разу не було кота (§8.3). */
export function firstWeekProtected(state: GameState): boolean {
  if (state.day >= FIRST_WEEK_PROTECTION.days || state.cats.length > 0) return false;
  return Object.values(state.stats.raised).every((count) => count === 0);
}

/**
 * Вище цієї межі показник зараз не росте: «Пригніченість» тримає здоровий глузд до 35% (§6.2),
 * брудний одяг — гігієну до 60 (§8.7).
 */
export function statCeiling(state: GameState, stat: StatName): number {
  if (stat === "sanity" && state.character.depressed) return DEPRESSION_CEILING;
  if (stat === "hygiene" && state.home.clothes <= 0) return HOUSEHOLD.noClothesHygieneCeiling;
  return STAT_MAX;
}

/**
 * Змінити показник у межах 0–100. Межа лише обмежує падіння й не піднімає
 * показник, що вже нижчий за неї (§6.2, §8.8). Показник на нулі закінчує гру (§6.1).
 */
export function changeStat(state: GameState, stat: StatName, delta: number, floor = 0): void {
  if (state.end !== null) return;
  const stats = state.character.stats;
  const current = stats[stat];
  let next = Math.min(Math.max(current, statCeiling(state, stat)), current + delta);
  if (delta < 0) next = Math.max(next, Math.min(current, Math.max(floor, statFloor(state, stat))));
  stats[stat] = Math.max(next, 0);
  if (next <= 0) endGame(state, stat);
}

export function earn(state: GameState, amount: number): void {
  state.character.money += amount;
  ledgerOf(state).earned += amount;
}

/** Заплатити, якщо вистачає грошей: піти в мінус не можна (§6.4). Витрата — у гроші тижня за категорією. */
export function spend(state: GameState, amount: number, on: Spending): boolean {
  if (state.character.money < amount) return false;
  state.character.money -= amount;
  const spent = ledgerOf(state).spent;
  spent[on] = (spent[on] ?? 0) + amount;
  return true;
}

/** Гроші цього тижня (§6.4, «Куди йдуть гроші»); у старому збереженні — з нуля. */
const ledgerOf = (state: GameState): Ledger => (state.ledger ??= { earned: 0, spent: {} });

/** Ніч на понеділок: гроші тижня — у звіт, новий тиждень рахується з нуля (§6.4). */
export function closeLedger(state: GameState): Ledger {
  const week = ledgerOf(state);
  state.ledger = { earned: 0, spent: {} };
  return week;
}

/** Хронотип (§5.1): множник втрат здорового глузду від неприємних завдань у цю хвилину. */
export function chronotypeFactor(state: GameState, minute: number): number {
  const hour = (minute % MINUTES_PER_DAY) / MINUTES_PER_HOUR;
  const slot = CHRONOTYPE_WINDOWS[state.character.chronotype].find((w) => hour >= w.from && hour < w.to);
  return slot?.factor ?? 1;
}

/** Неприємне завдання (§8.1) забирає здоровий глузд з урахуванням хронотипу. Повертає зміну. */
export function unpleasantTask(state: GameState, sanityLoss: number, minute = state.minute): number {
  const stats = state.character.stats;
  const before = stats.sanity;
  changeStat(state, "sanity", sanityLoss * chronotypeFactor(state, minute) * unpleasantFactor(state));
  return stats.sanity - before;
}

/** Чоловічий персонаж має трохи вищий обмін речовин (§5.1). */
function metabolism(state: GameState): number {
  return state.character.sex === "male" ? MALE_METABOLISM : 1;
}

/** Ривок — «біганина» (§6.3): трохи ситості, з тим самим обміном речовин. */
export function dashHunger(state: GameState): void {
  changeStat(state, "satiety", DASH_SATIETY * metabolism(state));
}

/**
 * Минув час, поки персонаж не спить. Поки день перемотується після аварії (`rewind`, §8.5), гігієна не опускається нижче 5,
 * ситість — нижче 25, а голод не забирає здоров'я, навіть якщо ситість нижче 25 була ще до аварії (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А1; раніше ситість падала до 5, і без їжі вдома голод добивав персонажа вранці за години).
 */
export function passAwakeTime(state: GameState, hours: number, rewind = false): void {
  changeStat(state, "satiety", SATIETY_PER_HOUR * metabolism(state) * hours, rewind ? ACCIDENT.satietyFloor : 0);
  changeStat(state, "hygiene", HYGIENE_PER_HOUR * hygieneFactor(state) * hours, rewind ? ACCIDENT.floor : 0);
  if (!rewind && state.character.stats.satiety < HUNGER_HEALTH_THRESHOLD) {
    changeStat(state, "health", HUNGER_HEALTH_PER_HOUR * hours);
  }
}

/** Сон відновлює здоров'я, лише якщо персонаж ліг ситим і не хворий (§8.8). */
export function sleepHeals(state: GameState): boolean {
  const ch = state.character;
  return ch.stats.satiety >= LOW_STAT && ch.illnesses.length === 0;
}

/**
 * Минув час сну (§8.8): голод і гігієна падають учетверо повільніше, здоров'я відновлюється
 * ситому й здоровому, а недосип його забирає; здоровий глузд не змінюється, показники не нижче 5.
 * Множники ситості й гігієни — ті самі, що вдень: обмін, цикл, брудний одяг, шерсть, «Спека» (загальна ревізія 2026-10-29;
 * раніше вночі діяв лише обмін).
 */
export function passSleepTime(state: GameState, hours: number): void {
  const heals = sleepHeals(state);
  const decay = hours / SLEEP_DECAY_DIVIDER;
  changeStat(state, "satiety", SATIETY_PER_HOUR * metabolism(state) * decay, SLEEP_STAT_FLOOR);
  changeStat(state, "hygiene", HYGIENE_PER_HOUR * hygieneFactor(state) * decay, SLEEP_STAT_FLOOR);
  if (heals) changeStat(state, "health", SLEEP_HEALTH_PER_HOUR * hours);
  const debt = Math.max(0, SLEEP_NEED_HOURS - hours);
  if (debt > 0) changeStat(state, "health", SLEEP_DEBT_HEALTH_PER_HOUR * debt, SLEEP_STAT_FLOOR);
}
