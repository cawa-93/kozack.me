// Короткий розклад дня в інтерфейсі (§8.4): заплановані події, про які персонаж знає, — спершу важливі, у межах групи за часом.

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
 * Розклад за важливістю (§8.4; загальна ревізія 2026-10-29): спершу щеплення, летучка й подія дня — те, що можна пропустити
 * (нарада, перевірка ОСББ, збори в офісі, ветеринарка, гості…), — далі кур'єр, початок роботи й пакунок під дверима (над
 * дверима й так видно бабл-коробку). У межах групи — за часом. Панель показує два перші рядки: раніше «09:00–18:00 робота»
 * висіла до вечора, а кур'єр і пакунок ішли першими, і нарада, перевірка ОСББ чи офіс зникали з розкладу.
 * Кур'єр — один рядок, найближчий приїзд, навіть якщо в дорозі кілька замовлень.
 */
export function scheduleOf(state: GameState): string[] {
  const important: [number, string][] = [];
  const other: [number, string][] = [];
  const minute = state.minute;
  if (state.modifiers.day === "vaccination" && !state.today.vaccinated) important.push([-1, "щеплення"]);
  if (isWorkday(state)) {
    // Робота вже йде — вона не «запланована»: рядок лише до її початку.
    if (minute < WORK_START_MINUTE) other.push([WORK_START_MINUTE, `${formatClock(WORK_START_MINUTE)}–${formatClock(WORK_END_MINUTE)} робота`]);
    if (minute < STANDUP_MINUTE + STANDUP_MINUTES) important.push([STANDUP_MINUTE, `${formatClock(STANDUP_MINUTE)} летучка`]);
  }
  const event = DAY_EVENTS[state.modifiers.day ?? ""];
  // Робочі події — лише в робочий день, офіс — поки зборів не було (перевірка модифікаторів 2026-10-28: розклад обіцяв нараду на лікарняному й офіс після зборів).
  const work = state.modifiers.day === "meeting" || state.modifiers.day === "lunch" || state.modifiers.day === "office";
  const done = state.modifiers.day === "office" && state.today.officeDone;
  if (event && minute < event[0] && (!work || isWorkday(state)) && !done) important.push(event);
  const today = absoluteMinute(state.day, 0);
  const next = Math.min(...state.home.deliveries.map((d) => d.at - today));
  if (Number.isFinite(next)) {
    // Кур'єр приїде «приблизно»: час округлено до чверті години.
    const at = Math.round(next / 15) * 15;
    other.push([at, `≈${formatClock(at)} кур'єр`]);
  }
  if (state.home.porch.length > 0) other.push([Infinity, "пакунок під дверима"]);
  const byTime = (lines: [number, string][]): string[] => lines.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
  return [...byTime(important), ...byTime(other)];
}
