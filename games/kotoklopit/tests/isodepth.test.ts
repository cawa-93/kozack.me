// Реєстр глибини ізометричного світу (крок 16, `src/view/iso/depth.ts`): частини реєструють коробки й точки з колбеками,
// розв'язувач роздає глибини за `isoOrder` — нижче за позначки, в одиницях екранного y (як `ISO.depthOf` старих частин).
// У Node, без Phaser: колбеки — функції.

import { describe, expect, it } from "vitest";

import { OBJECTS, objectById } from "../src/sim/home";
import { ISO_BACKDROP_DEPTH, ISO_DEPTH_MAX, ISO_DEPTH_SLOT, IsoDepth, isoDepth } from "../src/view/iso/depth";
import { WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { objectBox } from "../src/view/world/isoorder";
import { WORLD_LAYERS } from "../src/view/world/layers";
import type { WorldQuery } from "../src/view/world/part";
import { ISO } from "../src/view/world/projection";

/** Колбек, що пам'ятає останню глибину й скільки разів його кликали. */
function recorder(): { set: (d: number) => void; depth: () => number; calls: () => number } {
  let depth = Number.NaN;
  let calls = 0;
  return {
    set: (d) => {
      depth = d;
      calls++;
    },
    depth: () => depth,
    calls: () => calls,
  };
}

/** Реєстр з однією коробкою речі квартири за id. */
function withObject(id: string): { registry: IsoDepth; box: ReturnType<typeof recorder> } {
  const registry = new IsoDepth();
  const box = recorder();
  registry.addBox({ ...objectBox(objectById(id)), id }, box.set);
  return { registry, box };
}

describe("реєстр глибини: порядок", () => {
  it("персонаж перед диваном — глибше за диван, за диваном — менше", () => {
    const { registry, box: sofa } = withObject("sofa");
    const person = recorder();
    const handle = registry.addPoint(person.set, { id: "person" });
    handle.place(16.4, 10.5);
    registry.solve();
    expect(person.depth()).toBeGreaterThan(sofa.depth());
    handle.place(14.5, 9.5);
    registry.solve();
    expect(person.depth()).toBeLessThan(sofa.depth());
    expect(handle.depth).toBe(person.depth());
  });

  it("кіт на столі (за id коробки) — над столом, під персонажем перед столом; невідомий id — на підлозі", () => {
    const { registry, box: table } = withObject("table");
    const cat = recorder();
    const person = recorder();
    registry.addPoint(cat.set).place(13.5, 3.5, "table");
    registry.addPoint(person.set).place(14, 4.5);
    registry.solve();
    expect(cat.depth()).toBeGreaterThan(table.depth());
    expect(cat.depth() - table.depth()).toBeGreaterThanOrEqual(ISO_DEPTH_SLOT - 1e-9);
    expect(person.depth()).toBeGreaterThan(cat.depth());
    // Під столом — одразу за ним.
    const hiding = recorder();
    registry.addPoint(hiding.set).placeUnder(14.2, 3.8, "table");
    registry.solve();
    expect(hiding.depth()).toBeLessThan(table.depth());
    // Коробки з таким id немає — точка просто на підлозі (за столом, бо y < y1 і x < x1).
    const lost = recorder();
    registry.addPoint(lost.set).place(13.5, 3.5, "nope");
    registry.solve();
    expect(lost.depth()).toBeLessThan(table.depth());
  });

  it("кіт на руках — над персонажем на пів проміжку, хоч би де той стояв", () => {
    const { registry, box: sofa } = withObject("sofa");
    const person = recorder();
    const carried = recorder();
    const p = registry.addPoint(person.set, { id: "person" });
    const cat = registry.addPoint(carried.set);
    p.place(14.5, 9.5);
    cat.placeAbove("person");
    registry.solve();
    expect(carried.depth()).toBeCloseTo(person.depth() + ISO_DEPTH_SLOT / 2, 9);
    expect(carried.depth()).toBeLessThan(sofa.depth());
    p.place(16.4, 10.5);
    registry.solve();
    expect(carried.depth()).toBeCloseTo(person.depth() + ISO_DEPTH_SLOT / 2, 9);
    expect(carried.depth()).toBeGreaterThan(sofa.depth());
    // Персонаж зник (поїздка) — кіт на руках глибини не міняє.
    p.hide();
    const before = carried.calls();
    registry.solve();
    expect(carried.calls()).toBe(before);
  });

  it("уся квартира з котами й брудом: глибини від 0 до ISO_DEPTH_MAX, нижче за позначки, крок порядку — не менше проміжку", () => {
    const registry = new IsoDepth();
    const depths = new Map<string, () => number>();
    for (const o of OBJECTS) {
      const r = recorder();
      registry.addBox({ ...objectBox(o), id: o.id }, r.set);
      depths.set(o.id, r.depth);
    }
    WALL_SEGMENTS.forEach((w, i) => {
      const r = recorder();
      registry.addBox(objectBox(w.rect), r.set);
      depths.set(`wall:${i}`, r.depth);
    });
    for (let i = 0; i < 30; i++) {
      const r = recorder();
      const x = 1.5 + ((i * 7) % 17);
      const y = 6.3 + ((i * 3) % 4);
      registry.addPoint(r.set, { flat: i % 4 === 0 }).place(x, y);
      depths.set(`p:${i}`, r.depth);
    }
    registry.solve();
    expect(registry.cycles).toBe(0);
    const all = [...depths.values()].map((d) => d()).sort((a, b) => a - b);
    expect(all.every((d) => Number.isFinite(d))).toBe(true);
    expect(all[0]!).toBeGreaterThanOrEqual(0);
    expect(all[all.length - 1]!).toBeLessThanOrEqual(ISO_DEPTH_MAX);
    expect(ISO_DEPTH_MAX).toBeLessThan(WORLD_LAYERS.marks);
    expect(ISO_BACKDROP_DEPTH).toBeLessThan(all[0]!);
    for (let i = 1; i < all.length; i++) expect(all[i]! - all[i - 1]!).toBeGreaterThanOrEqual(ISO_DEPTH_SLOT - 1e-9);
  });
});

describe("реєстр глибини: узгоджено зі старими частинами", () => {
  it("вільна точка отримує свою ISO.depthAt — ту, яку старий кіт чи персонаж рахує сам", () => {
    const registry = new IsoDepth();
    const r = recorder();
    registry.addPoint(r.set).place(6.3, 7.7);
    registry.solve();
    expect(r.depth()).toBeCloseTo(ISO.depthAt({ x: 6.3, y: 7.7 }), 9);
  });

  it("старий персонаж (глибина з ISO.depthOf ніг) стає перед і за меблями-коробками реєстру, як за правилом", () => {
    for (const [id, front, back] of [
      ["fridge", { x: 13.5, y: 2.4 }, { x: 12.6, y: 1.5 }],
      ["sofa", { x: 16.3, y: 10.5 }, { x: 14.5, y: 9.4 }],
      ["table", { x: 14, y: 4.4 }, { x: 14, y: 2.6 }],
    ] as const) {
      const { registry, box } = withObject(id);
      registry.solve();
      const legacy = (p: { x: number; y: number }): number => ISO.depthOf(ISO.toScreen(p).y);
      expect(legacy(front), id).toBeGreaterThan(box.depth());
      expect(legacy(back), id).toBeLessThan(box.depth());
    }
  });
});

describe("реєстр глибини: коли рахує", () => {
  it("розв'язок без змін нічого не кличе; колбек — лише коли глибина змінилася", () => {
    const { registry, box } = withObject("sofa");
    const person = recorder();
    const handle = registry.addPoint(person.set);
    handle.place(16.4, 10.5);
    registry.solve();
    expect(box.calls()).toBe(1);
    expect(person.calls()).toBe(1);
    // Той самий кадр, ще кілька частин кличуть solve — нічого.
    registry.solve();
    registry.solve();
    handle.place(16.4, 10.5);
    registry.solve();
    expect(box.calls()).toBe(1);
    expect(person.calls()).toBe(1);
    // Рух без зміни глибини дивана — кличеться лише персонаж.
    handle.place(16.5, 10.5);
    registry.solve();
    expect(person.calls()).toBe(2);
    expect(box.calls()).toBe(1);
  });

  it("схована точка й неактивна коробка в порядку не беруть участі", () => {
    const registry = new IsoDepth();
    const table = recorder();
    const fridge = recorder();
    const t = registry.addBox({ ...objectBox(objectById("table")), id: "table" }, table.set);
    registry.addBox({ ...objectBox(objectById("fridge")), id: "fridge" }, fridge.set);
    const cat = recorder();
    const c = registry.addPoint(cat.set);
    c.place(13.5, 3.5, "table");
    registry.solve();
    expect(cat.depth()).toBeGreaterThan(table.depth());
    // Стола немає — кіт на підлозі на тому самому місці.
    t.setActive(false);
    registry.solve();
    expect(cat.depth()).toBeCloseTo(ISO.depthAt({ x: 13.5, y: 3.5 }), 6);
    t.setActive(true);
    c.hide();
    const calls = cat.calls();
    registry.solve();
    expect(cat.calls()).toBe(calls);
    expect(registry.box("table")).toBe(t);
    expect(registry.box("fridge")?.depth).toBe(fridge.depth());
  });

  it("видалені коробки й точки забуваються, id звільняється; повтор id — помилка", () => {
    const registry = new IsoDepth();
    const box = registry.addBox({ x0: 1, y0: 1, x1: 2, y1: 2, id: "a" }, () => {});
    expect(() => registry.addBox({ x0: 3, y0: 3, x1: 4, y1: 4, id: "a" }, () => {})).toThrow();
    box.remove();
    expect(registry.box("a")).toBeNull();
    registry.addBox({ x0: 3, y0: 3, x1: 4, y1: 4, id: "a" }, () => {});
    const point = registry.addPoint(() => {}, { id: "person" });
    expect(registry.point("person")).toBe(point);
    expect(() => registry.addPoint(() => {}, { id: "person" })).toThrow();
    point.remove();
    expect(registry.point("person")).toBeNull();
    // Видалена точка більше не рухається й не ламає розв'язку.
    point.place(5, 5);
    registry.solve();
  });

  it("один реєстр на світ", () => {
    const world = {} as WorldQuery;
    const other = {} as WorldQuery;
    expect(isoDepth({ world })).toBe(isoDepth({ world }));
    expect(isoDepth({ world })).not.toBe(isoDepth({ world: other }));
  });
});

const sources = import.meta.glob<string>(["../src/view/iso/depth.ts", "../src/view/world/isoorder.ts", "../src/view/zoom.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("шви ізометрії", () => {
  it("порядок, реєстр глибини й зум камери — без Phaser і без старого вигляду", () => {
    expect(Object.keys(sources)).toHaveLength(3);
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+["']phaser["']/m);
      expect(source, file).not.toMatch(/from\s+["'][^"']*legacy\//);
    }
  });
});
