// Зміна складності посеред гри (§5.2): нова діє одразу, а саме перемикання нічого не робить — набране до порогу за складністю
// зберігає свою частку.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH } from "../src/sim/config";
import { tickStove } from "../src/sim/actions";
import { setDifficulty } from "../src/sim/difficulty";
import { newGame } from "../src/sim/game";
import { visibility } from "../src/sim/knowledge";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Difficulty, GameState, Trait } from "../src/sim/types";
import { searchProgress } from "../src/sim/work";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "ukro"];

const game = (difficulty: Difficulty = "normal"): GameState => newGame({ address: "she", difficulty, seed: 3 }).current;

function withTraits(state: GameState, traits: Trait[]): Trait[] {
  const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 5.5, y: 8.5 } });
  cat.traits = traits;
  addCat(state, cat);
  return cat.traits;
}

describe("зміна складності (§5.2)", () => {
  it("нова складність діє одразу; та сама — нічого не змінює", () => {
    const state = game();
    state.job.unemployed = true;
    state.job.searchHours = 7;
    setDifficulty(state, "normal");
    expect(state.job.searchHours).toBe(7);
    setDifficulty(state, "hard");
    expect(state.difficulty).toBe("hard");
  });

  it("пошук роботи: частка набраних годин і вакансія ті самі, а майже знайдена робота не знаходиться від перемикання на легку", () => {
    const state = game();
    state.job.unemployed = true;
    state.job.searchHours = JOB_SEARCH.hours.normal - 0.5;
    const before = searchProgress(state);
    setDifficulty(state, "easy");
    expect(state.job.searchHours).toBeLessThan(JOB_SEARCH.hours.easy);
    expect(searchProgress(state)).toEqual(before);
    setDifficulty(state, "hard");
    expect(searchProgress(state).vacancy).toBe(before.vacancy);
    expect(searchProgress(state).progress).toBeCloseTo(before.progress);
  });

  it("страва на плиті не підгорає від перемикання на важку, а частка часу до підгоряння та сама", () => {
    const state = game();
    const stove = state.home.stove;
    stove.item = { kind: "meal", quality: "cheap" };
    stove.minutes = BURN_MINUTES.normal - 5;
    const share = (stove.minutes - COOK_MINUTES) / (BURN_MINUTES.normal - COOK_MINUTES);
    setDifficulty(state, "hard");
    expect((stove.minutes - COOK_MINUTES) / (BURN_MINUTES.hard - COOK_MINUTES)).toBeCloseTo(share);
    tickStove(state, 1);
    expect(stove.item?.kind).toBe("meal");
  });

  it("сира страва готується так само: час готування від складності не залежить", () => {
    const state = game();
    const stove = state.home.stove;
    stove.item = { kind: "raw", quality: "cheap" };
    stove.minutes = COOK_MINUTES - 3;
    setDifficulty(state, "easy");
    expect(stove.minutes).toBe(COOK_MINUTES - 3);
  });

  it("риси: стадія видимості та сама за будь-яких перемикань туди й назад; відома лишається відомою", () => {
    for (const start of DIFFICULTIES) {
      const state = game(start);
      const traits = withTraits(state, [
        ...Array.from({ length: 10 }, (_, seen) => ({ group: "energy", level: 1 as const, seen, known: false })),
        { group: "talkative", level: 2, seen: 0, known: true },
      ]);
      const stages = traits.map((t) => visibility(state, t));
      for (const next of ["hard", "ukro", "easy", "normal", "ukro", "easy", "hard", "normal", "hard", "easy", "ukro"] as const) {
        setDifficulty(state, next);
        expect(traits.map((t) => visibility(state, t))).toEqual(stages);
      }
    }
  });
});
