// Ціль дії персонажа (§10): річ квартири, річ котячого кутка, безлад чи кіт — найближча,
// і передусім та, на яку дивиться персонаж.

import { isCarried } from "./catai";
import { FACING_PRIORITY, REACH } from "./config";
import { centerOf, distanceToRect, itemPoint, OBJECTS, slotById, type HomeObject } from "./home";
import type { Cat, GameState, HomeItem, Mess, Vec } from "./types";

export type Target =
  | { type: "object"; id: string; object: HomeObject }
  | { type: "item"; id: string; item: HomeItem }
  | { type: "mess"; id: string; mess: Mess }
  | { type: "cat"; id: string; cat: Cat };

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

export const itemTargetId = (item: HomeItem): string => `item:${item.id}`;
export const messTargetId = (mess: Mess): string => `mess:${mess.id}`;
export const catTargetId = (cat: Cat): string => `cat:${cat.id}`;

/** Усі цілі, з якими зараз можна взаємодіяти. */
function candidates(state: GameState): Target[] {
  const targets: Target[] = [];
  for (const object of OBJECTS) if (object.interactive) targets.push({ type: "object", id: object.id, object });
  // Будиночок і кігтеточка — для котів: персонажу з ними робити нічого.
  for (const item of state.home.items) {
    if (item.kind !== "house" && item.kind !== "scratcher") targets.push({ type: "item", id: itemTargetId(item), item });
  }
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

/** Ціль дії: найближча, і передусім та, на яку дивиться персонаж. */
export function targetOf(state: GameState): Target | null {
  const body = state.character.body;
  let best: Target | null = null;
  let bestScore = Infinity;
  for (const target of candidates(state)) {
    const distance = distanceTo(body, target);
    if (distance > REACH) continue;
    const center = targetCenter(target);
    const length = Math.hypot(center.x - body.x, center.y - body.y);
    const facing = length > UNDERFOOT ? ((center.x - body.x) * body.facing.x + (center.y - body.y) * body.facing.y) / length : UNDERFOOT_FACING;
    const score = distance - FACING_PRIORITY * facing - (target.type === "mess" ? MESS_PRIORITY : 0);
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
