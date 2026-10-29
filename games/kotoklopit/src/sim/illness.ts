// Хвороби персонажа (§6.5): застуда, травма, виснаження; ліки з магазину й лікар з лікарняним.

import { changeStat, spend } from "./character";
import { DOCTOR_TREAT, ILLNESS_EFFECTS, ILLNESSES, SLEEP_STAT_FLOOR, TRIPS } from "./config";
import { useSupply } from "./economy";
import { emit } from "./events";
import { onSickLeave } from "./work";
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
  // Вилікуване виснаження знімає й накопичений недосип: рахунок трьох коротких ночей починається заново (§6.5, загальна
  // ревізія 2026-10-29). Інакше після лікаря одна коротка ніч одразу повертала хворобу. Після доброго сну лічильник і так 0.
  if (id === "exhaustion") state.character.shortNights = 0;
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

/** Застуда й травма — без ривка (§6.5; травма — рішення автора 2026-10-29, `GENERAL_REVIEW.md`, дрібні питання — «Травма й ривок»). */
export const canDashWhenIll = (state: GameState): boolean => !isIll(state, "cold") && !isIll(state, "injury");

/**
 * Ніч (§6.5): виснаження від недосипу кілька ночей поспіль і одужання від доброго сну; щоденна шкода здоров'ю —
 * з першої ночі (безпечного терміну немає, правка автора 2026-10-22). Уві сні показники не нижче 5 (§8.8): хвороба не вбиває вночі.
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
/** Персонаж хворий тим, що лікують ліками (§6.5), — хай навіть сьогоднішню дозу вже випито. */
export function treatable(state: GameState): boolean {
  return state.character.illnesses.some((i) => ILLNESSES[i.id].doses !== null);
}

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

/**
 * Лікування в лікаря (§6.5): хвороба минає, здоров'я +10, лікарняний з завтра. Огляду перед ним немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6):
 * лікар лікує те, що видно на панелі, і гроші бере лише за лікування.
 */
export function doctorTreat(state: GameState, id: IllnessId, quality: "cheap" | "premium", rng: Rng): "cured" | "failed" | null {
  const trip = state.trip;
  if (trip?.destination !== "doctor" || !isIll(state, id)) return null;
  // Дешеве цієї поїздки не допомогло — цю хворобу вже не лікують, ні дешевим, ні дорогим (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
  if (trip.log?.done.includes(`self:${id}:failed`) || !spend(state, DOCTOR_TREAT[quality], "health")) return null;
  // Прийом — година, скільки б хвороб лікар не лікував; без лікування на місці минає 15 хвилин
  // (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
  trip.visit = Math.max(trip.visit, TRIPS.doctor.visit);
  const result = quality === "cheap" && !rng.chance(DOCTOR_TREAT.cheapWorks) ? "failed" : "cured";
  // Що дало лікування — у журнал візиту: картка показує це в рядку хвороби.
  (trip.log ??= { exam: null, done: [] }).done.push(`self:${id}:${result}`);
  if (result === "failed") return "failed";
  curePerson(state, id);
  changeStat(state, "health", DOCTOR_TREAT.health);
  // Лікарняний — від завтра (§6.5): сьогодні ще робочий день, і дорога додому в робочий час — поїздка зі штрафом (перевірка
  // поїздок 2026-10-28; раніше лікарняний діяв уже сьогодні). Хто вже на лікарняному, тому він подовжується.
  if (!onSickLeave(state)) state.job.sickLeaveFrom = state.day + 1;
  state.job.sickLeaveUntil = Math.max(state.job.sickLeaveUntil, state.day + ILLNESSES[id].sickLeave);
  return "cured";
}
