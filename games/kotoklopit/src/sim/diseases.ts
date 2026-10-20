// Хвороби котів (§9.5, `DISEASES.md`): як кіт захворює, «безпечний» термін і шкода, симптоми,
// лікування вдома, заразність. Ветеринара додасть крок 11 плану.

import { changeHealth, changeLove, changeMood, isOld, lifeMood, traitLevel } from "./cat";
import { unpleasantTask } from "./character";
import { DISEASES, ILLNESS, MEDICINE, SYMPTOMS } from "./config";
import { takeSupply } from "./economy";
import { emit } from "./events";
import { isFriend } from "./relations";
import type { Rng } from "./rng";
import type { Cat, CatDisease, DiseaseId, GameState, Medicine } from "./types";

export const hasDisease = (cat: Cat, id: DiseaseId): boolean => cat.diseases.some((d) => d.id === id);

/** Шанс з урахуванням «Витривалості» й складності (§9.5). */
export function illnessChance(state: GameState, cat: Cat, base: number): number {
  const hardiness = Math.max(0, 1 - ILLNESS.hardinessStep * traitLevel(cat, "hardiness"));
  return Math.min(1, base * hardiness * ILLNESS.difficulty[state.difficulty]);
}

/** Кіт захворів (якщо ще не хворіє цим). */
export function fallIll(state: GameState, cat: Cat, id: DiseaseId): boolean {
  if (hasDisease(cat, id)) return false;
  cat.diseases.push({ id, day: state.day, doses: 0, diet: 0, calm: 0, controlled: null, known: false });
  emit(state, { type: "cat-ill", cat: cat.id, disease: id });
  return true;
}

/** Спробувати заразити з шансом (з «Витривалістю» й складністю). */
export function maybeFallIll(state: GameState, cat: Cat, id: DiseaseId, base: number, rng: Rng): boolean {
  return !hasDisease(cat, id) && rng.chance(illnessChance(state, cat, base)) && fallIll(state, cat, id);
}

function cure(state: GameState, cat: Cat, disease: CatDisease): void {
  cat.diseases = cat.diseases.filter((d) => d !== disease);
  emit(state, { type: "cat-cured", cat: cat.id, disease: disease.id });
}

// --- Симптоми -------------------------------------------------------------------------------

/** Множник втоми: застуда й старечі болячки — кіт більше спить. */
export const fatigueFactor = (cat: Cat): number => (hasDisease(cat, "cold") || hasDisease(cat, "senior") ? SYMPTOMS.tired : 1);
/** Множник відновлення сну: блохи заважають спати. */
export const sleepFactor = (cat: Cat): number => (hasDisease(cat, "fleas") ? SYMPTOMS.fleasSleep : 1);
export const hungerFactor = (cat: Cat): number => (hasDisease(cat, "worms") ? SYMPTOMS.wormsHunger : 1);
export const toiletFactor = (cat: Cat): number => (hasDisease(cat, "cystitis") ? SYMPTOMS.cystitisToilet : 1);
/** Травма: кіт кульгає. */
export const walkFactor = (cat: Cat): number => (hasDisease(cat, "injury") ? SYMPTOMS.limp : 1);
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
    if (stomach.diet >= diet.portions) cure(state, cat, stomach);
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
 * Ніч (§9.5): перебіг кожної хвороби — після «безпечного» терміну щоденна шкода, поки не вилікують
 * чи не візьмуть під контроль; хворий кіт сумує; нові хвороби й зараження.
 */
export function nightlyDiseases(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    const today = cat.moodHistory[cat.moodHistory.length - 1] ?? lifeMood(cat);
    for (const disease of [...cat.diseases]) {
      const rule = DISEASES[disease.id];
      if (rule.cure.kind === "calm") {
        disease.calm = today >= ILLNESS.calmMood ? disease.calm + 1 : 0;
        if (disease.calm >= rule.cure.days) {
          cure(state, cat, disease);
          continue;
        }
      }
      const controlled = rule.cure.kind === "control" && disease.controlled === state.day;
      if (!controlled && state.day - disease.day >= rule.safe) changeHealth(state, cat, -rule.damage, `disease:${disease.id}`);
    }
    if (cat.diseases.length > 0) changeMood(state, cat, ILLNESS.moodPerDay, "хворіє");
    // Нові хвороби.
    const hadCold = hasDisease(cat, "cold");
    maybeFallIll(state, cat, "cold", ILLNESS.cold, rng);
    maybeFallIll(state, cat, "conjunctivitis", hadCold ? ILLNESS.afterCold : ILLNESS.conjunctivitis, rng);
    if (today < ILLNESS.cystitisMood) maybeFallIll(state, cat, "cystitis", ILLNESS.cystitis, rng);
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
 * лікують таблетками (і контролює хронічну), краплі — так само. Повертає, чи були ліки.
 */
export function giveMedicine(state: GameState, medicine: Medicine, rng: Rng): boolean {
  const cat = medicineCat(state);
  if (!cat) return false;
  const quality = takeSupply(state, medicine);
  if (quality === null) return false;
  unpleasantTask(state, MEDICINE.sanity);
  changeLove(state, cat, MEDICINE.love, "дали ліки");
  cat.interacted = true;
  for (const disease of [...cat.diseases]) {
    const rule = DISEASES[disease.id].cure;
    if (rule.kind === "control" && rule.medicine === medicine) disease.controlled = state.day;
    if (rule.kind !== medicine) continue;
    if (quality === "cheap" && !rng.chance(MEDICINE.cheapWorks)) continue;
    disease.doses += 1;
    if (disease.doses >= rule.doses) cure(state, cat, disease);
  }
  emit(state, { type: "medicine", cat: cat.id, medicine, quality });
  return true;
}
