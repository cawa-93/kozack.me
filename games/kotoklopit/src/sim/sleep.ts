// Сон (§8.8). День триває від пробудження до сну; вікна рахуються від наступного пробудження.

import {
  BEDTIME_EARLIEST_HOURS_BEFORE_WAKE,
  COLLAPSE_HOURS_BEFORE_WAKE,
  DROWSY_HOURS_BEFORE_WAKE,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SLEEP_NEED_HOURS,
  SLEEP_SPEED_MAX_BONUS,
  SLEEP_SPEED_PER_HOUR,
  WAKE_MINUTE,
} from "./config";
import type { GameState } from "./types";

/** Хвилина пробудження за хронотипом (§5.1). */
export function wakeMinute(state: GameState): number {
  return WAKE_MINUTE[state.character.chronotype];
}

/** Скільки годин лишається до наступного пробудження. */
export function hoursUntilWake(state: GameState): number {
  return (wakeMinute(state) + MINUTES_PER_DAY - state.minute) / MINUTES_PER_HOUR;
}

/** Лягти можна за 10 годин до пробудження або пізніше. */
export function canGoToSleep(state: GameState): boolean {
  return hoursUntilWake(state) <= BEDTIME_EARLIEST_HOURS_BEFORE_WAKE;
}

/** «Сонливість»: до пробудження менше 8 годин, а персонаж ще не спить. */
export function isDrowsy(state: GameState): boolean {
  return hoursUntilWake(state) < DROWSY_HOURS_BEFORE_WAKE;
}

/** Хвилина, коли персонаж падає без сил: за 6 годин до пробудження. */
export function collapseMinute(state: GameState): number {
  return wakeMinute(state) + MINUTES_PER_DAY - COLLAPSE_HOURS_BEFORE_WAKE * MINUTES_PER_HOUR;
}

/** Зміна швидкості на наступний день: −5% за кожну недоспану годину, +5% за зайву, не більше +10%. */
export function sleepSpeedAfter(hours: number): number {
  return Math.min((hours - SLEEP_NEED_HOURS) * SLEEP_SPEED_PER_HOUR, SLEEP_SPEED_MAX_BONUS);
}
