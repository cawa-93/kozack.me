// Іконки й бабли нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кожна назва, позначка й фон бабла, які показує код,
// — запис маніфесту (A11, A12); іконка й кількість лягають у бабл, а місця над точкою бабла вистачає на весь бабл.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import { bubbleArt, ICON_NAMES, iconArt, markArt, type BubbleKind, type Mark } from "../src/view/iconnames";
import { BUBBLE_COUNT, countPillWidth, ICON_ART_SIZE, ISO_BUBBLE_SCALE, isoBubbleLook } from "../src/view/iso/bubblelook";

function entry(id: string): ArtEntry {
  const found = artEntry(id);
  if (!found) throw new Error(`немає запису «${id}»`);
  return found;
}

const KINDS: Record<BubbleKind, true> = { say: true, think: true };
const MARKS: Record<Mark, true> = { no: true, ask: true, ok: true };

describe("іконки нового вигляду — кадри атласу", () => {
  it("кожна назва іконки, позначка й фон бабла мають запис маніфесту", () => {
    for (const name of ICON_NAMES) expect(entry(iconArt(name)).size, name).toEqual({ w: ICON_ART_SIZE, h: ICON_ART_SIZE });
    for (const mark of Object.keys(MARKS) as Mark[]) expect(entry(markArt(mark)).size).toEqual({ w: ICON_ART_SIZE, h: ICON_ART_SIZE });
    for (const kind of Object.keys(KINDS) as BubbleKind[]) expect(entry(bubbleArt(kind)).points?.["icon"], kind).toBeDefined();
  });

  it("іконка — по центру свого полотна: код ставить її за центром", () => {
    for (const name of ICON_NAMES) expect(entry(iconArt(name)).pivot).toEqual({ x: ICON_ART_SIZE / 2, y: ICON_ART_SIZE / 2 });
  });
});

describe("бабл нового вигляду", () => {
  for (const kind of Object.keys(KINDS) as BubbleKind[]) {
    it(`${kind}: іконка й кількість у межах фону, місце над точкою — увесь бабл`, () => {
      const bubble = entry(bubbleArt(kind));
      const look = isoBubbleLook(kind);
      // Поле іконки — у полотні фону (від вістря в pivot).
      const left = bubble.pivot.x + look.icon.x - look.iconSize / 2;
      const top = bubble.pivot.y + look.icon.y - look.iconSize / 2;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + look.iconSize).toBeLessThanOrEqual(bubble.size.w);
      expect(top + look.iconSize).toBeLessThanOrEqual(bubble.size.h);
      // Іконка — над вістрям.
      expect(look.icon.y).toBeLessThan(0);
      // Кількість — у правому верхньому куті поля іконки.
      expect(look.count.x).toBeGreaterThan(look.icon.x);
      expect(look.count.y).toBeLessThan(look.icon.y);
      // Вище за точку бабл займає верх фону (від вістря) у масштабі й виринання.
      expect(look.room).toBeGreaterThanOrEqual(bubble.pivot.y * look.scale + 8);
      expect(look.scale).toBe(ISO_BUBBLE_SCALE);
    });
  }

  it("думка вища за мовну хмаринку — і місця над головою їй треба більше", () => {
    expect(isoBubbleLook("think").room).toBeGreaterThan(isoBubbleLook("say").room);
  });

  it("плашка кількості — кружечок для цифри, ширшає з довгим числом", () => {
    expect(countPillWidth(10)).toBe(BUBBLE_COUNT.height);
    expect(countPillWidth(40)).toBe(40 + BUBBLE_COUNT.pad);
  });
});
