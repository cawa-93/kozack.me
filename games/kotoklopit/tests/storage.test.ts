// Сховища запасів (§6.4): кожен запас у своєму сховищі, вміст видно зблизька, потрібний нуль — завжди,
// витрата виринає над персонажем.

import { describe, expect, it } from "vitest";

import { onEvent, type GameEvent } from "../src/sim/events";
import { interact, newGame } from "../src/sim/game";
import { isPresent, isSolid, objectById } from "../src/sim/home";
import { targetById } from "../src/sim/targets";
import { addSupply } from "../src/sim/economy";
import { giveStarterPack } from "../src/sim/night";
import { STORAGES, storageIndicator } from "../src/sim/storage";
import type { Product, Save } from "../src/sim/types";
import { walkTo } from "./helpers";

const ALL: Product[] = ["food", "hygiene", "catFood", "sterileFood", "litter", "pills", "drops", "humanMeds", "treats", "collar", "bell", "shampoo", "detergent"];

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 3 });
const storage = (object: string) => STORAGES.find((s) => s.object === object)!;

describe("сховища (§6.4)", () => {
  it("кожен запас лежить рівно в одному сховищі, яке є в квартирі", () => {
    for (const product of ALL) expect(STORAGES.filter((s) => s.products.includes(product))).toHaveLength(1);
    for (const s of STORAGES) expect(objectById(s.object)).toBeDefined();
  });

  it("запаси, які треба дістати, мають власне сховище", () => {
    for (const product of ["food", "catFood", "sterileFood", "litter"] as const) {
      expect(STORAGES.find((s) => s.products.includes(product))!.products).toEqual([product]);
    }
  });

  it("видно лише придбане: здалеку — нуль, зблизька — увесь вміст", () => {
    const save = game();
    const state = save.current;
    expect(storageIndicator(state, storage("fridge"))).toEqual([]);
    state.home.supplies.food = { cheap: 0, premium: 0 };
    expect(storageIndicator(state, storage("fridge"))).toEqual([{ product: "food", count: 0 }]);
    // Корму ще не купували — шафка мовчить і з нулем.
    expect(storageIndicator(state, storage("cat-cabinet"))).toEqual([]);
    giveStarterPack(state);
    state.home.supplies.catFood = { cheap: 0, premium: 0 };
    expect(storageIndicator(state, storage("cat-cabinet"))).toEqual([{ product: "catFood", count: 0 }]);
    walkTo(save, "shower");
    // Шампуню не купували: зблизька видно лише засоби гігієни.
    expect(storageIndicator(state, storage("shower"))).toEqual([{ product: "hygiene", count: 3 }]);
  });

  it("окреме сховище з'являється в квартирі з першим запасом", () => {
    const state = game().current;
    const kit = objectById("cat-kit");
    expect(isPresent(state, kit)).toBe(false);
    expect(isSolid(state, kit.x, kit.y)).toBe(false);
    expect(targetById(state, "cat-kit")).toBeNull();
    addSupply(state, "treats", "cheap", 20);
    expect(isPresent(state, kit)).toBe(true);
    expect(isSolid(state, kit.x, kit.y)).toBe(true);
    expect(isPresent(state, objectById("fridge"))).toBe(true);
  });

  it("узята порція виринає над персонажем із залишком", () => {
    const save = game();
    save.current.home.supplies.food = { cheap: 3, premium: 0 };
    const events: GameEvent[] = [];
    const off = onEvent((e) => events.push(e));
    walkTo(save, "fridge");
    interact(save);
    off();
    expect(events).toContainEqual({ type: "supply-used", product: "food", left: 2 });
  });

  it("корм для стерилізованих — у баку, і повертають його туди ж", () => {
    const save = game();
    const supplies = save.current.home.supplies;
    addSupply(save.current, "catFood", "cheap", 2);
    addSupply(save.current, "sterileFood", "cheap", 1);
    walkTo(save, "sterile-bin");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "catfood", quality: "cheap", sterile: true });
    walkTo(save, "cat-cabinet");
    interact(save);
    // У шафку корм для стерилізованих не кладуть.
    expect(save.current.character.held).toEqual({ kind: "catfood", quality: "cheap", sterile: true });
    walkTo(save, "sterile-bin");
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(supplies.sterileFood.cheap).toBe(1);
  });
});
