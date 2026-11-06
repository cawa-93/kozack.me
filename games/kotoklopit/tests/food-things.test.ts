// Миска й автогодівниця (§6.4, §8.7): керамічна миска бережить шлунок, розумна годівниця не дає переїдати.

import { describe, expect, it } from "vitest";

import { createCat, idleAct, weightOf } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { ILLNESS } from "../src/sim/config";
import { afterMeal } from "../src/sim/diseases";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Quality, Save } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  return save;
}

function catIn(save: Save): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 17.5, y: 3.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  return cat;
}

const bowlOf = (save: Save): BowlItem => save.current.home.items.find((i): i is BowlItem => i.kind === "bowl") as BowlItem;

/** Скільки котів із `runs` засмутили шлунок дешевим кормом із миски якості `bowl`. */
function upset(bowl: Quality | undefined, runs = 20000): number {
  const save = game();
  const cat = catIn(save);
  const rng = createRng(11);
  let ill = 0;
  for (let i = 0; i < runs; i++) {
    cat.diseases = [];
    afterMeal(save.current, cat, false, rng, bowl);
    if (cat.diseases.some((d) => d.id === "stomach")) ill += 1;
  }
  return ill;
}

/** Ситий кіт з'їв порцію з миски: на скільки погладшав. */
function overeat(feeder: Quality | null): number {
  const save = game();
  const cat = catIn(save);
  const bowl = bowlOf(save);
  bowl.food = 2;
  bowl.foodQuality = "cheap";
  if (feeder) save.current.home.feeders = [{ slot: bowl.slot, quality: feeder, food: 5, foodQuality: "cheap", sterile: false }];
  cat.needs.hunger = 0;
  const before = weightOf(cat);
  cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.1, elapsed: 0 };
  tickCats(save.current, 0.2, { present: false });
  return weightOf(cat) - before;
}

describe("керамічна миска (§6.4)", () => {
  it("дешевий корм із неї засмучує шлунок удвічі рідше", () => {
    const plastic = upset("cheap");
    const ceramic = upset("premium");
    expect(plastic).toBeGreaterThan(100);
    expect(ceramic / plastic).toBeGreaterThan(ILLNESS.ceramicStomach * 0.7);
    expect(ceramic / plastic).toBeLessThan(ILLNESS.ceramicStomach * 1.3);
  });

  it("корм із шафки чи ящика, без миски, рахується як із простої", () => {
    expect(upset(undefined)).toBe(upset("cheap"));
  });
});

describe("розумна автогодівниця (§8.7)", () => {
  it("ситий кіт із миски під нею не гладшає, під простою й без годівниці гладшає", () => {
    expect(overeat(null)).toBeGreaterThan(0);
    expect(overeat("cheap")).toBeGreaterThan(0);
    expect(overeat("premium")).toBe(0);
  });
});
