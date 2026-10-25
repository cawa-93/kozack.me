// Риси, що раніше лише проявлялися, а тепер діють (ревізія 2026-10-22, `TRAITS.md`):
// «Балакучість», «Хвостик», «Жебракування», «Мітки»; «Хвостик» і «Вимогливість» — різне (2026-10-25).

import { describe, expect, it } from "vitest";

import { rubbingCat } from "../src/sim/body";
import { createCat } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.minute = 12 * 60;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: 4.5, y: 8.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

const attention = (cat: Cat): void => {
  cat.needs.attention = 90;
  cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0 };
};

describe("риси, що діють (ревізія 2026-10-22)", () => {
  it("«Балакучість»: тихоня мовчить, оперний співак нявкає частіше", () => {
    const meows = (level: TraitLevel | 0): number => {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { talkative: level });
      attention(cat);
      const { events, stop } = recordEvents();
      for (let i = 0; i < 10; i++) tickCats(save.current, 1, { present: true });
      stop();
      return events.filter((e) => e.type === "meow" && e.cat === cat.id).length;
    };
    expect(meows(-2)).toBe(0);
    expect(meows(2)).toBeGreaterThan(meows(0));
  });

  it("«Хвостик»: кіт «сам по собі» не ходить слідом", () => {
    const save = game();
    const cat = withCat(save, { follower: -1 });
    attention(cat);
    save.current.character.body.x = 15.5;
    save.current.character.body.y = 8.5;
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.goal).toBeNull();
    const other = withCat(save);
    attention(other);
    tickCats(save.current, 0.1, { present: true });
    expect(other.act.goal).not.toBeNull();
  });

  it("тривалість походу по увагу — лише «Вимогливість», «Хвостик» її не змінює (рішення автора 2026-10-25)", () => {
    const minutes = (traits: Record<string, TraitLevel>): number => {
      const save = game();
      const cat = withCat(save, traits);
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
      decide(save.current, cat, createRng(1), { present: true });
      return cat.act.kind === "attention" ? cat.act.minutes : 0;
    };
    expect(minutes({})).toBeCloseTo(20);
    expect(minutes({ follower: 2 })).toBeCloseTo(20);
    expect(minutes({ demanding: 2 })).toBeCloseTo(30);
    expect(minutes({ follower: 2, demanding: 2 })).toBeCloseTo(30);
  });

  it("«Хвостик +» іде за вами в іншу кімнату — це прояв; кіт без риси лишається", () => {
    let followed = 0;
    for (let seed = 0; seed < 20; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
      const shadow = withCat(save, { follower: 2 });
      const plain = withCat(save);
      for (const [cat, x] of [[shadow, 10.5], [plain, 11.5]] as const) {
        Object.assign(cat, { x, y: 7.5 });
        cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
        cat.act = { kind: "idle", target: null, goal: null, minutes: 60, elapsed: 0 };
      }
      tickCats(save.current, 0.1, { present: true });
      // Персонаж пішов у ванну.
      Object.assign(save.current.character.body, { x: 10.5, y: 2.5 });
      tickCats(save.current, 0.1, { present: true });
      expect(plain.act.kind).toBe("idle");
      if (shadow.act.kind !== "follow") continue;
      followed += 1;
      for (let i = 0; i < 20; i++) tickCats(save.current, 0.1, { present: true });
      expect(shadow.y, `seed ${seed}`).toBeLessThan(5);
      expect(shadow.traits[0]?.seen, `seed ${seed}`).toBe(1);
      // Поруч — під ногами, як і кіт, що просить уваги.
      expect(rubbingCat(save.current)?.id).toBe(shadow.id);
    }
    expect(followed).toBeGreaterThan(3);
    expect(followed).toBeLessThan(18);
  });

  it("«Сам по собі» доходить лише до межі своєї кімнати й чекає там; ви повернулися — прояв", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 16.5, y: 2.5 });
    const cat = withCat(save, { follower: -1 });
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
    decide(save.current, cat, createRng(1), { present: true });
    // Біля дверей на кухню (прохід — x 15–16), а не біля найближчої до персонажа стіни (перевірка 2026-10-25).
    expect(cat.act.goal?.y).toBe(6);
    expect([15, 16]).toContain(cat.act.goal?.x);
    for (let i = 0; i < 100; i++) tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("attention");
    expect(Math.floor(cat.y)).toBe(6);
    expect(cat.traits[0]?.seen).toBe(0);
    Object.assign(save.current.character.body, { x: cat.x + 0.8, y: cat.y });
    tickCats(save.current, 0.1, { present: true });
    expect(cat.traits[0]?.seen).toBe(1);
  });

  it("«Сам по собі» з кухні кличе до спальні від дверей кухні, а не від стіни (перевірка 2026-10-25)", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 3.5, y: 2.5 });
    const cat = withCat(save, { follower: -2 });
    Object.assign(cat, { x: 17.5, y: 1.5 });
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).toBe("attention");
    // Остання клітинка кухні на шляху до спальні — біля проходу внизу кухні (y 4), не біля стіни з ванною (x 13).
    expect(cat.act.goal?.y).toBe(4);
    expect([15, 16]).toContain(cat.act.goal?.x);
  });

  it("«Хвостик +»: ви вийшли й одразу повернулися в кімнату кота — це ще не прояв (перевірка 2026-10-25)", () => {
    let followed = 0;
    for (let seed = 0; seed < 20; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
      const shadow = withCat(save, { follower: 2 });
      Object.assign(shadow, { x: 4.5, y: 9.5 });
      shadow.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      shadow.act = { kind: "idle", target: null, goal: null, minutes: 60, elapsed: 0 };
      tickCats(save.current, 0.1, { present: true });
      // Персонаж зазирнув у ванну й повернувся до вітальні, а кіт ще не дійшов до дверей.
      Object.assign(save.current.character.body, { x: 10.5, y: 2.5 });
      tickCats(save.current, 0.1, { present: true });
      if (shadow.act.kind !== "follow") continue;
      followed += 1;
      Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
      for (let i = 0; i < 20; i++) tickCats(save.current, 0.1, { present: true });
      expect(shadow.traits[0]?.seen, `seed ${seed}`).toBe(0);
    }
    expect(followed).toBeGreaterThan(3);
  });

  it("«Жебракування»: щойно поїв — уже просить ще біля миски", () => {
    let begged = 0;
    for (let seed = 0; seed < 40; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { begging: 2 });
      const bowl = save.current.home.items.find((i) => i.kind === "bowl");
      if (bowl?.kind !== "bowl") throw new Error("немає миски");
      bowl.food = 1;
      bowl.foodQuality = "cheap";
      cat.needs.hunger = 90;
      cat.x = 17.5;
      cat.y = 3.5;
      cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.05, elapsed: 0 };
      tickCats(save.current, 0.1, { present: true });
      if (cat.act.kind === "beg") begged += 1;
    }
    expect(begged).toBeGreaterThan(10);
    expect(begged).toBeLessThan(40);
  });

  it("«Мітки»: схильна до міток кішка мітить і стерилізована, коли їй погано; «Ніколи не мітить» — ніколи", () => {
    const marks = (traits: Record<string, TraitLevel>, sex: "male" | "female", sterilized: boolean, mood: number): number => {
      const save = game();
      const cat = withCat(save, traits);
      cat.sex = sex;
      cat.sterilized = sterilized;
      cat.mood = mood;
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      let count = 0;
      for (let i = 0; i < 24 * 60; i++) {
        cat.mood = mood;
        cat.needs.fatigue = 0;
        tickCats(save.current, 1, { present: false });
        count = save.current.home.messes.filter((m) => m.kind === "mark").length;
      }
      return count;
    };
    expect(marks({ marking: 2 }, "female", true, 10)).toBeGreaterThan(0);
    expect(marks({}, "female", true, 10)).toBe(0);
    expect(marks({ marking: -2 }, "male", false, 50)).toBe(0);
  });
});
