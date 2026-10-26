// Гру й вилизування видно (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3, В1, В2, В3): гра фазами, вилизування
// з другом, що мружиться, коли вилизують і скільки це дає, взаємність.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, Save, TraitLevel } from "../src/sim/types";
import { eventBubbles } from "../src/view/symbols";
import { recordEvents, withCatCorner } from "./helpers";

function game(seed = 5): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.minute = 19 * 60;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 8.5 }, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

const setRelation = (save: Save, a: Cat, b: Cat, value: number): void => {
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = value;
};

const sleeping = (minutes = 300): CatAct => ({ kind: "sleep", target: null, goal: null, minutes, elapsed: 0 });

const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((e) => e.type === type).length;

/** Кіт іде вилизати друга (`b`), що стоїть за дві клітинки. */
function groomFriend(a: Cat, b: Cat, minutes = 5): void {
  a.act = { kind: "groom", target: `cat:${b.id}`, goal: { x: Math.floor(b.x), y: Math.floor(b.y) }, minutes, elapsed: 0 };
}

describe("вилизування видно (§9.4, рішення автора 2026-10-26, В1)", () => {
  it("кіт іде вилизувати друга на 4–6 хвилин (було 3)", () => {
    const lengths: number[] = [];
    for (let seed = 0; seed < 400 && lengths.length < 10; seed++) {
      const save = game();
      const a = withCat(save, {}, { x: 9.5, y: 8.5 });
      const b = withCat(save, {}, { x: 10.5, y: 8.5 });
      setRelation(save, a, b, 60);
      b.act = idleAct(60);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) lengths.push(a.act.minutes);
    }
    expect(lengths.length).toBe(10);
    for (const minutes of lengths) {
      expect(minutes).toBeGreaterThanOrEqual(4);
      expect(minutes).toBeLessThanOrEqual(6);
    }
  });

  it("друг, що не спить, сидить на місці обличчям до того, хто вилизує, а над ним — думка-сердечко; потім він вільний", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = idleAct(60);
    groomFriend(a, b);
    const at = { x: b.x, y: b.y };
    const { events, stop } = recordEvents();
    let held = 0;
    for (let t = 0; t < 400 && a.act.kind === "groom"; t++) {
      tickCats(save.current, 0.05, { present: false });
      if (b.act.kind === "idle" && b.act.target === `licked:${a.id}`) {
        held += 0.05;
        expect({ x: b.x, y: b.y }).toEqual(at);
        expect(b.facing).toBe(a.x > b.x ? 1 : -1);
      }
    }
    stop();
    expect(held).toBeGreaterThan(4.8);
    const started = events.find((e) => e.type === "groom-started");
    expect(started).toMatchObject({ cat: a.id, friend: b.id });
    expect(count(events, "groomed")).toBe(1);
    if (started) expect(eventBubbles(started)).toEqual([{ kind: "think", at: `cat:${b.id}`, icon: "heart" }]);
    // Вилизування скінчилося — друг уже не сидить, чекаючи.
    tickCats(save.current, 0.1, { present: false });
    expect(b.act.target === `licked:${a.id}`).toBe(false);
  });

  it("друг, що спить, спить далі", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = sleeping();
    groomFriend(a, b);
    const { events, stop } = recordEvents();
    for (let t = 0; t < 400 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
    stop();
    expect(b.act.kind).toBe("sleep");
    expect(count(events, "groom-started")).toBe(1);
    expect(count(events, "groomed")).toBe(1);
  });

  it("друг пішов на нагальну потребу — вилизування скасовується без наслідків", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = idleAct(60);
    groomFriend(a, b);
    for (let t = 0; t < 200 && b.act.target !== `licked:${a.id}`; t++) tickCats(save.current, 0.05, { present: false });
    expect(b.act.target).toBe(`licked:${a.id}`);
    b.needs.toilet = 100;
    const { events, stop } = recordEvents();
    for (let t = 0; t < 40; t++) tickCats(save.current, 0.05, { present: false });
    stop();
    expect(b.act.kind).toBe("toilet");
    expect(a.act.kind === "groom" && a.act.target === `cat:${b.id}`).toBe(false);
    expect(count(events, "groomed")).toBe(0);
    expect(relation(save.current, a, b)).toBe(60);
  });

  it("«Нянька» вилизує кошеня так само: кошеня сидить і мружиться, над ним сердечко", () => {
    const save = game();
    const adult = withCat(save, { nurturing: 2 }, { x: 8.5, y: 8.5 });
    const kitten = withCat(save, {}, { x: 10.5, y: 8.5 }, 1);
    kitten.act = idleAct(60);
    adult.act = { kind: "groom", target: `kitten:${kitten.id}`, goal: { x: 10, y: 8 }, minutes: 5, elapsed: 0 };
    const { events, stop } = recordEvents();
    let held = 0;
    for (let t = 0; t < 400 && adult.act.kind === "groom"; t++) {
      tickCats(save.current, 0.05, { present: false });
      if (kitten.act.target === `licked:${adult.id}`) held += 0.05;
    }
    stop();
    expect(held).toBeGreaterThan(4.8);
    expect(events.find((e) => e.type === "groom-started")).toMatchObject({ cat: adult.id, friend: kitten.id });
  });
});
