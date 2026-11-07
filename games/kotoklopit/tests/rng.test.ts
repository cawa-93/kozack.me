import { describe, expect, it } from "vitest";

import { createRng, deriveSeed, streamSeed } from "../src/sim/rng";

const draw = (seed: number, count = 20): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe("випадковість", () => {
  it("той самий seed дає ту саму послідовність", () => {
    expect(draw(42)).toEqual(draw(42));
  });

  it("різні seed дають різні послідовності", () => {
    expect(draw(42)).not.toEqual(draw(43));
  });

  it("числа лежать у межах", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const roll = rng.int(1, 6);
      expect(Number.isInteger(roll)).toBe(true);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });

  it("chance приблизно дотримується ймовірності", () => {
    const rng = createRng(99);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
  });

  it("зерно залежить від кожної частини", () => {
    expect(deriveSeed(1, 2, 3)).toBe(deriveSeed(1, 2, 3));
    expect(deriveSeed(1, 2, 3)).not.toBe(deriveSeed(1, 2, 4));
    expect(deriveSeed(1, 2, 3)).not.toBe(deriveSeed(3, 2, 1));
  });

  it("умови й ніч не залежать від перегравань, поведінка — залежить (§6.1)", () => {
    expect(streamSeed(1, "conditions", 5, 0)).toBe(streamSeed(1, "conditions", 5, 3));
    expect(streamSeed(1, "night", 5, 0)).toBe(streamSeed(1, "night", 5, 3));
    expect(streamSeed(1, "behavior", 5, 0)).not.toBe(streamSeed(1, "behavior", 5, 1));
    expect(streamSeed(1, "conditions", 5)).not.toBe(streamSeed(1, "conditions", 6));
    expect(streamSeed(1, "conditions", 5)).not.toBe(streamSeed(1, "night", 5));
  });
});
