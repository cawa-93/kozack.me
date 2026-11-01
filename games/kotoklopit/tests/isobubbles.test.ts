// Іконки й бабли нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кожна назва, позначка й фон бабла, які показує код,
// — запис маніфесту (A11, A12); іконка й кількість лягають у бабл, а місця над точкою бабла вистачає на весь бабл.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import { bubbleArt, ICON_NAMES, iconArt, markArt, type BubbleKind, type Mark } from "../src/view/iconnames";
import {
  BESIDE_GAP,
  besideDx,
  BUBBLE_COUNT,
  bubbleSpan,
  countPillCenter,
  countPillWidth,
  countSide,
  ICON_ART_SIZE,
  ISO_BUBBLE_SCALE,
  isoBubbleLook,
  type BubbleSpan,
} from "../src/view/iso/bubblelook";

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

describe("бабл нового вигляду: межі й кількість", () => {
  for (const kind of Object.keys(KINDS) as BubbleKind[]) {
    it(`${kind}: межі — полотно фону від вістря в масштабі; плашка кількості їх лише розширює праворуч`, () => {
      const bubble = entry(bubbleArt(kind));
      const look = isoBubbleLook(kind);
      expect(look.span.left).toBeCloseTo(bubble.pivot.x * look.scale);
      expect(look.span.right).toBeCloseTo((bubble.size.w - bubble.pivot.x) * look.scale);
      expect(bubbleSpan(look)).toEqual(look.span);
      const narrow = bubbleSpan(look, countPillWidth(10));
      const wide = bubbleSpan(look, countPillWidth(60));
      expect(narrow.left).toBe(look.span.left);
      expect(narrow.right).toBeGreaterThanOrEqual(look.span.right);
      expect(wide.right).toBeGreaterThan(narrow.right);
    });

    it(`${kind}: довга кількість росте праворуч від кута іконки, а верх плашки — у місці над точкою`, () => {
      const look = isoBubbleLook(kind);
      const one = countPillCenter(look, BUBBLE_COUNT.height);
      expect(one).toEqual(look.count);
      const long = countPillCenter(look, BUBBLE_COUNT.height + 20);
      // Лівий край той самий — плашка не лізе на іконку.
      expect(long.x - (BUBBLE_COUNT.height + 20) / 2).toBeCloseTo(one.x - BUBBLE_COUNT.height / 2);
      expect(long.y).toBe(one.y);
      const top = -(look.count.y - BUBBLE_COUNT.height / 2 - BUBBLE_COUNT.outline / 2) * look.scale;
      expect(look.room).toBeGreaterThanOrEqual(top + 8);
    });

    it(`${kind}: з позначкою кількість — у лівому верхньому куті, не на позначці; довге число росте ліворуч`, () => {
      const look = isoBubbleLook(kind);
      // Без позначки — праворуч, як і було; з будь-якою позначкою — ліворуч (позначки A12 у правому верхньому куті).
      expect(countSide(undefined)).toBe(1);
      for (const mark of Object.keys(MARKS) as Mark[]) expect(countSide(mark), mark).toBe(-1);
      for (const width of [BUBBLE_COUNT.height, BUBBLE_COUNT.height + 20]) {
        const right = countPillCenter(look, width, 1);
        const left = countPillCenter(look, width, -1);
        // Дзеркально відносно центру іконки, на тій самій висоті.
        expect(left.x - look.icon.x).toBeCloseTo(look.icon.x - right.x);
        expect(left.y).toBe(right.y);
        // Уся плашка — у лівій половині поля іконки й лівіше: правої, де бейджі «?» і «✓» (x ≥ 32,2 з 64), не торкається.
        expect(left.x + width / 2 + BUBBLE_COUNT.outline / 2).toBeLessThanOrEqual(look.icon.x);
      }
      // Правий край плашки на місці — довге число не лізе на іконку.
      const one = countPillCenter(look, BUBBLE_COUNT.height, -1);
      const long = countPillCenter(look, BUBBLE_COUNT.height + 20, -1);
      expect(long.x + (BUBBLE_COUNT.height + 20) / 2).toBeCloseTo(one.x + BUBBLE_COUNT.height / 2);
      // Межі бабла плашка розширює лише ліворуч.
      const pill = countPillWidth(60);
      const span = bubbleSpan(look, pill, -1);
      expect(span.right).toBe(look.span.right);
      expect(span.left).toBeGreaterThanOrEqual(look.span.left);
      expect(span.left).toBeGreaterThanOrEqual(-(countPillCenter(look, pill, -1).x - pill / 2 - BUBBLE_COUNT.outline / 2) * look.scale - 1e-9);
    });
  }
});

describe("два бабли події над тим самим — поруч (besideDx)", () => {
  const step = 58;
  const same: BubbleSpan = { left: step / 2, right: step / 2 };
  const at = (...dxs: number[]): { dx: number; span: BubbleSpan }[] => dxs.map((dx) => ({ dx, span: same }));

  it("однакові бабли старого вигляду — у ряд із кроком: 0, праворуч, ліворуч, далі праворуч", () => {
    expect(besideDx([], same, 0)).toBe(0);
    expect(besideDx(at(0), same, 0)).toBe(step);
    expect(besideDx(at(0, step), same, 0)).toBe(-step);
    expect(besideDx(at(0, step, -step), same, 0)).toBe(2 * step);
    expect(besideDx(at(0, step, -step, 2 * step), same, 0)).toBe(-2 * step);
    // Місце звільнилось — його й займає наступний.
    expect(besideDx(at(step, -step), same, 0)).toBe(0);
    expect(besideDx(at(0, -step), same, 0)).toBe(step);
  });

  it("різні межі нового вигляду: упритул із зазором, ні на кого не налазить", () => {
    const say = isoBubbleLook("say").span;
    const think = isoBubbleLook("think").span;
    const apart = (a: { dx: number; span: BubbleSpan }, b: { dx: number; span: BubbleSpan }): boolean =>
      a.dx + a.span.right + BESIDE_GAP <= b.dx - b.span.left + 1e-6 || b.dx + b.span.right + BESIDE_GAP <= a.dx - a.span.left + 1e-6;
    const first = { dx: 0, span: think };
    const right = think.right + BESIDE_GAP + say.left;
    const left = -(think.left + BESIDE_GAP + say.right);
    // Другий — упритул з того боку, де ближче до точки.
    const second = { dx: besideDx([first], say, BESIDE_GAP), span: say };
    expect(second.dx).toBeCloseTo(Math.abs(left) < right ? left : right);
    expect(apart(first, second)).toBe(true);
    // Третій — з іншого боку, теж упритул.
    const third = { dx: besideDx([first, second], say, BESIDE_GAP), span: say };
    expect(third.dx).toBeCloseTo(Math.abs(left) < right ? right : left);
    expect(apart(first, third) && apart(second, third)).toBe(true);
    // Порожньо — над самою точкою.
    expect(besideDx([], think, BESIDE_GAP)).toBe(0);
  });
});
