// Звуки поїздки (§8.5, §11.4а; `SOUND_PLAN.md`, «Ефекти», рядок `trip`): двері авто на виїзді, ручник і двері на місці; чути
// й у поїздці.

import { describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/trip";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";

describe("звуки поїздки", () => {
  const state = newGame({ address: "he", difficulty: "normal", seed: 3 }).current;
  const sounds = (event: GameEvent): string[] => (group.onEvent?.(event, state) ?? []).map((cue) => cue.sound);

  it("двері авто — коли сів на виїзді; на місці — ручник і двері", () => {
    expect(sounds({ type: "trip-started", destination: "shop" })).toEqual(["car-door"]);
    expect(sounds({ type: "trip-arrived", destination: "shop" })).toEqual(["handbrake", "car-door"]);
    expect(sounds({ type: "doorbell" })).toEqual([]);
  });

  it("у поїздці квартири не чути, тож звуки групи — на шині інтерфейсу й закодовані", () => {
    for (const [name, def] of Object.entries(group.sounds)) {
      expect(def.ui, name).toBe(true);
      for (const file of def.files) expect(soundFile("trip", file), `${name}: ${file}`).not.toBeNull();
    }
  });
});
