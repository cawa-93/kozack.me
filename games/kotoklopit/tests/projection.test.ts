// Проєкція світу на екран (крок 16): коса «три чверті» старого вигляду (хвиля 0) дає рівно ті числа, що раніше
// давав geometry.ts (клітинка 60 × 50, стіна 30, поле 14), — тож перехід на об'єкт проєкції вигляду не змінив; ізометрія
// 2:1 (хвиля 1) — ромб 128 × 64 за формулою з GRAPHICS_PLAN.md, межі світу, верх задньої стіни й керування відносно екрана.

import { describe, expect, it } from "vitest";

import { MAP_HEIGHT, MAP_WIDTH } from "../src/sim/home";
import { ISO, ISO_MARGIN, ISO_ORIGIN, ISO_TILE, ISO_WALLS, OBLIQUE } from "../src/view/world/projection";

describe("коса проєкція старого вигляду", () => {
  it("клітинка (0, 0) — під верхом задньої стіни й полем, далі крок 60 × 50", () => {
    expect(OBLIQUE.toScreen({ x: 0, y: 0 })).toEqual({ x: 14, y: 44 });
    expect(OBLIQUE.toScreen({ x: 1, y: 1 })).toEqual({ x: 74, y: 94 });
    expect(OBLIQUE.toScreen({ x: 9.5, y: 1 })).toEqual({ x: 584, y: 94 });
    expect(OBLIQUE.toScreen({ x: 3.25, y: 7.5 })).toEqual({ x: 209, y: 419 });
  });

  it("прямокутник клітинок — від його верхнього лівого кута", () => {
    expect(OBLIQUE.rectToScreen({ x: 2, y: 3, w: 2, h: 1 })).toEqual({ x: 134, y: 194, w: 120, h: 50 });
  });

  it("глибина — висота на екрані", () => {
    expect(OBLIQUE.depthOf(123.5)).toBe(123.5);
    expect(OBLIQUE.depthAt({ x: 5, y: 2 })).toBe(144);
  });

  it("межі світу для камери, клітинка й стіна", () => {
    expect(MAP_WIDTH).toBe(20);
    expect(MAP_HEIGHT).toBe(12);
    expect(OBLIQUE.world).toEqual({ width: 20 * 60 + 28, height: 30 + 12 * 50 + 28 });
    expect(OBLIQUE.tile).toEqual({ width: 60, height: 50 });
    expect(OBLIQUE.wallRise).toBe(30);
  });

  it("верх задньої стіни — там, де починається її лицьова грань, однаковий на всю ширину (межа індикаторів сховищ)", () => {
    for (const x of [0, 14, 300, 584, 1228]) {
      expect(OBLIQUE.backWallTop(x)).toBe(64);
      expect(OBLIQUE.backWallTop(x)).toBe(OBLIQUE.toScreen({ x: 0, y: 1 }).y - OBLIQUE.wallRise);
    }
  });

  it("напрям на екрані — той самий напрям у клітинках (§10)", () => {
    expect(OBLIQUE.screenToTileDir({ x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
    expect(OBLIQUE.screenToTileDir({ x: 0.6, y: 0.8 })).toEqual({ x: 0.6, y: 0.8 });
    expect(OBLIQUE.screenToTileDir({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("методи не залежать від this: їх можна передавати окремо", () => {
    const { toScreen, rectToScreen, depthAt, backWallTop, screenToTileDir } = OBLIQUE;
    expect(toScreen({ x: 1, y: 0 })).toEqual({ x: 74, y: 44 });
    expect(rectToScreen({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: 14, y: 44, w: 60, h: 50 });
    expect(depthAt({ x: 0, y: 1 })).toBe(94);
    expect(backWallTop(100)).toBe(64);
    expect(screenToTileDir({ x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
  });
});

describe("ізометрія 2:1 нової графіки (крок 16)", () => {
  const O = ISO_ORIGIN;
  const screen = (x: number, y: number): { x: number; y: number } => ({ x: O.x + (x - y) * 64, y: O.y + (x + y) * 32 });

  it("клітинка (0, 0) — верхня вершина ромба 128 × 64: screen = origin + ((x−y)·64, (x+y)·32)", () => {
    expect(ISO.kind).toBe("iso");
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

  it("прямокутник клітинок — рамка його ромба: від лівої вершини (x, y+h) до правої (x+w, y), від верхньої до нижньої", () => {
    const r = { x: 13, y: 10, w: 3, h: 1 };
    const box = ISO.rectToScreen(r);
    expect(box).toEqual({ x: screen(13, 11).x, y: screen(13, 10).y, w: 4 * 64, h: 4 * 32 });
    expect(box.x + box.w).toBe(screen(16, 10).x);
    expect(box.y + box.h).toBe(screen(16, 11).y);
    expect(ISO.rectToScreen({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: O.x - 64, y: O.y, w: 128, h: 64 });
  });

  it("квартира з полем і задньою стіною вміщується у світ: x від −12·64 до 20·64, y від −200 до 32·32", () => {
    expect(ISO.wallRise).toBe(200);
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
    expect(ISO.toScreen({ x: 0, y: 0 }).y - ISO.wallRise).toBe(ISO_MARGIN);
  });

  it("глибина точки — висота на екрані, а за однакової висоти — далі той, у кого більший x (як в isoOrder)", () => {
    expect(ISO.depthOf(321.5)).toBe(321.5);
    const a = ISO.depthAt({ x: 5, y: 2 });
    expect(a).toBeCloseTo(ISO.toScreen({ x: 5, y: 2 }).y, 2);
    // Ближче до камери (більше x + y) — більша глибина, хоч би як змінився x.
    expect(ISO.depthAt({ x: 2, y: 5.1 })).toBeGreaterThan(ISO.depthAt({ x: 5, y: 2 }));
    expect(ISO.depthAt({ x: 18.9, y: 1 })).toBeLessThan(ISO.depthAt({ x: 1, y: 19 }));
    // Та сама висота на екрані: більший x — ближче.
    expect(ISO.depthAt({ x: 5, y: 2 })).toBeGreaterThan(ISO.depthAt({ x: 2, y: 5 }));
    // Зсув за x менший за півпікселя, якими старий кіт стає над тим, що під ним.
    expect(ISO.depthAt({ x: 20, y: 0 }) - ISO.depthAt({ x: 0, y: 20 })).toBeLessThan(0.01);
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
    const { toScreen, rectToScreen, depthAt, backWallTop, screenToTileDir } = ISO;
    expect(toScreen({ x: 1, y: 0 })).toEqual({ x: O.x + 64, y: O.y + 32 });
    expect(rectToScreen({ x: 0, y: 0, w: 1, h: 1 }).w).toBe(128);
    expect(depthAt({ x: 0, y: 1 })).toBeCloseTo(O.y + 32, 6);
    expect(backWallTop(O.x)).toBe(O.y + 64 - 200);
    expect(screenToTileDir({ x: 0, y: -1 }).x).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});
