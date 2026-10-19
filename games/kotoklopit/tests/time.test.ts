import { describe, expect, it } from "vitest";

import { TOTAL_DAYS } from "../src/sim/config";
import { formatClock, gameMinutes, isLastDay, isSunday, weekdayOf, weekOf } from "../src/sim/time";
import { hours } from "./helpers";

describe("час", () => {
  it("45 секунд — одна ігрова година (§8)", () => {
    expect(gameMinutes(45)).toBe(60);
    expect(gameMinutes(0.75)).toBe(1);
  });

  it("50 тижнів — 350 днів (§4.2)", () => {
    expect(TOTAL_DAYS).toBe(350);
    expect(weekOf(0)).toBe(1);
    expect(weekOf(6)).toBe(1);
    expect(weekOf(7)).toBe(2);
    expect(weekOf(TOTAL_DAYS - 1)).toBe(50);
    expect(isLastDay(TOTAL_DAYS - 1)).toBe(true);
    expect(isLastDay(TOTAL_DAYS - 2)).toBe(false);
  });

  it("гра починається з понеділка", () => {
    expect(weekdayOf(0)).toBe(0);
    expect(isSunday(6)).toBe(true);
    expect(weekdayOf(7)).toBe(0);
    expect(isSunday(13)).toBe(true);
  });

  it("годинник після півночі показує нову добу", () => {
    expect(formatClock(hours(6))).toBe("06:00");
    expect(formatClock(hours(22.5))).toBe("22:30");
    expect(formatClock(hours(24))).toBe("00:00");
    expect(formatClock(hours(26) + 0.9)).toBe("02:00");
  });
});
