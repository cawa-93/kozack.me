// Крадіжки голодного кота без корму (`TRAITS.md`, «Голодний кіт без корму»; `HUNGRY_THEFT`): як часто кіт береться красти страву
// зі столу, коли миски порожні, — за рівнем «Злодійства» й голодом; і другий кидок шансу після прохання біля персонажа.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide } from "../src/sim/catai";
import { HUNGRY_THEFT, NEED_THRESHOLD } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

/** Голодний, але ще не голодує. */
const HUNGRY = HUNGRY_THEFT.starving - 15;
const STARVING = HUNGRY_THEFT.starving;

/** Ранок, персонаж удома й нічим не зайнятий, миски порожні. */
function game(seed: number): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(8);
  for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
  return save;
}

function withCat(save: Save, thief: TraitLevel | 0): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 15.5, y: 3.5 } });
  cat.traits = thief === 0 ? [] : [{ group: "thief", level: thief, seen: 0, known: false }];
  cat.arrivedDay = -10;
  cat.love = 60;
  cat.act = idleAct(1);
  addCat(save.current, cat);
  return cat;
}

/** Крок часу: кіт лишається голодним, персонаж — у нормі, а на столі знову лежить страва. */
function step(save: Save, cat: Cat, hunger: number, dt: number): void {
  const state = save.current;
  cat.needs = { hunger, thirst: 0, toilet: 0, fatigue: 0, attention: 10, play: 0 };
  cat.health = 100;
  const stats = state.character.stats as Record<string, number>;
  for (const key of Object.keys(stats)) stats[key] = 80;
  state.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
  advance(save, dt);
}

const SEEDS = 10;
const HOURS = 8;

/** Скільки разів на годину кіт береться красти страву зі столу. */
function theftsPerHour(thief: TraitLevel | 0, hunger: number): number {
  let thefts = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const save = game(seed);
    const cat = withCat(save, thief);
    let last: unknown = null;
    for (let t = 0; t < HOURS * 60; t += 1 / 15) {
      step(save, cat, hunger, 1 / 15);
      if (cat.act.kind === "steal" && cat.act !== last) thefts += 1;
      last = cat.act;
    }
  }
  return thefts / (SEEDS * HOURS);
}

describe("крадіжки голодного кота без корму (`HUNGRY_THEFT`)", () => {
  it("поріг голоду для тесту — справді голодний кіт", () => {
    expect(HUNGRY).toBeGreaterThanOrEqual(NEED_THRESHOLD.hunger);
  });

  it("частота за рівнем «Злодійства»: злодюжка — кілька разів на годину, голодуючий кіт без риси — раз на годину-дві, «Шляхетний» — ніколи", () => {
    const thief2 = theftsPerHour(2, HUNGRY);
    const thief1 = theftsPerHour(1, HUNGRY);
    const plain = theftsPerHour(0, STARVING);
    const honest = theftsPerHour(-1, STARVING);
    const rates = `+2: ${thief2}, +1: ${thief1}, без риси: ${plain}, −1: ${honest}`;
    // Із запасом довкола очікуваних 4,3 / 1,0–1,35 / 0,73 / 0,42 на годину.
    expect(thief2, rates).toBeGreaterThan(2.8);
    expect(thief2, rates).toBeLessThan(6.5);
    expect(thief1, rates).toBeGreaterThan(0.7);
    expect(thief1, rates).toBeLessThan(2);
    expect(plain, rates).toBeGreaterThan(0.45);
    expect(plain, rates).toBeLessThan(1.2);
    expect(honest, rates).toBeGreaterThan(0.25);
    expect(honest, rates).toBeLessThan(0.7);
    expect(thief2).toBeGreaterThan(thief1 * 2);
    expect(thief1).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(honest);
    expect(theftsPerHour(-2, STARVING)).toBe(0);
    // Голодний, але ще не голодує, без «Злодійства» не краде.
    expect(theftsPerHour(0, HUNGRY)).toBe(0);
  }, 60_000);

  it("голодуючий злодюжка краде не щоразу: шанс не більший за `HUNGRY_THEFT.max`", () => {
    expect(HUNGRY_THEFT.max).toBeLessThan(1);
    const save = game(3);
    const cat = withCat(save, 2);
    step(save, cat, STARVING, 0);
    let stole = 0;
    const tries = 400;
    for (let seed = 0; seed < tries; seed++) {
      cat.act = idleAct(1);
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "steal") stole += 1;
    }
    expect(stole).toBeLessThan(tries);
    expect(stole / tries).toBeGreaterThan(HUNGRY_THEFT.max - 0.08);
    expect(stole / tries).toBeLessThan(HUNGRY_THEFT.max + 0.08);
  });

  /** Кіт пішов просити їсти до персонажа: що він робить, коли похід закінчився. */
  function afterAsking(thief: TraitLevel | 0, hunger: number, seed: number): string {
    const save = game(seed);
    const cat = withCat(save, thief);
    step(save, cat, hunger, 0);
    for (let s = 0; s < 200 && cat.act.kind !== "attention"; s++) {
      cat.act = idleAct(1);
      decide(save.current, cat, createRng(s), { present: true });
    }
    expect(cat.act.kind).toBe("attention");
    expect(cat.act.forFood).toBe(true);
    for (let t = 0; t < 60 && cat.act.kind === "attention"; t += 1 / 15) step(save, cat, hunger, 1 / 15);
    return cat.act.kind;
  }

  it("не допросившись біля персонажа, кіт ще раз кидає шанс крадіжки; «Шляхетний» і кіт без риси, що не голодує, ідуть до миски", () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const thief = seeds.map((seed) => afterAsking(2, HUNGRY, seed));
    expect(thief.filter((kind) => kind === "steal").length).toBeGreaterThanOrEqual(4);
    expect(thief.filter((kind) => kind === "beg").length).toBeGreaterThanOrEqual(1);
    for (const seed of seeds) {
      expect(afterAsking(-2, STARVING, seed), `«Шляхетний», seed ${seed}`).toBe("beg");
      expect(afterAsking(0, HUNGRY, seed), `без риси, seed ${seed}`).toBe("beg");
    }
  });
});
