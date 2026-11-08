// Звуки поїздки (§8.5; `SOUND_PLAN.md`, «Ефекти», рядок `trip`): поки що машина без руху — персонаж сів на виїзді (двері), а на
// місці тягне ручник і виходить.
// У поїздці квартири не чути (режим `away`), тож звуки групи — на шині інтерфейсу (`ui`) і без місця.

import type { GameEvent } from "../../../sim/events";
import type { Cue, SoundGroup } from "../types";

const NONE: readonly Cue[] = [];
const DEPART: readonly Cue[] = [{ sound: "car-door" }];
const ARRIVE: readonly Cue[] = [{ sound: "handbrake" }, { sound: "car-door", delayMs: 650 }];

export const group: SoundGroup = {
  id: "trip",
  sounds: {
    "car-door": { files: ["car-door-1"], gain: 0.6, pitch: 0.04, voices: 1, ui: true },
    handbrake: { files: ["handbrake-1"], gain: 0.5, pitch: 0.04, voices: 1, ui: true },
  },

  onEvent(event: GameEvent): readonly Cue[] {
    switch (event.type) {
      case "trip-started":
        return DEPART;
      case "trip-arrived":
        return ARRIVE;
      default:
        return NONE;
    }
  },
};
