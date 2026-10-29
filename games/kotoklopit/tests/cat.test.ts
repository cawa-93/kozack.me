// Модель кота (§9.1, §9.5–9.6, §7, §9.12): риси, приховані шкали, підсумок дня й тижня.

import { describe, expect, it } from "vitest";

import { ageCat, changeLove, changeMood, closeCatDay, createCat, moodHealth, recordMood, traitLevel } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import { isPositive, TRAIT_GROUPS, traitName } from "../src/sim/traits";
import type { Cat, GameState, TraitLevel } from "../src/sim/types";

const state = (): GameState => newGame({ address: "she", difficulty: "normal", seed: 3 }).current;

function cat(s: GameState, ageWeeks = 3, source: Cat["source"] = "shelter"): Cat {
  return createCat(s, createRng(ageWeeks * 7 + 1), { source, ageWeeks });
}

describe("риси (§9.1, TRAITS.md)", () => {
  it("довідник має щонайменше 50 груп із чотирма назвами й добрим боком", () => {
    expect(TRAIT_GROUPS.length).toBeGreaterThanOrEqual(50);
    for (const group of TRAIT_GROUPS) {
      expect(group.names.every((name) => name.length > 0), group.id).toBe(true);
      expect([1, -1]).toContain(group.good);
    }
  });

  it("риса на доброму боці — позитивна, на протилежному — негативна", () => {
    expect(isPositive({ group: "affection", level: 2 })).toBe(true);
    expect(isPositive({ group: "energy", level: 2 })).toBe(false);
    expect(traitName({ group: "affection", level: 1 })).toBe("[Ласкавий|Ласкава]");
  });

  it("кількість рис дорівнює віку, з кожної групи щонайбільше одна", () => {
    const s = state();
    for (const age of [0, 1, 3, 5]) {
      const c = cat(s, age);
      expect(c.traits).toHaveLength(age);
      expect(new Set(c.traits.map((t) => t.group)).size).toBe(age);
    }
  });

  it("безпородний має породні «Витривалість» і «Довголіття» +1 (§9.11)", () => {
    const c = cat(state(), 0);
    expect(traitLevel(c, "hardiness")).toBe(1);
    expect(traitLevel(c, "longevity")).toBe(1);
    expect(traitLevel(c, "energy")).toBe(0);
  });

  it("видимі з притулку риси позначено відомими (§9.9)", () => {
    const s = state();
    const c = createCat(s, createRng(5), { source: "shelter", ageWeeks: 4, knownTraits: 2 });
    expect(c.traits.filter((t) => t.known)).toHaveLength(2);
  });
});

describe("стартові шкали (§9.6, §7)", () => {
  it("кіт ззовні — настрій 40, любов 25; народжений удома — 60 і 50", () => {
    const s = state();
    const outside = cat(s, 1, "shelter-forced");
    expect([outside.mood, outside.love, outside.health]).toEqual([40, 25, 100]);
    const born = cat(s, 0, "born");
    expect([born.mood, born.love]).toEqual([60, 50]);
  });
});

describe("настрій і любов (§9.12)", () => {
  it("«Стресостійкість» зменшує втрати настрою, «Образливість» — посилює втрати любові", () => {
    const s = state();
    const calm = cat(s, 0);
    calm.traits.push({ group: "stress", level: 2, seen: 0, known: false });
    changeMood(s, calm, -10);
    expect(calm.mood).toBeCloseTo(34);
    const touchy = cat(s, 0);
    touchy.traits.push({ group: "touchy", level: 2, seen: 0, known: false });
    changeLove(s, touchy, -2);
    expect(touchy.love).toBeCloseTo(22);
  });
});

describe("підсумок дня (§9.6, §7)", () => {
  it("здоров'я за день від середнього настрою: таблиця §9.6", () => {
    expect([0, 5, 10, 15, 20, 25, 50, 75, 80, 85, 90, 95, 100].map(moodHealth)).toEqual([
      -10, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 10,
    ]);
  });

  it("середній настрій — за часом; без взаємодії любов −1; дрейф від любові", () => {
    const s = state();
    const c = cat(s, 3);
    c.traits = [];
    // Кіт уже звик: у дні адаптації день без взаємодії любові не забирає (загальна ревізія 2026-10-29).
    c.arrivedDay = -10;
    c.mood = 20;
    recordMood(c, 60);
    c.mood = 80;
    recordMood(c, 180);
    c.love = 100;
    const day = closeCatDay(s, c);
    expect(day.mood).toBeCloseTo(65);
    expect(c.moodHistory).toEqual([65]);
    // Любов 100 → 99 без взаємодії, дрейф (99 − 50) × 0,06; за настрою 80 приріст — ×(100 − 80) / 50 (§9.6, поріг 50 — 2026-10-27).
    expect(c.love).toBeCloseTo(99);
    expect(c.mood).toBeCloseTo(80 + 49 * 0.06 * 0.4);
  });

  it("дні адаптації любові не забирають: кіт ззовні два дні без дотику — 25, на третій — 24 (§7, §9.6, загальна ревізія 2026-10-29)", () => {
    const s = state();
    const c = cat(s, 10);
    c.traits = [];
    c.breed = ["mixed", "mixed"];
    expect(c.love).toBe(25);
    // Підсумок дня — уночі, коли персонаж лягає спати.
    s.minute = 23 * 60;
    for (let day = 0; day < 2; day++) {
      closeCatDay(s, c);
      s.day += 1;
    }
    expect(c.love).toBe(25);
    closeCatDay(s, c);
    expect(c.love).toBe(24);
  });

  it("що щасливіший кіт, то менше йому дає приємне: вище 50 приріст спадає, втрати — повністю (§9.6, поріг 50 — рішення автора 2026-10-27)", () => {
    const s = state();
    const c = cat(s, 3);
    c.traits = [];
    c.mood = 40;
    changeMood(s, c, 8);
    expect(c.mood).toBeCloseTo(48);
    c.mood = 75;
    changeMood(s, c, 8);
    expect(c.mood).toBeCloseTo(79);
    c.mood = 90;
    changeMood(s, c, 10);
    expect(c.mood).toBeCloseTo(92);
    changeMood(s, c, -8);
    expect(c.mood).toBeCloseTo(84);
  });

  it("відновлення здоров'я множиться на вік, шкода — ні (§9.5)", () => {
    const s = state();
    const kitten = cat(s, 1);
    kitten.traits = [];
    kitten.health = 50;
    kitten.mood = 100;
    closeCatDay(s, kitten);
    // Безпородний — «Витривалість» +1 від породи, а вона з 2026-10-29 множить і відновлення: ×1,2 (А16).
    expect(kitten.health).toBeCloseTo(50 + 10 * 1.5 * 1.2);
    const sad = cat(s, 1);
    sad.mood = 0;
    closeCatDay(s, sad);
    expect(sad.health).toBe(90);
    expect(sad.healthLog).toEqual([{ day: 0, source: "mood", amount: 10 }]);
  });

  it("«Витривалість» множить і відновлення здоров'я — ±20% за одиницю, разом із породою (сюди злито «Одужання», рішення автора 2026-10-29, А16)", () => {
    const s = state();
    const recovered = (level: TraitLevel | 0): number => {
      const c = cat(s, 3);
      c.traits = level === 0 ? [] : [{ group: "hardiness", level, seen: 0, known: false }];
      // Безпородний: «Витривалість» +1 від породи.
      c.breed = ["mixed", "mixed"];
      c.health = 50;
      c.mood = 100;
      closeCatDay(s, c);
      return c.health - 50;
    };
    expect(recovered(0)).toBeCloseTo(10 * 1.2);
    expect(recovered(2)).toBeCloseTo(10 * 1.6);
    expect(recovered(-2)).toBeCloseTo(10 * 0.8);
  });
});

describe("щотижнева риса (§9.1)", () => {
  it("вік +1, і знак нової риси — за середнім настроєм тижня", () => {
    const s = state();
    const happy = cat(s, 2);
    happy.moodHistory = [100, 100, 100];
    ageCat(s, happy, createRng(9));
    expect(happy.ageWeeks).toBe(3);
    expect(happy.traits).toHaveLength(3);
    expect(isPositive(happy.traits[2] ?? { group: "energy", level: 1 })).toBe(true);
    const sad = cat(s, 2);
    sad.moodHistory = [0, 0];
    ageCat(s, sad, createRng(9));
    expect(isPositive(sad.traits[2] ?? { group: "energy", level: -1 })).toBe(false);
  });
});
