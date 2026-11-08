// Звуки тла (§11.4а, «Тло»): файли, гучність і розкид. Що й коли звучить — `groups/ambient.ts`.
// Тло — на 11–14 дБ тихіше за петлі дій квартири (плита, прання, душ), холодильник — ще тихіше; вулиця звучить із трьох вікон
// водночас, тож кожен її голос трохи тихіший. Ремонт помітний, але тихіший за звуки дій. Варіанти разових вирівняно за
// гучністю в `sources.json` (`level`).

import type { SoundDef } from "../types";

const files = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

export const AMBIENT_SOUNDS = {
  birds: { files: ["birds-loop"], gain: 0.055, loop: true },
  city: { files: ["city-loop"], gain: 0.065, loop: true },
  evening: { files: ["evening-loop"], gain: 0.05, loop: true },
  rain: { files: ["rain-loop"], gain: 0.055, loop: true },
  cicadas: { files: ["cicadas-loop"], gain: 0.055, loop: true },
  wind: { files: ["wind-loop"], gain: 0.055, loop: true },
  festival: { files: ["festival-loop"], gain: 0.07, loop: true },
  party: { files: ["party-loop"], gain: 0.1, loop: true },
  fridge: { files: ["fridge-loop"], gain: 0.04, loop: true },
  drill: { files: files("drill", 3), gain: 0.11, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
  hammer: { files: files("hammer", 3), gain: 0.18, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
  stairwell: { files: files("stairwell", 3), gain: 0.08, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 1 },
} as const satisfies Record<string, SoundDef>;

export type AmbientSound = keyof typeof AMBIENT_SOUNDS;
