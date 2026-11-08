// Звуки тла (§11.4а, «Тло»): файли, гучність і розкид. Що й коли звучить — `groups/ambient.ts`.

import type { SoundDef } from "../types";

const files = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

/** Вулицю чути з трьох вікон водночас (`AMBIENT.windows`): петлі вулиці — на три голоси. */
const STREET = 3;

export const AMBIENT_SOUNDS = {
  birds: { files: ["birds-loop"], gain: 0.3, loop: true, voices: STREET },
  city: { files: ["city-loop"], gain: 0.3, loop: true, voices: STREET },
  evening: { files: ["evening-loop"], gain: 0.3, loop: true, voices: STREET },
  rain: { files: ["rain-loop"], gain: 0.3, loop: true, voices: STREET },
  cicadas: { files: ["cicadas-loop"], gain: 0.3, loop: true, voices: STREET },
  wind: { files: ["wind-loop"], gain: 0.3, loop: true, voices: STREET },
  festival: { files: ["festival-loop"], gain: 0.3, loop: true, voices: STREET },
  party: { files: ["party-loop"], gain: 0.3, loop: true },
  fridge: { files: ["fridge-loop"], gain: 0.2, loop: true },
  drill: { files: files("drill", 3), gain: 0.3, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
  hammer: { files: files("hammer", 3), gain: 0.3, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
  stairwell: { files: files("stairwell", 3), gain: 0.3, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
} as const satisfies Record<string, SoundDef>;

export type AmbientSound = keyof typeof AMBIENT_SOUNDS;
