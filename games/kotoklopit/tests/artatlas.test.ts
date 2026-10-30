// Як кадр арту стає на місце (крок 16, «Шов хвилі 1»): чисті частини `atlas.ts` — назва кадру, розмір і pivot, origin
// і масштаб, заглушка. Сам `atlas.ts` імпортує Phaser, тож у Node його не перевірити.

import { describe, expect, it } from "vitest";

import {
  ART_STUB_PREFIX,
  artGeometry,
  artPlacement,
  DEFAULT_GEOMETRY,
  frameNameFor,
  isStubFrame,
  stubHatch,
  stubPixels,
  stubSvg,
  STUB_LOOK,
  STUB_MAX_PX,
} from "../src/view/art/placement";
import type { ArtEntry } from "../src/view/art/types";

const FRIDGE: ArtEntry = { id: "env/fridge", size: { w: 140, h: 260 }, pivot: { x: 70, y: 228 }, states: ["closed", "open"] };
const HEAD: ArtEntry = {
  id: "cat/head/base",
  size: { w: 64, h: 60 },
  pivot: { x: 30, y: 50 },
  layers: ["fill", "shade", "ink"],
  views: ["front", "back"],
  res: 3,
};
const EYES: ArtEntry = {
  id: "cat/eyes",
  size: { w: 40, h: 20 },
  pivot: { x: 20, y: 10 },
  layers: ["fill", "fill-iris", "ink"],
  views: ["front", "back"],
  states: ["open", "half", "closed"],
};

describe("назва кадру", () => {
  it("стан і ракурс за замовчуванням — перші з запису, шар — all", () => {
    expect(frameNameFor("env/fridge", FRIDGE)).toBe("env/fridge/closed");
    expect(frameNameFor("env/fridge", FRIDGE, { state: "open" })).toBe("env/fridge/open");
    expect(frameNameFor("cat/head/base", HEAD, { layer: "ink" })).toBe("cat/head/base/front#ink");
    expect(frameNameFor("cat/head/base", HEAD, { view: "back", layer: "fill" })).toBe("cat/head/base/back#fill");
    expect(frameNameFor("cat/eyes", EYES, { layer: "fill-iris" })).toBe("cat/eyes/open/front#fill-iris");
    expect(frameNameFor("cat/eyes", EYES, { state: "closed", view: "back", layer: "ink" })).toBe("cat/eyes/closed/back#ink");
  });

  it("null — без стану чи ракурсу; без запису — як задано", () => {
    expect(frameNameFor("env/fridge", FRIDGE, { state: null })).toBe("env/fridge");
    expect(frameNameFor("cat/head/base", HEAD, { view: null })).toBe("cat/head/base");
    expect(frameNameFor("icon/thirst", undefined)).toBe("icon/thirst");
    expect(frameNameFor("env/lamp", undefined, { state: "on", view: "front", layer: "shade" })).toBe("env/lamp/on/front#shade");
  });
});

describe("розмір, pivot і розміщення", () => {
  it("розмір і pivot: запис → fallback → кадр атласу → 64 × 64", () => {
    const fallback = { size: { w: 10, h: 20 }, pivot: { x: 5, y: 18 } };
    const frame = { px: { w: 80, h: 40 }, res: 2 };
    expect(artGeometry(FRIDGE, fallback, frame)).toEqual({ size: FRIDGE.size, pivot: FRIDGE.pivot });
    expect(artGeometry(undefined, fallback, frame)).toEqual(fallback);
    expect(artGeometry(undefined, undefined, frame)).toEqual({ size: { w: 40, h: 20 }, pivot: { x: 20, y: 10 } });
    expect(artGeometry(undefined, undefined, null)).toEqual(DEFAULT_GEOMETRY);
    expect(DEFAULT_GEOMETRY).toEqual({ size: { w: 64, h: 64 }, pivot: { x: 32, y: 32 } });
  });

  it("origin — у pivot, масштаб — 1/res для кадру атласу", () => {
    // Кадр атласу без обрізки — size · res пікселів.
    expect(artPlacement(FRIDGE, { w: 280, h: 520 })).toEqual({ originX: 0.5, originY: 228 / 260, scaleX: 0.5, scaleY: 0.5 });
    expect(artPlacement(HEAD, { w: 192, h: 180 })).toEqual({ originX: 30 / 64, originY: 50 / 60, scaleX: 1 / 3, scaleY: 1 / 3 });
  });

  it("полотно займає у світі рівно size одиниць, хоч яка роздільність текстури", () => {
    for (const px of [{ w: 140, h: 260 }, { w: 71, h: 131 }, stubPixels(FRIDGE.size)]) {
      const p = artPlacement(FRIDGE, px);
      expect(px.w * p.scaleX).toBeCloseTo(FRIDGE.size.w, 9);
      expect(px.h * p.scaleY).toBeCloseTo(FRIDGE.size.h, 9);
      // Pivot полотна — у точці зображення.
      expect(p.originX * px.w * p.scaleX).toBeCloseTo(FRIDGE.pivot.x, 9);
      expect(p.originY * px.h * p.scaleY).toBeCloseTo(FRIDGE.pivot.y, 9);
    }
  });
});

describe("заглушка", () => {
  it("2 пікселі на одиницю, але не більше за STUB_MAX_PX по більшій стороні", () => {
    expect(stubPixels({ w: 64, h: 64 })).toEqual({ w: 128, h: 128 });
    expect(stubPixels({ w: 40, h: 25 })).toEqual({ w: 80, h: 50 });
    // Плита вітальні: 1472 × 736 одиниць.
    expect(stubPixels({ w: 1472, h: 736 })).toEqual({ w: STUB_MAX_PX, h: STUB_MAX_PX / 2 });
    expect(stubPixels({ w: 3, h: 2000 })).toEqual({ w: 1, h: STUB_MAX_PX });
  });

  it("штриховка вкриває полотно похилими лініями", () => {
    const lines = stubHatch(100, 40, 10);
    expect(lines[0]).toEqual({ x0: 5, y0: 0, x1: -35, y1: 40 });
    expect(lines).toHaveLength(14);
    for (const line of lines) expect(line.x0 - line.x1).toBe(40);
    expect(Math.max(...lines.map((line) => line.x1))).toBeGreaterThan(100 - 10);
  });

  it("заглушка — і текстура рантайму, і кадр атласу, який конвеєр намалював заглушкою (customData.stub)", () => {
    // Заглушка рантайму: кадру в атласі немає.
    expect(isStubFrame(`${ART_STUB_PREFIX}128x128@64,64`, {})).toBe(true);
    // Кадр атласу, позначений конвеєром (`atlasload.ts`: customData.stub з index.json) — теж заглушка: наповнення холодильника.
    expect(isStubFrame("art", { pivot: { x: 70, y: 228 }, points: {}, stub: true })).toBe(true);
    // Намальований кадр атласу.
    expect(isStubFrame("art", { pivot: { x: 70, y: 228 }, points: {}, stub: false })).toBe(false);
    expect(isStubFrame("art", {})).toBe(false);
    expect(isStubFrame("art", undefined)).toBe(false);
    expect(isStubFrame("art", null)).toBe(false);
  });

  it("SVG заглушки — розмір запису, маджента, без тексту", () => {
    const svg = stubSvg(FRIDGE);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 140 260"/);
    expect(svg).toContain(`width="140" height="260"`);
    expect(svg).toContain(`fill="${STUB_LOOK.fill}"`);
    expect(STUB_LOOK.fill).toBe("#ff00ff");
    expect(svg).toContain(`<circle cx="70" cy="228"`);
    expect(svg).not.toMatch(/<text/);
  });
});
