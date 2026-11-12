// Ласощі після неприємного (§7): повертають частину любові, утраченої саме через неприємне від персонажа (ліки, ветеринар,
// купання), — а не через брудний лоток чи день без взаємодії: там персонаж котові нічого не зробив.

import { describe, expect, it } from "vitest";

import { closeCatDay, createCat, idleAct, offend, changeLove, traitLevel } from "../src/sim/cat";
import { giveTreat } from "../src/sim/care";
import { DIRTY_LITTER, LOVE, TREATS, VET } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 4 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  save.current.home.supplies.treats.cheap = 5;
  return save;
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  // Без «Відданості», «Образливості» й «Мстивості» любов змінюється рівно на задане, а ласощі повертають `TREATS.refund`.
  for (const group of ["devotion", "touchy", "vengeful"]) expect(traitLevel(cat, group)).toBe(0);
  return cat;
}

/** Скільки любові дали ласощі коту на руках. */
function treat(save: Save, cat: Cat): number {
  save.current.character.held = { kind: "cat", cat: cat.id };
  const before = cat.love;
  expect(giveTreat(save.current, "cheap", createRng(1))).toBe(true);
  save.current.character.held = null;
  return cat.love - before;
}

describe("ласощі після неприємного (§7)", () => {
  it("після брудного лотка ласощі дають лише своє: повертати нічого", () => {
    const save = game();
    const cat = withCat(save);
    changeLove(save.current, cat, DIRTY_LITTER.love, "брудний лоток");
    expect(cat.love).toBe(50 + DIRTY_LITTER.love);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });

  it("після дня без взаємодії ласощі дають лише своє: повертати нічого", () => {
    const save = game();
    const cat = withCat(save);
    closeCatDay(save.current, cat);
    expect(cat.love).toBe(50 + LOVE.noInteractionPerDay);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });

  it("після ветеринара — половина саме тієї втрати, хоч потім був і брудний лоток, і день без взаємодії", () => {
    const save = game();
    const cat = withCat(save);
    offend(save.current, cat, VET.love, "ветеринар");
    expect(cat.love).toBe(50 + VET.love);
    changeLove(save.current, cat, DIRTY_LITTER.love, "брудний лоток");
    closeCatDay(save.current, cat);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -VET.love, 9);
    // Повертають раз: наступні ласощі — лише свої.
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });
});
