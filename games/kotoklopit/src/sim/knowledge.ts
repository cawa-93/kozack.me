// Що знає персонаж (§9.9): риси відкриваються спостереженням — прояв зараховується, лише якщо
// персонаж його бачив (був у тій самій кімнаті й не спав).

import { traitLevel } from "./cat";
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

/**
 * Персонаж бачить кота (§9.9): та сама кімната чи поруч у проході; кота на руках — завжди, кота в переносці —
 * у спільній поїздці; з душової кабіни — нікого (пошук багів 2026-10-25: кіт на руках «лишався» там, де його
 * підняли, а кота, що втік чи поїхав, не бачили ніколи).
 */
export function witnesses(state: GameState, cat: Cat): boolean {
  if (!witnessing || state.end !== null) return false;
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.inside === true) return false;
  const held = state.character.held;
  if (held?.kind === "cat" && held.cat === cat.id) return true;
  if (cat.away === "trip") return state.trip !== null;
  if (cat.away !== null) return false;
  return inView(state, cat);
}

/**
 * Точка в полі зору персонажа (§9.9): та сама кімната; крізь стіну — ні; поруч (до `WITNESS_DISTANCE`) — лише
 * коли хтось стоїть у проході між кімнатами.
 */
export function inView(state: GameState, p: Vec): boolean {
  const body = state.character.body;
  const room = roomOf(body);
  const other = roomOf(p);
  if (room !== null && room === other) return true;
  if (room !== null && other !== null) return false;
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

/**
 * Прояв риси групи: зараховується, якщо в кота є така риса, її знак збігається з побаченою поведінкою і персонаж
 * це бачив. `side` — котрий бік показала поведінка: 1 — більше того, що називає група (нявчить, мчить, дере
 * диван), −1 — менше (годинами лежить, дере лише кігтеточку). Знак — самої риси характеру, без породи.
 * Без цього «Тихоня» відкривалася тим, що приходила по увагу (пошук багів 2026-10-25).
 * Порода й характер протилежні — кіт поводиться за знаком суми, тож прояв зараховується, лише коли сума того
 * самого знака, що й риса: «Спокійна» сомалі (+2 породи, −1 характеру) поводиться як енергійна (§9.9).
 */
export function observe(state: GameState, cat: Cat, group: string, side: 1 | -1 = 1, woke = false): void {
  const trait = cat.traits.find((t) => t.group === group);
  if (!trait || trait.known || Math.sign(trait.level) !== side) return;
  if (Math.sign(traitLevel(cat, group)) !== side) return;
  const info = traitGroup(group);
  if (info.quiet || (info.nocturnal && !woke)) return;
  // Кіт розбудив персонажа (`woke`): персонаж спав, але прокинувся саме від нього (§9.9).
  if (!woke && !witnesses(state, cat)) return;
  const before = visibility(state, trait);
  trait.seen += 1;
  const after = visibility(state, trait);
  if (after === 3) trait.known = true;
  if (after !== before && after !== 0) emit(state, { type: "trait-noticed", cat: cat.id, group, stage: after });
}
