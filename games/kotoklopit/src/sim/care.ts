// Догляд за котом (§7, §8.7, §9.10): ласощі, нашийник, купання; щоденні наслідки нашийника й купання.

import { changeLove, changeMood, forgive, grudgeAt, offend, traitLevel } from "./cat";
import { unpleasantTask } from "./character";
import { BATH, BATH_FEEL, BEGGING, COLLAR, MINUTES_PER_HOUR, NURTURING, REVENGE, TREATS, WATER_PLAY, WEIGHT } from "./config";
import { catnipReaction, claw, envy, hideSpot, snatchTreat, startAct } from "./catai";
import { visibleFloorNear } from "./catmove";
import { cureDisease, maybeFallIll } from "./diseases";
import { useSupply } from "./economy";
import { emit } from "./events";
import { observe } from "./knowledge";
import { isNewborn, motherOf } from "./reproduction";
import type { Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { Cat, GameState, Quality } from "./types";
import { gainWeight } from "./weight";

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
  const now = absoluteMinute(state.day, state.minute);
  cat.interacted = true;
  // «Заздрісник» поруч може вихопити ласощі й з'їсти сам (§9.12, «Заздрісність»): тоді вони дістаються йому, а не коту на руках.
  const thief = snatchTreat(state, cat, rng);
  if (thief) {
    changeMood(state, thief, TREATS.mood[quality], "вихопив ласощі");
    ateTreat(state, thief, now, rng);
    return true;
  }
  changeMood(state, cat, TREATS.mood[quality]);
  changeLove(state, cat, TREATS.love, "ласощі");
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
  ateTreat(state, cat, now, rng);
  emit(state, { type: "treat", cat: cat.id, quality });
  return true;
}

/** Кіт з'їв ласощі (§7): понад 2 на день — ризик розладу шлунка; інші коти можуть позаздрити (§9.12). */
function ateTreat(state: GameState, cat: Cat, now: number, rng: Rng): void {
  // Ласощі — понад порції (§9.12, «Схильність до повноти»).
  gainWeight(state, cat, WEIGHT.treat);
  cat.treatsToday += 1;
  if (cat.treatsToday > TREATS.perDay) maybeFallIll(state, cat, "stomach", TREATS.stomach, rng);
  cat.treatAt = now;
  envy(state, cat, "treat");
}

/** Котяча м'ята котові на руках біля аптечки (§9.12, «Котяча м'ята»): як він зреагує, вирішує `catnipReaction`. */
export function giveCatnip(state: GameState, quality: Quality, rng: Rng): boolean {
  const cat = catInHands(state);
  if (!cat || state.home.supplies.catnip[quality] <= 0) return false;
  useSupply(state, "catnip", quality);
  cat.interacted = true;
  catnipReaction(state, cat, quality, rng);
  return true;
}

/** Надягти нашийник (§9.10): старий іншої якості, якщо був, замінюється. */
export function putCollar(state: GameState, quality: Quality): boolean {
  const cat = catInHands(state);
  const supply = state.home.supplies.collar;
  // Такий самий нашийник не надягають: старий пропав би, нічого не змінивши (§9.10; загальна ревізія 2026-10-29).
  if (!cat || supply[quality] <= 0 || cat.collar?.quality === quality) return false;
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
    observe(state, cat, "water", 1, false, WATER_PLAY.observeEvery);
  }
  // Подряпина — як біля переноски (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А5): разово здоров'я −3 і бабл «кігті», без
  // хвороби «Травма» й без множника складності — він для травм (§6.5). Раніше тут була «Травма» на 10 днів.
  const scratched = feel.scratch > 0 && rng.chance(feel.scratch);
  if (scratched) claw(state, cat, "bath");
  cat.bathedDay = state.day;
  if (quality === "premium") cureDisease(state, cat, "dermatitis", rng);
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
  // Раз на годину, як і втеча з ванної (§9.12 «Любов до води»; крок 17, звірка з довідниками 2026-10-28).
  if (scratched || water <= -2) observe(state, cat, "water", -1, false, WATER_PLAY.observeEvery);
  return true;
}

/** Ніч (§8.7, §9.10, §9.12): нашийник і дзвіночок, ласощі й гра вудкою за день, дерматит безшерстих без купання, мати й новонароджені. */
export function nightlyCare(state: GameState, rng: Rng): void {
  for (const cat of state.cats) {
    cat.treatsToday = 0;
    // Мати з «Турботою про кошенят» щодня тішить новонароджених, «Сам ще кошеня» — засмучує (§9.12).
    const mother = isNewborn(cat) ? motherOf(state, cat) : null;
    const care = mother && mother.away === null ? Math.sign(traitLevel(mother, "nurturing")) : 0;
    if (care !== 0) changeMood(state, cat, NURTURING.motherMood * care);
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
    // Як і всі шанси хвороб, з «Витривалістю» й складністю (§9.5).
    if (cat.shape.coat === "hairless" && state.day - cat.bathedDay >= BATH.hairlessDays) maybeFallIll(state, cat, "dermatitis", BATH.dermatitis, rng);
  }
}
