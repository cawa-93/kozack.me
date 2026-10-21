// Дії персонажа (§8.4, §8.7, §9.12, §10): коротке натискання бере, кладе чи вмикає річ, бере кота
// на руки; утримання — тривала дія: душ, їжа, прибирання, пестощі. Плита готує своїм часом.

import { actionSpeed, isMoving } from "./body";
import { changeLove, changeMood, idleAct, traitLevel } from "./cat";
import { bowlFull, catOnComputer, hearFood, jealousy, rollEscapes, separateFight } from "./catai";
import { visibleFloorNear } from "./catmove";
import { maybeFallIll } from "./diseases";
import { takeHumanMeds } from "./illness";
import { bathe } from "./care";
import { tapWasher, vacuumed } from "./household";
import { observe } from "./knowledge";
import { powerOut } from "./modifiers";
import { changeStat, unpleasantTask } from "./character";
import {
  HOUSEHOLD,
  ILLNESS,
  BURN_MINUTES,
  CLEAN_LITTER_MINUTES,
  CLEAN_MESS_MINUTES,
  COOK_MINUTES,
  DIFFICULTY,
  EAT_MINUTES,
  ESCAPE,
  LITTER_SANITY,
  MEAL_SATIETY,
  MESS_SANITY,
  MOOD,
  PET,
  PLAY,
  REACH,
  SHOWER_HYGIENE,
  SHOWER_MINUTES,
  SHOO,
  WATER_CAPACITY,
} from "./config";
import { receivePackages, returnSupply, supplyCount, useSupply } from "./economy";
import { emit, type Refusal } from "./events";
import { isSolid, type HomeObject } from "./home";
import { stateRng } from "./rng";
import { canGoToSleep } from "./sleep";
import { targetById, targetOf, type Target } from "./targets";
import type { Cat, Dish, GameState, HomeItem, Item, PetActivity, PlayActivity, Vec } from "./types";
import { startWork, stopWork } from "./work";

/** Керування на цю мить: напрямок руху й чи утримується кнопка дії. */
export interface Input {
  move: Vec;
  hold: boolean;
}

export const IDLE: Input = { move: { x: 0, y: 0 }, hold: false };

/** Що має статися після натискання: зараз лише сон, бо його обробляє хід гри. */
export type TapResult = "sleep" | null;

function refuse(state: GameState, target: string, reason: Refusal): null {
  emit(state, { type: "refused", object: target, reason });
  return null;
}

export function isDish(item: Item | null): item is Dish {
  return item?.kind === "raw" || item?.kind === "meal" || item?.kind === "burnt";
}

/** Коротке натискання дії (§10). */
export function tap(state: GameState): TapResult {
  const character = state.character;
  if (state.end !== null || character.body.stun > 0) return null;
  if (character.activity?.kind === "work") {
    stopWork(state);
    return null;
  }
  // Під час тривалої дії натискання її не перериває: інакше можна випадково взяти страву зі столу.
  if (character.activity !== null) return null;
  const held = character.held;
  const target = targetOf(state);
  // Кота на руках опускають будь-де, а біля душу — купають (§8.7).
  if (held?.kind === "cat") {
    if (target?.type === "object" && target.object.kind === "shower") return tapObject(state, target.object, held);
    putDownCat(state, held.cat);
    return null;
  }
  // Іграшку кладуть на підлогу будь-де, крім смітника.
  if (held?.kind === "toy" && (target === null || target.type !== "object" || target.object.kind !== "trash")) {
    dropToy(state);
    return null;
  }
  if (target === null) return null;
  switch (target.type) {
    case "object":
      return tapObject(state, target.object, held);
    case "item":
      return tapItem(state, target.item, target.id, held);
    case "mess":
      // Безлад прибирають утриманням дії, і ціллю він буває лише з порожніми руками.
      return null;
    case "cat":
      if (held !== null) return refuse(state, target.id, "hands-full");
      pickUpCat(state, target.cat);
      return null;
  }
}

function tapObject(state: GameState, target: HomeObject, held: Item | null): TapResult {
  const character = state.character;
  switch (target.kind) {
    case "fridge": {
      if (held?.kind === "raw") {
        returnSupply(state, "food", held.quality);
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (held !== null) return refuse(state, target.id, "hands-full");
      const quality = useSupply(state, "food");
      if (quality === null) return refuse(state, target.id, "empty");
      return take(state, target, { kind: "raw", quality });
    }
    case "catCabinet":
    case "sterileBin": {
      // Кожен корм — у своєму сховищі (§6.4): шафка — звичайний, бак — для стерилізованих (§9.8).
      const sterile = target.kind === "sterileBin";
      const product = sterile ? "sterileFood" : "catFood";
      if (held?.kind === "catfood") {
        // Порцію повертають туди, звідки взяли.
        if (held.sterile !== sterile) return refuse(state, target.id, "wrong");
        returnSupply(state, product, held.quality);
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (held !== null) return refuse(state, target.id, "hands-full");
      const quality = useSupply(state, product);
      if (quality === null) return refuse(state, target.id, "empty");
      return take(state, target, { kind: "catfood", quality, sterile });
    }
    case "catKit":
      // Аптечка: догляд за котом на руках відкриває картка сцени (§8.7).
      return refuse(state, target.id, "nothing");
    case "litterBag":
      return null;
    case "stove": {
      const stove = state.home.stove;
      if (held !== null) {
        if (!isDish(held)) return refuse(state, target.id, "wrong");
        if (stove.item !== null) return refuse(state, target.id, "occupied");
        stove.item = held;
        // Готова страва, яку повернули на плиту, знову може підгоріти.
        stove.minutes = held.kind === "raw" ? 0 : COOK_MINUTES;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (stove.item === null) return refuse(state, target.id, "nothing");
      const item = stove.item;
      stove.item = null;
      stove.minutes = 0;
      return take(state, target, item);
    }
    case "table":
    case "counter": {
      const surfaces = state.home.surfaces;
      const item = surfaces[target.id] ?? null;
      if (held !== null) {
        if (!isDish(held)) return refuse(state, target.id, "wrong");
        if (item !== null) return refuse(state, target.id, "occupied");
        surfaces[target.id] = held;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (item === null) return refuse(state, target.id, "nothing");
      // Страву на столі їдять утриманням дії, а не беруть назад.
      if (target.kind === "table" && item.kind === "meal") return null;
      surfaces[target.id] = null;
      return take(state, target, item);
    }
    case "trash": {
      if (held === null) return refuse(state, target.id, "nothing");
      character.held = null;
      emit(state, { type: "trashed", item: held });
      return null;
    }
    case "computer":
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Кіт спить на комп'ютері чи сидить на клавіатурі — спершу його треба забрати (§9.12).
      if (catOnComputer(state)) return refuse(state, target.id, "occupied");
      // Вимкнули світло (§4.1): комп'ютер не працює.
      if (powerOut(state)) return refuse(state, target.id, "empty");
      startWork(state);
      return null;
    case "bed":
      if (held !== null) return refuse(state, target.id, "hands-full");
      if (!canGoToSleep(state)) return refuse(state, target.id, "too-early");
      return "sleep";
    case "door": {
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Спершу — кіт на сходах: його треба впіймати (§9.12).
      const escaped = state.cats.find((c) => c.away === "stairs");
      if (escaped) {
        catchCat(state, escaped);
        return null;
      }
      if (receivePackages(state).length === 0) return refuse(state, target.id, "nothing");
      rollEscapes(state);
      return null;
    }
    case "shower":
      // Кіт на руках біля душу — купання (§8.7); інакше персонаж заходить у кабіну й лишається там до кінця душу.
      if (held?.kind === "cat") return bathe(state, stateRng(state, "behavior")) ? null : refuse(state, target.id, "empty");
      if (held !== null) return refuse(state, target.id, "hands-full");
      character.activity = { kind: "use", target: target.id, progress: 0, inside: true };
      return null;
    case "sink":
      // Ліки для себе — біля умивальника (§6.5).
      if (held !== null) return refuse(state, target.id, "hands-full");
      if (!takeHumanMeds(state, stateRng(state, "behavior"))) return refuse(state, target.id, "empty");
      return null;
    case "sofa":
      return null;
    case "washer": {
      if (held !== null) return refuse(state, target.id, "hands-full");
      const result = tapWasher(state);
      if (result === "empty") return refuse(state, target.id, "empty");
      if (result === "busy") return refuse(state, target.id, "too-early");
      return null;
    }
    case "vacuum":
      // Пилососять утриманням дії (§8.7).
      if (held !== null) return refuse(state, target.id, "hands-full");
      return null;
  }
}

function tapItem(state: GameState, item: HomeItem, id: string, held: Item | null): TapResult {
  switch (item.kind) {
    case "bowl":
      if (held === null) return refuse(state, id, "nothing");
      if (held.kind !== "catfood") return refuse(state, id, "wrong");
      if (bowlFull(item)) return refuse(state, id, "occupied");
      // Різні корми в одну миску не змішують.
      if (item.food > 0 && item.sterile !== held.sterile) return refuse(state, id, "wrong");
      item.food += 1;
      item.foodQuality = held.quality;
      item.sterile = held.sterile;
      state.character.held = null;
      emit(state, { type: "fed", item: item.id, food: item.food });
      hearFood(state, item);
      return null;
    case "water":
      if (held !== null) return refuse(state, id, "hands-full");
      if (item.water >= WATER_CAPACITY) return refuse(state, id, "nothing");
      item.water = WATER_CAPACITY;
      emit(state, { type: "watered", item: item.id });
      return null;
    case "litter":
      // Лоток чистять утриманням дії.
      return held === null ? null : refuse(state, id, "hands-full");
    case "toy":
      if (held !== null) return refuse(state, id, "hands-full");
      state.home.items.splice(state.home.items.indexOf(item), 1);
      state.character.held = { kind: "toy", toy: item };
      return null;
    case "house":
    case "scratcher":
      return refuse(state, id, "nothing");
  }
}

/** Покласти іграшку на підлогу під ногами. */
function dropToy(state: GameState): void {
  const held = state.character.held;
  if (held?.kind !== "toy") return;
  const { x, y, facing } = state.character.body;
  const spot = visibleFloorNear(state, { x: x + facing.x * 0.5, y: y + facing.y * 0.5 });
  state.home.items.push({ ...held.toy, x: spot.x, y: spot.y });
  state.character.held = null;
}

/** Повернути кота зі сходів (§9.12): ловити кота — неприємне завдання. */
function catchCat(state: GameState, cat: Cat): void {
  cat.away = null;
  cat.x = 10.5;
  cat.y = 10.3;
  cat.act = idleAct(3);
  cat.interacted = true;
  unpleasantTask(state, ESCAPE.catchSanity);
  maybeFallIll(state, cat, "fleas", ILLNESS.escapeFleas, stateRng(state, "behavior"));
  emit(state, { type: "cat-returned", cat: cat.id, caught: true });
}

function take(state: GameState, object: HomeObject, item: Item): null {
  state.character.held = item;
  emit(state, { type: "took", object: object.id, item });
  return null;
}

/** Чи кіт зараз не хоче на руки: спить або не хоче уваги й не любить рук (§9.12). */
function unwilling(cat: Cat): boolean {
  return cat.act.kind === "sleep" || (cat.needs.attention < 40 && traitLevel(cat, "lap") <= 0);
}

/** Кіт займає місце: клавіатуру, комп'ютер чи коліна (§9.12). */
function occupying(state: GameState, cat: Cat): boolean {
  return cat.act.kind === "keyboard" || cat.act.kind === "lap" || catOnComputer(state) === cat;
}

/** Узяти кота на руки (§9.12): прогнаного з місця, сонного чи небажаючого це ображає. */
export function pickUpCat(state: GameState, cat: Cat): void {
  separateFight(state, cat);
  const shooed = occupying(state, cat);
  const offended = shooed || unwilling(cat);
  if (shooed) {
    changeMood(state, cat, SHOO.mood, "прогнали з місця");
    changeLove(state, cat, SHOO.love, "прогнали з місця");
    observe(state, cat, "touchy");
  } else {
    if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили");
    if (offended) changeLove(state, cat, PET.unwantedLove, "узяли на руки проти волі");
  }
  cat.interacted = true;
  cat.act = idleAct();
  state.character.held = { kind: "cat", cat: cat.id };
  emit(state, { type: "picked-up", cat: cat.id, offended });
}

/** Опустити кота з рук поруч із персонажем. */
export function putDownCat(state: GameState, catId: number): void {
  const character = state.character;
  character.held = null;
  const cat = state.cats.find((c) => c.id === catId);
  if (!cat) return;
  const { x, y, facing } = character.body;
  const spot = { x: x + facing.x * 0.6, y: y + facing.y * 0.6 };
  const free = !isSolid(state, Math.floor(spot.x), Math.floor(spot.y));
  cat.x = free ? spot.x : x;
  cat.y = free ? spot.y : y;
  cat.act = idleAct(3);
  emit(state, { type: "put-down", cat: cat.id });
}

/** Тривалість тривалої дії з ціллю, без урахування швидкості. */
function useMinutes(target: Target): number {
  if (target.type === "item") return CLEAN_LITTER_MINUTES;
  if (target.type === "mess") return CLEAN_MESS_MINUTES;
  if (target.type === "object" && target.object.kind === "vacuum") return HOUSEHOLD.vacuumMinutes;
  return target.type === "object" && target.object.kind === "shower" ? SHOWER_MINUTES : EAT_MINUTES;
}

/** Чи можна зараз почати чи продовжити тривалу дію з ціллю. */
export function canUse(state: GameState, target: Target): boolean {
  if (state.character.held !== null) return false;
  switch (target.type) {
    case "object":
      if (target.object.kind === "shower" || target.object.kind === "vacuum") return true;
      if (target.object.kind === "table") return state.home.surfaces[target.object.id]?.kind === "meal";
      return false;
    case "item":
      return target.item.kind === "litter" && (target.item.uses > 0 || target.item.litter === null);
    case "mess":
    case "cat":
      return true;
  }
}

/** Чи можна гратися: іграшка в руках, кіт поруч (§9.12). */
function canPlay(state: GameState, target: Target): boolean {
  return target.type === "cat" && state.character.held?.kind === "toy";
}

/** Частка виконаної тривалої дії 0–1 або null, якщо її немає. */
export function useProgress(state: GameState): number | null {
  const activity = state.character.activity;
  if (activity?.kind !== "use") return null;
  const target = targetById(state, activity.target);
  return target ? Math.min(1, activity.progress / useMinutes(target)) : null;
}

/**
 * Тривалі дії за ігрові хвилини. Рух перериває і роботу, і тривалу дію;
 * відпущена кнопка лише ставить тривалу дію на паузу, а пестощі — закінчує.
 */
export function tickActivity(state: GameState, input: Input, minutes: number): void {
  const character = state.character;
  const activity = character.activity;
  // У душовій кабіні рух не діє: персонаж виходить, коли душ скінчився (§8.7).
  if (activity?.kind === "use" && activity.inside) {
    const target = targetById(state, activity.target);
    if (target === null) {
      character.activity = null;
      return;
    }
    activity.progress += minutes * actionSpeed(state);
    if (activity.progress >= useMinutes(target)) {
      character.activity = null;
      finishUse(state, target);
    }
    return;
  }
  if (isMoving(input.move)) {
    if (activity?.kind === "work") stopWork(state);
    else character.activity = null;
    return;
  }
  if (activity?.kind === "work") return;
  if (!input.hold) {
    if (activity?.kind === "pet" || activity?.kind === "play") character.activity = null;
    return;
  }
  if (activity === null) {
    const target = targetOf(state);
    if (target === null) return;
    if (canPlay(state, target) && target.type === "cat") character.activity = { kind: "play", cat: target.cat.id, minutes: 0 };
    else if (!canUse(state, target)) return;
    // У душ заходять натисканням, а не утриманням.
    else if (target.type === "object" && target.object.kind === "shower") return;
    else if (target.type === "cat") {
      character.activity = { kind: "pet", cat: target.cat.id, minutes: 0 };
      jealousy(state, target.cat);
    } else character.activity = { kind: "use", target: target.id, progress: 0 };
  }
  const current = character.activity;
  if (current?.kind === "pet") {
    pet(state, current, minutes);
    return;
  }
  if (current?.kind === "play") {
    play(state, current, minutes);
    return;
  }
  if (current?.kind !== "use") return;
  const target = targetById(state, current.target);
  if (target === null || !canUse(state, target)) {
    character.activity = null;
    return;
  }
  current.progress += minutes * actionSpeed(state);
  if (current.progress >= useMinutes(target)) {
    character.activity = null;
    finishUse(state, target);
  }
}

function finishUse(state: GameState, target: Target): void {
  if (target.type === "item" && target.item.kind === "litter") {
    const box = target.item;
    box.uses = 0;
    box.litter = useSupply(state, "litter");
    const sanity = unpleasantTask(state, LITTER_SANITY);
    emit(state, { type: "cleaned", what: "litter", sanity });
    return;
  }
  if (target.type === "mess") {
    const messes = state.home.messes;
    messes.splice(messes.indexOf(target.mess), 1);
    const sanity = unpleasantTask(state, MESS_SANITY[target.mess.kind]);
    emit(state, { type: "cleaned", what: target.mess.kind, sanity });
    return;
  }
  if (target.type !== "object") return;
  const object = target.object;
  if (object.kind === "vacuum") return vacuumed(state);
  if (object.kind === "shower") {
    const quality = useSupply(state, "hygiene");
    const hygiene = SHOWER_HYGIENE[quality ?? "none"];
    changeStat(state, "hygiene", hygiene);
    emit(state, { type: "showered", hygiene, quality, left: supplyCount(state, "hygiene") });
    return;
  }
  const meal = state.home.surfaces[object.id];
  if (!meal) return;
  state.home.surfaces[object.id] = null;
  const satiety = MEAL_SATIETY[meal.quality];
  changeStat(state, "satiety", satiety);
  emit(state, { type: "ate", satiety, food: supplyCount(state, "food") });
}

/** Скільки хвилин поспіль кіт терпить пестощі (§9.12). */
export function petTolerance(cat: Cat): number {
  return Math.max(PET.minToleranceMinutes, PET.toleranceMinutes * (1 + PET.toleranceStep * traitLevel(cat, "petting")));
}

/**
 * Пестощі (§8.2, §9.12): поки кіт хоче уваги — здоровий глузд, настрій і любов; коли не хоче —
 * менше здорового глузду, а настрій кота падає; довше, ніж кіт терпить, — настрій падає, і кіт може вкусити.
 */
function pet(state: GameState, activity: PetActivity, minutes: number): void {
  const character = state.character;
  const cat = state.cats.find((c) => c.id === activity.cat);
  const body = character.body;
  if (!cat || cat.away !== null || Math.hypot(cat.x - body.x, cat.y - body.y) > REACH + 0.6) {
    character.activity = null;
    return;
  }
  const before = activity.minutes;
  activity.minutes += minutes;
  cat.interacted = true;
  if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили пестощами");
  // Кіт лишається на місці, поки його гладять.
  if (cat.act.kind !== "idle" || cat.act.goal !== null) cat.act = idleAct(1);
  cat.act.minutes = Math.max(cat.act.minutes, 1);
  const catSanity = DIFFICULTY[state.difficulty].catSanity;
  const tolerance = petTolerance(cat);
  if (activity.minutes <= tolerance) {
    const wants = cat.needs.attention >= PET.wantsAttention;
    changeStat(state, "sanity", (wants ? PET.sanity : PET.unwantedSanity) * catSanity * minutes);
    changeMood(state, cat, (wants ? PET.mood : PET.unwantedMood) * minutes);
    if (wants) changeLove(state, cat, PET.love * minutes);
    cat.needs.attention = Math.max(0, cat.needs.attention - PET.attentionPerMinute * minutes);
    if (Math.floor(activity.minutes) !== Math.floor(before)) emit(state, { type: "purr", cat: cat.id, enjoyed: wants });
    return;
  }
  changeMood(state, cat, PET.tooLongMood * minutes);
  const rng = stateRng(state, "behavior");
  // «Пастка на животику» кусає одразу, щойно терпіння вичерпано.
  const trap = traitLevel(cat, "petting") <= -2;
  if (trap || rng.chance(1 - (1 - PET.biteChancePerMinute) ** minutes)) {
    changeStat(state, "health", PET.biteHealth);
    character.activity = null;
    cat.act = idleAct(0);
    emit(state, { type: "bite", cat: cat.id });
    observe(state, cat, "petting");
  }
}

/** Кіт поруч і не на сходах: з ним можна гратися чи його пестити. */
function catNearby(state: GameState, id: number): Cat | null {
  const body = state.character.body;
  const cat = state.cats.find((c) => c.id === id);
  if (!cat || cat.away !== null || Math.hypot(cat.x - body.x, cat.y - body.y) > REACH + 0.6) return null;
  return cat;
}

/**
 * Гра з котом (§8.2, §9.12): здоровий глузд, настрій і любов, поки кіт хоче гратися;
 * коли гри вже не хоче — іде.
 */
function play(state: GameState, activity: PlayActivity, minutes: number): void {
  const character = state.character;
  const cat = catNearby(state, activity.cat);
  if (!cat || character.held?.kind !== "toy") {
    character.activity = null;
    return;
  }
  const before = activity.minutes;
  activity.minutes += minutes;
  cat.interacted = true;
  if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили грою");
  if (cat.act.kind !== "idle" || cat.act.goal !== null) cat.act = idleAct(1);
  cat.act.minutes = Math.max(cat.act.minutes, 1);
  const playful = Math.max(0, 1 + PLAY.playfulStep * traitLevel(cat, "playful"));
  changeStat(state, "sanity", PLAY.sanity * playful * DIFFICULTY[state.difficulty].catSanity * minutes);
  changeMood(state, cat, PLAY.mood * minutes);
  changeLove(state, cat, PLAY.love * minutes);
  cat.needs.play = Math.max(0, cat.needs.play - PLAY.needPerMinute * minutes);
  if (Math.floor(activity.minutes) !== Math.floor(before)) emit(state, { type: "purr", cat: cat.id, enjoyed: true });
  if (cat.needs.play < PLAY.bored) {
    character.activity = null;
    cat.act = idleAct(0);
    emit(state, { type: "played", cat: cat.id, minutes: activity.minutes });
    observe(state, cat, "playful");
  }
}

/** Персонаж заснув: робота й тривала дія закінчуються, річ із рук випадає (§8.7). */
export function dropEverything(state: GameState): void {
  const character = state.character;
  stopWork(state);
  character.activity = null;
  const held = character.held;
  if (held?.kind === "raw") returnSupply(state, "food", held.quality);
  if (held?.kind === "catfood") returnSupply(state, held.sterile ? "sterileFood" : "catFood", held.quality);
  if (held?.kind === "cat") putDownCat(state, held.cat);
  if (held?.kind === "toy") dropToy(state);
  character.held = null;
}

/** Плита готує своїм часом: страва готова за 20 хвилин і підгорає ще через 15 (§8.7). */
export function tickStove(state: GameState, minutes: number): void {
  const stove = state.home.stove;
  const item = stove.item;
  if (item === null) return;
  stove.minutes += minutes;
  if (item.kind === "raw" && stove.minutes >= COOK_MINUTES) {
    stove.item = { kind: "meal", quality: item.quality };
    emit(state, { type: "cooked", result: "ready" });
  }
  if (stove.item?.kind === "meal" && stove.minutes >= BURN_MINUTES) {
    stove.item = { kind: "burnt", quality: item.quality };
    emit(state, { type: "cooked", result: "burnt" });
  }
}

