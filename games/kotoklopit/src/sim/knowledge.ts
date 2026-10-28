// Що знає персонаж (§9.9): риси відкриваються спостереженням — прояв зараховується, лише якщо
// персонаж його бачив (був у тій самій кімнаті й не спав).

import { traitLevel } from "./cat";
import { OBSERVATIONS, WITNESS_DISTANCE } from "./config";
import { emit } from "./events";
import { roomAt } from "./home";
import { absoluteMinute } from "./time";
import { traitGroup } from "./traits";
import type { Cat, GameState, Trait, Vec } from "./types";

/** Чи бачить персонаж зараз котів: удень удома, а не вночі уві сні. Ставить `tickCats`. */
let witnessing = true;

export function setWitnessing(value: boolean): void {
  witnessing = value;
}

/**
 * Персонаж бачить кота (§9.9): та сама кімната чи поруч у проході; кота на руках — завжди, кота в переносці —
 * у спільній поїздці; з душової кабіни — нікого (пошук багів 2026-10-25: кіт на руках «лишався» там, де його
 * підняли, а кота, що втік чи поїхав, не бачили ніколи).
 */
export function witnesses(state: GameState, cat: Cat): boolean {
  if (!witnessing || state.end !== null) return false;
  // Кота на руках видно завжди — і купаючи його в кабіні (перевірка купання 2026-10-28); з кабіни інших не видно.
  const held = state.character.held;
  if (held?.kind === "cat" && held.cat === cat.id) return true;
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.inside === true) return false;
  if (cat.away === "trip") return state.trip !== null;
  // Поки персонаж у поїздці, котів удома він не бачить (§8.5): дзвінок кур'єра чи гостей вони чують без нього (перевірка
  // поїздок 2026-10-28; раніше прояви «Гостей» і «Втеч» зараховувалися від тіла, що лишилося біля дверей).
  if (cat.away !== null || state.trip !== null) return false;
  return inView(state, cat);
}

/**
 * Точка в полі зору персонажа (§9.9): та сама кімната; крізь стіну — ні; поруч (до `WITNESS_DISTANCE`) — лише
 * коли хтось стоїть у проході між кімнатами.
 */
export function inView(state: GameState, p: Vec): boolean {
  const body = state.character.body;
  const room = roomAt(body);
  const other = roomAt(p);
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
 * `every` — прояв, що трапляється часто (кіт задрімав, спокійно вийшов із лотка), зараховується не частіше ніж раз
 * на стільки хвилин (рішення автора 2026-10-25, `TRAITS_REVIEW.md`).
 */
export function observe(state: GameState, cat: Cat, group: string, side: 1 | -1 = 1, woke = false, every = 0): void {
  const trait = cat.traits.find((t) => t.group === group);
  if (!trait || trait.known || Math.sign(trait.level) !== side) return;
  if (Math.sign(traitLevel(cat, group)) !== side) return;
  const info = traitGroup(group);
  if (info.quiet) return;
  // Персонаж щойно прокинувся (`woke`) — саме від цього кота чи бачить його біля ліжка (§9.9): хоч уночі він і спав,
  // це видно. Те, що коти роблять, поки він спить, і так не видно (`witnesses`).
  if (!woke && !witnesses(state, cat)) return;
  const key = `${group}${side > 0 ? "+" : "-"}`;
  const now = absoluteMinute(state.day, state.minute);
  const last = cat.observedAt?.[key];
  if (every > 0 && last !== undefined && now - last < every) return;
  if (every > 0) (cat.observedAt ??= {})[key] = now;
  const before = visibility(state, trait);
  trait.seen += 1;
  const after = visibility(state, trait);
  if (after === 3) trait.known = true;
  if (after !== before && after !== 0) emit(state, { type: "trait-noticed", cat: cat.id, group, stage: after });
}
