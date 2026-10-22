// Риси, що раніше лише проявлялися, а тепер діють (ревізія 2026-10-22, `TRAITS.md`):
// «Балакучість», «Хвостик», «Жебракування», «Мітки».

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
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
