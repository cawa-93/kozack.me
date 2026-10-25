// Етап «Їжа й гігієна» (§9.12 «Їжа й гігієна», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як риси їжі, лотка
// й шерсті видно з поведінки — «Апетит», «Швидкість їжі», «Перебірливість», «Жебракування», «Злодійство», «Пиття»,
// «Розкидання наповнювача», «Вибагливість до лотка», «Мітки», «Шерстяні грудки», «Догляд за шерстю», «Любов до води».

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { bowlEaten, eatMinutes, tickCats } from "../src/sim/catai";
import { APPETITE, GULPING } from "../src/sim/config";
import { emptyFeeder } from "../src/sim/household";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  // Персонаж на кухні, біля мисок: бачить, як коти їдять.
  Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 17.5, y: 3.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const bowlOf = (save: Save): BowlItem => {
  const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
  if (!bowl) throw new Error("немає миски");
  return bowl;
};

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Кіт сідає до миски (дві порції дешевого корму) й їсть, поки не скінчить трапезу. */
function meal(save: Save, cat: Cat, food = 2): BowlItem {
  const bowl = bowlOf(save);
  bowl.food = food;
  bowl.foodQuality = "cheap";
  cat.needs.hunger = 90;
  cat.x = 17.5;
  cat.y = 3.5;
  cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0 };
  for (let i = 0; i < 40 && cat.act.kind === "eat"; i++) tickCats(save.current, 0.5, { present: true });
  return bowl;
}

describe("«Апетит» (рішення автора 2026-10-25)", () => {
  it("«Малоїжка» клює пів порції й лишає половину в мисці — її доїдає наступний", () => {
    let nibbled = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { appetite: -2 });
      const bowl = meal(save, cat);
      if (bowl.half !== true) {
        expect(bowl.food, `seed ${seed}`).toBe(1);
        continue;
      }
      nibbled += 1;
      expect(bowl.food).toBe(2);
      expect(cat.needs.hunger).toBeGreaterThan(39);
      expect(cat.needs.hunger).toBeLessThan(42);
      expect(seen(cat, "appetite")).toBe(1);
      // Наступний кіт доїдає надкльовану половинку: порцію знято, але ситий він лише наполовину.
      const next = withCat(save);
      meal(save, next, bowl.food);
      expect(bowl.food).toBe(1);
      expect(bowl.half).toBeUndefined();
      expect(next.needs.hunger).toBeGreaterThan(39);
      expect(next.needs.hunger).toBeLessThan(42);
    }
    expect(nibbled).toBeGreaterThan(15);
    expect(nibbled).toBeLessThan(30);
  });

  it("«Ненаситний» інколи спустошує дві порції за раз, кіт без риси — ніколи", () => {
    let both = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { appetite: 2 });
      const bowl = meal(save, cat);
      if (bowl.food === 0) {
        both += 1;
        expect(seen(cat, "appetite"), `seed ${seed}`).toBe(1);
      } else expect(seen(cat, "appetite"), `seed ${seed}`).toBe(0);
      const plain = game();
      plain.current.rng.behavior = seed;
      expect(meal(plain, withCat(plain)).food).toBe(1);
    }
    expect(both).toBeGreaterThan(3);
    expect(both).toBeLessThan(60 * APPETITE.secondMax);
  });

  it("надкльовану половинку годівниця назад у сховище не повертає", () => {
    const save = game();
    const bowl = bowlOf(save);
    Object.assign(bowl, { food: 2, foodQuality: "cheap", half: true });
    const feeder = { slot: bowl.slot, quality: "cheap" as const, food: 3, foodQuality: "cheap" as const, sterile: false };
    const before = save.current.home.supplies.catFood.cheap;
    emptyFeeder(save.current, bowl, feeder);
    expect(save.current.home.supplies.catFood.cheap + (save.current.home.boxes?.catFood?.cheap ?? 0)).toBe(before + 4);
    expect(bowl.half).toBeUndefined();
  });
});

describe("«Швидкість їжі» (рішення автора 2026-10-25)", () => {
  it("порція їсться 3 × 0,7^рівень хвилин, від 1,5 до 6", () => {
    const save = game();
    const minutes = (level: number): number => eatMinutes(withCat(save, level === 0 ? {} : { gulping: level as TraitLevel }));
    expect(minutes(0)).toBe(3);
    expect(minutes(1)).toBeCloseTo(2.1);
    expect(minutes(2)).toBe(GULPING.min);
    expect(minutes(-1)).toBeCloseTo(3 / 0.7);
    expect(minutes(-2)).toBe(GULPING.max);
  });

  it("корм меншає поступово, а тривалість трапези — прояв, раз на годину", () => {
    const save = game();
    const cat = withCat(save, { gulping: -2 });
    const bowl = bowlOf(save);
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    cat.needs.hunger = 90;
    cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0 };
    tickCats(save.current, 3, { present: true });
    expect(cat.act.kind).toBe("eat");
    expect(bowlEaten(save.current, bowl)).toBeCloseTo(0.5, 1);
    tickCats(save.current, 3.5, { present: true });
    expect(bowl.food).toBe(1);
    expect(seen(cat, "gulping")).toBe(1);
    meal(save, cat, 2);
    expect(seen(cat, "gulping")).toBe(1);
  });

  it("«Пилосос» зригує частіше, коли поруч їсть інший кіт, і рідше з керамічної миски", () => {
    const vomits = (crowded: boolean, premium: boolean): number => {
      let count = 0;
      for (let seed = 0; seed < 200; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = withCat(save, { gulping: 1 });
        if (premium) bowlOf(save).quality = "premium";
        if (crowded) {
          const other = withCat(save, {}, { x: 16.5, y: 3.5 });
          other.act = { kind: "eat", target: null, goal: null, minutes: 60, elapsed: 0 };
        }
        meal(save, cat, 1);
        count += save.current.home.messes.filter((m) => m.kind === "vomit").length;
      }
      return count;
    };
    const alone = vomits(false, false);
    expect(alone).toBeGreaterThan(20);
    expect(vomits(true, false)).toBeGreaterThan(alone);
    expect(vomits(false, true)).toBeLessThan(alone);
  });
});
