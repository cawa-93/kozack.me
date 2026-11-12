// Растеризація кадру арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): кожен шар SVG — окремо, через опцію
// `stylesheet` у sharp, що ховає всі інші шари й стани; той самий файл і та сама щільність — тож шари збігаються піксель
// у піксель. Потім кожен шар обрізається своєю рамкою (за своєю альфою) і пам'ятає свій зсув у полотні: маски й тінь
// кота займають у атласі лише своє, а не рамку контуру.

import sharp from "sharp";

import type { ArtSize, FrameLayer } from "../../src/view/art/types";
import { layerStylesheet, prepareSvg } from "./svg";

/** Растр RGBA (8 біт на канал, без домноження на альфу), рядки один за одним. */
export interface Rgba {
  w: number;
  h: number;
  data: Buffer;
}

/**
 * Шар кадру після обрізки: растр своєї рамки і її зсув `x, y` у полотні, пікселі. Порожній шар — один прозорий піксель у
 * (0, 0): так усі порожні шари атласу — той самий растр, що лежить на сторінці один раз.
 */
export interface LayerRaster extends Rgba {
  layer: FrameLayer;
  x: number;
  y: number;
}

/** Кадр після растеризації й обрізки: полотно (пікселі), рамка вмісту в ньому й шари, кожен — своєю рамкою. */
export interface FrameRaster {
  /** Полотно в пікселях: `size · res`, округлене (як округлює librsvg). */
  canvas: ArtSize;
  /**
   * Рамка вмісту кадру — об'єднання рамок шарів: де вона починається в полотні й розмір, пікселі; щонайменше 1 × 1
   * (порожній кадр — один прозорий піксель у (0, 0)). В атлас не йде — для перевірок вмісту.
   */
  trim: { x: number; y: number };
  w: number;
  h: number;
  layers: LayerRaster[];
}

/** Що растеризувати: текст SVG, полотно запису й роздільність, шари (null — увесь SVG як `all`) і стан. */
export interface RasterJob {
  svg: string;
  size: ArtSize;
  res: number;
  /** Шари запису; null — запис без шарів (один шар `all`). */
  layers: readonly FrameLayer[] | null;
  /** Усі групи-шари верхнього рівня у файлі (їх ховає таблиця стилів). */
  fileLayers: readonly string[];
  state: string | null;
  states: readonly string[];
}

/** Щільність sharp (DPI) для роздільності `res` пікселів на одиницю арту: SVG без одиниць — 72 DPI на піксель. */
export function densityFor(res: number): number {
  return 72 * res;
}

/** Таблиці стилів для кожного шару кадру: шар → CSS (для растеризації й ключа кешу). */
export function stylesheetsFor(job: Pick<RasterJob, "layers" | "fileLayers" | "state" | "states">): { layer: FrameLayer; css: string }[] {
  if (job.layers === null) return [{ layer: "all", css: layerStylesheet(null, [], job.state, job.states) }];
  return job.layers.map((layer) => ({ layer, css: layerStylesheet(layer, job.fileLayers, job.state, job.states) }));
}

/** Растеризувати SVG з таблицею стилів у RGBA. */
export async function rasterize(svg: string, density: number, stylesheet: string): Promise<Rgba> {
  // Порожньої таблиці стилів sharp не приймає.
  const { data, info } = await sharp(Buffer.from(svg), { density, ...(stylesheet ? { svg: { stylesheet } } : {}) })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`растр має ${info.channels} канали замість 4`);
  return { w: info.width, h: info.height, data };
}

/** Найменший прямокутник, що вміщує всі пікселі з альфою > 0 в усіх растрах (однакового розміру); null — усе прозоре. */
export function unionBounds(rasters: readonly Rgba[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rasters) {
    const { w, h, data } = r;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      let first = -1;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] !== 0) {
          first = x;
          break;
        }
      }
      if (first < 0) continue;
      let last = first;
      for (let x = w - 1; x > first; x--) {
        if (data[row + x * 4 + 3] !== 0) {
          last = x;
          break;
        }
      }
      if (first < x0) x0 = first;
      if (last + 1 > x1) x1 = last + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}

/** Вирізати прямокутник із растра. */
export function crop(r: Rgba, x: number, y: number, w: number, h: number): Rgba {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * r.w + x) * 4;
    r.data.copy(out, row * w * 4, from, from + w * 4);
  }
  return { w, h, data: out };
}

/** Рамка порожнього растра: один прозорий піксель у (0, 0). */
const EMPTY_BOUNDS = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Рамка растра в полотні `canvas`, обтята ним (дробове полотно librsvg округлює), — щонайменше 1 × 1. */
function boxOf(bounds: { x0: number; y0: number; x1: number; y1: number } | null, canvas: ArtSize): { x: number; y: number; w: number; h: number } {
  const b = bounds ?? EMPTY_BOUNDS;
  return { x: b.x0, y: b.y0, w: Math.min(b.x1, canvas.w) - b.x0, h: Math.min(b.y1, canvas.h) - b.y0 };
}

/**
 * Растеризувати кадр: кожен шар окремо (той самий SVG, та сама щільність) і обрізаний своєю рамкою за своєю альфою, зі
 * зсувом у полотні; рамка вмісту кадру — об'єднання рамок шарів.
 */
export async function rasterFrame(job: RasterJob): Promise<FrameRaster> {
  const svg = prepareSvg(job.svg, job.size);
  const density = densityFor(job.res);
  const sheets = stylesheetsFor(job);
  const rasters = await Promise.all(sheets.map((sheet) => rasterize(svg, density, sheet.css)));
  const first = rasters[0];
  if (!first) throw new Error("кадр без шарів");
  for (const r of rasters) {
    if (r.w !== first.w || r.h !== first.h) throw new Error(`шари різного розміру: ${first.w}×${first.h} і ${r.w}×${r.h}`);
  }
  const canvas = { w: first.w, h: first.h };
  const bounds = rasters.map((r) => unionBounds([r]));
  let union: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (const b of bounds) {
    if (!b) continue;
    union = union ? { x0: Math.min(union.x0, b.x0), y0: Math.min(union.y0, b.y0), x1: Math.max(union.x1, b.x1), y1: Math.max(union.y1, b.y1) } : b;
  }
  const content = boxOf(union, canvas);
  return {
    canvas,
    trim: { x: content.x, y: content.y },
    w: content.w,
    h: content.h,
    layers: rasters.map((r, i) => {
      const box = boxOf(bounds[i] ?? null, canvas);
      return { layer: sheets[i]?.layer ?? "all", x: box.x, y: box.y, ...crop(r, box.x, box.y, box.w, box.h) };
    }),
  };
}
