import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonArea } from "../src/vision/geom";
import { lineOfSight } from "../src/vision/los";
import { visibilityPolygon } from "../src/vision/visibility";

/** Карта з рядків: '#' — непрозорий, '.' — прозорий. */
function mapFrom(rows: string[]) {
  return (tx: number, ty: number) => {
    if (ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length) return true;
    return rows[ty][tx] === "#";
  };
}

describe("полігон видимості (§7.2)", () => {
  it("у порожній кімнаті покриває весь квадрат", () => {
    const opaque = mapFrom(Array(20).fill(".".repeat(20)));
    const poly = visibilityPolygon(10, 10, opaque, { extent: 3 });
    expect(polygonArea(poly)).toBeCloseTo(36, 1);
  });

  it("стіна затуляє те, що за нею", () => {
    const opaque = mapFrom([
      "..........",
      "..........",
      "....#.....",
      "....#.....",
      "....#.....",
      "..........",
    ]);
    const poly = visibilityPolygon(2.5, 3.5, opaque, { extent: 6 });
    expect(pointInPolygon(poly, 3.5, 3.5)).toBe(true); // перед стіною
    expect(pointInPolygon(poly, 6.5, 3.5)).toBe(false); // за стіною
    expect(pointInPolygon(poly, 5.5, 0.3)).toBe(true); // промінь проходить над стіною
  });

  it("сектор обмежує кут", () => {
    const opaque = mapFrom(Array(20).fill(".".repeat(20)));
    const poly = visibilityPolygon(10, 10, opaque, { extent: 5, sector: { dir: 0, angle: Math.PI / 2 } });
    expect(pointInPolygon(poly, 13, 10)).toBe(true); // праворуч, у секторі
    expect(pointInPolygon(poly, 7, 10)).toBe(false); // ліворуч, поза сектором
    expect(pointInPolygon(poly, 10, 13)).toBe(false); // знизу, поза сектором
  });

  it("коридор шириною 1 тайл не пропускає світло за ріг", () => {
    const opaque = mapFrom([
      "#######",
      "#.....#",
      "#####.#",
      "#####.#",
      "#######",
    ]);
    const poly = visibilityPolygon(1.5, 1.5, opaque, { extent: 8 });
    expect(pointInPolygon(poly, 4.5, 1.5)).toBe(true);
    expect(pointInPolygon(poly, 5.5, 3.5)).toBe(false);
  });
});

describe("LOS для ШІ (§9.1.1)", () => {
  const opaque = mapFrom([
    "..........",
    "....#.....",
    "..........",
  ]);
  it("відкрита лінія", () => {
    expect(lineOfSight(0.5, 0.5, 9.5, 0.5, opaque)).toBe(true);
  });
  it("стіна між точками", () => {
    expect(lineOfSight(0.5, 1.5, 9.5, 1.5, opaque)).toBe(false);
  });
  it("діагональ точно через кут стіни блокується (supercover)", () => {
    const corner = mapFrom([
      ".#.",
      "...",
      "...",
    ]);
    // Відрізок проходить точно через кут (2,1), бічний тайл (1,0) — стіна.
    expect(lineOfSight(0.5, 2.5, 2.5, 0.5, corner)).toBe(false);
  });
});

describe("часткові перешкоди: тіні від ґрат (§7.2.1)", () => {
  // Відкрита кімната; тайл (5, 5) — ґрати з 5 прутами вздовж x.
  const opaque = (tx: number, ty: number) => tx < 0 || ty < 0 || tx > 10 || ty > 10;
  const bars = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => ({ x0: p - 0.055, y0: 0.445, x1: p + 0.055, y1: 0.555 }));
  const partial = (tx: number, ty: number) => (tx === 5 && ty === 5 ? bars : null);

  it("за прутом — тінь, між прутами — світло; без partial тіні немає", () => {
    const poly = visibilityPolygon(5.5, 2.5, opaque, { extent: 6, partial });
    // Прямо під джерелом за середнім прутом (x = 5.5) — тінь; між прутами (x = 5.4) — світло.
    expect(pointInPolygon(poly, 5.5, 7.5)).toBe(false);
    expect(pointInPolygon(poly, 5.4, 5.8)).toBe(true);
    // Перед ґратами все освітлено.
    expect(pointInPolygon(poly, 5.5, 5.2)).toBe(true);
    const plain = visibilityPolygon(5.5, 2.5, opaque, { extent: 6 });
    expect(pointInPolygon(plain, 5.5, 7.5)).toBe(true);
  });
});

describe("двері й завали на межі зору (§7.2)", () => {
  // Коридор уздовж y; тайл (5, 5) — зачинені двері (непрозорі).
  const opaque = (tx: number, ty: number) => tx < 4 || tx > 6 || ty < 0 || ty > 10 || (tx === 5 && ty === 5);
  it("промінь заглиблюється до полотна дверей, а не лише на 0.25", () => {
    const plain = visibilityPolygon(5.5, 2.5, opaque, { extent: 6, penetrate: 0.25 });
    expect(pointInPolygon(plain, 5.5, 5.5)).toBe(false); // центр тайла дверей не видно
    const deep = visibilityPolygon(5.5, 2.5, opaque, { extent: 6, penetrate: 0.25, penetrateAt: (tx, ty) => (tx === 5 && ty === 5 ? 0.66 : null) });
    expect(pointInPolygon(deep, 5.5, 5.5)).toBe(true); // полотно посередині освітлене
    expect(pointInPolygon(deep, 5.5, 5.8)).toBe(false); // за ним — ні
    // З протилежного боку так само.
    const other = visibilityPolygon(5.5, 8.5, opaque, { extent: 6, penetrate: 0.25, penetrateAt: (tx, ty) => (tx === 5 && ty === 5 ? 0.66 : null) });
    expect(pointInPolygon(other, 5.5, 5.5)).toBe(true);
  });
});
