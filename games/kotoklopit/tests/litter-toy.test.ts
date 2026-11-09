// Лоток і вудочка (§9.12, §6.4): закритий тримає запах і служить довше, з відкритого кіт промахується, дзвіночок на дорогій вудочці.

import { describe, expect, it } from "vitest";

import { playDrain } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { peeSpot, tickCats } from "../src/sim/catai";
import { CLIMBING, CLOSED_LITTER_USES, LITTER_CAPACITY, LITTER_MISS, MESS_SANITY, PLAY, PLAYFUL, SCATTER_CHANCE, THINGS, TOY } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { hiddenTile, PLACES } from "../src/sim/home";
import { isDryMess } from "../src/sim/household";
import { inspectionVisit } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { isDirty, litterCapacity } from "../src/sim/resources";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, LitterItem, Quality, Save, ToyItem, TraitLevel, Vec } from "../src/sim/types";
import { litterSmells } from "../src/view/iso/looks";
import { bodyMinutes, hours, recordEvents, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  return save;
}

const boxOf = (state: GameState): LitterItem => state.home.items.find((i): i is LitterItem => i.kind === "litter") as LitterItem;

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at: Vec = { x: 8.5, y: 3.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 90, fatigue: 10, attention: 10, play: 60 };
  addCat(save.current, cat);
  return cat;
}

/** Скільки разів із `runs` кіт промахнувся, сходивши в лоток якості `quality`. */
function misses(traits: Record<string, TraitLevel>, quality: Quality, runs = 400): number {
  let count = 0;
  for (let seed = 0; seed < runs; seed++) {
    const save = game();
    const state = save.current;
    state.rng.behavior = seed;
    const box = boxOf(state);
    box.quality = quality;
    const cat = withCat(save, traits);
    cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.1, elapsed: 0 };
    tickCats(state, 0.2, { present: false });
    if (state.home.messes.some((m) => m.kind === "pee")) {
      count += 1;
      expect(cat.needs.toilet).toBeLessThan(90);
    }
  }
  return count;
}

describe("закритий лоток (§9.12)", () => {
  it("з наповнювачем служить на похід довше, без наповнювача брудний після першого ж", () => {
    const box = (quality: Quality, litter: Quality | null): LitterItem => ({ id: 1, kind: "litter", quality, slot: "litter-1", litter, uses: 0 });
    expect(litterCapacity(box("cheap", "cheap"))).toBe(LITTER_CAPACITY.cheap);
    expect(litterCapacity(box("premium", "cheap"))).toBe(LITTER_CAPACITY.cheap + CLOSED_LITTER_USES);
    expect(litterCapacity(box("premium", "premium"))).toBe(LITTER_CAPACITY.premium + CLOSED_LITTER_USES);
    expect(litterCapacity(box("premium", null))).toBe(LITTER_CAPACITY.none);
    const closed = box("premium", "cheap");
    closed.uses = LITTER_CAPACITY.cheap;
    expect(isDirty(closed)).toBe(false);
    closed.uses += CLOSED_LITTER_USES;
    expect(isDirty(closed)).toBe(true);
  });

  it("брудний закритий не пахне, брудний відкритий пахне, чистий не пахне", () => {
    const box = (quality: Quality, uses: number): LitterItem => ({ id: 1, kind: "litter", quality, slot: "litter-1", litter: "cheap", uses });
    expect(litterSmells(box("cheap", 10))).toBe(true);
    expect(litterSmells(box("premium", 10))).toBe(false);
    expect(litterSmells(box("cheap", 0))).toBe(false);
  });

  it("перевірка ОСББ рахує лише брудний відкритий лоток", () => {
    const fine = (quality: Quality): number => {
      const { current: state } = game();
      state.character.money = 1000;
      state.home.fur = 0;
      const box = boxOf(state);
      box.quality = quality;
      box.uses = 20;
      const { events, stop } = recordEvents();
      inspectionVisit(state);
      stop();
      const event = events.find((e) => e.type === "modifier" && e.kind === "inspection");
      return event?.type === "modifier" ? event.value : -1;
    };
    expect(fine("cheap")).toBeGreaterThan(0);
    expect(fine("premium")).toBe(0);
  });
});

describe("промах повз відкритий лоток (§9.12)", () => {
  it("кіт без риси інколи промахується, із закритого — ніколи", () => {
    const plain = misses({}, "cheap");
    expect(plain).toBeGreaterThan(400 * LITTER_MISS * 0.5);
    expect(plain).toBeLessThan(400 * LITTER_MISS * 1.6);
    expect(misses({}, "premium")).toBe(0);
    expect(misses({ scatter: 2 }, "premium")).toBe(0);
  });

  it("шанс змінює «Розкидання наповнювача»: «Екскаватор» частіше, «Акуратний» рідше, «Ювелір» ніколи", () => {
    const digger = misses({ scatter: 2 }, "cheap");
    const neat = misses({ scatter: -1 }, "cheap");
    expect(digger).toBeGreaterThan(400 * LITTER_MISS * (1 + SCATTER_CHANCE.step * 2) * 0.6);
    expect(neat).toBeLessThan(misses({}, "cheap"));
    expect(misses({ scatter: -2 }, "cheap")).toBe(0);
  });

  it("калюжа лягає поруч із лотком на видну підлогу, а не під нього, хоч би де він стояв", () => {
    const { current: state } = game();
    const box = boxOf(state);
    for (const place of PLACES) {
      box.slot = place.id;
      const at = peeSpot(state, box);
      const tile = { x: Math.floor(at.x), y: Math.floor(at.y) };
      expect(tile, place.id).not.toEqual({ x: place.x, y: place.y });
      expect(hiddenTile(tile.x, tile.y), place.id).toBe(false);
      expect(Math.hypot(tile.x - place.x, tile.y - place.y), place.id).toBeLessThan(3);
    }
  });

  it("промах показує рису: кіт із «+» на очах персонажа, а калюжа — від цього кота", () => {
    for (let seed = 0; seed < 400; seed++) {
      const save = game();
      const state = save.current;
      state.rng.behavior = seed;
      Object.assign(state.character.body, { x: 9.5, y: 2.5 });
      const box = boxOf(state);
      const cat = withCat(save, { scatter: 1 });
      cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.1, elapsed: 0 };
      tickCats(state, 0.2, { present: true });
      const mess = state.home.messes.find((m) => m.kind === "pee");
      if (!mess) continue;
      expect(mess.cat).toBe(cat.id);
      expect(cat.traits[0]?.seen).toBeGreaterThan(0);
      return;
    }
    throw new Error("Жоден кіт не промахнувся");
  });

  it("калюжа сечі мокра: пилосос і робот її не беруть, прибирати неприємно, як мітку", () => {
    expect(isDryMess("pee")).toBe(false);
    expect(MESS_SANITY.pee).toBe(MESS_SANITY.mark);
  });

  it("на калюжі сечі можна посковзнутися, як на воді", () => {
    let slipped = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      const state = save.current;
      state.rng.behavior = seed;
      state.home.messes = [{ id: 1, kind: "pee", x: 6.5, y: 8.5, cat: null }];
      Object.assign(state.character.body, { x: 4.5, y: 8.5 });
      const { events, stop } = recordEvents();
      for (let i = 0; i < 40; i++) advance(save, bodyMinutes(0.02), { move: { x: 1, y: 0 }, hold: false });
      stop();
      if (events.some((e) => e.type === "slipped")) slipped += 1;
    }
    expect(slipped).toBeGreaterThan(0);
  });
});

describe("вудочка з дзвіночком (§6.4)", () => {
  /** Вудочка в руках і кіт поруч: скільки разів із `runs` «Нудьгар» відвернувся. */
  function ignored(quality: Quality, runs = 300): number {
    let count = 0;
    for (let seed = 0; seed < runs; seed++) {
      const save = game();
      const state = save.current;
      state.rng.behavior = seed;
      const body = state.character.body;
      Object.assign(body, { x: 6.5, y: 8.5, facing: { x: 1, y: 0 } });
      const toy: ToyItem = { id: 700, kind: "toy", quality, x: 0, y: 0, uses: 0 };
      state.character.held = { kind: "toy", toy };
      const cat = withCat(save, { playful: -2 }, { x: 7.2, y: 8.5 });
      cat.act = idleAct(30);
      const { events, stop } = recordEvents();
      state.character.activity = { kind: "play", cat: cat.id, minutes: 0 };
      advance(save, 0.1, { move: { x: 0, y: 0 }, hold: true });
      stop();
      if (events.some((e) => e.type === "refused" && e.reason === "cat-bored")) count += 1;
    }
    return count;
  }

  it("«Нудьгар» ігнорує дорогу вудочку рідше", () => {
    const cheap = ignored("cheap");
    const premium = ignored("premium");
    expect(cheap).toBeGreaterThan(300 * PLAYFUL.ignore * 0.7);
    expect(premium).toBeLessThan(cheap * 0.75);
    expect(premium).toBeGreaterThan(0);
  });

  it("гра дорогою вудочкою швидше задовольняє кота", () => {
    const save = game();
    const cat = withCat(save);
    expect(playDrain(cat)).toBeCloseTo(PLAY.needPerMinute);
    expect(playDrain(cat, "premium")).toBeCloseTo(PLAY.needPerMinute * TOY.bell.drain);
  });

  it("кота з висоти дорога вудочка зманює здалеку, дешева — лише поруч", () => {
    const lured = (quality: Quality, distance: number): boolean => {
      const save = game();
      const state = save.current;
      const cat = withCat(save, { climbing: 1 }, { x: 13.5, y: 1.5 });
      cat.needs.toilet = 10;
      cat.act = { kind: "idle", target: null, goal: null, minutes: 30, elapsed: 0 };
      Object.assign(state.character.body, { x: 13.5 + distance, y: 1.5 + 1 });
      state.character.body.x = 13.5 + Math.sqrt(distance * distance - 1);
      state.character.held = { kind: "toy", toy: { id: 700, kind: "toy", quality, x: 0, y: 0, uses: 0 } };
      tickCats(state, 0.1, { present: true });
      return cat.act.target === "lured";
    };
    const between = (CLIMBING.lureReach + CLIMBING.lureReach * TOY.bell.lure) / 2;
    expect(lured("cheap", CLIMBING.lureReach - 0.2)).toBe(true);
    expect(lured("cheap", between)).toBe(false);
    expect(lured("premium", between)).toBe(true);
  });

  it("вудочка лишається дешевою річчю, а дорога коштує вдвічі більше за колишню", () => {
    expect(THINGS.toy.price).toEqual({ cheap: 20, premium: 120 });
  });
});
