// Світ із п'яти частин (крок 16, хвиля 0): сцена кличе частини в порядку, у якому вони одна одну питають, а запити
// «де що» й підсвітку цілі отримує частина-власниця — тож частини можна міняти поодинці.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { objectById } from "../src/sim/home";
import type { Target } from "../src/sim/targets";
import type { Cat } from "../src/sim/types";
import type { ApartmentPart, CatsPart, PersonPart, Point, WorldFrame, WorldPart } from "../src/view/world/part";
import { OBLIQUE } from "../src/view/world/projection";
import { UI_LAYERS, WORLD_LAYERS } from "../src/view/world/layers";
import { World } from "../src/view/world/world";

const FRAME: WorldFrame = { time: 0, seconds: 0, moving: false, sleepiness: 0, blocked: false, showHidden: false };

/** Частина-підміна: записує, що з нею робили, і відповідає своєю точкою на свої id. */
function fake(name: string, log: string[], owns: (id: string) => boolean, claims: Target["type"][] = []): WorldPart {
  const point: Point = { x: name.length, y: 0 };
  return {
    update: () => void log.push(`${name}.update`),
    lateUpdate: () => void log.push(`${name}.late`),
    onEvent: (event) => void log.push(`${name}.${event.type}`),
    reset: () => void log.push(`${name}.reset`),
    destroy: () => void log.push(`${name}.destroy`),
    anchor: (id) => (owns(id) ? point : null),
    highlight: (target) => {
      if (!claims.includes(target.type)) return false;
      log.push(`${name}.highlight:${target.id}`);
      return true;
    },
  };
}

function world(): { world: World; log: string[] } {
  const log: string[] = [];
  const apartment: ApartmentPart = { ...fake("apartment", log, (id) => !id.includes(":"), ["object"]), objectAnchor: () => ({ x: -1, y: -1 }) };
  const person: PersonPart = { ...fake("person", log, (id) => id === "person"), head: { x: 7, y: 8 }, hands: { x: 1, y: 2, depth: 3 } };
  const cats: CatsPart = { ...fake("cats", log, (id) => id.startsWith("cat:"), ["cat"]), points: (cat) => (cat === 1 ? { head: { x: 1, y: 1 }, back: { x: 2, y: 2 } } : null) };
  const result = new World(OBLIQUE);
  result.attach({ apartment, floor: fake("floor", log, (id) => /^(item|mess):/.test(id), ["item", "mess"]), cats, person, marks: fake("marks", log, () => false) });
  return { world: result, log };
}

describe("світ із частин", () => {
  it("кадр: персонаж, коти, куточок, квартира, позначки — а потім другий прохід", () => {
    const { world: w, log } = world();
    w.update(newGame({ address: "she", difficulty: "normal", seed: 1 }).current, FRAME);
    expect(log).toEqual([
      "person.update",
      "cats.update",
      "floor.update",
      "apartment.update",
      "marks.update",
      "person.late",
      "cats.late",
      "floor.late",
      "apartment.late",
      "marks.late",
    ]);
  });

  it("якір — частині-власниці за id", () => {
    const { world: w } = world();
    expect(w.anchor("person")).toEqual({ x: 6, y: 0 });
    expect(w.anchor("cat:3")).toEqual({ x: 4, y: 0 });
    expect(w.anchor("item:2")).toEqual({ x: 5, y: 0 });
    expect(w.anchor("mess:9")).toEqual({ x: 5, y: 0 });
    expect(w.anchor("fridge")).toEqual({ x: 9, y: 0 });
    expect(w.anchor("high:1")).toBeNull();
    expect(w.objectAnchor("boxes")).toEqual({ x: -1, y: -1 });
    expect(w.person.head).toEqual({ x: 7, y: 8 });
    expect(w.cat(1)?.back).toEqual({ x: 2, y: 2 });
    expect(w.cat(2)).toBeNull();
  });

  it("підсвітку бере частина, якій належить ціль", () => {
    const { world: w, log } = world();
    // Підміні частини котів досить id цілі.
    const cat = { id: 4 } as Cat;
    expect(w.highlight({ type: "object", id: "fridge", object: objectById("fridge") }, 0.5)).toBe(true);
    expect(w.highlight({ type: "cat", id: "cat:4", cat }, 0.5)).toBe(true);
    expect(log).toEqual(["apartment.highlight:fridge", "cats.highlight:cat:4"]);
  });

  it("події, новий день і закриття — усім частинам", () => {
    const { world: w, log } = world();
    w.onEvent({ type: "glitch" } as Parameters<World["onEvent"]>[0], 0);
    w.reset();
    w.destroy();
    expect(log.filter((l) => l.endsWith(".glitch"))).toHaveLength(5);
    expect(log.filter((l) => l.endsWith(".reset"))).toHaveLength(5);
    expect(log.filter((l) => l.endsWith(".destroy"))).toHaveLength(5);
  });

  it("шари глибини: позначки під рукою, сердечка під баблами, підписи над усім світом; темрява над панеллю", () => {
    expect(WORLD_LAYERS.marks).toBeLessThan(WORLD_LAYERS.interaction);
    expect(WORLD_LAYERS.interaction).toBeLessThan(WORLD_LAYERS.hearts);
    expect(WORLD_LAYERS.hearts).toBeLessThan(WORLD_LAYERS.bubbles);
    expect(WORLD_LAYERS.bubbles).toBeLessThan(WORLD_LAYERS.flying);
    expect(WORLD_LAYERS.flying).toBeLessThan(WORLD_LAYERS.collars);
    expect(WORLD_LAYERS.collars).toBeLessThan(WORLD_LAYERS.hidden);
    expect(UI_LAYERS.gloom).toBeLessThan(UI_LAYERS.hud);
    expect(UI_LAYERS.hud).toBeLessThan(UI_LAYERS.dark);
  });
});
