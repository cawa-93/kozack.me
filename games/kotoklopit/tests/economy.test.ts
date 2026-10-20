import { describe, expect, it } from "vitest";

import { deliveryPrice, order, supplyCount } from "../src/sim/economy";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { absoluteMinute } from "../src/sim/time";
import type { Save } from "../src/sim/types";
import { hours, recordEvents, standAt, waitUntil } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 1 });

describe("стартові запаси (§6.4)", () => {
  it("6 порцій дешевої їжі й 7 душів дешевих засобів гігієни", () => {
    const save = game();
    expect(save.current.home.supplies).toEqual({
      food: { cheap: 6, premium: 0 },
      hygiene: { cheap: 7, premium: 0 },
      catFood: { cheap: 0, premium: 0 },
      sterileFood: { cheap: 0, premium: 0 },
      litter: { cheap: 0, premium: 0 },
      pills: { cheap: 0, premium: 0 },
      drops: { cheap: 0, premium: 0 },
    });
  });
});

describe("доставка (§6.4)", () => {
  it("коштує 110% базової ціни, округлено", () => {
    expect(deliveryPrice("food", "cheap")).toBe(44);
    expect(deliveryPrice("food", "premium")).toBe(88);
    expect(deliveryPrice("hygiene", "cheap")).toBe(17);
    expect(deliveryPrice("hygiene", "premium")).toBe(39);
  });

  it("пакунок прибуває через 6 годин і чекає під дверима, доки їх не відчинять", () => {
    const save = game();
    const { events, stop } = recordEvents();
    const delivery = order(save.current, "food", "premium");
    expect(delivery?.at).toBe(absoluteMinute(0, hours(12)));
    expect(save.current.character.money).toBe(150 - 88);
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
    expect(supplyCount(save.current, "food")).toBe(6 + 21);
    expect(supplyCount(save.current, "hygiene")).toBe(7 + 14);
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
    expect(save.current.character.money).toBe(150);
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
