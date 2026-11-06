// Будиночки й лежанка кігтеточки (§9.12): у дорогому будиночку тихо й спокійно, на дорогій кігтеточці сплять.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { HOUSE_CALM } from "../src/sim/config";
import { interact, newGame } from "../src/sim/game";
import { itemTile } from "../src/sim/home";
import { moveThing } from "../src/sim/moving";
import { addCat } from "../src/sim/night";
import { hearSteps, loudNoise } from "../src/sim/noise";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, HomeItem, Quality, Save, TraitLevel } from "../src/sim/types";
import { artOffset } from "../src/view/iso/geometry";
import { catSpot } from "../src/view/iso/catspot";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

const SPOT = { grate: 0.004 } as const;

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

function thing(state: GameState, kind: "house" | "scratcher", quality: Quality, slot = "floor-5-8"): HomeItem & { kind: "house" | "scratcher" } {
  const item = { id: state.nextId++, kind, quality, slot };
  state.home.items.push(item);
  return item;
}

/** Кіт уже спить у будиночку. */
function asleepIn(save: Save, house: HomeItem, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = withCat(save, traits);
  cat.act = { kind: "sleep", target: `item:${house.id}`, goal: null, minutes: 240, elapsed: 0 };
  return cat;
}

describe("дорогий будиночок (§9.12)", () => {
  it("гучний звук сплячого не будить, а в картонному будить", () => {
    const woken = (quality: Quality): number => {
      let count = 0;
      for (let seed = 0; seed < 40; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = asleepIn(save, thing(save.current, "house", quality));
        loudNoise(save.current, "vacuum", null);
        if (cat.act.kind !== "sleep") count += 1;
      }
      return count;
    };
    expect(woken("cheap")).toBeGreaterThan(5);
    expect(woken("premium")).toBe(0);
  });

  it("кроки чуйного не будять, а в картонному будять", () => {
    const woken = (quality: Quality): number => {
      let count = 0;
      for (let seed = 0; seed < 60; seed++) {
        const save = game();
        const state = save.current;
        state.rng.behavior = seed;
        const cat = asleepIn(save, thing(state, "house", quality), { sleep: -2 });
        Object.assign(state.character.body, { x: 5.5, y: 8.1 });
        hearSteps(state, { x: 9.5, y: 8.5 });
        if (cat.act.kind !== "sleep") count += 1;
      }
      return count;
    };
    expect(woken("cheap")).toBeGreaterThan(0);
    expect(woken("premium")).toBe(0);
  });

  it("той, хто лише йде до будиночка спати, шум чує", () => {
    const save = game();
    const house = thing(save.current, "house", "premium");
    const cat = withCat(save, { bravery: -2 }, { x: 8.5, y: 8.5 });
    cat.act = { kind: "sleep", target: `item:${house.id}`, goal: itemTile(house), minutes: 240, elapsed: 0 };
    expect(loudNoise(save.current, "vacuum", null)).toContain(cat.id);
  });

  it("наляканий заспокоюється в ньому швидше, ніж у картонному", () => {
    const left = (quality: Quality): number => {
      const save = game();
      const house = thing(save.current, "house", quality);
      const cat = withCat(save);
      cat.act = { kind: "hide", target: `item:${house.id}`, goal: null, minutes: 60, elapsed: 0 };
      tickCats(save.current, 10, { present: false });
      return cat.act.minutes;
    };
    expect(60 - left("premium")).toBeCloseTo((60 - left("cheap")) * HOUSE_CALM);
  });
});

describe("лежанка дорогої кігтеточки (§9.12)", () => {
  /** З `runs` рішень спати — скільки разів кіт обрав місце, що проходить `chose`. */
  function sleeps(traits: Record<string, TraitLevel>, setup: (state: GameState) => void, chose: (cat: Cat) => boolean, runs = 120): number {
    let count = 0;
    for (let seed = 0; seed < runs; seed++) {
      const save = game();
      setup(save.current);
      const cat = withCat(save, traits);
      cat.needs.fatigue = 95;
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "sleep" && chose(cat)) count += 1;
    }
    return count;
  }

  const onPost = (cat: Cat): boolean => cat.act.target?.startsWith("item:") === true;
  const high = (cat: Cat): boolean => {
    const goal = cat.act.goal;
    return goal !== null && ((goal.x === 13 && goal.y === 1) || (goal.x === 6 && goal.y === 1));
  };
  const premium = (state: GameState): void => void thing(state, "scratcher", "premium", "floor-10-8");
  const cheap = (state: GameState): void => void thing(state, "scratcher", "cheap", "floor-10-8");
  const none = (): void => {};

  it("кіт, що лазить, лягає на дорогу, а на дешеву — ніхто", () => {
    expect(sleeps({ climbing: 2 }, premium, onPost)).toBeGreaterThan(20);
    expect(sleeps({ climbing: 2 }, cheap, onPost)).toBe(0);
  });

  it("кіт без риси лягає рідко, а хто нагору не лізе, не лягає й сюди", () => {
    const plain = sleeps({}, premium, onPost);
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(sleeps({ climbing: 2 }, premium, onPost) / 2);
    expect(sleeps({ climbing: -1 }, premium, onPost)).toBe(0);
  });

  it("на холодильник і шафу кіт лізе рідше, ніж без лежанки", () => {
    expect(sleeps({ climbing: 2 }, premium, high, 300)).toBeLessThan(sleeps({ climbing: 2 }, none, high, 300) * 0.6);
  });

  it("лежанка на одного: поки там спить інший, вона зайнята", () => {
    let chose = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      const post = thing(save.current, "scratcher", "premium", "floor-10-8");
      const first = withCat(save, { climbing: 2 }, { x: 10.5, y: 8.5 });
      first.act = { kind: "sleep", target: `item:${post.id}`, goal: null, minutes: 200, elapsed: 0 };
      const second = withCat(save, { climbing: 2 });
      second.needs.fatigue = 95;
      decide(save.current, second, createRng(seed), { present: false });
      if (second.act.target === `item:${post.id}`) chose += 1;
    }
    expect(chose).toBe(0);
  });

  it("кіт на лежанці лежить на подушці: над кігтеточкою й на її висоті", () => {
    const save = game();
    const post = thing(save.current, "scratcher", "premium", "floor-10-8");
    const cat = withCat(save, {}, { x: 10.5, y: 8.5 });
    cat.act = { kind: "sleep", target: `item:${post.id}`, goal: null, minutes: 200, elapsed: 0 };
    const top = artOffset("item/scratcher/premium", "top");
    expect(top).toBeDefined();
    const spot = catSpot(save.current, cat, "sleep", null, SPOT);
    expect(spot).toMatchObject({ kind: "lounger", lift: -(top?.y ?? 0), above: { id: `item:${post.id}` } });
    expect(spot.lift).toBeGreaterThan(60);
  });

  it("ще йде до лежанки чи прокинувся — на підлозі", () => {
    const save = game();
    const post = thing(save.current, "scratcher", "premium", "floor-10-8");
    const cat = withCat(save, {}, { x: 9.5, y: 8.5 });
    cat.act = { kind: "sleep", target: `item:${post.id}`, goal: itemTile(post), minutes: 200, elapsed: 0 };
    expect(catSpot(save.current, cat, "walk", null, SPOT).kind).toBe("floor");
    cat.act = idleAct(5);
    expect(catSpot(save.current, cat, "loaf", null, SPOT).kind).toBe("floor");
  });

  it("кота на лежанці можна взяти, як на підлозі, а річ із ним — ні", () => {
    const save = game();
    const state = save.current;
    const post = thing(state, "scratcher", "premium", "floor-10-8");
    const cat = withCat(save, {}, { x: 10.5, y: 8.5 });
    cat.act = { kind: "sleep", target: `item:${post.id}`, goal: null, minutes: 200, elapsed: 0 };
    standAt(save, `item:${post.id}`);
    const { events, stop } = recordEvents();
    moveThing(state);
    stop();
    expect(events).toContainEqual({ type: "refused", object: `item:${post.id}`, reason: "thing-busy" });
    interact(save);
    expect(state.character.held).toMatchObject({ kind: "cat", cat: cat.id });
  });
});

describe("вигляд будиночків (§9.12)", () => {
  it("хвіст із входу звисає лише з картонного: повстяний закритий", () => {
    for (const [quality, tail] of [
      ["cheap", true],
      ["premium", false],
    ] as const) {
      const save = game();
      const house = thing(save.current, "house", quality);
      const cat = asleepIn(save, house);
      expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "house", doorTail: tail });
    }
  });
});
