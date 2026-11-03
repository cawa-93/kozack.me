// Купити на місці (GAME_DESIGN §8.5, «Ліки у ветеринара й лікаря»; §6.4, «Бірка знижки й кошик унизу»; рішення автора
// 2026-11-03): у магазині — увесь каталог, у ветеринара — ліки для котів, у лікаря — ліки для себе, ціни — як у магазині;
// бірка «−X%» — на скільки сьогоднішня ціна нижча за звичайну.

import { describe, expect, it } from "vitest";

import { describe as describeEvent } from "../src/dev/journal";
import { createCat } from "../src/sim/cat";
import { MODIFIERS, PRODUCTS, SHOP_WINDOW, STORE_GOODS, TRIP_IDLE_MINUTES, TRIPS } from "../src/sim/config";
import { shopModifier, soldAt, vetExam } from "../src/sim/destinations";
import { onEvent, type GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { canCheckout, catalog, checkout, discount, GOODS, goodsKey, regularPrice, room, unitPrice, variants, type CartLine, type Goods } from "../src/sim/shop";
import { visitMinutes } from "../src/sim/trips";
import type { Destination, GameState } from "../src/sim/types";

const line = (goods: Goods, quality: CartLine["quality"], count: number): CartLine => ({ goods, quality, count });
const keys = (goods: readonly Goods[]): string[] => goods.map(goodsKey).sort();

/** Гра, де вже є кіт (тоді магазин показує й котяче, §11.3а), і персонаж на місці в пункті `destination`. */
function at(destination: Destination | null, seed = 5): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
  state.modifiers.day = null;
  state.character.money = 1000;
  const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  addCat(state, cat);
  if (destination !== null) {
    if (TRIPS[destination].cat) cat.away = "trip";
    state.trip = {
      destination,
      phase: "visit",
      cat: TRIPS[destination].cat ? cat.id : null,
      race: { road: 10, done: 10, minutes: 10, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 0, rng: 1 },
      losses: [],
      visit: TRIPS[destination].service ? 0 : TRIPS[destination].visit,
      seed,
    };
  }
  return state;
}

describe("що де продається (§8.5, STORE_GOODS)", () => {
  const pills = { product: "pills" } as const;
  const drops = { product: "drops" } as const;
  const humanMeds = { product: "humanMeds" } as const;

  it("магазин — усе; ветеринар — таблетки й краплі для котів; лікар — ліки для себе; деінде — нічого", () => {
    expect(STORE_GOODS).toEqual({ shop: "all", vet: ["pills", "drops"], doctor: ["humanMeds"] });
    for (const g of GOODS) expect(soldAt("shop", g), goodsKey(g)).toBe(true);
    expect(keys(GOODS.filter((g) => soldAt("vet", g)))).toEqual(["drops", "pills"]);
    expect(keys(GOODS.filter((g) => soldAt("doctor", g)))).toEqual(["humanMeds"]);
    for (const d of ["shelter", "breeder", "groomer", "show", "office"] as const) expect(GOODS.some((g) => soldAt(d, g)), d).toBe(false);
  });

  it("каталог на місці — лише те, що тут продають; у телефоні — увесь; обидва варіанти якості", () => {
    expect(keys(catalog(at("vet"), "store"))).toEqual(["drops", "pills"]);
    expect(keys(catalog(at("doctor"), "store"))).toEqual(["humanMeds"]);
    expect(catalog(at("shelter"), "store")).toEqual([]);
    expect(catalog(at("vet"), "delivery").length).toBe(catalog(at("shop"), "store").length);
    for (const g of [pills, drops, humanMeds]) expect(variants(g)).toEqual(["cheap", "premium"]);
  });

  it("ціна ліків у ветеринара й лікаря — як у магазині: той самий модифікатор поїздки з вікна складності", () => {
    for (const seed of [1, 5, 77, 1234]) {
      for (const [destination, goods] of [["vet", pills], ["vet", drops], ["doctor", humanMeds]] as const) {
        const here = at(destination, seed);
        const shop = at("shop", seed);
        expect(shopModifier(here, goods)).toBe(shopModifier(shop, goods));
        const mod = shopModifier(here, goods);
        expect(mod).toBeGreaterThanOrEqual(SHOP_WINDOW.normal.min);
        expect(mod).toBeLessThanOrEqual(SHOP_WINDOW.normal.max);
        for (const q of variants(goods)) {
          expect(unitPrice(here, goods, q, "store"), `${destination} ${goodsKey(goods)} ${q}`).toBe(Math.round(PRODUCTS[goods.product].price[q] * (1 + mod)));
          expect(unitPrice(here, goods, q, "store")).toBe(unitPrice(shop, goods, q, "store"));
        }
      }
    }
  });

  it("кошик можна оплатити лише тим, що тут продають (canCheckout для кожного пункту)", () => {
    const cart = (goods: Goods): CartLine[] => [line(goods, "cheap", 1)];
    expect(canCheckout(at("shop"), cart({ product: "catFood" }), "store")).toBe(true);
    expect(canCheckout(at("shop"), cart({ thing: "bowl" }), "store")).toBe(true);
    expect(canCheckout(at("vet"), cart(pills), "store")).toBe(true);
    expect(canCheckout(at("vet"), cart(drops), "store")).toBe(true);
    expect(canCheckout(at("vet"), cart(humanMeds), "store")).toBe(false);
    expect(canCheckout(at("vet"), cart({ product: "catFood" }), "store")).toBe(false);
    expect(canCheckout(at("vet"), [line(pills, "cheap", 1), line({ thing: "toy" }, "cheap", 1)], "store")).toBe(false);
    expect(canCheckout(at("doctor"), cart(humanMeds), "store")).toBe(true);
    expect(canCheckout(at("doctor"), cart(pills), "store")).toBe(false);
    for (const d of ["shelter", "breeder", "groomer", "show", "office"] as const) expect(canCheckout(at(d), cart(humanMeds), "store"), d).toBe(false);
    expect(canCheckout(at(null), cart(humanMeds), "store")).toBe(false);
    // Порожній кошик — нічого оплачувати.
    expect(canCheckout(at("vet"), [line(pills, "cheap", 0)], "store")).toBe(false);
  });

  it("у ветеринара: куплене — у ящики біля входу, гроші — за ціною дня; запас у ящиках не купити (як у магазині)", () => {
    const state = at("vet");
    const cart = [line(pills, "cheap", 1), line(drops, "premium", 2)];
    const total = unitPrice(state, pills, "cheap", "store") + 2 * unitPrice(state, drops, "premium", "store");
    expect(checkout(state, cart, "store")).toBe(true);
    expect(state.character.money).toBe(1000 - total);
    expect(state.home.boxes?.pills?.cheap).toBe(PRODUCTS.pills.units.cheap);
    expect(state.home.boxes?.drops?.premium).toBe(2 * PRODUCTS.drops.units.premium);
    // Таблетки вже в ящиках: ще раз не купити — ні тут, ні в магазині.
    expect(room(state, [], pills, "premium")).toBe(0);
    expect(canCheckout(state, [line(pills, "premium", 1)], "store")).toBe(false);
  });

  it("подія «куплено» каже, де купили, — журнал розробки пише пункт, а не «в магазині» (рецензія 2026-11-03)", () => {
    const events: GameEvent[] = [];
    const off = onEvent((e) => void events.push(e));
    try {
      for (const d of ["shop", "vet", "doctor"] as const) {
        const state = at(d);
        const goods = d === "doctor" ? humanMeds : pills;
        expect(checkout(state, [line(goods, "cheap", 1)], "store"), d).toBe(true);
        const bought = events.filter((e) => e.type === "bought").at(-1);
        expect(bought, d).toEqual({ type: "bought", goods: goodsKey(goods), quality: "cheap", destination: d });
        expect(bought && describeEvent(bought, state), d).toBe(`Куплено (${d}): ${goodsKey(goods)} (cheap)`);
      }
    } finally {
      off();
    }
  });

  it("у лікаря: ліки для себе й здоровому — у ящики; грошей не вистачає — нічого", () => {
    const state = at("doctor");
    expect(state.character.illnesses).toEqual([]);
    state.character.money = 10;
    expect(checkout(state, [line(humanMeds, "premium", 1)], "store")).toBe(false);
    expect(state.home.boxes?.humanMeds).toBeUndefined();
    state.character.money = 1000;
    expect(checkout(state, [line(humanMeds, "premium", 1)], "store")).toBe(true);
    expect(state.home.boxes?.humanMeds?.premium).toBe(PRODUCTS.humanMeds.units.premium);
  });

  it("покупка ліків часу не додає (рішення виконавця): лише ліки — 15 хвилин, з оглядом — година огляду", () => {
    const vet = at("vet");
    expect(checkout(vet, [line(pills, "cheap", 1)], "store")).toBe(true);
    expect(vet.trip?.visit).toBe(0);
    expect(visitMinutes(vet.trip!)).toBe(TRIP_IDLE_MINUTES);
    expect(vetExam(vet)).not.toBeNull();
    expect(checkout(vet, [line(drops, "cheap", 1)], "store")).toBe(true);
    expect(visitMinutes(vet.trip!)).toBe(TRIPS.vet.visit);

    const doctor = at("doctor");
    expect(checkout(doctor, [line(humanMeds, "cheap", 1)], "store")).toBe(true);
    expect(visitMinutes(doctor.trip!)).toBe(TRIP_IDLE_MINUTES);
    // У магазині час на місці — самі покупки, як і раніше.
    const shop = at("shop");
    expect(checkout(shop, [line(humanMeds, "cheap", 1)], "store")).toBe(true);
    expect(visitMinutes(shop.trip!)).toBe(TRIPS.shop.visit);
  });
});

describe("бірка знижки «−X%» (§6.4; правило — рішення виконавця)", () => {
  /** Сьогоднішня ціна хоч одного варіанта, округлена до гривні, нижча за звичайну. */
  const cheaper = (state: GameState, g: Goods): boolean => variants(g).some((q) => unitPrice(state, g, q, "store") < regularPrice(g, q));

  it("на місці: знижка — на скільки ціна нижча за звичайну; подорожчання й «без змін» — без бірки", () => {
    let discounted = 0;
    let raised = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = at("shop", seed);
      for (const g of catalog(state, "store")) {
        const mod = shopModifier(state, g);
        const x = discount(state, g, "store");
        if (mod > 0) {
          expect(x, `${seed} ${goodsKey(g)}`).toBe(0);
          raised += 1;
        } else if (cheaper(state, g) && Math.round(-mod * 100) >= 1) {
          expect(x, `${seed} ${goodsKey(g)}`).toBe(Math.round(-mod * 100));
          discounted += 1;
        } else expect(x, `${seed} ${goodsKey(g)}`).toBe(0);
      }
    }
    // На середній вікно −30%…+10%: знижок більше, ніж подорожчань, але є й ті, й ті.
    expect(discounted).toBeGreaterThan(raised);
    expect(raised).toBeGreaterThan(0);
  });

  it("знижка, якої на ціні не видно (ціна, округлена до гривні, та сама), — без бірки", () => {
    const litter = { product: "litter" } as const;
    // Шукаємо поїздку, де наповнювач (11 і 15 ₴) дешевший на 1–3%: 10,7 → 11, 14,6 → 15.
    let seed = 1;
    while (!(shopModifier(at("shop", seed), litter) < -0.01 && shopModifier(at("shop", seed), litter) > -0.03)) seed += 1;
    const state = at("shop", seed);
    expect(unitPrice(state, litter, "cheap", "store")).toBe(11);
    expect(unitPrice(state, litter, "premium", "store")).toBe(15);
    expect(discount(state, litter, "store")).toBe(0);
  });

  it("подія дня входить у сьогоднішню ціну: «Акція в зоомагазині» — бірка й у телефоні, «Подорожчання корму» — ні", () => {
    const state = at(null);
    const catFood = { product: "catFood" } as const;
    for (const g of catalog(state, "delivery")) expect(discount(state, g, "delivery"), goodsKey(g)).toBe(0);
    state.modifiers.day = "pet-sale";
    const sale = Math.round((1 - (MODIFIERS.catFoodPrice["pet-sale"] ?? 1)) * 100);
    expect(sale).toBe(30);
    expect(discount(state, catFood, "delivery")).toBe(sale);
    expect(discount(state, { product: "food" }, "delivery")).toBe(0);
    state.modifiers.day = "food-price-up";
    expect(discount(state, catFood, "delivery")).toBe(0);
    // На місці — подія разом із модифікатором поїздки.
    const shop = at("shop", 3);
    shop.modifiers.day = "pet-sale";
    const factor = (MODIFIERS.catFoodPrice["pet-sale"] ?? 1) * (1 + shopModifier(shop, catFood));
    expect(discount(shop, catFood, "store")).toBe(Math.round((1 - factor) * 100));
  });
});
