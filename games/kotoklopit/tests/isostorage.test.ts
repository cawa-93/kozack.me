// Індикатор вмісту сховищ (§6.4, `STORAGE_LOOK`, крок 16, T4): папір, чорнильна рамка й тінь з палітри арту (`art/STYLE.md`).

import { describe, expect, it } from "vitest";

import { PALETTE, SHADE } from "../art/palette";
import { BUBBLE_ROOM } from "../src/view/iso/markslayout";
import { clearOfHead, STORAGE_LOOK } from "../src/view/storage";

describe("індикатор сховищ (§6.4)", () => {
  it("папір, чорнильна рамка й тінь з палітри арту, у масштабі камери ізометрії", () => {
    const look = STORAGE_LOOK;
    const hex = (color: string): number => Number.parseInt(color.slice(1), 16);
    expect(look.fill).toBe(hex(PALETTE.paper));
    expect(look.lineColor).toBe(hex(PALETTE.ink));
    expect(look.dropColor).toBe(hex(PALETTE.shade));
    expect(Object.values(SHADE)).toContain(look.dropAlpha);
    // Нуль — червоний сенсу «ні» (STYLE §3), а не redLo — колір ліній матеріалу.
    expect([PALETTE.ink, PALETTE.red]).toEqual([look.text, look.zero]);
    // Над баблом стану — на місце бабла.
    expect(look.bubbleLift).toBe(BUBBLE_ROOM);
    // Одиниця світу ізометрії дрібна (≈ 0,72 px CSS на телефоні): іконка й цифри — у 1,3 раза більші за першу чернетку.
    expect([look.icon, look.chip, look.wideChip, look.pad, look.fontSize]).toEqual([34, 65, 99, 7, 20]);
  });

  it("плашка не закриває голову персонажа, що стоїть під нею", () => {
    const iso = STORAGE_LOOK;
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
    // Без персонажа — де була.
    expect(clearOfHead(iso, plate, null)).toBe(plate.y);
  });
});
