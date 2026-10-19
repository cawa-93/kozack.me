// Події симуляції. З них сцена показує бабли (§11.4) і ранкові повідомлення (§4),
// а режим розробки веде журнал прихованих змін (§11.5). Стан гри від підписників не залежить.

import type { Delivery, GameEnd, GameState, Item, Mess, NightReport, Quality, TraitLevel } from "./types";

/** Рівень терпіння керівництва (§8.6): ok, «!» чи «Х». */
export type PatienceLevel = "ok" | "warning" | "out";

/** Чому дія не вдалася: порожньо, руки зайняті, місце зайняте, зарано, нічого робити, річ не підходить. */
export type Refusal = "empty" | "hands-full" | "occupied" | "too-early" | "nothing" | "wrong";

export type GameEvent =
  | { type: "night"; report: NightReport }
  | { type: "game-over"; end: GameEnd }
  | { type: "took"; object: string; item: Item }
  | { type: "put"; object: string; item: Item }
  | { type: "trashed"; item: Item }
  | { type: "refused"; object: string; reason: Refusal }
  | { type: "cooked"; result: "ready" | "burnt" }
  | { type: "ate"; satiety: number; food: number }
  | { type: "showered"; hygiene: number; quality: Quality | null; left: number }
  | { type: "work-started" }
  | { type: "work-stopped"; minutes: number; money: number; reputation: number; sanity: number }
  | { type: "patience"; level: PatienceLevel }
  | { type: "standup-started" }
  | { type: "standup"; attended: boolean; reputation: number }
  | { type: "ordered"; delivery: Delivery; price: number }
  | { type: "doorbell"; delivery: Delivery }
  | { type: "received"; deliveries: Delivery[] }
  | { type: "dash" }
  | { type: "glitch"; chance: number; angle: number }
  // Коти (§9.3, §9.6, §9.12). Приховані зміни бачить лише журнал режиму розробки.
  | { type: "cat-mood"; cat: number; delta: number; reason: string }
  | { type: "cat-love"; cat: number; delta: number; reason: string }
  | { type: "cat-day"; cat: number; mood: number; health: number; love: number }
  | { type: "cat-trait"; cat: number; group: string; level: TraitLevel; title: string }
  | { type: "cat-arrived"; cat: number }
  | { type: "cat-ate"; cat: number; quality: Quality }
  | { type: "cat-refused-food"; cat: number }
  | { type: "meow"; cat: number }
  | { type: "mess"; mess: Mess }
  | { type: "cleaned"; what: "litter" | Mess["kind"]; sanity: number }
  | { type: "fed"; item: number; food: number }
  | { type: "watered"; item: number }
  | { type: "picked-up"; cat: number; offended: boolean }
  | { type: "put-down"; cat: number }
  | { type: "purr"; cat: number; enjoyed: boolean }
  | { type: "bite"; cat: number };

export type Listener = (event: GameEvent, state: GameState) => void;

const listeners = new Set<Listener>();

/** Підписатися на події; повертає функцію, що скасовує підписку. */
export function onEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(state: GameState, event: GameEvent): void {
  for (const listener of listeners) listener(event, state);
}

/** Закінчити гру (§6.1). Друга причина вже нічого не змінює. */
export function endGame(state: GameState, end: GameEnd): void {
  if (state.end !== null) return;
  state.end = end;
  emit(state, { type: "game-over", end });
}
