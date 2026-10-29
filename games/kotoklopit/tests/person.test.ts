// Персонаж без статевих механік (§5.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4).

import { describe, expect, it } from "vitest";

import { dash } from "../src/sim/body";
import { DASH_COOLDOWN_MINUTES } from "../src/sim/config";
import { advance, deserialize, newGame, serialize } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import type { Save } from "../src/sim/types";

/** Хвилина ходьби праворуч із середини вітальні: скільки клітинок пройдено. */
function walkMinute(save: Save): number {
  Object.assign(save.current.character.body, { x: 4.5, y: 8.5, facing: { x: 1, y: 0 } });
  advance(save, 1, { move: { x: 1, y: 0 }, hold: false });
  return save.current.character.body.x - 4.5;
}

describe("жіночого циклу немає (рішення автора 2026-10-29, А4)", () => {
  it("будь-якого дня 28-денного «циклу» жіночий персонаж ходить, робить ривок і втрачає гігієну, як завжди", () => {
    for (let day = 0; day < 28; day++) {
      const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
      const state = save.current;
      state.day = day;
      state.modifiers = { day: null, week: null };
      expect(walkMinute(save)).toBeCloseTo(3);
      expect(hygieneFactor(state)).toBe(1);
      expect(dash(state)).toBe(true);
      expect(state.character.body.dashCooldown).toBe(DASH_COOLDOWN_MINUTES);
    }
  });

  it("зі старого збереження зникає день початку циклу", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { cycleStart: -12 });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("cycleStart");
  });
});
