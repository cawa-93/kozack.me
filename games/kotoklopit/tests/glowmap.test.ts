// Сяйво підсвітки цілі (§8.2): карта сяйва речі рахується під час збирання тією самою зваженою сумою альфи, що й шейдер
// Phaser (`FilterGlow.frag`), а в грі лягає під річ шарами. Тут — розрахунок без Phaser і конвеєра.

import { describe, expect, it } from "vitest";

import {
  CAT_GLOW_FILTER,
  GLOW_LAYERS,
  GLOW_MAP,
  TARGET_GLOW,
  glowFrameName,
  glowKernel,
  glowLayerAlpha,
  glowMap,
  glowPlacement,
  glowRatio,
  type AlphaRaster,
} from "../src/view/art/glowmap";
import { highlightPulse } from "../src/view/iso/markslayout";
import { HIGHLIGHT_DARK } from "../src/view/light/lightlook";

/** Растр альфи з функції (0–1). */
function raster(w: number, h: number, at: (x: number, y: number) => number): AlphaRaster {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.round(255 * at(x, y));
  return { w, h, data };
}

const fract = (v: number): number => v - Math.floor(v);

/** Межі пульсу підсвітки, які позначки справді показують (`highlightPulse`), за кілька його періодів. */
const PULSE = (() => {
  let min = Infinity;
  let max = -Infinity;
  for (let time = 0; time < 4000; time++) {
    const pulse = highlightPulse(time);
    min = Math.min(min, pulse);
    max = Math.max(max, pulse);
  }
  return { min, max };
})();

/** Вибірка шейдера: білінійна, за межами текстури — прозоро (`boundedSampler`). Координати — у текселях, центр текселя — ціле. */
function sample(a: AlphaRaster, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (ix: number, iy: number): number => (ix < 0 || iy < 0 || ix >= a.w || iy >= a.h ? 0 : (a.data[iy * a.w + ix] ?? 0) / 255);
  return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
}

/**
 * `FilterGlow.frag` рядок у рядок: `alphaRatio` у текселі (x, y) і кути, з яких починалося кожне кільце (псевдовипадковий
 * зсув шейдера, накопичений).
 */
function shaderRatio(a: AlphaRaster, x: number, y: number, distance: number, quality: number): { ratio: number; phases: number[] } {
  const u = (x + 0.5) / a.w;
  const v = (y + 0.5) / a.h;
  let total = 0;
  let angle = 0;
  const phases: number[] = [];
  for (let d = 0; d < distance; d++) {
    angle += fract(Math.sin(d * 12.9898 + (u + v) * 78.233) * 43758.5453);
    phases.push(angle);
    for (let i = 0; i < quality; i++) {
      angle += (Math.PI * 2) / quality;
      total += (distance - d) * sample(a, x + Math.cos(angle) * (d + 1), y + Math.sin(angle) * (d + 1));
    }
  }
  return { ratio: total / ((distance * (distance + 1) * quality) / 2), phases };
}

describe("ядро сяйва — формула шейдера Glow", () => {
  /** Нерівна пляма з напівпрозорим краєм: кут, виїмка й діра. */
  const blob = raster(40, 36, (x, y) => {
    if (x >= 10 && x < 30 && y >= 8 && y < 28 && !(x >= 18 && x < 22 && y >= 14 && y < 20)) return x === 10 || y === 27 ? 0.4 : 1;
    return x + y === 60 ? 0.7 : 0;
  });

  it("частка сяйва збігається з шейдером у кожній точці (ті самі кути кілець)", () => {
    for (const [distance, quality] of [
      [10, 8],
      [6, 5],
    ] as const) {
      for (const [x, y] of [
        [4, 4],
        [9, 18],
        [20, 17],
        [31, 9],
        [33, 30],
        [15, 31],
        [0, 0],
      ] as const) {
        const want = shaderRatio(blob, x, y, distance, quality);
        const got = glowRatio(blob, glowKernel(distance, quality, { phases: want.phases }), x, y);
        expect(got, `${distance}/${quality} @ ${x},${y}`).toBeCloseTo(want.ratio, 9);
      }
    }
  });

  it("усередині суцільного — 1, далі за ширину сяйва — 0, біля рівного краю — половина й спадає з відстанню", () => {
    const kernel = glowKernel(GLOW_MAP.distance, GLOW_MAP.quality);
    // Ліва половина суцільна, край — між x = 29 і 30.
    const half = raster(60, 60, (x) => (x < 30 ? 1 : 0));
    expect(glowRatio(half, kernel, 12, 30)).toBeCloseTo(1, 6);
    expect(glowRatio(half, kernel, 30 + GLOW_MAP.distance + 1, 30)).toBe(0);
    const edge = [0, 1, 2, 4, 6, 8].map((d) => glowRatio(half, kernel, 30 + d, 30));
    expect(edge[0]!).toBeGreaterThan(0.4);
    expect(edge[0]!).toBeLessThan(0.5);
    for (let i = 1; i < edge.length; i++) expect(edge[i]!).toBeLessThan(edge[i - 1]!);
    expect(edge.at(-1)!).toBeGreaterThan(0);
  });

  it("багато вибірок на кільце — середнє шейдера за всіма кутами (без його шуму)", () => {
    const smooth = glowKernel(10, GLOW_MAP.quality);
    let sum = 0;
    const turns = 64;
    for (let t = 0; t < turns; t++) {
      const phases = Array.from({ length: 10 }, () => (t / turns) * ((Math.PI * 2) / 8));
      sum += glowRatio(blob, glowKernel(10, 8, { phases }), 9, 18);
    }
    expect(glowRatio(blob, smooth, 9, 18)).toBeCloseTo(sum / turns, 2);
  });
});

describe("карта сяйва кадру", () => {
  const thing = raster(30, 22, (x, y) => (x >= 2 && x < 28 && y >= 2 && y < 20 ? 1 : 0));
  const map = glowMap(thing);

  it("ширша за кадр на ширину сяйва з кожного боку, у зниженій роздільності", () => {
    const { distance, scale } = GLOW_MAP;
    expect(map.scale).toBe(scale);
    expect(map.dx).toBeLessThanOrEqual(-distance);
    expect(map.dy).toBeLessThanOrEqual(-distance);
    expect(map.dx + map.w * scale).toBeGreaterThanOrEqual(thing.w + distance);
    expect(map.dy + map.h * scale).toBeGreaterThanOrEqual(thing.h + distance);
    expect(map.w).toBeLessThanOrEqual(Math.ceil((thing.w + 2 * distance) / scale) + 1);
    expect(map.data.length).toBe(map.w * map.h);
  });

  it("піксель карти — сяйво найслабшого пульсу в центрі свого квадрата: min(1, частка × сила)", () => {
    const { distance, quality, scale, gain } = GLOW_MAP;
    expect(scale).toBe(2);
    // Центр квадрата 2 × 2 — на розі чотирьох текселів: ядро зі зсувом на пів текселя.
    const kernel = glowKernel(distance, quality, { shift: 0.5 });
    let checked = 0;
    for (let j = 0; j < map.h; j++) {
      for (let i = 0; i < map.w; i++) {
        const ratio = glowRatio(thing, kernel, map.dx + i * scale, map.dy + j * scale);
        expect(map.data[j * map.w + i], `${i},${j}`).toBe(Math.round(255 * Math.min(1, ratio * gain)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
    // Під самою річчю — суцільно, у кутах карти — нічого.
    const mid = map.data[Math.floor(map.h / 2) * map.w + Math.floor(map.w / 2)];
    expect(mid).toBe(255);
    expect(map.data[0]).toBe(0);
    expect(map.data[map.data.length - 1]).toBe(0);
  });

  it("сила карти — найслабше сяйво, яке пульс справді показує, ширина — як у фільтра", () => {
    expect(GLOW_MAP.gain).toBeCloseTo(TARGET_GLOW.min + TARGET_GLOW.pulse * PULSE.min, 4);
    expect(GLOW_MAP.distance).toBe(10);
  });

  it("порожній кадр — порожня карта", () => {
    const empty = glowMap(raster(1, 1, () => 0));
    expect([...empty.data].every((v) => v === 0)).toBe(true);
  });
});

describe("шари сяйва в грі", () => {
  it("найслабший пульс — один шар карти як є; сильніше — шари поверх, кожен на повну силу карти", () => {
    expect(glowLayerAlpha(1, 0)).toBe(1);
    expect(glowLayerAlpha(1, 1)).toBe(0);
    expect(glowLayerAlpha(2.25, 0)).toBe(1);
    expect(glowLayerAlpha(2.25, 1)).toBe(1);
    expect(glowLayerAlpha(2.25, 2)).toBeCloseTo(0.25);
    expect(glowLayerAlpha(2.25, 3)).toBe(0);
    expect(glowLayerAlpha(0.5, 0)).toBe(0.5);
  });

  it("слабке сяйво (далеко від речі) шари дають таким самим, як шейдер: сума прозоростей — сила / сила карти", () => {
    for (const strength of [2.8, 3.3, 5.6, (TARGET_GLOW.min + TARGET_GLOW.pulse * PULSE.max) * HIGHLIGHT_DARK.boost]) {
      const t = strength / GLOW_MAP.gain;
      let sum = 0;
      for (let k = 0; k < GLOW_LAYERS; k++) sum += glowLayerAlpha(t, k);
      expect(sum).toBeCloseTo(t);
    }
  });

  it("шарів досить для найсильнішого пульсу в найтемнішому місці", () => {
    const strongest = (TARGET_GLOW.min + TARGET_GLOW.pulse * PULSE.max) * HIGHLIGHT_DARK.boost;
    expect(GLOW_LAYERS).toBe(Math.ceil(strongest / GLOW_MAP.gain - 1e-4));
  });

  it("удень найслабший пульс — рівно один шар (сяйво шейдера без похибки), найсильніший — не більше двох", () => {
    const layers = (pulse: number): number[] => {
      const t = (TARGET_GLOW.min + TARGET_GLOW.pulse * pulse) / GLOW_MAP.gain;
      return Array.from({ length: GLOW_LAYERS }, (_, k) => glowLayerAlpha(t, k)).filter((alpha) => alpha > 1e-4);
    };
    const weakest = layers(PULSE.min);
    expect(weakest).toHaveLength(1);
    expect(weakest[0]).toBeCloseTo(1, 4);
    expect(layers(PULSE.max).length).toBeLessThanOrEqual(2);
  });

  it("карта лягає на кадр речі: origin — у pivot речі, масштаб — у scale разів більший", () => {
    // Полотно 200 × 100 px, pivot (0,5; 0,9) → (100, 90) px; карта 60 × 40 з кроком 2 починається в (−10, −12).
    const place = glowPlacement({ dx: -10, dy: -12, w: 60, h: 40, scale: 2 }, { w: 200, h: 100 }, { x: 0.5, y: 0.9 });
    expect(place.originX).toBeCloseTo(110 / 120);
    expect(place.originY).toBeCloseTo(102 / 80);
    expect(place.scale).toBe(2);
  });

  it("назва кадру карти не збігається з кадром і його шарами", () => {
    expect(glowFrameName("env/fridge/open")).not.toBe("env/fridge/open");
    expect(glowFrameName("env/fridge/open")).not.toContain("#");
    expect(glowFrameName("env/fridge/open")).toContain("env/fridge/open");
  });
});

describe("сяйво кота — фільтр зі зниженою якістю", () => {
  it("не більше 30 вибірок текстури на піксель", () => {
    expect(CAT_GLOW_FILTER.quality * CAT_GLOW_FILTER.distance).toBeLessThanOrEqual(30);
    expect(CAT_GLOW_FILTER.distance).toBeGreaterThanOrEqual(5);
  });
});
