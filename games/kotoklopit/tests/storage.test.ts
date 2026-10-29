// Сховища запасів (§6.4): кожен запас у своєму сховищі, вміст видно зблизька, потрібний нуль — завжди,
// витрата виринає над персонажем.

import { describe, expect, it } from "vitest";

import { onEvent, type GameEvent } from "../src/sim/events";
import { interact, newGame } from "../src/sim/game";
import { isPresent, isSolid, objectById } from "../src/sim/home";
import { targetById } from "../src/sim/targets";
import { addSupply, boxCount, order, receivePackages, unpack } from "../src/sim/economy";
import { advance } from "../src/sim/game";
import { hasBoxes } from "../src/sim/home";
import { boxesIndicator, boxesShown } from "../src/sim/storage";
import { buyAtShop } from "../src/sim/destinations";
import { PRODUCTS, STORAGE_LIMITS, UNSOLD } from "../src/sim/config";
import { createCat } from "../src/sim/cat";
import { giveStarterPack } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { STORAGES, storageIndicator } from "../src/sim/storage";
import { targetOf } from "../src/sim/targets";
import type { Product, Save } from "../src/sim/types";
import { walkTo } from "./helpers";

const ALL: Product[] = ["food", "hygiene", "catFood", "sterileFood", "litter", "pills", "drops", "humanMeds", "treats", "collar", "bell", "shampoo", "detergent", "catnip", "momMeal"];

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 3 });
const storage = (object: string) => STORAGES.find((s) => s.object === object)!;

describe("сховища (§6.4)", () => {
  it("кожен запас лежить рівно в одному сховищі, яке є в квартирі", () => {
    for (const product of ALL) expect(STORAGES.filter((s) => s.products.includes(product))).toHaveLength(1);
    for (const s of STORAGES) expect(objectById(s.object)).toBeDefined();
  });

  it("запаси, які треба дістати, мають власне сховище; мамині судочки — у холодильнику з продуктами (рішення автора 2026-10-26)", () => {
    for (const product of ["catFood", "sterileFood", "litter"] as const) {
      expect(STORAGES.find((s) => s.products.includes(product))!.products).toEqual([product]);
    }
    expect(storage("fridge").products).toEqual(["food", "momMeal"]);
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

  it("замовляти можна більше, ніж влазить; зайве зі стартового пакета — у ящики (правка 2026-10-23)", () => {
    const save = game();
    const state = save.current;
    state.character.money = 10_000;
    // 6 порцій є; дві упаковки по 20 уже не влізуть у холодильник на 40, але замовити можна.
    expect(order(state, "food", "cheap")).not.toBeNull();
    expect(order(state, "food", "cheap")).not.toBeNull();
    // Корм: 110 у шафці, з пакета притулку зайве лягає в ящики.
    addSupply(state, "catFood", "cheap", 108);
    giveStarterPack(state, createCat(state, createRng(1), { source: "shelter", ageWeeks: 3 }));
    expect(state.home.supplies.catFood.cheap).toBe(110);
    expect(boxCount(state, "catFood")).toBe(6);
  });
});

describe("упаковки й ліміти сховищ (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17)", () => {
  it("ліміт кожного сховища ділиться на упаковку без остачі: «до повного» не лишає хвостика в ящиках", () => {
    for (const product of Object.keys(PRODUCTS) as Product[]) {
      for (const quality of ["cheap", "premium"] as const) expect(STORAGE_LIMITS[product] % PRODUCTS[product].units[quality], `${product} ${quality}`).toBe(0);
    }
  });

  it("порожнє сховище, скільки влазить упаковок, — повне, а ящики порожні", () => {
    for (const product of (Object.keys(PRODUCTS) as Product[]).filter((p) => !UNSOLD.includes(p))) {
      const state = game().current;
      state.home.supplies[product] = { cheap: 0, premium: 0 };
      const packs = STORAGE_LIMITS[product] / PRODUCTS[product].units.cheap;
      expect(Number.isInteger(packs), product).toBe(true);
      state.home.boxes = { [product]: { cheap: packs * PRODUCTS[product].units.cheap, premium: 0 } };
      unpack(state);
      expect(state.home.supplies[product].cheap, product).toBe(STORAGE_LIMITS[product]);
      expect(boxCount(state, product), product).toBe(0);
      expect(hasBoxes(state), product).toBe(false);
    }
  });
});

describe("ящики біля входу (§6.4, правка 2026-10-23)", () => {
  const delivered = (): Save["current"] => {
    const save = game();
    const state = save.current;
    state.character.money = 10_000;
    order(state, "food", "cheap");
    order(state, "food", "cheap");
    order(state, "hygiene", "cheap");
    advance(save, 6 * 60);
    receivePackages(state);
    return state;
  };

  it("пакунки з-за дверей — у ящики, а не одразу в сховища", () => {
    const state = delivered();
    expect(state.home.supplies.food.cheap).toBe(6);
    expect(boxCount(state, "food")).toBe(40);
    expect(boxCount(state, "hygiene")).toBe(15);
    expect(hasBoxes(state)).toBe(true);
    expect(isPresent(state, objectById("boxes"))).toBe(true);
    // Через ящики можна пройти: вони не заступають дорогу до дверей.
    const boxes = objectById("boxes");
    expect(isSolid(state, boxes.x, boxes.y)).toBe(false);
  });

  it("дія біля ящиків — запаси розлітаються по сховищах, скільки влазить; решта лишається", () => {
    const state = delivered();
    const moved = unpack(state);
    expect(moved).toEqual([
      { product: "food", amount: 34 },
      { product: "hygiene", amount: 15 },
    ]);
    expect(state.home.supplies.food.cheap).toBe(40);
    expect(boxCount(state, "food")).toBe(6);
    expect(boxCount(state, "hygiene")).toBe(0);
    // Холодильник повний — розпаковувати нічого, ящики стоять.
    expect(unpack(state)).toEqual([]);
    expect(hasBoxes(state)).toBe(true);
    state.home.supplies.food.cheap = 10;
    unpack(state);
    expect(hasBoxes(state)).toBe(false);
    expect(isPresent(state, objectById("boxes"))).toBe(false);
  });

  it("запас, що лежить у ящиках, не замовити й не купити", () => {
    const state = delivered();
    expect(order(state, "food", "premium")).toBeNull();
    state.trip = { destination: "shop", seed: 1 } as Save["current"]["trip"];
    expect(buyAtShop(state, { product: "food" }, "cheap")).toBe(false);
    // Іншого запасу — можна; з магазину він теж їде в ящиках.
    expect(buyAtShop(state, { product: "detergent" }, "cheap")).toBe(true);
    expect(boxCount(state, "detergent")).toBe(5);
    expect(state.home.supplies.detergent.cheap).toBe(0);
  });

  it("ящиків видно від 1 до 4 — за кількістю упаковок усередині (правка 2026-10-23)", () => {
    const state = game().current;
    expect(boxesShown(state)).toBe(0);
    state.home.boxes = { food: { cheap: 5, premium: 0 } };
    expect(boxesShown(state)).toBe(1);
    state.home.boxes = { food: { cheap: 20, premium: 0 }, hygiene: { cheap: 15, premium: 0 } };
    expect(boxesShown(state)).toBe(2);
    state.home.boxes = { food: { cheap: 21, premium: 20 } };
    expect(boxesShown(state)).toBe(3);
    state.home.boxes = { catFood: { cheap: 55 * 9, premium: 0 }, litter: { cheap: 10, premium: 4 } };
    expect(boxesShown(state)).toBe(4);
  });

  it("зблизька видно, що в ящиках", () => {
    const save = game();
    const state = save.current;
    state.character.money = 10_000;
    order(state, "hygiene", "cheap");
    advance(save, 6 * 60);
    receivePackages(state);
    expect(boxesIndicator(state)).toEqual([]);
    walkTo(save, "boxes");
    expect(targetOf(state)?.id).toBe("boxes");
    expect(boxesIndicator(state)).toEqual([{ product: "hygiene", count: 15 }]);
    interact(save);
    expect(boxCount(state, "hygiene")).toBe(0);
    expect(state.home.supplies.hygiene.cheap).toBe(3 + 15);
  });

  it("на старті котячих речей немає; кошеня з притулку приносить найпростіші", () => {
    const state = game().current;
    expect(state.home.items).toEqual([]);
    const kitten = createCat(state, createRng(1), { source: "shelter-forced", ageWeeks: 1 });
    giveStarterPack(state, kitten);
    expect(state.home.items.map((i) => i.kind).sort()).toEqual(["bowl", "litter", "water"]);
    // Другий пакет нових речей не додає: вони вже є.
    giveStarterPack(state, kitten);
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
