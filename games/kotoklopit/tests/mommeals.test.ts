// Мамині судочки (§4.1, §6.4, рішення автора 2026-10-26): окремий запас у холодильнику — готова страва без плити. Мама кладе
// їх у холодильник сама, а коли не застала — пакет у ящиках біля входу.

import { describe, expect, it } from "vitest";

import { Bot } from "../balance/bot";
import { EAT_MINUTES, MEAL_SATIETY, STORAGE_LIMITS } from "../src/sim/config";
import { addSupply, canOrderProduct, order, stash, supplyCount, useSupply } from "../src/sim/economy";
import { advance, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { tickModifiers } from "../src/sim/modifiers";
import { GOODS } from "../src/sim/shop";
import { boxesIndicator, STORAGES, storageIndicator } from "../src/sim/storage";
import type { GameState, Product, Quality, Save } from "../src/sim/types";
import { eventBubbles, itemIcon, PRODUCT_ICONS, stoveIcon } from "../src/view/symbols";
import { hours, recordEvents, standAt, walkTo } from "./helpers";

const game = (): Save => newGame({ address: "she", difficulty: "normal", seed: 5 });
const meals = (save: Save): number => save.current.home.supplies.momMeal.cheap;
const SUDOCHOK = { kind: "meal", quality: "cheap", mom: true } as const;
const fridge = STORAGES.find((s) => s.object === "fridge")!;

describe("мамині судочки в холодильнику (§6.4, рішення автора 2026-10-26)", () => {
  it("з холодильника першим береться судочок — готова страва, без плити; кладуть його назад туди ж; судочків немає — сира порція", () => {
    const save = game();
    addSupply(save.current, "momMeal", "cheap", 2);
    standAt(save, "fridge");
    const { events, stop } = recordEvents();
    interact(save);
    expect(save.current.character.held).toEqual(SUDOCHOK);
    expect(meals(save)).toBe(1);
    expect(supplyCount(save.current, "food")).toBe(6);
    // Узяв — подумав, скільки судочків лишилося (§6.4).
    expect(events).toContainEqual({ type: "supply-used", product: "momMeal", left: 1 });
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(meals(save)).toBe(2);
    save.current.home.supplies.momMeal.cheap = 0;
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "raw", quality: "cheap" });
  });

  it("судочок на столі їдять утриманням: +40, як дешева порція; тримати довше — з'їдено один раз, і з холодильника не береться", () => {
    const save = game();
    addSupply(save.current, "momMeal", "cheap", 2);
    save.current.character.stats.satiety = 30;
    standAt(save, "fridge");
    interact(save);
    standAt(save, "table");
    interact(save);
    expect(save.current.home.surfaces["table"]).toEqual(SUDOCHOK);
    const { events, stop } = recordEvents();
    advance(save, EAT_MINUTES * 3, { move: { x: 0, y: 0 }, hold: true });
    stop();
    const ate = events.filter((e) => e.type === "ate");
    expect(ate).toHaveLength(1);
    expect(ate[0]).toMatchObject({ satiety: MEAL_SATIETY.cheap });
    expect(MEAL_SATIETY.cheap).toBe(40);
    expect(save.current.home.surfaces["table"]).toBeNull();
    expect(meals(save)).toBe(1);
    // Утримання біля холодильника нічого не бере: судочок — натисканням.
    standAt(save, "fridge");
    advance(save, 30, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.held).toBeNull();
    expect(meals(save)).toBe(1);
  });

  it("заснув із судочком у руках — він повертається в холодильник, а не на кухню", () => {
    const save = game();
    addSupply(save.current, "momMeal", "cheap", 1);
    standAt(save, "fridge");
    interact(save);
    expect(meals(save)).toBe(0);
    save.current.minute = hours(22);
    goToSleep(save);
    expect(save.current.character.held).toBeNull();
    expect(meals(save)).toBe(1);
    expect(Object.values(save.current.home.surfaces).some((d) => d !== null)).toBe(false);
  });

  it("пакет у ящиках біля входу: зблизька видно судочки, «Розпакувати» кладе їх у холодильник — його індикатор показує судочки з лімітом", () => {
    const save = game();
    stash(save.current, "momMeal", "cheap", 2);
    walkTo(save, "boxes");
    expect(boxesIndicator(save.current)).toEqual([{ product: "momMeal", count: 2 }]);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "unpacked", moved: [{ product: "momMeal", amount: 2 }] });
    expect(meals(save)).toBe(2);
    expect(save.current.home.boxes?.momMeal).toBeUndefined();
    walkTo(save, "fridge");
    expect(storageIndicator(save.current, fridge)).toEqual([
      { product: "food", count: 6, limit: 40 },
      { product: "momMeal", count: 2, limit: STORAGE_LIMITS.momMeal },
    ]);
  });

  it("у магазині судочків немає, замовити їх не можна, а коли закінчилися — телефон не підказує", () => {
    const save = game();
    expect(GOODS.some((g) => "product" in g && g.product === "momMeal")).toBe(false);
    expect(canOrderProduct(save.current, "momMeal")).toBe(false);
    expect(order(save.current, "momMeal", "cheap")).toBeNull();
    addSupply(save.current, "momMeal", "cheap", 1);
    useSupply(save.current, "momMeal");
    expect(save.current.home.phoneHints ?? []).not.toContain("momMeal");
  });

  it("своя іконка — судочок: у сховищі, у руках і в думці «скільки лишилося»", () => {
    expect(PRODUCT_ICONS.momMeal).toBe("mom-meal");
    expect(itemIcon(SUDOCHOK)).toBe("mom-meal");
    expect(itemIcon({ kind: "meal", quality: "cheap" })).toBe("meal");
    expect(eventBubbles({ type: "supply-used", product: "momMeal", left: 1 })).toEqual([{ kind: "think", at: "person", icon: "mom-meal", count: 1 }]);
    const icons = Object.values(PRODUCT_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("судочок на плиті — над плитою його іконка, а не тарілка (перевірка 2026-10-26); решта станів плити — як були", () => {
    expect(stoveIcon(SUDOCHOK)).toBe("mom-meal");
    expect(stoveIcon({ kind: "meal", quality: "cheap" })).toBe("meal");
    expect(stoveIcon({ kind: "raw", quality: "cheap" })).toBe("pot");
    expect(stoveIcon({ kind: "burnt", quality: "cheap" })).toBe("smoke");
    expect(stoveIcon(null)).toBeNull();
  });

  it("старі збереження: судочків немає — порожньо; пакет мами під дверима зі старої гри — у ящиках біля входу", () => {
    const save = game();
    for (const state of [save.current, save.dayStart, save.weekStart]) {
      delete (state.home.supplies as Partial<Record<Product, Record<Quality, number>>>).momMeal;
    }
    const old: GameState = save.current;
    old.modifiers.day = "mom-food";
    old.today.mom = { at: hours(12), porch: true };
    const copy = deserialize(serialize(save));
    for (const state of [copy.current, copy.dayStart, copy.weekStart]) expect(state.home.supplies.momMeal).toEqual({ cheap: 0, premium: 0 });
    tickModifiers(copy.current, hours(13), 1, false);
    expect(copy.current.home.boxes?.momMeal?.cheap).toBe(2);
    expect(copy.current.today.mom).toBeUndefined();
  });

  it("бот балансу їсть судочки з холодильника, навіть коли продуктів немає", () => {
    const save = game();
    const state = save.current;
    state.home.supplies.food.cheap = 0;
    state.character.money = 0;
    state.character.stats.satiety = 55;
    addSupply(state, "momMeal", "cheap", 2);
    new Bot(save).day();
    expect(meals(save)).toBe(0);
  });
});
