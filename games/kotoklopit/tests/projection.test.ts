// Проєкція світу на екран (крок 16): ізометрія 2:1 — ромб 128 × 64 за формулою з GRAPHICS_PLAN.md, межі світу, верх задньої
// стіни й керування відносно екрана.

import { describe, expect, it } from "vitest";

import { MAP_HEIGHT, MAP_WIDTH } from "../src/sim/home";
import { ISO, ISO_MARGIN, ISO_ORIGIN, ISO_TILE, ISO_WALLS } from "../src/view/world/projection";

describe("ізометрія 2:1 (крок 16)", () => {
  const O = ISO_ORIGIN;
  const screen = (x: number, y: number): { x: number; y: number } => ({ x: O.x + (x - y) * 64, y: O.y + (x + y) * 32 });

  it("клітинка (0, 0) — верхня вершина ромба 128 × 64: screen = origin + ((x−y)·64, (x+y)·32)", () => {
    expect(MAP_WIDTH).toBe(20);
    expect(MAP_HEIGHT).toBe(12);
    expect(ISO_TILE).toEqual({ width: 128, height: 64 });
    expect(ISO.tile).toEqual({ width: 128, height: 64 });
    expect(ISO.toScreen({ x: 0, y: 0 })).toEqual(O);
    expect(ISO.toScreen({ x: 1, y: 0 })).toEqual({ x: O.x + 64, y: O.y + 32 });
    expect(ISO.toScreen({ x: 0, y: 1 })).toEqual({ x: O.x - 64, y: O.y + 32 });
    expect(ISO.toScreen({ x: 1, y: 1 })).toEqual({ x: O.x, y: O.y + 64 });
    // Центр клітинки (i, j) — (i + 0,5, j + 0,5): середина ромба.
    expect(ISO.toScreen({ x: 3.5, y: 7.5 })).toEqual(screen(3.5, 7.5));
    expect(ISO.toScreen({ x: 9.5, y: 1 })).toEqual({ x: O.x + 8.5 * 64, y: O.y + 10.5 * 32 });
  });

  it("квартира з полем і задньою стіною вміщується у світ: x від −12·64 до 20·64, y від −200 до 32·32", () => {
    expect(ISO_WALLS).toEqual({ back: 200, inner: 66, plinth: 14 });
    const { width, height } = ISO.world;
    expect(width).toBe(32 * 64 + 2 * ISO_MARGIN);
    expect(height).toBe(200 + 32 * 32 + 2 * ISO_MARGIN);
    const corners = [
      { x: 0, y: 0 },
      { x: MAP_WIDTH, y: 0 },
      { x: 0, y: MAP_HEIGHT },
      { x: MAP_WIDTH, y: MAP_HEIGHT },
    ].map((p) => ISO.toScreen(p));
    for (const p of corners) {
      expect(p.x).toBeGreaterThanOrEqual(ISO_MARGIN);
      expect(p.x).toBeLessThanOrEqual(width - ISO_MARGIN);
      expect(p.y).toBeLessThanOrEqual(height - ISO_MARGIN);
    }
    expect(Math.min(...corners.map((p) => p.x))).toBe(ISO_MARGIN);
    expect(Math.max(...corners.map((p) => p.x))).toBe(width - ISO_MARGIN);
    expect(Math.max(...corners.map((p) => p.y))).toBe(height - ISO_MARGIN);
    // Верх задньої стіни над кутом (0, 0) — найвища точка квартири — на полі від верхнього краю світу.
    expect(ISO.toScreen({ x: 0, y: 0 }).y - ISO_WALLS.back).toBe(ISO_MARGIN);
  });

  it("верх задньої стіни — ламана вздовж стовпця x=0 і ряду y=0: найвища над кутом (1, 1), донизу в обидва боки", () => {
    // Над кутом лицьових граней (1, 1) — на висоту стіни вище за його підлогу.
    expect(ISO.backWallTop(O.x)).toBe(screen(1, 1).y - 200);
    // Уздовж ряду y=0: лицьова грань — площина y = 1, точка (x, 1).
    for (const x of [1, 4.5, 10, 19, 20]) expect(ISO.backWallTop(screen(x, 1).x)).toBe(screen(x, 1).y - 200);
    // Уздовж стовпця x=0: лицьова грань — площина x = 1, точка (1, y).
    for (const y of [1, 3, 8.25, 12]) expect(ISO.backWallTop(screen(1, y).x)).toBe(screen(1, y).y - 200);
    // За краями стін — як на краю.
    expect(ISO.backWallTop(0)).toBe(ISO.backWallTop(screen(1, 12).x));
    expect(ISO.backWallTop(ISO.world.width)).toBe(ISO.backWallTop(screen(20, 1).x));
    // Вікно спальні в задній стіні (над клітинкою (4, 0)) — нижче за верх стіни над ним.
    expect(ISO.backWallTop(screen(4.5, 1).x)).toBeLessThan(screen(4.5, 1).y - 100);
  });

  it("напрям на екрані → напрям у клітинках тієї самої довжини (§10): «вгору» на екрані — вгору для гравця", () => {
    const s = Math.SQRT1_2;
    const cases: [string, { x: number; y: number }, { x: number; y: number }][] = [
      ["вгору", { x: 0, y: -1 }, { x: -s, y: -s }],
      ["вниз", { x: 0, y: 1 }, { x: s, y: s }],
      ["праворуч", { x: 1, y: 0 }, { x: s, y: -s }],
      ["ліворуч", { x: -1, y: 0 }, { x: -s, y: s }],
      ["вгору й праворуч", { x: s, y: -s }, { x: -1 / Math.sqrt(10), y: -3 / Math.sqrt(10) }],
      ["вгору й ліворуч", { x: -s, y: -s }, { x: -3 / Math.sqrt(10), y: -1 / Math.sqrt(10) }],
      ["вниз і праворуч", { x: s, y: s }, { x: 3 / Math.sqrt(10), y: 1 / Math.sqrt(10) }],
      ["вниз і ліворуч", { x: -s, y: s }, { x: 1 / Math.sqrt(10), y: 3 / Math.sqrt(10) }],
    ];
    for (const [name, v, expected] of cases) {
      const d = ISO.screenToTileDir(v);
      expect(d.x, name).toBeCloseTo(expected.x, 12);
      expect(d.y, name).toBeCloseTo(expected.y, 12);
      expect(Math.hypot(d.x, d.y), name).toBeCloseTo(1, 12);
      // Рух у клітинках на екрані йде саме туди, куди показали: точка зсувається вздовж v.
      const from = ISO.toScreen({ x: 6, y: 6 });
      const to = ISO.toScreen({ x: 6 + d.x, y: 6 + d.y });
      const moved = { x: to.x - from.x, y: to.y - from.y };
      expect(moved.x * v.y - moved.y * v.x, name).toBeCloseTo(0, 9);
      expect(moved.x * v.x + moved.y * v.y, name).toBeGreaterThan(0);
    }
  });

  it("довжина напряму зберігається: це сила відхилення джойстика", () => {
    expect(ISO.screenToTileDir({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    for (const v of [
      { x: 0.3, y: 0 },
      { x: 0, y: -0.5 },
      { x: 0.6, y: 0.8 },
      { x: -0.12, y: 0.05 },
    ]) {
      const d = ISO.screenToTileDir(v);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(Math.hypot(v.x, v.y), 12);
    }
  });

  it("методи не залежать від this: їх можна передавати окремо", () => {
    const { toScreen, backWallTop, screenToTileDir } = ISO;
    expect(toScreen({ x: 1, y: 0 })).toEqual({ x: O.x + 64, y: O.y + 32 });
    expect(backWallTop(O.x)).toBe(O.y + 64 - 200);
    expect(screenToTileDir({ x: 0, y: -1 }).x).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});
