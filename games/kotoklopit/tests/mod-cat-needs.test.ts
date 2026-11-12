// Модифікатори потреб котів (§4.1, `DAY_MODIFIERS.md`): «Коти-липучки ↔ Котячі справи», «Осінній апетит ↔ Котяча дієта»,
// «Линька ↔ Зимове хутро».

import { describe, expect, it } from "vitest";

import { createCat, idleAct, weightOf } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { MODIFIERS, NEED_PER_HOUR, WEIGHT } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { furPerHour, tickHousehold } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";
import { bodyMinutes, hours, withCatCorner } from "./helpers";

function game(day: string | null = null, week: string | null = null): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = day;
  save.current.modifiers.week = week;
  save.current.day = 8;
  save.current.minute = hours(14);
  return save;
}

function withCat(save: Save, at = { x: 4.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 20, at });
  cat.traits = [];
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  cat.shape.coat = null;
  cat.genes.short = [true, true];
  addCat(save.current, cat);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  return cat;
}

/** Прожити стільки хвилин котячого життя чвертями хвилини; `keep` — що лишити як є, решту потреб тримати на нулі. */
function live(save: Save, cat: Cat, minutes: number, present: boolean, keep: readonly string[] = []): void {
  for (let t = 0; t < minutes; t += 0.25) {
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present });
    for (const need of ["hunger", "thirst", "toilet", "fatigue", "attention", "play"] as const) if (!keep.includes(need)) cat.needs[need] = 0;
  }
}

/** На скільки виросла потреба за годину в цей модифікатор. */
function growth(need: "hunger" | "attention", day: string | null, week: string | null): number {
  const save = game(day, week);
  const cat = withCat(save);
  const before = cat.needs[need];
  live(save, cat, 60, false, [need]);
  return cat.needs[need] - before;
}

describe("«Коти-липучки ↔ Котячі справи» (§4.1)", () => {
  it("потреба уваги росте × `MODIFIERS.attention`", () => {
    const usual = growth("attention", null, null);
    expect(usual).toBeCloseTo(NEED_PER_HOUR.attention);
    expect(growth("attention", "clingy-cats", null) / usual).toBeCloseTo(MODIFIERS.attention["clingy-cats"]!);
    expect(growth("attention", "cat-business", null) / usual).toBeCloseTo(MODIFIERS.attention["cat-business"]!);
    // Тижневий голод на увагу не впливає.
    expect(growth("attention", null, "autumn-appetite")).toBeCloseTo(usual);
  });

  it("по ласку кіт приходить раніше в «Котів-липучок» і пізніше в «Котячі справи»", () => {
    const firstVisit = (day: string | null): number => {
      const save = game(day);
      const cat = withCat(save);
      save.current.minute = hours(9);
      for (let minute = 0; minute < hours(14); minute += 0.25) {
        live(save, cat, 0.25, true, ["attention"]);
        if (cat.act.kind === "attention") return minute;
      }
      return Infinity;
    };
    const usual = firstVisit(null);
    const clingy = firstVisit("clingy-cats");
    const busy = firstVisit("cat-business");
    expect(usual).toBeLessThan(Infinity);
    expect(busy).toBeLessThan(Infinity);
    expect(clingy).toBeLessThan(usual - hours(1));
    expect(busy).toBeGreaterThan(usual + hours(2));
  });
});

describe("«Осінній апетит ↔ Котяча дієта» (§4.1)", () => {
  it("голод котів росте × `MODIFIERS.week.appetite`", () => {
    const usual = growth("hunger", null, null);
    expect(usual).toBeCloseTo(NEED_PER_HOUR.hunger);
    expect(growth("hunger", null, "autumn-appetite") / usual).toBeCloseTo(MODIFIERS.week.appetite["autumn-appetite"]!);
    expect(growth("hunger", null, "cat-diet") / usual).toBeCloseTo(MODIFIERS.week.appetite["cat-diet"]!);
    // Денна увага на голод не впливає.
    expect(growth("hunger", "clingy-cats", null)).toBeCloseTo(usual);
  });

  it("у «Котячу дієту» зайва вага йде × `MODIFIERS.week.dietWeight`, в «Осінній апетит» — як завжди", () => {
    const loss = (week: string | null): number => {
      const save = game(null, week);
      const cat = withCat(save);
      cat.weight = 70;
      live(save, cat, 60, false);
      return 70 - weightOf(cat);
    };
    const usual = loss(null);
    expect(usual).toBeCloseTo(WEIGHT.perHour);
    expect(loss("cat-diet") / usual).toBeCloseTo(MODIFIERS.week.dietWeight);
    expect(loss("autumn-appetite")).toBeCloseTo(usual);
  });

  it("у «Котячу дієту» худне лише зайва вага: кіт у нормі нижче норми не схудне", () => {
    const save = game(null, "cat-diet");
    const cat = withCat(save);
    cat.weight = WEIGHT.norm + 0.1;
    live(save, cat, hours(3), false);
    expect(weightOf(cat)).toBe(WEIGHT.norm);
    live(save, cat, hours(3), false);
    expect(weightOf(cat)).toBe(WEIGHT.norm);
    expect(cat.weight).toBeUndefined();
  });
});

describe("«Линька ↔ Зимове хутро» (§4.1)", () => {
  it("шерсть за годину — × `MODIFIERS.week.shedding`; безшерстий не лишає її й у «Линьку»", () => {
    const usual = (() => {
      const save = game();
      return furPerHour(save.current, withCat(save));
    })();
    expect(usual).toBeGreaterThan(0);
    for (const week of ["molting", "winter-coat"]) {
      const save = game(null, week);
      const cat = withCat(save);
      expect(furPerHour(save.current, cat) / usual).toBeCloseTo(MODIFIERS.week.shedding[week]!);
      cat.shape.coat = "hairless";
      expect(furPerHour(save.current, cat)).toBe(0);
    }
  });

  it("шкала шерсті квартири за годину росте × `MODIFIERS.week.shedding`", () => {
    const fur = (week: string | null): number => {
      const save = game(null, week);
      withCat(save);
      save.current.home.fur = 0;
      tickHousehold(save.current, save.current.minute, 60);
      return save.current.home.fur;
    };
    const usual = fur(null);
    expect(usual).toBeGreaterThan(0);
    expect(fur("molting") / usual).toBeCloseTo(MODIFIERS.week.shedding.molting!);
    expect(fur("winter-coat") / usual).toBeCloseTo(MODIFIERS.week.shedding["winter-coat"]!);
  });

  it("шерсть від пестощів — теж × `MODIFIERS.week.shedding`", () => {
    // Менше за `SHEDDING.tuftMinutes`: жмута з руки ще немає, лишається сама шерсть від пестощів і за час.
    const petFur = (week: string | null): number => {
      const save = game(null, week);
      const body = save.current.character.body;
      Object.assign(body, { x: 9.5, y: 8.5, facing: { x: 0, y: -1 } });
      const cat = withCat(save, { x: body.x, y: body.y - 0.6 });
      cat.needs.attention = 60;
      save.current.home.fur = 0;
      for (let i = 0; i < 3; i++) advance(save, bodyMinutes(0.5), { move: { x: 0, y: 0 }, hold: true });
      expect(save.current.character.activity?.kind).toBe("pet");
      return save.current.home.fur;
    };
    const usual = petFur(null);
    expect(usual).toBeGreaterThan(0);
    expect(petFur("molting") / usual).toBeCloseTo(MODIFIERS.week.shedding.molting!);
    expect(petFur("winter-coat") / usual).toBeCloseTo(MODIFIERS.week.shedding["winter-coat"]!);
  });
});
