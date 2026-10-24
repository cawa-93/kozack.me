// Що знає персонаж (§9.9): риси відкриваються спостереженням — прояв зараховується, лише якщо
// персонаж його бачив (був у тій самій кімнаті й не спав).

import { OBSERVATIONS, WITNESS_DISTANCE } from "./config";
import { emit } from "./events";
import { ROOMS } from "./home";
import { traitGroup } from "./traits";
import type { Cat, GameState, Trait, Vec } from "./types";

/** Чи бачить персонаж зараз котів: удень удома, а не вночі уві сні. Ставить `tickCats`. */
let witnessing = true;

export function setWitnessing(value: boolean): void {
  witnessing = value;
}

function roomOf(p: Vec): string | null {
  return ROOMS.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.id ?? null;
}

/** Персонаж бачить кота: та сама кімната або зовсім поруч (§9.9). */
export function witnesses(state: GameState, cat: Cat): boolean {
  if (!witnessing || state.end !== null || cat.away !== null) return false;
  return inView(state, cat);
}

/** Точка в полі зору персонажа: та сама кімната або зовсім поруч (§9.9). */
export function inView(state: GameState, p: Vec): boolean {
  const body = state.character.body;
  const room = roomOf(body);
  if (room !== null && room === roomOf(p)) return true;
  return Math.hypot(body.x - p.x, body.y - p.y) <= WITNESS_DISTANCE;
}

/** Рівень видимості риси (§9.9): 0 — нічого, 1 — «❓ Помічено щось дивне», 2 — підказка, 3 — відкрито. */
export function visibility(state: GameState, trait: Trait): 0 | 1 | 2 | 3 {
  if (trait.known) return 3;
  const need = OBSERVATIONS[state.difficulty];
  if (trait.seen >= need) return 3;
  if (trait.seen >= (need * 2) / 3) return 2;
  if (trait.seen >= need / 3) return 1;
  return 0;
}

/** Прояв риси групи: якщо в кота є така риса й персонаж це бачив, спостереження зараховується. */
export function observe(state: GameState, cat: Cat, group: string): void {
  const trait = cat.traits.find((t) => t.group === group);
  if (!trait || trait.known) return;
  const info = traitGroup(group);
  if (info.quiet || info.nocturnal) return;
  if (!witnesses(state, cat)) return;
  const before = visibility(state, trait);
  trait.seen += 1;
  const after = visibility(state, trait);
  if (after === 3) trait.known = true;
  if (after !== before && after !== 0) emit(state, { type: "trait-noticed", cat: cat.id, group, stage: after });
}
