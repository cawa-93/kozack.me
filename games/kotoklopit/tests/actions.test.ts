import { describe, expect, it } from "vitest";

import { useProgress } from "../src/sim/actions";
import { BURN_MINUTES, COOK_MINUTES, MEAL_SATIETY, SHOWER_HYGIENE } from "../src/sim/config";
import { supplyCount } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import type { Save } from "../src/sim/types";
import { holdUntilDone, hours, recordEvents, standAt } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 1 });

const holdFor = (save: Save, minutes: number): void => {
  advance(save, minutes, { move: { x: 0, y: 0 }, hold: true });
};

/** Приготувати страву й покласти її на стіл. */
const serveMeal = (save: Save): void => {
  standAt(save, "fridge");
  interact(save);
  standAt(save, "stove");
  interact(save);
  advance(save, COOK_MINUTES);
  interact(save);
  standAt(save, "table");
  interact(save);
};

describe("холодильник (§6.4, §8.7)", () => {
  it("видає сиру порцію, спершу дорогу, і приймає її назад", () => {
    const save = game();
    const supplies = save.current.home.supplies;
    supplies.food.premium = 1;
    standAt(save, "fridge");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "raw", quality: "premium" });
    expect(supplies.food).toEqual({ cheap: 6, premium: 0 });
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(supplies.food).toEqual({ cheap: 6, premium: 1 });
  });

  it("порожній холодильник — відмова", () => {
    const save = game();
    save.current.home.supplies.food.cheap = 0;
    standAt(save, "fridge");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events).toContainEqual({ type: "refused", object: "fridge", reason: "empty" });
  });
});

describe("плита (§8.7)", () => {
  it("страва готова за 20 хвилин, підгорає ще через 15, а підгорілу викидають", () => {
    const save = game();
    standAt(save, "fridge");
    interact(save);
    standAt(save, "stove");
    interact(save);
    const stove = save.current.home.stove;
    expect(stove.item?.kind).toBe("raw");
    advance(save, COOK_MINUTES - 1);
    expect(stove.item?.kind).toBe("raw");
    advance(save, 1);
    expect(stove.item?.kind).toBe("meal");
    advance(save, BURN_MINUTES - COOK_MINUTES);
    expect(stove.item?.kind).toBe("burnt");
    interact(save);
    expect(save.current.character.held?.kind).toBe("burnt");
    standAt(save, "trash");
    interact(save);
    expect(save.current.character.held).toBeNull();
  });

  it("на зайняту плиту нічого не покласти", () => {
    const save = game();
    save.current.home.stove.item = { kind: "raw", quality: "cheap" };
    save.current.character.held = { kind: "raw", quality: "cheap" };
    standAt(save, "stove");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: "stove", reason: "occupied" });
  });

  it("страва, що лишилася на плиті на ніч, підгорає", () => {
    const save = game();
    save.current.home.stove = { item: { kind: "meal", quality: "cheap" }, minutes: COOK_MINUTES };
    save.current.minute = hours(22);
    standAt(save, "bed");
    interact(save);
    expect(save.current.home.stove.item?.kind).toBe("burnt");
  });
});

describe("їжа за столом (§8.7)", () => {
  it("страву їдять утриманням дії 10 хвилин", () => {
    const save = game();
    serveMeal(save);
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
    const satiety = save.current.character.stats.satiety;
    const { events, stop } = recordEvents();
    holdFor(save, 5);
    expect(useProgress(save.current)).toBeCloseTo(0.5);
    holdFor(save, 5);
    stop();
    expect(save.current.home.surfaces["table"]).toBeNull();
    // Ситість за 10 хвилин їжі трохи спала, але порція дала +24.
    expect(save.current.character.stats.satiety).toBeCloseTo(satiety + MEAL_SATIETY.cheap - 4 / 6);
    expect(events).toContainEqual({ type: "ate", satiety: MEAL_SATIETY.cheap, food: 5 });
  });

  it("страву на столі не взяти назад коротким натисканням", () => {
    const save = game();
    serveMeal(save);
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
  });

  it("відпущена кнопка ставить їжу на паузу, рух перериває", () => {
    const save = game();
    serveMeal(save);
    holdFor(save, 4);
    advance(save, 3);
    expect(useProgress(save.current)).toBeCloseTo(0.4);
    advance(save, 0.1, { move: { x: 1, y: 0 }, hold: true });
    expect(save.current.character.activity).toBeNull();
  });
});

describe("душ (§8.7)", () => {
  it("10 хвилин утримання: дешеві засоби +45, дорогі +60, без засобів +20", () => {
    for (const [supply, hygiene] of [
      [{ cheap: 1, premium: 0 }, SHOWER_HYGIENE.cheap],
      [{ cheap: 1, premium: 1 }, SHOWER_HYGIENE.premium],
      [{ cheap: 0, premium: 0 }, SHOWER_HYGIENE.none],
    ] as const) {
      const save = game();
      const stats = save.current.character.stats;
      stats.hygiene = 20;
      save.current.home.supplies.hygiene = { ...supply };
      standAt(save, "shower");
      holdUntilDone(save);
      expect(stats.hygiene).toBeCloseTo(20 + hygiene - 3 / 6);
      expect(supplyCount(save.current, "hygiene")).toBe(Math.max(0, supply.cheap + supply.premium - 1));
    }
  });

  it("сповільнення подовжує душ (§8.8)", () => {
    const save = game();
    save.current.minute = hours(22.5);
    standAt(save, "shower");
    holdFor(save, 10);
    expect(useProgress(save.current)).toBeCloseTo(0.8);
  });

  it("з річчю в руках у душ не піти", () => {
    const save = game();
    save.current.character.held = { kind: "raw", quality: "cheap" };
    standAt(save, "shower");
    holdFor(save, 10);
    expect(save.current.character.activity).toBeNull();
  });
});

describe("ліжко (§8.8)", () => {
  it("зарано лягати — відмова; з порожніми руками у вікні сну — ніч", () => {
    const save = game();
    standAt(save, "bed");
    const { events, stop } = recordEvents();
    expect(interact(save)).toBeNull();
    save.current.minute = hours(21);
    save.current.character.held = { kind: "meal", quality: "cheap" };
    expect(interact(save)).toBeNull();
    save.current.character.held = null;
    const report = interact(save);
    stop();
    expect(report?.sleptHours).toBe(9);
    expect(events.filter((e) => e.type === "refused").map((e) => e.type === "refused" && e.reason)).toEqual([
      "too-early",
      "hands-full",
    ]);
    expect(events.some((e) => e.type === "night")).toBe(true);
  });

  it("падаючи без сил, персонаж упускає річ: сира порція — в холодильник; уранці він біля ліжка", () => {
    const save = game();
    save.current.character.held = { kind: "raw", quality: "premium" };
    standAt(save, "computer");
    save.current.minute = hours(23.9);
    advance(save, hours(1));
    const { held, body } = save.current.character;
    expect(held).toBeNull();
    expect(save.current.home.supplies.food.premium).toBe(1);
    expect(save.current.day).toBe(1);
    expect({ x: body.x, y: body.y }).toEqual({ x: 3.5, y: 2.5 });
  });
});

describe("робочі поверхні", () => {
  it("на поверхню кладуть і з неї беруть будь-яку річ", () => {
    const save = game();
    save.current.character.held = { kind: "meal", quality: "cheap" };
    standAt(save, "counter-right");
    interact(save);
    expect(save.current.home.surfaces["counter-right"]).toEqual({ kind: "meal", quality: "cheap" });
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "meal", quality: "cheap" });
  });
});
