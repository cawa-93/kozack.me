// Пакування растрів у сторінки атласу (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»). Власний простий
// пакувальник «горизонт» (skyline, bottom-left): кожен прямокутник стає якнайнижче, потім якнайлівіше; щільніше за
// полиці (зразок — games/vtecha/tools/sprites/build.mjs), але так само детерміновано. Навколо кожного растра —
// продубльований край (`extrude`), щоб на дробовому зумі білінійна вибірка не тягнула пікселів сусіда чи прозорості
// (шви між плитами), і ще прозорий відступ (`gap`). Сторінки — степені двійки до `maxSize` (mipmap-дружньо).

import type { Rgba } from "./raster";

/** Скільки пікселів краю дублюється навколо растра. */
export const EXTRUDE = 2;
/** Прозорий відступ між продубльованими краями сусідів. */
export const GAP = 2;
/** Найбільша сторона сторінки атласу. */
export const PAGE_MAX = 2048;

export interface PackOptions {
  maxSize: number;
  extrude: number;
  gap: number;
}

export const PACK_DEFAULTS: PackOptions = { maxSize: PAGE_MAX, extrude: EXTRUDE, gap: GAP };

/** Що пакувати: ключ і розмір растра (без краю й відступу). */
export interface PackItem {
  key: string;
  w: number;
  h: number;
}

/** Де растр на сторінці: номер сторінки й лівий верхній кут самого растра (без краю). */
export interface Placement {
  page: number;
  x: number;
  y: number;
}

export interface PackResult {
  pages: { w: number; h: number }[];
  placements: Map<string, Placement>;
}

/** Найменший степінь двійки, не менший за `n` (і не менший за 1). */
export function pow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Відрізок горизонту: від `x` завширшки `w` зайнято до висоти `y`. */
interface Segment {
  x: number;
  y: number;
  w: number;
}

/** Одна сторінка під пакуванням: горизонт і зайнята частина. */
class Skyline {
  private readonly size: number;
  private segments: Segment[];
  usedW = 0;
  usedH = 0;

  constructor(size: number) {
    this.size = size;
    this.segments = [{ x: 0, y: 0, w: size }];
  }

  /** Знайти місце для прямокутника `w × h` (з відступами): найнижче, потім найлівіше; null — не влазить. */
  find(w: number, h: number): { x: number; y: number; index: number } | null {
    let best: { x: number; y: number; index: number } | null = null;
    for (let i = 0; i < this.segments.length; i++) {
      const start = this.segments[i];
      if (!start || start.x + w > this.size) break;
      // Висота, на яку стане прямокутник, — найвищий відрізок під ним.
      let y = 0;
      let covered = 0;
      for (let j = i; covered < w && j < this.segments.length; j++) {
        const seg = this.segments[j];
        if (!seg) break;
        y = Math.max(y, seg.y);
        covered += seg.w;
      }
      if (y + h > this.size) continue;
      if (!best || y < best.y || (y === best.y && start.x < best.x)) best = { x: start.x, y, index: i };
    }
    return best;
  }

  /** Зайняти прямокутник `w × h` у знайденому місці. */
  place(spot: { x: number; y: number; index: number }, w: number, h: number): void {
    const top = spot.y + h;
    const next: Segment[] = this.segments.slice(0, spot.index);
    next.push({ x: spot.x, y: top, w });
    const right = spot.x + w;
    for (let j = spot.index; j < this.segments.length; j++) {
      const seg = this.segments[j];
      if (!seg) continue;
      const end = seg.x + seg.w;
      if (end <= right) continue;
      const x = Math.max(seg.x, right);
      next.push({ x, y: seg.y, w: end - x });
    }
    // Злити сусідні відрізки однакової висоти.
    const merged: Segment[] = [];
    for (const seg of next) {
      const last = merged[merged.length - 1];
      if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w;
      else merged.push({ ...seg });
    }
    this.segments = merged;
    this.usedW = Math.max(this.usedW, right);
    this.usedH = Math.max(this.usedH, top);
  }
}

/**
 * Розкласти растри по сторінках: від найвищих (і найширших) до найнижчих, кожен — на першу сторінку, де є місце, інакше —
 * на нову. Растр, що з краєм не влазить у сторінку, — помилка (такому запису — меншу `res` чи поділ на частини).
 */
export function pack(items: readonly PackItem[], options: PackOptions = PACK_DEFAULTS): PackResult {
  const pad = options.extrude * 2 + options.gap;
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const pages: Skyline[] = [];
  const placements = new Map<string, Placement>();
  for (const item of sorted) {
    const w = item.w + pad;
    const h = item.h + pad;
    if (w > options.maxSize || h > options.maxSize) {
      throw new Error(
        `«${item.key}»: ${item.w}×${item.h} px з краєм не влазить у сторінку ${options.maxSize}² — меншу res чи поділити на частини`,
      );
    }
    let placed = false;
    for (let p = 0; p < pages.length && !placed; p++) {
      const page = pages[p];
      const spot = page?.find(w, h);
      if (page && spot) {
        page.place(spot, w, h);
        placements.set(item.key, { page: p, x: spot.x + options.extrude, y: spot.y + options.extrude });
        placed = true;
      }
    }
    if (!placed) {
      const page = new Skyline(options.maxSize);
      const spot = page.find(w, h);
      if (!spot) throw new Error(`«${item.key}»: не вдалося покласти на порожню сторінку`);
      page.place(spot, w, h);
      placements.set(item.key, { page: pages.length, x: spot.x + options.extrude, y: spot.y + options.extrude });
      pages.push(page);
    }
  }
  return { pages: pages.map((page) => ({ w: pow2(page.usedW), h: pow2(page.usedH) })), placements };
}

/**
 * Скласти сторінку: кожен растр на своє місце, а навколо — `extrude` пікселів продубльованого краю (кутові — кутовим
 * пікселем). Решта сторінки прозора.
 */
export function composePage(w: number, h: number, images: readonly { image: Rgba; x: number; y: number }[], extrude: number): Rgba {
  const data = Buffer.alloc(w * h * 4);
  for (const { image, x, y } of images) {
    for (let row = -extrude; row < image.h + extrude; row++) {
      const srcRow = Math.min(Math.max(row, 0), image.h - 1);
      const dstY = y + row;
      if (dstY < 0 || dstY >= h) continue;
      const src = srcRow * image.w * 4;
      const dst = (dstY * w + x) * 4;
      // Середина рядка — як є.
      image.data.copy(data, dst, src, src + image.w * 4);
      // Краї рядка — крайнім пікселем.
      for (let e = 1; e <= extrude; e++) {
        if (x - e >= 0) image.data.copy(data, dst - e * 4, src, src + 4);
        if (x + image.w - 1 + e < w) image.data.copy(data, dst + (image.w - 1 + e) * 4, src + (image.w - 1) * 4, src + image.w * 4);
      }
    }
  }
  return { w, h, data };
}
