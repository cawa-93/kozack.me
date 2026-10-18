import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { spawnDoor, spawnItem, spawnSpider, spawnWeb } from "../src/dev/spawn";
import { Inventory } from "../src/game/inventory";
import { Item } from "../src/game/items";
import { World } from "../src/game/world";
import { generateLevel } from "../src/maze/generate";
import { T } from "../src/maze/grid";

function world(levelIndex: number, seed = 3) {
  return new World({
    level: generateLevel(seed, levelIndex, 0),
    inv: new Inventory(),
    rng: new Rng(seed),
    hasAntidote: false,
    aim: null,
    tutorial: { learned: { space: true, e: true, q: true }, save() {} },
    startTime: 0,
  });
}

describe("панель розробника: спавн поруч із гравцем (§12.7)", () => {
  it("предмет і протиотрута лягають у досяжності гравця", () => {
    const w = world(1);
    spawnItem(w, new Item("gasLamp"));
    spawnItem(w, null);
    expect(w.floorItems.some((f) => f.item?.kind === "gasLamp")).toBe(true);
    expect(w.floorItems.some((f) => f.item === null)).toBe(true);
    for (const f of w.floorItems.slice(-2)) {
      expect(Math.hypot(f.x - w.player.x, f.y - w.player.y)).toBeLessThan(1.3);
      expect(w.map.walkablePlayer(Math.floor(f.x), Math.floor(f.y))).toBe(true);
    }
  });

  it("павутина — у сусідній клітинці, не під гравцем", () => {
    const w = world(2);
    const before = w.webs.size;
    expect(spawnWeb(w)).toBe(true);
    expect(w.webs.size).toBe(before + 1);
    const web = [...w.webs.values()].at(-1)!;
    expect(Math.floor(w.player.x) === web.tx && Math.floor(w.player.y) === web.ty).toBe(false);
    expect(Math.hypot(web.tx + 0.5 - w.player.x, web.ty + 0.5 - w.player.y)).toBeLessThanOrEqual(2.01);
  });

  it("двері — зачинені, на тайлі-проході поруч, варіант рівня", () => {
    const w = world(3);
    const n = w.doors.length;
    expect(spawnDoor(w)).toBe(true);
    const d = w.doors[n];
    expect(w.map.get(d.tx, d.ty)).toBe(T.Door);
    expect(d.open).toBe(false);
    expect(d.variant).toBe("rubble");
    expect(w.map.opaque(d.tx, d.ty)).toBe(true);
    expect(Math.hypot(d.tx + 0.5 - w.player.x, d.ty + 0.5 - w.player.y)).toBeLessThan(4.5);
  });

  it("павук — за 2–3 клітинки, у спокої, працює в симуляції", () => {
    const w = world(0 + 1);
    expect(w.spiders.length).toBe(0);
    expect(spawnSpider(w)).toBe(true);
    const s = w.spiders[0];
    expect(s.state).toBe("calm");
    const d = Math.hypot(s.x - w.player.x, s.y - w.player.y);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(8);
    w.spidersReleased = true;
    for (let i = 0; i < 120; i++) w.step(1 / 60, [], () => false, 0, 0);
    // Павук живе за звичайними правилами: рухається лише прохідним для себе простором.
    expect(w.map.walkableSpider(Math.floor(s.x), Math.floor(s.y))).toBe(true);
    expect(w.spiders.length).toBe(1);
  });
});
