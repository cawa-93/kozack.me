// Робота за комп'ютером (§8.6): гроші, репутація, терпіння керівництва, щоденна летучка.

import { earn, unpleasantTask } from "./character";
import {
  ABSENCE_REPUTATION,
  CALL_HYGIENE_REPUTATION,
  DIFFICULTY,
  HIGH_HYGIENE,
  LOW_STAT,
  MINUTES_PER_HOUR,
  PATIENCE_MAX,
  PATIENCE_WARNING,
  POSITIONS,
  REPUTATION_MAX,
  STANDUP_ATTENDANCE,
  STANDUP_MINUTE,
  STANDUP_MINUTES,
  STANDUP_MISSED_REPUTATION,
  START_REPUTATION,
  WORK_END_MINUTE,
  WORK_SANITY_PER_HOUR,
  WORK_START_MINUTE,
  JOB_SEARCH_HOURS,
  TRIP_REPUTATION_DIVIDER,
  WORKDAYS_PER_WEEK,
} from "./config";
import { emit, type PatienceLevel } from "./events";
import { beardImpression } from "./grooming";
import { patienceDecayFactor, payFactor, reputationFactor, workdayOverride } from "./modifiers";
import { weekdayOf } from "./time";
import type { GameState, Job } from "./types";

const PATIENCE_EPSILON = 1e-9;

export function newJob(): Job {
  return { position: 0, reputation: START_REPUTATION, patience: PATIENCE_MAX, standupMinutes: 0, tripDays: [], unemployed: false, searchHours: 0, sickLeaveUntil: -1 };
}

export function positionOf(state: GameState): (typeof POSITIONS)[number] {
  const position = POSITIONS[state.job.position];
  if (!position) throw new Error(`Немає посади ${state.job.position}`);
  return position;
}

export function isWorkday(state: GameState): boolean {
  // Безробітний і на лікарняному — без робочих днів: керівництво нічого не чекає (§6.5, §8.6).
  if (state.job.unemployed || state.day <= state.job.sickLeaveUntil) return false;
  // Робоча субота, аврал, вихідний посеред тижня, відпустка (§4.1).
  return workdayOverride(state) ?? weekdayOf(state.day) < WORKDAYS_PER_WEEK;
}

/** Робочий час — 09:00–18:00 у будні (§8.6). */
export function isWorkTime(state: GameState, minute = state.minute): boolean {
  return isWorkday(state) && minute >= WORK_START_MINUTE && minute < WORK_END_MINUTE;
}

export function isWorking(state: GameState): boolean {
  return state.character.activity?.kind === "work";
}

/** Терпіння нижче 50 — «!», на нулі — «Х» (§8.6). */
export function patienceLevel(state: GameState): PatienceLevel {
  const { patience } = state.job;
  if (patience <= 0) return "out";
  return patience < PATIENCE_WARNING ? "warning" : "ok";
}

/** Репутація (§8.6): на 100 — підвищення, на 0 — пониження чи звільнення; після зміни посади — знову 50. */
export function changeReputation(state: GameState, delta: number): void {
  const job = state.job;
  if (job.unemployed) return;
  job.reputation = Math.min(REPUTATION_MAX, Math.max(0, job.reputation + delta));
  if (job.reputation >= REPUTATION_MAX && job.position < POSITIONS.length - 1) {
    job.position += 1;
    job.reputation = START_REPUTATION;
    emit(state, { type: "career", change: "promoted", position: job.position });
  } else if (job.reputation <= 0) {
    if (job.position > 0) {
      job.position -= 1;
      job.reputation = START_REPUTATION;
      emit(state, { type: "career", change: "demoted", position: job.position });
    } else {
      stopWork(state);
      job.unemployed = true;
      job.searchHours = 0;
      job.reputation = START_REPUTATION;
      emit(state, { type: "career", change: "fired", position: 0 });
    }
  }
}

/** Сісти за комп'ютер: персонаж працює, доки сам не встане (§8.4). */
export function startWork(state: GameState): void {
  state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
  emit(state, { type: "work-started" });
}

export function stopWork(state: GameState): void {
  const activity = state.character.activity;
  if (activity?.kind !== "work") return;
  state.character.activity = null;
  const { minutes, money, reputation, sanity } = activity;
  emit(state, { type: "work-stopped", minutes, money, reputation, sanity });
}

/** Минули хвилини від `from`: робота, терпіння й летучка. */
export function tickWork(state: GameState, from: number, minutes: number): void {
  const job = state.job;
  const position = positionOf(state);
  const hours = minutes / MINUTES_PER_HOUR;
  const levelBefore = patienceLevel(state);
  const activity = state.character.activity;
  const workTime = isWorkTime(state, from);

  if (state.trip !== null) {
    // Поїздка — попереджена відсутність (§8.6): терпіння не змінюється, у робочий час — штраф до репутації.
    if (workTime && state.trip.destination !== "office") changeReputation(state, -recentWorkTrips(state) * (position.reputation / TRIP_REPUTATION_DIVIDER) * hours);
  } else if (activity?.kind === "work" && job.unemployed) {
    // Пошук роботи (§8.6): 24 години за комп'ютером, без зарплати.
    activity.sanity += unpleasantTask(state, WORK_SANITY_PER_HOUR * hours, from);
    activity.minutes += minutes;
    job.searchHours += hours;
    if (job.searchHours >= JOB_SEARCH_HOURS) {
      job.unemployed = false;
      job.position = 0;
      job.reputation = START_REPUTATION;
      job.patience = PATIENCE_MAX;
      emit(state, { type: "career", change: "hired", position: 0 });
    }
  } else if (activity?.kind === "work") {
    const money = position.pay * DIFFICULTY[state.difficulty].earnings * payFactor(state) * hours;
    const reputationBefore = job.reputation;
    earn(state, money);
    changeReputation(state, position.reputation * reputationFactor(state) * hours);
    activity.sanity += unpleasantTask(state, WORK_SANITY_PER_HOUR * hours, from);
    activity.minutes += minutes;
    activity.money += money;
    activity.reputation += job.reputation - reputationBefore;
    job.patience = Math.min(PATIENCE_MAX, job.patience + position.patienceRecovery * hours);
  } else if (workTime) {
    // «Х»: персонаж у робочий день кинув роботу, репутація падає щогодини.
    if (levelBefore === "out") changeReputation(state, ABSENCE_REPUTATION * position.reputation * hours);
    const patience = job.patience - position.patienceDecay * patienceDecayFactor(state) * hours;
    // Похибка дробових кроків не повинна відкладати «Х» на хвилину.
    job.patience = patience < PATIENCE_EPSILON ? 0 : patience;
  }

  const levelAfter = patienceLevel(state);
  if (levelAfter !== levelBefore) emit(state, { type: "patience", level: levelAfter });
  tickStandup(state, from, from + minutes);
}

/** Щоденна летучка о 10:00 на 15 хвилин (§8.6). */
function tickStandup(state: GameState, from: number, to: number): void {
  if (!isWorkday(state)) return;
  const start = STANDUP_MINUTE;
  const end = STANDUP_MINUTE + STANDUP_MINUTES;
  if (from < start && to >= start) emit(state, { type: "standup-started" });
  if (isWorking(state)) state.job.standupMinutes += Math.max(0, Math.min(to, end) - Math.max(from, start));
  if (from < end && to >= end) resolveStandup(state);
}

function resolveStandup(state: GameState): void {
  const perHour = positionOf(state).reputation;
  const attended = state.job.standupMinutes >= STANDUP_MINUTES * STANDUP_ATTENDANCE;
  const delta = attended ? callImpression(state) * perHour : STANDUP_MISSED_REPUTATION * perHour;
  changeReputation(state, delta);
  emit(state, { type: "standup", attended, reputation: delta });
}

/**
 * Враження на відеодзвінку в «годинах роботи» посади (§8.6): низька гігієна — штраф,
 * висока — дзеркальний бонус. Кота в кадрі й бороду додадуть кроки 7 і 13 плану.
 */
export function callImpression(state: GameState): number {
  const hygiene = state.character.stats.hygiene;
  const clean = hygiene < LOW_STAT ? -CALL_HYGIENE_REPUTATION : hygiene >= HIGH_HYGIENE ? CALL_HYGIENE_REPUTATION : 0;
  // Борода (§5.1): доглянута — бонус, неохайна — штраф.
  return clean + beardImpression(state);
}

/** Ранок: на початку кожного робочого дня терпіння повне (§8.6). */
export function morningJob(state: GameState): void {
  state.job.patience = PATIENCE_MAX;
  state.job.standupMinutes = 0;
}

/** Скільки поїздок у робочий час за останні 7 днів, разом із поточною (§8.6). */
export function recentWorkTrips(state: GameState): number {
  state.job.tripDays = state.job.tripDays.filter((d) => state.day - d < 7);
  return state.job.tripDays.length;
}
