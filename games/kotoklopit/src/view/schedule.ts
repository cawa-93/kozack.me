// Короткий розклад дня в інтерфейсі (§8.4): заплановані події, про які персонаж знає, — спершу важливі, у межах групи за часом.

import { constructionDustHours } from "../sim/cleaner";
import { MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES, WORK_END_MINUTE, WORK_START_MINUTE } from "../sim/config";
import { dayGuestLetIn } from "../sim/door";
import { parcelsDue } from "../sim/parcels";
import { absoluteMinute, formatClock } from "../sim/time";
import type { GameState } from "../sim/types";
import { isWorkday, standupToday } from "../sim/work";

const at = (minute: number, what: string): [number, string] => [minute, `${formatClock(minute)} ${what}`];
const dust = constructionDustHours();

/** Події модифікатора дня (§4.1): коли й готовий рядок розкладу. */
const DAY_EVENTS: Record<string, [number, string]> = {
  meeting: at(MODIFIERS.meeting.from, "нарада"),
  lunch: at(MODIFIERS.lunch.from, "обідня перерва"),
  // «Планове відключення» — світла немає весь день, а не в певні години (§4.1, рішення автора 2026-11-02): запланованої події
  // в розкладі немає, а ефект дня «Без світла» — на панелі (`hud.ts`).
  inspection: at(MODIFIERS.inspection.minute, "перевірка ОСББ"),
  guests: at(MODIFIERS.guests.minute, "гості"),
  festival: at(MODIFIERS.festival.minute, "феєрверки"),
  "home-vet": at(MODIFIERS.homeVetMinute, "ветеринарка"),
  // Пара «Будівельний пил ↔ Прибиральниця» (§4.1): пил, як і робота, — лише початок і лише до нього (§8.4).
  cleaner: at(MODIFIERS.cleaner.minute, "прибиральниця"),
  "construction-dust": at(dust.from, "пил"),
  office: [WORK_END_MINUTE, `до ${formatClock(WORK_END_MINUTE)} офіс`],
};

/**
 * Розклад за важливістю (§8.4; загальна ревізія 2026-10-29): спершу летючка й подія дня — те, що можна пропустити
 * (нарада, перевірка ОСББ, збори в офісі, ветеринарка, гості…), — далі кур'єр, початок роботи й пакунок під дверима (над
 * дверима й так видно бабл-коробку). У межах групи — за часом. Панель показує два перші рядки: раніше «09:00 робота»
 * висіла до вечора, а кур'єр і пакунок ішли першими, і нарада, перевірка ОСББ чи офіс зникали з розкладу.
 * Кур'єр — один рядок, найближчий приїзд, навіть якщо в дорозі кілька замовлень.
 */
export function scheduleOf(state: GameState): string[] {
  const important: [number, string][] = [];
  const other: [number, string][] = [];
  const minute = state.minute;
  if (isWorkday(state)) {
    // Робота вже йде — вона не «запланована»: рядок лише до її початку, і в ньому лише початок — проміжок не вміщався на аркуші (§8.4).
    if (minute < WORK_START_MINUTE) other.push([WORK_START_MINUTE, `${formatClock(WORK_START_MINUTE)} робота`]);
    // У день без світла летючки немає (§4.1, рішення автора 2026-11-02).
    if (standupToday(state) && minute < STANDUP_MINUTE + STANDUP_MINUTES) important.push([STANDUP_MINUTE, `${formatClock(STANDUP_MINUTE)} летючка`]);
  }
  const event = DAY_EVENTS[state.modifiers.day ?? ""];
  // Робочі події — лише в робочий день, офіс — поки зборів не було (перевірка модифікаторів 2026-10-28: розклад обіцяв нараду на лікарняному й офіс після зборів).
  const work = state.modifiers.day === "meeting" || state.modifiers.day === "lunch" || state.modifiers.day === "office";
  // Гостю дня (ветеринарка, ОСББ, гості, прибиральниця) відчинили раніше за його час — він уже був (§9.12 «Подзвонили — двері
  // гостю», рішення автора 2026-11-03): у розкладі його вже немає. Чий це день, каже `GUEST_DAY`, а не збіг назв.
  const done = (state.modifiers.day === "office" && state.today.officeDone) || dayGuestLetIn(state);
  if (event && minute < event[0] && (!work || isWorkday(state)) && !done) important.push(event);
  // «Сусідські посилки» (§4.1): два візити дня — поки не прийшли, а не до свого часу: персонажа не було — прийдуть, щойно повернувся.
  const parcels = parcelsDue(state);
  if (parcels.courier) important.push(at(MODIFIERS.parcels.arrive, "посилки"));
  if (parcels.neighbor) important.push(at(MODIFIERS.parcels.pickup, "сусідка"));
  // Обідня перерва, поки триває, — до її кінця: з тієї хвилини поїздка знову штрафується (§8.6).
  const lunch = MODIFIERS.lunch;
  if (state.modifiers.day === "lunch" && isWorkday(state) && minute >= lunch.from && minute < lunch.to) important.push([lunch.to, `до ${formatClock(lunch.to)} обідня перерва`]);
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
