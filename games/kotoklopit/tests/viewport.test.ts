// Масштаб камери квартири (§8.4, `src/view/zoom.ts`): зум — більший із «видно всю квартиру» й «клітинка не дрібніша за
// мінімум у px CSS». В ізометрії дорослий кіт (≈ 56 одиниць арту) на телефоні 844 × 390 — ≈ 40 px CSS, на десктопі з
// великим вікном квартиру видно цілою.

import { describe, expect, it } from "vitest";

import { ISO } from "../src/view/world/projection";
import { BASE_HEIGHT, BASE_WIDTH, cameraZoom, fitsWhole, HUD_HEIGHT, MIN_TILE_CSS, type ZoomView } from "../src/view/zoom";

/**
 * Область квартири на екрані CSS `cssWidth × cssHeight` так, як її рахує `Viewport.layout`: полотно Phaser в режимі
 * EXPAND (основа 1280 × 720 ширшає чи вищає під форму екрана), під панеллю й безпечною зоною вгорі.
 */
function view(cssWidth: number, cssHeight: number, safeTopCss = 0): ZoomView {
  const sx = cssWidth / BASE_WIDTH;
  const sy = cssHeight / BASE_HEIGHT;
  const width = sx < sy ? BASE_WIDTH : cssWidth / sy;
  const height = sx < sy ? cssHeight / sx : BASE_HEIGHT;
  const cssScale = height / cssHeight;
  return { width, height: height - (safeTopCss * cssScale + HUD_HEIGHT), cssScale };
}

/** Скільки px CSS займає `units` одиниць світу за зуму камери. */
function css(units: number, zoom: number, v: ZoomView): number {
  return (units * zoom) / v.cssScale;
}

/** Дорослий кіт, що стоїть, до кінчиків вух — одиниць арту (`GRAPHICS_PLAN.md`, «Контракти»). */
const CAT = 56;

describe("зум камери в ізометрії", () => {
  it("телефон 844 × 390 (DPR 3 не входить: полотно — у px CSS): ромб 46 px CSS, кіт ≈ 40 px, камера стежить", () => {
    const v = view(844, 390);
    const zoom = cameraZoom(v, ISO);
    expect(css(ISO.tile.height, zoom, v)).toBeCloseTo(MIN_TILE_CSS, 9);
    expect(css(CAT, zoom, v)).toBeGreaterThan(38);
    expect(css(CAT, zoom, v)).toBeLessThan(42);
    expect(fitsWhole(v, ISO)).toBe(false);
    // З вирізом камери вгорі (безпечна зона) — той самий масштаб: мінімум не залежить від висоти області.
    expect(cameraZoom(view(844, 390, 30), ISO)).toBeCloseTo(zoom, 9);
  });

  it("1280 × 720: квартира в мінімумі не вміщується — камера стежить, ромб не дрібніший за мінімум", () => {
    const v = view(1280, 720);
    const zoom = cameraZoom(v, ISO);
    expect(zoom).toBeCloseTo(MIN_TILE_CSS / 64, 9);
    expect(fitsWhole(v, ISO)).toBe(false);
  });

  it("десктоп 1920 × 1080: квартиру видно цілою, ромб не дрібніший за мінімум", () => {
    const v = view(1920, 1080);
    const zoom = cameraZoom(v, ISO);
    expect(fitsWhole(v, ISO)).toBe(true);
    expect(zoom).toBeCloseTo(Math.min(v.width / ISO.world.width, v.height / ISO.world.height), 9);
    expect(css(ISO.tile.height, zoom, v)).toBeGreaterThanOrEqual(MIN_TILE_CSS);
  });

  it("вікно від 1600 px CSS і достатньої висоти (від ~1000 px) — квартиру видно цілою; нижче — камера стежить", () => {
    for (const [w, h] of [
      [1600, 1000],
      [1920, 1080],
      [1920, 1200],
      [2560, 1440],
    ] as const) {
      expect(fitsWhole(view(w, h), ISO), `${w}×${h}`).toBe(true);
    }
    // Вікно браузера 1920 × 950 (з панелями браузера) чи 1600 × 900: за мінімуму бракує кількох відсотків висоти, і камера
    // стежить, як на телефоні. Так і задумано: квартира не мусить уміщуватися цілою й на десктопі (§8.4, рішення автора
    // 2026-10-30).
    expect(fitsWhole(view(1920, 950), ISO)).toBe(false);
    expect(fitsWhole(view(1600, 900), ISO)).toBe(false);
  });

  it("зум не менший за той, що вміщує квартиру, і не дає ромба дрібнішого за мінімум — на будь-якому екрані", () => {
    for (const [w, h] of [
      [844, 390],
      [390, 844],
      [1024, 768],
      [1366, 768],
      [3840, 2160],
    ] as const) {
      const v = view(w, h);
      const zoom = cameraZoom(v, ISO);
      expect(zoom).toBeGreaterThanOrEqual(Math.min(v.width / ISO.world.width, v.height / ISO.world.height) - 1e-12);
      expect(css(ISO.tile.height, zoom, v)).toBeGreaterThanOrEqual(MIN_TILE_CSS - 1e-9);
    }
  });
});
