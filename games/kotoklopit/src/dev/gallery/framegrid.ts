// Вкладка «Кадри» галереї (крок 16): які записи маніфесту показати (категорія, файл пакета, пошук, готові чи заглушки), як
// розкласти їхні кадри й шари сіткою і скільки кадрів кожного пакета вже намальовано. Чисті розрахунки без Phaser і DOM
// (`tests/gallery.test.ts`); малює їх `tabs/frames.ts`.

import { ART_CATEGORIES } from "../../view/art/manifest";
import { framesOf, layerRank, type ArtCategory, type ArtEntry, type ArtFrameRef, type ArtPoint, type FrameId, type FrameLayer } from "../../view/art/types";
import { plural } from "../../ui/titles";

/** Запис маніфесту і файл пакета, з якого він (`src/view/art/manifest/<file>.ts`). */
export interface FrameSource {
  entry: ArtEntry;
  file: string;
  category: ArtCategory;
}

/** Назви категорій (перший сегмент id) для заголовків. */
export const CATEGORY_TITLES: Readonly<Record<ArtCategory, string>> = {
  env: "будова й меблі",
  item: "речі",
  mess: "бруд і дрібниці",
  fx: "ефекти",
  cat: "кіт",
  person: "персонаж",
  icon: "іконки",
  ui: "інтерфейс",
  race: "гонка",
};

/** Файл пакета з шляху модуля маніфесту: `…/manifest/kitchen.ts` → `kitchen`. */
export function manifestFile(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".ts") ? name.slice(0, -".ts".length) : name;
}

/** Записи з модулів маніфесту (шлях → `MANIFEST`) у порядку `manifest.ts`: файли за абеткою, у файлі — як є. */
export function frameSources(modules: Readonly<Record<string, readonly ArtEntry[]>>): FrameSource[] {
  return Object.keys(modules)
    .sort()
    .flatMap((path) =>
      (modules[path] ?? []).map((entry) => ({ entry, file: manifestFile(path), category: entry.id.split("/")[0] as ArtCategory })),
    );
}

// --- Фільтр -----------------------------------------------------------------------------------

/** Які кадри показувати: усі, лише готові чи лише заглушки. */
export type FrameShow = "all" | "ready" | "stub";
export const FRAME_SHOWS: readonly FrameShow[] = ["all", "ready", "stub"];

export interface FrameFilter {
  category: ArtCategory | null;
  file: string | null;
  /** Частина id без урахування регістру; порожньо — усі. */
  query: string;
  show: FrameShow;
}

export const NO_FILTER: FrameFilter = { category: null, file: null, query: "", show: "all" };

/** Записи за категорією, файлом і пошуком (стан кадрів фільтрує `layoutFrames`). */
export function filterSources(sources: readonly FrameSource[], filter: FrameFilter): FrameSource[] {
  const query = filter.query.trim().toLowerCase();
  return sources.filter(
    (source) =>
      (filter.category === null || source.category === filter.category) &&
      (filter.file === null || source.file === filter.file) &&
      (query === "" || source.entry.id.includes(query)),
  );
}

/** Кадри запису, які показувати: усі, готові чи заглушки (`ready` — чи кадр уже намальовано). */
export function shownFrames(entry: ArtEntry, show: FrameShow, ready: (frame: FrameId) => boolean): ArtFrameRef[] {
  const frames = framesOf(entry);
  if (show === "all") return frames;
  return frames.filter((frame) => ready(frame.frame) === (show === "ready"));
}

// --- Лічильник --------------------------------------------------------------------------------

/** Скільки кадрів пакета (файлу маніфесту) намальовано і скільки ще заглушок. */
export interface PackageStats {
  file: string;
  entries: number;
  frames: number;
  ready: number;
  stubs: number;
}

/** Лічильник за пакетами в порядку файлів; кадр без атласу чи з `stub` в `index.json` — заглушка. */
export function packageStats(sources: readonly FrameSource[], ready: (frame: FrameId) => boolean): PackageStats[] {
  const stats = new Map<string, PackageStats>();
  for (const { entry, file } of sources) {
    let row = stats.get(file);
    if (!row) {
      row = { file, entries: 0, frames: 0, ready: 0, stubs: 0 };
      stats.set(file, row);
    }
    row.entries++;
    for (const { frame } of framesOf(entry)) {
      row.frames++;
      if (ready(frame)) row.ready++;
      else row.stubs++;
    }
  }
  return [...stats.values()];
}

/** Разом за всіма пакетами. */
export function totalStats(rows: readonly PackageStats[]): PackageStats {
  return rows.reduce(
    (total, row) => ({
      file: "",
      entries: total.entries + row.entries,
      frames: total.frames + row.frames,
      ready: total.ready + row.ready,
      stubs: total.stubs + row.stubs,
    }),
    { file: "", entries: 0, frames: 0, ready: 0, stubs: 0 },
  );
}

// --- Сітка ------------------------------------------------------------------------------------

/** Шар клітинки: шар кадру, `all` — увесь SVG (запис без шарів), `stack` — усі шари запису стосом, без тонування. */
export type CellLayer = FrameLayer | "stack";

/** Заголовок: категорії, файлу пакета чи запису. */
export interface GridHeading {
  kind: "category" | "file" | "entry";
  text: string;
  /** Запис (для заголовка запису): за ним вкладка показує стан. */
  source?: FrameSource;
  x: number;
  y: number;
  h: number;
}

/** Клітинка: один шар одного кадру. Координати — одиниці арту (px світу галереї). */
export interface GridCell {
  kind: "cell";
  source: FrameSource;
  frame: ArtFrameRef;
  layer: CellLayer;
  /** Підпис під кадром: стан · ракурс · шар. */
  caption: string;
  /** Чи кадр уже намальовано (не заглушка). */
  ready: boolean;
  /** Клітинка разом із підписом. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Лівий верхній кут полотна запису (`size`): pivot — `box + pivot`. */
  box: ArtPoint;
}

export type GridItem = GridHeading | GridCell;

export interface GridOptions {
  /** Ширина, у яку вкладати клітинки, одиниці арту (видима ширина). */
  width: number;
  /** Одиниць арту на CSS px (1 / масштаб): відступи й підписи мають сталий розмір на екрані. */
  unit: number;
  /** Кожен шар окремою клітинкою (і стос); інакше — лише стос. */
  layers: boolean;
  /** Підписи під кадрами. */
  captions: boolean;
  show: FrameShow;
  ready: (frame: FrameId) => boolean;
}

export interface FrameGrid {
  /** Згори донизу: `y` не спадає. */
  items: GridItem[];
  width: number;
  height: number;
  cells: number;
}

/** Розміри сітки, CSS px. */
export const GRID_CSS = {
  margin: 16,
  gap: 14,
  rowGap: 10,
  entryGap: 18,
  category: 32,
  file: 26,
  entry: 22,
  caption: 18,
  /** Середня ширина знака підпису (11 px), щоб підпис не наліз на сусіда. */
  char: 6.4,
  captionPad: 10,
} as const;

/** Шари клітинок запису: без шарів — `all`; з шарами — стос і, якщо треба, кожен шар у типовому порядку. */
export function cellLayers(entry: ArtEntry, separate: boolean): CellLayer[] {
  if (!entry.layers) return ["all"];
  if (!separate) return ["stack"];
  const layers = [...entry.layers].sort((a, b) => layerRank(a) - layerRank(b));
  return ["stack", ...layers];
}

/** Підпис клітинки: стан · ракурс · шар (`stack` — «разом»); без нічого — «кадр». */
export function cellCaption(frame: ArtFrameRef, layer: CellLayer): string {
  const parts = [frame.state, frame.view, layer === "all" ? null : layer === "stack" ? "разом" : layer].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "кадр";
}

/** Рядок заголовка запису: id, розмір, роздільність, кадри, шари й скільки готово. */
export function entryTitle(entry: ArtEntry, frames: number, ready: number, defaultRes: number): string {
  const parts = [`${entry.id}`, `${entry.size.w}×${entry.size.h}`];
  if (entry.res !== undefined && entry.res !== defaultRes) parts.push(`res ${entry.res}`);
  parts.push(`${frames} ${plural(frames, "кадр", "кадри", "кадрів")}`);
  if (entry.layers) parts.push(`${entry.layers.length} ${plural(entry.layers.length, "шар", "шари", "шарів")}`);
  parts.push(ready === frames ? "готово" : ready === 0 ? "заглушка" : `готово ${ready} з ${frames}`);
  return parts.join(" · ");
}

/**
 * Розкласти кадри записів сіткою: категорії в порядку `ART_CATEGORIES`, у них файли пакетів, у них записи; кожен запис — з
 * нового рядка, його клітинки (кадр × шар) — зліва направо з переносом на ширину `width`. Записи без жодного кадру за
 * фільтром `show` (і порожні файли й категорії) не показуються.
 */
export function layoutFrames(sources: readonly FrameSource[], options: GridOptions, defaultRes: number): FrameGrid {
  const u = options.unit;
  const css = GRID_CSS;
  const margin = css.margin * u;
  const right = Math.max(options.width - margin, margin);
  const items: GridItem[] = [];
  let y = margin;
  let width = 0;
  let cells = 0;

  const shown = sources
    .map((source) => ({ source, frames: shownFrames(source.entry, options.show, options.ready) }))
    .filter((item) => item.frames.length > 0);

  for (const category of ART_CATEGORIES) {
    const inCategory = shown.filter((item) => item.source.category === category);
    if (inCategory.length === 0) continue;
    items.push({ kind: "category", text: `${category} — ${CATEGORY_TITLES[category]}`, x: margin, y, h: css.category * u });
    y += css.category * u;
    const files = [...new Set(inCategory.map((item) => item.source.file))];
    for (const file of files) {
      const inFile = inCategory.filter((item) => item.source.file === file);
      const total = inFile.reduce((sum, item) => sum + framesOf(item.source.entry).length, 0);
      const ready = inFile.reduce((sum, item) => sum + framesOf(item.source.entry).filter((f) => options.ready(f.frame)).length, 0);
      const text = `${file}.ts · ${inFile.length} ${plural(inFile.length, "запис", "записи", "записів")} · готово ${ready} з ${total}`;
      items.push({ kind: "file", text, x: margin, y, h: css.file * u });
      y += css.file * u;
      for (const { source, frames } of inFile) {
        const { entry } = source;
        const all = framesOf(entry);
        const readyFrames = all.filter((f) => options.ready(f.frame)).length;
        items.push({ kind: "entry", text: entryTitle(entry, all.length, readyFrames, defaultRes), source, x: margin, y, h: css.entry * u });
        y += css.entry * u;
        let x = margin;
        let rowH = 0;
        const captionH = options.captions ? css.caption * u : 0;
        for (const frame of frames) {
          for (const layer of cellLayers(entry, options.layers)) {
            const caption = cellCaption(frame, layer);
            const captionW = options.captions ? (caption.length * css.char + css.captionPad) * u : 0;
            const w = Math.max(entry.size.w, captionW);
            const h = entry.size.h + captionH;
            if (x > margin && x + w > right) {
              x = margin;
              y += rowH + css.rowGap * u;
              rowH = 0;
            }
            const box = { x: x + (w - entry.size.w) / 2, y };
            items.push({ kind: "cell", source, frame, layer, caption, ready: options.ready(frame.frame), x, y, w, h, box });
            cells++;
            width = Math.max(width, x + w);
            x += w + css.gap * u;
            rowH = Math.max(rowH, h);
          }
        }
        y += rowH + css.entryGap * u;
      }
    }
  }
  return { items, width: width + margin, height: y + margin, cells };
}

/** Чи прямокутник `[top, bottom)` по вертикалі зачіпає видиму смугу. */
export function itemVisible(item: GridItem, top: number, bottom: number): boolean {
  return item.y < bottom && item.y + item.h > top;
}
