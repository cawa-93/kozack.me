// «Сусідські посилки» — важкий бік пари «Сусідські посилки ↔ Велика коробка» (§4.1, `DAY_MODIFIERS.md`). Кур'єр із посилками й
// сусідка, що по них приходить, — візити, які заходять самі (§9.12 «Двері й гості»): дзвонять і за `GUESTS.ringLead` хвилин
// заходять, а дія біля дверей відчиняє їм раніше (`VISITS`). Посилки лежать у купі ящиків біля входу (`hasBoxes`): не
// розпаковуються, але коти гризуть і деруть їх, як свої коробки (`catai.ts`). Викликає `tickModifiers`.

import { spend } from "./character";
import { GUESTS, MODIFIERS } from "./config";
import { openDoor, ringBell, takeGuest } from "./door";
import { emit } from "./events";
import { tidyBoxTraces } from "./traces";
import type { GameState, NightReport, ParcelsPickup } from "./types";

/** Ранок (§4.1): у день «Сусідські посилки» попереду кур'єр; учорашнього візиту вже немає. */
export function startParcels(state: GameState): void {
  if (state.modifiers.day === "neighbor-parcels") state.today.parcels = { stage: "courier" };
  else delete state.today.parcels;
}

/**
 * Кур'єр о `MODIFIERS.parcels.arrive` і сусідка о `MODIFIERS.parcels.pickup` (§4.1): дзвонять і за `GUESTS.ringLead` хвилин
 * заходять. Персонажа немає вдома — приходять, щойно він повернувся (як мама); кур'єр — не пізніше за сусідку: повернувся після
 * її хвилини — посилок цього дня не було. Сусідка дзвонить лише тоді, коли кур'єр уже зайшов.
 */
export function tickParcels(state: GameState, from: number, minutes: number): void {
  const visit = state.today.parcels;
  if (!visit) return;
  const courier = visit.stage === "courier";
  const who = courier ? "parcels" : "neighbor";
  const end = from + minutes;
  if (visit.rang === undefined) {
    if (end < (courier ? MODIFIERS.parcels.arrive : MODIFIERS.parcels.pickup) || state.trip !== null) return;
    if (courier && from >= MODIFIERS.parcels.pickup) {
      delete state.today.parcels;
      return;
    }
    visit.rang = Math.max(courier ? MODIFIERS.parcels.arrive : MODIFIERS.parcels.pickup, from);
    ringBell(state, who);
    return;
  }
  if (end < visit.rang + GUESTS.ringLead) return;
  // Гравець уже відчинив раніше (§9.12) — `takeGuest` лише знімає запис, і візит не повторюється.
  const due = takeGuest(state, who);
  if (due && state.trip !== null) {
    // Вийшов між дзвінком і візитом: прийде знову, щойно персонаж повернувся.
    delete visit.rang;
    return;
  }
  if (due && courier) courierVisit(state);
  else if (due) neighborVisit(state);
  if (courier) state.today.parcels = { stage: "neighbor" };
  else delete state.today.parcels;
}

/** Кур'єр заходить (§4.1): двері відчинено (можлива втеча), біля входу — `MODIFIERS.parcels.count` сусідських коробок. */
export function courierVisit(state: GameState): void {
  openDoor(state);
  const count = MODIFIERS.parcels.count;
  state.home.parcels = { count, damaged: 0 };
  emit(state, { type: "modifier", kind: "parcels", value: count });
}

/** Сусідка заходить (§4.1): двері відчинено, посилки вона забирає, за пошкоджені — компенсація. Картка — з події. */
export function neighborVisit(state: GameState): void {
  openDoor(state);
  const pickup = handOver(state);
  if (pickup) emit(state, { type: "modifier", kind: "parcels-taken", value: pickup.fine, paid: pickup.paid, parcels: pickup });
}

/**
 * Персонаж ліг, не дочекавшись сусідки (§4.1): вона забирає посилки вранці, і компенсація та сама. Двері не відчиняються —
 * усе сталося, поки персонаж спав; що сталося, каже титулка (`report.parcels`).
 */
export function parcelsAtMorning(state: GameState, report: NightReport): void {
  const pickup = handOver(state);
  if (pickup) report.parcels = pickup;
}

/**
 * Віддати посилки сусідці (§4.1): за кожну пошкоджену — `MODIFIERS.parcels.fine`; грошей бракує — скільки є, тією ж статтею, що й
 * штраф ОСББ. Купа без посилок могла зникнути — разом зі слідами на ній (§9.12, «Котячі сліди в квартирі»). Null — посилок немає.
 */
function handOver(state: GameState): ParcelsPickup | null {
  const parcels = state.home.parcels;
  if (!parcels) return null;
  delete state.home.parcels;
  tidyBoxTraces(state);
  const fine = parcels.damaged * MODIFIERS.parcels.fine;
  const paid = Math.min(fine, Math.max(0, state.character.money));
  if (paid > 0) spend(state, paid, "other");
  return { count: parcels.count, damaged: parcels.damaged, fine, paid };
}

/** Скільки сусідських посилок біля входу ще цілі (§4.1). */
export function intactParcels(state: GameState): number {
  const parcels = state.home.parcels;
  return parcels ? parcels.count - parcels.damaged : 0;
}

/** Кіт погриз чи подер цілу посилку (§4.1): кожна пошкоджується щонайбільше раз. False — цілих немає. */
export function damageParcel(state: GameState, cat: number, how: "chewed" | "scratched"): boolean {
  const parcels = state.home.parcels;
  if (!parcels || parcels.damaged >= parcels.count) return false;
  parcels.damaged += 1;
  emit(state, { type: "parcel-damaged", cat, how });
  return true;
}

/**
 * Рядки розкладу дня (§8.4): кур'єр — поки посилок ще немає, сусідка — поки вона їх не забрала. Час — коли подзвонять; той, кому
 * відчинили раніше, зникає.
 */
export function parcelsDue(state: GameState): { courier: boolean; neighbor: boolean } {
  const visit = state.today.parcels;
  if (!visit || state.modifiers.day !== "neighbor-parcels") return { courier: false, neighbor: false };
  const delivered = state.home.parcels !== undefined;
  return { courier: visit.stage === "courier" && !delivered, neighbor: visit.stage === "courier" || delivered };
}
