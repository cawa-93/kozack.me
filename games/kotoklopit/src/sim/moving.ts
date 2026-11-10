// Перестановка речей котячого кутка й бази робота-пилососа (§8.7): узяти в руки, понести й поставити на вільну клітинку.

import { idleAct } from "./cat";
import { MOVING } from "./config";
import { feederAt } from "./economy";
import { emit } from "./events";
import { distanceToRect, hiddenTile, itemPoint, nearestFreePlace, robotDockAt, robotDocked, slotById, type Place } from "./home";
import { clearPath, robotProgress } from "./household";
import { itemTargetId, movableItem } from "./targets";
import type { CarriedThing, Cat, CatActKind, GameState, PlacedItem, Vec } from "./types";

/** Цим кіт користується, уже дійшовши до речі. */
const USES: ReadonlySet<CatActKind> = new Set<CatActKind>(["eat", "drink", "toilet", "bury", "scratch", "sleep", "hide"]);

const inUse = (cat: Cat, id: string): boolean => cat.act.goal === null && cat.act.target === id && USES.has(cat.act.kind);

/** Ціль відмов про базу робота (§8.7): над нею, де вона стоїть. */
const ROBOT_TARGET = "robot";

/** Куди стане річ із рук: найближча вільна клітинка до точки перед персонажем, досяжна й не за стіною; null — поставити нікуди. */
export function thingSpot(state: GameState): Place | null {
  const { body, held } = state.character;
  const ahead = { x: body.x + body.facing.x * MOVING.ahead, y: body.y + body.facing.y * MOVING.ahead };
  // Базу робота ставлять лише туди, де її видно: перед нею внутрішня стіна не згасає (§8.7).
  const visible = (center: Vec): boolean => held?.kind !== "robot" || !hiddenTile(Math.floor(center.x), Math.floor(center.y));
  return nearestFreePlace(state, ahead, (center) => Math.hypot(center.x - body.x, center.y - body.y) <= MOVING.reach && clearPath(body, center) && visible(center));
}

function setDown(state: GameState, held: CarriedThing, place: Place): void {
  const item = { ...held.item, slot: place.id };
  state.home.items.push(item);
  if (held.feeder) (state.home.feeders ??= []).push({ ...held.feeder, slot: place.id });
  state.character.held = null;
  emit(state, { type: "thing-moved", stage: "put", item });
}

function setRobotDown(state: GameState, place: Place): void {
  const at = { x: place.x + 0.5, y: place.y + 0.5 };
  state.home.robotDock = at;
  delete state.home.robotCarried;
  state.character.held = null;
  emit(state, { type: "robot-moved", stage: "put", at });
}

/** Поставити річ чи базу робота з рук (§8.7). Одне утримання — одна дія (§10): поки кнопку не відпустили, біля поставленої нічого не почнеться. */
export function putThing(state: GameState): void {
  const held = state.character.held;
  if (held?.kind !== "thing" && held?.kind !== "robot") return;
  const place = thingSpot(state);
  if (place === null) {
    emit(state, { type: "refused", object: held.kind === "robot" ? ROBOT_TARGET : itemTargetId(held.item), reason: "no-place" });
    return;
  }
  if (held.kind === "robot") setRobotDown(state, place);
  else setDown(state, held, place);
  state.character.holdSpent = true;
}

/** Персонаж заснув із річчю чи роботом у руках (§8.7): вони стають на найближчу вільну клітинку, хоч би куди він дивився. */
export function dropThing(state: GameState): void {
  const { held, body } = state.character;
  if (held?.kind === "thing") setDown(state, held, nearestFreePlace(state, body) ?? slotById(held.item.slot));
  if (held?.kind === "robot") {
    const place = nearestFreePlace(state, body, (center) => !hiddenTile(Math.floor(center.x), Math.floor(center.y)));
    const old = robotDockAt(state);
    setRobotDown(state, place ?? { id: "robot-dock", x: Math.floor(old.x), y: Math.floor(old.y) });
  }
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

function liftRobot(state: GameState): void {
  const quality = state.home.appliances.robot;
  if (!quality) return;
  state.home.robotCarried = true;
  state.character.held = { kind: "robot", quality };
  emit(state, { type: "robot-moved", stage: "taken", at: robotDockAt(state) });
}

/** Базу робота можна взяти (§8.7): він стоїть на ній, а вона поруч, не за стіною. */
function robotWithinReach(state: GameState): boolean {
  if (!robotDocked(state) || robotProgress(state) !== null) return false;
  const { body } = state.character;
  const dock = robotDockAt(state);
  const tile = { x: Math.floor(dock.x) + 0.15, y: Math.floor(dock.y) + 0.15, w: 0.7, h: 0.7 };
  return distanceToRect(body, tile) <= MOVING.take && clearPath(body, dock);
}

/** Що візьме кнопка перестановки (§8.7): ближча з речі котячого кутка й бази робота; null — нічого. */
export function movableThing(state: GameState): PlacedItem | "robot" | null {
  const item = movableItem(state);
  if (!robotWithinReach(state)) return item;
  if (item === null) return "robot";
  const { body } = state.character;
  const dock = robotDockAt(state);
  const at = itemPoint(item);
  return Math.hypot(dock.x - body.x, dock.y - body.y) < Math.hypot(at.x - body.x, at.y - body.y) ? "robot" : item;
}

/** Кнопка перестановки (§10): узяти найближчу річ чи базу робота або поставити ту, що в руках. */
export function moveThing(state: GameState): void {
  const { character } = state;
  if (state.end !== null || character.body.stun > 0 || character.activity !== null) return;
  if (character.held?.kind === "thing" || character.held?.kind === "robot") return putThing(state);
  const thing = movableThing(state);
  if (thing === null) return;
  const object = thing === "robot" ? ROBOT_TARGET : itemTargetId(thing);
  if (character.held !== null) return emit(state, { type: "refused", object, reason: "hands-full" });
  if (thing === "robot") return liftRobot(state);
  if (state.cats.some((cat) => inUse(cat, object))) return emit(state, { type: "refused", object, reason: "thing-busy" });
  liftThing(state, thing);
}
