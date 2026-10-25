// Що знає персонаж (§9.9): прояви рис зараховуються лише свідком, три рівні видимості.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { advance, newGame } from "../src/sim/game";
import { decideFoundling } from "../src/sim/modifiers";
import { TRAIT_GROUPS } from "../src/sim/traits";
import { fill } from "../src/texts";
import { observe, visibility, witnesses } from "../src/sim/knowledge";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { withCatCorner } from "./helpers";

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

  it("крізь стіну не видно, а з проходу між кімнатами — видно (пошук багів 2026-10-25)", () => {
    const save = game();
    // Ванна й кухня поруч, але між ними стіна.
    Object.assign(save.current.character.body, { x: 11.5, y: 2.5 });
    const kitchen = withCat(save, {}, { x: 13.5, y: 2.5 });
    expect(witnesses(save.current, kitchen)).toBe(false);
    // Персонаж у проході зі спальні до вітальні бачить кота у вітальні поруч.
    Object.assign(save.current.character.body, { x: 3.5, y: 5.5 });
    const living = withCat(save, {}, { x: 3.5, y: 7.5 });
    expect(witnesses(save.current, living)).toBe(true);
  });

  it("кіт на руках — завжди на очах, де б його не підняли; з душової кабіни не видно нікого", () => {
    const save = game();
    const cat = withCat(save, { water: 2 }, { x: 16.5, y: 2.5 });
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(witnesses(save.current, cat)).toBe(true);
    observe(save.current, cat, "water");
    expect(cat.traits[0]?.seen).toBe(1);
    save.current.character.held = null;
    Object.assign(cat, { x: 9.5, y: 8.5 });
    save.current.character.activity = { kind: "use", object: "shower", minutes: 5, inside: true } as unknown as NonNullable<Save["current"]["character"]["activity"]>;
    expect(witnesses(save.current, cat)).toBe(false);
  });

  it("кіт, що втік на сходи, не видно; кіт у переносці — видно, поки персонаж у поїздці з ним", () => {
    const save = game();
    const cat = withCat(save, {}, { x: 9.5, y: 8.5 });
    cat.away = "stairs";
    expect(witnesses(save.current, cat)).toBe(false);
    cat.away = "trip";
    expect(witnesses(save.current, cat)).toBe(false);
    save.current.trip = { destination: "vet" } as unknown as NonNullable<Save["current"]["trip"]>;
    expect(witnesses(save.current, cat)).toBe(true);
  });
});

describe("прояв — лише того боку, що показала поведінка (пошук багів 2026-10-25)", () => {
  it("«Тихоня» не відкривається тим, що нявкає інший бік групи; «Балакучий» — відкривається", () => {
    const save = game();
    const quiet = withCat(save, { talkative: -2 });
    const loud = withCat(save, { talkative: 2 });
    observe(save.current, quiet, "talkative");
    observe(save.current, loud, "talkative");
    expect(quiet.traits[0]?.seen).toBe(0);
    expect(loud.traits[0]?.seen).toBe(1);
    // «Годинами лежить» — прояв спокійного, а не енергійного.
    const calm = withCat(save, { energy: -1 });
    observe(save.current, calm, "energy", -1);
    observe(save.current, calm, "energy");
    expect(calm.traits[0]?.seen).toBe(1);
  });

  it("голодний кіт без корму не відкриває риси уваги за мить: похід по увагу — один прояв", () => {
    const save = withCatCorner(game("hard"));
    save.current.modifiers.day = null;
    save.current.day = 8;
    save.current.minute = 14 * 60;
    Object.assign(save.current.character.body, { x: 16.5, y: 3.5 });
    for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
    const cat = withCat(save, { affection: 2, demanding: 2, follower: 2, talkative: 2 }, { x: 15.5, y: 3.5 });
    cat.needs = { hunger: 95, thirst: 0, toilet: 0, fatigue: 0, attention: 70, play: 0 };
    cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0 };
    // Дві години кіт то просить біля миски, то йде до персонажа: раніше кожен крок давав прояв (9 за дві години).
    for (let i = 0; i < 6000; i++) advance(save, 0.02);
    for (const trait of cat.traits) {
      expect(trait.seen, trait.group).toBeGreaterThan(0);
      expect(trait.seen, trait.group).toBeLessThanOrEqual(5);
    }
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

describe("що видно про кота з самого початку (пошук багів 2026-10-25)", () => {
  it("знайда: порода видна на легкій і не видна на важкій — як у притулку (§9.11)", () => {
    for (const [difficulty, known] of [["easy", true], ["hard", false]] as const) {
      const save = game(difficulty);
      save.current.today.foundling = true;
      const cat = decideFoundling(save.current, true, createRng(3));
      expect(cat?.breedKnown, difficulty).toEqual([known, known]);
    }
  });

  it("прояви в картці — у роді кота й до гравця на «ви»", () => {
    for (const group of TRAIT_GROUPS) for (const sign of group.signs ?? []) expect(sign, group.id).not.toMatch(/персонаж/);
    const lap = TRAIT_GROUPS.find((g) => g.id === "lap")?.signs?.[0] ?? "";
    expect(fill(lap, "female")).toBe("сама застрибує на коліна");
  });
});
