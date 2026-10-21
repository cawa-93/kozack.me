// Розклад в інтерфейсі (§8.4): кур'єр — один рядок, події — за часом.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { absoluteMinute } from "../src/sim/time";
import { scheduleOf } from "../src/view/schedule";

describe("розклад дня (§8.4)", () => {
  it("кілька замовлень у дорозі — один рядок кур'єра з найближчим часом, за часом серед подій", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.modifiers.day = null;
    state.day = 1;
    state.minute = 8 * 60;
    const today = absoluteMinute(state.day, 0);
    state.home.deliveries.push(
      { id: 1, product: "food", quality: "cheap", at: today + 16 * 60 },
      { id: 2, product: "litter", quality: "cheap", at: today + 9 * 60 + 30 },
      { id: 3, product: "food", quality: "premium", at: today + 9 * 60 + 30 },
    );
    const schedule = scheduleOf(state);
    expect(schedule.filter((line) => line.includes("кур'єр"))).toEqual(["≈09:30 кур'єр"]);
    expect(schedule.indexOf("≈09:30 кур'єр")).toBeLessThan(schedule.findIndex((line) => line.includes("летучка")));
  });
});
