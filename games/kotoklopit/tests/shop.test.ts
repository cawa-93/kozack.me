// Універсальний магазин (§6.4): один каталог, кошик із кількістю, оплата цілком або ніяк.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { canCheckout, cartTotal, checkout, GOODS, room, unitPrice, type CartLine } from "../src/sim/shop";
import type { Save } from "../src/sim/types";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 4 });
const line = (goods: CartLine["goods"], quality: CartLine["quality"], count: number): CartLine => ({ goods, quality, count });

describe("універсальний магазин (§6.4)", () => {
  it("у каталозі — і запаси, і речі", () => {
    expect(GOODS.some((g) => "product" in g && g.product === "food")).toBe(true);
    expect(GOODS.some((g) => "thing" in g && g.thing === "bowl")).toBe(true);
  });

  it("місце рахується разом з усім кошиком: дешеве й дороге ділять сховище", () => {
    const state = game().current;
    // 6 порцій удома, ліміт 40, упаковка 21: одна влазить.
    expect(room(state, [], { product: "food" }, "cheap")).toBe(1);
    const cart = [line({ product: "food" }, "premium", 1)];
    expect(room(state, cart, { product: "food" }, "cheap")).toBe(0);
    // Миски: скільки вільних місць.
    expect(room(state, [], { thing: "bowl" }, "cheap")).toBeGreaterThan(1);
    expect(room(state, [line({ thing: "carrier" }, "premium", 1)], { thing: "carrier" }, "cheap")).toBe(0);
  });

  it("доставка: кошик оплачується цілком, кожна штука — окремий пакунок", () => {
    const state = game().current;
    state.character.money = 1000;
    const cart = [line({ product: "food" }, "cheap", 1), line({ thing: "bowl" }, "cheap", 2)];
    const total = cartTotal(state, cart, "delivery");
    expect(total).toBe(unitPrice(state, { product: "food" }, "cheap", "delivery") + 2 * unitPrice(state, { thing: "bowl" }, "cheap", "delivery"));
    expect(checkout(state, cart, "delivery")).toBe(true);
    expect(state.character.money).toBe(1000 - total);
    expect(state.home.deliveries).toHaveLength(3);
  });

  it("не вистачає грошей чи місця — нічого не купується", () => {
    const state = game().current;
    state.character.money = 10;
    expect(canCheckout(state, [line({ thing: "bowl" }, "cheap", 1)], "delivery")).toBe(false);
    state.character.money = 1000;
    expect(checkout(state, [line({ product: "food" }, "cheap", 2)], "delivery")).toBe(false);
    expect(state.home.deliveries).toHaveLength(0);
    expect(state.character.money).toBe(1000);
  });

  it("на місці — лише в поїздці до магазину, і все одразу вдома", () => {
    const state = game().current;
    state.character.money = 1000;
    const cart = [line({ thing: "toy" }, "cheap", 2)];
    expect(checkout(state, cart, "store")).toBe(false);
    state.trip = { destination: "shop", seed: 1 } as Save["current"]["trip"];
    expect(checkout(state, cart, "store")).toBe(true);
    expect(state.home.items.filter((i) => i.kind === "toy")).toHaveLength(2);
  });
});

describe("назви варіантів (§6.4)", () => {
  it("кожен товар має дві назви без «дешевий» і «дорогий»", async () => {
    const { VARIANT_TITLES } = await import("../src/ui/titles");
    const { goodsKey } = await import("../src/sim/shop");
    for (const g of GOODS) {
      const names = VARIANT_TITLES[goodsKey(g)];
      expect(names, goodsKey(g)).toBeDefined();
      for (const name of Object.values(names ?? {})) expect(name).not.toMatch(/дешев|дорог/i);
    }
  });
});
