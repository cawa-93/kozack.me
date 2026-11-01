// Індикатор вмісту сховищ (§6.4) у двох виглядах (`STORAGE_LOOKS`, крок 16, T4): старий лишається таким, як був, новий —
// папір, чорнильна рамка й тінь з палітри арту (`art/STYLE.md`).

import { describe, expect, it } from "vitest";

import { PALETTE, SHADE } from "../art/palette";
import { COLORS } from "../src/view/colors";
import { BUBBLE_ROOM } from "../src/view/iso/markslayout";
import { clearOfHead, STORAGE_LOOKS } from "../src/view/storage";

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
      bubbleLift: 56,
      clearHead: false,
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
    // Над баблом стану — на місце бабла нового вигляду.
    expect(look.bubbleLift).toBe(BUBBLE_ROOM);
    expect(look.icon).toBeGreaterThan(STORAGE_LOOKS.oblique.icon);
    expect(look.fontSize).toBeGreaterThan(STORAGE_LOOKS.oblique.fontSize);
  });

  it("нова плашка не закриває голову персонажа, що стоїть під нею; старий вигляд — як був", () => {
    const iso = STORAGE_LOOKS.iso;
    // Купа ящиків (≈ 64) нижча за персонажа (140): плашка над нею — на рівні його голови.
    const plate = { x: 1000, y: 600, width: 100, height: 54 };
    const head = { x: 1020, y: 560 };
    const lifted = clearOfHead(iso, plate, head);
    expect(lifted).toBe(head.y - iso.drop - 2);
    // Плашка з тінню — над точкою його голови.
    expect(lifted + iso.drop).toBeLessThan(head.y);
    // Персонаж збоку чи далеко внизу — плашка там, де була.
    expect(clearOfHead(iso, plate, { x: 1000 + 50 + 26 + 1, y: 560 })).toBe(plate.y);
    expect(clearOfHead(iso, plate, { x: 1000, y: 600 + iso.drop + 1 })).toBe(plate.y);
    expect(clearOfHead(iso, plate, { x: 1000, y: 600 - 54 - 140 - 6 - 1 })).toBe(plate.y);
    // Над головою вже — не опускається.
    expect(clearOfHead(iso, { ...plate, y: 500 }, head)).toBe(500);
    // Старий вигляд не піднімається; без персонажа — теж.
    expect(clearOfHead(STORAGE_LOOKS.oblique, plate, head)).toBe(plate.y);
    expect(clearOfHead(iso, plate, null)).toBe(plate.y);
  });
});
