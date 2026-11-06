// Перестановка речей котячого кутка (§8.7): узяти річ у руки, понести й поставити на вільну клітинку.

import { idleAct } from "./cat";
import { MOVING } from "./config";
import { feederAt } from "./economy";
import { emit } from "./events";
import { nearestFreePlace, slotById, type Place } from "./home";
import { clearPath } from "./household";
import { itemTargetId, movableItem } from "./targets";
import type { CarriedThing, Cat, CatActKind, GameState, PlacedItem } from "./types";

/** Цим кіт користується, уже дійшовши до речі. */
const USES: ReadonlySet<CatActKind> = new Set<CatActKind>(["eat", "drink", "toilet", "bury", "scratch", "sleep", "hide"]);

const inUse = (cat: Cat, id: string): boolean => cat.act.goal === null && cat.act.target === id && USES.has(cat.act.kind);

/** Куди стане річ із рук: найближча вільна клітинка до точки перед персонажем, досяжна й не за стіною; null — поставити нікуди. */
export function thingSpot(state: GameState): Place | null {
  const { body } = state.character;
  const ahead = { x: body.x + body.facing.x * MOVING.ahead, y: body.y + body.facing.y * MOVING.ahead };
  return nearestFreePlace(state, ahead, (center) => Math.hypot(center.x - body.x, center.y - body.y) <= MOVING.reach && clearPath(body, center));
}

function setDown(state: GameState, held: CarriedThing, place: Place): void {
  const item = { ...held.item, slot: place.id };
  state.home.items.push(item);
  if (held.feeder) (state.home.feeders ??= []).push({ ...held.feeder, slot: place.id });
  state.character.held = null;
  emit(state, { type: "thing-moved", stage: "put", item });
}

/** Поставити річ із рук (§8.7). Одне утримання — одна дія (§10): поки кнопку не відпустили, біля поставленої речі нічого не почнеться. */
export function putThing(state: GameState): void {
  const held = state.character.held;
  if (held?.kind !== "thing") return;
  const place = thingSpot(state);
  if (place === null) {
    emit(state, { type: "refused", object: itemTargetId(held.item), reason: "no-place" });
    return;
  }
  setDown(state, held, place);
  state.character.holdSpent = true;
}

/** Персонаж заснув із річчю в руках (§8.7): вона стає на найближчу вільну клітинку, хоч би куди він дивився. */
export function dropThing(state: GameState): void {
  const held = state.character.held;
  if (held?.kind === "thing") setDown(state, held, nearestFreePlace(state, state.character.body) ?? slotById(held.item.slot));
}

/**
 * Узяти річ у руки. Автогодівниця їде разом із мискою: лишившись у квартирі, вона за правилом §9.12 перейшла б до іншої миски. Хто
 * йшов до речі чи просив біля неї, шукає інше: інакше прийшов би на старе місце.
 */
function liftThing(state: GameState, item: PlacedItem): void {
  const { home } = state;
  home.items.splice(home.items.indexOf(item), 1);
  const feeder = feederAt(state, item.slot);
  if (feeder) home.feeders?.splice(home.feeders.indexOf(feeder), 1);
  state.character.held = { kind: "thing", item, ...(feeder ? { feeder } : {}) };
  const aims = new Set([itemTargetId(item), `sniff:${item.id}`, `shun:${item.id}`]);
  for (const cat of state.cats) if (cat.act.target !== null && aims.has(cat.act.target)) cat.act = idleAct();
  emit(state, { type: "thing-moved", stage: "taken", item });
}

/** Кнопка перестановки (§10): узяти найближчу річ чи поставити ту, що в руках. */
export function moveThing(state: GameState): void {
  const { character } = state;
  if (state.end !== null || character.body.stun > 0 || character.activity !== null) return;
  if (character.held?.kind === "thing") return putThing(state);
  const item = movableItem(state);
  if (item === null) return;
  const object = itemTargetId(item);
  if (character.held !== null) return emit(state, { type: "refused", object, reason: "hands-full" });
  if (state.cats.some((cat) => inUse(cat, object))) return emit(state, { type: "refused", object, reason: "thing-busy" });
  liftThing(state, item);
}
