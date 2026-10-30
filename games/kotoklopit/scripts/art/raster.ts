// Растеризація кадру арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): кожен шар SVG — окремо, через опцію
// `stylesheet` у sharp, що ховає всі інші шари й стани; той самий файл і та сама щільність — тож шари збігаються піксель
// у піксель. Потім спільна рамка обрізки (за альфою об'єднання шарів) і вирізані шари однакового розміру.

import sharp from "sharp";

import type { ArtSize, FrameLayer } from "../../src/view/art/types";
import { layerStylesheet, prepareSvg } from "./svg";

/** Растр RGBA (8 біт на канал, без домноження на альфу), рядки один за одним. */
export interface Rgba {
  w: number;
  h: number;
  data: Buffer;
}

/** Шар кадру після обрізки. */
export interface LayerRaster extends Rgba {
  layer: FrameLayer;
}

/** Кадр після растеризації й обрізки: полотно (пікселі), зсув рамки обрізки в ньому й шари розміру рамки. */
export interface FrameRaster {
  /** Полотно в пікселях: `size · res`, округлене (як округлює librsvg). */
  canvas: ArtSize;
  /** Де починається рамка обрізки в полотні, пікселі. */
  trim: { x: number; y: number };
  /** Розмір рамки, пікселі; щонайменше 1 × 1 (порожній кадр — один прозорий піксель). */
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

/**
 * Растеризувати кадр: кожен шар окремо (той самий SVG, та сама щільність), спільна рамка обрізки за альфою об'єднання й
 * шари, вирізані цією рамкою, — усі одного розміру.
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
  const bounds = unionBounds(rasters) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const w = Math.min(bounds.x1, first.w) - bounds.x0;
  const h = Math.min(bounds.y1, first.h) - bounds.y0;
  return {
    canvas: { w: first.w, h: first.h },
    trim: { x: bounds.x0, y: bounds.y0 },
    w,
    h,
    layers: rasters.map((r, i) => ({ layer: sheets[i]?.layer ?? "all", ...crop(r, bounds.x0, bounds.y0, w, h) })),
  };
}
