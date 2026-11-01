// Іконки й бабли нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кожна назва, позначка й фон бабла, які показує код,
// — запис маніфесту (A11, A12); іконка й кількість лягають у бабл, а місця над точкою бабла вистачає на весь бабл.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import { bubbleArt, ICON_NAMES, iconArt, markArt, type BubbleKind, type Mark } from "../src/view/iconnames";
import {
  BESIDE_GAP,
  BESIDE_MAX_WIDTHS,
  BUBBLE_COUNT,
  bubbleSpan,
  countPillCenter,
  countPillWidth,
  countSide,
  ICON_ART_SIZE,
  ISO_BUBBLE_SCALE,
  isoBubbleLook,
  layoutBubbles,
  type BubbleBounds,
  type BubbleSpan,
  type LaidBubble,
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

describe("бабли поруч (layoutBubbles)", () => {
  const say = isoBubbleLook("say");
  const think = isoBubbleLook("think");
  const height = say.room;
  const width = say.span.left + say.span.right;
  /** Сталий крок старого вигляду: однакові бабли завширшки 58. */
  const step = 58;
  const same: BubbleSpan = { left: step / 2, right: step / 2 };

  /** Бабл над `owner` у точці (`x`, 200). */
  const bubble = (owner: string | undefined, icon: string, x: number, over: Partial<LaidBubble> = {}): LaidBubble => ({
    owner,
    icon,
    x,
    y: 200,
    span: say.span,
    height,
    visible: true,
    target: 0,
    ...over,
  });
  const lay = (list: LaidBubble[], bounds?: BubbleBounds, gap = BESIDE_GAP): number[] => {
    layoutBubbles(list, list.length, bounds, gap);
    return list.map((b) => b.target);
  };
  /** Чи два бабли не налазять один на один (із зазором `gap`). */
  const apart = (a: LaidBubble, b: LaidBubble, gap = BESIDE_GAP): boolean => {
    const ax = a.x + a.target;
    const bx = b.x + b.target;
    return ax + a.span.right + gap <= bx - b.span.left + 1e-6 || bx + b.span.right + gap <= ax - a.span.left + 1e-6;
  };
  const near = (values: number[], expected: number[]): void => {
    expect(values.length).toBe(expected.length);
    values.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!));
  };

  describe("над тим самим", () => {
    it("однакові бабли — у ряд посередині над точкою, хто виринув раніше — лівіше", () => {
      const row = (k: number): number[] => lay(Array.from({ length: k }, (_, i) => bubble("a", `i${i}`, 100, { span: same })), undefined, 0);
      near(row(1), [0]);
      near(row(2), [-step / 2, step / 2]);
      near(row(3), [-step, 0, step]);
      near(row(4), [-1.5 * step, -step / 2, step / 2, 1.5 * step]);
    });

    it("перший згас — решта сходиться до точки", () => {
      const list = [0, 1, 2].map((k) => bubble("a", `i${k}`, 100, { span: same }));
      lay(list, undefined, 0);
      near(lay(list.slice(1), undefined, 0), [-step / 2, step / 2]);
    });

    it("різні межі нового вигляду (думка й мовна): упритул із зазором, кожен відходить порівну", () => {
      const first = bubble("a", "dizzy", 100, { span: think.span });
      const second = bubble("a", "claws", 100);
      lay([first, second]);
      expect(apart(first, second)).toBe(true);
      expect(first.x + first.target + first.span.right + BESIDE_GAP).toBeCloseTo(second.x + second.target - second.span.left);
      expect(first.target + second.target).toBeCloseTo(0);
      expect(first.target).toBeLessThan(0);
    });

    it("той самий бабл того самого власника (натиснута кілька разів відмова) — там само, де попередній такий", () => {
      const list = [bubble("a", "claws", 100), bubble("a", "angry", 100), bubble("a", "angry", 100)];
      const [first, second, again] = lay(list);
      expect(apart(list[0]!, list[1]!)).toBe(true);
      expect(first).toBeLessThan(0);
      expect(again).toBe(second);
    });
  });

  describe("над різними (рецензія хвилі 3)", () => {
    it("два коти ніс до носа: бабли поруч, кожен над своїм боком, відходять порівну", () => {
      const left = bubble("cat:1", "angry", 100);
      const right = bubble("cat:2", "hiss-kitten", 112);
      lay([right, left]);
      expect(apart(left, right)).toBe(true);
      expect(left.target).toBeLessThan(0);
      expect(right.target).toBeGreaterThan(0);
      expect(left.target + right.target).toBeCloseTo(0);
    });

    it("чужий далеко збоку, вище чи нижче за висоту бабла, схований чи напис без власника — не заважає", () => {
      const off = (other: LaidBubble): number[] => lay([other, bubble("cat:2", "angry", 100)]);
      expect(off(bubble("cat:1", "angry", 100 + width + BESIDE_GAP))).toEqual([0, 0]);
      expect(off(bubble("cat:1", "angry", 100, { y: 200 - height }))).toEqual([0, 0]);
      expect(off(bubble("cat:1", "angry", 100, { y: 200 + height }))).toEqual([0, 0]);
      expect(off(bubble("cat:1", "angry", 100, { visible: false }))).toEqual([0, 0]);
      // Напис «+N ₴» сам не стає поруч і нікому не заважає.
      expect(off(bubble(undefined, "+12", 100, { span: { left: 0, right: 0 } }))).toEqual([0, 0]);
      // Ближче по вертикалі — заважає.
      const [a, b] = off(bubble("cat:1", "angry", 100, { y: 200 - height + 1 }));
      expect(a).not.toBe(0);
      expect(b).not.toBe(0);
    });

    it("бабл події стає поруч із баблом стану сусіда; свій схований бабл стану не заважає", () => {
      const event = bubble("cat:2", "angry", 104);
      const asks = bubble("cat:1", "food", 100);
      lay([event, asks]);
      expect(apart(event, asks)).toBe(true);
      expect(asks.target).toBeLessThan(0);
      expect(lay([bubble("cat:1", "angry", 100), bubble("cat:1", "food", 100, { visible: false })])).toEqual([0, 0]);
    });

    it("коти сходяться: бабли розходяться плавно — без стрибків і не міняючись місцями", () => {
      const first = bubble("cat:1", "angry", 100);
      const second = bubble("cat:2", "angry", 300);
      expect(lay([first, second])).toEqual([0, 0]);
      let before = [0, 0];
      for (let x = 298; x >= 100; x -= 2) {
        second.x = x;
        const now = lay([first, second]);
        expect(apart(first, second)).toBe(true);
        expect(first.x + first.target).toBeLessThan(second.x + second.target);
        expect(Math.abs(now[0]! - before[0]!)).toBeLessThanOrEqual(2 + 1e-6);
        expect(Math.abs(now[1]! - before[1]!)).toBeLessThanOrEqual(2 + 1e-6);
        before = now;
      }
      // Сусід згас — бабл повертається до точки.
      expect(lay([second])).toEqual([0]);
    });

    it("ряд — не за краєм видимої частини світу, якщо точки в ній; самотній бабл біля краю теж увесь видно", () => {
      const left = bubble("cat:1", "angry", 100);
      const right = bubble("cat:2", "angry", 112);
      const bounds = { left: 0, right: 112 + say.span.right };
      lay([left, right], bounds);
      expect(apart(left, right)).toBe(true);
      expect(right.x + right.target + right.span.right).toBeLessThanOrEqual(bounds.right + 1e-6);
      expect(right.target).toBeGreaterThanOrEqual(-1e-6);
      // Точка другого за краєм — ряд як без краю.
      const free = [bubble("cat:1", "angry", 100), bubble("cat:2", "angry", 112)];
      const clipped = [bubble("cat:1", "angry", 100), bubble("cat:2", "angry", 112)];
      expect(lay(clipped, { left: 0, right: 110 })).toEqual(lay(free));
      // Самотній бабл, чий край виходить за межу, — посунуто всередину.
      expect(lay([bubble("cat:1", "angry", 300)], { left: 0, right: 310 })[0]).toBeCloseTo(310 - (300 + say.span.right));
      expect(lay([bubble("cat:1", "angry", 300)], { left: 0, right: 1000 })).toEqual([0]);
    });

    it("у тісноті ряди не зливаються далі за дві ширини: кожен бабл — біля свого власника, свої — поруч", () => {
      const crowd = Array.from({ length: 7 }, (_, k) => bubble(`cat:${k}`, "angry", 100));
      const own = [bubble("cat:9", "claws", 100), bubble("cat:9", "angry", 100)];
      const list = [...crowd, ...own];
      lay(list);
      for (const b of list) expect(Math.abs(b.target)).toBeLessThanOrEqual(BESIDE_MAX_WIDTHS * width + 1e-6);
      expect(apart(own[0]!, own[1]!)).toBe(true);
      // Двоє-троє — ще поруч, без накладання.
      const three = Array.from({ length: 3 }, (_, k) => bubble(`cat:${k}`, "angry", 100));
      lay(three);
      expect(apart(three[0]!, three[1]!) && apart(three[1]!, three[2]!) && apart(three[0]!, three[2]!)).toBe(true);
    });
  });
});
