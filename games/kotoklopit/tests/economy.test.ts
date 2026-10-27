import { describe, expect, it } from "vitest";

import { START_MONEY } from "../src/sim/config";
import { deliveryCost, order, productPrice, seePhoneHints, supplyCount, unpack, useSupply } from "../src/sim/economy";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { absoluteMinute } from "../src/sim/time";
import type { Save } from "../src/sim/types";
import { hours, recordEvents, standAt, waitUntil, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 1 }));

describe("стартові запаси (§6.4)", () => {
  it("6 порцій дешевої їжі й 3 душі засобів гігієни, без ліків", () => {
    const save = game();
    // Решта запасів на старті порожні; сховища показують лише те, що вже бувало вдома.
    expect(save.current.home.supplies).toMatchObject({
      food: { cheap: 6, premium: 0 },
      humanMeds: { cheap: 0, premium: 0 },
      hygiene: { cheap: 3, premium: 0 },
      catFood: { cheap: 0, premium: 0 },
      litter: { cheap: 0, premium: 0 },
      detergent: { cheap: 0, premium: 0 },
    });
    expect(save.current.home.acquired).toEqual(["food", "hygiene"]);
  });
});

describe("підказка телефоном (§6.4)", () => {
  it("запас уперше закінчився — підказка, доки телефон не відкриють; удруге — ні", () => {
    const { current: state } = game();
    state.home.supplies.hygiene = { cheap: 1, premium: 0 };
    useSupply(state, "hygiene");
    expect(state.home.phoneHints).toEqual(["hygiene"]);
    seePhoneHints(state);
    expect(state.home.phoneHints).toEqual([]);
    state.home.supplies.hygiene = { cheap: 1, premium: 0 };
    useSupply(state, "hygiene");
    expect(state.home.phoneHints).toEqual([]);
  });

  it("без підказки, якщо запас уже їде, і для нашийника", () => {
    const { current: state } = game();
    state.character.money = 1000;
    state.home.supplies.food = { cheap: 1, premium: 0 };
    order(state, "food", "cheap");
    useSupply(state, "food");
    state.home.supplies.collar = { cheap: 1, premium: 0 };
    useSupply(state, "collar");
    expect(state.home.phoneHints).toEqual([]);
  });

  it("старе збереження без полів підказки не ламається", () => {
    const { current: state } = game();
    delete state.home.ranOut;
    delete state.home.phoneHints;
    state.home.supplies.hygiene = { cheap: 1, premium: 0 };
    useSupply(state, "hygiene");
    expect(state.home.phoneHints).toEqual(["hygiene"]);
  });
});

describe("доставка (§6.4)", () => {
  it("ціна — базова, доставка окремо: 10% бази й надбавка за складністю (правка 2026-10-23)", () => {
    for (const [difficulty, fee] of [["easy", 8], ["normal", 10], ["hard", 12]] as const) {
      const state = newGame({ sex: "female", difficulty, seed: 1 }).current;
      expect(productPrice(state, "food", "cheap")).toBe(40);
      expect(productPrice(state, "hygiene", "premium")).toBe(35);
      expect(deliveryCost(state, 40)).toBe(4 + fee);
      // 10% від 15 — 1,5, округлено до 2.
      expect(deliveryCost(state, 15)).toBe(2 + fee);
    }
  });

  it("пакунок прибуває через 6 годин і чекає під дверима, доки їх не відчинять", () => {
    const save = game();
    const { events, stop } = recordEvents();
    const delivery = order(save.current, "food", "premium");
    expect(delivery?.at).toBe(absoluteMinute(0, hours(12)));
    // Окреме замовлення: 80 за товар, 8 — 10% бази й 10 — надбавка.
    expect(save.current.character.money).toBe(START_MONEY - 98);
    advance(save, hours(6) - 1);
    expect(save.current.home.porch).toEqual([]);
    advance(save, 1);
    expect(save.current.home.porch).toHaveLength(1);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    advance(save, hours(2));
    standAt(save, "door");
    interact(save);
    stop();
    expect(save.current.home.porch).toEqual([]);
    // Пакунки — у ящиках біля входу; розпакувати — і запаси в холодильнику (§6.4).
    expect(save.current.home.boxes?.food).toEqual({ cheap: 0, premium: 21 });
    unpack(save.current);
    expect(save.current.home.supplies.food).toEqual({ cheap: 6, premium: 21 });
    expect(events.some((e) => e.type === "received")).toBe(true);
  });

  it("кожне замовлення — окремий пакунок", () => {
    const save = game();
    order(save.current, "food", "cheap");
    advance(save, hours(1));
    order(save.current, "hygiene", "cheap");
    advance(save, hours(6));
    standAt(save, "door");
    interact(save);
    unpack(save.current);
    expect(supplyCount(save.current, "food")).toBe(6 + 21);
    expect(supplyCount(save.current, "hygiene")).toBe(3 + 14);
  });

  it("без грошей замовити не можна", () => {
    const save = game();
    save.current.character.money = 43;
    expect(order(save.current, "food", "cheap")).toBeNull();
    expect(save.current.character.money).toBe(43);
    expect(save.current.home.deliveries).toEqual([]);
  });

  it("якщо персонаж спатиме, коли прибуде пакунок, його привезуть о 09:00 наступного дня", () => {
    const save = game();
    waitUntil(save, hours(19));
    order(save.current, "food", "cheap");
    save.current.minute = hours(21);
    save.current.character.stats.satiety = 100;
    goToSleep(save);
    expect(save.current.home.deliveries[0]?.at).toBe(absoluteMinute(1, hours(9)));
    waitUntil(save, hours(9));
    expect(save.current.home.porch).toHaveLength(1);
  });
});

describe("комунальні в ніч на понеділок (§6.4)", () => {
  /** Прожити до неділі ввечері з такими грошима й лягти спати. */
  const sundayNight = (save: Save, money: number) => {
    save.current.day = 6;
    save.current.minute = hours(22);
    save.current.character.money = money;
    return goToSleep(save);
  };

  it("сплачено 40", () => {
    const save = game();
    const report = sundayNight(save, 100);
    expect(report?.utilities).toEqual({ outcome: "paid", paid: 40, nextDue: 0 });
    expect(save.current.character.money).toBe(60);
  });

  it("у будні комунальні не списуються", () => {
    const save = game();
    save.current.minute = hours(22);
    expect(goToSleep(save)?.utilities).toBeNull();
    expect(save.current.character.money).toBe(START_MONEY);
  });

  it("не вистачило — попередження, наступного тижня треба сплатити за два", () => {
    const save = game();
    const first = sundayNight(save, 30);
    expect(first?.utilities).toEqual({ outcome: "warning", paid: 0, nextDue: 80 });
    expect(save.current.character.money).toBe(30);
    expect(save.current.home.utilitiesDebt).toBe(40);

    const cleared = sundayNight(save, 100);
    expect(cleared?.utilities).toEqual({ outcome: "cleared", paid: 80, nextDue: 0 });
    expect(save.current.home.utilitiesDebt).toBe(0);
  });

  it("з попередженням вистачило на один тиждень — попередження лишається", () => {
    const save = game();
    sundayNight(save, 0);
    const partial = sundayNight(save, 50);
    expect(partial?.utilities).toEqual({ outcome: "partial", paid: 40, nextDue: 80 });
    expect(save.current.character.money).toBe(10);
    expect(save.current.home.utilitiesDebt).toBe(40);
  });

  it("з попередженням не вистачило на жоден тиждень — виселення, решта ночі не обробляється", () => {
    const save = game();
    sundayNight(save, 0);
    const dayStart = save.dayStart.day;
    const report = sundayNight(save, 39);
    expect(report?.utilities?.outcome).toBe("evicted");
    expect(save.current.end).toBe("eviction");
    expect(report?.steps.at(-1)).toBe("utilities");
    expect(report?.steps).not.toContain("new-day");
    expect(save.dayStart.day).toBe(dayStart);
  });
});
