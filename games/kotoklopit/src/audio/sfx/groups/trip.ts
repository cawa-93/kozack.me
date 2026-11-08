// Звуки поїздки (§8.5; `SOUND_PLAN.md`, «Ефекти», рядок `trip`): на виїзді з дому й з парковки додому персонаж сідає, заводить
// мотор і рушає; машина стала на парковці — мотор глухне, ручник, двері; аварія — удар. Решту грає сцена гонки сама (день у поїздці
// спить): гудіння мотора за швидкістю (`trip/engine.ts`), газування (`trip/revs.ts`) і гудки машин позаду (`trip/horns.ts`).
// У поїздці квартири не чути (режим `away`), тож звуки групи — на шині інтерфейсу (`ui`) і без місця.

import type { GameEvent } from "../../../sim/events";
import type { Cue, SceneMoment, SoundGroup } from "../types";

const NONE: readonly Cue[] = [];
const DEPART: readonly Cue[] = [
  { sound: "car-door" },
  { sound: "engine-start", delayMs: 550 },
  { sound: "rev", delayMs: 1450 },
];
const PARKED: readonly Cue[] = [
  { sound: "engine-stop" },
  { sound: "handbrake", delayMs: 350 },
  { sound: "car-door", delayMs: 1050 },
];
const CRASH: readonly Cue[] = [{ sound: "crash" }];

export const group: SoundGroup = {
  id: "trip",
  sounds: {
    "car-door": { files: ["car-door-1"], gain: 0.6, pitch: 0.04, voices: 1, ui: true },
    handbrake: { files: ["handbrake-1"], gain: 0.5, pitch: 0.04, voices: 1, ui: true },
    "engine-start": { files: ["engine-start-1"], gain: 0.5, pitch: 0.03, voices: 1, ui: true },
    "engine-stop": { files: ["engine-stop-1"], gain: 0.45, pitch: 0.03, voices: 1, ui: true },
    // Гудіння: висоту й гучність щокадру задає сцена гонки (`trip/engine.ts`).
    engine: { files: ["engine-loop"], gain: 0.35, loop: true, ui: true },
    // Газування: на виїзді й щоразу, як у гонці натиснули газ (`trip/revs.ts`), — але газ підтискають часто, тож пауза.
    rev: { files: ["rev-1", "rev-2", "rev-3"], gain: 0.4, pitch: 0.05, cooldownMs: 1500, voices: 1, ui: true },
    crash: { files: ["crash-1"], gain: 0.8, voices: 1, ui: true },
    // Різні машини — різні клаксони.
    horn: { files: ["horn-1", "horn-2", "horn-3"], gain: 0.45, pitch: 0.03, cooldownMs: 600, voices: 2, ui: true },
  },

  onEvent(event: GameEvent): readonly Cue[] {
    switch (event.type) {
      case "trip-started":
        return DEPART;
      case "trip-crashed":
        return CRASH;
      default:
        return NONE;
    }
  },

  onScene(moment: SceneMoment): readonly Cue[] {
    if (moment === "parked") return PARKED;
    return moment === "unparked" ? DEPART : NONE;
  },
};
