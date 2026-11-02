// Смуги сонця з вікон (§8.9 «День і ніч», рішення автора 2026-11-02): отвір вікна, спроєктований уздовж сонячного променя на
// підлогу своєї кімнати. Уранці — вікна стіни y = 0 (спальня, кухня), увечері — вікно стіни x = 0 (вітальня); низьке сонце —
// довгі смуги далі від вікна, високе — короткі біля нього; рама лишає тінь хрестовини.

import { describe, expect, it } from "vitest";

import { ROOMS } from "../src/sim/home";
import type { Vec } from "../src/sim/types";
import { PANES, type Pane } from "../src/view/decor";
import { daylight, type Sun } from "../src/view/light/daylight";
import { SUN } from "../src/view/light/lightlook";
import { clipToRect, polygonArea, sunRay, sunStrips } from "../src/view/light/sunstrips";

function pane(room: string): Pane {
  const found = PANES.find((p) => p.room === room);
  if (!found) throw new Error(`немає вікна «${room}»`);
  return found;
}

const morning = (elevation: number, strength = 1): Sun => ({ wall: "y", strength, elevation });
const evening = (elevation: number, strength = 1): Sun => ({ wall: "x", strength, elevation });
const all = (strips: { points: readonly Vec[] }[]): Vec[] => strips.flatMap((s) => [...s.points]);
const area = (strips: { points: readonly Vec[] }[]): number => strips.reduce((sum, s) => sum + polygonArea(s.points), 0);
const EPS = 1e-9;

function insideRoom(points: readonly Vec[], room: string): boolean {
  const r = ROOMS.find((x) => x.id === room);
  if (!r) return false;
  return points.every((p) => p.x >= r.x - EPS && p.x <= r.x + r.w + EPS && p.y >= r.y - EPS && p.y <= r.y + r.h + EPS);
}

describe("смуги сонця", () => {
  it("уранці — у спальні й на кухні, у межах своєї кімнати; вітальні вранці сонця немає", () => {
    const sun = morning(0.45);
    for (const room of ["bedroom", "kitchen"]) {
      const strips = sunStrips(pane(room), sun);
      expect(strips.length, room).toBeGreaterThan(0);
      expect(insideRoom(all(strips), room), room).toBe(true);
    }
    expect(sunStrips(pane("living"), sun)).toEqual([]);
  });

  it("увечері — лише у вітальні: промінь іде від стіни x = 0 вглиб кімнати", () => {
    const sun = evening(0.4);
    const strips = sunStrips(pane("living"), sun);
    expect(strips.length).toBeGreaterThan(0);
    expect(insideRoom(all(strips), "living")).toBe(true);
    for (const p of all(strips)) expect(p.x).toBeGreaterThan(1);
    expect(sunStrips(pane("bedroom"), sun)).toEqual([]);
    expect(sunStrips(pane("kitchen"), sun)).toEqual([]);
  });

  it("смуга лежить на підлозі перед вікном, а не на стіні: далі від стіни, ніж лице (y = 1)", () => {
    const strips = sunStrips(pane("bedroom"), morning(0.5));
    for (const p of all(strips)) expect(p.y).toBeGreaterThan(1.2);
    const [first] = strips;
    expect(first?.far.y).toBeGreaterThan(first?.near.y ?? Infinity);
  });

  it("низьке сонце — смуга далі від вікна й довша, ніж високе", () => {
    const low = sunStrips(pane("bedroom"), morning(0.1))[0];
    const high = sunStrips(pane("bedroom"), morning(0.9))[0];
    if (!low || !high) throw new Error("смуг немає");
    expect(low.near.y).toBeGreaterThan(high.near.y);
    expect(low.far.y - low.near.y).toBeGreaterThan(high.far.y - high.near.y);
    expect(sunRay(morning(0.1)).perZ).toBeGreaterThan(sunRay(morning(0.9)).perZ);
  });

  it("рама: шибки 2 × 2 — кілька плям із проміжком хрестовини, менших за весь отвір", () => {
    const sun = morning(0.85);
    const strips = sunStrips(pane("bedroom"), sun);
    expect(strips.length).toBe(SUN.grid.cols * SUN.grid.rows);
    // Площа шибок менша за площу всього отвору на підлозі (хрестовина).
    const { dir, perZ } = sunRay(sun);
    const p = pane("bedroom");
    const width = p.span[1] - p.span[0];
    const depth = (p.z[1] - p.z[0]) * perZ * dir.y;
    expect(area(strips)).toBeLessThan(width * depth);
    expect(area(strips)).toBeGreaterThan(width * depth * 0.6);
  });

  it("без сонця чи з нульовою силою — смуг немає; уночі сонця немає", () => {
    expect(sunStrips(pane("bedroom"), null)).toEqual([]);
    expect(sunStrips(pane("bedroom"), morning(0.5, 0))).toEqual([]);
    expect(daylight(23 * 60, true)?.sun).toBeNull();
  });

  it("світло доби о 07:30 дає смуги в спальні, о 19:30 — у вітальні", () => {
    expect(sunStrips(pane("bedroom"), daylight(7 * 60 + 30, true)?.sun ?? null).length).toBeGreaterThan(0);
    expect(sunStrips(pane("living"), daylight(19 * 60 + 30, true)?.sun ?? null).length).toBeGreaterThan(0);
  });

  it("обрізання прямокутником: усередині — без змін, навпіл — половина, поза ним — нічого", () => {
    const rect = { x: 0, y: 0, w: 2, h: 2 };
    const square = [
      { x: 0.5, y: 0.5 },
      { x: 1.5, y: 0.5 },
      { x: 1.5, y: 1.5 },
      { x: 0.5, y: 1.5 },
    ];
    expect(polygonArea(clipToRect(square, rect))).toBeCloseTo(1);
    const shifted = square.map((p) => ({ x: p.x + 1, y: p.y }));
    expect(polygonArea(clipToRect(shifted, rect))).toBeCloseTo(0.5);
    expect(clipToRect(square.map((p) => ({ x: p.x + 5, y: p.y })), rect)).toEqual([]);
  });
});
