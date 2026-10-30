// Проєкція світу на екран (крок 16, хвиля 0): коса «три чверті» старого вигляду дає рівно ті числа, що раніше
// давав geometry.ts (клітинка 60 × 50, стіна 30, поле 14), — тож перехід на об'єкт проєкції вигляду не змінив.

import { describe, expect, it } from "vitest";

import { MAP_HEIGHT, MAP_WIDTH } from "../src/sim/home";
import { OBLIQUE } from "../src/view/world/projection";

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
