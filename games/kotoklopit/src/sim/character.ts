// Показники персонажа й гроші (§6, §6.1, §6.3).

import {
  CHRONOTYPE_WINDOWS,
  DEPRESSION_CEILING,
  FIRST_DAY_MODIFIER,
  HUNGER_HEALTH_PER_HOUR,
  HUNGER_HEALTH_THRESHOLD,
  HYGIENE_PER_HOUR,
  MALE_METABOLISM,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SANITY_FLOOR,
  SATIETY_PER_HOUR,
  SLEEP_DECAY_DIVIDER,
  SLEEP_HEALTH_PER_HOUR,
  SLEEP_STAT_FLOOR,
  STAT_MAX,
} from "./config";
import { endGame } from "./events";
import type { GameState, StatName } from "./types";

export const STAT_NAMES: readonly StatName[] = ["health", "satiety", "hygiene", "sanity"];

/** Нижче цієї межі показник зараз не падає. */
export function statFloor(state: GameState, stat: StatName): number {
  if (stat !== "sanity") return 0;
  // «Перший день» (§8.3) і «Пригніченість» (§6.2): здоровий глузд не опускається нижче 10%.
  if (state.modifiers.day === FIRST_DAY_MODIFIER || state.character.depressed) return SANITY_FLOOR;
  return 0;
}

/** Вище цієї межі показник зараз не росте: «Пригніченість» тримає здоровий глузд до 30% (§6.2). */
export function statCeiling(state: GameState, stat: StatName): number {
  return stat === "sanity" && state.character.depressed ? DEPRESSION_CEILING : STAT_MAX;
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
}

/** Заплатити, якщо вистачає грошей: піти в мінус не можна (§6.4). */
export function spend(state: GameState, amount: number): boolean {
  if (state.character.money < amount) return false;
  state.character.money -= amount;
  return true;
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
  changeStat(state, "sanity", sanityLoss * chronotypeFactor(state, minute));
  return stats.sanity - before;
}

/** Чоловічий персонаж має трохи вищий обмін речовин (§5.1). */
function metabolism(state: GameState): number {
  return state.character.sex === "male" ? MALE_METABOLISM : 1;
}

/** Минув час, поки персонаж не спить. */
export function passAwakeTime(state: GameState, hours: number, floor = 0): void {
  changeStat(state, "satiety", SATIETY_PER_HOUR * metabolism(state) * hours, floor);
  changeStat(state, "hygiene", HYGIENE_PER_HOUR * hours, floor);
  if (state.character.stats.satiety < HUNGER_HEALTH_THRESHOLD) {
    changeStat(state, "health", HUNGER_HEALTH_PER_HOUR * hours, floor);
  }
}

/**
 * Минув час сну (§8.8): голод і гігієна падають учетверо повільніше, здоров'я
 * відновлюється, здоровий глузд не змінюється, показники не опускаються нижче 5.
 */
export function passSleepTime(state: GameState, hours: number): void {
  const decay = hours / SLEEP_DECAY_DIVIDER;
  changeStat(state, "satiety", SATIETY_PER_HOUR * metabolism(state) * decay, SLEEP_STAT_FLOOR);
  changeStat(state, "hygiene", HYGIENE_PER_HOUR * decay, SLEEP_STAT_FLOOR);
  changeStat(state, "health", SLEEP_HEALTH_PER_HOUR * hours);
}
