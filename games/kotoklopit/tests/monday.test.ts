// Критерій готовності кроку 5 плану: понеділок без котів від пробудження до сну,
// і ввечері здоровий глузд опускається до порогу першого кошеняти (§8.3).

import { describe, expect, it } from "vitest";

import { order } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import { canGoToSleep } from "../src/sim/sleep";
import type { Save, Sex } from "../src/sim/types";
import { holdUntilDone, hours, recordEvents, waitUntil, walkTo } from "./helpers";

const cook = (save: Save): void => {
  walkTo(save, "fridge");
  interact(save);
  walkTo(save, "stove");
  interact(save);
};

const eat = (save: Save): void => {
  walkTo(save, "stove");
  while (save.current.home.stove.item?.kind !== "meal") advance(save, 1);
  interact(save);
  walkTo(save, "table");
  interact(save);
  holdUntilDone(save);
};

const workUntil = (save: Save, minute: number): void => {
  walkTo(save, "computer");
  interact(save);
  waitUntil(save, minute);
  interact(save);
};

describe("понеділок без котів (§8.3)", () => {
  for (const sex of ["female", "male"] as const satisfies readonly Sex[]) {
    it(`${sex === "female" ? "жайворонок" : "сова"} проживає понеділок, і ввечері приходить перше кошеня`, () => {
      const save = newGame({ sex, difficulty: "normal", seed: 7 });
      const { events, stop } = recordEvents();

      cook(save);
      walkTo(save, "shower");
      interact(save);
      advance(save, 11);
      eat(save);
      expect(order(save.current, "food", "cheap")).not.toBeNull();
      workUntil(save, hours(12.5));

      cook(save);
      eat(save);
      workUntil(save, hours(15));

      // Доставка, замовлена зранку, уже під дверима; з ящиків біля входу — у холодильник.
      waitUntil(save, hours(18));
      walkTo(save, "door");
      interact(save);
      walkTo(save, "boxes");
      interact(save);
      cook(save);
      eat(save);
      while (!canGoToSleep(save.current)) advance(save, 10);
      walkTo(save, "bed");
      const night = interact(save);
      stop();

      expect(save.current.end).toBeNull();
      expect(night).not.toBeNull();
      expect(night?.sanityEvening).toBeLessThan(35);
      expect(night?.sanityEvening).toBeGreaterThanOrEqual(1);
      expect(night?.newCats).toHaveLength(1);
      expect(save.current.cats).toHaveLength(1);
      expect(save.current.day).toBe(1);
      expect(night?.sanityMorning).toBeCloseTo((night?.sanityEvening ?? 0) + 50);

      // Персонаж поїв тричі, помився й забрав доставку.
      expect(events.filter((e) => e.type === "ate")).toHaveLength(3);
      expect(events.some((e) => e.type === "showered")).toBe(true);
      expect(events.some((e) => e.type === "received")).toBe(true);
      expect(save.current.home.supplies.food.cheap).toBe(6 - 3 + 20);
      // Працював досить, щоб керівництво не дійшло до «Х», і встиг на летучку.
      expect(events).not.toContainEqual({ type: "patience", level: "out" });
      expect(events.some((e) => e.type === "standup" && e.attended)).toBe(true);
      // Їжа доставкою — 40, доставка 4 + 10 (§6.4).
      expect(save.current.character.money).toBeGreaterThan(150 - 54 + 50);
      const { stats } = save.current.character;
      expect(Math.min(stats.health, stats.satiety, stats.hygiene)).toBeGreaterThan(25);
    });
  }
});
