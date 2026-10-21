// Сховища запасів на екрані (§6.4): впізнаваний вигляд і наповнення, видне з самого сховища —
// «показуй, а не розказуй» (§11.3а). Стан: 0 — порожньо, 1 — мало, 2 — половина, 3 — багато, 4 — ущерть.

import Phaser from "phaser";

import type { ObjectKind } from "../sim/home";
import type { FillStage } from "../sim/storage";
import { COLORS } from "./geometry";

const INK = COLORS.ink;
type G = Phaser.GameObjects.Graphics;
type Rect = { x: number; y: number; w: number; h: number };
type Stages = readonly (FillStage | null)[];

/** Сховища, яких меблевий «ящик» не малює: їхню форму цілком дає цей файл. */
export const SHAPED_STORAGES: ReadonlySet<ObjectKind> = new Set(["litterBag", "sterileBin", "catKit"]);

/** Частка для малюнка рівня рідини чи корму. */
const LEVEL: Record<FillStage, number> = { 0: 0, 1: 0.3, 2: 0.6, 3: 0.9, 4: 1 };

const poly = (g: G, points: readonly [number, number][], fill: number, stroke = true): void => {
  const v = points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(fill).fillPoints(v, true);
  if (stroke) g.lineStyle(2, INK).strokePoints(v, true);
};

/** Гранули корму чи наповнювача. */
function grains(g: G, x: number, y: number, w: number, color: number, count = 6): void {
  g.fillStyle(color);
  for (let i = 0; i < count; i++) g.fillCircle(x + ((i * 37) % 100) / 100 * w, y + ((i * 53) % 7) - 3, 1.8);
}

/**
 * Намалювати сховище: `t` — верхня грань речі, `height` — висота лицьової грані, `stages` — стан
 * кожного запасу сховища в порядку `STORAGES` (null — запасу ще не бувало).
 */
export function drawStorage(g: G, kind: ObjectKind, t: Rect, height: number, stages: Stages): void {
  g.clear();
  const s = stages[0] ?? null;
  const cx = t.x + t.w / 2;
  const y0 = t.y + t.h;
  const y1 = y0 + height;
  switch (kind) {
    case "fridge":
      return fridge(g, t, y0, y1, s);
    case "catCabinet":
      return cabinet(g, t, y0, y1, s);
    case "sterileBin":
      return bin(g, t, cx, y1, height, s);
    case "litterBag":
      return sack(g, cx, y1, t.w, height, s);
    case "shower":
      return shelf(g, t, y0, stages);
    case "washer":
      return detergent(g, cx, t.y + 2, s);
    case "sink":
      return pills(g, t.x + t.w - 6, t.y + 4, s);
    case "catKit":
      return kit(g, t, cx, y1, height, stages);
    default:
      return;
  }
}

/** Холодильник: порожній — прочинений і темний; ущерть — роздутий, з дверцят стирчить їжа. */
function fridge(g: G, t: Rect, y0: number, y1: number, s: FillStage | null): void {
  if (s === null) return;
  const right = t.x + t.w;
  if (s === 0) {
    g.fillStyle(0x2a2428).fillRect(t.x + t.w * 0.5, y0 + 3, t.w * 0.5 - 2, y1 - y0 - 6);
    poly(g, [[right - 1, y0 + 2], [right + 12, y0 + 9], [right + 12, y1 - 3], [right - 1, y1 - 2]], 0xe9e6df);
    return;
  }
  g.fillStyle(0x6fae6a).fillCircle(right - 6, y0 + 7, 2.5);
  if (s >= 2) {
    // Банка на холодильнику.
    g.fillStyle(0xc0675a).fillRoundedRect(t.x + 6, t.y - 8, 8, 11, 2);
    g.lineStyle(1.5, INK).strokeRoundedRect(t.x + 6, t.y - 8, 8, 11, 2);
  }
  if (s >= 3) {
    // Хлібина.
    g.fillStyle(0xd9a85a).fillEllipse(t.x + t.w - 14, t.y - 2, 18, 9);
    g.lineStyle(1.5, INK).strokeEllipse(t.x + t.w - 14, t.y - 2, 18, 9);
  }
  if (s === 4) {
    // Роздуті боки й їжа з дверцят.
    const mid = (y0 + y1) / 2;
    g.fillStyle(0xd9d4cc).fillEllipse(t.x, mid, 8, (y1 - y0) * 0.8).fillEllipse(right, mid, 8, (y1 - y0) * 0.8);
    g.lineStyle(2, INK).strokeEllipse(t.x, mid, 8, (y1 - y0) * 0.8).strokeEllipse(right, mid, 8, (y1 - y0) * 0.8);
    poly(g, [[right - 2, y0 + 16], [right + 14, y0 + 13], [right - 2, y0 + 22]], 0xe0893a);
    g.fillStyle(0x6fae6a).fillTriangle(right - 4, y0 + 14, right - 9, y0 + 9, right - 2, y0 + 12);
    g.fillStyle(0xb8462f).fillRoundedRect(right - 3, y0 + 32, 14, 6, 3);
    g.lineStyle(1.5, INK).strokeRoundedRect(right - 3, y0 + 32, 14, 6, 3);
  }
}

/** Шафка з кормом: лапка й рибка на дверцятах; зверху — пакет корму, що росте з наповненням. */
function cabinet(g: G, t: Rect, y0: number, y1: number, s: FillStage | null): void {
  const cx = t.x + t.w / 2;
  const fy = (y0 + y1) / 2;
  // Рибка на правих дверцятах (лапка — на лівих, її малює квартира).
  poly(g, [[cx + 4, fy], [cx + 12, fy - 4], [cx + 12, fy + 4]], 0x5fa8d3, false);
  g.fillStyle(0x5fa8d3).fillTriangle(cx + 12, fy, cx + 17, fy - 4, cx + 17, fy + 4);
  if (s === null) return;
  if (s === 0) {
    // Дверцята прочинені: темна щілина.
    g.fillStyle(0x2a2428).fillRect(cx - 3, y0 + 3, 6, y1 - y0 - 6);
    return;
  }
  const h = [0, 7, 12, 17, 20][s] ?? 0;
  const w = s === 4 ? 24 : 20;
  g.fillStyle(0xe8b93a).fillRoundedRect(cx - w / 2, t.y + 2 - h, w, h, 3);
  g.lineStyle(2, INK).strokeRoundedRect(cx - w / 2, t.y + 2 - h, w, h, 3);
  g.fillStyle(0x8a5a33).fillCircle(cx, t.y + 2 - h / 2, 2.5);
  if (s === 4) grains(g, t.x + 2, t.y + 4, t.w - 4, 0x8a5a33, 8);
}

/** Бак для стерилізованих: синій, з віконцем, у якому видно рівень корму. */
function bin(g: G, t: Rect, cx: number, y1: number, height: number, s: FillStage | null): void {
  const w = t.w - 6;
  const top = y1 - height;
  g.fillStyle(0x5a7fc0).fillRoundedRect(cx - w / 2, top, w, height, 6);
  g.lineStyle(2.5, INK).strokeRoundedRect(cx - w / 2, top, w, height, 6);
  // Віконце з рівнем корму.
  const wx = cx - 5;
  const wy = top + 8;
  const wh = height - 16;
  g.fillStyle(0xcfe3ec).fillRect(wx, wy, 10, wh);
  const level = LEVEL[s ?? 0];
  g.fillStyle(0x8a5a33).fillRect(wx, wy + wh * (1 - level), 10, wh * level);
  g.lineStyle(1.5, INK).strokeRect(wx, wy, 10, wh);
  if (s === 0 || s === null) {
    // Кришка знята й стоїть поруч.
    g.fillStyle(0x3f5f9a).fillRoundedRect(cx + w / 2 + 1, y1 - 18, 5, 18, 2);
    g.lineStyle(1.5, INK).strokeRoundedRect(cx + w / 2 + 1, y1 - 18, 5, 18, 2);
    return;
  }
  const lift = s === 4 ? 5 : 0;
  if (s === 4) {
    g.fillStyle(0x8a5a33).fillEllipse(cx, top - 1, w - 6, 8);
  }
  g.fillStyle(0x3f5f9a).fillRoundedRect(cx - w / 2 - 2, top - 4 - lift, w + 4, 6, 3);
  g.lineStyle(2, INK).strokeRoundedRect(cx - w / 2 - 2, top - 4 - lift, w + 4, 6, 3);
}

/** Мішок наповнювача: мішковина з зав'язаною горловиною й лапкою; висота — від наповнення. */
function sack(g: G, cx: number, y1: number, width: number, height: number, s: FillStage | null): void {
  const stage = s ?? 0;
  const h = [height * 0.25, height * 0.5, height * 0.7, height * 0.9, height][stage] ?? height;
  const w = (stage === 4 ? 1.05 : stage === 0 ? 0.95 : 0.85) * width;
  const top = y1 - h;
  const sag = stage <= 1 ? 6 : 0;
  poly(g, [[cx - w / 2, y1], [cx - w / 2 + 4, top + 8 + sag], [cx - 6, top + 4], [cx + 6, top + 4], [cx + w / 2 - 4, top + 8 + sag], [cx + w / 2, y1]], 0xcdb98f);
  // Горловина, зав'язана мотузкою.
  if (stage > 0) {
    poly(g, [[cx - 5, top + 5], [cx - 7, top - 4], [cx + 7, top - 4], [cx + 5, top + 5]], 0xcdb98f);
    g.lineStyle(2.5, 0x8b5e3c).lineBetween(cx - 6, top + 4, cx + 6, top + 4);
  } else {
    // Порожній — зіжмаканий: складки.
    g.lineStyle(1.5, INK, 0.6).lineBetween(cx - w / 4, top + 6, cx - w / 6, y1 - 2).lineBetween(cx + w / 5, top + 5, cx + w / 8, y1 - 3);
  }
  if (stage >= 2) {
    // Лапка на мішку.
    const py = top + h * 0.55;
    g.fillStyle(0x8b5e3c).fillCircle(cx, py + 2, 3.5).fillCircle(cx - 4, py - 3, 1.6).fillCircle(cx, py - 4.5, 1.6).fillCircle(cx + 4, py - 3, 1.6);
  }
  if (stage === 4) grains(g, cx - w / 2 - 4, y1 - 1, 14, 0x9aa3ab, 5);
}

/** Пляшечка з рідиною: на боці — порожня, повна — з піною. */
function bottle(g: G, x: number, y: number, color: number, s: FillStage): void {
  if (s === 0) {
    g.fillStyle(0xe6eef1).fillRoundedRect(x - 6, y - 5, 13, 6, 2);
    g.lineStyle(1.5, INK).strokeRoundedRect(x - 6, y - 5, 13, 6, 2);
    return;
  }
  const h = 14;
  g.fillStyle(0xe6eef1).fillRoundedRect(x - 4, y - h, 8, h, 2);
  g.fillStyle(color).fillRect(x - 4, y - h * LEVEL[s], 8, h * LEVEL[s]);
  g.lineStyle(1.5, INK).strokeRoundedRect(x - 4, y - h, 8, h, 2);
  g.fillStyle(INK).fillRect(x - 2, y - h - 3, 4, 3);
  if (s === 4) g.fillStyle(0xffffff).fillCircle(x - 2, y - h - 5, 2.5).fillCircle(x + 2, y - h - 6, 2).fillCircle(x + 4, y - h - 3, 1.8);
}

/** Полиця душу: гель і шампунь для котів — кожен своєю пляшечкою. */
function shelf(g: G, t: Rect, y0: number, stages: Stages): void {
  const [gel, shampoo] = stages;
  if (gel === null && shampoo === null) return;
  // Поличка — усередині кабіни, біля задньої стінки: сховище душу на його ж клітинці, а не на сусідній.
  const sx = t.x + t.w - 24;
  const sy = y0 + 12;
  g.fillStyle(0x8b5e3c).fillRect(sx - 2, sy, 20, 3);
  if (gel !== null && gel !== undefined) bottle(g, sx + 4, sy, 0x5fa8d3, gel);
  if (shampoo !== null && shampoo !== undefined) bottle(g, sx + 14, sy, 0xd98fb8, shampoo);
}

/** Коробка порошку на пральній машині: порожня — зім'ята, ущерть — гірка порошку. */
function detergent(g: G, cx: number, y: number, s: FillStage | null): void {
  if (s === null) return;
  if (s === 0) {
    poly(g, [[cx - 9, y + 2], [cx + 7, y - 1], [cx + 9, y + 3], [cx - 7, y + 5]], 0xe8a33a);
    return;
  }
  g.fillStyle(0xe8a33a).fillRect(cx - 7, y - 12, 14, 12);
  g.fillStyle(0xffffff).fillRect(cx - 7, y - 12 + 12 * (1 - LEVEL[s]), 14, 3);
  g.lineStyle(1.5, INK).strokeRect(cx - 7, y - 12, 14, 12);
  if (s === 4) g.fillStyle(0xffffff).fillEllipse(cx, y - 13, 14, 6);
}

/** Флакон пігулок на краю умивальника: порожній — перекинутий, ущерть — кришка набік. */
function pills(g: G, x: number, y: number, s: FillStage | null): void {
  if (s === null) return;
  if (s === 0) {
    g.fillStyle(0xe8b93a).fillRoundedRect(x - 6, y - 4, 11, 6, 2);
    g.lineStyle(1.5, INK).strokeRoundedRect(x - 6, y - 4, 11, 6, 2);
    return;
  }
  g.fillStyle(0xe8b93a, 0.85).fillRoundedRect(x - 4, y - 10, 8, 10, 2);
  g.fillStyle(0xffffff);
  for (let i = 0; i < Math.round(LEVEL[s] * 4); i++) g.fillCircle(x - 2 + (i % 2) * 4, y - 2 - Math.floor(i / 2) * 3, 1.4);
  g.lineStyle(1.5, INK).strokeRoundedRect(x - 4, y - 10, 8, 10, 2);
  if (s === 4) {
    g.fillStyle(0xffffff).fillRect(x + 4, y - 14, 6, 3).fillCircle(x - 1, y - 12, 1.6).fillCircle(x + 2, y - 13, 1.6);
  } else g.fillStyle(0xffffff).fillRect(x - 5, y - 13, 10, 3);
}

/** Котяча аптечка: зелена скринька з білою лапкою; що повніша — то більше визирає з-під кришки. */
function kit(g: G, t: Rect, cx: number, y1: number, height: number, stages: Stages): void {
  const known = stages.filter((s): s is FillStage => s !== null);
  const level = known.length > 0 ? known.reduce((sum, b) => sum + LEVEL[b], 0 as number) / known.length : 0;
  const s: FillStage = level <= 0 ? 0 : level >= 1 ? 4 : level < 0.45 ? 1 : level < 0.75 ? 2 : 3;
  const w = t.w - 4;
  const h = height * 0.7;
  const top = y1 - h;
  g.fillStyle(0x6fae6a).fillRoundedRect(cx - w / 2, top, w, h, 5);
  g.lineStyle(2.5, INK).strokeRoundedRect(cx - w / 2, top, w, h, 5);
  // Ручка й біла лапка — котяча, не людська аптечка.
  g.lineStyle(3, INK).beginPath().arc(cx, top - 2, 6, Math.PI, 0).strokePath();
  const py = top + h / 2 + 2;
  g.fillStyle(0xffffff).fillCircle(cx, py + 3, 5).fillCircle(cx - 6, py - 3, 2.3).fillCircle(cx, py - 6, 2.3).fillCircle(cx + 6, py - 3, 2.3);
  if (s === 0) {
    // Кришка відкинута, всередині порожньо.
    g.fillStyle(0x2a2428).fillRect(cx - w / 2 + 3, top + 2, w - 6, 5);
    poly(g, [[cx - w / 2, top], [cx + w / 2, top], [cx + w / 2 - 4, top - 12], [cx - w / 2 + 4, top - 12]], 0x5a9a56);
    return;
  }
  if (s >= 2) {
    // Рибка-ласощі з-під кришки.
    poly(g, [[cx - 12, top + 1], [cx - 4, top - 5], [cx - 4, top + 3]], 0xe0893a, false);
  }
  if (s >= 3) {
    // Нашийник звисає збоку.
    g.lineStyle(3, 0xd8483b).beginPath().arc(cx + w / 2, top + 8, 5, -Math.PI / 2, Math.PI / 2).strokePath();
    g.fillStyle(0xe8b93a).fillCircle(cx + w / 2 + 5, top + 12, 2);
  }
  if (s === 4) {
    // Кришка не зачиняється.
    poly(g, [[cx - w / 2, top - 2], [cx + w / 2, top - 6], [cx + w / 2, top - 10], [cx - w / 2, top - 6]], 0x5a9a56);
  }
}
