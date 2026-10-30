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
  type AtlasRect,
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
/** Дробові розміри полотна (`size · res`) округлює конвеєр: на стільки пікселів рамка може вийти за полотно. */
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
  if (!isPoint(frame["trim"])) return add(`${where}: trim має бути точкою`);
  const points = frame["points"];
  if (points !== undefined && (!isObject(points) || !Object.values(points).every(isPoint))) return add(`${where}: точки мають бути точками`);
  const layers = frame["layers"];
  if (!isObject(layers) || Object.keys(layers).length === 0) return add(`${where}: немає шарів`);
  const { w, h } = size as { w: number; h: number };
  const res = frame["res"] as number;
  const trim = frame["trim"] as { x: number; y: number };
  let rectSize: string | null = null;
  for (const [layer, rect] of Object.entries(layers)) {
    const at = `${where}, шар «${layer}»`;
    if (layer !== "all" && !isArtLayer(layer)) {
      if (!add(`${at}: невідомий шар`)) return false;
      continue;
    }
    if (!isObject(rect) || !isNumber(rect["page"]) || !isNumber(rect["x"]) || !isNumber(rect["y"]) || !isPositive(rect["w"]) || !isPositive(rect["h"])) {
      if (!add(`${at}: треба { page, x, y, w, h }`)) return false;
      continue;
    }
    const r = rect as unknown as AtlasRect;
    const page = Number.isInteger(r.page) ? pages[r.page] : undefined;
    if (page === undefined) {
      if (!add(`${at}: немає сторінки ${r.page}`)) return false;
      continue;
    }
    if (r.x < 0 || r.y < 0 || r.x + r.w > page.w || r.y + r.h > page.h) {
      if (!add(`${at}: виходить за сторінку ${r.page} (${page.w} × ${page.h})`)) return false;
    }
    if (trim.x < 0 || trim.y < 0 || trim.x + r.w > w * res + ROUNDING_PX || trim.y + r.h > h * res + ROUNDING_PX) {
      if (!add(`${at}: рамка обрізки виходить за полотно ${w * res} × ${h * res}`)) return false;
    }
    // Шари одного кадру обрізано спільною рамкою — вони однакового розміру й накладаються піксель у піксель.
    const thisSize = `${r.w} × ${r.h}`;
    if (rectSize !== null && rectSize !== thisSize) {
      if (!add(`${at}: ${thisSize}, а інші шари кадру — ${rectSize}`)) return false;
    }
    rectSize ??= thisSize;
  }
  if (frame["stub"] !== undefined && frame["stub"] !== true) return add(`${where}: stub — лише true`);
  return true;
}

/** Чи кадр намальовано: він є в атласі й це не заглушка конвеєра. Без атласу (null) — ні. */
export function isFrameReady(index: ArtIndex | null, frame: string): boolean {
  if (!index || !Object.hasOwn(index.frames, frame)) return false;
  return index.frames[frame as keyof ArtIndex["frames"]]?.stub !== true;
}
