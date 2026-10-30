// Сторінки атласу для DOM (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): `index.json` і ті сторінки, на яких лежать
// потрібні кадри, — без Phaser, для портрета в редакторі (`composePortrait`). Phaser вантажить ті самі файли сам
// (PreloadScene), а браузер бере їх із кешу: назви сторінок мають хеш вмісту.
//
// Поза браузером (тести в Node) нічого не вантажиться: атласу «немає», і портрет малює запасний малюнок. Під час імпорту
// модуль нічого не робить — лише коли попросять.

import type { LayerImage, LayerSource } from "./compose";
import { ART_DIR, ART_INDEX_FILE, ART_INDEX_VERSION, type ArtIndex, type ArtLayer, type FrameId, type IndexFrame } from "./types";

/** Адреса каталогу атласу: від `BASE_URL` збірки (у грі на сайті — `/games/kotoklopit/art/`). */
export function artBaseUrl(): string {
  const base: string = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}${ART_DIR}/`;
}

/** Чи є браузер, з якого можна вантажити атлас. */
function hasBrowser(): boolean {
  return typeof document !== "undefined" && typeof fetch === "function";
}

let indexLoad: Promise<ArtIndex | null> | null = null;
/** `index.json`: undefined — ще не вантажили чи вантажиться, null — атласу немає (чи браузера). */
let index: ArtIndex | null | undefined;
const pages = new Map<number, CanvasImageSource>();
const pageLoads = new Map<number, Promise<CanvasImageSource | null>>();

/** Завантажити `index.json` (один раз): null — атласу немає (немає файлу, інша версія формату, поза браузером). */
export function loadArtIndex(): Promise<ArtIndex | null> {
  if (indexLoad) return indexLoad;
  indexLoad = (async (): Promise<ArtIndex | null> => {
    if (!hasBrowser()) return null;
    try {
      const response = await fetch(`${artBaseUrl()}${ART_INDEX_FILE}`);
      if (!response.ok) return null;
      const data = (await response.json()) as Partial<ArtIndex> | null;
      if (!data || data.version !== ART_INDEX_VERSION || !Array.isArray(data.pages) || typeof data.frames !== "object") return null;
      return data as ArtIndex;
    } catch {
      return null;
    }
  })().then((loaded) => {
    index = loaded;
    return loaded;
  });
  return indexLoad;
}

/** `index.json`, якщо вже завантажено: undefined — ще ні, null — атласу немає. */
export function artIndexNow(): ArtIndex | null | undefined {
  return index;
}

/** Кадр в `index.json`: його розмір, pivot, обрізка й шари; undefined — немає (чи індекс ще не завантажено). */
export function indexFrame(frame: FrameId): IndexFrame | undefined {
  return index?.frames[frame];
}

/**
 * Чи можна вже малювати ці кадри: `ready` — індекс і їхні сторінки завантажено; `loading` — ще ні (`loadArtFrames`);
 * `missing` — атласу немає або якогось кадру в ньому немає чи він лише заглушка.
 */
export function artFrameState(frames: readonly FrameId[]): "ready" | "loading" | "missing" {
  if (index === null) return "missing";
  if (index === undefined) return hasBrowser() ? "loading" : "missing";
  let loading = false;
  for (const frame of frames) {
    const entry = index.frames[frame];
    if (!entry || entry.stub) return "missing";
    for (const rect of Object.values(entry.layers)) {
      if (rect && !pages.has(rect.page)) loading = true;
    }
  }
  return loading ? "loading" : "ready";
}

/** Завантажити індекс і сторінки цих кадрів; true — усе є й не заглушки (тепер `artFrameState` — `ready`). */
export async function loadArtFrames(frames: readonly FrameId[]): Promise<boolean> {
  const loaded = await loadArtIndex();
  if (!loaded) return false;
  const need = new Set<number>();
  for (const frame of frames) {
    const entry = loaded.frames[frame];
    if (!entry || entry.stub) return false;
    for (const rect of Object.values(entry.layers)) if (rect) need.add(rect.page);
  }
  const images = await Promise.all([...need].map((page) => loadPage(loaded, page)));
  return images.every((image) => image !== null);
}

function loadPage(loaded: ArtIndex, page: number): Promise<CanvasImageSource | null> {
  const have = pageLoads.get(page);
  if (have) return have;
  const file = loaded.pages[page]?.file;
  const load = file ? loadImage(`${artBaseUrl()}${file}`) : Promise.resolve(null);
  const done = load.then((image) => {
    if (image) pages.set(page, image);
    else pageLoads.delete(page);
    return image;
  });
  pageLoads.set(page, done);
  return done;
}

/** Картинка сторінки: ImageBitmap (декодується поза головним потоком), а де його немає — `<img>`. */
async function loadImage(url: string): Promise<CanvasImageSource | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await createImageBitmap(await response.blob());
    }
    if (typeof Image === "undefined") return null;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** Шари кадру для компонувальника: джерело, розмір полотна кадру в пікселях і сам кадр з `index.json`. */
export interface FrameLayers {
  source: LayerSource;
  w: number;
  h: number;
  frame: IndexFrame;
}

/**
 * Шари кадру зі сторінок атласу, якщо індекс і сторінки вже завантажено (`artFrameState` — `ready`), інакше null.
 * Полотно кадру — `size · res` пікселів; шар лягає на нього зі зсувом обрізки `trim`.
 */
export function artLayerSource(frame: FrameId): FrameLayers | null {
  const entry = index?.frames[frame];
  if (!entry || entry.stub) return null;
  for (const rect of Object.values(entry.layers)) if (rect && !pages.has(rect.page)) return null;
  const source: LayerSource = (layer: ArtLayer): LayerImage | null => {
    const rect = entry.layers[layer];
    const image = rect ? pages.get(rect.page) : undefined;
    if (!rect || !image) return null;
    return { image, sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h, dx: entry.trim.x, dy: entry.trim.y };
  };
  return { source, w: Math.round(entry.size.w * entry.res), h: Math.round(entry.size.h * entry.res), frame: entry };
}

/** Забути завантажене (тести, гаряча перезбірка атласу в dev). */
export function resetArtSources(): void {
  indexLoad = null;
  index = undefined;
  pages.clear();
  pageLoads.clear();
}
