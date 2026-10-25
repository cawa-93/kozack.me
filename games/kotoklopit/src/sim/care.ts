// Догляд за котом (§7, §8.7, §9.10): ласощі, нашийник, купання; щоденні наслідки нашийника й купання.

import { changeLove, changeMood, forgive, grudgeAt, offend, traitLevel } from "./cat";
import { unpleasantTask } from "./character";
import { BATH, BATH_FEEL, BEGGING, COLLAR, MINUTES_PER_HOUR, REVENGE, TREATS } from "./config";
import { envy, hideSpot, startAct } from "./catai";
import { visibleFloorNear } from "./catmove";
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
  // «Поступливий» протягом години після неприємного від персонажа чи стресу одразу відтає й муркоче — це видно (§9.9),
  // і образа минає. Ласощі — дія гравця, тож «Жебракування» вони не відкривають (рішення автора 2026-10-25).
  const grudge = grudgeAt(cat);
  if (traitLevel(cat, "vengeful") < 0 && grudge !== null && now - grudge <= TREATS.hurtMinutes) {
    emit(state, { type: "purr", cat: cat.id, enjoyed: true });
    observe(state, cat, "vengeful", -1);
    forgive(cat);
  }
  // Звичка (§7, рішення автора 2026-10-25): ласощі котові, що саме просив їсти, привчають його жебракувати — навіть кота
  // без риси; «Не випрошує» (−2) не привчається.
  const begging = traitLevel(cat, "begging");
  const held = state.character.held;
  if (held?.kind === "cat" && held.begging === true && begging > -2) cat.begHabit = Math.min(BEGGING.habitMax, (cat.begHabit ?? 0) + BEGGING.habitStep);
  // «Жебрак» одразу нявчить, просячи ще, — це видно (прояв «+», раз на годину).
  if (begging > 0 && rng.chance(BEGGING.treatAsk * begging)) {
    emit(state, { type: "meow", cat: cat.id });
    observe(state, cat, "begging", 1, false, MINUTES_PER_HOUR);
  }
  cat.treatsToday += 1;
  if (cat.treatsToday > TREATS.perDay) maybeFallIll(state, cat, "stomach", TREATS.stomach, rng);
  cat.interacted = true;
  cat.treatAt = now;
  envy(state, cat, "treat");
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
  envy(state, cat, "collar");
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

/**
 * Чи дратує кота дзвіночок (§9.10): полохливий чи нестресостійкий. До злиття груп (2026-10-25) — ще й «Чутливий
 * до погоди», якої більше немає.
 */
const bellAnnoys = (cat: Cat): boolean => traitLevel(cat, "bravery") <= -1 || traitLevel(cat, "stress") <= -1;

/**
 * Купання (§8.7): кота на руках — до душу; потрібен шампунь. Дорогий шампунь лікує дерматит. «Любов до води» — дзеркально
 * (рішення автора 2026-10-25): «Водолаз» радіє й муркоче, «Любить воду» — терпить із задоволенням, кіт без риси
 * ображається, «Боїться води» ображається сильніше й може подряпати, «Водобоязнь» — ще сильніше, а потім виривається з рук
 * і ховається. Прояви — те, що видно: муркотіння у ванні («+»), подряпина чи втеча («−»).
 */
export function bathe(state: GameState, rng: Rng): boolean {
  const cat = catInHands(state);
  if (!cat) return false;
  const quality = useSupply(state, "shampoo");
  if (quality === null) return false;
  unpleasantTask(state, BATH.catchSanity);
  unpleasantTask(state, BATH.bathSanity);
  const water = Math.max(-2, Math.min(2, traitLevel(cat, "water"))) as -2 | -1 | 0 | 1 | 2;
  const feel = BATH_FEEL[water];
  changeMood(state, cat, feel.mood, "купання");
  if (feel.love > 0) changeLove(state, cat, feel.love, "купання");
  else if (feel.love < 0) offend(state, cat, feel.love, "купання");
  if (water > 0) {
    emit(state, { type: "purr", cat: cat.id, enjoyed: true });
    observe(state, cat, "water");
  }
  const scratched = feel.scratch > 0 && rng.chance(feel.scratch);
  if (scratched) fallIllPerson(state, "injury");
  cat.bathedDay = state.day;
  if (quality === "premium") cat.diseases = cat.diseases.filter((d) => d.id !== "dermatitis");
  emit(state, { type: "bathed", cat: cat.id });
  if (water <= -2) {
    // Вирвався з рук і тікає ховатися.
    state.character.held = null;
    const at = visibleFloorNear(state, state.character.body);
    cat.x = at.x;
    cat.y = at.y;
    const spot = hideSpot(state, rng, cat);
    startAct(cat, "hide", spot.at, BATH.hideMinutes, spot.target);
    emit(state, { type: "cat-broke-free", cat: cat.id });
  }
  if (scratched || water <= -2) observe(state, cat, "water", -1);
  return true;
}

/** Ніч (§8.7, §9.10): нашийник і дзвіночок, ласощі й гра вудкою за день, дерматит безшерстих без купання. */
export function nightlyCare(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    cat.treatsToday = 0;
    // Гра вудкою рахується за день: уранці засідки знову частіші (§9.12, «Засідки»).
    delete cat.playedToday;
    // Звичка жебракувати згасає (§7).
    if (cat.begHabit !== undefined) {
      cat.begHabit = Math.max(0, cat.begHabit - BEGGING.habitDecay);
      if (cat.begHabit <= 0) delete cat.begHabit;
    }
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
