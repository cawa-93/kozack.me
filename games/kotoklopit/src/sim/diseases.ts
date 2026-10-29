// Хвороби котів (§9.5, `DISEASES.md`): як кіт захворює, «безпечний» термін і шкода, симптоми,
// лікування вдома, заразність, схильності порід. Ветеринар — у `destinations.ts`.

import { riskHalves } from "./breeds";
import { changeHealth, changeMood, isAdapting, isKitten, isOld, lifeMood, offend, traitLevel, weightOf } from "./cat";
import { unpleasantTask } from "./character";
import { BREED_RISK, DISEASES, ILLNESS, MEDICINE, SYMPTOMS, WEIGHT } from "./config";
import { useSupply } from "./economy";
import { emit } from "./events";
import { catIllnessFactor, isCold, isHot } from "./modifiers";
import { isFriend } from "./relations";
import { isNewborn } from "./reproduction";
import { enoughFor } from "./resources";
import type { Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { Cat, CatDisease, DiseaseId, GameState, Medicine } from "./types";

export const hasDisease = (cat: Cat, id: DiseaseId): boolean => cat.diseases.some((d) => d.id === id);

/** Шанс з урахуванням «Витривалості», складності й схильності породи (§9.5). */
export function illnessChance(state: GameState, cat: Cat, id: DiseaseId, base: number): number {
  const hardiness = Math.max(0, 1 - ILLNESS.hardinessStep * traitLevel(cat, "hardiness"));
  const risk = BREED_RISK.diseases[id];
  const breed = risk === undefined ? 1 : 1 + BREED_RISK.step * riskHalves(cat.breed, risk);
  return Math.min(1, base * hardiness * breed * ILLNESS.difficulty[state.difficulty] * catIllnessFactor(state));
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
  return !hasDisease(cat, id) && rng.chance(illnessChance(state, cat, id, base)) && fallIll(state, cat, id);
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

/** Множник втоми: застуда, старечі болячки, серце й дихання (рішення автора 2026-10-28, Д1) — кіт швидко втомлюється й більше спить. */
export const fatigueFactor = (cat: Cat): number =>
  hasDisease(cat, "cold") || hasDisease(cat, "senior") || hasDisease(cat, "heart") || hasDisease(cat, "breathing") ? SYMPTOMS.tired : 1;
/** Множник відновлення сну: блохи заважають спати. */
export const sleepFactor = (cat: Cat): number => (hasDisease(cat, "fleas") ? SYMPTOMS.fleasSleep : 1);
export const hungerFactor = (cat: Cat): number => (hasDisease(cat, "worms") ? SYMPTOMS.wormsHunger : 1);
export const toiletFactor = (cat: Cat): number => (hasDisease(cat, "cystitis") || hasDisease(cat, "urolithiasis") ? SYMPTOMS.cystitisToilet : 1);
/** Травма: кіт кульгає; з ожирінням ходить важко (§9.12, «Схильність до повноти»); старечі болячки — повільніший. */
export const walkFactor = (cat: Cat): number =>
  (hasDisease(cat, "injury") ? SYMPTOMS.limp : 1) *
  (hasDisease(cat, "obesity") ? WEIGHT.obeseWalk : 1) *
  (hasDisease(cat, "senior") ? SYMPTOMS.seniorWalk : 1) *
  (hasDisease(cat, "joints") ? SYMPTOMS.jointsWalk : 1) *
  (hasDisease(cat, "spine") ? SYMPTOMS.spineWalk : 1);
/** Гінгівіт: жує одним боком — їсть довше. */
export const eatFactor = (cat: Cat): number => (hasDisease(cat, "gingivitis") ? SYMPTOMS.gingivitisEat : 1);
/** Застуда й розлад шлунка: кіт менше їсть — з миски пів порції, як слабкий (§9.5; крок 17, звірка з довідниками 2026-10-28). */
export const eatsLess = (cat: Cat): boolean => hasDisease(cat, "cold") || hasDisease(cat, "stomach");
/** Ожиріння (§9.5, §9.12): менше грається й не лізе нагору. */
export const isObese = (cat: Cat): boolean => hasDisease(cat, "obesity");
/** Нагору не стрибне: з ожирінням (§9.12), травмою (§9.5, рішення автора 2026-10-27, Х6) чи хворими суглобами (рішення автора 2026-10-28, Д1). */
export const cannotJump = (cat: Cat): boolean => isObese(cat) || hasDisease(cat, "injury") || hasDisease(cat, "joints");

/**
 * Кіт нездужає (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г5): будь-яка хвороба, зокрема травма, — крім старості й
 * ожиріння (з ними кіт не хворий, а старий чи повний) і бліх та глистів (з ними кіт почувається нормально, рішення автора
 * 2026-10-27, Х11). Такий гратися не погоджується й шипить на того, хто кличе, і сам гратися не кличе (рішення автора 2026-10-26
 * після блоку 4).
 */
// Нові хронічні й гінгівіт (рішення автора 2026-10-28, Д1) — як старечі болячки: шкодять здоров'ю, а не грі.
const FEELS_FINE: readonly DiseaseId[] = ["senior", "obesity", "fleas", "worms", "heart", "joints", "spine", "breathing", "gingivitis"];
export const isUnwell = (cat: Cat): boolean => cat.diseases.some((d) => !FEELS_FINE.includes(d.id));
/** «Сюрприз» повз лоток від розладу шлунка чи циститу. */
export const missesLitter = (cat: Cat, rng: Rng): boolean =>
  (hasDisease(cat, "stomach") || hasDisease(cat, "cystitis")) && rng.chance(SYMPTOMS.outsideLitter);

/** Видимі симптоми щохвилини: чхання, свербіж (блохи, дерматит — рішення автора 2026-10-27, Х6), тертя очей (§9.5). */
export function showSymptoms(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const chance = (SYMPTOMS.showPerHour * minutes) / 60;
  if (hasDisease(cat, "cold") && rng.chance(chance)) emit(state, { type: "symptom", cat: cat.id, symptom: "sneeze" });
  if ((hasDisease(cat, "fleas") || hasDisease(cat, "dermatitis")) && rng.chance(chance)) emit(state, { type: "symptom", cat: cat.id, symptom: "itch" });
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
      // Дихання в «Спеку» й «Хвилю спеки» шкодить удвічі (рішення автора 2026-10-28, Д1).
      const heat = disease.id === "breathing" && isHot(state) ? ILLNESS.breathingHeat : 1;
      if (harms(state, disease)) changeHealth(state, cat, -rule.damage * heat, `disease:${disease.id}`);
      // Гострі минають самі (рішення автора 2026-10-27, Х1): остання ніч ще шкодить.
      if (rule.recovers !== null && days + 1 >= rule.recovers) cure(state, cat, disease, rng);
    }
    // Хронічна під контролем настрою не псує (рішення автора 2026-10-27, Х9).
    if (cat.diseases.some((d) => !isControlled(state, d))) changeMood(state, cat, ILLNESS.moodPerDay, "хворіє");
    // Нові хвороби. Ожиріння — не випадок, а вага (§9.12): «Витривалість» і складність на нього не діють.
    if (weightOf(cat) >= WEIGHT.obese) fallIll(state, cat, "obesity");
    // Зайва вага тисне на суглоби (рішення автора 2026-10-28, Д1).
    if (isObese(cat)) maybeFallIll(state, cat, "joints", ILLNESS.jointsObese, rng);
    // У «Холод» і «Похолодання» застуда частіша (рішення автора 2026-10-28, Д2).
    maybeFallIll(state, cat, "cold", ILLNESS.cold * (isCold(state) ? ILLNESS.coldWeather : 1), rng);
    // Блохи кілька днів: кіт ковтає їх, вилизуючись, — глисти; шкіра роздерта — дерматит (рішення автора 2026-10-28, Д2).
    const fleas = cat.diseases.find((d) => d.id === "fleas");
    if (fleas && state.day - fleas.day >= ILLNESS.fleasWormsDays) maybeFallIll(state, cat, "worms", ILLNESS.fleasWorms, rng);
    if (fleas && state.day - fleas.day >= ILLNESS.fleasDermatitisDays) maybeFallIll(state, cat, "dermatitis", ILLNESS.fleasDermatitis, rng);
    maybeFallIll(state, cat, "conjunctivitis", ILLNESS.conjunctivitis, rng);
    // Новий кіт у перші дні сумує від переїзду: це ще не стрес, що доводить до циститу.
    if (today < ILLNESS.cystitisMood && !isAdapting(state, cat)) maybeFallIll(state, cat, "cystitis", ILLNESS.cystitis, rng);
  }
  spread(state, rng);
}

/** Заразні хвороби (§9.5): друзям легше, через лоток — коли лотків замало. */
function spread(state: GameState, rng: Rng): void {
  // Лотків замало — як для сварок (Р3, Р4): чистих менше, ніж котів + 1, але не більше, ніж є місць; брудний не рахується
  // (загальна ревізія 2026-10-29: раніше рахували всі лотки без межі місць, і від 6 котів глисти йшли через лоток завжди).
  // Новонароджені в лоток не ходять (§9.8): лотків «замало» рахують без них (`enoughFor`), і через лоток вони не заражаються
  // (перевірка розмноження 2026-10-28).
  const littersShort = !enoughFor(state, "litter");
  const sick = state.cats.flatMap((cat) => cat.diseases.map((d) => ({ cat, id: d.id })));
  for (const { cat, id } of sick) {
    const way = DISEASES[id].contagious;
    if (way === null) continue;
    for (const other of state.cats) {
      if (other.id === cat.id || other.away !== null) continue;
      if (way === "litter" && isNewborn(other)) continue;
      const chance =
        way === "litter"
          ? littersShort
            ? ILLNESS.litterContagion
            : 0
          : isFriend(state, cat, other)
            ? ILLNESS.friendContagion
            : ILLNESS.otherContagion;
      if (chance > 0) maybeFallIll(state, other, id, chance, rng);
    }
  }
}

/** Хвороби, що бувають лише від породи (хребет, дихання; рішення автора 2026-10-28, Д1). */
const BREED_ONLY: readonly DiseaseId[] = ["spine", "breathing"];

/**
 * Кіт постаршав (§9.5, §9.1): старечі болячки понад межу віку — шанс раз на його тиждень; дорослому — серце, суглоби (понад
 * межу віку), гінгівіт і породні хребет та дихання (рішення автора 2026-10-28, Д1).
 */
export function agingDiseases(state: GameState, cat: Cat, rng: Rng): void {
  const old = isOld(cat);
  if (old) maybeFallIll(state, cat, "senior", ILLNESS.seniorPerWeek, rng);
  if (isKitten(cat)) return;
  maybeFallIll(state, cat, "heart", ILLNESS.heartPerWeek * (old ? ILLNESS.heartOld : 1), rng);
  if (old) maybeFallIll(state, cat, "joints", ILLNESS.jointsOldPerWeek, rng);
  maybeFallIll(state, cat, "gingivitis", ILLNESS.gingivitisPerWeek, rng);
  for (const id of BREED_ONLY) {
    const risk = BREED_RISK.diseases[id];
    if (risk !== undefined && riskHalves(cat.breed, risk) > 0) maybeFallIll(state, cat, id, ILLNESS.breedOnlyPerWeek, rng);
  }
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
    const control = rule.kind === "control" && rule.medicine === medicine;
    if (!control && rule.kind !== medicine) continue;
    // Дешева доза діє з шансом 70% — і для хронічної теж (§9.5; крок 17, звірка з довідниками 2026-10-28: контролювала завжди).
    if (quality === "cheap" && !rng.chance(MEDICINE.cheapWorks)) continue;
    // Таблетка контролює сьогодні, але не скорочує тиждень контролю від ветеринара.
    if (rule.kind === "control") {
      disease.controlled = Math.max(disease.controlled ?? state.day, state.day);
      continue;
    }
    disease.doses += 1;
    if (disease.doses >= rule.doses) cure(state, cat, disease, rng);
  }
  emit(state, { type: "medicine", cat: cat.id, medicine, quality });
  return true;
}
