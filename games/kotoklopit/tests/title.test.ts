// Титулка дня (§4, §8.8): що бачить гравець уранці.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { NightReport } from "../src/sim/types";
import { dayTitle } from "../src/ui/cards";

describe("титулка дня (§4)", () => {
  it("хто будив уночі — по рядку на кота, у роді кота", () => {
    const { current: state } = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    const tom = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    const queen = createCat(state, createRng(2), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    Object.assign(tom, { name: "Мурчик", sex: "male" });
    Object.assign(queen, { name: "Мурка", sex: "female" });
    addCat(state, tom);
    addCat(state, queen);
    state.day = 1;
    const night = {
      wakeUps: [
        { cat: tom.id, reason: "night" },
        { cat: tom.id, reason: "night" },
        { cat: queen.id, reason: "morning" },
      ],
      newCats: [],
      givenCats: [],
      lostCats: [],
      utilities: null,
    } as unknown as NightReport;
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    expect(lines.filter((l) => l === "Мурчик не давав спати вночі.")).toHaveLength(1);
    expect(lines).toContain("Мурка вимагала сніданку о 05:00.");
  });
});
