// Вигляд світла доби (§8.9 «День і ніч», рішення автора 2026-11-02): ніч синьо-сіра й не фіолетова (фіолетовий — серпанок
// низького глузду), база ≈ 0,55 яскравості, у відключення темніше (≈ 0,42); під лампою ≈ 0,95 тепла; смуги сонця не яскравіші
// за 0,35; скло вночі темно-синє. На межах дня план карти світла — тотожність (без стрибка в день), а скло виходить рівно свого
// кольору. Силует квартири охоплює всю підлогу й задні стіни.

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/sim/config";
import { MAP_HEIGHT, MAP_WIDTH } from "../src/sim/home";
import { newGame } from "../src/sim/game";
import { PANES } from "../src/view/decor";
import { daylight, type Daylight } from "../src/view/light/daylight";
import { CEILING_LIGHT, GLASS, luma, rgb, SUN, TONE, type Rgb } from "../src/view/light/lightlook";
import { apartmentOutline, expandConvex, glassLayers, glassOf, lightmapKey, lightmapPlan, paneQuad, toneOf } from "../src/view/light/lightmap";
import { lightSources } from "../src/view/light/sources";
import type { Point } from "../src/view/world/part";
import { ISO, ISO_WALLS } from "../src/view/world/projection";

const d = (minute: number, power = true): Daylight => {
  const light = daylight(minute, power);
  if (!light) throw new Error(`о ${minute} світло доби є`);
  return light;
};

const near = (a: Rgb, b: Rgb, eps = 0.01): boolean => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;

/** Точка всередині опуклого многокутника (обхід — будь-який). */
function inside(points: readonly Point[], p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

describe("вигляд світла доби", () => {
  it("ніч синьо-сіра, не фіолетова: синій ≥ зелений ≥ червоний; база ≈ 0,55, у відключення ≈ 0,42", () => {
    for (const tone of [TONE.night, TONE.outage]) {
      expect(tone.b).toBeGreaterThanOrEqual(tone.g);
      expect(tone.g).toBeGreaterThanOrEqual(tone.r);
    }
    expect(luma(TONE.night)).toBeGreaterThan(0.5);
    expect(luma(TONE.night)).toBeLessThan(0.6);
    expect(luma(TONE.outage)).toBeGreaterThan(0.38);
    expect(luma(TONE.outage)).toBeLessThan(0.46);
    expect(near(toneOf(d(23 * 60)), TONE.night)).toBe(true);
    expect(near(toneOf(d(23 * 60, false)), TONE.outage)).toBe(true);
  });

  it("під лампою ≈ 0,95, тепло (червоний ≥ зелений ≥ синій); смуги сонця — не більше 0,35", () => {
    const lamp = rgb(CEILING_LIGHT.color);
    expect(luma(lamp)).toBeGreaterThan(0.92);
    expect(luma(lamp)).toBeLessThan(0.98);
    expect(lamp.r).toBeGreaterThanOrEqual(lamp.g);
    expect(lamp.g).toBeGreaterThanOrEqual(lamp.b);
    expect(SUN.add).toBeLessThanOrEqual(0.35);
  });

  it("світанок і вечір — різні відтінки: вечір помаранчевіший", () => {
    const sat = (c: Rgb): number => c.r - c.b;
    expect(sat(TONE.evening)).toBeGreaterThan(sat(TONE.morning));
  });

  it("на межах дня карта — тотожність: тон і скло білі, плям і смуг немає", () => {
    const white = { r: 1, g: 1, b: 1 };
    for (const minute of [DAYLIGHT.eveningStart, DAYLIGHT.morningEnd - 0.01]) {
      const light = d(minute);
      expect(near(toneOf(light), white, 0.005), String(minute)).toBe(true);
      expect(near(glassOf(light), white, 0.005), String(minute)).toBe(true);
      const plan = lightmapPlan(light, lightSources(newGame({ address: "she", difficulty: "normal", seed: 1 }).current, light), PANES, 0);
      expect(plan.pools, String(minute)).toEqual([]);
      for (const strip of plan.strips) expect(strip.alpha, String(minute)).toBeLessThan(0.01);
    }
  });

  it("скло вночі темно-синє; на світанку тепле; шар скла під картою (лише тон) дає шибці рівно колір скла", () => {
    const night = glassOf(d(23 * 60));
    expect(night.b).toBeGreaterThan(night.r);
    expect(luma(night)).toBeLessThan(0.3);
    expect(near(night, GLASS.night)).toBe(true);
    const dawn = glassOf(d(7 * 60));
    expect(dawn.r).toBeGreaterThan(dawn.b);
    let warmer = 0;
    for (const minute of [23 * 60, 5 * 60 + 10, 6 * 60 + 30, 7 * 60, 8 * 60, 19 * 60, 19 * 60 + 30, 20 * 60 + 30]) {
      for (const power of [true, false]) {
        const light = d(minute, power);
        const tone = toneOf(light);
        const glass = glassOf(light);
        const { mul, add } = glassLayers(tone, glass);
        for (const ch of ["r", "g", "b"] as const) {
          expect(mul[ch]).toBeLessThanOrEqual(1);
          expect(add[ch]).toBeGreaterThanOrEqual(0);
          expect(add[ch]).toBeLessThanOrEqual(1);
          // Додаток — лише там, де множник не темнить: одне з двох.
          if (add[ch] > 0) expect(mul[ch]).toBe(1);
          // Шибка на малюнку (`GLASS.art`): шар скла, потім карта (тон) — рівно шибка × скло.
          expect(tone[ch] * (GLASS.art[ch] * mul[ch] + add[ch]), `${minute} ${ch}`).toBeCloseTo(GLASS.art[ch] * glass[ch], 6);
        }
        if (add.r + add.g + add.b > 0) warmer++;
      }
    }
    // На світанку й увечері тепле скло світліше за тон кімнати — тоді шар скла додає світло.
    expect(warmer).toBeGreaterThan(0);
  });

  it("у карті світла немає скла: над вікном (і над котом на підвіконні перед ним) — лише тон", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const light = d(19 * 60 + 30);
    const plan = lightmapPlan(light, lightSources(s, light), PANES, 0);
    expect(Object.keys(plan).sort()).toEqual(["pools", "strips", "tone"]);
    // Смуги сонця в карті лише трохи світлішають те, що в них стоїть (видиму смугу на підлозі дає додавання під меблями).
    expect(SUN.lift).toBeLessThanOrEqual(0.4);
    for (const strip of plan.strips) expect(strip.alpha).toBeLessThanOrEqual(SUN.lift);
  });

  it("силует квартири охоплює підлогу й задні стіни, з полем; отвори вікон — усередині", () => {
    const outline = apartmentOutline();
    const h = ISO_WALLS.back;
    for (const [x, y, z] of [
      [0, 0, h],
      [MAP_WIDTH, 0, h],
      [MAP_WIDTH, MAP_HEIGHT, 0],
      [0, MAP_HEIGHT, 0],
      [0, MAP_HEIGHT, h],
      [10, 6, 0],
    ] as const) {
      const p = ISO.toScreen({ x, y });
      expect(inside(outline, { x: p.x, y: p.y - z }), `${x},${y},${z}`).toBe(true);
    }
    for (const pane of PANES) for (const p of paneQuad(pane)) expect(inside(outline, p), pane.room).toBe(true);
    // Далеко за межами — ні.
    expect(inside(outline, { x: 0, y: 0 })).toBe(false);
  });

  it("розширення опуклого многокутника: квадрат 2 × 2 з полем 1 — квадрат 4 × 4", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    for (const points of [square, [...square].reverse()]) {
      const grown = expandConvex(points, 1);
      const xs = grown.map((p) => p.x);
      const ys = grown.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(-1);
      expect(Math.max(...xs)).toBeCloseTo(3);
      expect(Math.min(...ys)).toBeCloseTo(-1);
      expect(Math.max(...ys)).toBeCloseTo(3);
    }
  });

  it("ключ карти: той самий кадр — той самий ключ; свічки мерехтять кроками, лампи — ні", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const lit = d(23 * 60);
    const sources = lightSources(s, lit);
    expect(lightmapKey(lit, sources, 0)).toBe(lightmapKey(lit, sources, 10_000));
    s.modifiers.day = "outage";
    const dark = d(23 * 60, false);
    const candles = lightSources(s, dark);
    expect(lightmapKey(dark, candles, 0)).toBe(lightmapKey(dark, candles, 100));
    expect(lightmapKey(dark, candles, 0)).not.toBe(lightmapKey(dark, candles, 300));
  });
});
