// `index.json` атласу (крок 16, «Шов хвилі 1»): адреси файлів і перевірка того, що прийшло з мережі, перш ніж
// `atlasload.ts` складе з нього текстуру `ART_TEXTURE`. Сам завантажувач — Phaser, його перевіряє галерея в браузері.

import { describe, expect, it } from "vitest";

import { artIndexProblems, artIndexUrl, artPageUrl, isFrameReady, parseArtIndex } from "../src/view/art/atlasindex";
import type { ArtIndex } from "../src/view/art/types";

const loader = import.meta.glob<string>("../src/view/art/atlasindex.ts", { query: "?raw", import: "default", eager: true });

describe("index.json атласу", () => {
  const INDEX: ArtIndex = {
    version: 1,
    pages: [{ file: "page-0.3f9a2c1b.webp", w: 256, h: 128 }],
    frames: {
      "env/fridge/closed": { size: { w: 140, h: 260 }, res: 0.5, pivot: { x: 70, y: 228 }, trim: { x: 2, y: 4 }, layers: { all: { page: 0, x: 0, y: 0, w: 60, h: 120 } } },
      "cat/head/base/front": {
        size: { w: 64, h: 60 },
        res: 2,
        pivot: { x: 30, y: 50 },
        points: { mouth: { x: 44, y: 40 } },
        trim: { x: 0, y: 0 },
        layers: { fill: { page: 0, x: 64, y: 0, w: 100, h: 90 }, ink: { page: 0, x: 164, y: 0, w: 100, h: 90 } },
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

  it("зламаний index.json — null і перелік помилок", () => {
    const problems: string[] = [];
    expect(parseArtIndex(JSON.stringify({ ...INDEX, version: 2 }), problems)).toBeNull();
    expect(problems).toEqual(["index.json: версія 2, а потрібна 1"]);
    expect(artIndexProblems({ version: 1, pages: [], frames: {} })).toEqual(["index.json: немає сторінок атласу"]);
    const broken = {
      version: 1,
      pages: [{ file: "p.webp", w: 512, h: 512 }],
      frames: {
        "a/b": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, trim: { x: 0, y: 0 }, layers: { wrong: { page: 0, x: 0, y: 0, w: 4, h: 4 } } },
        "a/c": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, trim: { x: 0, y: 0 }, layers: { all: { page: 3, x: 0, y: 0, w: 4, h: 4 } } },
        "a/d": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, trim: { x: 18, y: 0 }, layers: { all: { page: 0, x: 0, y: 0, w: 4, h: 4 } } },
        "a/e": {
          size: { w: 10, h: 10 },
          res: 2,
          pivot: { x: 5, y: 5 },
          trim: { x: 0, y: 0 },
          layers: { fill: { page: 0, x: 0, y: 0, w: 4, h: 4 }, ink: { page: 0, x: 8, y: 0, w: 5, h: 4 } },
        },
        "a/f": { size: { w: 0, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, trim: { x: 0, y: 0 }, layers: {} },
      },
    };
    expect(artIndexProblems(broken)).toEqual([
      "кадр «a/b», шар «wrong»: невідомий шар",
      "кадр «a/c», шар «all»: немає сторінки 3",
      "кадр «a/d», шар «all»: рамка обрізки виходить за полотно 20 × 20",
      "кадр «a/e», шар «ink»: 5 × 4, а інші шари кадру — 4 × 4",
      "кадр «a/f»: розмір має бути додатним",
    ]);
  });

  it("кадр готовий, якщо він є в атласі й це не заглушка", () => {
    expect(isFrameReady(INDEX, "env/fridge/closed")).toBe(true);
    expect(isFrameReady(INDEX, "cat/head/base/front")).toBe(false);
    expect(isFrameReady(INDEX, "icon/thirst")).toBe(false);
    expect(isFrameReady(null, "env/fridge/closed")).toBe(false);
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
