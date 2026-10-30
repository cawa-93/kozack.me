// Універсальний магазин (§6.4): один каталог, кошик із кількістю, оплата цілком або ніяк.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { SHOP_WINDOW } from "../src/sim/config";
import { shopModifier } from "../src/sim/destinations";
import { addSupply, deliveryCost, freeSlots, receivePackages, tickDeliveries } from "../src/sim/economy";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { canCheckout, cartDelivery, cartTotal, checkout, fitCart, GOODS, goodsKey, offered, room, unavailable, unitPrice, variants, type CartLine } from "../src/sim/shop";
import type { Save } from "../src/sim/types";

const game = (): Save => newGame({ address: "she", difficulty: "normal", seed: 4 });
const line = (goods: CartLine["goods"], quality: CartLine["quality"], count: number): CartLine => ({ goods, quality, count });

describe("універсальний магазин (§6.4)", () => {
  it("у каталозі — і запаси, і речі", () => {
    expect(GOODS.some((g) => "product" in g && g.product === "food")).toBe(true);
    expect(GOODS.some((g) => "thing" in g && g.thing === "bowl")).toBe(true);
  });

  it("запасів — скільки завгодно, крім того, що лежить у ящиках; речей — не більше вільних місць", () => {
    const state = game().current;
    // Більше, ніж влазить у холодильник, — можна: зайве почекає в ящиках (правка 2026-10-23).
    expect(room(state, [line({ product: "food" }, "premium", 3)], { product: "food" }, "cheap")).toBe(Infinity);
    state.home.boxes = { food: { cheap: 5, premium: 0 } };
    expect(room(state, [], { product: "food" }, "cheap")).toBe(0);
    // Миски: скільки вільних місць.
    expect(room(state, [], { thing: "bowl" }, "cheap")).toBeGreaterThan(1);
    expect(room(state, [line({ thing: "carrier" }, "premium", 1)], { thing: "carrier" }, "cheap")).toBe(0);
  });

  it("нашийник — один варіант, без якостей; решта товарів — два (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17)", () => {
    const state = game().current;
    state.character.money = 1000;
    expect(variants({ product: "collar" })).toEqual(["cheap"]);
    expect(variants({ product: "food" })).toEqual(["cheap", "premium"]);
    expect(variants({ thing: "bowl" })).toEqual(["cheap", "premium"]);
    expect(room(state, [], { product: "collar" }, "premium")).toBe(0);
    expect(canCheckout(state, [line({ product: "collar" }, "premium", 1)], "delivery")).toBe(false);
    expect(room(state, [], { product: "collar" }, "cheap")).toBe(Infinity);
    expect(checkout(state, [line({ product: "collar" }, "cheap", 2)], "delivery")).toBe(true);
  });

  it("доставка: кошик оплачується цілком, кожна штука — окремий пакунок", () => {
    const state = game().current;
    state.character.money = 1000;
    const cart = [line({ product: "food" }, "cheap", 1), line({ thing: "bowl" }, "cheap", 2)];
    const total = cartTotal(state, cart, "delivery");
    // У каталозі — базові ціни, доставка — раз на весь кошик.
    const goods = unitPrice(state, { product: "food" }, "cheap", "delivery") + 2 * unitPrice(state, { thing: "bowl" }, "cheap", "delivery");
    expect(goods).toBe(40 + 2 * 10);
    expect(total).toBe(goods + deliveryCost(state, goods));
    expect(checkout(state, cart, "delivery")).toBe(true);
    expect(state.character.money).toBe(1000 - total);
    expect(state.home.deliveries).toHaveLength(3);
  });

  it("доставка в телефоні: порожній кошик — лише надбавка, у магазині доставки немає", () => {
    const state = game().current;
    expect(cartDelivery(state, [], "delivery")).toBe(10);
    expect(cartTotal(state, [], "delivery")).toBe(0);
    expect(cartDelivery(state, [line({ product: "food" }, "cheap", 1)], "store")).toBe(0);
  });

  it("ціни в магазині на 10% у бік знижок: середня — від −30% до +10%", () => {
    expect(SHOP_WINDOW.normal).toEqual({ min: -0.3, max: 0.1 });
    const state = game().current;
    state.trip = { destination: "shop", seed: 7 } as Save["current"]["trip"];
    for (const g of GOODS) {
      const mod = shopModifier(state, g);
      expect(mod).toBeGreaterThanOrEqual(-0.3);
      expect(mod).toBeLessThanOrEqual(0.1);
    }
  });

  it("чому товар не взяти: у ящиках, немає місця, уже є, уже їде", () => {
    const state = game().current;
    state.character.money = 10_000;
    expect(unavailable(state, { product: "food" })).toBeNull();
    state.home.boxes = { food: { cheap: 5, premium: 0 } };
    expect(unavailable(state, { product: "food" })).toBe("boxes");
    expect(unavailable(state, { thing: "carrier" })).toBeNull();
    checkout(state, [line({ thing: "carrier" }, "cheap", 1)], "delivery");
    expect(unavailable(state, { thing: "carrier" })).toBe("ordered");
    state.home.deliveries = [];
    state.home.carrier = "cheap";
    expect(unavailable(state, { thing: "carrier" })).toBe("owned");
    checkout(state, [line({ thing: "house" }, "cheap", 3)], "delivery");
    expect(unavailable(state, { thing: "house" })).toBe("no-room");
    expect(unavailable(state, { thing: "toy" })).toBeNull();
  });

  it("автогодівниця — і над миской з того самого кошика чи тією, що вже їде (§9.12, загальна ревізія 2026-10-29)", () => {
    const state = game().current;
    state.character.money = 10_000;
    const feeder = { thing: "feeder" } as const;
    const bowl = { thing: "bowl" } as const;
    expect(state.home.items.some((i) => i.kind === "bowl")).toBe(false);
    expect(room(state, [], feeder, "cheap")).toBe(0);
    expect(unavailable(state, feeder)).toBe("no-bowl");
    // Миска в кошику дає місце одній годівниці.
    const cart = [line(bowl, "cheap", 1), line(feeder, "premium", 1)];
    expect(room(state, cart, feeder, "premium")).toBe(1);
    expect(unavailable(state, feeder, cart)).toBeNull();
    expect(canCheckout(state, [line(bowl, "cheap", 1), line(feeder, "cheap", 2)], "delivery")).toBe(false);
    // Забрали миску з кошика — годівниця теж виходить.
    const fewer = [line(bowl, "cheap", 0), line(feeder, "cheap", 1)];
    fitCart(state, fewer);
    expect(fewer[1]?.count).toBe(0);
    // Одне замовлення доставкою: годівниця стає над новою миской.
    expect(checkout(state, cart, "delivery")).toBe(true);
    expect(freeSlots(state, "feeder")).toBe(0);
    for (const d of state.home.deliveries) d.at = 0;
    tickDeliveries(state);
    receivePackages(state);
    const placed = state.home.items.find((i) => i.kind === "bowl");
    expect(state.home.feeders?.map((f) => [f.slot, f.quality])).toEqual([[placed && "slot" in placed ? placed.slot : "", "premium"]]);
    // Миска, що вже їде, теж дає місце.
    checkout(state, [line(bowl, "cheap", 1)], "delivery");
    expect(freeSlots(state, "feeder")).toBe(1);
  });

  it("автогодівниця, що чекає миску, забирає собі миску з кошика: місця для ще однієї немає (§9.12)", () => {
    const state = game().current;
    state.character.money = 10_000;
    state.home.feeders = [{ slot: "bowl-1", quality: "cheap", food: 0, foodQuality: null, sterile: false }];
    expect(room(state, [line({ thing: "bowl" }, "cheap", 1)], { thing: "feeder" }, "cheap")).toBe(0);
    expect(room(state, [line({ thing: "bowl" }, "cheap", 2)], { thing: "feeder" }, "cheap")).toBe(1);
  });

  it("на місці годівниця з кошика стає над миской з цього ж кошика, хоч би в якому порядку рядки (§9.12)", () => {
    const state = game().current;
    state.character.money = 10_000;
    state.trip = { destination: "shop", seed: 1 } as Save["current"]["trip"];
    expect(checkout(state, [line({ thing: "feeder" }, "cheap", 1), line({ thing: "bowl" }, "premium", 1)], "store")).toBe(true);
    const placed = state.home.items.find((i) => i.kind === "bowl");
    expect(placed && "slot" in placed && state.home.feeders?.[0]?.slot === placed.slot).toBe(true);
  });

  it("не вистачає грошей чи місця — нічого не купується", () => {
    const state = game().current;
    state.character.money = 10;
    expect(canCheckout(state, [line({ thing: "bowl" }, "cheap", 1)], "delivery")).toBe(false);
    state.character.money = 1000;
    state.home.boxes = { food: { cheap: 5, premium: 0 } };
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
    // Кілька упаковок одного запасу — усі в ящики біля входу (§6.4).
    expect(checkout(state, [line({ product: "food" }, "cheap", 2)], "store")).toBe(true);
    expect(state.home.boxes?.food?.cheap).toBe(40);
  });
});

describe("магазин відкривається поступово (§11.3а)", () => {
  const shown = (state: Save["current"]): string[] => GOODS.filter((g) => offered(state, g)).map(goodsKey).sort();

  it("до першого кота — лише запаси для себе; з першим котом — котячі запаси й речі, і вже назавжди (рішення автора 2026-10-29, дрібні питання)", () => {
    const state = game().current;
    expect(shown(state)).toEqual(["detergent", "food", "humanMeds", "hygiene"]);
    addCat(state, createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 5.5, y: 8.5 } }));
    const withCat = shown(state);
    for (const key of ["catFood", "litter", "pills", "drops", "treats", "collar", "shampoo", "catnip", "thing:bowl", "thing:litter", "thing:carrier", "thing:lock", "thing:robot"]) {
      expect(withCat, key).toContain(key);
    }
    // Корм для стерилізованих — як і раніше, лише коли є для кого.
    expect(withCat).not.toContain("sterileFood");
    // Дзвіночка в магазині немає зовсім (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17).
    expect(GOODS.map(goodsKey)).not.toContain("bell");
    // Кота віддали — та в домі він уже бував: котяче з магазину не зникає.
    state.cats = [];
    expect(shown(state)).toEqual(withCat);
  });

  it("запас, що вже бував удома, лишається в магазині й до першого кота", () => {
    const state = game().current;
    addSupply(state, "catFood", "cheap", 1);
    expect(shown(state)).toContain("catFood");
    expect(shown(state)).not.toContain("thing:bowl");
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
