// Сховища запасів (§6.4): кожен запас у своєму сховищі, вміст видно зблизька, потрібний нуль — завжди,
// витрата виринає над персонажем.

import { describe, expect, it } from "vitest";

import { onEvent, type GameEvent } from "../src/sim/events";
import { interact, newGame } from "../src/sim/game";
import { isPresent, isSolid, objectById } from "../src/sim/home";
import { targetById } from "../src/sim/targets";
import { addSupply, fitsStorage, order } from "../src/sim/economy";
import { giveStarterPack } from "../src/sim/night";
import { STORAGES, storageIndicator } from "../src/sim/storage";
import { targetOf } from "../src/sim/targets";
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

  it("видно лише придбане й лише в фокусі; поза фокусом — нічого, навіть нулів", () => {
    const save = game();
    const state = save.current;
    state.home.supplies.food = { cheap: 0, premium: 0 };
    expect(storageIndicator(state, storage("fridge"))).toEqual([]);
    walkTo(save, "fridge");
    expect(storageIndicator(state, storage("fridge"))).toEqual([{ product: "food", count: 0, limit: 40 }]);
    walkTo(save, "shower");
    // Шампуню не купували: у фокусі видно лише засоби гігієни.
    expect(storageIndicator(state, storage("shower"))).toEqual([{ product: "hygiene", count: 3, limit: 30 }]);
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

  it("ліміт сховища: зайве не замовити й не купити, стартовий пакет — скільки влізе", () => {
    const save = game();
    const state = save.current;
    state.character.money = 10_000;
    // 6 порцій є; дві упаковки по 21 уже не влізуть у холодильник на 40.
    expect(order(state, "food", "cheap")).not.toBeNull();
    expect(fitsStorage(state, "food", "cheap")).toBe(false);
    expect(order(state, "food", "cheap")).toBeNull();
    // Корм: 110 у шафці, пакет притулку додає лише до ліміту.
    addSupply(state, "catFood", "cheap", 108);
    giveStarterPack(state);
    expect(state.home.supplies.catFood.cheap).toBe(110);
  });

  it("на старті котячих речей немає; кошеня з притулку приносить найпростіші", () => {
    const state = game().current;
    expect(state.home.items).toEqual([]);
    giveStarterPack(state);
    expect(state.home.items.map((i) => i.kind).sort()).toEqual(["bowl", "litter", "water"]);
    // Другий пакет нових речей не додає: вони вже є.
    giveStarterPack(state);
    expect(state.home.items).toHaveLength(3);
  });

  it("вміст видно лише тоді, коли сховище в фокусі; з душової кабіни — нічого", () => {
    const save = game();
    const state = save.current;
    walkTo(save, "shower");
    expect(storageIndicator(state, storage("shower"))).toHaveLength(1);
    // Поруч, але повернутий до іншої речі — вмісту не видно.
    state.character.body.facing = { x: 1, y: 0 };
    if (targetOf(state)?.id !== "shower") expect(storageIndicator(state, storage("shower"))).toEqual([]);
    state.character.body.facing = { x: -1, y: 0 };
    walkTo(save, "shower");
    interact(save);
    state.home.supplies.hygiene = { cheap: 0, premium: 0 };
    expect(storageIndicator(state, storage("shower"))).toEqual([]);
  });
});
