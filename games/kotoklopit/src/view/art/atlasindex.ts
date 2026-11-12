// `index.json` атласу (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): адреси файлів атласу й перевірка того, що
// прийшло з мережі, перш ніж складати з нього текстуру. Без Phaser і DOM: це беруть завантажувач (`atlasload.ts`),
// галерея й тести.

import {
  ART_DIR,
  ART_INDEX_FILE,
  ART_INDEX_VERSION,
  isArtLayer,
  type ArtIndex,
  type AtlasPage,
  type FrameBox,
  type IndexGlow,
  type IndexLayer,
} from "./types";

/** Базова адреса гри з «/» наприкінці (`import.meta.env.BASE_URL`: «/» у dev, «/games/kotoklopit/» у збірці). */
function withSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Адреса `index.json` атласу від базової адреси гри. */
export function artIndexUrl(base: string): string {
  return `${withSlash(base)}${ART_DIR}/${ART_INDEX_FILE}`;
}

/** Адреса сторінки атласу (`AtlasPage.file`, відносно `art/`) від базової адреси гри. */
export function artPageUrl(base: string, file: string): string {
  return `${withSlash(base)}${ART_DIR}/${file}`;
}

/**
 * `index.json` з тексту відповіді сервера; null — це не JSON (у dev Vite на файл, якого немає, віддає `index.html`), інша
 * версія формату чи зламаний вміст (тоді `problems` отримує, що саме не так). Атлас без жодної сторінки — теж null:
 * складати нема з чого.
 */
export function parseArtIndex(text: string, problems?: string[]): ArtIndex | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const found = artIndexProblems(data);
  if (found.length > 0) {
    problems?.push(...found);
    return null;
  }
  return data as ArtIndex;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPositive = (value: unknown): value is number => isNumber(value) && value > 0;
const isPoint = (value: unknown): boolean => isObject(value) && isNumber(value["x"]) && isNumber(value["y"]);

/** Скільки помилок перелічувати, щоб зламаний файл на тисячу кадрів не дав тисячу рядків. */
const MAX_PROBLEMS = 20;
/** Дробові розміри полотна (`size · res`) округлює конвеєр: на стільки пікселів шар може вийти за полотно. */
const ROUNDING_PX = 1;

/** Що не так із розібраним `index.json`: по рядку на помилку (не більше `MAX_PROBLEMS`); порожньо — усе гаразд. */
export function artIndexProblems(data: unknown): string[] {
  const problems: string[] = [];
  const add = (text: string): boolean => {
    if (problems.length < MAX_PROBLEMS) problems.push(text);
    return problems.length < MAX_PROBLEMS;
  };
  if (!isObject(data)) return ["index.json — не об'єкт"];
  if (data["version"] !== ART_INDEX_VERSION) return [`index.json: версія ${String(data["version"])}, а потрібна ${ART_INDEX_VERSION}`];
  const pages = data["pages"];
  if (!Array.isArray(pages) || pages.length === 0) return ["index.json: немає сторінок атласу"];
  pages.forEach((page: unknown, i) => {
    if (!isObject(page) || typeof page["file"] !== "string" || page["file"] === "" || !isPositive(page["w"]) || !isPositive(page["h"])) {
      add(`сторінка ${i}: треба { file, w, h }`);
    } else if (page["bytes"] !== undefined && !isPositive(page["bytes"])) {
      add(`сторінка ${i}: bytes має бути додатним`);
    } else if (page["compose"] !== undefined && page["compose"] !== true) {
      add(`сторінка ${i}: compose — лише true`);
    } else if (page["compose"] !== true && pages.slice(0, i).some((before: unknown) => isObject(before) && before["compose"] === true)) {
      // Номер сторінки для Phaser — номер джерела його текстури (кадри, карти сяйва `highlight.ts`).
      add(`сторінка ${i}: сторінки компонувальника (compose) мають бути останніми`);
    }
  });
  const frames = data["frames"];
  if (!isObject(frames)) return [...problems, "index.json: немає кадрів"];
  for (const [id, frame] of Object.entries(frames)) {
    if (!frameProblems(id, frame, pages as AtlasPage[], add)) break;
  }
  return problems;
}

/** Перевіряє кадр; false — помилок уже забагато, далі не перевіряти. */
function frameProblems(id: string, frame: unknown, pages: readonly AtlasPage[], add: (text: string) => boolean): boolean {
  const where = `кадр «${id}»`;
  if (!isObject(frame)) return add(`${where}: не об'єкт`);
  const size = frame["size"];
  if (!isObject(size) || !isPositive(size["w"]) || !isPositive(size["h"])) return add(`${where}: розмір має бути додатним`);
  if (!isPositive(frame["res"])) return add(`${where}: res має бути додатною`);
  if (!isPoint(frame["pivot"])) return add(`${where}: pivot має бути точкою`);
  const points = frame["points"];
  if (points !== undefined && (!isObject(points) || !Object.values(points).every(isPoint))) return add(`${where}: точки мають бути точками`);
  const layers = frame["layers"];
  if (!isObject(layers) || Object.keys(layers).length === 0) return add(`${where}: немає шарів`);
  const { w, h } = size as { w: number; h: number };
  const res = frame["res"] as number;
  const rawBox = frame["box"];
  let box: FrameBox | null = null;
  if (rawBox !== undefined) {
    const isPixel = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
    if (!isObject(rawBox) || !isPixel(rawBox["x"]) || !isPixel(rawBox["y"]) || !isPixel(rawBox["w"]) || !isPixel(rawBox["h"]) || rawBox["w"] === 0 || rawBox["h"] === 0) {
      return add(`${where}: рамка вмісту (box) — { x, y, w, h } цілими пікселями`);
    }
    box = rawBox as unknown as FrameBox;
    if (box.x + box.w > w * res + ROUNDING_PX || box.y + box.h > h * res + ROUNDING_PX) return add(`${where}: рамка вмісту (box) виходить за полотно кадру ${w * res} × ${h * res}`);
  }
  for (const [layer, rect] of Object.entries(layers)) {
    const at = `${where}, шар «${layer}»`;
    if (layer !== "all" && !isArtLayer(layer)) {
      if (!add(`${at}: невідомий шар`)) return false;
      continue;
    }
    const fields = ["page", "x", "y", "dx", "dy"] as const;
    if (!isObject(rect) || !fields.every((field) => isNumber(rect[field])) || !isPositive(rect["w"]) || !isPositive(rect["h"])) {
      if (!add(`${at}: треба { page, x, y, w, h, dx, dy }`)) return false;
      continue;
    }
    const r = rect as unknown as IndexLayer;
    const page = Number.isInteger(r.page) ? pages[r.page] : undefined;
    if (page === undefined) {
      if (!add(`${at}: немає сторінки ${r.page}`)) return false;
      continue;
    }
    if (r.x < 0 || r.y < 0 || r.x + r.w > page.w || r.y + r.h > page.h) {
      if (!add(`${at}: виходить за сторінку ${r.page} (${page.w} × ${page.h})`)) return false;
    }
    if (layer === "all" && page.compose === true) {
      if (!add(`${at}: кадр без шарів — на сторінці компонувальника ${r.page}`)) return false;
    }
    // Кожен шар обрізано своєю рамкою: лягає на полотно кадру зі своїм зсувом і має в ньому вміститися.
    if (r.dx < 0 || r.dy < 0 || r.dx + r.w > w * res + ROUNDING_PX || r.dy + r.h > h * res + ROUNDING_PX) {
      if (!add(`${at}: виходить за полотно кадру ${w * res} × ${h * res}`)) return false;
    }
    // Порожній шар — спільний прозорий піксель у (0, 0): рамки вмісту він не розтягує.
    const blank = r.w === 1 && r.h === 1 && r.dx === 0 && r.dy === 0;
    if (box && !blank && (r.dx < box.x || r.dy < box.y || r.dx + r.w > box.x + box.w || r.dy + r.h > box.y + box.h)) {
      if (!add(`${at}: виходить за рамку вмісту кадру (box)`)) return false;
    }
  }
  if (frame["stub"] !== undefined && frame["stub"] !== true) return add(`${where}: stub — лише true`);
  const glow = frame["glow"];
  if (glow !== undefined) {
    const at = `${where}, сяйво`;
    const fields = ["page", "x", "y", "dx", "dy"] as const;
    if (!isObject(glow) || !fields.every((field) => isNumber(glow[field])) || !isPositive(glow["w"]) || !isPositive(glow["h"]) || !isPositive(glow["scale"])) {
      return add(`${at}: треба { page, x, y, w, h, dx, dy, scale }`);
    }
    const g = glow as unknown as IndexGlow;
    const page = Number.isInteger(g.page) ? pages[g.page] : undefined;
    if (page === undefined) return add(`${at}: немає сторінки ${g.page}`);
    if (g.x < 0 || g.y < 0 || g.x + g.w > page.w || g.y + g.h > page.h) return add(`${at}: виходить за сторінку ${g.page} (${page.w} × ${page.h})`);
    if (page.compose === true) return add(`${at}: на сторінці компонувальника ${g.page}`);
  }
  return true;
}

/**
 * Номери сторінок, які стають джерелами текстури Phaser: усі, крім сторінок компонувальника (`AtlasPage.compose`) — їх
 * читає лише Canvas2D. `withCompose` — разом із ними: галерея показує окремі шари кадрами Phaser.
 */
export function phaserPages(index: Pick<ArtIndex, "pages">, withCompose = false): number[] {
  const out: number[] = [];
  index.pages.forEach((page, i) => {
    if (withCompose || page.compose !== true) out.push(i);
  });
  return out;
}

/** Чи кадр намальовано: він є в атласі й це не заглушка конвеєра. Без атласу (null) — ні. */
export function isFrameReady(index: ArtIndex | null, frame: string): boolean {
  if (!index || !Object.hasOwn(index.frames, frame)) return false;
  return index.frames[frame as keyof ArtIndex["frames"]]?.stub !== true;
}
