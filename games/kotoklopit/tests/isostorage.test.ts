// Індикатор вмісту сховищ (§6.4) у двох виглядах (`STORAGE_LOOKS`, крок 16, T4): старий лишається таким, як був, новий —
// папір, чорнильна рамка й тінь з палітри арту (`art/STYLE.md`).

import { describe, expect, it } from "vitest";

import { PALETTE, SHADE } from "../art/palette";
import { COLORS } from "../src/view/colors";
import { STORAGE_LOOKS } from "../src/view/storage";

describe("індикатор сховищ (§6.4)", () => {
  it("старий вигляд — як був", () => {
    expect(STORAGE_LOOKS.oblique).toEqual({
      icon: 26,
      chip: 50,
      wideChip: 76,
      pad: 5,
      radius: 8,
      fill: 0xffffff,
      fillAlpha: 0.95,
      line: 2,
      lineColor: COLORS.ink,
      lineAlpha: 0.6,
      drop: 0,
      dropColor: 0,
      dropAlpha: 0,
      fontSize: 15,
      gap: 2,
      text: "#1f1a24",
      zero: "#d8483b",
    });
  });

  it("нова графіка — папір, чорнильна рамка й тінь з палітри арту, більший на масштаб камери", () => {
    const look = STORAGE_LOOKS.iso;
    const hex = (color: string): number => Number.parseInt(color.slice(1), 16);
    expect(look.fill).toBe(hex(PALETTE.paper));
    expect(look.lineColor).toBe(hex(PALETTE.ink));
    expect(look.dropColor).toBe(hex(PALETTE.shade));
    expect(Object.values(SHADE)).toContain(look.dropAlpha);
    // Нуль — червоний сенсу «ні» (STYLE §3), а не redLo — колір ліній матеріалу.
    expect([PALETTE.ink, PALETTE.red]).toEqual([look.text, look.zero]);
    expect(look.icon).toBeGreaterThan(STORAGE_LOOKS.oblique.icon);
    expect(look.fontSize).toBeGreaterThan(STORAGE_LOOKS.oblique.fontSize);
  });
});
