// Хвороби котів (§9.5, `DISEASES.md`): як кіт захворює, «безпечний» термін і шкода, симптоми,
// лікування вдома, заразність. Ветеринара додасть крок 11 плану.

import { changeHealth, changeMood, isAdapting, isOld, lifeMood, offend, traitLevel, weightOf } from "./cat";
import { unpleasantTask } from "./character";
import { DISEASES, ILLNESS, MEDICINE, SYMPTOMS, WEIGHT } from "./config";
import { useSupply } from "./economy";
import { emit } from "./events";
import { catIllnessFactor } from "./modifiers";
import { isFriend } from "./relations";
import type { Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { Cat, CatDisease, DiseaseId, GameState, Medicine } from "./types";

export const hasDisease = (cat: Cat, id: DiseaseId): boolean => cat.diseases.some((d) => d.id === id);

/** Шанс з урахуванням «Витривалості» й складності (§9.5). */
export function illnessChance(state: GameState, cat: Cat, base: number): number {
  const hardiness = Math.max(0, 1 - ILLNESS.hardinessStep * traitLevel(cat, "hardiness"));
  return Math.min(1, base * hardiness * ILLNESS.difficulty[state.difficulty] * catIllnessFactor(state));
}

/** Кіт захворів (якщо ще не хворіє цим). */
export function fallIll(state: GameState, cat: Cat, id: DiseaseId): boolean {
  if (hasDisease(cat, id)) return false;
  cat.diseases.push({ id, day: state.day, doses: 0, diet: 0, calm: 0, controlled: null, known: false });
  emit(state, { type: "cat-ill", cat: cat.id, disease: id });
  return true;
}

/** Хронічну сьогодні контролюють ліки чи ветеринар (§9.5). */
export const isControlled = (state: GameState, disease: CatDisease): boolean =>
  DISEASES[disease.id].cure.kind === "control" && disease.controlled !== null && disease.controlled >= state.day;

/** Хвороба шкодить: «безпечні» дні минули, і її не контролюють (§9.5). */
const harms = (state: GameState, disease: CatDisease): boolean => !isControlled(state, disease) && state.day - disease.day >= DISEASES[disease.id].safe;

/** Хоч одна хвороба кота сьогодні шкодить — гарний настрій здоров'я не відновлює (§9.5, рішення автора 2026-10-27, Х5). */
export const isHurting = (state: GameState, cat: Cat): boolean => cat.diseases.some((d) => harms(state, d));

/** Спробувати заразити з шансом (з «Витривалістю» й складністю). */
export function maybeFallIll(state: GameState, cat: Cat, id: DiseaseId, base: number, rng: Rng): boolean {
  return !hasDisease(cat, id) && rng.chance(illnessChance(state, cat, base)) && fallIll(state, cat, id);
}

/** Хвороба минула. Після застуди — раз кон'юнктивіт з шансом 30% (рішення автора 2026-10-27, Х2). */
function cure(state: GameState, cat: Cat, disease: CatDisease, rng: Rng): void {
  cat.diseases = cat.diseases.filter((d) => d !== disease);
  emit(state, { type: "cat-cured", cat: cat.id, disease: disease.id });
  if (disease.id === "cold") maybeFallIll(state, cat, "conjunctivitis", ILLNESS.afterCold, rng);
}

/** Вилікувати хворобу, якщо кіт нею хворіє (ветеринар, дорогий шампунь). */
export function cureDisease(state: GameState, cat: Cat, id: DiseaseId, rng: Rng): boolean {
  const disease = cat.diseases.find((d) => d.id === id);
  if (disease) cure(state, cat, disease, rng);
  return disease !== undefined;
}

// --- Симптоми -------------------------------------------------------------------------------

/** Множник втоми: застуда й старечі болячки — кіт більше спить. */
export const fatigueFactor = (cat: Cat): number => (hasDisease(cat, "cold") || hasDisease(cat, "senior") ? SYMPTOMS.tired : 1);
/** Множник відновлення сну: блохи заважають спати. */
export const sleepFactor = (cat: Cat): number => (hasDisease(cat, "fleas") ? SYMPTOMS.fleasSleep : 1);
export const hungerFactor = (cat: Cat): number => (hasDisease(cat, "worms") ? SYMPTOMS.wormsHunger : 1);
export const toiletFactor = (cat: Cat): number => (hasDisease(cat, "cystitis") || hasDisease(cat, "urolithiasis") ? SYMPTOMS.cystitisToilet : 1);
/** Травма: кіт кульгає; з ожирінням ходить важко (§9.12, «Схильність до повноти»). */
export const walkFactor = (cat: Cat): number => (hasDisease(cat, "injury") ? SYMPTOMS.limp : 1) * (hasDisease(cat, "obesity") ? WEIGHT.obeseWalk : 1);
/** Ожиріння (§9.5, §9.12): менше грається й не лізе нагору. */
export const isObese = (cat: Cat): boolean => hasDisease(cat, "obesity");

/**
 * Кіт нездужає (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г5): будь-яка хвороба, зокрема травма, — крім старості й
 * ожиріння (з ними кіт не хворий, а старий чи повний) і бліх та глистів (з ними кіт почувається нормально, рішення автора
 * 2026-10-27, Х11). Такий гратися не погоджується й шипить на того, хто кличе, і сам гратися не кличе (рішення автора 2026-10-26
 * після блоку 4).
 */
const FEELS_FINE: readonly DiseaseId[] = ["senior", "obesity", "fleas", "worms"];
export const isUnwell = (cat: Cat): boolean => cat.diseases.some((d) => !FEELS_FINE.includes(d.id));
/** «Сюрприз» повз лоток від розладу шлунка чи циститу. */
export const missesLitter = (cat: Cat, rng: Rng): boolean =>
  (hasDisease(cat, "stomach") || hasDisease(cat, "cystitis")) && rng.chance(SYMPTOMS.outsideLitter);

/** Видимі симптоми щохвилини: чхання, свербіж, тертя очей (§9.5). */
export function showSymptoms(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const chance = (SYMPTOMS.showPerHour * minutes) / 60;
  if (hasDisease(cat, "cold") && rng.chance(chance)) emit(state, { type: "symptom", cat: cat.id, symptom: "sneeze" });
  if (hasDisease(cat, "fleas") && rng.chance(chance)) emit(state, { type: "symptom", cat: cat.id, symptom: "itch" });
  if (hasDisease(cat, "conjunctivitis") && rng.chance(chance)) emit(state, { type: "symptom", cat: cat.id, symptom: "eyes" });
}

/** Кіт поїв (§9.5): дешевий корм іноді засмучує шлунок, дорогий — дієта для нього. */
export function afterMeal(state: GameState, cat: Cat, premium: boolean, rng: Rng): void {
  const stomach = cat.diseases.find((d) => d.id === "stomach");
  const diet = DISEASES.stomach.cure;
  if (stomach && premium && diet.kind === "diet") {
    stomach.diet += 1;
    if (stomach.diet >= diet.portions) cure(state, cat, stomach, rng);
  }
  if (!premium) maybeFallIll(state, cat, "stomach", ILLNESS.cheapFoodStomach, rng);
}

/** Чи зригне кіт одразу після їжі через розлад шлунка. */
export const vomitsAfterMeal = (cat: Cat, rng: Rng): boolean => hasDisease(cat, "stomach") && rng.chance(SYMPTOMS.stomachVomit);

/** Кіт украв людську їжу (§9.5): глисти й розлад шлунка. */
export function afterTheft(state: GameState, cat: Cat, rng: Rng): void {
  maybeFallIll(state, cat, "worms", ILLNESS.stolenWorms, rng);
  maybeFallIll(state, cat, "stomach", ILLNESS.stolenStomach, rng);
}

// --- Ніч ------------------------------------------------------------------------------------

/**
 * Ніч (§9.5): перебіг кожної хвороби — після «безпечного» терміну щоденна шкода, поки не вилікують, не візьмуть під
 * контроль чи гостра не мине сама; хворий кіт сумує; нові хвороби й зараження.
 */
export function nightlyDiseases(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    const today = cat.moodHistory[cat.moodHistory.length - 1] ?? lifeMood(cat);
    for (const disease of [...cat.diseases]) {
      const rule = DISEASES[disease.id];
      if (rule.cure.kind === "calm") {
        disease.calm = today >= ILLNESS.calmMood ? disease.calm + 1 : 0;
        if (disease.calm >= rule.cure.days) {
          cure(state, cat, disease, rng);
          continue;
        }
      }
      // Ожиріння минає, щойно вага повернулася майже до норми (§9.12, «Схильність до повноти»).
      if (rule.cure.kind === "weight" && weightOf(cat) < WEIGHT.cured) {
        cure(state, cat, disease, rng);
        continue;
      }
      const days = state.day - disease.day;
      if (harms(state, disease)) changeHealth(state, cat, -rule.damage, `disease:${disease.id}`);
      // Гострі минають самі (рішення автора 2026-10-27, Х1): остання ніч ще шкодить.
      if (rule.recovers !== null && days + 1 >= rule.recovers) cure(state, cat, disease, rng);
    }
    // Хронічна під контролем настрою не псує (рішення автора 2026-10-27, Х9).
    if (cat.diseases.some((d) => !isControlled(state, d))) changeMood(state, cat, ILLNESS.moodPerDay, "хворіє");
    // Нові хвороби. Ожиріння — не випадок, а вага (§9.12): «Витривалість» і складність на нього не діють.
    if (weightOf(cat) >= WEIGHT.obese) fallIll(state, cat, "obesity");
    maybeFallIll(state, cat, "cold", ILLNESS.cold, rng);
    maybeFallIll(state, cat, "conjunctivitis", ILLNESS.conjunctivitis, rng);
    // Новий кіт у перші дні сумує від переїзду: це ще не стрес, що доводить до циститу.
    if (today < ILLNESS.cystitisMood && !isAdapting(state, cat)) maybeFallIll(state, cat, "cystitis", ILLNESS.cystitis, rng);
  }
  spread(state, rng);
}

/** Заразні хвороби (§9.5): друзям легше, через лоток — коли лотків замало. */
function spread(state: GameState, rng: Rng): void {
  const litters = state.home.items.filter((i) => i.kind === "litter").length;
  const sick = state.cats.flatMap((cat) => cat.diseases.map((d) => ({ cat, id: d.id })));
  for (const { cat, id } of sick) {
    const way = DISEASES[id].contagious;
    if (way === null) continue;
    for (const other of state.cats) {
      if (other.id === cat.id || other.away !== null) continue;
      const chance =
        way === "litter"
          ? litters < state.cats.length + 1
            ? ILLNESS.litterContagion
            : 0
          : isFriend(state, cat, other)
            ? ILLNESS.friendContagion
            : ILLNESS.otherContagion;
      if (chance > 0) maybeFallIll(state, other, id, chance, rng);
    }
  }
}

/** Ніч на понеділок (§9.5): старечі болячки в котів понад межу віку. */
export function weeklyDiseases(state: GameState, rng: Rng): void {
  for (const cat of state.cats) if (isOld(cat)) maybeFallIll(state, cat, "senior", ILLNESS.seniorPerWeek, rng);
}

// --- Ліки вдома -----------------------------------------------------------------------------

/** Кіт на руках, поруч шафка з ліками, і ліки є (§9.5). */
export function medicineCat(state: GameState): Cat | null {
  const held = state.character.held;
  if (held?.kind !== "cat") return null;
  return state.cats.find((c) => c.id === held.cat) ?? null;
}

/**
 * Дати ліки коту на руках (§9.5): неприємне завдання, любов −1. Таблетка діє на кожну хворобу, яку
 * лікують таблетками (і контролює хронічну), краплі — так само; та сама доза раніше ніж за 6 годин —
 * кіт випльовує. Повертає, чи були ліки.
 */
export function giveMedicine(state: GameState, medicine: Medicine, rng: Rng): boolean {
  const cat = medicineCat(state);
  if (!cat) return false;
  const quality = useSupply(state, medicine);
  if (quality === null) return false;
  unpleasantTask(state, MEDICINE.sanity);
  offend(state, cat, MEDICINE.love, "дали ліки");
  cat.interacted = true;
  // Та сама доза раніше ніж за 6 годин — кіт випльовує: ліки витрачено, але не діють (рішення автора 2026-10-27, Х3).
  const now = absoluteMinute(state.day, state.minute);
  const last = cat.lastDose?.[medicine];
  if (last !== undefined && now - last < MEDICINE.doseMinutes) {
    emit(state, { type: "medicine-spat", cat: cat.id, medicine });
    return true;
  }
  (cat.lastDose ??= {})[medicine] = now;
  for (const disease of [...cat.diseases]) {
    const rule = DISEASES[disease.id].cure;
    // Таблетка контролює сьогодні, але не скорочує тиждень контролю від ветеринара.
    if (rule.kind === "control" && rule.medicine === medicine) disease.controlled = Math.max(disease.controlled ?? state.day, state.day);
    if (rule.kind !== medicine) continue;
    if (quality === "cheap" && !rng.chance(MEDICINE.cheapWorks)) continue;
    disease.doses += 1;
    if (disease.doses >= rule.doses) cure(state, cat, disease, rng);
  }
  emit(state, { type: "medicine", cat: cat.id, medicine, quality });
  return true;
}
