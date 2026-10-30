// Масштаб камери квартири (§8.4, `src/view/zoom.ts`): зум — більший із «видно всю квартиру» й «клітинка не дрібніша за
// мінімум у px CSS». В ізометрії дорослий кіт (≈ 56 одиниць арту) на телефоні 844 × 390 — ≈ 40 px CSS, на десктопі з
// великим вікном квартиру видно цілою; старий вигляд — як був (мінімум 44 px клітинки).

import { describe, expect, it } from "vitest";

import { ISO, OBLIQUE, type Projection } from "../src/view/world/projection";
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
    expect(css(ISO.tile.height, zoom, v)).toBeCloseTo(MIN_TILE_CSS.iso, 9);
    expect(css(CAT, zoom, v)).toBeGreaterThan(38);
    expect(css(CAT, zoom, v)).toBeLessThan(42);
    expect(fitsWhole(v, ISO)).toBe(false);
    // З вирізом камери вгорі (безпечна зона) — той самий масштаб: мінімум не залежить від висоти області.
    expect(cameraZoom(view(844, 390, 30), ISO)).toBeCloseTo(zoom, 9);
  });

  it("1280 × 720: квартира в мінімумі не вміщується — камера стежить, ромб не дрібніший за мінімум", () => {
    const v = view(1280, 720);
    const zoom = cameraZoom(v, ISO);
    expect(zoom).toBeCloseTo(MIN_TILE_CSS.iso / 64, 9);
    expect(fitsWhole(v, ISO)).toBe(false);
  });

  it("десктоп 1920 × 1080: квартиру видно цілою, ромб не дрібніший за мінімум", () => {
    const v = view(1920, 1080);
    const zoom = cameraZoom(v, ISO);
    expect(fitsWhole(v, ISO)).toBe(true);
    expect(zoom).toBeCloseTo(Math.min(v.width / ISO.world.width, v.height / ISO.world.height), 9);
    expect(css(ISO.tile.height, zoom, v)).toBeGreaterThanOrEqual(MIN_TILE_CSS.iso);
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
    // Вікно браузера 1920 × 950 (з панелями браузера) чи 1600 × 900: за мінімуму бракує кількох відсотків висоти. Це
    // розбіжність із §8.4 («від 1600 px — ціла»): відкрите питання автора в GRAPHICS_PLAN.md.
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
      expect(css(ISO.tile.height, zoom, v)).toBeGreaterThanOrEqual(MIN_TILE_CSS.iso - 1e-9);
    }
  });
});

describe("зум камери старого вигляду — без змін", () => {
  /** Як рахував Viewport.layout до кроку 16: клітинка 44 px CSS проти висоти клітинки косої проєкції 50. */
  function before(v: ZoomView, projection: Projection): number {
    const bounds = projection.world;
    const fit = Math.min(v.width / bounds.width, v.height / bounds.height);
    const readable = (44 * v.cssScale) / projection.tile.height;
    return Math.max(fit, readable);
  }

  it("ті самі числа, що й до ізометрії, на телефоні, ноутбуці й десктопі", () => {
    expect(MIN_TILE_CSS.oblique).toBe(44);
    for (const [w, h] of [
      [844, 390],
      [1280, 720],
      [1920, 1080],
      [1600, 900],
      [390, 844],
    ] as const) {
      const v = view(w, h);
      expect(cameraZoom(v, OBLIQUE), `${w}×${h}`).toBe(before(v, OBLIQUE));
    }
    // Старий вигляд на 1280 × 720 вміщується цілим, на телефоні — стежить.
    expect(fitsWhole(view(1280, 720), OBLIQUE)).toBe(true);
    expect(fitsWhole(view(844, 390), OBLIQUE)).toBe(false);
  });
});
