// Панель і сенсорне керування нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кадри й стани, які бере код, є в
// маніфесті (A13), а смуга панелі тягнеться «трьома частинами» без зазорів.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import { HUD_ART, HUD_STATES, stretchSlices, TOUCH_ART } from "../src/view/iso/hudlook";
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
