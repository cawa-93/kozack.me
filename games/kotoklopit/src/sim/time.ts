// Ігровий календар і годинник (§4, §8).

import {
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  REAL_SECONDS_PER_GAME_HOUR,
  TOTAL_DAYS,
} from "./config";

export const WEEKDAY_NAMES = [
  "понеділок",
  "вівторок",
  "середа",
  "четвер",
  "п'ятниця",
  "субота",
  "неділя",
] as const;

/** Номер тижня від 1. */
export function weekOf(day: number): number {
  return Math.floor(day / DAYS_PER_WEEK) + 1;
}

/** День тижня: 0 — понеділок, 6 — неділя. */
export function weekdayOf(day: number): number {
  return day % DAYS_PER_WEEK;
}

export function isSunday(day: number): boolean {
  return weekdayOf(day) === DAYS_PER_WEEK - 1;
}

/** Неділя 50-го тижня: після неї — пенсія (§4.2). */
export function isLastDay(day: number): boolean {
  return day === TOTAL_DAYS - 1;
}

/** Хвилина від початку гри: так зручно порівнювати час різних днів. */
export function absoluteMinute(day: number, minute: number): number {
  return day * MINUTES_PER_DAY + minute;
}

/** Скільки ігрових хвилин минає за стільки реальних секунд. */
export function gameMinutes(realSeconds: number): number {
  return (realSeconds / REAL_SECONDS_PER_GAME_HOUR) * MINUTES_PER_HOUR;
}

/** Годинник «ГГ:ХХ»; після півночі показує час нової доби. */
export function formatClock(minute: number): string {
  const total = Math.floor(minute) % MINUTES_PER_DAY;
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const minutes = total % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
