// Світло доби (§8.9, рішення автора 2026-11-02): удень нічого, вночі темно й горять лампи (у відключення — свічки), вранці й
// увечері — тепло й сонце у вікнах; без стрибків на межах.

import { describe, expect, it } from "vitest";
import { DAYLIGHT } from "../src/sim/config";
import { candlesLit, daylight, dayMinute, lampsAt, lampsOn, lightKey, type Daylight } from "../src/view/light/daylight";

const at = (h: number, m = 0, power = true): Daylight | null => daylight(h * 60 + m, power);

describe("світло доби", () => {
  it("удень (09:30–18:00) світла доби немає зовсім", () => {
    for (let m = DAYLIGHT.morningEnd; m < DAYLIGHT.eveningStart; m += 7) {
      expect(daylight(m, true)).toBeNull();
      expect(daylight(m, false)).toBeNull();
    }
    expect(lightKey(daylight(12 * 60, true))).toBe("day");
  });

  it("хвилина доби нормалізується: після півночі в сови (1530) — те саме, що 01:30", () => {
    expect(dayMinute(1530)).toBe(90);
    expect(dayMinute(-30)).toBe(1410);
    expect(daylight(1530, true)).toEqual(daylight(90, true));
  });

  it("уночі глуха темрява й горять лампи", () => {
    for (const d of [at(23), at(1, 30), at(4, 30)]) {
      expect(d?.phase).toBe("night");
      expect(d?.dark).toBe(1);
      expect(d?.lamps).toBe(1);
      expect(d?.candles).toBe(0);
      expect(d?.sun).toBeNull();
      expect(lampsOn(d)).toBe(true);
    }
  });

  it("лампи вмикаються близько 20:00 і гаснуть близько 06:30", () => {
    expect(lampsOn(at(19, 40))).toBe(false);
    expect(lampsOn(at(20, 10))).toBe(true);
    expect(lampsOn(at(6, 20))).toBe(true);
    expect(lampsOn(at(6, 45))).toBe(false);
  });

  it("у відключення ламп немає — замість них свічки, у ті самі години", () => {
    for (let m = 0; m < 1440; m += 11) {
      const on = daylight(m, true);
      const off = daylight(m, false);
      if (!on) {
        expect(off).toBeNull();
        continue;
      }
      expect(off?.lamps).toBe(0);
      expect(off?.candles).toBeCloseTo(on.lamps, 9);
      expect(candlesLit(off)).toBe(lampsOn(on));
      expect(off?.dark).toBe(on.dark);
    }
  });

  it("вранці сонце світить у вікна стіни y = 0 і піднімається, увечері — у вікно x = 0 і сідає", () => {
    const m1 = at(6, 45)?.sun;
    const m2 = at(8, 30)?.sun;
    expect(m1?.wall).toBe("y");
    expect(m2?.wall).toBe("y");
    expect(m2!.elevation).toBeGreaterThan(m1!.elevation);
    const e1 = at(18, 45)?.sun;
    const e2 = at(19, 45)?.sun;
    expect(e1?.wall).toBe("x");
    expect(e2!.elevation).toBeLessThan(e1!.elevation);
    expect(at(22)?.sun).toBeNull();
  });

  it("тепло й темрява: ранок і вечір теплі, темрява сходить уранці й густішає ввечері", () => {
    expect(at(7)!.warm).toBe(1);
    expect(at(19, 30)!.warm).toBe(1);
    let prev = 2;
    for (let m = DAYLIGHT.dawn; m < DAYLIGHT.morningEnd; m += 5) {
      const d = daylight(m, true)!;
      expect(d.phase).toBe("morning");
      expect(d.dark).toBeLessThanOrEqual(prev);
      prev = d.dark;
    }
    prev = -1;
    for (let m = DAYLIGHT.eveningStart; m < DAYLIGHT.night; m += 5) {
      const d = daylight(m, true)!;
      expect(d.phase).toBe("evening");
      expect(d.dark).toBeGreaterThanOrEqual(prev);
      prev = d.dark;
    }
  });

  it("без стрибків: сусідні хвилини поруч, а на межах дня все прямує до нуля", () => {
    const parts = (d: Daylight | null): number[] =>
      d ? [d.dark, d.warm, d.lamps, d.candles, d.sun?.strength ?? 0] : [0, 0, 0, 0, 0];
    for (let m = 0; m < 1440; m += 0.5) {
      const a = parts(daylight(m, true));
      const b = parts(daylight(m + 0.5, true));
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.08);
    }
  });

  it("лампи доби без усього світла доби (`lampsAt`) — рівно `daylight(…, true).lamps`, удень — 0", () => {
    for (let minute = -60; minute <= 1600; minute += 0.25) expect(lampsAt(minute), `${minute}`).toBe(daylight(minute, true)?.lamps ?? 0);
  });
});
