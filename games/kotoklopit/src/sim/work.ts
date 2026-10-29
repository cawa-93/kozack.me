// Робота за комп'ютером (§8.6): гроші, репутація, терпіння керівництва, щоденна летучка.

import { earn, unpleasantTask } from "./character";
import {
  ABSENCE_REPUTATION,
  CALL_DIRTY_CLOTHES,
  CALL_HYGIENE_REPUTATION,
  DIFFICULTY,
  FIRST_WEEK_PROTECTION,
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
  WORK_START_MINUTE,
  JOB_SEARCH,
  TRIP_REPUTATION_DIVIDER,
  WORKDAYS_PER_WEEK,
} from "./config";
import { emit, type PatienceLevel } from "./events";
import { beardImpression } from "./grooming";
import { patienceDecayFactor, payFactor, reputationFactor, toOffice, workdayOverride } from "./modifiers";
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

/** Персонаж на лікарняному цього дня (§6.5). */
export function onSickLeave(state: GameState, day = state.day): boolean {
  return day >= (state.job.sickLeaveFrom ?? -Infinity) && day <= state.job.sickLeaveUntil;
}

export function isWorkday(state: GameState): boolean {
  // Безробітний і на лікарняному — без робочих днів: керівництво нічого не чекає (§6.5, §8.6).
  if (state.job.unemployed || onSickLeave(state)) return false;
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

/**
 * Нижче цієї межі репутація зараз не падає: перші 7 днів — 1, хоч би що було з котами, тож стажера не звільняють і посаду
 * не понижують (захист першого тижня, §8.3, §8.6; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А2).
 */
function reputationFloor(state: GameState): number {
  return state.day < FIRST_WEEK_PROTECTION.days ? FIRST_WEEK_PROTECTION.reputation : 0;
}

/** Репутація (§8.6): на 100 — підвищення, на 0 — пониження чи звільнення; після зміни посади — знову 50. */
export function changeReputation(state: GameState, delta: number): void {
  const job = state.job;
  if (job.unemployed) return;
  // Межа лише обмежує падіння й не піднімає репутацію, що вже нижча за неї (як statFloor для показників, §6.2).
  const lowest = Math.min(job.reputation, reputationFloor(state));
  job.reputation = Math.min(REPUTATION_MAX, Math.max(0, lowest, job.reputation + delta));
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
    // Збори в офісі — це робота, а не відсутність (§8.5).
    const trip = state.trip;
    // В обідню перерву й без інтернету («Планове відключення») керівництво нічого не чекає — і поїздка тоді не штрафується (перевірка модифікаторів 2026-10-28).
    if (workTime && trip.destination !== "office" && patienceDecayFactor(state) > 0) {
      // Зараховується, щойно настає робочий час: і поїздка, що почалася до 09:00. Знайду, яку відносять у притулок, гравець не
      // обирав і не може відкласти: вона штрафується як перша поїздка тижня й до лічильника не додається (§8.6, загальна ревізія
      // 2026-10-29).
      if (trip.workTrip !== true && trip.foundling !== true) {
        trip.workTrip = true;
        job.tripDays.push(state.day);
      }
      const trips = trip.foundling === true ? 1 : recentWorkTrips(state);
      changeReputation(state, -trips * (position.reputation / TRIP_REPUTATION_DIVIDER) * hours);
    }
  } else if (activity?.kind === "work" && job.unemployed) {
    // Пошук роботи (§8.6): години за комп'ютером за складністю, без зарплати; удвічі легше за роботу стажера.
    const sanity = (POSITIONS[0]?.sanity ?? 0) * JOB_SEARCH.sanityShare;
    activity.sanity += unpleasantTask(state, sanity * hours, from);
    activity.minutes += minutes;
    const vacancy = searchProgress(state).vacancy;
    job.searchHours += hours;
    if (job.searchHours < JOB_SEARCH.hours[state.difficulty] && searchProgress(state).vacancy > vacancy) {
      // Чергова вакансія — відмова; далі нова (§8.6).
      emit(state, { type: "job-rejected", vacancy });
    }
    if (job.searchHours >= JOB_SEARCH.hours[state.difficulty]) {
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
    activity.sanity += unpleasantTask(state, position.sanity * hours, from);
    activity.minutes += minutes;
    activity.money += money;
    activity.reputation += job.reputation - reputationBefore;
    job.patience = Math.min(PATIENCE_MAX, job.patience + position.patienceRecovery * hours);
  } else if (workTime) {
    // «Х»: персонаж у робочий день кинув роботу, репутація падає щогодини — але не в обідню
    // перерву й не без інтернету: тоді й терпіння не падає (§4.1).
    if (levelBefore === "out" && patienceDecayFactor(state) > 0) changeReputation(state, ABSENCE_REPUTATION * position.reputation * hours);
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
  // На зборах в офісі персонаж і так на роботі: летучка — там (§8.5); з аварії дорогою туди — ні (перевірка поїздок 2026-10-28).
  const present = isWorking(state) || toOffice(state);
  if (present) state.job.standupMinutes += Math.max(0, Math.min(to, end) - Math.max(from, start));
  noticeCallLook(state, from, to, start);
  if (from < end && to >= end) resolveStandup(state);
}

function resolveStandup(state: GameState): void {
  const perHour = positionOf(state).reputation;
  const attended = state.job.standupMinutes >= STANDUP_MINUTES * STANDUP_ATTENDANCE;
  // Прийти, навіть неохайним, ніколи не гірше, ніж пропустити: найбільший штраф — пів пропуску.
  const delta = attended ? Math.max(callImpression(state), STANDUP_MISSED_REPUTATION / 2) * perHour : STANDUP_MISSED_REPUTATION * perHour;
  changeReputation(state, delta);
  emit(state, { type: "standup", attended, reputation: delta });
}

/**
 * Враження на відеодзвінку в «годинах роботи» посади (§8.6): низька гігієна — штраф,
 * висока — дзеркальний бонус; борода (§5.1) і брудний одяг (§8.7). Кіт у кадрі не штрафує (рішення автора 2026-10-28).
 */
export function callImpression(state: GameState): number {
  const hygiene = state.character.stats.hygiene;
  const clean = hygiene < LOW_STAT ? -CALL_HYGIENE_REPUTATION : hygiene >= HIGH_HYGIENE ? CALL_HYGIENE_REPUTATION : 0;
  // Борода (§5.1): доглянута — бонус, неохайна — штраф; брудний одяг — штраф (§8.7).
  const clothes = state.home.clothes <= 0 ? -CALL_DIRTY_CLOTHES.reputation : 0;
  return clean + beardImpression(state) + clothes;
}

/** На відеодзвінку колеги помічають брудний одяг (§5.1): бабл над комп'ютером. */
export function noticeCallLook(state: GameState, from: number, to: number, callStart: number): void {
  const at = callStart + CALL_DIRTY_CLOTHES.noticeMinute;
  if (from < at && to >= at && isWorking(state) && state.home.clothes <= 0) emit(state, { type: "call-remark", issue: "clothes" });
}

/**
 * Пошук роботи як низка вакансій (§8.6, правка автора 2026-10-23): у кожної — етапи відгук,
 * співбесіда, тестове, пропозиція; k-та вакансія закінчується відмовою після k-го етапу, остання —
 * наймом. Етапи однакові за часом: увесь пошук — 1 + 2 + … + N етапів. `vacancy` — з 1,
 * `progress` — скільки пройдено з усіх етапів поточної вакансії (0–1).
 */
export function searchProgress(state: GameState): { vacancy: number; progress: number } {
  const stages = JOB_SEARCH.stages;
  const units = (stages * (stages + 1)) / 2;
  // Похибка дробів не повинна відкладати відмову: 2,4 / 24 × 10 — це рівно один етап.
  const done = Math.min(units, (state.job.searchHours / JOB_SEARCH.hours[state.difficulty]) * units + 1e-9);
  let start = 0;
  for (let vacancy = 1; vacancy <= stages; vacancy++) {
    if (done < start + vacancy || vacancy === stages) return { vacancy, progress: Math.min(vacancy, done - start) / stages };
    start += vacancy;
  }
  return { vacancy: stages, progress: 1 };
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
