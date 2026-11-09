// Живий портрет кота (§9.7): місце — за намальованим, а не за полотнами частин — кіт сидить на дні, центр ваги посередині.

import { describe, expect, it } from "vitest";

import { placeInk, type FigureInk } from "../src/view/art/compose";

const ink = (over: Partial<FigureInk>): FigureInk => ({ minX: 0, minY: 0, maxX: 100, maxY: 80, cx: 50, cy: 40, mass: 1000, ...over });

describe("місце кота на портреті (§9.7)", () => {
  it("намальоване стоїть на дні з полем, центр ваги — посередині по горизонталі", () => {
    const { ox, oy } = placeInk(ink({ minX: 10, maxX: 110, cx: 70, maxY: 90 }), 1, 200, 200, 12);
    expect(90 + oy).toBe(188);
    expect(70 + ox).toBe(100);
  });

  it("хвіст, що відтягує центр, не виходить за поле: зсув обмежено краями намальованого", () => {
    // Центр ваги далеко праворуч: посередині — і лівий край вийшов би за поле; тож лівий край — на полі.
    const { ox } = placeInk(ink({ minX: 0, maxX: 150, cx: 140 }), 1, 200, 200, 12);
    expect(0 + ox).toBe(12);
    // Навпаки — правий край на полі.
    const right = placeInk(ink({ minX: 0, maxX: 150, cx: 10 }), 1, 200, 200, 12);
    expect(150 + right.ox).toBe(188);
  });

  it("масштаб множить усе: центр ваги посередині й за k ≠ 1", () => {
    const { ox, oy } = placeInk(ink({ cx: 40, maxY: 60 }), 2, 300, 300, 10);
    expect(40 * 2 + ox).toBe(150);
    expect(60 * 2 + oy).toBe(290);
  });
});
