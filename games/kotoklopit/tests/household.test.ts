// Побут і догляд (§7, §8.7, §9.10): ласощі, нашийник, купання, прання, шерсть і пилосос, техніка, поломки.

import { describe, expect, it } from "vitest";

import { bathe, giveTreat, nightlyCare, putCollar } from "../src/sim/care";
import { changeLove, createCat } from "../src/sim/cat";
import { utilitiesDue } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import { annoyingMesses, feederBowls, hygieneFactor, robotProgress, tapWasher, tickHousehold, wearOut } from "../src/sim/household";
import { tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { holdUntilDone, hours, recordEvents, standAt, withCatCorner } from "./helpers";

const always = () => ({ ...createRng(1), chance: () => true });
const never = () => ({ ...createRng(1), chance: () => false });

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  return save;
}

function held(save: Save, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 3, at: { x: 9.5, y: 8.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  save.current.character.held = { kind: "cat", cat: cat.id };
  return cat;
}

describe("ласощі й нашийник (§7, §9.10)", () => {
  it("ласощі одразу після неприємного повертають половину втраченої любові", () => {
    const save = game();
    const cat = held(save);
    save.current.home.supplies.treats = { cheap: 5, premium: 0 };
    cat.love = 50;
    changeLove(save.current, cat, -4, "ліки");
    const after = cat.love;
    giveTreat(save.current, "cheap", never());
    expect(cat.love).toBeCloseTo(after + 2 + 2);
  });

  it("нашийник: дешевий іноді губиться", () => {
    const save = game();
    const cat = held(save);
    save.current.home.supplies.collar = { cheap: 1, premium: 0 };
    expect(putCollar(save.current, "cheap")).toBe(true);
    expect(cat.collar?.quality).toBe("cheap");
    nightlyCare(save.current, always());
    expect(cat.collar).toBeNull();
  });
});

describe("купання (§8.7)", () => {
  it("кота несуть до душу; «Водолаз» радіє, інший ображається", () => {
    const save = game();
    const lover = held(save, { water: 2 });
    save.current.home.supplies.shampoo = { cheap: 5, premium: 0 };
    standAt(save, "shower");
    const mood = lover.mood;
    const sanity = save.current.character.stats.sanity;
    interact(save);
    expect(lover.mood).toBeGreaterThan(mood);
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    expect(save.current.home.supplies.shampoo.cheap).toBe(4);
    const other = held(save);
    const love = other.love;
    bathe(save.current, never());
    expect(other.love).toBeLessThan(love);
  });
});

describe("прання (§8.7)", () => {
  it("спершу вигнати кота з барабана, потім прання 60 хвилин і розвісити", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.x = 10.5;
    cat.y = 1.5;
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    save.current.home.supplies.detergent.cheap = 4;
    expect(tapWasher(save.current)).toBe("cat");
    expect(tapWasher(save.current)).toBe("started");
    tickHousehold(save.current, 600, 61);
    expect(save.current.home.washer.state).toBe("done");
    save.current.home.clothes = 0;
    expect(hygieneFactor(save.current)).toBeGreaterThan(1);
    expect(tapWasher(save.current)).toBe("hung");
    expect(save.current.home.clothes).toBe(7);
  });
});

describe("шерсть і техніка (§8.7)", () => {
  it("пилососять утриманням дії біля шафи: шерсті немає", () => {
    const save = game();
    save.current.minute = hours(19);
    save.current.home.fur = 70;
    standAt(save, "vacuum");
    holdUntilDone(save);
    expect(save.current.home.fur).toBe(0);
  });

  it("автогодівниця о 08:00 насипає в порожню миску; фонтанчик доливає воду; техніка додає комунальних", () => {
    const save = game();
    save.current.home.supplies.catFood = { cheap: 10, premium: 0 };
    save.current.home.appliances.feeder = "premium";
    save.current.home.appliances.fountain = "cheap";
    const water = save.current.home.items.find((i) => i.kind === "water");
    if (water?.kind === "water") water.water = 0;
    tickHousehold(save.current, 7 * 60 + 59, 2);
    const bowl = save.current.home.items.find((i) => i.kind === "bowl");
    expect(bowl?.kind === "bowl" && bowl.food).toBe(1);
    expect(water?.kind === "water" && water.water).toBe(8);
    expect(utilitiesDue(save.current)).toBe(40 + 8 + 6);
  });

  it("одне утримання — одна дія: після пилососа, що тримають далі, новий не починається (§10)", () => {
    const save = game();
    save.current.home.fur = 80;
    standAt(save, "vacuum");
    const { events, stop } = recordEvents();
    for (let i = 0; i < 60; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(events.filter((e) => e.type === "vacuumed")).toHaveLength(1);
    // Відпустили й знову тримають — пилосос знову працює.
    advance(save, 0.1, { move: { x: 0, y: 0 }, hold: false });
    for (let i = 0; i < 30; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.filter((e) => e.type === "vacuumed")).toHaveLength(2);
  });

  it("робот-пилосос о 12:00 годину їздить і прибирає шерсть поступово (§8.7)", () => {
    const save = game();
    save.current.home.appliances.robot = "cheap";
    save.current.home.fur = 60;
    save.current.minute = 11 * 60 + 50;
    expect(robotProgress(save.current)).toBeNull();
    tickHousehold(save.current, 11 * 60 + 50, 40);
    save.current.minute = 12 * 60 + 30;
    expect(robotProgress(save.current)).toBeCloseTo(0.5);
    expect(save.current.home.fur).toBeGreaterThan(20);
    expect(save.current.home.fur).toBeLessThan(40);
    tickHousehold(save.current, 12 * 60 + 30, 35);
    save.current.minute = 13 * 60 + 5;
    expect(save.current.home.fur).toBe(0);
    expect(robotProgress(save.current)).toBeNull();
  });

  it("дешева автогодівниця наповнює лише першу миску й повідомляє, яку (§8.7)", () => {
    const save = game();
    save.current.home.supplies.catFood = { cheap: 10, premium: 0 };
    save.current.home.appliances.feeder = "cheap";
    const bowls = save.current.home.items.filter((i) => i.kind === "bowl");
    save.current.home.items.push({ ...(bowls[0] as BowlItem), id: 999, slot: "bowl-3", food: 0 });
    for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 0;
    const { events, stop } = recordEvents();
    tickHousehold(save.current, 18 * 60 + 59, 2);
    stop();
    const first = feederBowls(save.current)[0];
    expect(feederBowls(save.current)).toHaveLength(1);
    expect(events).toContainEqual({ type: "feeder", bowls: [first?.id] });
    expect(save.current.home.items.filter((i) => i.kind === "bowl" && i.food > 0)).toHaveLength(1);
  });

  it("автогодівниця сипле стерилізованим котам корм для стерилізованих, поки він є (§8.7, §9.8)", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.sterilized = true;
    save.current.home.supplies.catFood = { cheap: 10, premium: 0 };
    save.current.home.supplies.sterileFood = { cheap: 1, premium: 0 };
    save.current.home.appliances.feeder = "cheap";
    const bowl = feederBowls(save.current)[0];
    if (!bowl) throw new Error("немає миски");
    bowl.food = 0;
    tickHousehold(save.current, 7 * 60 + 59, 2);
    expect(bowl.sterile).toBe(true);
    bowl.food = 0;
    tickHousehold(save.current, 18 * 60 + 59, 2);
    expect(bowl.sterile).toBe(false);
  });

  it("дешева річ може зламатися від використання, дорога — ні", () => {
    const save = game();
    const bowl = save.current.home.items.find((i) => i.kind === "bowl");
    if (!bowl) throw new Error("немає миски");
    wearOut(save.current, { ...bowl, quality: "premium" }, always());
    expect(save.current.home.items).toContain(bowl);
    wearOut(save.current, bowl, always());
    expect(save.current.home.items).not.toContain(bowl);
    // На місці зламаної речі — уламки.
    expect(save.current.home.messes.some((m) => m.kind === "broken")).toBe(true);
  });
});

describe("безлад дратує (§9.12, правка 2026-10-23)", () => {
  const annoyed = (count: number, at: { x: number; y: number }): number => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    const state = save.current;
    state.day = 8;
    state.character.body.x = 9.5;
    state.character.body.y = 8.5;
    for (let i = 0; i < count; i++) state.home.messes.push({ id: 100 + i, kind: "vomit", x: at.x + i * 0.5, y: at.y, cat: null });
    const before = state.character.stats.sanity;
    annoyingMesses(state, 60);
    return state.character.stats.sanity - before;
  };

  it("кожен безлад у полі зору — −1 за годину, разом не більше −4", () => {
    expect(annoyed(1, { x: 4.5, y: 8.5 })).toBeCloseTo(-1);
    expect(annoyed(3, { x: 4.5, y: 8.5 })).toBeCloseTo(-3);
    expect(annoyed(6, { x: 3.5, y: 8.5 })).toBeCloseTo(-4);
  });

  it("безлад в іншій кімнаті не дратує", () => {
    expect(annoyed(2, { x: 15.5, y: 2.5 })).toBe(0);
  });
});

describe("друг досипає миски (§4.1, правка 2026-10-24)", () => {
  function friendVisit(save: Save): void {
    save.current.modifiers.day = "friend-help";
    tickModifiers(save.current, hours(10) + 59, 2, false);
  }

  it("порожню миску — доверху зі сховища, без дарової порції; надкушену — досипає", () => {
    const save = game();
    const supplies = save.current.home.supplies.catFood;
    Object.assign(supplies, { cheap: 5, premium: 0 });
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
    Object.assign(bowl, { food: 0, foodQuality: null, sterile: false });
    friendVisit(save);
    expect(bowl.food).toBe(2);
    expect(supplies.cheap).toBe(3);
    bowl.food = 1;
    friendVisit(save);
    expect(bowl.food).toBe(2);
    expect(supplies.cheap).toBe(2);
  });

  it("корми не змішує: дорогого немає — миску з дорогим не досипає", () => {
    const save = game();
    const supplies = save.current.home.supplies.catFood;
    Object.assign(supplies, { cheap: 5, premium: 0 });
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
    Object.assign(bowl, { food: 1, foodQuality: "premium", sterile: false });
    friendVisit(save);
    expect(bowl.food).toBe(1);
    expect(supplies.cheap).toBe(5);
  });
});
