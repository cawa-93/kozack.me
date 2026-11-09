// Тканина візерунків одягу (`WARDROBE.md`, «Візерунки»; `art/STYLE.md`, «cloth»): з кадрів `cloth/*` атласу — фарба кроку
// візерунка (`TintStep.pattern`) у масштабі кадру: плитка як CanvasPattern і принти. Будується раз на (кадр, колір, масштаб,
// поворот) і лежить у кеші, тож запікання кадру персонажа лише кладе готове, а щокадру тут нічого не відбувається.
//
// Без Phaser і DOM під час імпорту; полотна дає той, хто кличе (`ClothCanvas`: у грі — `createCtx`, у тестах — фальшиві).

import type { Ctx2D, LayerImage, LayerSource } from "./compose";
import type { ArtId, ArtPoint, ArtSize, ArtView, TintPattern, TintRecipe } from "./types";

/** Шари кадру тканини: джерело, повне полотно кадру в пікселях (до обрізки атласу), розмір і pivot в одиницях арту. */
export interface ClothLayers {
  source: LayerSource;
  w: number;
  h: number;
  size: ArtSize;
  pivot: ArtPoint;
}

/** Шари кадру тканини за id; null — кадру немає (чи лише заглушка): візерунок тоді не кладеться. */
export type ClothLookup = (id: ArtId) => ClothLayers | null;

/** Полотно для тканини: як `Ctx2D`, і ще вміє зробити з себе плитку. */
export interface ClothCtx extends Ctx2D {
  createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null;
}

/** Де взяти полотно `w × h` (у грі — `createCtx`). */
export type ClothCanvas = (w: number, h: number) => ClothCtx | null;

/** Принт у пікселях кадру: готове зображення й pivot (центр). */
export interface ClothImage {
  image: CanvasImageSource;
  w: number;
  h: number;
  px: number;
  py: number;
}

/** Фарба кроку візерунка в масштабі кадру: плитка, що повторюється, або принт на груди й манжет. */
export interface ClothPaint {
  fill: CanvasPattern | null;
  print: ClothImage | null;
  cuff: ClothImage | null;
}

/** Візерунки кадру для компонувальника (`ComposeOptions.cloth`). */
export interface ClothFrame {
  /** Пікселів кадру на одиницю арту. */
  k: number;
  /** Pivot кадру, одиниці арту: від нього лягає плитка, тож у всіх станах, ракурсах і варіантах частини вона та сама. */
  pivot: ArtPoint;
  /** Точки кадру, одиниці арту: `print` — принт на груди, `cuff` — манжет. */
  points?: Readonly<Record<string, ArtPoint>> | undefined;
  view: ArtView | null;
  paint(pattern: TintPattern): ClothPaint | null;
}

/** Кадри тканини, які потрібні рецепту: плитки й принти кроків візерунка. */
export function clothIds(recipe: TintRecipe): ArtId[] {
  const ids = new Set<ArtId>();
  for (const step of recipe.steps) {
    if (!step.pattern) continue;
    ids.add(step.pattern.tile);
    if (step.pattern.cuff) ids.add(step.pattern.cuff);
  }
  return [...ids];
}

/** Візерунки кадру: його масштаб, pivot, точки й ракурс і фарба з кадрів тканини `lookup` на полотнах `make`. */
export function clothFrame(frame: Omit<ClothFrame, "paint">, lookup: ClothLookup, make: ClothCanvas): ClothFrame {
  return { ...frame, paint: (pattern) => clothPaint(pattern, frame.k, lookup, make) };
}

/** Фарба візерунка в масштабі `k` (пікселів на одиницю арту); null — кадрів тканини немає. */
export function clothPaint(pattern: TintPattern, k: number, lookup: ClothLookup, make: ClothCanvas): ClothPaint | null {
  if (pattern.kind === "print") {
    const print = cloth(pattern.tile, pattern.color, k, false, lookup, make)?.image ?? null;
    const cuff = pattern.cuff ? (cloth(pattern.cuff, pattern.color, k, false, lookup, make)?.image ?? null) : null;
    return print || cuff ? { fill: null, print, cuff } : null;
  }
  const tile = cloth(pattern.tile, pattern.color, k, pattern.turn === true, lookup, make);
  if (!tile) return null;
  if (tile.pattern === undefined) tile.pattern = tile.ctx.createPattern(tile.ctx.canvas, "repeat");
  return tile.pattern ? { fill: tile.pattern, print: null, cuff: null } : null;
}

/** Готова тканина: полотно, зображення й плитка (її роблять, коли попросять). */
interface Built {
  ctx: ClothCtx;
  image: ClothImage;
  pattern?: CanvasPattern | null;
}

/**
 * Кеш готової тканини — за зображенням сторінки атласу, з якої вона намальована: новий атлас (гаряча перезбірка в dev) — нові
 * зображення, і старе відпадає само.
 */
const built = new WeakMap<object, Map<string, Built | null>>();

function cloth(id: ArtId, color: number | null, k: number, turn: boolean, lookup: ClothLookup, make: ClothCanvas): Built | null {
  const layers = lookup(id);
  if (!layers) return null;
  const fill = color === null ? null : layers.source("fill");
  const detail = layers.source("detail");
  const page = (fill ?? detail)?.image as object | undefined;
  if (!page) return null;
  let cache = built.get(page);
  if (!cache) {
    cache = new Map();
    built.set(page, cache);
  }
  const key = `${id}|${color ?? "-"}|${k}|${turn ? "turn" : ""}`;
  const have = cache.get(key);
  if (have !== undefined) return have;
  const made = drawCloth(layers, fill, detail, color, k, turn, make);
  cache.set(key, made);
  return made;
}

/**
 * Намалювати тканину на власному полотні: маска `fill` кольором `color`, поверх — `detail`. Атлас обрізає кадр до
 * намальованого, тож шари стають на полотно повного розміру зі зсувом обрізки — інакше період плитки був би розміром
 * намальованого. Розмір у пікселях кадру цілий: плитка повторюється без швів.
 */
function drawCloth(layers: ClothLayers, fill: LayerImage | null, detail: LayerImage | null, color: number | null, k: number, turn: boolean, make: ClothCanvas): Built | null {
  const w = Math.max(1, Math.round(layers.size.w * k));
  const h = Math.max(1, Math.round(layers.size.h * k));
  const W = turn ? h : w;
  const H = turn ? w : h;
  const ctx = make(W, H);
  if (!ctx) return null;
  const sx = w / Math.max(1, layers.w);
  const sy = h / Math.max(1, layers.h);
  // Поворот за годинниковою стрілкою: (x, y) → (h − y, x).
  const place = (): void => (turn ? ctx.setTransform(0, sx, -sy, 0, h, 0) : ctx.setTransform(sx, 0, 0, sy, 0, 0));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  if (fill && color !== null) {
    place();
    drawLayer(ctx, fill);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  if (detail) {
    place();
    drawLayer(ctx, detail);
  }
  ctx.restore();
  const pivot = turn ? { x: h - layers.pivot.y * k, y: layers.pivot.x * k } : { x: layers.pivot.x * k, y: layers.pivot.y * k };
  return { ctx, image: { image: ctx.canvas, w: W, h: H, px: pivot.x, py: pivot.y } };
}

function drawLayer(ctx: Ctx2D, src: LayerImage): void {
  if (src.sw <= 0 || src.sh <= 0) return;
  ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, src.dx ?? 0, src.dy ?? 0, src.dw ?? src.sw, src.dh ?? src.sh);
}
