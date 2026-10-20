// Особливості персонажів (§5.1, §4.1): борода й цикл.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { beardImpression, beardLook, cycleDay, cycleHygiene, cycleMove, cyclePhase, groomBeard } from "../src/sim/grooming";
import { callImpression } from "../src/sim/work";

describe("борода (§5.1)", () => {
  it("після гоління охайно 2 дні, далі щетина; через 4 дні — неохайна борода, яку можна підрівняти", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.character.stats.hygiene = 50;
    expect(beardLook(state)).toBe("clean");
    expect(callImpression(state)).toBe(0.5);
    state.day = 2;
    expect(beardLook(state)).toBe("stubble");
    expect(groomBeard(state, "trim")).toBeNull();
    state.day = 4;
    expect(beardLook(state)).toBe("unkempt");
    expect(beardImpression(state)).toBe(-0.5);
    expect(groomBeard(state, "trim")).toBe(5);
    expect(beardLook(state)).toBe("neat");
    state.day = 7;
    expect(beardLook(state)).toBe("unkempt");
    expect(groomBeard(state, "shave")).toBe(10);
    expect(beardLook(state)).toBe("clean");
  });

  it("у жіночого персонажа бороди немає", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    expect(beardImpression(save.current)).toBe(0);
    expect(groomBeard(save.current, "shave")).toBeNull();
  });
});

describe("цикл (§4.1)", () => {
  it("28 днів: менструація 1–5 — повільніше й гігієна швидше, приплив 10–14 — швидше", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.character.cycleStart = 0;
    state.day = 0;
    expect(cycleDay(state)).toBe(1);
    expect(cyclePhase(state)).toBe("period");
    expect(cycleMove(state)).toBeLessThan(1);
    expect(cycleHygiene(state)).toBeGreaterThan(1);
    state.day = 10;
    expect(cyclePhase(state)).toBe("energy");
    expect(cycleMove(state)).toBeGreaterThan(1);
    state.day = 20;
    expect(cyclePhase(state)).toBeNull();
    state.day = 28;
    expect(cycleDay(state)).toBe(1);
  });

  it("у чоловічого персонажа циклу немає", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    expect(cyclePhase(save.current)).toBeNull();
  });
});
