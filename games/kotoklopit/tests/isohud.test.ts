// Панель і сенсорне керування нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кадри й стани, які бере код, є в
// маніфесті (A13), а смуга панелі тягнеться «трьома частинами» без зазорів.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import {
  bandRect,
  drawnInside,
  HUD_ART,
  HUD_ART_MARGIN,
  HUD_BAND,
  HUD_BAR,
  HUD_STATES,
  isoBarRects,
  stretchRect,
  stretchSlices,
  TOUCH_ART,
} from "../src/view/iso/hudlook";
import { isoPopColor, uiEntry } from "../src/view/iso/uilook";
import { HUD_HEIGHT } from "../src/view/zoom";

function entry(id: string): ArtEntry {
  const found = artEntry(id);
  if (!found) throw new Error(`немає запису «${id}»`);
  return found;
}

describe("панель і сенсорні кнопки нового вигляду", () => {
  it("кадри й стани, які бере код, є в маніфесті (A13)", () => {
    for (const id of [...Object.values(HUD_ART), ...Object.values(TOUCH_ART)]) entry(id);
    const has = (id: string, states: Record<string, string>): void => {
      for (const state of Object.values(states)) expect(entry(id).states, `${id}: ${state}`).toContain(state);
    };
    has(HUD_ART.phone, HUD_STATES.phone);
    has(HUD_ART.fullscreen, HUD_STATES.fullscreen);
    has(TOUCH_ART.action, HUD_STATES.action);
    has(TOUCH_ART.dash, HUD_STATES.dash);
  });

  it("смуга панелі не нижча за панель і має кути, що не тягнуться", () => {
    const band = entry(HUD_ART.band);
    expect(band.size.h).toBeGreaterThanOrEqual(HUD_HEIGHT);
    const cap = band.points?.["slice"]?.x ?? 0;
    expect(cap).toBeGreaterThan(0);
    expect(cap * 2).toBeLessThan(band.size.w);
  });

  it("три частини смуги вкривають усю ширину без зазорів, кути не тягнуться", () => {
    for (const width of [1280, 1558, 1600, 300]) {
      const slices = stretchSlices(256, 24, width);
      expect(slices).toHaveLength(3);
      let x = 0;
      for (const s of slices) {
        expect(s.x).toBeCloseTo(x);
        x += s.w;
      }
      expect(x).toBeCloseTo(width);
      expect(slices[0]).toEqual({ src: 0, srcW: 24, x: 0, w: 24 });
      expect(slices[2]).toEqual({ src: 232, srcW: 24, x: width - 24, w: 24 });
      expect(slices[1]?.srcW).toBe(208);
    }
  });

  it("смуга вужча за два кути — самі кути, стиснуті навпіл", () => {
    expect(stretchSlices(256, 24, 30)).toEqual([
      { src: 0, srcW: 24, x: 0, w: 15 },
      { src: 232, srcW: 24, x: 15, w: 15 },
    ]);
    expect(stretchSlices(256, 24, 0)).toEqual([]);
  });
});

describe("кадри панелі нового вигляду на місці", () => {
  it("кути «трьох частин» — у масштабі висоти, середина добирає ширину", () => {
    const slices = stretchSlices(120, 10, 200, 1.5);
    expect(slices[0]).toEqual({ src: 0, srcW: 10, x: 0, w: 15 });
    expect(slices[1]).toEqual({ src: 10, srcW: 100, x: 15, w: 170 });
    expect(slices[2]).toEqual({ src: 110, srcW: 10, x: 185, w: 15 });
  });

  it("намальована частина полотна лягає рівно на ціль, масштаб — за висотою", () => {
    const frame = { w: 120, h: 20 };
    const drawn = drawnInside(frame);
    expect(drawn).toEqual({ left: HUD_ART_MARGIN, top: HUD_ART_MARGIN, right: 120 - HUD_ART_MARGIN, bottom: 20 - HUD_ART_MARGIN });
    const target = { x: 100, y: 10, w: 114, h: 16 };
    const rect = stretchRect(target, frame, drawn);
    const k = rect.h / frame.h;
    expect(k).toBeCloseTo(target.h / (drawn.bottom - drawn.top));
    expect(rect.x + drawn.left * k).toBeCloseTo(target.x);
    expect(rect.y + drawn.top * k).toBeCloseTo(target.y);
    // Справа поле полотна — у масштабі висоти, як і кут.
    expect(rect.x + rect.w - (frame.w - drawn.right) * k).toBeCloseTo(target.x + target.w);
  });

  it("смуга: верх намальованого — край екрана, низ чорнильного краю — межа панелі, загини з боків — за екраном", () => {
    const frame = uiEntry(HUD_ART.band).size;
    for (const height of [76, 100]) {
      const rect = bandRect(frame, 1280, height);
      const k = rect.h / frame.h;
      expect(rect.y + HUD_ART_MARGIN * k).toBeCloseTo(0);
      expect(rect.y + HUD_BAND.edge * k).toBeCloseTo(height);
      // Загини краю з боків — за екраном.
      expect(rect.x + HUD_BAND.side * k).toBeCloseTo(0);
      expect(rect.x + rect.w - HUD_BAND.side * k).toBeCloseTo(1280);
    }
    expect(HUD_BAND.edge).toBeLessThanOrEqual(frame.h);
  });

  it("шкала: заливка — під рамкою, усередині старої шкали по ширині й по центру по висоті", () => {
    const old = { x: 200, y: 26, w: 116, h: 12 };
    const { frame, fill } = isoBarRects(old, uiEntry(HUD_ART.bar).size);
    expect(fill.x).toBeGreaterThan(old.x);
    expect(fill.x + fill.w).toBeLessThan(old.x + old.w);
    expect(fill.y + fill.h / 2).toBeCloseTo(old.y + old.h / 2);
    expect(fill.h).toBe(HUD_BAR.height - 2 * HUD_BAR.inset);
    // Полотно рамки ширше й вище за заливку.
    expect(frame.x).toBeLessThan(fill.x);
    expect(frame.y).toBeLessThan(fill.y);
    expect(frame.x + frame.w).toBeGreaterThan(fill.x + fill.w);
    expect(frame.y + frame.h).toBeGreaterThan(fill.y + fill.h);
  });

  it("запис, без якого інтерфейс не складеться, — помилка, а не запасні числа", () => {
    expect(() => uiEntry("ui/hud/немає")).toThrow();
  });

  it("напис над світом: зелений грошей — токен палітри, невідомий колір — як є", () => {
    expect(isoPopColor("#8fdc7a")).not.toBe("#8fdc7a");
    expect(isoPopColor("#8FDC7A")).toBe(isoPopColor("#8fdc7a"));
    expect(isoPopColor("#123456")).toBe("#123456");
  });
});
