// Команди режиму розробки (§11.5): швидко встановити потрібний стан гри.
// Вони змінюють збереження напряму, тож живуть поза симуляцією й лише в збірці розробки.

import { dropEverything } from "../sim/actions";
import { newBody } from "../sim/body";
import {
  BEDTIME_EARLIEST_HOURS_BEFORE_WAKE,
  DAYS_PER_WEEK,
  FIRST_DAY_MODIFIER,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  WORK_END_MINUTE,
} from "../sim/config";
import { tickDeliveries } from "../sim/economy";
import { goToSleep } from "../sim/game";
import { seedDay } from "../sim/rng";
import { canGoToSleep, wakeMinute } from "../sim/sleep";
import { absoluteMinute, weekdayOf } from "../sim/time";
import type { GameState, Save } from "../sim/types";
import { morningJob } from "../sim/work";

/** Знімки перегравання тепер починаються з цього стану. */
export function rebase(save: Save): void {
  save.dayStart = structuredClone(save.current);
  save.weekStart = structuredClone(save.current);
}

/**
 * Перейти в день і годину без плину часу. Година, раніша за пробудження, — це ніч
 * після цього дня (01:00 — ще не спав).
 */
export function setTime(save: Save, day: number, hour: number): void {
  const state = save.current;
  const changedDay = day !== state.day;
  state.day = Math.max(0, Math.floor(day));
  let minute = Math.round(hour * MINUTES_PER_HOUR);
  if (minute < wakeMinute(state)) minute += MINUTES_PER_DAY;
  state.minute = minute;
  if (changedDay) {
    // Модифікатори дня обиратиме крок 14 плану; «Перший день» — лише день 0.
    state.modifiers.day = state.day === 0 ? FIRST_DAY_MODIFIER : null;
    morningJob(state);
    seedDay(state);
  }
  rebase(save);
}

export type TimeOfDay = "morning" | "evening" | "night";

/** Ранок — пробудження, вечір — кінець робочого дня, ніч — найраніша пора лягати. */
export function jumpTo(save: Save, time: TimeOfDay): void {
  const state = save.current;
  const wake = wakeMinute(state);
  const minute = {
    morning: wake,
    evening: WORK_END_MINUTE,
    night: wake + MINUTES_PER_DAY - BEDTIME_EARLIEST_HOURS_BEFORE_WAKE * MINUTES_PER_HOUR,
  }[time];
  state.minute = minute;
  if (time === "morning") state.character.body = newBody();
}

/** Лягти спати зараз; якщо ще зарано — спершу перейти до найранішої пори сну. */
export function sleepNow(save: Save): void {
  const state = save.current;
  if (state.end !== null) return;
  if (!canGoToSleep(state)) jumpTo(save, "night");
  dropEverything(state);
  goToSleep(save);
}

/** Проспати стільки ночей поспіль. */
export function skipDays(save: Save, days: number): void {
  for (let i = 0; i < days && save.current.end === null; i++) sleepNow(save);
}

/** Проспати до наступного понеділка. */
export function skipToMonday(save: Save): void {
  const days = DAYS_PER_WEEK - weekdayOf(save.current.day);
  skipDays(save, days);
}

/** Кур'єр приїжджає зараз: усі пакунки в дорозі — під дверима. */
export function courierNow(state: GameState): void {
  const now = absoluteMinute(state.day, state.minute);
  for (const delivery of state.home.deliveries) delivery.at = Math.min(delivery.at, now);
  tickDeliveries(state);
}

/** Новий seed: умови й поведінка з наступного дня підуть інакше. */
export function setSeed(save: Save, seed: number): void {
  save.current.seed = seed >>> 0;
  seedDay(save.current);
  rebase(save);
}
