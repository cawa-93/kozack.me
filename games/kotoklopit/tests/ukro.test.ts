// «Укро Кіт» (§5.2, §4.1): модифікатори лише важкі, «Планове відключення» — у `MODIFIERS.ukroWeight` разів частіше за інші.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { MODIFIERS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { chooseDayModifier, chooseWeekModifier, DAY_PAIRS, WEEK_PAIRS } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { GameState } from "../src/sim/types";

/** Гра з котом і роботою: можливі й котячі, й робочі пари. */
function ukro(seed: number): GameState {
  const state = newGame({ address: "she", difficulty: "ukro", seed }).current;
  const cat = createCat(state, createRng(seed), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  cat.arrivedDay = -10;
  addCat(state, cat);
  return state;
}

/** Модифікатори дня в будній день (`day` 2) для `n` різних ігор. */
function weekdayPicks(n: number): (string | null)[] {
  const picks: (string | null)[] = [];
  for (let seed = 1; seed <= n; seed++) picks.push(chooseDayModifier(ukro(seed), 2, createRng(seed)));
  return picks;
}

describe("«Укро Кіт» (§5.2, §4.1)", () => {
  it("модифікатор дня — лише важкий бік пар; особливі й легкі не випадають", () => {
    const hard = new Set(DAY_PAIRS.map((p) => p.hard).filter((id) => id !== null));
    const picks = weekdayPicks(600);
    const ids = picks.filter((id) => id !== null);
    expect(ids.length).toBeGreaterThan(400);
    for (const id of ids) expect(hard).toContain(id);
  });

  it("«Планове відключення» — у стільки разів частіше за інші важкі, скільки його вага", () => {
    const counts = new Map<string, number>();
    for (const id of weekdayPicks(3000)) if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
    const outage = counts.get("outage") ?? 0;
    const others = [...counts].filter(([id]) => id !== "outage").map(([, n]) => n);
    const average = others.reduce((a, b) => a + b, 0) / others.length;
    expect(outage / average).toBeGreaterThan(MODIFIERS.ukroWeight.outage! * 0.8);
    expect(outage / average).toBeLessThan(MODIFIERS.ukroWeight.outage! * 1.25);
  });

  it("вчорашній не повторюється: «Планове відключення» двічі поспіль не випадає", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = ukro(seed);
      state.modifiers.day = "outage";
      expect(chooseDayModifier(state, 2, createRng(seed))).not.toBe("outage");
    }
  });

  it("модифікатор тижня — лише важкий бік", () => {
    const hard = new Set(WEEK_PAIRS.map((p) => p.hard));
    for (let seed = 1; seed <= 100; seed++) {
      const state = ukro(seed);
      for (let week = 1; week <= 10; week++) {
        const id = chooseWeekModifier(state, week);
        if (id !== null) expect(hard).toContain(id);
      }
    }
  });
});
