// Повнота рис (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): кожна група, яку видають котам, або діє й
// проявляється хоча б одним боком, або тиха. Перевіряється за кодом симуляції: ефект — `traitLevel`,
// `traitFactor` чи `characterLevel` з назвою групи, прояв — `observe` з назвою групи й боком. Тимчасового списку недоведених груп
// (PENDING) більше немає: етап «Тіло й завершення» (2026-10-26) довів до критерію останню — «Схильність до повноти».

import { describe, expect, it } from "vitest";

import { TRAIT_GROUPS } from "../src/sim/traits";
import { TRAIT_ABOUT_LEVEL, TRAIT_HINTS } from "../src/texts";

const sources = Object.values(
  import.meta.glob<string>("../src/sim/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
).join("\n");

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
      expect(effects.has(group.id), `${group.id}: немає ефекту`).toBe(true);
      expect(sides.size, `${group.id}: немає прояву`).toBeGreaterThan(0);
    }
  });

  it("видимий бік (`shows`) — той, що проявляється; у нетихої групи — одна підказка, у тихої — ні", () => {
    for (const group of TRAIT_GROUPS) {
      if (group.quiet) {
        expect(group.shows, group.id).toBeUndefined();
        expect(TRAIT_HINTS[group.id], group.id).toBeUndefined();
        continue;
      }
      const [plus, minus] = group.shows ?? [false, false];
      expect(plus || minus, `${group.id}: не видно жодного боку`).toBe(true);
      expect(TRAIT_HINTS[group.id], `${group.id}: немає підказки`).toBeTruthy();
      // Бік, що не проявляється, підказки не дає: вона ніколи не з'явилася б у картці; і навпаки.
      const sides = observed.get(group.id) ?? new Set();
      expect(sides.has(1), `${group.id}: «+» — видно ${plus}, а проявляється ${sides.has(1)}`).toBe(plus);
      expect(sides.has(-1), `${group.id}: «−» — видно ${minus}, а проявляється ${sides.has(-1)}`).toBe(minus);
    }
  });

  it("окремі описи рівнів — лише для наявних груп і рівнів", () => {
    for (const [id, levels] of Object.entries(TRAIT_ABOUT_LEVEL)) {
      expect(TRAIT_GROUPS.some((g) => g.id === id), id).toBe(true);
      for (const key of Object.keys(levels)) expect([2, 1, -1, -2], id).toContain(Number(key));
    }
  });
});
