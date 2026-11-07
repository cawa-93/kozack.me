// Галерея арту (крок 16, пакет F2): адреса галереї, сітка й лічильник вкладки «Кадри». Чисті частини — без Phaser; сам
// шелл (`src/dev/gallery/main.ts`) і вкладки — Phaser, їх перевіряють браузер і скрипт знімків (`--page gallery`).

import { describe, expect, it } from "vitest";

import type { ArtEntry } from "../src/view/art/types";
import {
  cellCaption,
  cellLayers,
  filterSources,
  frameSources,
  layoutFrames,
  manifestFile,
  NO_FILTER,
  packageStats,
  shownFrames,
  totalStats,
  type GridCell,
  type GridOptions,
} from "../src/dev/gallery/framegrid";
import { formatZoom, parseGalleryParams, parseZoom, PHONE_ZOOM, withParams } from "../src/dev/gallery/params";

const FRIDGE: ArtEntry = { id: "env/fridge", size: { w: 140, h: 260 }, pivot: { x: 70, y: 228 }, states: ["closed", "open"] };
const HEAD: ArtEntry = {
  id: "cat/head/base",
  size: { w: 64, h: 60 },
  pivot: { x: 30, y: 50 },
  points: { mouth: { x: 44, y: 40 } },
  layers: ["ink", "fill", "shade"],
  views: ["front", "back"],
};
const THIRST: ArtEntry = { id: "icon/thirst", size: { w: 40, h: 40 }, pivot: { x: 20, y: 20 } };
const MODULES = {
  "../../view/art/manifest/kitchen.ts": [FRIDGE],
  "../../view/art/manifest/cat-base.ts": [HEAD],
  "../../view/art/manifest/icons.ts": [THIRST],
};

describe("адреса галереї", () => {
  it("за замовчуванням: перша вкладка, світле тло, ×1, час іде", () => {
    expect(parseGalleryParams("")).toEqual({ tab: null, bg: "light", zoom: 1, time: null, span: 4000, speed: 1, panel: null });
  });

  it("вкладка, тло, масштаб, час на паузі, повзунок, швидкість і панель", () => {
    expect(parseGalleryParams("?tab=rigs&bg=floor&zoom=phone&t=1500&span=2000&speed=0.5&panel=0")).toEqual({
      tab: "rigs",
      bg: "floor",
      zoom: PHONE_ZOOM,
      time: 1500,
      span: 2000,
      speed: 0.5,
      panel: false,
    });
    // Час не виходить за повзунок; незнайоме тло — світле.
    expect(parseGalleryParams("?t=9000&span=2000&bg=blue").time).toBe(2000);
    expect(parseGalleryParams("?bg=blue").bg).toBe("light");
  });

  it("масштаб: phone — кіт ≈ 40 px, число з крапкою чи комою, у межах", () => {
    expect(PHONE_ZOOM * 56).toBeCloseTo(40);
    expect(parseZoom("2")).toBe(2);
    expect(parseZoom("0,5")).toBe(0.5);
    expect(parseZoom("100")).toBe(8);
    expect(parseZoom("0.01")).toBe(0.1);
    expect(parseZoom("-1")).toBeNull();
    expect(parseZoom("abc")).toBeNull();
    expect(parseZoom(null)).toBeNull();
    expect(formatZoom(PHONE_ZOOM)).toBe("phone");
    expect(formatZoom(1.23456)).toBe("1.235");
  });

  it("зміни адреси не чіпають інших параметрів", () => {
    expect(withParams("?tab=frames&q=fridge", { tab: "rigs", zoom: "2" })).toBe("?tab=rigs&q=fridge&zoom=2");
    expect(withParams("?tab=frames", { tab: null })).toBe("");
  });
});

describe("вкладка «Кадри»: записи й фільтр", () => {
  const sources = frameSources(MODULES);

  it("записи — у порядку файлів за абеткою, з файлом пакета й категорією", () => {
    expect(manifestFile("../../view/art/manifest/cat-base.ts")).toBe("cat-base");
    expect(sources.map((source) => [source.entry.id, source.file, source.category])).toEqual([
      ["cat/head/base", "cat-base", "cat"],
      ["icon/thirst", "icons", "icon"],
      ["env/fridge", "kitchen", "env"],
    ]);
  });

  it("фільтр за категорією, файлом і частиною id", () => {
    const ids = (filter: Partial<typeof NO_FILTER>): string[] => filterSources(sources, { ...NO_FILTER, ...filter }).map((s) => s.entry.id);
    expect(ids({})).toHaveLength(3);
    expect(ids({ category: "env" })).toEqual(["env/fridge"]);
    expect(ids({ file: "icons" })).toEqual(["icon/thirst"]);
    expect(ids({ query: " HEAD " })).toEqual(["cat/head/base"]);
    expect(ids({ category: "cat", file: "icons" })).toEqual([]);
  });

  it("готові чи заглушки — за кадрами", () => {
    const ready = (frame: string): boolean => frame === "env/fridge/open";
    expect(shownFrames(FRIDGE, "all", ready).map((f) => f.frame)).toEqual(["env/fridge/closed", "env/fridge/open"]);
    expect(shownFrames(FRIDGE, "ready", ready).map((f) => f.frame)).toEqual(["env/fridge/open"]);
    expect(shownFrames(FRIDGE, "stub", ready).map((f) => f.frame)).toEqual(["env/fridge/closed"]);
  });

  it("лічильник «готово / заглушок» за пакетами", () => {
    const ready = (frame: string): boolean => frame === "env/fridge/open" || frame === "icon/thirst";
    const stats = packageStats(sources, ready);
    expect(stats).toEqual([
      { file: "cat-base", entries: 1, frames: 2, ready: 0, stubs: 2 },
      { file: "icons", entries: 1, frames: 1, ready: 1, stubs: 0 },
      { file: "kitchen", entries: 1, frames: 2, ready: 1, stubs: 1 },
    ]);
    expect(totalStats(stats)).toEqual({ file: "", entries: 3, frames: 5, ready: 2, stubs: 3 });
  });
});

describe("вкладка «Кадри»: сітка", () => {
  const sources = frameSources(MODULES);
  const options: GridOptions = { width: 1000, unit: 1, layers: true, captions: true, show: "all", ready: () => false };
  const cellsOf = (items: ReturnType<typeof layoutFrames>["items"]): GridCell[] => items.filter((item): item is GridCell => item.kind === "cell");

  it("шари клітинок: без шарів — увесь SVG, з шарами — стос і кожен шар у типовому порядку", () => {
    expect(cellLayers(FRIDGE, true)).toEqual(["all"]);
    expect(cellLayers(HEAD, false)).toEqual(["stack"]);
    expect(cellLayers(HEAD, true)).toEqual(["stack", "fill", "shade", "ink"]);
    expect(cellCaption({ frame: "cat/head/base/front", state: null, view: "front", svg: "" }, "fill")).toBe("front · fill");
    expect(cellCaption({ frame: "env/fridge/open", state: "open", view: null, svg: "" }, "all")).toBe("open");
    expect(cellCaption({ frame: "icon/thirst", state: null, view: null, svg: "" }, "all")).toBe("кадр");
    expect(cellCaption({ frame: "cat/head/base/back", state: null, view: "back", svg: "" }, "stack")).toBe("back · разом");
  });

  it("категорії в порядку маніфесту, у кожній — файл, запис і клітинки кадр × шар", () => {
    const grid = layoutFrames(sources, options, 2);
    const headings = grid.items.filter((item) => item.kind !== "cell").map((item) => `${item.kind}:${item.text.split(" ")[0]}`);
    expect(headings).toEqual([
      "category:env",
      "file:kitchen.ts",
      "entry:env/fridge",
      "category:cat",
      "file:cat-base.ts",
      "entry:cat/head/base",
      "category:icon",
      "file:icons.ts",
      "entry:icon/thirst",
    ]);
    const cells = cellsOf(grid.items);
    expect(grid.cells).toBe(cells.length);
    // Холодильник — 2 стани; голова — 2 ракурси × (стос + 3 шари); спрага — 1.
    expect(cells.map((cell) => `${cell.frame.frame}#${cell.layer}`)).toEqual([
      "env/fridge/closed#all",
      "env/fridge/open#all",
      ...["front", "back"].flatMap((view) => ["stack", "fill", "shade", "ink"].map((layer) => `cat/head/base/${view}#${layer}`)),
      "icon/thirst#all",
    ]);
    // Згори донизу, у межах ширини, без накладань у рядку.
    for (let i = 1; i < grid.items.length; i++) expect(grid.items[i]!.y).toBeGreaterThanOrEqual(grid.items[i - 1]!.y);
    for (const cell of cells) {
      expect(cell.x + cell.w).toBeLessThanOrEqual(1000);
      expect(cell.h).toBe(cell.source.entry.size.h + 18);
      expect(cell.box.y).toBe(cell.y);
      expect(cell.box.x - cell.x).toBeCloseTo((cell.w - cell.source.entry.size.w) / 2);
    }
    for (let i = 1; i < cells.length; i++) {
      const [a, b] = [cells[i - 1]!, cells[i]!];
      if (a.y === b.y) expect(b.x).toBeGreaterThanOrEqual(a.x + a.w);
    }
    expect(grid.height).toBeGreaterThan(cells.at(-1)!.y + cells.at(-1)!.h);
  });

  it("вузько — клітинки переносяться, а кожен запис починається з нового рядка", () => {
    const grid = layoutFrames(sources, { ...options, width: 300 }, 2);
    const heads = cellsOf(grid.items).filter((cell) => cell.source.entry.id === "cat/head/base");
    const rows = new Set(heads.map((cell) => cell.y));
    expect(rows.size).toBeGreaterThan(1);
    const fridge = cellsOf(grid.items).filter((cell) => cell.source.entry.id === "env/fridge");
    expect(Math.min(...heads.map((cell) => cell.y))).toBeGreaterThan(Math.max(...fridge.map((cell) => cell.y + cell.h)));
  });

  it("відступи й підписи — сталі на екрані: удвічі дрібніший масштаб — удвічі більші в одиницях арту", () => {
    const near = layoutFrames(sources, { ...options, unit: 1 }, 2);
    const far = layoutFrames(sources, { ...options, unit: 2, width: 2000 }, 2);
    const first = (grid: typeof near): GridCell => cellsOf(grid.items)[0]!;
    expect(first(far).x).toBe(first(near).x * 2);
    expect(first(far).h - FRIDGE.size.h).toBe((first(near).h - FRIDGE.size.h) * 2);
  });

  it("без підписів і шарів — клітинка завширшки з полотно; без кадрів за фільтром — запис зникає", () => {
    const grid = layoutFrames(sources, { ...options, captions: false, layers: false }, 2);
    const cells = cellsOf(grid.items);
    expect(cells.map((cell) => cell.w)).toEqual([140, 140, 64, 64, 40]);
    const onlyReady = layoutFrames(sources, { ...options, show: "ready", ready: (f) => f === "icon/thirst" }, 2);
    expect(onlyReady.items.map((item) => item.kind)).toEqual(["category", "file", "entry", "cell"]);
    expect(layoutFrames([], options, 2).items).toEqual([]);
  });
});
