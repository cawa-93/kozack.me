// Полиці складу рівня 1 (§5.7): частина внутрішніх стін-перегородок стає стелажами з речами.
// Для руху полиця — стіна, для погляду — прозора, для світла — часткова перешкода (§7.2.1):
// речі й стояки затуляють світло, проміжки між ними — ні.

import { SHELF_SHARE } from "../config";
import type { Rng } from "../core/rng";
import { T, type Rect, type Shelf, type ShelfItem, type ShelfKind, type TileMap } from "./grid";

const KINDS: ShelfKind[] = ["boxes", "sacks", "jars", "bottles"];

/** Розміри речей і проміжків уздовж полиці (частки тайла) для кожного виду вмісту. */
const LAYOUT: Record<ShelfKind, { len: [number, number]; gap: [number, number]; depth: [number, number]; skip: number }> = {
  boxes: { len: [0.26, 0.34], gap: [0.06, 0.14], depth: [0.5, 0.62], skip: 0.1 },
  sacks: { len: [0.2, 0.26], gap: [0.05, 0.1], depth: [0.44, 0.56], skip: 0.15 },
  jars: { len: [0.12, 0.15], gap: [0.05, 0.09], depth: [0.12, 0.15], skip: 0.15 },
  bottles: { len: [0.07, 0.09], gap: [0.05, 0.08], depth: [0.07, 0.09], skip: 0.2 },
};

/** Межі полиці вздовж осі: на кінцях тайла стоять стояки. */
const INNER_START = 0.11;
const INNER_END = 0.89;
/** Стояки на кінцях тайла: уздовж [0.02, 0.1] і [0.9, 0.98], поперек — біля країв полиці. */
const POSTS: { a0: number; a1: number; c0: number; c1: number }[] = [
  { a0: 0.02, a1: 0.1, c0: 0.13, c1: 0.21 },
  { a0: 0.02, a1: 0.1, c0: 0.79, c1: 0.87 },
  { a0: 0.9, a1: 0.98, c0: 0.13, c1: 0.21 },
  { a0: 0.9, a1: 0.98, c0: 0.79, c1: 0.87 },
];

/** Прямокутник у координатах тайла з (уздовж, поперек) полиці. */
function toRect(along: "x" | "y", a0: number, a1: number, c0: number, c1: number): Rect {
  return along === "x" ? { x0: a0, y0: c0, x1: a1, y1: c1 } : { x0: c0, y0: a0, x1: c1, y1: a1 };
}

export function makeShelf(rng: Rng, tx: number, ty: number, along: "x" | "y"): Shelf {
  const kind = rng.pick(KINDS);
  const lay = LAYOUT[kind];
  const items: ShelfItem[] = [];
  let pos = INNER_START + rng.range(0, 0.04);
  for (;;) {
    const len = rng.range(lay.len[0], lay.len[1]);
    if (pos + len > INNER_END) break;
    const depth = rng.range(lay.depth[0], lay.depth[1]);
    const skip = items.length > 0 && rng.chance(lay.skip); // перша річ є завжди: порожніх полиць не буває
    if (!skip) items.push({ a: pos + len / 2, len, depth, off: rng.range(-0.06, 0.06), tone: rng.int(0, 2) });
    pos += len + rng.range(lay.gap[0], lay.gap[1]);
  }
  const rects = [
    ...POSTS.map((p) => toRect(along, p.a0, p.a1, p.c0, p.c1)),
    ...items.map((it) => toRect(along, it.a - it.len / 2, it.a + it.len / 2, 0.5 + it.off - it.depth / 2, 0.5 + it.off + it.depth / 2)),
  ];
  return { tx, ty, along, kind, items, rects };
}

/**
 * Полиці рівня 1 (§5.7). Кандидати — внутрішні стіни-перегородки між двома клітинками, крім стін зі
 * світильниками; кожна стає полицею з імовірністю SHELF_SHARE. Стовп між двома полицями на прямій,
 * з підлогою поперек, теж стає полицею. Стовпи обабіч дверей лишаються кладкою: поперек них — двері.
 */
export function placeShelves(map: TileMap, w: number, h: number, lampTiles: { tx: number; ty: number }[], rng: Rng): void {
  const lamps = new Set(lampTiles.map((l) => map.key(l.tx, l.ty)));
  const put = (tx: number, ty: number, along: "x" | "y") => {
    map.set(tx, ty, T.Shelf);
    map.shelves.set(map.key(tx, ty), makeShelf(rng, tx, ty, along));
  };
  // Перегородки: рівно одна координата парна; стіна між лівою й правою клітинками тягнеться вздовж y.
  for (let ty = 1; ty < 2 * h; ty++) {
    for (let tx = 1; tx < 2 * w; tx++) {
      if ((tx % 2 === 0) === (ty % 2 === 0)) continue;
      if (map.get(tx, ty) !== T.Wall || lamps.has(map.key(tx, ty))) continue;
      if (rng.chance(SHELF_SHARE)) put(tx, ty, tx % 2 === 0 ? "y" : "x");
    }
  }
  // Стовпи між полицями на прямій (обидві координати парні, не на зовнішній межі).
  for (let ty = 2; ty < 2 * h; ty += 2) {
    for (let tx = 2; tx < 2 * w; tx += 2) {
      if (map.get(tx, ty) !== T.Wall || lamps.has(map.key(tx, ty))) continue;
      const is = (x: number, y: number, t: number) => map.get(x, y) === t;
      if (is(tx - 1, ty, T.Shelf) && is(tx + 1, ty, T.Shelf) && is(tx, ty - 1, T.Floor) && is(tx, ty + 1, T.Floor)) put(tx, ty, "x");
      else if (is(tx, ty - 1, T.Shelf) && is(tx, ty + 1, T.Shelf) && is(tx - 1, ty, T.Floor) && is(tx + 1, ty, T.Floor)) put(tx, ty, "y");
    }
  }
}
