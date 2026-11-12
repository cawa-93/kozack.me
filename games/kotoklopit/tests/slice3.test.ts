// Фігура змінної ширини з трьох частин кадру атласу (`src/view/slice3.ts`): краї не тягнуться, середина добирає ширину.

import { describe, expect, it } from "vitest";

import { slice3, slice3Frame, type Slice3Frame } from "../src/view/slice3";

/** Плашка з обвідкою: тіло 35 × 32, заокруглення 16, обвідка виходить за тіло на 1,5. */
const PILL: Slice3Frame = { size: { w: 46, h: 43 }, body: { left: 5.5, top: 5.5, right: 40.5, bottom: 37.5 }, cap: 16, bleed: 1.5 };
/** Заливка без обвідки: тіло 14 × 12, заокруглення 6. */
const FILL: Slice3Frame = { size: { w: 22, h: 20 }, body: { left: 4, top: 4, right: 18, bottom: 16 }, cap: 6, bleed: 0 };

describe("три частини кадру (slice3)", () => {
  it("тіло кадру лягає рівно на ціль: краї — як намальовані, середина заповнює решту", () => {
    const { scale, y, parts } = slice3(PILL, { x: 100, y: 50, w: 80, h: 32 });
    expect(scale).toBe(1);
    // Полотно — вище за ціль на поле кадру.
    expect(y).toBe(50 - 5.5);
    expect(parts).toEqual([
      { src: 4, srcW: 17.5, x: 98.5, w: 17.5 },
      { src: 21.5, srcW: 3, x: 116, w: 48 },
      { src: 24.5, srcW: 17.5, x: 164, w: 17.5 },
    ]);
  });

  it("краї — у масштабі висоти, а не ширини: ширша ціль розтягує лише середину", () => {
    const narrow = slice3(PILL, { x: 0, y: 0, w: 100, h: 64 });
    const wide = slice3(PILL, { x: 0, y: 0, w: 400, h: 64 });
    expect(narrow.scale).toBe(2);
    for (const layout of [narrow, wide]) {
      expect(layout.parts[0]).toEqual({ src: 4, srcW: 17.5, x: -3, w: 35 });
      expect(layout.parts[2]?.w).toBe(35);
    }
    expect(narrow.parts[1]).toEqual({ src: 21.5, srcW: 3, x: 32, w: 36 });
    expect(wide.parts[1]).toEqual({ src: 21.5, srcW: 3, x: 32, w: 336 });
    expect(wide.parts[2]?.x).toBe(400 - 32);
  });

  it("частини вкривають ціль без зазорів і накладань", () => {
    for (const w of [32, 33, 50, 200]) {
      const { parts } = slice3(PILL, { x: 10, y: 0, w, h: 32 });
      let x = 10 - 1.5;
      for (const part of parts) {
        if (!part) continue;
        expect(part.x).toBeCloseTo(x);
        x += part.w;
      }
      expect(x).toBeCloseTo(10 + w + 1.5);
    }
  });

  it("найменша ширина — два краї: середини немає", () => {
    const { parts } = slice3(PILL, { x: 0, y: 0, w: 32, h: 32 });
    expect(parts[1]).toBeNull();
    expect(parts[0]).toEqual({ src: 4, srcW: 17.5, x: -1.5, w: 17.5 });
    expect(parts[2]).toEqual({ src: 24.5, srcW: 17.5, x: 16, w: 17.5 });
  });

  it("вужче за два краї — краї стиснуті навпіл і не виходять за ціль", () => {
    const { parts } = slice3(FILL, { x: 200, y: 30, w: 5, h: 12 });
    expect(parts).toEqual([{ src: 4, srcW: 6, x: 200, w: 2.5 }, null, { src: 12, srcW: 6, x: 202.5, w: 2.5 }]);
  });

  it("нульова ширина — нічого", () => {
    expect(slice3(FILL, { x: 200, y: 30, w: 0, h: 12 }).parts).toEqual([null, null, null]);
  });

  it("кадр — із запису маніфесту: тіло між точками body і body-end, край — cap, усе за тілом від поля полотна — у краях", () => {
    const entry = { id: "ui/x", size: { w: 46, h: 43 }, pivot: { x: 23, y: 21.5 }, points: { body: { x: 5.5, y: 5.5 }, "body-end": { x: 40.5, y: 37.5 }, cap: { x: 16, y: 0 } } } as const;
    expect(slice3Frame(entry)).toEqual(PILL);
    expect(() => slice3Frame({ id: "ui/y", size: { w: 10, h: 10 } })).toThrow(/ui\/y/);
  });
});
