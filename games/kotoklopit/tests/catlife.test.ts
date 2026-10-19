// Розпорядок і потреби котів, догляд персонажа, ніч із котами, кошеня й «Пригніченість»
// (§6.2, §8.8, §9.3, §9.12).

import { describe, expect, it } from "vitest";

import { petTolerance } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { activityAt, decide, isDirty, tickCats } from "../src/sim/catai";
import { changeStat } from "../src/sim/character";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, LitterItem, Save, WaterItem } from "../src/sim/types";
import { holdUntilDone, hours, recordEvents, walkTo } from "./helpers";

function game(): Save {
  const save = newGame({ sex: "female", difficulty: "normal", seed: 11 });
  save.current.modifiers.day = null;
  return save;
}

function withCat(save: Save, place?: { x: number; y: number }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at: place ?? { x: 4.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

const item = <T>(save: Save, kind: string): T => save.current.home.items.find((i) => i.kind === kind) as T;

/** Прожити хвилини лише котам, без персонажа. */
function live(save: Save, minutes: number, present = false): void {
  for (let i = 0; i < minutes; i++) {
    tickCats(save.current, 1, { present });
    save.current.minute += 1;
  }
}

describe("сутінковий ритм (§9.12)", () => {
  it("найактивніші світанок і вечір, удень коти сплять", () => {
    const save = game();
    const cat = withCat(save);
    expect(activityAt(cat, hours(6))).toBe(1);
    expect(activityAt(cat, hours(13))).toBe(0.25);
    expect(activityAt(cat, hours(20))).toBe(1);
    expect(activityAt(cat, hours(2))).toBe(0.3);
    cat.traits.push({ group: "nocturnal", level: 2, seen: 0, known: false });
    expect(activityAt(cat, hours(2))).toBeCloseTo(0.7);
  });
});

describe("їжа, вода й лоток (§9.12)", () => {
  it("голодний кіт іде до миски з кормом і з'їдає порцію", () => {
    const save = game();
    const cat = withCat(save);
    const bowl = item<BowlItem>(save, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "premium";
    cat.needs.hunger = 90;
    decide(save.current, cat, createRng(1), { present: false });
    expect(cat.act.kind).toBe("eat");
    const mood = cat.mood;
    live(save, 30);
    expect(bowl.food).toBe(1);
    expect(cat.needs.hunger).toBeLessThan(10);
    expect(cat.mood).toBeGreaterThan(mood);
  });

  it("з порожньою мискою голодний кіт просить їсти", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.hunger = 95;
    decide(save.current, cat, createRng(2), { present: false });
    expect(cat.act.kind).toBe("beg");
  });

  it("перебірливий кіт відмовляється від дешевого корму (§9.12)", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "picky", level: 2, seen: 0, known: false });
    const bowl = item<BowlItem>(save, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    cat.needs.hunger = 90;
    const { events, stop } = recordEvents();
    decide(save.current, cat, createRng(1), { present: false });
    live(save, 30);
    stop();
    expect(events.some((e) => e.type === "cat-refused-food")).toBe(true);
  });

  it("кіт п'є з миски для води", () => {
    const save = game();
    const cat = withCat(save);
    const water = item<WaterItem>(save, "water");
    cat.needs.thirst = 70;
    decide(save.current, cat, createRng(1), { present: false });
    live(save, 20);
    expect(water.water).toBe(7);
    expect(cat.needs.thirst).toBeLessThan(10);
  });

  it("лоток брудніє після 3 відвідин дешевого наповнювача, у брудний кіт іде неохоче", () => {
    const save = game();
    const cat = withCat(save);
    const box = item<LitterItem>(save, "litter");
    for (let i = 0; i < 3; i++) {
      cat.needs.toilet = 90;
      decide(save.current, cat, createRng(i), { present: false });
      live(save, 15);
    }
    expect(box.uses).toBe(3);
    expect(isDirty(box)).toBe(true);
    const mood = cat.mood;
    cat.needs.toilet = 90;
    decide(save.current, cat, createRng(7), { present: false });
    live(save, 15);
    expect(cat.mood).toBeLessThan(mood);
  });

  it("вибагливий кіт лишає «сюрприз», якщо лоток брудний", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "litterPicky", level: 2, seen: 0, known: false });
    const box = item<LitterItem>(save, "litter");
    box.uses = 3;
    let surprises = 0;
    for (let i = 0; i < 20; i++) {
      cat.needs.toilet = 90;
      decide(save.current, cat, createRng(100 + i), { present: false });
      live(save, 20);
      box.uses = 3;
      surprises = save.current.home.messes.filter((m) => m.kind === "surprise").length;
    }
    expect(surprises).toBeGreaterThan(5);
  });
});

describe("сон і увага (§9.12)", () => {
  it("опівдні втомлений кіт спить і відпочиває", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(12);
    cat.needs.fatigue = 60;
    decide(save.current, cat, createRng(3), { present: false });
    expect(cat.act.kind).toBe("sleep");
    live(save, 6 * 60);
    expect(cat.needs.fatigue).toBeLessThan(40);
  });

  it("коли бракує уваги, кіт іде до персонажа", () => {
    const save = game();
    const cat = withCat(save, { x: 16.5, y: 8.5 });
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.5;
    save.current.minute = hours(19);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 80, play: 0 };
    decide(save.current, cat, createRng(3), { present: true });
    expect(cat.act.kind).toBe("attention");
    live(save, 8, true);
    expect(Math.hypot(cat.x - 4.5, cat.y - 8.5)).toBeLessThan(1.6);
  });
});

describe("догляд персонажа (§9.12)", () => {
  it("корм із шафки — у миску, вода доливається одним натисканням", () => {
    const save = game();
    save.current.home.supplies.catFood.cheap = 5;
    walkTo(save, "cat-cabinet");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "catfood", quality: "cheap" });
    const bowl = item<BowlItem>(save, "bowl");
    walkTo(save, `item:${bowl.id}`);
    interact(save);
    expect(bowl.food).toBe(1);
    expect(save.current.character.held).toBeNull();
    const water = item<WaterItem>(save, "water");
    water.water = 1;
    walkTo(save, `item:${water.id}`);
    interact(save);
    expect(water.water).toBe(8);
  });

  it("чистка лотка: 3 хвилини, −3 здорового глузду, новий наповнювач із запасу", () => {
    const save = game();
    save.current.home.supplies.litter.premium = 2;
    const box = item<LitterItem>(save, "litter");
    box.uses = 4;
    walkTo(save, `item:${box.id}`);
    const sanity = save.current.character.stats.sanity;
    holdUntilDone(save);
    expect(box.uses).toBe(0);
    expect(box.litter).toBe("premium");
    expect(save.current.home.supplies.litter.premium).toBe(1);
    expect(save.current.character.stats.sanity).toBeCloseTo(sanity - 3 * 0.9, 0);
  });

  it("пестощі: здоровий глузд, поки кіт хоче уваги; «Пастка на животику» кусає", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.needs.attention = 90;
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    const sanity = save.current.character.stats.sanity;
    advance(save, 2, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 3);
    expect(cat.interacted).toBe(true);

    cat.traits.push({ group: "petting", level: -2, seen: 0, known: false });
    expect(petTolerance(cat)).toBe(1);
    const { events, stop } = recordEvents();
    advance(save, 3, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.some((e) => e.type === "bite")).toBe(true);
  });

  it("кота беруть на руки й опускають; сонного це ображає", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 100, elapsed: 0 };
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    const love = cat.love;
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "cat", cat: cat.id });
    expect(cat.love).toBeLessThan(love);
    interact(save);
    expect(save.current.character.held).toBeNull();
  });
});

describe("ніч із котами (§4, §8.8, §9.12)", () => {
  it("коти живуть ніч: голод росте, настрій записується за добу", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(22);
    const hunger = cat.needs.hunger;
    goToSleep(save);
    expect(cat.moodHistory).toHaveLength(1);
    expect(save.current.cats[0]?.needs.hunger ?? 0).toBeGreaterThan(hunger);
  });

  it("«Живий будильник» з порожньою мискою будить о 05:00 — день починається раніше", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "morning", level: 2, seen: 0, known: false });
    cat.needs.hunger = 70;
    save.current.minute = hours(22);
    let woke = false;
    for (let seed = 0; seed < 10 && !woke; seed++) {
      const copy = structuredClone(save);
      copy.current.seed = seed;
      const report = goToSleep(copy);
      if (report?.wakeUps.some((w) => w.reason === "morning")) {
        woke = true;
        expect(report.wokeMinute).toBe(hours(5));
        expect(copy.current.minute).toBe(hours(5));
        expect(report.sleptHours).toBeCloseTo(7);
      }
    }
    expect(woke).toBe(true);
  });
});

describe("кошеня й «Пригніченість» (§6.2)", () => {
  it("кошеня приходить зі стартовим пакетом корму й наповнювача", () => {
    const save = game();
    save.current.character.stats.sanity = 20;
    save.current.minute = hours(22);
    goToSleep(save);
    expect(save.current.cats).toHaveLength(1);
    expect(save.current.home.supplies.catFood.cheap).toBe(8);
    expect(save.current.home.supplies.litter.cheap).toBe(7);
  });

  it("без котів і нижче 30% уранці — «Пригніченість»: здоровий глузд між 10 і 30", () => {
    const save = game();
    const state = save.current;
    state.character.depressed = true;
    state.character.stats.sanity = 20;
    changeStat(state, "sanity", 50);
    expect(state.character.stats.sanity).toBe(30);
    changeStat(state, "sanity", -50);
    expect(state.character.stats.sanity).toBe(10);
    withCat(save);
    expect(state.character.depressed).toBe(false);
  });
});
