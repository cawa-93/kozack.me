import { describe, expect, it } from "vitest";

import { useProgress } from "../src/sim/actions";
import { targetOf } from "../src/sim/targets";
import { dash } from "../src/sim/body";
import { BURN_MINUTES, COOK_MINUTES, EAT_MINUTES, HOUSEHOLD, MEAL_SATIETY, SHOWER_HYGIENE } from "../src/sim/config";
import { supplyCount } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import type { Save } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 1 }));

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
    expect(events).toContainEqual({ type: "refused", object: "fridge", reason: "empty", product: "food" });
  });
});

describe("плита (§8.7)", () => {
  it("підгорає за складністю: 45 / 30 / 15 хвилин після готовності", () => {
    for (const [difficulty, after] of [["easy", 45], ["normal", 30], ["hard", 15]] as const) {
      const save = newGame({ sex: "female", difficulty, seed: 1 });
      const stove = save.current.home.stove;
      stove.item = { kind: "meal", quality: "cheap" };
      stove.minutes = COOK_MINUTES;
      advance(save, after - 1);
      expect(stove.item?.kind).toBe("meal");
      advance(save, 1);
      expect(stove.item?.kind).toBe("burnt");
    }
  });

  it("страва готова за 20 хвилин, підгорає ще через 30 на середній, а підгорілу викидають", () => {
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
    advance(save, BURN_MINUTES.normal - COOK_MINUTES - 1);
    expect(stove.item?.kind).toBe("meal");
    advance(save, 1);
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
    // Голодний персонаж: порція не впирається в стелю 100.
    save.current.character.stats.satiety = 30;
    const satiety = save.current.character.stats.satiety;
    const { events, stop } = recordEvents();
    holdFor(save, 5);
    expect(useProgress(save.current)).toBeCloseTo(0.5);
    holdFor(save, 5);
    stop();
    expect(save.current.home.surfaces["table"]).toBeNull();
    // Ситість за 10 хвилин їжі трохи спала, але порція додала свою частку.
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

  it("ривок перериває їжу, як рух, і нова дія не почнеться, поки кнопку не відпустили (§10, загальна ревізія 2026-10-29)", () => {
    const save = game();
    serveMeal(save);
    holdFor(save, 3);
    expect(save.current.character.activity?.kind).toBe("use");
    // Спиною до столу: ривок несе геть від страви.
    const body = save.current.character.body;
    body.facing = { x: -body.facing.x, y: -body.facing.y };
    const { events, stop } = recordEvents();
    expect(dash(save.current)).toBe(true);
    expect(save.current.character.activity).toBeNull();
    holdFor(save, EAT_MINUTES + 1);
    stop();
    expect(save.current.character.activity).toBeNull();
    expect(events.some((e) => e.type === "ate")).toBe(false);
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
    // Відпустили кнопку — і знову можна діяти.
    advance(save, 0.1);
    expect(save.current.character.holdSpent).toBe(false);
  });
});

describe("душ (§8.7)", () => {
  it("натиснути — і 10 хвилин у кабіні: гігієна росте залежно від засобів", () => {
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
      interact(save);
      advance(save, 10);
      expect(stats.hygiene).toBeCloseTo(20 + hygiene - 3 / 6);
      expect(supplyCount(save.current, "hygiene")).toBe(Math.max(0, supply.cheap + supply.premium - 1));
    }
  });

  it("у брудному одязі душ не піднімає гігієну вище 60, а падає вона вдвічі швидше", () => {
    const save = game();
    const stats = save.current.character.stats;
    stats.hygiene = 20;
    save.current.home.clothes = 0;
    save.current.home.supplies.hygiene = { cheap: 0, premium: 1 };
    standAt(save, "shower");
    interact(save);
    advance(save, 10);
    expect(stats.hygiene).toBeCloseTo(HOUSEHOLD.noClothesHygieneCeiling, 0);
    advance(save, 60);
    expect(stats.hygiene).toBeCloseTo(HOUSEHOLD.noClothesHygieneCeiling - 3 * HOUSEHOLD.noClothesHygiene, 0);
  });

  it("засіб не витрачається, коли й без нього гігієна дійде до межі: 100 чи 60 у брудному одязі", () => {
    for (const [clothes, hygiene, used] of [[5, 95, 0], [0, 55, 0], [5, 80, 1], [0, 40, 1]] as const) {
      const save = game();
      const stats = save.current.character.stats;
      stats.hygiene = hygiene;
      save.current.home.clothes = clothes;
      save.current.home.supplies.hygiene = { cheap: 2, premium: 0 };
      standAt(save, "shower");
      interact(save);
      advance(save, 10);
      expect(supplyCount(save.current, "hygiene")).toBe(2 - used);
      expect(stats.hygiene).toBeCloseTo(clothes > 0 ? 100 : HOUSEHOLD.noClothesHygieneCeiling, 0);
    }
  });

  it("сповільнення подовжує душ (§8.8)", () => {
    const save = game();
    save.current.minute = hours(22.5);
    standAt(save, "shower");
    interact(save);
    advance(save, 10);
    expect(useProgress(save.current)).toBeCloseTo(0.8);
  });

  it("у кабіні рух і ривок не діють, вийти можна лише після душу", () => {
    const save = game();
    standAt(save, "shower");
    const { x, y } = save.current.character.body;
    interact(save);
    advance(save, 5, { move: { x: 0, y: 1 }, hold: false });
    expect(save.current.character.body).toMatchObject({ x, y });
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true });
    advance(save, 6, { move: { x: 0, y: 1 }, hold: false });
    expect(save.current.character.activity).toBeNull();
  });

  it("утриманням у душ не зайти", () => {
    const save = game();
    standAt(save, "shower");
    holdFor(save, 10);
    expect(save.current.character.activity).toBeNull();
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
    expect({ x: body.x, y: body.y }).toEqual({ x: 2.5, y: 2.5 });
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

describe("безлад як ціль (§10)", () => {
  it("з річчю в руках безлад біля смітника не заступає його", () => {
    const save = game();
    standAt(save, "trash");
    const body = save.current.character.body;
    save.current.home.messes.push({ id: 1, kind: "vomit", x: body.x, y: body.y, cat: null });
    expect(targetOf(save.current)?.id).toBe("mess:1");
    save.current.character.held = { kind: "burnt", quality: "cheap" };
    expect(targetOf(save.current)?.id).toBe("trash");
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.messes).toHaveLength(1);
  });

  it("з річчю в руках іграшка перед плитою не заступає її", () => {
    const save = game();
    standAt(save, "stove");
    const body = save.current.character.body;
    const toy = save.current.home.items.find((i) => i.kind === "toy")!;
    Object.assign(toy, { x: body.x, y: body.y });
    body.facing = { x: 0, y: 1 };
    expect(targetOf(save.current)?.id).toBe(`item:${toy.id}`);
    save.current.character.held = { kind: "raw", quality: "cheap" };
    expect(targetOf(save.current)?.id).not.toBe(`item:${toy.id}`);
    body.facing = { x: 0, y: -1 };
    expect(targetOf(save.current)?.id).toBe("stove");
    interact(save);
    expect(save.current.home.stove.item?.kind).toBe("raw");
  });
});
