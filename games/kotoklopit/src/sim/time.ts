// Ігровий календар і годинник (§4, §8).

import {
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  RACE_SECONDS_PER_GAME_HOUR,
  REAL_SECONDS_PER_GAME_HOUR,
  TOTAL_DAYS,
  WORK_BOOST,
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

/** Скільки ігрових хвилин минає за стільки реальних секунд у гонці: дорога — зі своїм темпом (§8.5). */
export function raceMinutes(realSeconds: number): number {
  return (realSeconds / RACE_SECONDS_PER_GAME_HOUR) * MINUTES_PER_HOUR;
}

/**
 * Прискорення роботи (§8): у скільки разів швидше йде час, коли робота йде вже стільки секунд реального часу без зупинки, —
 * рівномірно від ×1 до ×10 за 60 секунд, далі ×10.
 */
export function workBoost(seconds: number): number {
  const share = Math.min(1, Math.max(0, seconds) / WORK_BOOST.rampSeconds);
  return 1 + (WORK_BOOST.max - 1) * share;
}

/** Що було за кадр гри в браузері (§8): з цього годинник рахує ігрові хвилини кадру. */
export interface ClockFrame {
  /** Реальні секунди кадру. */
  seconds: number;
  /** Гра йде: її не зупинила картка, телефон, пауза режиму розробки чи засинання. */
  running: boolean;
  /** Робота за комп'ютером іде (`workGoesOn`, src/sim/work.ts). */
  working: boolean;
  /** Швидкість режиму розробки (§11.5). */
  speed: number;
}

/**
 * Годинник кадру (§8, «Прискорення роботи»): скільки ігрових хвилин минає за кадр і скільки секунд розгону роботи стає після
 * нього (`boostSeconds` — до кадру; у збереження вони не потрапляють). Робота йде — хвилини кадру множаться на розгін
 * (`workBoost`), а розгін росте на секунди кадру. Робота зупинилася — миттєво ×1, і наступна робота розганяється з нуля; так і
 * тоді, коли вона зупинилася, поки гра стояла (дзвінок мами, поїздка, сон). Поки гра стоїть, хвилин немає, а розгін не росте
 * й не скидається. Швидкість режиму розробки множиться на розгін.
 */
export function clockFrame(boostSeconds: number, frame: ClockFrame): { minutes: number; boostSeconds: number } {
  if (!frame.working) return { minutes: frame.running ? gameMinutes(frame.seconds) * frame.speed : 0, boostSeconds: 0 };
  if (!frame.running) return { minutes: 0, boostSeconds };
  return { minutes: gameMinutes(frame.seconds) * frame.speed * workBoost(boostSeconds), boostSeconds: boostSeconds + frame.seconds };
}

/** Годинник «ГГ:ХХ»; після півночі показує час нової доби. */
export function formatClock(minute: number): string {
  const total = Math.floor(minute) % MINUTES_PER_DAY;
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const minutes = total % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
