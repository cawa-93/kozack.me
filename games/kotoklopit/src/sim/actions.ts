// Дії персонажа з речами квартири (§8.4, §8.7, §10): коротке натискання бере, кладе
// чи вмикає річ, утримання — тривала дія (душ, їжа). Плита готує своїм часом.

import { actionSpeed, isMoving, targetOf } from "./body";
import { changeStat } from "./character";
import {
  BURN_MINUTES,
  COOK_MINUTES,
  EAT_MINUTES,
  MEAL_SATIETY,
  SHOWER_HYGIENE,
  SHOWER_MINUTES,
} from "./config";
import { receivePackages, returnSupply, supplyCount, takeSupply } from "./economy";
import { emit, type Refusal } from "./events";
import { objectById, type HomeObject } from "./home";
import { canGoToSleep } from "./sleep";
import type { GameState, Item, Vec } from "./types";
import { startWork, stopWork } from "./work";

/** Керування на цю мить: напрямок руху й чи утримується кнопка дії. */
export interface Input {
  move: Vec;
  hold: boolean;
}

export const IDLE: Input = { move: { x: 0, y: 0 }, hold: false };

/** Що має статися після натискання: зараз лише сон, бо його обробляє хід гри. */
export type TapResult = "sleep" | null;

function refuse(state: GameState, object: HomeObject, reason: Refusal): null {
  emit(state, { type: "refused", object: object.id, reason });
  return null;
}

/** Коротке натискання дії (§10). */
export function tap(state: GameState): TapResult {
  const character = state.character;
  if (state.end !== null) return null;
  if (character.activity?.kind === "work") {
    stopWork(state);
    return null;
  }
  // Під час тривалої дії натискання її не перериває: інакше можна випадково взяти страву зі столу.
  if (character.activity !== null) return null;
  const target = targetOf(state);
  if (target === null) return null;
  const held = character.held;

  switch (target.kind) {
    case "fridge": {
      if (held?.kind === "raw") {
        returnSupply(state, "food", held.quality);
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (held !== null) return refuse(state, target, "hands-full");
      const quality = takeSupply(state, "food");
      if (quality === null) return refuse(state, target, "empty");
      return take(state, target, { kind: "raw", quality });
    }
    case "stove": {
      const stove = state.home.stove;
      if (held !== null) {
        if (stove.item !== null) return refuse(state, target, "occupied");
        stove.item = held;
        // Готова страва, яку повернули на плиту, знову може підгоріти.
        stove.minutes = held.kind === "raw" ? 0 : COOK_MINUTES;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (stove.item === null) return refuse(state, target, "nothing");
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
        if (item !== null) return refuse(state, target, "occupied");
        surfaces[target.id] = held;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (item === null) return refuse(state, target, "nothing");
      // Страву на столі їдять утриманням дії, а не беруть назад.
      if (target.kind === "table" && item.kind === "meal") return null;
      surfaces[target.id] = null;
      return take(state, target, item);
    }
    case "trash": {
      if (held === null) return refuse(state, target, "nothing");
      character.held = null;
      emit(state, { type: "trashed", item: held });
      return null;
    }
    case "computer":
      if (held !== null) return refuse(state, target, "hands-full");
      startWork(state);
      return null;
    case "bed":
      if (held !== null) return refuse(state, target, "hands-full");
      if (!canGoToSleep(state)) return refuse(state, target, "too-early");
      return "sleep";
    case "door":
      if (receivePackages(state).length === 0) return refuse(state, target, "nothing");
      return null;
    case "shower":
      // Душ — тривала дія: його вмикає утримання кнопки.
      if (held !== null) return refuse(state, target, "hands-full");
      return null;
    case "sink":
    case "sofa":
      return null;
  }
}

function take(state: GameState, object: HomeObject, item: Item): null {
  state.character.held = item;
  emit(state, { type: "took", object: object.id, item });
  return null;
}

/** Тривалість тривалої дії з річчю, без урахування швидкості. */
function useMinutes(object: HomeObject): number {
  return object.kind === "shower" ? SHOWER_MINUTES : EAT_MINUTES;
}

/** Чи можна зараз почати чи продовжити тривалу дію з цією річчю. */
export function canUse(state: GameState, object: HomeObject): boolean {
  if (state.character.held !== null) return false;
  if (object.kind === "shower") return true;
  if (object.kind === "table") return state.home.surfaces[object.id]?.kind === "meal";
  return false;
}

/** Частка виконаної тривалої дії 0–1 або null, якщо її немає. */
export function useProgress(state: GameState): number | null {
  const activity = state.character.activity;
  if (activity?.kind !== "use") return null;
  return Math.min(1, activity.progress / useMinutes(objectById(activity.target)));
}

/**
 * Тривалі дії за ігрові хвилини. Рух перериває і роботу, і тривалу дію;
 * відпущена кнопка лише ставить тривалу дію на паузу.
 */
export function tickActivity(state: GameState, input: Input, minutes: number): void {
  const character = state.character;
  const activity = character.activity;
  if (isMoving(input.move)) {
    if (activity?.kind === "work") stopWork(state);
    else character.activity = null;
    return;
  }
  if (activity?.kind === "work" || !input.hold) return;
  let use = activity;
  if (use === null) {
    const target = targetOf(state);
    if (target === null || !canUse(state, target)) return;
    use = { kind: "use", target: target.id, progress: 0 };
    character.activity = use;
  }
  const object = objectById(use.target);
  if (!canUse(state, object)) {
    character.activity = null;
    return;
  }
  use.progress += minutes * actionSpeed(state);
  if (use.progress >= useMinutes(object)) {
    character.activity = null;
    finishUse(state, object);
  }
}

function finishUse(state: GameState, object: HomeObject): void {
  if (object.kind === "shower") {
    const quality = takeSupply(state, "hygiene");
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

/** Персонаж заснув: робота й тривала дія закінчуються, річ із рук випадає (§8.7). */
export function dropEverything(state: GameState): void {
  const character = state.character;
  stopWork(state);
  character.activity = null;
  const held = character.held;
  if (held?.kind === "raw") returnSupply(state, "food", held.quality);
  character.held = null;
}
