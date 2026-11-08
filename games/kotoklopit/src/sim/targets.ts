// Ціль дії персонажа (§10): річ квартири, річ котячого кутка, безлад чи кіт — найближча,
// і передусім та, на яку дивиться персонаж.

import { highPlaceOf, isCarried } from "./catai";
import { FACING_PRIORITY, MOVING, REACH } from "./config";
import { CARRIER_SPOT, centerOf, distanceToRect, isSolid, isWall, itemPoint, objectAt, objectsOf, slotById, type HomeObject } from "./home";
import type { Body, Cat, GameState, HomeItem, Mess, PlacedItem, Vec } from "./types";

export type Target =
  | { type: "object"; id: string; object: HomeObject }
  | { type: "item"; id: string; item: HomeItem }
  | { type: "mess"; id: string; mess: Mess }
  | { type: "cat"; id: string; cat: Cat }
  /** Вертикальний пилосос, що стоїть на підлозі (§8.7, «Пилосос у руках»): `at` — точка підлоги під ним. */
  | { type: "vacuum"; id: typeof VACUUM_TARGET; at: Vec }
  /** Переноски біля дверей (§8.7). */
  | { type: "carrier"; id: typeof CARRIER_TARGET; at: Vec };

/** Id цілі «пилосос на підлозі» (§8.7). */
export const VACUUM_TARGET = "vacuum";
/** Id цілі «переноски» (§8.7). */
export const CARRIER_TARGET = "carrier";

/** Половина розміру безладу й кота на підлозі, у клітинках. */
const SMALL_RADIUS = 0.35;
/** Ближче за це до центру цілі персонаж стоїть просто на ній. */
const UNDERFOOT = 0.3;
/**
 * Річ під ногами (миска) трохи «позаду»: перемагає те, до чого персонаж повернувся (шафка поруч),
 * а якщо він ні до чого не повернувся — річ під ногами.
 */
const UNDERFOOT_FACING = -0.2;
/** Безлад важливіший за річ поруч (лоток, миска): спершу прибирають його. */
const MESS_PRIORITY = 0.3;
/** Кіт на речі квартири (комп'ютер, ліжко, підвіконня) важливіший за саму річ: щоб скористатися нею, кота треба забрати. */
const CAT_ON_OBJECT_PRIORITY = 0.4;

/**
 * Кіт на меблях: на непрохідній речі чи на підвіконні — його клітинка прохідна, бо дошка вузька (§9.12, «Вікно»). Кіт у ящиках
 * біля входу — ні: ящики тоді відмовляють «кіт у ящиках», і кота забирають окремо (§9.12, «Допитливість»).
 */
function catOnFurniture(state: GameState, cat: Cat): boolean {
  const x = Math.floor(cat.x);
  const y = Math.floor(cat.y);
  return isSolid(state, x, y) || objectAt(state, x, y)?.kind === "windowsill";
}
/**
 * Іграшка під холодильником менш важлива за річ поруч: її дістають, ставши біля неї, а перед холодильником він сам — ціль. Під
 * диваном штрафу немає: диван не ціль, а кіт, що щойно заштовхав іграшку, стоїть просто над нею, і зі штрафом кнопка діставалася
 * б йому, звідки б персонаж не підійшов.
 */
const HIDDEN_PRIORITY = 0.2;

export const itemTargetId = (item: HomeItem): string => `item:${item.id}`;
export const messTargetId = (mess: Mess): string => `mess:${mess.id}`;
export const catTargetId = (cat: Cat): string => `cat:${cat.id}`;

/** Кіт на шафі заступає її (§8.7): його знімають чи чують «не дотягтися» (§9.12), а шафа почекає, поки він зліз. */
function catOnWardrobe(state: GameState, object: HomeObject): boolean {
  return object.kind === "wardrobe" && state.cats.some((c) => c.away === null && highPlaceOf(state, c)?.id === object.id);
}

/** Усі цілі, з якими зараз можна взаємодіяти. */
function candidates(state: GameState): Target[] {
  const targets: Target[] = [];
  for (const object of objectsOf(state)) if (object.interactive && !catOnWardrobe(state, object)) targets.push({ type: "object", id: object.id, object });
  // Будиночок і кігтеточка — для котів: персонажу з ними робити нічого.
  // Іграшку з повними руками не підняти, тож вона не заступає плиту чи стіл (§10).
  const handsFull = state.character.held !== null;
  for (const item of state.home.items) {
    if (item.kind === "house" || item.kind === "scratcher" || (item.kind === "toy" && handsFull)) continue;
    targets.push({ type: "item", id: itemTargetId(item), item });
  }
  // Пилосос на підлозі (§8.7): його, як іграшку, беруть лише порожніми руками, тож з повними він нічого не заступає.
  const vacuum = state.home.vacuumAt;
  if (vacuum && !handsFull) targets.push({ type: "vacuum", id: VACUUM_TARGET, at: vacuum });
  if (state.home.carriers.length > 0) targets.push({ type: "carrier", id: CARRIER_TARGET, at: { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y - 0.4 } });
  // З річчю в руках безлад не прибрати, тож він не заступає смітник чи стіл (§10).
  if (state.character.held === null) {
    for (const mess of state.home.messes) targets.push({ type: "mess", id: messTargetId(mess), mess });
  }
  for (const cat of state.cats) {
    if (cat.away === null && !isCarried(state, cat)) targets.push({ type: "cat", id: catTargetId(cat), cat });
  }
  return targets;
}

/** Центр цілі в клітинках. */
export function targetCenter(target: Target): Vec {
  switch (target.type) {
    case "object":
      return centerOf(target.object);
    case "item":
      return itemPoint(target.item);
    case "mess":
      return { x: target.mess.x, y: target.mess.y };
    case "cat":
      return { x: target.cat.x, y: target.cat.y };
    case "vacuum":
    case "carrier":
      return target.at;
  }
}

/** Відстань від точки до краю цілі (0 — усередині). */
function distanceTo(p: Vec, target: Target): number {
  switch (target.type) {
    case "object":
      return distanceToRect(p, target.object);
    case "item": {
      if (target.item.kind === "toy") break;
      const slot = slotById(target.item.slot);
      return distanceToRect(p, { x: slot.x + 0.15, y: slot.y + 0.15, w: 0.7, h: 0.7 });
    }
    default:
      break;
  }
  const c = targetCenter(target);
  return Math.max(0, Math.hypot(c.x - p.x, c.y - p.y) - SMALL_RADIUS);
}

/** Найближча до точки точка цілі: її край для речей і місць, центр для котів і безладу. */
function closestPoint(p: Vec, target: Target): Vec {
  const clampTo = (r: { x: number; y: number; w: number; h: number }): Vec => ({
    x: Math.min(Math.max(p.x, r.x), r.x + r.w),
    y: Math.min(Math.max(p.y, r.y), r.y + r.h),
  });
  if (target.type === "object") return clampTo(target.object);
  if (target.type === "item" && target.item.kind !== "toy") {
    const slot = slotById(target.item.slot);
    return clampTo({ x: slot.x + 0.15, y: slot.y + 0.15, w: 0.7, h: 0.7 });
  }
  return targetCenter(target);
}

/** Між персонажем і ціллю немає стіни: крізь стіну не дотягнутися (§10). */
function reachable(p: Vec, target: Target): boolean {
  const to = closestPoint(p, target);
  const length = Math.hypot(to.x - p.x, to.y - p.y);
  const steps = Math.ceil(length / 0.1);
  // Останній відрізок не перевіряємо: двері й речі біля стіни торкаються її краєм.
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps;
    if (isWall(Math.floor(p.x + (to.x - p.x) * t), Math.floor(p.y + (to.y - p.y) * t))) return false;
  }
  return true;
}

/** Наскільки персонаж дивиться на точку, від −1 до 1; ціль під ногами — трохи «позаду». */
function facingTo(body: Body, center: Vec): number {
  const length = Math.hypot(center.x - body.x, center.y - body.y);
  return length > UNDERFOOT ? ((center.x - body.x) * body.facing.x + (center.y - body.y) * body.facing.y) / length : UNDERFOOT_FACING;
}

/** Річ, яку зараз візьме кнопка перестановки (§8.7): окремо від `candidates`, бо будиночок і кігтеточка цілями дії не бувають. */
export function movableItem(state: GameState): PlacedItem | null {
  const body = state.character.body;
  let best: PlacedItem | null = null;
  let bestScore = Infinity;
  for (const item of state.home.items) {
    if (item.kind === "toy") continue;
    const target: Target = { type: "item", id: itemTargetId(item), item };
    const distance = distanceTo(body, target);
    if (distance > MOVING.take || !reachable(body, target)) continue;
    const score = distance - FACING_PRIORITY * facingTo(body, targetCenter(target));
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

/** Ціль дії: найближча, і передусім та, на яку дивиться персонаж. */
export function targetOf(state: GameState): Target | null {
  const body = state.character.body;
  let best: Target | null = null;
  let bestScore = Infinity;
  for (const target of candidates(state)) {
    const distance = distanceTo(body, target);
    if (distance > REACH || !reachable(body, target)) continue;
    const facing = facingTo(body, targetCenter(target));
    // Кіт нагорі — на холодильнику чи шафі — річ під собою не заступає: його й так не дістати; застрягле кошеня — ціль, його
    // знімають (§9.12, «Лазіння», перевірка етапу 2026-10-26).
    const high = target.type === "cat" && target.cat.stuck !== true && highPlaceOf(state, target.cat) !== null;
    const onObject = target.type === "cat" && !high && catOnFurniture(state, target.cat);
    const hidden = target.type === "item" && target.item.kind === "toy" && target.item.hidden === "fridge";
    const score =
      distance - FACING_PRIORITY * facing - (target.type === "mess" ? MESS_PRIORITY : 0) - (onObject ? CAT_ON_OBJECT_PRIORITY : 0) + (hidden ? HIDDEN_PRIORITY : 0);
    if (score < bestScore) {
      best = target;
      bestScore = score;
    }
  }
  return best;
}

/** Ціль за id, якщо вона ще існує. */
export function targetById(state: GameState, id: string): Target | null {
  return candidates(state).find((t) => t.id === id) ?? null;
}
