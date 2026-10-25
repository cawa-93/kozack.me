// Повнота рис (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): кожна група, яку видають котам, або діє й
// проявляється хоча б одним боком, або тиха. Перевіряється за кодом симуляції: ефект — `traitLevel`,
// `traitFactor` чи `characterLevel` з назвою групи, прояв — `observe` з назвою групи й боком.

import { describe, expect, it } from "vitest";

import { TRAIT_GROUPS } from "../src/sim/traits";

const sources = Object.values(
  import.meta.glob<string>("../src/sim/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
).join("\n");

/**
 * Групи, які ще не доведено до критерію: без ефекту або без жодного прояву. Тимчасовий список — наступні етапи
 * реалізації розбору скорочують його до порожнього. Готову групу тест проганяє з цього списку.
 */
const PENDING: ReadonlySet<string> = new Set([
  // Діють, але прояву ще немає.
  "touchy",
  "devotion",
  "shedding",
  "guests",
  "warmth",
  // Ще не реалізовано.
  "drinking",
  "chewing",
  "climbing",
  "hunting",
  "gifts",
  "ambush",
  "cunning",
  "catnip",
  "window",
  "obedience",
  "nurturing",
  "chubby",
]);

/** Групи, які щось змінюють у симуляції. */
const effects = new Set([...sources.matchAll(/\b(?:traitLevel|traitFactor|characterLevel)\(\s*[\w.]+,\s*"(\w+)"/g)].map((m) => m[1]));

/** Боки, якими група проявляється: без аргументу чи 1 — «+», −1 — «−», вираз — обидва. */
const observed = new Map<string, Set<1 | -1>>();
for (const [, group, side] of sources.matchAll(/\bobserve\(\s*state,\s*[\w.]+,\s*"(\w+)"(?:,\s*([^,)]+))?/g)) {
  if (!group) continue;
  const sides = observed.get(group) ?? new Set<1 | -1>();
  const text = side?.trim() ?? "1";
  if (text === "1") sides.add(1);
  else if (text === "-1") sides.add(-1);
  else {
    sides.add(1);
    sides.add(-1);
  }
  observed.set(group, sides);
}

describe("повнота рис (рішення автора 2026-10-25)", () => {
  it("тест бачить ефекти й прояви в коді", () => {
    expect(effects.has("energy")).toBe(true);
    expect([...(observed.get("scratching") ?? [])].sort()).toEqual([-1, 1]);
    expect([...(observed.get("water") ?? [])].sort()).toEqual([-1, 1]);
    expect(observed.get("nocturnal")?.has(1)).toBe(true);
  });

  it("кожна видавана група діє й проявляється хоча б одним боком, або тиха", () => {
    for (const group of TRAIT_GROUPS) {
      const sides = observed.get(group.id) ?? new Set();
      if (group.quiet) {
        expect(effects.has(group.id), `${group.id}: тиха, але без ефекту`).toBe(true);
        expect(sides.size, `${group.id}: тиха, але проявляється`).toBe(0);
        continue;
      }
      if (PENDING.has(group.id)) {
        expect(effects.has(group.id) && sides.size > 0, `${group.id} уже діє й проявляється — приберіть її з PENDING`).toBe(false);
        continue;
      }
      expect(effects.has(group.id), `${group.id}: немає ефекту`).toBe(true);
      expect(sides.size, `${group.id}: немає прояву`).toBeGreaterThan(0);
    }
  });

  it("у кожного боку своя підказка; тиха половина без підказки не проявляється", () => {
    for (const group of TRAIT_GROUPS) {
      if (group.quiet) {
        expect(group.signs, group.id).toBeUndefined();
        continue;
      }
      const [plus, minus] = group.signs ?? [null, null];
      expect(plus !== null || minus !== null, `${group.id}: немає підказок`).toBe(true);
      if (plus !== null && minus !== null) expect(plus, group.id).not.toBe(minus);
      const sides = observed.get(group.id) ?? new Set();
      if (plus === null) expect(sides.has(1), `${group.id}: «+» проявляється, а підказки немає`).toBe(false);
      if (minus === null) expect(sides.has(-1), `${group.id}: «−» проявляється, а підказки немає`).toBe(false);
    }
  });

  it("у PENDING — лише справжні групи", () => {
    for (const id of PENDING) expect(TRAIT_GROUPS.some((g) => g.id === id), id).toBe(true);
  });
});
