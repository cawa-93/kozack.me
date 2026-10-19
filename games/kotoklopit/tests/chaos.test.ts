// Базова поведінка котів і хаос (§8.2, §9.3, §9.12): гра, кіт біля роботи, бешкет, зумі,
// шерстяні грудки, тертя об ноги, втеча в двері.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { catOnComputer, decide, tickCats } from "../src/sim/catai";
import { advance, interact, newGame } from "../src/sim/game";
import { objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, ToyItem, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, standAt, walkTo } from "./helpers";

function game(seed = 11): Save {
  const save = newGame({ sex: "female", difficulty: "normal", seed });
  save.current.modifiers.day = null;
  save.current.minute = hours(19);
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 4.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

const STILL = { move: { x: 0, y: 0 }, hold: false };

function live(save: Save, minutes: number, present = true): void {
  for (let i = 0; i < minutes; i++) {
    tickCats(save.current, 1, { present });
    save.current.minute += 1;
  }
}

describe("гра з котом (§8.2, §9.12)", () => {
  it("іграшка в руках і утримання дії біля кота — здоровий глузд, поки кіт хоче гратися", () => {
    const save = game();
    const toy = save.current.home.items.find((i): i is ToyItem => i.kind === "toy");
    expect(toy).toBeDefined();
    walkTo(save, `item:${toy?.id}`);
    interact(save);
    expect(save.current.character.held?.kind).toBe("toy");
    const body = save.current.character.body;
    const cat = withCat(save, {}, { x: body.x, y: body.y - 0.6 });
    cat.needs.play = 80;
    body.facing = { x: 0, y: -1 };
    const sanity = save.current.character.stats.sanity;
    const { events, stop } = recordEvents();
    for (let i = 0; i < 12 && save.current.character.activity?.kind !== undefined || i === 0; i++) {
      advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    }
    advance(save, 6, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 5);
    expect(cat.needs.play).toBeLessThan(10);
    expect(events.some((e) => e.type === "played")).toBe(true);
  });

  it("іграшка ламається після 15 ігор наодинці (дешева)", () => {
    const save = game();
    const cat = withCat(save);
    const toy = save.current.home.items.find((i): i is ToyItem => i.kind === "toy");
    if (!toy) throw new Error("немає іграшки");
    toy.uses = 14;
    cat.act = { kind: "toy", target: `item:${toy.id}`, goal: null, minutes: 0.5, elapsed: 0 };
    const { events, stop } = recordEvents();
    live(save, 2);
    stop();
    expect(events.some((e) => e.type === "toy-broke")).toBe(true);
    expect(save.current.home.items.some((i) => i.kind === "toy")).toBe(false);
  });
});

describe("кіт і робота (§9.12)", () => {
  it("«Клавіатурний окупант» зупиняє роботу, і сісти за комп'ютер не вийде, доки його не прибрати", () => {
    let stopped = false;
    for (let seed = 0; seed < 8 && !stopped; seed++) {
      const save = game(seed);
      walkTo(save, "computer");
      interact(save);
      const body = save.current.character.body;
      const cat = withCat(save, { helper: 2 }, { x: body.x + 1, y: body.y + 1 });
      cat.needs.attention = 90;
      decide(save.current, cat, createRng(seed), { present: true });
      const { events, stop } = recordEvents();
      for (let i = 0; i < 80 && !events.some((e) => e.type === "keyboard"); i++) advance(save, 0.25);
      stop();
      if (!events.some((e) => e.type === "keyboard")) continue;
      stopped = true;
      expect(save.current.character.activity).toBeNull();
      expect(catOnComputer(save.current)?.id).toBe(cat.id);
      const refused = recordEvents();
      interact(save);
      refused.stop();
      expect(refused.events.some((e) => e.type === "refused" && e.reason === "occupied") || save.current.character.held?.kind === "cat").toBe(true);
    }
    expect(stopped).toBe(true);
  });

  it("кіт на колінах відновлює здоровий глузд, поки персонаж працює", () => {
    const save = game();
    save.current.minute = hours(19);
    walkTo(save, "computer");
    interact(save);
    const body = save.current.character.body;
    const cat = withCat(save, { lap: 2, helper: -2 }, { x: body.x, y: body.y + 0.5 });
    cat.needs.attention = 100;
    cat.act = { kind: "lap", target: "character", goal: null, minutes: 240, elapsed: 0 };
    const sanity = save.current.character.stats.sanity;
    advance(save, 30);
    // Робота забирає 5 за годину, а кіт на колінах дає 1 за хвилину.
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 10);
    expect(save.current.character.activity?.kind).toBe("work");
  });
});

describe("бешкет (§9.12)", () => {
  it("кіт скидає страву зі столу: страва пропадає, на підлозі безлад", () => {
    const save = game();
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
    const cat = withCat(save, { knocking: 2 });
    const table = objectById("table");
    cat.act = { kind: "knock", target: "table", goal: { x: table.x, y: table.y }, minutes: 0.5, elapsed: 0 };
    live(save, 10);
    expect(save.current.home.surfaces["table"]).toBeNull();
    expect(save.current.home.messes.some((m) => m.kind === "broken")).toBe(true);
  });

  it("голодний злодюжка краде страву з плити", () => {
    const save = game();
    save.current.home.stove.item = { kind: "meal", quality: "cheap" };
    const cat = withCat(save, { thief: 2 });
    cat.needs.hunger = 70;
    const stove = objectById("stove");
    cat.act = { kind: "steal", target: "stove", goal: { x: stove.x, y: stove.y }, minutes: 1, elapsed: 0 };
    const { events, stop } = recordEvents();
    live(save, 15);
    stop();
    expect(save.current.home.stove.item).toBeNull();
    expect(events.some((e) => e.type === "stole")).toBe(true);
    expect(cat.needs.hunger).toBeLessThan(40);
  });

  it("зумі збивають персонажа на шляху: пів хвилини оглушений", () => {
    const save = game();
    const body = save.current.character.body;
    body.x = 9.5;
    body.y = 8.5;
    const cat = withCat(save, {}, { x: 4.5, y: 8.5 });
    cat.act = { kind: "zoomies", target: null, goal: { x: 15, y: 8 }, minutes: 2, elapsed: 0 };
    const { events, stop } = recordEvents();
    for (let i = 0; i < 40 && !events.some((e) => e.type === "knocked-down"); i++) advance(save, 0.05, STILL);
    stop();
    expect(events.some((e) => e.type === "knocked-down")).toBe(true);
    expect(body.stun).toBeGreaterThan(0);
  });
});

describe("грудки й ноги (§9.12)", () => {
  it("на шерстяній грудці можна посковзнутися", () => {
    let slipped = 0;
    for (let seed = 0; seed < 10; seed++) {
      const save = game(seed);
      const body = save.current.character.body;
      body.x = 4.5;
      body.y = 8.5;
      save.current.home.messes.push({ id: 900, kind: "hairball", x: 6.5, y: 8.5, cat: null });
      const { events, stop } = recordEvents();
      for (let i = 0; i < 40; i++) advance(save, 0.02, { move: { x: 1, y: 0 }, hold: false });
      stop();
      if (events.some((e) => e.type === "slipped")) slipped++;
    }
    expect(slipped).toBeGreaterThan(2);
    expect(slipped).toBeLessThan(9);
  });

  it("кіт, що треться об ноги, сповільнює персонажа", () => {
    const run = (rubbing: boolean): number => {
      const save = game(3);
      const body = save.current.character.body;
      body.x = 4.5;
      body.y = 8.5;
      if (rubbing) {
        const cat = withCat(save, { legs: -1 }, { x: 4.6, y: 8.5 });
        cat.traits = [{ group: "legs", level: 1, seen: 0, known: false }];
        cat.act = { kind: "attention", target: "asked", goal: null, minutes: 30, elapsed: 0 };
        cat.needs.attention = 90;
      }
      const start = body.x;
      advance(save, 0.05, { move: { x: 1, y: 0 }, hold: false });
      return body.x - start;
    };
    expect(run(true)).toBeLessThan(run(false));
  });
});

describe("втеча в двері (§9.12)", () => {
  it("«Втікач» вибігає на сходи, коли відчиняють двері; спіймати — дія біля дверей", () => {
    let escaped: Cat | undefined;
    let save = game();
    for (let seed = 0; seed < 10 && !escaped; seed++) {
      save = game(seed);
      save.current.home.porch.push({ id: 500, product: "food", quality: "cheap", at: 0 });
      withCat(save, { escape: 2 }, { x: 10.5, y: 9.5 });
      standAt(save, "door");
      interact(save);
      escaped = save.current.cats.find((c) => c.away !== null);
    }
    expect(escaped).toBeDefined();
    const sanity = save.current.character.stats.sanity;
    interact(save);
    expect(escaped?.away).toBeNull();
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
  });

  it("не спійманий кіт повертається сам о 22:00 у гіршому настрої", () => {
    const save = game();
    const cat = withCat(save);
    cat.away = "stairs";
    save.current.minute = hours(21.9);
    const mood = cat.mood;
    live(save, 10, true);
    expect(cat.away).toBeNull();
    expect(cat.mood).toBeLessThan(mood - 5);
  });
});
