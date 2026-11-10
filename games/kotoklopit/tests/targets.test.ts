// Ціль дії (§10): з річчю в руках — лише те, з чим ця річ щось робить; кіт на речі котячого кутка — ціль замість неї.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { itemPoint } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import type { Cat, HomeItem, Item, Save } from "../src/sim/types";
import { interact, recordEvents, standAt, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 1 }));

const itemOf = (save: Save, kind: HomeItem["kind"]): HomeItem => {
  const item = save.current.home.items.find((i) => i.kind === kind);
  if (!item) throw new Error(`Немає «${kind}»`);
  return item;
};

/** Кіт просто в клітинці речі: так стоїть кіт, що їсть, п'є чи просить біля неї. */
const catOn = (save: Save, item: HomeItem): Cat => {
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 10, at: itemPoint(item) });
  addCat(save.current, cat);
  return cat;
};

describe("з річчю в руках — лише те, з чим вона щось робить (§10)", () => {
  it("кіт, що стоїть на мисці, не заступає її: корм насипано", () => {
    const save = game();
    const bowl = itemOf(save, "bowl");
    standAt(save, `item:${bowl.id}`);
    const cat = catOn(save, bowl);
    // Порожніми руками ціль — кіт; з кормом — миска.
    expect(targetOf(save.current)?.id).toBe(`cat:${cat.id}`);
    save.current.home.supplies.catFood.cheap = 5;
    save.current.character.held = { kind: "catfood", quality: "cheap", sterile: false };
    expect(targetOf(save.current)?.id).toBe(`item:${bowl.id}`);
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(bowl.kind === "bowl" && bowl.food).toBeGreaterThan(0);
  });

  const cases: { held: Item; yes: string[]; no: string[] }[] = [
    { held: { kind: "catfood", quality: "cheap", sterile: false }, yes: ["trash"], no: ["stove", "computer", "door", "shower"] },
    { held: { kind: "raw", quality: "cheap" }, yes: ["stove", "fridge", "table", "trash"], no: ["computer", "shower", "bed"] },
    { held: { kind: "meal", quality: "cheap" }, yes: ["stove", "table", "trash"], no: ["fridge", "computer"] },
    { held: { kind: "meal", quality: "cheap", mom: true }, yes: ["fridge"], no: ["computer"] },
    { held: { kind: "cat", cat: 99 }, yes: ["shower", "door"], no: ["stove", "computer", "bed"] },
    { held: { kind: "toy", toy: { id: 99, kind: "toy", quality: "cheap", x: 0, y: 0, uses: 0 } }, yes: ["trash"], no: ["computer", "stove"] },
    { held: { kind: "vacuum" }, yes: [], no: ["trash", "computer", "door"] },
  ];
  it.each(cases)("$held.kind: ціль — $yes, але не $no", ({ held, yes, no }) => {
    const save = game();
    for (const id of [...yes, ...no]) {
      standAt(save, id);
      save.current.character.held = structuredClone(held);
      expect(targetOf(save.current)?.id === id, `${held.kind} біля ${id}`).toBe(yes.includes(id));
    }
  });

  it("поруч жодної цілі для речі в руках — натискання біля найближчої каже, чому ні", () => {
    const save = game();
    standAt(save, "computer");
    save.current.character.held = { kind: "catfood", quality: "cheap", sterile: false };
    expect(targetOf(save.current)).toBeNull();
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused", object: "computer", reason: "hands-full" }));
    expect(save.current.character.held?.kind).toBe("catfood");
  });

  it("меблі, з якими річ нічого не робить, заступають: з котом у руках біля пральної машини кота опускають, а не купають", () => {
    const save = game();
    const cat = catOn(save, itemOf(save, "water"));
    standAt(save, "washer");
    save.current.home.supplies.shampoo.cheap = 1;
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(targetOf(save.current)).toBeNull();
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.character.activity).toBeNull();
  });

  it("кота в протистоянні торкаються й зі стравою в руках", () => {
    const save = game();
    const water = itemOf(save, "water");
    standAt(save, `item:${water.id}`);
    const cat = catOn(save, water);
    cat.act = { ...cat.act, kind: "standoff" };
    save.current.character.held = { kind: "meal", quality: "cheap" };
    expect(targetOf(save.current)?.id).toBe(`cat:${cat.id}`);
  });
});

describe("кіт на речі котячого кутка (§10)", () => {
  it("кіт на поїлці — ціль замість неї, а порожня поїлка — важливіша за кота", () => {
    const save = game();
    const water = itemOf(save, "water");
    standAt(save, `item:${water.id}`);
    const cat = catOn(save, water);
    expect(targetOf(save.current)?.id).toBe(`cat:${cat.id}`);
    interact(save);
    expect(save.current.character.held).toMatchObject({ kind: "cat", cat: cat.id });
    save.current.character.held = null;
    if (water.kind === "water") water.water = 0;
    expect(targetOf(save.current)?.id).toBe(`item:${water.id}`);
  });

  it("брудний лоток — важливіший за кота в ньому, чистий — ні", () => {
    const save = game();
    const litter = itemOf(save, "litter");
    standAt(save, `item:${litter.id}`);
    const cat = catOn(save, litter);
    expect(targetOf(save.current)?.id).toBe(`cat:${cat.id}`);
    if (litter.kind === "litter") litter.uses = 10;
    expect(targetOf(save.current)?.id).toBe(`item:${litter.id}`);
  });
});
