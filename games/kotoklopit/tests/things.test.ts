// Речі для котів (§6.4, §9.12): купівля доставкою, місця, внесок у комунальні, викинути річ;
// будиночки й кігтеточки, подертий диван.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { discard, freeSlots, orderThing, payUtilities, receivePackages, utilitiesDue } from "../src/sim/economy";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";
import { withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 3 }));
  save.current.character.money = 2000;
  return save;
}

/** Замовити й одразу забрати пакунок. */
function buy(save: Save, ...args: Parameters<typeof orderThing> extends [unknown, ...infer R] ? R : never): void {
  const delivery = orderThing(save.current, ...args);
  expect(delivery).not.toBeNull();
  save.current.home.porch.push(...save.current.home.deliveries.splice(0));
  receivePackages(save.current);
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 9.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

describe("купівля речей (§6.4)", () => {
  it("на старті комунальні — 40", () => {
    expect(utilitiesDue(game().current)).toBe(40);
  });

  it("лоток привозять доставкою на вільне місце, і комунальні зростають на 4", () => {
    const save = game();
    expect(freeSlots(save.current, "litter")).toBe(5);
    buy(save, "litter", "cheap");
    // Лоток 25, доставка — 10% бази (2,5 → 3) і надбавка 10 (§6.4).
    expect(save.current.character.money).toBe(2000 - 38);
    const boxes = save.current.home.items.filter((i) => i.kind === "litter");
    expect(boxes.map((b) => ("slot" in b ? b.slot : ""))).toEqual(["litter-1", "litter-2"]);
    expect(freeSlots(save.current, "litter")).toBe(4);
    expect(utilitiesDue(save.current)).toBe(44);
  });

  it("замовлена річ уже займає місце, а без вільних місць замовити не можна", () => {
    const save = game();
    for (let i = 0; i < 2; i++) expect(orderThing(save.current, "house", "cheap")).not.toBeNull();
    expect(freeSlots(save.current, "house")).toBe(1);
    expect(orderThing(save.current, "house", "premium")).not.toBeNull();
    expect(orderThing(save.current, "house", "cheap")).toBeNull();
  });

  it("іграшка лягає на підлогу біля дверей і комунальних не додає", () => {
    const save = game();
    buy(save, "toy", "premium");
    const toys = save.current.home.items.filter((i) => i.kind === "toy");
    expect(toys).toHaveLength(2);
    expect(utilitiesDue(save.current)).toBe(40);
  });

  it("викинута річ зменшує комунальні", () => {
    const save = game();
    buy(save, "scratcher", "cheap");
    expect(utilitiesDue(save.current)).toBe(46);
    const post = save.current.home.items.find((i) => i.kind === "scratcher");
    expect(post && discard(save.current, post.id)).toBe(true);
    expect(utilitiesDue(save.current)).toBe(40);
  });
});

describe("кігтеточка й диван (§9.12)", () => {
  it("без кігтеточки кіт дере диван, і ремонт іде в комунальні", () => {
    const save = game();
    const cat = withCat(save);
    let scratched = 0;
    for (let seed = 0; seed < 200 && scratched === 0; seed++) {
      cat.needs.play = 100;
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "scratch") {
        expect(cat.act.target).toBe("sofa");
        scratched += 1;
      }
    }
    expect(scratched).toBe(1);
    for (let i = 0; i < 30 && cat.act.kind === "scratch"; i++) tickCats(save.current, 1, { present: false });
    expect(save.current.home.repairs).toBe(3);
    expect(utilitiesDue(save.current)).toBe(43);
    payUtilities(save.current);
    expect(save.current.home.repairs).toBe(0);
  });

  it("дорогу кігтеточку кіт обирає частіше за диван", () => {
    const save = game();
    buy(save, "scratcher", "premium");
    const cat = withCat(save);
    const targets = { post: 0, sofa: 0 };
    for (let seed = 0; seed < 600; seed++) {
      cat.needs.play = 100;
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "scratch") targets[cat.act.target === "sofa" ? "sofa" : "post"] += 1;
    }
    expect(targets.post).toBeGreaterThan(targets.sofa * 4);
  });
});

describe("будиночок (§9.12)", () => {
  it("кіт спить у будиночку", () => {
    const save = game();
    buy(save, "house", "premium");
    const house = save.current.home.items.find((i) => i.kind === "house");
    const cat = withCat(save);
    let inHouse = 0;
    for (let seed = 0; seed < 100; seed++) {
      cat.needs.fatigue = 100;
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "sleep" && cat.act.target === `item:${house?.id}`) inHouse += 1;
    }
    expect(inHouse).toBeGreaterThan(10);
  });
});
