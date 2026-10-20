// Що знає персонаж (§9.9): прояви рис зараховуються лише свідком, три рівні видимості.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { newGame } from "../src/sim/game";
import { observe, visibility, witnesses } from "../src/sim/knowledge";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";

function game(difficulty: "easy" | "normal" | "hard" = "normal"): Save {
  const save = newGame({ sex: "female", difficulty, seed: 4 });
  save.current.character.body.x = 9.5;
  save.current.character.body.y = 8.5;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel>, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 3, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("свідок (§9.9)", () => {
  it("персонаж бачить кота в тій самій кімнаті, але не в іншій", () => {
    const save = game();
    const living = withCat(save, {});
    const kitchen = withCat(save, {}, { x: 16.5, y: 2.5 });
    expect(witnesses(save.current, living)).toBe(true);
    expect(witnesses(save.current, kitchen)).toBe(false);
  });
});

describe("рівні видимості (§9.9)", () => {
  it("на середній складності: 2 прояви — «❓», 4 — підказка, 6 — риса відкрита", () => {
    const save = game();
    const cat = withCat(save, { thief: 2 });
    const trait = cat.traits[0];
    if (!trait) throw new Error("немає риси");
    const stages: number[] = [];
    for (let i = 0; i < 6; i++) {
      observe(save.current, cat, "thief");
      stages.push(visibility(save.current, trait));
    }
    expect(stages).toEqual([0, 1, 1, 2, 2, 3]);
    expect(trait.known).toBe(true);
  });

  it("на легкій складності вистачає трьох проявів", () => {
    const save = game("easy");
    const cat = withCat(save, { zoomies: 1 });
    for (let i = 0; i < 3; i++) observe(save.current, cat, "zoomies");
    expect(cat.traits[0]?.known).toBe(true);
  });

  it("не свідок — не зараховується; тиха риса не проявляється ніколи", () => {
    const save = game();
    const cat = withCat(save, { thief: 1, longevity: 2 }, { x: 16.5, y: 2.5 });
    observe(save.current, cat, "thief");
    expect(cat.traits[0]?.seen).toBe(0);
    cat.x = 9.5;
    cat.y = 8.5;
    for (let i = 0; i < 10; i++) observe(save.current, cat, "longevity");
    expect(cat.traits[1]?.seen).toBe(0);
  });

  it("уночі, поки персонаж спить, прояви не видно", () => {
    const save = game();
    const cat = withCat(save, { hairballs: 2 });
    for (let i = 0; i < 24 * 60 * 3; i++) tickCats(save.current, 1, { present: false });
    expect(cat.traits[0]?.seen).toBe(0);
    expect(save.current.home.messes.some((m) => m.kind === "hairball")).toBe(true);
  });
});
