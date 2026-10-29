// Титулка дня (§4, §8.8): що бачить гравець уранці.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { NightReport } from "../src/sim/types";
import { dayTitle } from "../src/ui/cards";

describe("титулка дня (§4)", () => {
  it("хто будив уночі — по рядку на кота, у роді кота", () => {
    const { current: state } = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const tom = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    const queen = createCat(state, createRng(2), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    Object.assign(tom, { name: "Мурчик", sex: "male" });
    Object.assign(queen, { name: "Мурка", sex: "female" });
    addCat(state, tom);
    addCat(state, queen);
    state.day = 1;
    const night = {
      wakeUps: [
        { cat: tom.id, reason: "night" },
        { cat: tom.id, reason: "night" },
        { cat: queen.id, reason: "morning" },
      ],
      newCats: [],
      givenCats: [],
      lostCats: [],
      utilities: null,
    } as unknown as NightReport;
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    expect(lines.filter((l) => l === "Мурчик не давав спати вночі.")).toHaveLength(1);
    expect(lines).toContain("Мурка вимагала сніданку о 05:00.");
  });

  it("у понеділок — гроші за тиждень: заробили, витратили й категорії від найбільшої, без порожніх (рішення автора 2026-10-27, Е4)", () => {
    const { current: state } = newGame({ address: "she", difficulty: "normal", seed: 3 });
    state.day = 7;
    const night = {
      wakeUps: [],
      newCats: [],
      givenCats: [],
      lostCats: [],
      utilities: { outcome: "paid", paid: 40, nextDue: 0 },
      ledger: { earned: 245.4, spent: { supplies: 210, delivery: 97, utilities: 40, health: 0 } },
    } as unknown as NightReport;
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    const at = lines.indexOf("Гроші за тиждень");
    expect(lines[at - 1]).toBe("Комунальні: −40 ₴.");
    expect(lines[at + 1]).toBe("Заробили 245 ₴, витратили 347 ₴.");
    expect(lines[at + 2]).toBe("Корм і запаси — 210 ₴; доставка — 97 ₴; комунальні — 40 ₴.");
    // У будні підсумку немає.
    const weekday = dayTitle(state, { ...night, utilities: null, ledger: null }).flatMap((s) => s.blocks.flat());
    expect(weekday).not.toContain("Гроші за тиждень");
  });
});
