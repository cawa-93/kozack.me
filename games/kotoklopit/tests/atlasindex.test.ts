// `index.json` атласу (крок 16, «Шов хвилі 1»): адреси файлів і перевірка того, що прийшло з мережі, перш ніж
// `atlasload.ts` складе з нього текстуру `ART_TEXTURE`. Сам завантажувач — Phaser, його перевіряє галерея в браузері.

import { afterEach, describe, expect, it } from "vitest";

import { artIndexProblems, artIndexUrl, artPageUrl, isFrameReady, parseArtIndex } from "../src/view/art/atlasindex";
import { artLayerSource, resetArtSources, shareArtAtlas } from "../src/view/art/sources";
import { ART_INDEX_VERSION, type ArtIndex, type FrameId } from "../src/view/art/types";

const loader = import.meta.glob<string>("../src/view/art/atlasindex.ts", { query: "?raw", import: "default", eager: true });

describe("index.json атласу", () => {
  const INDEX: ArtIndex = {
    version: 2,
    pages: [{ file: "page-0.3f9a2c1b.webp", w: 256, h: 128 }],
    frames: {
      "env/fridge/closed": { size: { w: 140, h: 260 }, res: 0.5, pivot: { x: 70, y: 228 }, layers: { all: { page: 0, x: 0, y: 0, w: 60, h: 120, dx: 2, dy: 4 } } },
      "cat/head/base/front": {
        size: { w: 64, h: 60 },
        res: 2,
        pivot: { x: 30, y: 50 },
        points: { mouth: { x: 44, y: 40 } },
        // Кожен шар — своя рамка: зсув у полотні кадру й розмір.
        layers: { fill: { page: 0, x: 64, y: 0, w: 80, h: 70, dx: 10, dy: 12 }, ink: { page: 0, x: 164, y: 0, w: 100, h: 90, dx: 0, dy: 0 } },
        stub: true,
      },
    },
  };

  it("адреси — від базової адреси гри", () => {
    expect(artIndexUrl("/")).toBe("/art/index.json");
    expect(artIndexUrl("/games/kotoklopit/")).toBe("/games/kotoklopit/art/index.json");
    expect(artPageUrl("/games/kotoklopit", "page-0.ab.webp")).toBe("/games/kotoklopit/art/page-0.ab.webp");
  });

  it("правильний index.json розбирається; не JSON (index.html від Vite) — null без помилок", () => {
    expect(artIndexProblems(INDEX)).toEqual(["кадр «cat/head/base/front», шар «ink»: виходить за сторінку 0 (256 × 128)"]);
    const fixed = structuredClone(INDEX) as { pages: { w: number }[] } & ArtIndex;
    fixed.pages[0]!.w = 512;
    expect(parseArtIndex(JSON.stringify(fixed))).toEqual(fixed);
    const problems: string[] = [];
    expect(parseArtIndex("<!doctype html><html>", problems)).toBeNull();
    expect(problems).toEqual([]);
  });

  it("розмір файлу сторінки (bytes) — необов'язковий, але додатний", () => {
    const ok = { version: 2, pages: [{ file: "p.webp", w: 4, h: 4, bytes: 120 }], frames: {} };
    expect(artIndexProblems(ok)).toEqual([]);
    expect(artIndexProblems({ ...ok, pages: [{ file: "p.webp", w: 4, h: 4, bytes: 0 }] })).toEqual(["сторінка 0: bytes має бути додатним"]);
    expect(artIndexProblems({ ...ok, pages: [{ file: "p.webp", w: 4, h: 4, bytes: "120" }] })).toEqual(["сторінка 0: bytes має бути додатним"]);
  });

  it("зламаний index.json — null і перелік помилок", () => {
    const problems: string[] = [];
    // Index.json зі спільною рамкою обрізки кадру (версія 1) новий код не складає.
    expect(parseArtIndex(JSON.stringify({ ...INDEX, version: 1 }), problems)).toBeNull();
    expect(problems).toEqual(["index.json: версія 1, а потрібна 2"]);
    expect(artIndexProblems({ version: 2, pages: [], frames: {} })).toEqual(["index.json: немає сторінок атласу"]);
    const rect = { page: 0, x: 0, y: 0, w: 4, h: 4, dx: 0, dy: 0 };
    const broken = {
      version: 2,
      pages: [{ file: "p.webp", w: 512, h: 512 }],
      frames: {
        "a/b": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { wrong: rect } },
        "a/c": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { all: { ...rect, page: 3 } } },
        "a/d": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { fill: rect, ink: { ...rect, dx: 18 } } },
        // Шари одного кадру — різного розміру й з різним зсувом: так і має бути.
        "a/e": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { fill: rect, ink: { ...rect, x: 8, w: 5, dx: 15, dy: 16 } } },
        "a/f": { size: { w: 0, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: {} },
        "a/g": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, trim: { x: 0, y: 0 }, layers: { all: { page: 0, x: 0, y: 0, w: 4, h: 4 } } },
        "a/h": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { all: { ...rect, dx: -1 } } },
      },
    };
    expect(artIndexProblems(broken)).toEqual([
      "кадр «a/b», шар «wrong»: невідомий шар",
      "кадр «a/c», шар «all»: немає сторінки 3",
      "кадр «a/d», шар «ink»: виходить за полотно кадру 20 × 20",
      "кадр «a/f»: розмір має бути додатним",
      "кадр «a/g», шар «all»: треба { page, x, y, w, h, dx, dy }",
      "кадр «a/h», шар «all»: виходить за полотно кадру 20 × 20",
    ]);
  });

  it("кадр готовий, якщо він є в атласі й це не заглушка", () => {
    expect(isFrameReady(INDEX, "env/fridge/closed")).toBe(true);
    expect(isFrameReady(INDEX, "cat/head/base/front")).toBe(false);
    expect(isFrameReady(INDEX, "icon/thirst")).toBe(false);
    expect(isFrameReady(null, "env/fridge/closed")).toBe(false);
  });
});

describe("шари кадру для компонувальника (sources.ts)", () => {
  afterEach(() => resetArtSources());

  it("кожен шар лягає на полотно кадру зі своїм зсувом; шару, якого немає, — null", () => {
    const pages = [{ tag: "сторінка 0" }, { tag: "сторінка 1" }] as unknown as CanvasImageSource[];
    const frame = "person/head/0/front" as FrameId;
    const index: ArtIndex = {
      version: ART_INDEX_VERSION,
      pages: [
        { file: "page-0.webp", w: 2048, h: 2048 },
        { file: "page-1.webp", w: 2048, h: 2048 },
      ],
      frames: {
        [frame]: {
          size: { w: 64, h: 70 },
          res: 2,
          pivot: { x: 32, y: 46 },
          layers: { fill: { page: 0, x: 50, y: 60, w: 20, h: 10, dx: 7, dy: 9 }, ink: { page: 1, x: 10, y: 20, w: 30, h: 40, dx: 3, dy: 4 } },
        },
      },
    };
    shareArtAtlas(index, pages);
    const layers = artLayerSource(frame);
    expect([layers?.w, layers?.h]).toEqual([128, 140]);
    expect(layers?.source("fill")).toEqual({ image: pages[0], sx: 50, sy: 60, sw: 20, sh: 10, dx: 7, dy: 9 });
    expect(layers?.source("ink")).toEqual({ image: pages[1], sx: 10, sy: 20, sw: 30, sh: 40, dx: 3, dy: 4 });
    expect(layers?.source("shade")).toBeNull();
  });
});

describe("шви атласу", () => {
  it("перевірка index.json — без Phaser і DOM", () => {
    const source = Object.values(loader)[0] ?? "";
    expect(source).not.toBe("");
    expect(source).not.toMatch(/from\s+["']phaser["']/);
    expect(source).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
  });
});
