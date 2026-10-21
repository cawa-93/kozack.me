// Догляд за котом (§7, §8.7, §9.10): ласощі, нашийник, купання; щоденні наслідки нашийника й купання.

import { changeLove, changeMood, traitLevel } from "./cat";
import { unpleasantTask } from "./character";
import { BATH, COLLAR, REVENGE, TREATS } from "./config";
import { envy } from "./catai";
import { fallIll, maybeFallIll } from "./diseases";
import { useSupply } from "./economy";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { observe } from "./knowledge";
import type { Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { Cat, GameState, Quality } from "./types";

/** Кіт на руках персонажа. */
export function catInHands(state: GameState): Cat | null {
  const held = state.character.held;
  if (held?.kind !== "cat") return null;
  return state.cats.find((c) => c.id === held.cat) ?? null;
}

/**
 * Ласощі (§7): настрій і любов; одразу після неприємного повертають половину втраченої любові;
 * понад 2 на день — ризик розладу шлунка.
 */
export function giveTreat(state: GameState, quality: Quality, rng: Rng): boolean {
  const cat = catInHands(state);
  const supply = state.home.supplies.treats;
  if (!cat || supply[quality] <= 0) return false;
  useSupply(state, "treats", quality);
  changeMood(state, cat, TREATS.mood[quality]);
  changeLove(state, cat, TREATS.love, "ласощі");
  const now = absoluteMinute(state.day, state.minute);
  if (cat.hurt && now - cat.hurt.at <= TREATS.hurtMinutes) {
    // «Поступливий» і «Добряк» оттають більше (§9.12).
    const refund = TREATS.refund + REVENGE.refundStep * Math.max(0, -traitLevel(cat, "vengeful"));
    changeLove(state, cat, cat.hurt.amount * refund, "ласощі після неприємного");
    cat.hurt = null;
  }
  cat.treatsToday += 1;
  if (cat.treatsToday > TREATS.perDay) maybeFallIll(state, cat, "stomach", TREATS.stomach, rng);
  observe(state, cat, "begging");
  cat.interacted = true;
  envy(state, cat);
  emit(state, { type: "treat", cat: cat.id, quality });
  return true;
}

/** Надягти нашийник (§9.10): старий, якщо був, замінюється. */
export function putCollar(state: GameState, quality: Quality): boolean {
  const cat = catInHands(state);
  const supply = state.home.supplies.collar;
  if (!cat || supply[quality] <= 0) return false;
  useSupply(state, "collar", quality);
  cat.collar = { quality, bell: cat.collar?.bell ?? false };
  envy(state, cat);
  emit(state, { type: "collar", cat: cat.id });
  return true;
}

export function addBell(state: GameState): boolean {
  const cat = catInHands(state);
  const supply = state.home.supplies.bell;
  if (!cat?.collar || cat.collar.bell || supply.cheap + supply.premium <= 0) return false;
  useSupply(state, "bell", supply.cheap > 0 ? "cheap" : "premium");
  cat.collar.bell = true;
  return true;
}

/** Чи дратує кота дзвіночок: чутливий до погоди чи нестресостійкий (§9.10). */
const bellAnnoys = (cat: Cat): boolean => traitLevel(cat, "weather") >= 1 || traitLevel(cat, "stress") <= -1;

/**
 * Купання (§8.7): кота на руках — до душу; потрібен шампунь. «Водолаз» радіє, решта ображається,
 * «Водобоязнь» може подряпати. Дорогий шампунь лікує дерматит.
 */
export function bathe(state: GameState, rng: Rng): boolean {
  const cat = catInHands(state);
  if (!cat) return false;
  const quality = useSupply(state, "shampoo");
  if (quality === null) return false;
  unpleasantTask(state, BATH.catchSanity);
  unpleasantTask(state, BATH.bathSanity);
  const water = traitLevel(cat, "water");
  if (water >= 1) changeMood(state, cat, BATH.loverMood, "купання");
  else {
    changeMood(state, cat, BATH.mood, "купання");
    changeLove(state, cat, BATH.love, "купання");
  }
  if (water <= -2 && rng.chance(BATH.scratch)) fallIllPerson(state, "injury");
  if (water !== 0) observe(state, cat, "water");
  cat.bathedDay = state.day;
  if (quality === "premium") cat.diseases = cat.diseases.filter((d) => d.id !== "dermatitis");
  emit(state, { type: "bathed", cat: cat.id });
  return true;
}

/** Ніч (§8.7, §9.10): нашийник і дзвіночок, ласощі за день, дерматит безшерстих без купання. */
export function nightlyCare(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    cat.treatsToday = 0;
    if (cat.collar) {
      changeMood(state, cat, COLLAR.mood[cat.collar.quality]);
      if (cat.collar.bell && bellAnnoys(cat)) changeMood(state, cat, COLLAR.bellMood, "дзвіночок");
      if (cat.collar.quality === "cheap" && rng.chance(COLLAR.lose)) {
        cat.collar = null;
        emit(state, { type: "collar-lost", cat: cat.id });
      }
    }
    if (cat.shape.coat === "hairless" && state.day - cat.bathedDay >= BATH.hairlessDays && rng.chance(BATH.dermatitis)) fallIll(state, cat, "dermatitis");
  }
}
