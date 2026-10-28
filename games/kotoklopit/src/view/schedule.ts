// Короткий розклад дня в інтерфейсі (§8.4): заплановані події, про які персонаж знає, за часом.

import { MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES, WORK_END_MINUTE, WORK_START_MINUTE } from "../sim/config";
import { absoluteMinute, formatClock } from "../sim/time";
import type { GameState } from "../sim/types";
import { isWorkday } from "../sim/work";

const at = (minute: number, what: string): [number, string] => [minute, `${formatClock(minute)} ${what}`];

/** Події модифікатора дня (§4.1): коли й готовий рядок розкладу. */
const DAY_EVENTS: Record<string, [number, string]> = {
  meeting: at(MODIFIERS.meeting.from, "нарада"),
  lunch: at(MODIFIERS.lunch.from, "обідня перерва"),
  outage: [MODIFIERS.outage.from, `${formatClock(MODIFIERS.outage.from)}–${formatClock(MODIFIERS.outage.to)} без світла`],
  inspection: at(MODIFIERS.inspection.minute, "перевірка ОСББ"),
  guests: at(MODIFIERS.guests.minute, "гості"),
  festival: at(MODIFIERS.festival.minute, "феєрверки"),
  "home-vet": at(MODIFIERS.homeVetMinute, "ветеринарка"),
  office: [18 * 60, "до 18:00 офіс"],
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
  // Робочі події — лише в робочий день, офіс — поки зборів не було (перевірка модифікаторів 2026-10-28: розклад обіцяв нараду на лікарняному й офіс після зборів).
  const work = state.modifiers.day === "meeting" || state.modifiers.day === "lunch" || state.modifiers.day === "office";
  const done = state.modifiers.day === "office" && state.today.officeDone;
  if (event && minute < event[0] && (!work || isWorkday(state)) && !done) timed.push(event);
  if (state.modifiers.day === "vaccination" && !state.today.vaccinated) now.push("щеплення");
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
