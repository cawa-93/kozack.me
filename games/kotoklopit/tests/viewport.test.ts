// Масштаб камери квартири (§8.4, `src/view/zoom.ts`): зум — більший із «видно всю квартиру» й «клітинка не дрібніша за
// мінімум у px CSS». В ізометрії дорослий кіт (≈ 56 одиниць арту) на телефоні 844 × 390 — ≈ 40 px CSS, на десктопі з
// великим вікном квартиру видно цілою.

import { describe, expect, it } from "vitest";

import { ISO } from "../src/view/world/projection";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  cameraZoom,
  canvasFit,
  fitsWhole,
  FOLLOW_LIFT,
  followTarget,
  HUD_HEIGHT,
  MAX_CANVAS_PIXELS,
  MAX_DENSITY,
  MAX_TEXT_RESOLUTION,
  MIN_TILE_CSS,
  textResolution,
  type ZoomView,
} from "../src/view/zoom";

/**
 * Область квартири на екрані CSS `cssWidth × cssHeight` так, як її рахує `Viewport.layout` на програмному WebGL (полотно
 * в одиницях інтерфейсу: основа 1280 × 720 ширшає чи вищає під форму екрана, `canvasFit` з `software`), під панеллю й
 * безпечною зоною вгорі. З пікселями пристрою зум у px CSS той самий — див. останній блок.
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
  it("телефон 844 × 390: ромб 46 px CSS, кіт ≈ 40 px, камера стежить", () => {
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

describe("за чим іде камера", () => {
  /** Персонаж до маківки й бабл думки над ним — одиниць арту (`GRAPHICS_PLAN.md`, «Контракти»; `BUBBLE_ROOM`). */
  const PERSON = 140;
  const BUBBLE = 78;

  it("точка — ноги за симуляцією на FOLLOW_LIFT вище; пише в той самий об'єкт", () => {
    const out = { x: 0, y: 0 };
    const body = { x: 9.5, y: 6.5 };
    const feet = ISO.toScreen(body);
    expect(followTarget(ISO, body, out)).toBe(out);
    expect(out).toEqual({ x: feet.x, y: feet.y - FOLLOW_LIFT });
  });

  it("телефон 844 × 390: під ногами 120–160 px CSS квартири, а голова з баблом — під панеллю", () => {
    const v = view(844, 390);
    const zoom = cameraZoom(v, ISO);
    const half = v.height / zoom / 2;
    // Ноги — на FOLLOW_LIFT нижче середини огляду.
    const belowFeet = css(half - FOLLOW_LIFT, zoom, v);
    expect(belowFeet).toBeGreaterThan(120);
    expect(belowFeet).toBeLessThan(160);
    // Верх бабла над головою — нижче верхнього краю огляду (панелі) щонайменше на 40 px CSS.
    const aboveBubble = css(half - (PERSON + BUBBLE - FOLLOW_LIFT), zoom, v);
    expect(aboveBubble).toBeGreaterThan(40);
  });
});

describe("полотно в пікселях пристрою (canvasFit)", () => {
  it("програмний WebGL — полотно як раніше (1280 × 720, що ширшає чи вищає), інтерфейс без масштабу", () => {
    for (const [w, h] of [
      [844, 390],
      [1280, 720],
      [1440, 900],
      [390, 844],
    ] as const) {
      const fit = canvasFit({ width: w, height: h }, 3, true);
      const old = view(w, h);
      expect(fit.ui).toBe(1);
      expect(fit.density).toBeCloseTo(old.cssScale, 9);
      expect(fit.height).toBeCloseTo(old.height + HUD_HEIGHT, 9);
      expect(fit.width).toBeCloseTo(w * old.cssScale, 9);
    }
  });

  it("телефон 844 × 390 за DPR 3 — щільність 2,5 (не 3), інтерфейс у тих самих одиницях", () => {
    const fit = canvasFit({ width: 844, height: 390 }, 3, false);
    expect(fit.density).toBeCloseTo(MAX_DENSITY, 2);
    expect(fit.width).toBe(2110);
    expect(fit.height).toBe(975);
    // Інтерфейс — ті самі 1558 × 720 одиниць, що й раніше.
    expect(fit.height / fit.ui).toBeCloseTo(BASE_HEIGHT, 9);
    expect(fit.width / fit.ui).toBeCloseTo(view(844, 390).width, 0);
  });

  it("десктоп за DPR 1: полотно — пікселі вікна, інтерфейс збільшено", () => {
    expect(canvasFit({ width: 1920, height: 1080 }, 1, false)).toMatchObject({ width: 1920, height: 1080, ui: 1.5 });
    expect(canvasFit({ width: 2560, height: 1440 }, 1, false)).toMatchObject({ width: 2560, height: 1440, ui: 2 });
    const mac = canvasFit({ width: 1440, height: 900 }, 2, false);
    expect(mac).toMatchObject({ width: 2880, height: 1800 });
    expect(mac.ui).toBeCloseTo(2.25, 9);
  });

  it("не більше MAX_CANVAS_PIXELS і не дрібніше за одиниці інтерфейсу", () => {
    const big = canvasFit({ width: 2560, height: 1440 }, 1.5, false);
    expect(big.width * big.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS * 1.001);
    expect(big.density).toBeGreaterThan(1);
    // Мале вікно за DPR 1: полотно, як і раніше, більше за вікно (браузер його зменшує), а не дрібніше.
    const small = canvasFit({ width: 844, height: 390 }, 1, false);
    expect(small.ui).toBeCloseTo(1, 2);
    expect(small.height).toBe(BASE_HEIGHT);
  });

  it("тека без розміру — як вікно 1280 × 720", () => {
    expect(canvasFit({ width: 0, height: 0 }, 2, false)).toMatchObject({ width: 2560, height: 1440, ui: 2 });
  });

  it("зум квартири за новою щільністю — та сама клітинка в px CSS, що й раніше", () => {
    const fit = canvasFit({ width: 844, height: 390 }, 3, false);
    const area = { width: fit.width, height: fit.height - HUD_HEIGHT * fit.ui, cssScale: fit.density };
    const zoom = cameraZoom(area, ISO);
    expect(css(ISO.tile.height, zoom, area)).toBeCloseTo(MIN_TILE_CSS, 6);
  });
});

describe("роздільність тексту (textResolution)", () => {
  it("напис інтерфейсу — піксель у піксель полотна: роздільність — зум камери інтерфейсу", () => {
    // 1440 × 900 за DPR 2 — зум 2,25 (стала 2 була м'якою), 2560 × 1440 за DPR 2 — ≈ 2,55, телефон 844 × 390 за DPR 3 — ≈ 1,35.
    expect(textResolution(canvasFit({ width: 1440, height: 900 }, 2, false).ui)).toBe(2.25);
    expect(textResolution(canvasFit({ width: 2560, height: 1440 }, 2, false).ui)).toBeCloseTo(2.55, 2);
    expect(textResolution(canvasFit({ width: 844, height: 390 }, 3, false).ui)).toBeCloseTo(1.35, 2);
    expect(textResolution(canvasFit({ width: 1280, height: 720 }, 1, false).ui)).toBe(1);
    // Програмний WebGL — полотно в одиницях інтерфейсу.
    expect(textResolution(canvasFit({ width: 844, height: 390 }, 3, true).ui)).toBe(1);
  });

  it("не менше 1 і не більше межі; на будь-якому екрані зум інтерфейсу в межах", () => {
    expect(textResolution(0.4)).toBe(1);
    expect(textResolution(Number.NaN)).toBe(1);
    expect(textResolution(0)).toBe(1);
    expect(textResolution(9)).toBe(MAX_TEXT_RESOLUTION);
    for (const [w, h] of [[640, 360], [844, 390], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [5120, 2880]] as const) {
      for (const dpr of [1, 1.5, 2, 3, 4]) {
        const ui = canvasFit({ width: w, height: h }, dpr, false).ui;
        expect(ui, `${w}×${h}@${dpr}`).toBeLessThanOrEqual(MAX_TEXT_RESOLUTION);
        expect(textResolution(ui)).toBeCloseTo(ui, 2);
      }
    }
  });

  it("сотих досить: зум, що ледь змінився, дає ту саму роздільність (напис не перемальовується)", () => {
    expect(textResolution(2.2501)).toBe(textResolution(2.2499));
    expect(textResolution(1.354)).toBe(1.35);
  });
});
