// Розмноження (§9.8): тічка, мітки, вагітність, пологи й новонароджені; спадковість (§9.10, §9.11).

import { changeMood, createCat, idleAct, pastCatNames, takenCatNames } from "./cat";
import { visibleFloorNear } from "./catmove";
import { BREEDING, MODIFIERS, STERILIZATION } from "./config";
import { emit } from "./events";
import { breedById, knownBreedHalves, MIXED } from "./breeds";
import { applyPureBreedLook, fitBreedForms, inheritBreed, inheritGenes, inheritShape } from "./genetics";
import { itemPoint } from "./home";
import { pickCatName } from "./names";
import { isEnemy, isFriend } from "./relations";
import type { Rng } from "./rng";
import type { Cat, CatAct, GameState, HouseItem } from "./types";

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

/** Новонароджений (вік 0) лежить у гнізді чи біля матері (§9.8). */
export const isNewborn = (cat: Cat): boolean => cat.source === "born" && cat.ageWeeks === 0;

/** Гніздо новонародженого (§9.8); будиночок викинули, він зламався чи в руках персонажа — null. */
export function nestOf(state: GameState, kitten: Cat): HouseItem | null {
  if (kitten.nest === undefined || !isNewborn(kitten)) return null;
  const item = state.home.items.find((i) => i.id === kitten.nest);
  return item?.kind === "house" ? item : null;
}

/** Гніздо матері: будиночок її новонароджених (§9.8). */
export function motherNest(state: GameState, mother: Cat): HouseItem | null {
  for (const kitten of state.cats) {
    const nest = kitten.parents.mother === mother.id ? nestOf(state, kitten) : null;
    if (nest) return nest;
  }
  return null;
}

/** Будиночок — гніздо: інші коти туди не заходять (§9.8). */
export const isNest = (state: GameState, house: HouseItem): boolean => state.cats.some((kitten) => isNewborn(kitten) && kitten.nest === house.id);

/** Ціль дії кота в будиночку. */
export const nestTarget = (house: HouseItem): string => `item:${house.id}`;

/** Новонароджений спить — у гнізді (`target`) чи на підлозі (null). */
export const newbornSleep = (target: string | null): CatAct => ({ kind: "sleep", target, goal: null, minutes: 600, elapsed: 0 });

/** Кіт дійшов до будиночка й спить чи ховається всередині (§8.7). */
const insideHouse = (cat: Cat, house: HouseItem): boolean =>
  cat.away === null && cat.act.goal === null && (cat.act.kind === "sleep" || cat.act.kind === "hide") && cat.act.target === nestTarget(house);

/**
 * Будиночок для пологів (§9.8): вільний — спершу дорогий, серед однакових найближчий до матері; немає — null. `born` — кошенята
 * цієї ночі: у `state.cats` їх ще немає, і друга мати обрала б те саме гніздо.
 */
function pickNest(state: GameState, mother: Cat, born: readonly Cat[]): HouseItem | null {
  const from = (house: HouseItem): number => Math.hypot(itemPoint(house).x - mother.x, itemPoint(house).y - mother.y);
  const free = state.home.items.filter(
    (item): item is HouseItem =>
      item.kind === "house" && !isNest(state, item) && !born.some((kitten) => kitten.nest === item.id) && !state.cats.some((cat) => cat !== mother && insideHouse(cat, item)),
  );
  return free.sort((a, b) => Number(b.quality === "premium") - Number(a.quality === "premium") || from(a) - from(b))[0] ?? null;
}

/** Мати, якщо вона вдома, лягає в гніздо, а хто йшов туди, шукає інше (§9.8, §8.7). */
function settleNest(state: GameState, mother: Cat, nest: HouseItem): void {
  const target = nestTarget(nest);
  for (const cat of state.cats) if (cat !== mother && cat.act.target === target) cat.act = idleAct();
  const held = state.character.held;
  if (mother.away !== null || (held?.kind === "cat" && held.cat === mother.id)) return;
  const at = itemPoint(nest);
  mother.x = at.x;
  mother.y = at.y;
  mother.act = newbornSleep(target);
}

/**
 * Ніч: відновлення після операції й розклад тічки. `week` — модифікатор тижня дня, у який входимо: у ніч на понеділок — уже
 * нового тижня (перевірка модифікаторів 2026-10-28: діяв на тиждень пізніше), обраний на початку ночі (`runNight`).
 */
export function nightlyStates(state: GameState, rng: Rng, week: string | null = state.modifiers.week): void {
  for (const cat of state.cats) {
    // 3 ночі — дня операції й двох наступних (загальна ревізія 2026-10-29: було 4). Втома ×1,5 (catai) — до кінця дня `recoveryUntil`.
    if (state.day < cat.recoveryUntil) changeMood(state, cat, STERILIZATION.recoveryMoodPerDay, "відновлення після операції");
    if (cat.sex !== "female" || !fertile(cat) || cat.pregnancy || isNursing(state, cat)) continue;
    if (cat.nextHeat < 0) cat.nextHeat = state.day + rng.int(0, 6);
    // Спокійний сезон — без тічок: і нова не починається, і почата минає (§4.1; перевірка модифікаторів 2026-10-28).
    if (week === "calm-season") {
      cat.heatUntil = Math.min(cat.heatUntil, state.day);
      continue;
    }
    // Котячий березень — частіше: від початку останньої тічки тиждень, а не два, — і вже в сам березень (перевірка модифікаторів 2026-10-28: раніше
    // коротшав лише інтервал після тічки, що почалася цього тижня, і частіші тічки приходили наступного).
    if (week === "cat-march" && cat.heatUntil >= 0) cat.nextHeat = Math.min(cat.nextHeat, cat.heatUntil - BREEDING.heatDays + MODIFIERS.week.catMarch.heatEvery);
    if (state.day + 1 >= cat.nextHeat) {
      cat.heatUntil = state.day + BREEDING.heatDays;
      cat.nextHeat = state.day + (week === "cat-march" ? MODIFIERS.week.catMarch.heatEvery : BREEDING.heatEvery);
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
    // Зачаття в ніч на понеділок — наприкінці тижня, за модифікатором тижня, що минає: «Котячий березень» оголошено в понеділок,
    // і гравець має тиждень, щоб зреагувати (стерилізувати, розвести котів) (повторна перевірка модифікаторів 2026-10-28: кидалося на початку березня, без шансу
    // зреагувати). Тічка ж починається вже в новому тижні — `nightlyStates`.
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
 * батьків, а чистокровне ще й має гени й форми своєї породи напевно (§9.11); характеру ще немає — перша риса
 * з'явиться у віці 1 тиждень.
 */
export function giveBirth(state: GameState, rng: Rng): Cat[] {
  const born: Cat[] = [];
  for (const mother of [...state.cats]) {
    const pregnancy = mother.pregnancy;
    if (!pregnancy || state.day + 1 < pregnancy.due) continue;
    const father = state.cats.find((c) => c.id === pregnancy.father) ?? state.album.find((e) => e.id === pregnancy.father) ?? mother;
    const size = litterSize(rng, mother.litters === 0);
    const before = born.length;
    const nest = pickNest(state, mother, born);
    for (let i = 0; i < size; i++) {
      const sex = rng.chance(0.5) ? "female" : "male";
      const kitten = createCat(state, rng, {
        source: "born",
        ageWeeks: 0,
        sex,
        // Ім'я — тут, а не в createCat: там його кидок ішов би після кидка «at» і зсунув би порядок випадковості. Зайняті — і коти
        // тижневих списків притулку та розплідника, і брати-сестри; альбом — уникати (загальна ревізія 2026-10-29).
        name: pickCatName(rng, sex, takenCatNames(state).concat(born.map((c) => c.name)), pastCatNames(state)),
        // Без гнізда — на підлозі біля матері: там, де була вона, кошенята опинялися й нагорі.
        at: (() => {
          if (nest) return itemPoint(nest);
          const base = visibleFloorNear(state, { x: mother.x, y: mother.y + 0.2 });
          return visibleFloorNear(state, { x: base.x + (rng.next() - 0.5) * 0.6, y: base.y });
        })(),
      });
      kitten.genes = inheritGenes(rng, sex, mother.genes, father.genes);
      kitten.shape = inheritShape(rng, mother.shape, father.shape);
      kitten.breed = inheritBreed(rng, mother.breed, father.breed);
      const [ka, kb] = kitten.breed;
      const pure = ka === kb && ka !== MIXED;
      fitBreedForms(rng, kitten.shape, [ka, kb].filter((id) => id !== MIXED).map(breedById), pure);
      // Чистокровне — ще й гени породи напевно, як кіт із притулку чи розплідника: «чистокровний» всюди означає одне (рішення автора
      // 2026-10-29, `GENERAL_REVIEW.md`, А9; раніше лише форми, і «чистокровна сіамська» здебільшого не була колорпойнтом). Без
      // випадковості, тож потоки §6.1 не зсуваються.
      if (pure) applyPureBreedLook(kitten.genes, kitten.shape, breedById(ka));
      // Що видно про породу — за складністю, як у притулку (§9.11): раніше кошеня показувало приховану половину матері.
      kitten.breedKnown = knownBreedHalves(state, kitten.breed, rng);
      kitten.parents = { mother: mother.id, father: pregnancy.father };
      kitten.arrivedDay = state.day + 1;
      kitten.act = newbornSleep(nest ? nestTarget(nest) : null);
      if (nest) kitten.nest = nest.id;
      born.push(kitten);
    }
    if (nest) settleNest(state, mother, nest);
    mother.pregnancy = null;
    mother.litters += 1;
    mother.restUntil = state.day + 1 + BREEDING.restDays;
    emit(state, { type: "birth", cat: mother.id, kittens: born.length - before });
  }
  return born;
}

/** Постаршав (§9.1): кошеня прокидається й виходить із гнізда саме (§9.8). */
export function leaveNest(cat: Cat): void {
  if (cat.nest === undefined) return;
  delete cat.nest;
  cat.act = idleAct();
}

/** Мати новонародженого: без гнізда кошеня лежить біля неї. */
export function motherOf(state: GameState, kitten: Cat): Cat | null {
  return state.cats.find((c) => c.id === kitten.parents.mother) ?? null;
}

