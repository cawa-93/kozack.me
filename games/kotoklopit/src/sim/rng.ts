// Детермінована випадковість (§6.1). Стан кожного потоку — одне 32-бітне число,
// тож він зберігається разом зі станом гри й після завантаження продовжується так само.
//
// Потоки:
// - conditions — умови дня (модифікатор, кур'єр, риси кошеняти): залежить лише від дня,
//   тож на переграванні повторюється;
// - behavior — поведінка котів: залежить ще й від кількості перегравань, тож щоразу нова;
// - night — нічні кидки: залежить лише від дня, щоб перегравання не перекидало смерть кота.

import type { GameState, RngStream } from "./types";

export interface Rng {
  /** Число в [0, 1). */
  next(): number;
  /** true з імовірністю p. */
  chance(p: number): boolean;
  /** Ціле число в [min, max]. */
  int(min: number, max: number): number;
}

const STREAM_ID = { conditions: 1, behavior: 2, night: 3 } as const;

function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

/** Зерно з кількох цілих чисел. */
export function deriveSeed(...parts: number[]): number {
  let h = 0x6a09e667;
  for (const part of parts) h = mix((h ^ mix(part >>> 0)) + 0x9e3779b9);
  return h;
}

export function streamSeed(seed: number, stream: keyof typeof STREAM_ID, day: number, replays = 0): number {
  return stream === "behavior"
    ? deriveSeed(seed, STREAM_ID[stream], day, replays)
    : deriveSeed(seed, STREAM_ID[stream], day);
}

// mulberry32: крок генератора повертає число й новий стан.
function step(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

function makeRng(read: () => number, write: (state: number) => void): Rng {
  const next = (): number => {
    const [value, state] = step(read());
    write(state);
    return value;
  };
  return {
    next,
    chance: (p) => next() < p,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}

/** Окремий генератор, стан якого ніде не зберігається. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return makeRng(() => state, (s) => (state = s));
}

/** Генератор потоку, що читає й записує свій стан у стан гри. */
export function stateRng(state: GameState, stream: RngStream): Rng {
  return makeRng(() => state.rng[stream], (s) => (state.rng[stream] = s));
}

/** Засіяти потоки стану на початку дня. */
export function seedDay(state: GameState): void {
  state.rng.conditions = streamSeed(state.seed, "conditions", state.day);
  state.rng.behavior = streamSeed(state.seed, "behavior", state.day, state.replays);
}
