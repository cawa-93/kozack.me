// Розмноження (§9.8): тічка, мітки, вагітність, пологи й новонароджені; спадковість (§9.10, §9.11).

import { changeMood, createCat } from "./cat";
import { BREEDING, MODIFIERS, STERILIZATION } from "./config";
import { emit } from "./events";
import { knownBreedHalves } from "./breeds";
import { inheritBreed, inheritGenes, inheritShape } from "./genetics";
import { pickCatName } from "./names";
import { isEnemy, isFriend } from "./relations";
import type { Rng } from "./rng";
import type { Cat, GameState } from "./types";

/** Дорослий для розмноження: від 2 тижнів, нестерилізований (§9.8). */
const fertile = (cat: Cat): boolean => !cat.sterilized && cat.ageWeeks >= BREEDING.minAge;

export const inHeat = (state: GameState, cat: Cat): boolean => state.day <= cat.heatUntil;

/** Кішка годує кошенят: тиждень після пологів. */
export const isNursing = (state: GameState, cat: Cat): boolean => cat.restUntil - state.day > BREEDING.restDays - BREEDING.nursingDays;

/** Вагітність уже помітна: з 3-го дня (§9.8). */
export const showsPregnancy = (state: GameState, cat: Cat): boolean =>
  cat.pregnancy !== null && state.day - (cat.pregnancy.due - 7) >= BREEDING.symptomsFromDay;

/** Множник голоду: вагітна (із симптомами) чи годує кошенят (§9.8). */
export function breedingHunger(state: GameState, cat: Cat): number {
  if (showsPregnancy(state, cat)) return BREEDING.pregnantHunger;
  if (isNursing(state, cat)) return BREEDING.nursingHunger;
  return 1;
}

/** Нестерилізований кіт чи кішка в тічці частіше тікає (§9.8). */
export function escapeBonus(state: GameState, cat: Cat): number {
  return fertile(cat) && (cat.sex === "male" || inHeat(state, cat)) ? BREEDING.escapeBonus : 0;
}

/** Нестерилізований кіт частіше б'ється (§9.8). */
export const fightFactor = (cat: Cat): number => (fertile(cat) && cat.sex === "male" ? BREEDING.fightFactor : 1);

/** Новонароджений (вік 0) лежить біля матері (§9.8). */
export const isNewborn = (cat: Cat): boolean => cat.source === "born" && cat.ageWeeks === 0;

/** Ніч: відновлення після операції й розклад тічки. */
export function nightlyStates(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    if (state.day <= cat.recoveryUntil) changeMood(state, cat, STERILIZATION.recoveryMoodPerDay, "відновлення після операції");
    if (cat.sex !== "female" || !fertile(cat) || cat.pregnancy || isNursing(state, cat)) continue;
    if (cat.nextHeat < 0) cat.nextHeat = state.day + rng.int(0, 6);
    // Спокійний сезон — без тічок, котячий березень — частіше (§4.1).
    if (state.modifiers.week === "calm-season") continue;
    if (state.day + 1 >= cat.nextHeat) {
      cat.heatUntil = state.day + BREEDING.heatDays;
      cat.nextHeat = state.day + (state.modifiers.week === "cat-march" ? MODIFIERS.week.catMarch.heatEvery : BREEDING.heatEvery);
      emit(state, { type: "heat", cat: cat.id });
    }
  }
}

/** Ніч на понеділок (§9.8): кожна придатна кішка вагітніє з шансом 30% від кота, що їй не ворог. */
export function conceive(state: GameState, rng: Rng): void {
  for (const mother of state.cats) {
    // Відпочинок після пологів — до ранку дня `restUntil`, як і пологи рахуються днем, у який входимо: 2 тижні, а не 3
    // (перевірка розмноження 2026-10-28).
    if (mother.sex !== "female" || !fertile(mother) || mother.pregnancy || state.day + 1 < mother.restUntil) continue;
    const fathers = state.cats.filter((c) => c.sex === "male" && fertile(c) && !isEnemy(state, mother, c));
    const week = state.modifiers.week;
    const chance = week === "cat-march" ? MODIFIERS.week.catMarch.pregnancy : week === "calm-season" ? MODIFIERS.week.calmPregnancy : BREEDING.pregnancy;
    if (fathers.length === 0 || !rng.chance(chance)) continue;
    const weights = fathers.map((f) => (isFriend(state, mother, f) ? BREEDING.friendWeight : 1));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    let father = fathers[0];
    for (let i = 0; i < fathers.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll < 0) {
        father = fathers[i];
        break;
      }
    }
    mother.pregnancy = { father: father?.id ?? null, due: state.day + 7, known: false };
    mother.heatUntil = -1;
    emit(state, { type: "pregnant", cat: mother.id });
  }
}

/** Розмір виводку: 1–4, перший — на одне менший, але не менше одного (§9.8). */
function litterSize(rng: Rng, first: boolean): number {
  let roll = rng.next();
  let size = BREEDING.litter.length;
  for (let i = 0; i < BREEDING.litter.length; i++) {
    roll -= BREEDING.litter[i] ?? 0;
    if (roll < 0) {
      size = i + 1;
      break;
    }
  }
  return Math.max(1, first ? size - 1 : size);
}

/**
 * Пологи (§9.8): уночі, уранці персонаж бачить кошенят. Кошеня успадковує гени, форми й породу
 * батьків; характеру ще немає — перша риса з'явиться у віці 1 тиждень.
 */
export function giveBirth(state: GameState, rng: Rng): Cat[] {
  const born: Cat[] = [];
  for (const mother of [...state.cats]) {
    const pregnancy = mother.pregnancy;
    if (!pregnancy || state.day + 1 < pregnancy.due) continue;
    const father = state.cats.find((c) => c.id === pregnancy.father) ?? state.album.find((e) => e.id === pregnancy.father) ?? mother;
    const size = litterSize(rng, mother.litters === 0);
    const before = born.length;
    for (let i = 0; i < size; i++) {
      const sex = rng.chance(0.5) ? "female" : "male";
      const kitten = createCat(state, rng, {
        source: "born",
        ageWeeks: 0,
        sex,
        name: pickCatName(rng, sex, [...state.cats, ...born].map((c) => c.name)),
        at: { x: mother.x + (rng.next() - 0.5) * 0.6, y: mother.y + 0.2 },
      });
      kitten.genes = inheritGenes(rng, sex, mother.genes, father.genes);
      kitten.shape = inheritShape(rng, mother.shape, father.shape);
      kitten.breed = inheritBreed(rng, mother.breed, father.breed);
      // Що видно про породу — за складністю, як у притулку (§9.11): раніше кошеня показувало приховану половину матері.
      kitten.breedKnown = knownBreedHalves(state, kitten.breed, rng);
      kitten.parents = { mother: mother.id, father: pregnancy.father };
      kitten.arrivedDay = state.day + 1;
      kitten.act = { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0 };
      born.push(kitten);
    }
    mother.pregnancy = null;
    mother.litters += 1;
    mother.restUntil = state.day + 1 + BREEDING.restDays;
    emit(state, { type: "birth", cat: mother.id, kittens: born.length - before });
  }
  return born;
}

/** Мати новонародженого: біля неї кошеня лежить у гнізді. */
export function motherOf(state: GameState, kitten: Cat): Cat | null {
  return state.cats.find((c) => c.id === kitten.parents.mother) ?? null;
}

