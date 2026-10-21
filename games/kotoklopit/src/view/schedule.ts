// Короткий розклад дня в інтерфейсі (§8.4): заплановані події, про які персонаж знає, за часом.

import { MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES, WORK_END_MINUTE, WORK_START_MINUTE } from "../sim/config";
import { absoluteMinute, formatClock } from "../sim/time";
import type { GameState } from "../sim/types";
import { isWorkday } from "../sim/work";

/** Події модифікатора дня (§4.1): коли й що. */
const DAY_EVENTS: Record<string, [number, string]> = {
  meeting: [MODIFIERS.meeting.from, "нарада"],
  lunch: [MODIFIERS.lunch.from, "обідня перерва"],
  outage: [MODIFIERS.outage.from, "без світла до 15:00"],
  inspection: [MODIFIERS.inspection.minute, "перевірка ОСББ"],
  guests: [MODIFIERS.guests.minute, "гості"],
  festival: [MODIFIERS.festival.minute, "феєрверки"],
  "home-vet": [MODIFIERS.homeVetMinute, "ветеринарка"],
  office: [18 * 60, "до цього — офіс"],
};

/**
 * Розклад: спершу те, що вже чекає (пакунок під дверима, щеплення), далі — події за часом.
 * Кур'єр — один рядок, найближчий приїзд, навіть якщо в дорозі кілька замовлень.
 */
export function scheduleOf(state: GameState): string[] {
  const now: string[] = [];
  const timed: [number, string][] = [];
  const minute = state.minute;
  if (isWorkday(state) && minute < WORK_END_MINUTE) {
    timed.push([WORK_START_MINUTE, `${formatClock(WORK_START_MINUTE)}–${formatClock(WORK_END_MINUTE)} робота`]);
    if (minute < STANDUP_MINUTE + STANDUP_MINUTES) timed.push([STANDUP_MINUTE, `${formatClock(STANDUP_MINUTE)} летучка`]);
  }
  const event = DAY_EVENTS[state.modifiers.day ?? ""];
  if (event && minute < event[0]) timed.push([event[0], `${formatClock(event[0])} ${event[1]}`]);
  if (state.modifiers.day === "vaccination" && !state.today.vaccinated) now.push("сьогодні — щеплення котові");
  if (state.home.porch.length > 0) now.push("пакунок під дверима");
  const today = absoluteMinute(state.day, 0);
  const next = Math.min(...state.home.deliveries.map((d) => d.at - today));
  if (Number.isFinite(next)) {
    // Кур'єр приїде «приблизно»: час округлено до чверті години.
    const at = Math.round(next / 15) * 15;
    timed.push([at, `≈${formatClock(at)} кур'єр`]);
  }
  timed.sort((a, b) => a[0] - b[0]);
  return [...now, ...timed.map(([, text]) => text)];
}
