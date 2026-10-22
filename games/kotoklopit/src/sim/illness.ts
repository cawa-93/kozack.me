// Хвороби персонажа (§6.5): застуда, травма, виснаження; ліки з магазину й лікар з лікарняним.

import { changeStat, spend } from "./character";
import { DOCTOR, DOCTOR_TREAT, ILLNESS_EFFECTS, ILLNESSES, SLEEP_STAT_FLOOR } from "./config";
import { useSupply } from "./economy";
import { emit } from "./events";
import type { Rng } from "./rng";
import type { GameState, IllnessId } from "./types";

export const isIll = (state: GameState, id: IllnessId): boolean => state.character.illnesses.some((i) => i.id === id);

export function fallIllPerson(state: GameState, id: IllnessId): boolean {
  if (isIll(state, id)) return false;
  // Тиждень профілактики: застуда не чіпляється (§4.1).
  if (id === "cold" && state.modifiers.week === "human-prevention") return false;
  state.character.illnesses.push({ id, day: state.day, doses: 0, lastDose: -1 });
  emit(state, { type: "person-ill", illness: id });
  return true;
}

function curePerson(state: GameState, id: IllnessId): void {
  state.character.illnesses = state.character.illnesses.filter((i) => i.id !== id);
  emit(state, { type: "person-cured", illness: id });
}

/** Персонажа оглушило (спіткнувся, посковзнувся, збив кіт): шанс травми (§6.5). */
export function maybeInjure(state: GameState, rng: Rng): void {
  if (rng.chance(ILLNESS_EFFECTS.injuryOnStun * ILLNESS_EFFECTS.difficulty[state.difficulty])) fallIllPerson(state, "injury");
}

/** Множник швидкості руху від хвороб (§6.5). */
export function illnessSpeed(state: GameState): number {
  let speed = 1;
  if (isIll(state, "cold") || isIll(state, "injury")) speed *= ILLNESS_EFFECTS.slow;
  if (isIll(state, "injury") && state.character.held !== null) speed *= ILLNESS_EFFECTS.carrySlow;
  return speed;
}

/** Застуда — без ривка (§6.5). */
export const canDashWhenIll = (state: GameState): boolean => !isIll(state, "cold");

/**
 * Ніч (§6.5): виснаження від недосипу кілька ночей поспіль і одужання від доброго сну; після
 * «безпечних» днів — щоденна шкода здоров'ю. Уві сні показники не нижче 5 (§8.8): хвороба не вбиває вночі.
 * Застуда й травма минають самі: остання ніч ще шкодить, потім хвороба минає.
 */
export function nightlyIllness(state: GameState, sleptHours: number): void {
  const ch = state.character;
  ch.shortNights = sleptHours < ILLNESS_EFFECTS.shortSleepHours ? ch.shortNights + 1 : 0;
  ch.restedNights = sleptHours >= ILLNESS_EFFECTS.restHours ? ch.restedNights + 1 : 0;
  if (ch.shortNights >= ILLNESS_EFFECTS.shortNights) fallIllPerson(state, "exhaustion");
  if (isIll(state, "exhaustion") && ch.restedNights >= ILLNESS_EFFECTS.restNights) curePerson(state, "exhaustion");
  for (const illness of [...ch.illnesses]) {
    const rule = ILLNESSES[illness.id];
    const days = state.day - illness.day;
    if (days >= rule.safe) changeStat(state, "health", -rule.damage, SLEEP_STAT_FLOOR);
    if (rule.recovers !== null && days + 1 >= rule.recovers) curePerson(state, illness.id);
  }
}

/** Чи є що лікувати таблеткою сьогодні: хвороба, що лікується ліками, і сьогодні ще без дози (§6.5). */
export function needsHumanMeds(state: GameState): boolean {
  return state.character.illnesses.some((i) => ILLNESSES[i.id].doses !== null && i.lastDose !== state.day);
}

/** Прийняти ліки біля умивальника (§6.5): одна доза на день, дешева діє з шансом 70%. */
export function takeHumanMeds(state: GameState, rng: Rng): boolean {
  // Без хвороби, що лікується, ліки не п'ють: доза не марнується.
  if (!needsHumanMeds(state)) return false;
  const quality = useSupply(state, "humanMeds");
  if (quality === null) return false;
  for (const illness of [...state.character.illnesses]) {
    const doses = ILLNESSES[illness.id].doses;
    if (doses === null || illness.lastDose === state.day) continue;
    illness.lastDose = state.day;
    if (quality === "cheap" && !rng.chance(ILLNESS_EFFECTS.medsWork)) continue;
    illness.doses += 1;
    if (illness.doses >= doses) curePerson(state, illness.id);
  }
  emit(state, { type: "person-meds", quality });
  return true;
}

/** Огляд у лікаря (§6.5): діагноз; без хвороб — лише «здорові» (правка автора 2026-10-22). */
export function doctorExam(state: GameState): boolean {
  return state.trip?.destination === "doctor" && spend(state, DOCTOR.exam);
}

/** Лікування в лікаря (§6.5): хвороба минає, здоров'я +10, лікарняний з завтра. */
export function doctorTreat(state: GameState, id: IllnessId, quality: "cheap" | "premium", rng: Rng): "cured" | "failed" | null {
  const trip = state.trip;
  if (trip?.destination !== "doctor" || !isIll(state, id) || !spend(state, DOCTOR_TREAT[quality])) return null;
  if (quality === "cheap" && !rng.chance(DOCTOR_TREAT.cheapWorks)) return "failed";
  curePerson(state, id);
  changeStat(state, "health", DOCTOR_TREAT.health);
  state.job.sickLeaveUntil = Math.max(state.job.sickLeaveUntil, state.day + ILLNESSES[id].sickLeave);
  return "cured";
}
