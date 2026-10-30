// Вкладка «Кадри» галереї арту (крок 16, пакет F2): усі записи маніфесту за категоріями й файлами пакетів, кожен кадр
// (стан × ракурс) і окремо кожен шар; заглушки — маджентою («ще не намальовано»), pivot і точки кріплення — хрестиками,
// полотно запису (`size`) — рамкою; лічильник «готово / заглушок» за пакетами — з `index.json` (`stub`).
//
// Записів можуть бути тисячі, тож на сцені лише те, що видно (і трохи довкола): сітку рахує `framegrid.ts`, а клітинки
// з'являються й зникають, коли камеру прокручують.
//
// Параметри адреси: `cat` (категорія), `file` (файл пакета без .ts), `q` (частина id), `show=ready|stub`, а `layers=0`,
// `marks=0`, `box=0`, `captions=0` вимикають шари окремо, хрестики, рамку й підписи.

import Phaser from "phaser";

import { isFrameReady } from "../../../view/art/atlasindex";
import { addArt, isArtStub } from "../../../view/art/atlas";
import { ART_CATEGORIES, DEFAULT_RES } from "../../../view/art/manifest";
import { framesOf, layerRank, type ArtCategory, type ArtEntry, type ArtLayer, type FrameId } from "../../../view/art/types";
import { plural } from "../../../ui/titles";
import {
  CATEGORY_TITLES,
  FRAME_SHOWS,
  filterSources,
  frameSources,
  itemVisible,
  layoutFrames,
  packageStats,
  totalStats,
  type FrameFilter,
  type FrameGrid,
  type FrameShow,
  type FrameSource,
  type GridCell,
  type GridItem,
  type PackageStats,
} from "../framegrid";
import { addLabel, drawBox, drawCross, galleryView, MARK_COLORS, STUB_TEXT, unit, viewRect, type LabelStyle } from "../kit";
import { replaceParams } from "../params";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

/** Модулі маніфесту з назвами файлів: за ними — фільтр і лічильник за пакетами (у `manifest.ts` файлів уже не видно). */
const MODULES = import.meta.glob<readonly ArtEntry[]>("../../../view/art/manifest/*.ts", { import: "MANIFEST", eager: true });

const SHOW_TITLES: Readonly<Record<FrameShow, string>> = { all: "усі", ready: "лише готові", stub: "лише заглушки" };
/** Параметри адреси цієї вкладки: прибираються, коли вкладку закривають. */
const PARAMS = ["cat", "file", "q", "show", "layers", "marks", "box", "captions"] as const;

interface Options {
  layers: boolean;
  marks: boolean;
  box: boolean;
  captions: boolean;
}

export const TAB: GalleryTab = { id: "frames", title: "Кадри", order: 0, mount };

function mount(ctx: GalleryContext): GalleryView {
  const { scene, layer } = ctx;
  const camera = scene.cameras.main;
  const sources = frameSources(MODULES);
  const index = galleryView().index;
  const ready = (frame: FrameId): boolean => isFrameReady(index, frame);
  const params = new URLSearchParams(window.location.search);
  const category = ART_CATEGORIES.find((c) => c === params.get("cat")) ?? null;
  const files = [...new Set(sources.map((source) => source.file))];
  const filter: FrameFilter = {
    category,
    file: files.find((file) => file === params.get("file")) ?? null,
    query: params.get("q") ?? "",
    show: FRAME_SHOWS.find((show) => show === params.get("show")) ?? "all",
  };
  const options: Options = {
    layers: params.get("layers") !== "0",
    marks: params.get("marks") !== "0",
    box: params.get("box") !== "0",
    captions: params.get("captions") !== "0",
  };

  const panel = buildPanel(ctx.panel, sources, files, filter, options, packageStats(sources, ready), () => relayout());

  let grid: FrameGrid = { items: [], width: 0, height: 0, cells: 0 };
  /** Що зараз на сцені: номер у `grid.items` → його об'єкти. */
  const live = new Map<number, Phaser.GameObjects.GameObject[]>();
  let empty: Phaser.GameObjects.Text | null = null;
  /** Камера, за якої востаннє розкладено сітку й показано видиме. */
  let laidOut = { width: -1, zoom: -1 };
  let synced = { top: Number.NaN, bottom: Number.NaN };

  function clear(): void {
    for (const objects of live.values()) for (const object of objects) object.destroy();
    live.clear();
    empty?.destroy();
    empty = null;
  }

  function relayout(): void {
    clear();
    const width = viewRect(camera).w;
    laidOut = { width, zoom: camera.zoom };
    const shown = filterSources(sources, filter);
    grid = layoutFrames(shown, { width, unit: unit(), layers: options.layers, captions: options.captions, show: filter.show, ready }, DEFAULT_RES);
    panel.count(grid, grid.items.filter((item) => item.kind === "entry").length);
    if (grid.items.length === 0) {
      const text = sources.length === 0 ? "Маніфест порожній: записів ще немає (src/view/art/manifest/*.ts)" : "За фільтром нічого немає";
      empty = addLabel(scene, layer, 16 * unit(), 16 * unit(), text, { size: 13 });
    }
    synced = { top: Number.NaN, bottom: Number.NaN };
    sync();
  }

  /** Показати те, що видно (з запасом пів екрана), і прибрати те, що пішло далеко за край. */
  function sync(): void {
    const view = viewRect(camera);
    const height = view.h;
    const top = view.y;
    const bottom = top + height;
    if (Math.abs(top - synced.top) < height * 0.1 && Math.abs(bottom - synced.bottom) < height * 0.1) return;
    synced = { top, bottom };
    const near = { top: top - height / 2, bottom: bottom + height / 2 };
    const far = { top: top - height * 1.5, bottom: bottom + height * 1.5 };
    for (const [i, objects] of live) {
      const item = grid.items[i];
      if (item && itemVisible(item, far.top, far.bottom)) continue;
      for (const object of objects) object.destroy();
      live.delete(i);
    }
    grid.items.forEach((item, i) => {
      if (live.has(i) || !itemVisible(item, near.top, near.bottom)) return;
      live.set(i, materialize(scene, layer, item, options));
    });
  }

  relayout();

  return {
    update() {
      const width = viewRect(camera).w;
      if (Math.abs(width - laidOut.width) > 0.5 || camera.zoom !== laidOut.zoom) relayout();
      else sync();
    },
    destroy() {
      clear();
      replaceParams(Object.fromEntries(PARAMS.map((name) => [name, null])));
    },
  };
}

/** Об'єкти одного елемента сітки: заголовок — підпис; клітинка — зображення шару (чи стос шарів), позначки й підпис. */
function materialize(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, item: GridItem, options: Options): Phaser.GameObjects.GameObject[] {
  if (item.kind !== "cell") {
    const style: LabelStyle =
      item.kind === "category" ? { size: 16, bold: true } : item.kind === "file" ? { size: 13, bold: true } : { size: 12 };
    if (item.source && !entryDone(item.source)) style.color = STUB_TEXT;
    return [addLabel(scene, layer, item.x, item.y, item.text, style).setDepth(20)];
  }
  const objects: Phaser.GameObjects.GameObject[] = [];
  const { entry } = item.source;
  const at = { x: item.box.x + entry.pivot.x, y: item.box.y + entry.pivot.y };
  const images = imageLayers(entry, item).map((name) => addArt(scene, layer, entry.id, { state: item.frame.state, view: item.frame.view, layer: name }));
  // У стосі — лише намальовані шари; нічого ще немає — одна заглушка (шари, яких немає, однакові).
  const drawn = images.filter((image) => !isArtStub(image));
  const shown = drawn.length > 0 ? drawn : images.slice(0, 1);
  for (const image of images) {
    if (shown.includes(image)) objects.push(image.setPosition(at.x, at.y).setDepth(0));
    else image.destroy();
  }
  // Заглушка — кадр не готовий за index.json (stub) чи цього шару в атласі ще немає.
  const stub = !item.ready || drawn.length === 0;
  if (options.box || options.marks) {
    const g = new Phaser.GameObjects.Graphics(scene);
    layer.add(g);
    g.setDepth(10);
    if (options.box) drawBox(g, item.box.x, item.box.y, entry.size.w, entry.size.h, stub ? MARK_COLORS.stub : MARK_COLORS.box);
    if (options.marks) {
      drawCross(g, at.x, at.y, MARK_COLORS.pivot, 7);
      for (const point of Object.values(entry.points ?? {})) drawCross(g, item.box.x + point.x, item.box.y + point.y, MARK_COLORS.point, 5);
    }
    objects.push(g);
  }
  if (options.marks) {
    for (const [name, point] of Object.entries(entry.points ?? {})) {
      const label = addLabel(scene, layer, item.box.x + point.x + 5 * unit(), item.box.y + point.y + 2 * unit(), name, {
        size: 9,
        color: "#0f6b34",
      });
      objects.push(label.setDepth(20));
    }
  }
  if (options.captions) {
    const label = addLabel(scene, layer, item.x, item.y + entry.size.h + 2 * unit(), item.caption, stub ? { color: STUB_TEXT } : {});
    objects.push(label.setDepth(20));
  }
  return objects;
}

/** Які шари класти в клітинку: один, увесь SVG (`all` → без шару) чи стос усіх шарів знизу догори. */
function imageLayers(entry: ArtEntry, cell: GridCell): (ArtLayer | undefined)[] {
  if (cell.layer === "all") return [undefined];
  if (cell.layer !== "stack") return [cell.layer];
  return [...(entry.layers ?? [])].sort((a, b) => layerRank(a) - layerRank(b));
}

/** Чи всі кадри запису готові (за `index.json`). */
function entryDone(source: FrameSource): boolean {
  const index = galleryView().index;
  return framesOf(source.entry).every((frame) => isFrameReady(index, frame.frame));
}

const frameCount = (n: number): string => `${n} ${plural(n, "кадр", "кадри", "кадрів")}`;

// --- Панель -----------------------------------------------------------------------------------

interface Panel {
  /** Скільки показано. */
  count(grid: FrameGrid, entries: number): void;
}

function buildPanel(
  root: HTMLElement,
  sources: readonly FrameSource[],
  files: readonly string[],
  filter: FrameFilter,
  options: Options,
  stats: readonly PackageStats[],
  changed: () => void,
): Panel {
  const index = galleryView().index;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const section = el("section", undefined, "g-frames");
  root.append(section);

  const pages = index?.pages.length ?? 0;
  section.append(
    el(
      "p",
      index
        ? `Атлас: ${pages} ${plural(pages, "сторінка", "сторінки", "сторінок")}, ${frameCount(Object.keys(index.frames).length)}`
        : "Атласу немає — усе малюють заглушки",
      "g-note",
    ),
  );
  const legend = el("p", undefined, "g-legend");
  legend.append(el("span", "", "g-swatch g-swatch-stub"), " ще не намальовано  ", el("span", "", "g-swatch g-swatch-pivot"), " pivot  ");
  legend.append(el("span", "", "g-swatch g-swatch-point"), " точки  ", el("span", "", "g-swatch g-swatch-box"), " полотно");
  section.append(legend);

  // Лічильник за пакетами; клік по рядку — фільтр за цим пакетом.
  const table = el("table", undefined, "g-stats");
  const head = el("tr");
  head.append(el("th", "Пакет"), el("th", "готово"), el("th", "заглушок"));
  table.append(head);
  const rows: { file: string | null; row: HTMLTableRowElement }[] = [];
  const addRow = (row: PackageStats, file: string | null, title: string): void => {
    const tr = el("tr");
    tr.append(el("td", title), el("td", String(row.ready)), el("td", String(row.stubs)));
    tr.title = `${row.entries} ${plural(row.entries, "запис", "записи", "записів")}, ${frameCount(row.frames)}`;
    tr.addEventListener("click", () => {
      filter.file = filter.file === file ? null : file;
      if (file !== null) filter.category = null;
      fileSelect.value = filter.file ?? "";
      categorySelect.value = filter.category ?? "";
      update();
    });
    rows.push({ file, row: tr });
    table.append(tr);
  };
  for (const row of stats) addRow(row, row.file, `${row.file}.ts`);
  addRow(totalStats(stats), null, "Разом");
  section.append(table);

  const field = (title: string, control: HTMLElement): void => {
    const label = el("label", undefined, "g-field");
    label.append(el("span", title), control);
    section.append(label);
  };
  const select = (values: readonly { value: string; title: string }[], current: string): HTMLSelectElement => {
    const node = el("select");
    for (const { value, title } of values) {
      const option = el("option", title);
      option.value = value;
      node.append(option);
    }
    node.value = current;
    return node;
  };
  const categories = ART_CATEGORIES.filter((category) => sources.some((source) => source.category === category));
  const categorySelect = select(
    [{ value: "", title: "усі" }, ...categories.map((category) => ({ value: category, title: `${category} — ${CATEGORY_TITLES[category]}` }))],
    filter.category ?? "",
  );
  categorySelect.addEventListener("change", () => {
    filter.category = (categorySelect.value || null) as ArtCategory | null;
    update();
  });
  field("Категорія", categorySelect);
  const fileSelect = select([{ value: "", title: "усі" }, ...files.map((file) => ({ value: file, title: `${file}.ts` }))], filter.file ?? "");
  fileSelect.addEventListener("change", () => {
    filter.file = fileSelect.value || null;
    update();
  });
  field("Пакет", fileSelect);
  const search = el("input");
  search.type = "search";
  search.placeholder = "частина id";
  search.value = filter.query;
  search.addEventListener("input", () => {
    filter.query = search.value;
    update();
  });
  field("Пошук", search);
  const showSelect = select(
    FRAME_SHOWS.map((show) => ({ value: show, title: SHOW_TITLES[show] })),
    filter.show,
  );
  showSelect.addEventListener("change", () => {
    filter.show = FRAME_SHOWS.find((show) => show === showSelect.value) ?? "all";
    update();
  });
  field("Показати", showSelect);

  const toggle = (name: keyof Options, title: string): void => {
    const label = el("label", undefined, "g-check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = options[name];
    box.addEventListener("change", () => {
      options[name] = box.checked;
      update();
    });
    label.append(box, ` ${title}`);
    section.append(label);
  };
  toggle("layers", "шари окремо");
  toggle("marks", "pivot і точки");
  toggle("box", "рамка полотна");
  toggle("captions", "підписи");

  const counter = el("p", "", "g-note");
  section.append(counter);

  function update(): void {
    for (const { file, row } of rows) row.classList.toggle("g-active", file === filter.file);
    replaceParams({
      cat: filter.category,
      file: filter.file,
      q: filter.query.trim() || null,
      show: filter.show === "all" ? null : filter.show,
      layers: options.layers ? null : "0",
      marks: options.marks ? null : "0",
      box: options.box ? null : "0",
      captions: options.captions ? null : "0",
    });
    changed();
  }
  for (const { file, row } of rows) row.classList.toggle("g-active", file === filter.file);

  return {
    count(grid, entries) {
      counter.textContent = `Показано: ${entries} ${plural(entries, "запис", "записи", "записів")}, ${grid.cells} ${plural(grid.cells, "клітинка", "клітинки", "клітинок")}`;
    },
  };
}
