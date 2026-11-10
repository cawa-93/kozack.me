// Перестановка речей котячого кутка, бази робота-пилососа, сховищ котячих запасів і переносок (§8.7): узяти в руки, понести й
// поставити на вільну клітинку.

import { idleAct } from "./cat";
import { MOVING } from "./config";
import { feederAt } from "./economy";
import { emit } from "./events";
import { bodyTouches, distanceToRect, itemPoint, nearestFreePlace, robotDockAt, robotDocked, slotById, thingHome, thingPresent, thingShift, type Place } from "./home";
import { clearPath, robotProgress } from "./household";
import { fitsThing, put } from "./settle";
import { itemTargetId, movableItem } from "./targets";
import type { CarriedThing, CarryThing, Cat, CatActKind, GameState, PlacedItem, Vec } from "./types";

/** Речі гри, які переставляє гравець (§8.7, «Сховища й переноски»). */
const CARRY_THINGS: readonly CarryThing[] = ["cat-cabinet", "sterile-bin", "litter-bag", "cat-kit", "carrier"];

/** Клітинка, де стоїть річ гри. */
function standing(state: GameState, thing: CarryThing): Vec {
  const home = thingHome(thing);
  const shift = thingShift(state, thing);
  return { x: home.x + shift.x, y: home.y + shift.y };
}

/** Цим кіт користується, уже дійшовши до речі. */
const USES: ReadonlySet<CatActKind> = new Set<CatActKind>(["eat", "drink", "toilet", "bury", "scratch", "sleep", "hide"]);

const inUse = (cat: Cat, id: string): boolean => cat.act.goal === null && cat.act.target === id && USES.has(cat.act.kind);

/** Ціль відмов про базу робота (§8.7): над нею, де вона стоїть. */
const ROBOT_TARGET = "robot";

/** Куди стане річ із рук: найближча вільна клітинка до точки перед персонажем, досяжна й не за стіною; null — поставити нікуди. */
export function thingSpot(state: GameState): Place | null {
  const { body, held } = state.character;
  const ahead = { x: body.x + body.facing.x * MOVING.ahead, y: body.y + body.facing.y * MOVING.ahead };
  const thing = held?.kind === "gameThing" ? held.thing : null;
  return nearestFreePlace(state, ahead, (center) => Math.hypot(center.x - body.x, center.y - body.y) <= MOVING.reach && clearPath(body, center) && fits(state, thing, center));
}

/**
 * Сховище й переноски ставлять, як речі, і під ближню стіну: вона перед ними згасає (§8.7). Тверде сховище — не собі під ноги й так,
 * щоб нікому не заважало (`fitsThing`).
 */
function fits(state: GameState, thing: CarryThing | null, center: Vec): boolean {
  const { body } = state.character;
  const tile = { x: Math.floor(center.x), y: Math.floor(center.y) };
  if (thing === null) return true;
  if (thing !== "carrier" && bodyTouches(body, tile.x, tile.y)) return false;
  return fitsThing(state, thing, tile);
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

function setGameThingDown(state: GameState, thing: CarryThing, tile: Vec): void {
  put(state, thing, tile);
  delete state.home.thingCarried;
  state.character.held = null;
  emit(state, { type: "game-thing-moved", thing, stage: "put", at: { x: tile.x + 0.5, y: tile.y + 0.5 } });
}

/** У руках — те, що ставить кнопка перестановки: річ котячого кутка, база робота, сховище чи переноски. */
export function holdsMovable(state: GameState): boolean {
  const kind = state.character.held?.kind;
  return kind === "thing" || kind === "robot" || kind === "gameThing";
}

/** Поставити з рук річ, базу робота, сховище чи переноски (§8.7). Одне утримання — одна дія (§10): поки кнопку не відпустили, біля поставленої нічого не почнеться. */
export function putThing(state: GameState): void {
  const held = state.character.held;
  if (held?.kind !== "thing" && held?.kind !== "robot" && held?.kind !== "gameThing") return;
  const place = thingSpot(state);
  if (place === null) {
    const object = held.kind === "robot" ? ROBOT_TARGET : held.kind === "gameThing" ? held.thing : itemTargetId(held.item);
    emit(state, { type: "refused", object, reason: "no-place" });
    return;
  }
  if (held.kind === "robot") setRobotDown(state, place);
  else if (held.kind === "gameThing") setGameThingDown(state, held.thing, place);
  else setDown(state, held, place);
  state.character.holdSpent = true;
}

/** Персонаж заснув із річчю чи роботом у руках (§8.7): вони стають на найближчу вільну клітинку, хоч би куди він дивився. */
export function dropThing(state: GameState): void {
  const { held, body } = state.character;
  if (held?.kind === "thing") setDown(state, held, nearestFreePlace(state, body) ?? slotById(held.item.slot));
  if (held?.kind === "robot") {
    const place = nearestFreePlace(state, body);
    const old = robotDockAt(state);
    setRobotDown(state, place ?? { id: "robot-dock", x: Math.floor(old.x), y: Math.floor(old.y) });
  }
  if (held?.kind === "gameThing") {
    const thing = held.thing;
    const place = nearestFreePlace(state, body, (center) => fits(state, thing, center));
    // Ніде не можна — туди, де стояла: поки річ у руках, її клітинку ніхто не займає, хіба що її взяли щойно.
    setGameThingDown(state, thing, place ?? standing(state, thing));
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

/**
 * Узяти в руки сховище чи переноски (§8.7, «Сховища й переноски»). Хто йшов до нього чи лапав шафку, шукає інше: інакше прийшов
 * би на старе місце.
 */
function liftGameThing(state: GameState, thing: CarryThing): void {
  const aims = new Set<string>(thing === "cat-cabinet" ? [thing, "cabinet"] : [thing]);
  for (const cat of state.cats) if (cat.away === null && cat.act.target !== null && aims.has(cat.act.target)) cat.act = idleAct();
  const at = standing(state, thing);
  state.home.thingCarried = thing;
  state.character.held = { kind: "gameThing", thing };
  emit(state, { type: "game-thing-moved", thing, stage: "taken", at: { x: at.x + 0.5, y: at.y + 0.5 } });
}

/** Кіт спить у переносці (чи сидить у ній під замком) або сидить на сховищі — не взяти (§8.7). */
function gameThingBusy(state: GameState, thing: CarryThing): boolean {
  if (thing === "carrier") {
    if ((state.home.caged?.length ?? 0) > 0) return true;
    return state.cats.some((cat) => cat.away === null && cat.act.target === "carrier" && cat.act.goal === null);
  }
  const tile = standing(state, thing);
  return state.cats.some((cat) => cat.away === null && Math.floor(cat.x) === tile.x && Math.floor(cat.y) === tile.y);
}

/** Сховища й переноски, які можна взяти (§8.7): стоять у квартирі поруч, не за стіною. */
function gameThingsWithinReach(state: GameState): CarryThing[] {
  const { body } = state.character;
  return CARRY_THINGS.filter((thing) => {
    if (!thingPresent(state, thing)) return false;
    const t = standing(state, thing);
    const tile = { x: t.x + 0.15, y: t.y + 0.15, w: 0.7, h: 0.7 };
    return distanceToRect(body, tile) <= MOVING.take && clearPath(body, { x: t.x + 0.5, y: t.y + 0.5 });
  });
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

/** Що візьме кнопка перестановки (§8.7): найближча з речі котячого кутка, бази робота, сховища й переносок; null — нічого. */
export function movableThing(state: GameState): PlacedItem | "robot" | CarryThing | null {
  const { body } = state.character;
  const distance = (p: Vec): number => Math.hypot(p.x - body.x, p.y - body.y);
  let best: PlacedItem | "robot" | CarryThing | null = movableItem(state);
  let bestDistance = best === null ? Infinity : distance(itemPoint(best));
  if (robotWithinReach(state) && distance(robotDockAt(state)) < bestDistance) {
    best = "robot";
    bestDistance = distance(robotDockAt(state));
  }
  for (const thing of gameThingsWithinReach(state)) {
    const t = standing(state, thing);
    const d = distance({ x: t.x + 0.5, y: t.y + 0.5 });
    if (d < bestDistance) {
      best = thing;
      bestDistance = d;
    }
  }
  return best;
}

/** Кнопка перестановки (§10): узяти найближчу річ, базу робота, сховище чи переноски або поставити те, що в руках. */
export function moveThing(state: GameState): void {
  const { character } = state;
  if (state.end !== null || character.body.stun > 0 || character.activity !== null) return;
  if (holdsMovable(state)) return putThing(state);
  const thing = movableThing(state);
  if (thing === null) return;
  const object = thing === "robot" ? ROBOT_TARGET : typeof thing === "string" ? thing : itemTargetId(thing);
  if (character.held !== null) return emit(state, { type: "refused", object, reason: "hands-full" });
  if (thing === "robot") return liftRobot(state);
  if (typeof thing === "string") {
    if (gameThingBusy(state, thing)) return emit(state, { type: "refused", object, reason: "thing-busy" });
    return liftGameThing(state, thing);
  }
  if (state.cats.some((cat) => inUse(cat, object))) return emit(state, { type: "refused", object, reason: "thing-busy" });
  liftThing(state, thing);
}
