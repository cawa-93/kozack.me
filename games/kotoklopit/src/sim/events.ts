// Події симуляції. З них сцена показує бабли (§11.4) і ранкові повідомлення (§4),
// а режим розробки веде журнал прихованих змін (§11.5). Стан гри від підписників не залежить.

import type { Delivery, GameEnd, GameState, Item, NightReport, Quality } from "./types";

/** Рівень терпіння керівництва (§8.6): ok, «!» чи «Х». */
export type PatienceLevel = "ok" | "warning" | "out";

/** Чому дія не вдалася. */
export type Refusal = "empty" | "hands-full" | "occupied" | "too-early" | "nothing";

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
  | { type: "glitch"; chance: number; angle: number };

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
