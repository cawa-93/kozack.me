// Арт і конвеєр атласів (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): справжні SVG з `art/` проти маніфесту й
// палітри; перевірки SVG, растеризація шарів, обрізка, пакування, кеш і збирання атласу — на фікстурах
// (`tests/fixtures/art/`), поки справжнього арту мало.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { ALLOWED_COLORS, LINE } from "../art/palette";
import { artChange, buildArt, isAtlasFile, listFiles, loadManifest, requireAllFromEnv, stubRes, STUB_ATLAS_RES } from "../scripts/art/build";
import { ArtCache } from "../scripts/art/cache";
import { composePage, pack, pow2, type PackItem } from "../scripts/art/pack";
import { densityFor, rasterFrame, rasterize, stylesheetsFor, unionBounds, type LayerRaster, type Rgba } from "../scripts/art/raster";
import {
  colorProblems,
  drawnProblems,
  isPrivateArtPath,
  layerStylesheet,
  orphanSvgs,
  parseSvg,
  prepareSvg,
  strokeProblems,
  svgProblems,
  topLevelLayers,
} from "../scripts/art/svg";
import { artEntries } from "../src/view/art/manifest";
import { framesOf, type ArtEntry, type ArtIndex } from "../src/view/art/types";

const GAME_DIR = fileURLToPath(new URL("..", import.meta.url));
const ART_DIR = path.join(GAME_DIR, "art");
const FIXTURES = path.join(GAME_DIR, "tests", "fixtures", "art");

const fixture = (file: string): string => readFileSync(path.join(FIXTURES, file), "utf8");

// --- Справжній арт ------------------------------------------------------------------------------

describe("арт гри (art/) і маніфест", () => {
  const entries = artEntries();
  const files = listFiles(ART_DIR);
  const has = (svg: string): boolean => files.includes(svg);
  const svgs = files.filter((file) => file.endsWith(".svg") && !isPrivateArtPath(file));

  it("кожен SVG запису — полотно й шари як у маніфесті, стани — з запису, без тексту, растру й зовнішніх посилань", () => {
    const problems: string[] = [];
    for (const entry of entries) {
      for (const svg of new Set(framesOf(entry).map((frame) => frame.svg))) {
        if (!has(svg)) continue;
        problems.push(...svgProblems(readFileSync(path.join(ART_DIR, svg), "utf8"), entry).map((p) => `art/${svg}: ${p}`));
      }
    }
    expect(problems).toEqual([]);
  });

  it("кольори лише з палітри (art/palette.ts), товщина ліній — у межах LINE", () => {
    const problems: string[] = [];
    for (const svg of svgs) {
      const text = readFileSync(path.join(ART_DIR, svg), "utf8");
      problems.push(...colorProblems(text, ALLOWED_COLORS).map((p) => `art/${svg}: ${p}`));
      problems.push(...strokeProblems(text, LINE).map((p) => `art/${svg}: ${p}`));
    }
    expect(problems).toEqual([]);
  });

  it("поле: усе намальоване (усі стани й шари разом, з контуром і тінню) — щонайменше за 4 одиниці від краю полотна (art/STYLE.md §2)", async () => {
    /** Пікселів на одиницю: на межі 4,0 одиниці растр ще прозорий, а 3,75 вже видно. */
    const scale = 4;
    const problems: string[] = [];
    // Плитка тканини — край у край: правий край продовжує лівий (art/STYLE.md, «cloth»); принт — з полем, як усе.
    const tile = (svg: string): boolean => svg.startsWith("cloth/") && !svg.startsWith("cloth/print/");
    for (const svg of svgs.filter((s) => !tile(s))) {
      const text = readFileSync(path.join(ART_DIR, svg), "utf8");
      const { data, info } = await sharp(Buffer.from(text), { density: 72 * scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if ((data[(y * info.width + x) * 4 + 3] ?? 0) <= 8) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
      if (x1 < 0) continue; // порожній кадр (невидиме в ракурсі)
      const margin = Math.min(x0, y0, info.width - 1 - x1, info.height - 1 - y1) / scale;
      if (margin < 4) problems.push(`art/${svg}: поле ${margin} (ліво ${x0 / scale}, верх ${y0 / scale}, право ${(info.width - 1 - x1) / scale}, низ ${(info.height - 1 - y1) / scale})`);
    }
    expect(problems).toEqual([]);
  }, 60_000);

  it("увесь арт намальовано: SVG є для кожного ракурсу кожного запису (KOTOKLOPIT_REQUIRE_ALL_ART=0 — усі ракурси або жоден)", () => {
    const requireAll = requireAllFromEnv();
    expect(entries.flatMap((entry) => drawnProblems(entry, has, requireAll))).toEqual([]);
  });

  it("немає осиротілих SVG: кожен має запис у маніфесті (чернетки й еталони — у шляхах з «_»)", () => {
    expect(orphanSvgs(entries, files)).toEqual([]);
  });
});

// --- Перевірки SVG на фікстурах ------------------------------------------------------------------

/** Записи фікстур (`tests/fixtures/art/`). */
const BOX: ArtEntry = { id: "env/box", size: { w: 120, h: 100 }, pivot: { x: 60, y: 90 }, states: ["closed", "half", "open"], points: { lid: { x: 60, y: 20 } } };
const HEAD: ArtEntry = { id: "cat/head", size: { w: 64, h: 60 }, pivot: { x: 32, y: 52 }, layers: ["fill", "shade", "ink"], views: ["front", "back"] };
const BALL: ArtEntry = { id: "item/ball", size: { w: 30, h: 30 }, pivot: { x: 15, y: 28 }, states: ["a", "b"] };
/** Без SVG — заглушка. */
const GHOST: ArtEntry = { id: "item/ghost", size: { w: 40, h: 30 }, pivot: { x: 20, y: 28 } };
const FIXTURE_ENTRIES = [BOX, HEAD, BALL, GHOST];
/** Палітра фікстур (справжню задає art/palette.ts, і вона змінюється). */
const FIXTURE_COLORS: ReadonlySet<string> = new Set(["#1f1a24", "#ffffff", "#f3e9dc", "#bdb3c2", "#8b5e3c"]);
const FIXTURE_LINE = { min: 2, max: 9 };

const svg = (body: string, attrs = 'viewBox="0 0 64 60"'): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const LAYERED = { size: HEAD.size, layers: HEAD.layers };

describe("перевірка SVG", () => {
  it("фікстури — без помилок, кольори з палітри фікстур, контур у межах", () => {
    const files: [string, ArtEntry][] = [
      ["env/box.svg", BOX],
      ["cat/head/front.svg", HEAD],
      ["cat/head/back.svg", HEAD],
      ["item/ball.svg", BALL],
    ];
    for (const [file, entry] of files) {
      const text = fixture(file);
      expect(svgProblems(text, entry), file).toEqual([]);
      expect(colorProblems(text, FIXTURE_COLORS), file).toEqual([]);
      expect(strokeProblems(text, FIXTURE_LINE), file).toEqual([]);
    }
  });

  it("полотно: viewBox і розмір — як у записі", () => {
    expect(svgProblems(svg("", 'viewBox="0 0 64 61"'), { size: HEAD.size })).toEqual(['viewBox "0 0 64 61" — не полотно запису "0 0 64 60"']);
    expect(svgProblems(svg("", ""), { size: HEAD.size })).toEqual(['немає viewBox (має бути "0 0 64 60")']);
    expect(svgProblems(svg("", 'viewBox="0,0,64,60" width="64px" height="60"'), { size: HEAD.size })).toEqual([]);
    expect(svgProblems(svg("", 'viewBox="0 0 64 60" width="128"'), { size: HEAD.size })).toEqual(['width="128" — не 64 (як у viewBox або без нього)']);
    expect(svgProblems('<svg viewBox="0 0 64 60"/>', { size: HEAD.size })).toEqual(['немає xmlns="http://www.w3.org/2000/svg"']);
    expect(svgProblems("<g/>", { size: HEAD.size })).toEqual(["корінь — не <svg>"]);
  });

  it("шари: кожен — <g id> верхнього рівня, нічого, що малюється, поза ними", () => {
    expect(svgProblems(svg('<g id="fill"/><g id="ink"/>'), LAYERED)).toEqual(['немає шару <g id="shade"> верхнього рівня']);
    expect(svgProblems(svg('<defs><circle id="c" r="2"/></defs><style>.a{opacity:.5}</style><g id="fill"/><g id="shade"/><g id="ink"/>'), LAYERED)).toEqual([]);
    expect(svgProblems(svg('<g id="fill"/><g id="shade"/><g id="ink"/><rect width="2" height="2"/><g id="tabby-classic"/><g id="ears"/>'), LAYERED)).toEqual([
      "<rect> поза шарами (верхній рівень — лише <g id=\"<шар>\">, defs і style)",
      "шар «tabby-classic» не з запису (його layers: fill, shade, ink)",
      '<g id="ears"> поза шарами (верхній рівень — лише <g id="<шар>">, defs і style)',
    ]);
    // Вкладена група з назвою шару — не шар.
    expect(svgProblems(svg('<g id="fill"><g id="shade"/></g><g id="ink"/>'), LAYERED)).toEqual(['немає шару <g id="shade"> верхнього рівня']);
    expect(svgProblems(svg('<g id="fill" class="st-open"/><g id="shade"/><g id="ink"/>'), { ...LAYERED, states: ["open"] })).toEqual([
      "шар «fill» має клас st-* (стани — лише всередині шарів)",
    ]);
    expect(topLevelLayers(fixture("cat/head/front.svg"))).toEqual(["fill", "shade", "ink"]);
  });

  it("стани: класи st-* — лише стани запису", () => {
    expect(svgProblems(svg('<rect class="st-open big"/><rect class="st-shut"/>'), { size: HEAD.size, states: ["open"] })).toEqual([
      "клас st-shut: у запису немає стану «shut»",
    ]);
    expect(svgProblems(svg('<rect class="st-open"/>'), { size: HEAD.size })).toEqual(["клас st-open: у запису немає станів"]);
  });

  it("без тексту, растру, скриптів, зовнішніх посилань і повторених id", () => {
    const bad = svg(
      [
        '<text x="1">Мур</text>',
        '<image href="cat.png"/>',
        '<use href="other.svg#x"/>',
        '<rect id="a" fill="url(http://evil/x)"/>',
        '<rect id="a"/>',
        "<style>@import url(x.css);</style>",
        "<script>1</script>",
      ].join(""),
    );
    expect(svgProblems(bad, { size: HEAD.size })).toEqual([
      "<text> заборонено (лише вектор без тексту й растру)",
      "<image> заборонено (лише вектор без тексту й растру)",
      '<image href="cat.png">: посилання лише всередині файлу (#id)',
      '<use href="other.svg#x">: посилання лише всередині файлу (#id)',
      "<rect fill>: url() лише всередині файлу (#id)",
      "id «a» повторюється",
      "@import у <style> заборонено",
      "<style>: url() лише всередині файлу (#id)",
      "<script> заборонено (лише вектор без тексту й растру)",
    ]);
  });

  it("розбір: коментарі, CDATA, сутності, самозакривні теги; незакрите — помилка", () => {
    const doc = parseSvg('<?xml version="1.0"?><!-- <rect/> --><svg a="x &amp; &#x23;"><style><![CDATA[.a{fill:#fff}]]></style><g><rect/></g></svg>');
    expect(doc.problems).toEqual([]);
    expect(doc.nodes.map((node) => node.name)).toEqual(["svg", "style", "g", "rect"]);
    expect(doc.root?.attrs["a"]).toBe("x & #");
    expect(doc.nodes[1]?.text).toBe(".a{fill:#fff}");
    expect(parseSvg("<svg><g></svg>").problems).toEqual(["зайвий закривальний тег </svg>", "незакритий тег <g>"]);
    expect(parseSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>').problems).toEqual(["DOCTYPE із сутностями — без нього"]);
  });

  it("кольори: лише #rrggbb з палітри — в атрибутах, style і <style>", () => {
    const text = svg(
      [
        '<rect fill="#FFF" stroke="#1f1a24"/>',
        '<rect fill="red"/>',
        '<rect fill="rgb(1,2,3)"/>',
        '<rect fill="#1f1a24cc"/>',
        '<rect id="x" fill="#123456"/>',
        '<rect style="fill: #abcdef; stroke-width: 3"/>',
        "<style>/* #000000 */ .a { stroke: #ff00ff } .b { fill: none }</style>",
        '<linearGradient><stop stop-color="#bdb3c2"/><stop stop-color="#bdb3c3"/></linearGradient>',
        '<rect fill="url(#g)"/><rect fill="url(#g) #00ff00"/><rect fill="none" stroke="currentColor"/>',
      ].join(""),
    );
    expect(colorProblems(text, FIXTURE_COLORS)).toEqual([
      '<rect>: fill="red" — лише #rrggbb з палітри',
      '<rect>: fill="rgb(1,2,3)" — лише #rrggbb з палітри',
      '<rect>: fill="#1f1a24cc" — лише #rrggbb з палітри',
      '<rect id="x">: fill="#123456" — кольору #123456 немає в палітрі',
      '<rect> style: fill="#abcdef" — кольору #abcdef немає в палітрі',
      '<style>: stroke="#ff00ff" — кольору #ff00ff немає в палітрі',
      '<stop>: stop-color="#bdb3c3" — кольору #bdb3c3 немає в палітрі',
      '<rect>: fill="url(#g) #00ff00" — кольору #00ff00 немає в палітрі',
    ]);
  });

  it("типова заливка: форма без fill (ні на ній, ні на батьках, ні через <use>, ні в <style>) — чорна #000000, якої немає в палітрі", () => {
    expect(FIXTURE_COLORS.has("#000000")).toBe(false);
    const text = svg(
      [
        // Лінія контуру без fill="none": хорду кривої заливає чорним.
        '<path id="curve" stroke="#1f1a24" stroke-width="3" d="M1 9Q5 0 9 9"/>',
        '<path d="M0 0H9V9Z"/>',
        // Заливка від батька, через <use>, з <style> за класом — є.
        '<g fill="#ffffff"><path d="M0 0H9V9Z"/></g>',
        '<defs><path id="shape" d="M0 0H9V9Z"/><g id="pair"><path d="M0 0H9V9Z"/><path id="bare" d="M0 0H9V9Z"/></g></defs>',
        '<use href="#shape" fill="#ffffff"/>',
        '<use href="#shape"/>',
        '<style>.filled { fill: #ffffff }</style><rect class="filled"/>',
        // У заготовках (clipPath, mask) заливка не малюється; лінія площі не має.
        '<clipPath id="c"><path d="M0 0H9V9Z"/><use href="#shape"/></clipPath><mask id="m"><rect/></mask>',
        '<line stroke="#1f1a24" stroke-width="3"/>',
        '<rect fill="currentColor"/>',
        '<g color="#ffffff"><rect fill="currentColor"/></g>',
      ].join(""),
    );
    expect(colorProblems(text, FIXTURE_COLORS)).toEqual([
      '<path id="curve">: без fill — SVG заливає чорним #000000, якого немає в палітрі (лінії — fill="none")',
      '<path>: без fill — SVG заливає чорним #000000, якого немає в палітрі (лінії — fill="none")',
      '<path id="shape">: без fill — SVG заливає чорним #000000, якого немає в палітрі (лінії — fill="none")',
      '<rect>: fill="currentColor" без color — чорний #000000, якого немає в палітрі',
    ]);
    // <use> групи без заливки: кожна її форма — чорна.
    expect(colorProblems(svg('<defs><g id="pair"><path fill="#ffffff"/><path id="bare"/></g></defs><use href="#pair"/>'), FIXTURE_COLORS)).toEqual([
      '<path id="bare">: без fill — SVG заливає чорним #000000, якого немає в палітрі (лінії — fill="none")',
    ]);
    // Палітра з чорним — типова заливка дозволена.
    expect(colorProblems(svg('<path d="M0 0H9V9Z"/>'), new Set([...FIXTURE_COLORS, "#000000"]))).toEqual([]);
  });

  it("типова товщина: stroke без stroke-width (ні на ньому, ні на батьках, ні через <use>, ні в <style>) — 1, менше за LINE.min", () => {
    const text = svg(
      [
        '<path fill="none" stroke="#1f1a24" d="M0 0L9 9"/>',
        '<g stroke-width="3"><path fill="none" stroke="#1f1a24"/></g>',
        '<defs><path id="outline" d="M0 0L9 9"/></defs>',
        '<use href="#outline" fill="none" stroke="#1f1a24" stroke-width="3.6"/>',
        '<use href="#outline" fill="none" stroke="#1f1a24"/>',
        '<style>.ink { stroke-width: 4 }</style><path class="ink" fill="none" stroke="#1f1a24"/>',
        '<path fill="#ffffff" stroke="none"/><path fill="#ffffff"/>',
      ].join(""),
    );
    expect(strokeProblems(text, FIXTURE_LINE)).toEqual([
      "<path>: stroke без stroke-width — SVG бере 1, поза 2…9",
      '<path id="outline">: stroke без stroke-width — SVG бере 1, поза 2…9',
    ]);
  });

  it("товщина контуру: число в межах LINE", () => {
    const text = svg('<path stroke-width="6"/><path stroke-width="1"/><path stroke-width="12px"/><path style="stroke-width:2"/><path stroke-width="5%"/>');
    expect(strokeProblems(text, FIXTURE_LINE)).toEqual([
      '<path>: stroke-width="1" — поза 2…9',
      '<path>: stroke-width="12px" — поза 2…9',
      '<path>: stroke-width="5%" — лише число (одиниці арту)',
    ]);
  });

  it("сироти: SVG без запису; шляхи з «_» і не-SVG — не сироти", () => {
    const files = listFiles(FIXTURES);
    expect(files).toContain("_ref/sheet.svg");
    expect(orphanSvgs(FIXTURE_ENTRIES, files)).toEqual(["item/lost.svg"]);
    expect(orphanSvgs([], ["STYLE.md", "palette.ts", "_drafts/a.svg", "cat/_old.svg", "x.SVG"])).toEqual(["x.SVG"]);
    expect(isPrivateArtPath("cat/_old.svg")).toBe(true);
    expect(isPrivateArtPath("cat/old_.svg")).toBe(false);
  });

  it("запис намальовано цілком: половина ракурсів — помилка; без SVG — помилка, а з дозволеними заглушками — заглушка", () => {
    const only = (...present: string[]) => (file: string) => present.includes(file);
    expect(drawnProblems(HEAD, only("cat/head/front.svg", "cat/head/back.svg"), true)).toEqual([]);
    expect(drawnProblems(HEAD, only("cat/head/front.svg"), false)).toEqual(["«cat/head»: є не всі ракурси — немає cat/head/back.svg"]);
    expect(drawnProblems(GHOST, only(), false)).toEqual([]);
    expect(drawnProblems(GHOST, only(), true)).toEqual(["«item/ghost»: немає item/ghost.svg (KOTOKLOPIT_REQUIRE_ALL_ART)"]);
    // Вимога всього арту — типова (хвиля 3); «0» чи «false» дозволяє заглушки.
    expect(requireAllFromEnv({})).toBe(true);
    expect(requireAllFromEnv({ KOTOKLOPIT_REQUIRE_ALL_ART: "1" })).toBe(true);
    expect(requireAllFromEnv({ KOTOKLOPIT_REQUIRE_ALL_ART: "0" })).toBe(false);
    expect(requireAllFromEnv({ KOTOKLOPIT_REQUIRE_ALL_ART: "false" })).toBe(false);
  });
});

// --- Растеризація ----------------------------------------------------------------------------------

/** Колір пікселя (x, y) растра. */
function pixel(r: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * r.w + x) * 4;
  return [r.data[i] ?? 0, r.data[i + 1] ?? 0, r.data[i + 2] ?? 0, r.data[i + 3] ?? 0];
}

/** Центр мас альфи растра. */
function centroid(r: Rgba): { x: number; y: number } {
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const a = pixel(r, x, y)[3];
      sum += a;
      sx += a * (x + 0.5);
      sy += a * (y + 0.5);
    }
  }
  return { x: sx / sum, y: sy / sum };
}

/** Чи є в растрі непрозорий піксель кольору, далекого від `rgb`. */
function hasOtherColor(r: Rgba, rgb: [number, number, number], tolerance = 8): boolean {
  for (let i = 0; i < r.data.length; i += 4) {
    if ((r.data[i + 3] ?? 0) < 250) continue;
    if (Math.abs((r.data[i] ?? 0) - rgb[0]) > tolerance || Math.abs((r.data[i + 1] ?? 0) - rgb[1]) > tolerance || Math.abs((r.data[i + 2] ?? 0) - rgb[2]) > tolerance) return true;
  }
  return false;
}

const headJob = (view: "front" | "back", res = 2) => {
  const text = fixture(`cat/head/${view}.svg`);
  return { svg: text, size: HEAD.size, res, layers: HEAD.layers ?? null, fileLayers: topLevelLayers(text), state: null, states: [] };
};

/** Шар на прозорому полотні кадру повного розміру — у своєму зсуві. */
function onCanvas(canvas: { w: number; h: number }, layer: LayerRaster): Buffer {
  const out = Buffer.alloc(canvas.w * canvas.h * 4);
  for (let row = 0; row < layer.h; row++) layer.data.copy(out, ((layer.y + row) * canvas.w + layer.x) * 4, row * layer.w * 4, (row + 1) * layer.w * 4);
  return out;
}

/** Чи рамка шару тісна: у крайніх рядках і стовпцях є непрозорий піксель. */
function isTight(r: Rgba): boolean {
  const alpha = (x: number, y: number): boolean => pixel(r, x, y)[3] !== 0;
  const row = (y: number): boolean => Array.from({ length: r.w }, (_, x) => alpha(x, y)).some(Boolean);
  const column = (x: number): boolean => Array.from({ length: r.h }, (_, y) => alpha(x, y)).some(Boolean);
  return row(0) && row(r.h - 1) && column(0) && column(r.w - 1);
}

describe("растеризація шарів", () => {
  it("шари — окремо, кожен обрізано своєю рамкою; у своєму зсуві — піксель у піксель растр повного полотна", async () => {
    const job = headJob("front");
    const frame = await rasterFrame(job);
    expect(frame.canvas).toEqual({ w: 128, h: 120 });
    // Рамка вмісту — об'єднання шарів: контур (коло r=20, лінія 6) найбільший, (32 ± 23, 30 ± 23) одиниць × 2.
    expect(frame.trim).toEqual({ x: 18, y: 14 });
    expect([frame.w, frame.h]).toEqual([92, 92]);
    expect(frame.layers.map((layer) => layer.layer)).toEqual(["fill", "shade", "ink"]);
    const [fill, shade, ink] = frame.layers as unknown as [LayerRaster, LayerRaster, LayerRaster];
    expect([ink.x, ink.y, ink.w, ink.h]).toEqual([18, 14, 92, 92]);
    // Тінь — еліпс 24 × 12 одиниць біля низу голови: її рамка — лише вона, а не рамка контуру.
    expect(shade.w).toBeLessThanOrEqual(50);
    expect(shade.h).toBeLessThanOrEqual(26);
    expect(shade.y).toBeGreaterThan(60);
    expect(fill.w).toBeLessThan(ink.w);
    for (const layer of frame.layers) expect(isTight(layer), layer.layer).toBe(true);
    // Кожен шар у своєму зсуві — той самий растр, що шар, растеризований на все полотно.
    const svg = prepareSvg(job.svg, job.size);
    for (const [i, sheet] of stylesheetsFor(job).entries()) {
      const full = await rasterize(svg, densityFor(job.res), sheet.css);
      expect(onCanvas(frame.canvas, frame.layers[i]!).equals(full.data), sheet.layer).toBe(true);
    }
    // Заливка й контур — те саме коло: центри (у полотні) збігаються до сотої пікселя.
    const c1 = centroid(fill);
    const c2 = centroid(ink);
    expect(Math.abs(c1.x + fill.x - (c2.x + ink.x))).toBeLessThan(0.01);
    expect(Math.abs(c1.y + fill.y - (c2.y + ink.y))).toBeLessThan(0.01);
    expect(c1.x + fill.x).toBeCloseTo(64, 1);
    // Кожен шар — лише своє: заливка біла, тінь сіра, контур чорнильний.
    expect(hasOtherColor(fill, [255, 255, 255])).toBe(false);
    expect(hasOtherColor(shade, [0xbd, 0xb3, 0xc2])).toBe(false);
    expect(hasOtherColor(ink, [0x1f, 0x1a, 0x24])).toBe(false);
  });

  it("порожній шар — один прозорий піксель у (0, 0); кадр без нічого — так само кожен шар", async () => {
    const text = svg('<g id="fill"><rect x="10" y="10" width="20" height="20" fill="#ffffff"/></g><g id="shade"/><g id="ink"/>');
    const job = { svg: text, size: HEAD.size, res: 2, layers: HEAD.layers ?? null, fileLayers: topLevelLayers(text), state: null, states: [] };
    const frame = await rasterFrame(job);
    expect(frame.layers.map((l) => [l.layer, l.x, l.y, l.w, l.h])).toEqual([
      ["fill", 20, 20, 40, 40],
      ["shade", 0, 0, 1, 1],
      ["ink", 0, 0, 1, 1],
    ]);
    expect([...frame.layers[1]!.data, ...frame.layers[2]!.data]).toEqual(new Array(8).fill(0));
    // Рамка вмісту — лише непорожні шари.
    expect([frame.trim.x, frame.trim.y, frame.w, frame.h]).toEqual([20, 20, 40, 40]);
    const blankText = svg('<g id="fill"/><g id="shade"/><g id="ink"/>');
    const blank = await rasterFrame({ ...job, svg: blankText, fileLayers: topLevelLayers(blankText) });
    expect(blank.layers.map((l) => [l.x, l.y, l.w, l.h])).toEqual([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [0, 0, 1, 1],
    ]);
    expect([blank.trim.x, blank.trim.y, blank.w, blank.h]).toEqual([0, 0, 1, 1]);
  });

  it("роздільність — пікселів на одиницю; дробова теж (полотно округлено)", async () => {
    const frame = await rasterFrame(headJob("back", 1.5));
    expect(frame.canvas).toEqual({ w: 96, h: 90 });
    for (const layer of frame.layers) {
      expect(layer.x + layer.w).toBeLessThanOrEqual(frame.canvas.w);
      expect(layer.y + layer.h).toBeLessThanOrEqual(frame.canvas.h);
    }
    const odd = await rasterFrame({ ...headJob("back", 1.3), layers: ["ink"] });
    expect(odd.canvas).toEqual({ w: Math.round(64 * 1.3), h: Math.round(60 * 1.3) });
  });

  it("стани — класи st-*: елемент з кількома класами є в кожному з них", async () => {
    const text = fixture("env/box.svg");
    const job = (state: string) => ({ svg: text, size: BOX.size, res: 1, layers: null, fileLayers: [], state, states: BOX.states ?? [] });
    const [closed, half, open] = await Promise.all(["closed", "half", "open"].map((state) => rasterFrame(job(state))));
    const at = (frame: Awaited<ReturnType<typeof rasterFrame>>, x: number, y: number) => {
      const layer = frame.layers[0]!;
      return pixel(layer, x - layer.x, y - layer.y);
    };
    // Наліпка (st-half st-open) у (60, 63): папір у half і open, дерево в closed.
    expect(at(closed!, 60, 63).slice(0, 3)).toEqual([0x8b, 0x5e, 0x3c]);
    expect(at(half!, 60, 63).slice(0, 3)).toEqual([0xf3, 0xe9, 0xdc]);
    expect(at(open!, 60, 63).slice(0, 3)).toEqual([0xf3, 0xe9, 0xdc]);
    // Піднята кришка (st-open) — лише у open: рамка обрізки сягає y ≈ 10.
    expect(open!.trim.y).toBeLessThan(12);
    expect(half!.trim.y).toBeGreaterThan(35);
    expect(closed!.trim.y).toBeGreaterThan(25);
    expect(closed!.trim.y).toBeLessThan(35);
  });

  it("таблиця стилів ховає інші шари й інші стани (з !important — сильніша за стилі файлу)", () => {
    expect(layerStylesheet("ink", ["fill", "shade", "ink"], "open", ["closed", "open"])).toBe(
      "#fill{display:none!important}\n#shade{display:none!important}\n.st-closed:not(.st-open){display:none!important}",
    );
    expect(layerStylesheet(null, [], null, [])).toBe("");
  });

  it("підготовлений SVG — розмір запису в атрибутах, решта без змін", () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg" width="10px" viewBox="0 0 64 60" data-x="a&amp;b"><rect/></svg>';
    expect(prepareSvg(text, { w: 64, h: 60 })).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60" data-x="a&amp;b" width="64" height="60"><rect/></svg>');
  });

  it("рамка обрізки — об'єднання непрозорого всіх растрів; порожнє — null", () => {
    const blank = (w: number, h: number): Rgba => ({ w, h, data: Buffer.alloc(w * h * 4) });
    const a = blank(10, 10);
    const b = blank(10, 10);
    a.data[(2 * 10 + 3) * 4 + 3] = 1;
    b.data[(7 * 10 + 8) * 4 + 3] = 255;
    expect(unionBounds([a, b])).toEqual({ x0: 3, y0: 2, x1: 9, y1: 8 });
    expect(unionBounds([blank(4, 4)])).toBeNull();
  });
});

// --- Пакування й сторінки ----------------------------------------------------------------------------

describe("пакування", () => {
  /** Псевдовипадкові прямокутники (сталий seed). */
  const items = (n: number, max: number): PackItem[] => {
    let s = 12345;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    return Array.from({ length: n }, (_, i) => ({ key: `k${i}`, w: 1 + Math.floor(rand() * max), h: 1 + Math.floor(rand() * max) }));
  };

  it("усе на сторінках, без перекриттів (з краєм і відступом), сторінки — степені двійки до 2048", () => {
    const list = items(300, 300);
    const result = pack(list);
    const opts = { extrude: 2, gap: 2 };
    expect(result.placements.size).toBe(list.length);
    for (const page of result.pages) {
      expect(page.w).toBe(pow2(page.w));
      expect(page.h).toBe(pow2(page.h));
      expect(Math.max(page.w, page.h)).toBeLessThanOrEqual(2048);
    }
    const boxes = list.map((item) => {
      const at = result.placements.get(item.key)!;
      const page = result.pages[at.page]!;
      // Растр із продубльованим краєм — у межах сторінки.
      expect(at.x - opts.extrude).toBeGreaterThanOrEqual(0);
      expect(at.y - opts.extrude).toBeGreaterThanOrEqual(0);
      expect(at.x + item.w + opts.extrude).toBeLessThanOrEqual(page.w);
      expect(at.y + item.h + opts.extrude).toBeLessThanOrEqual(page.h);
      return { page: at.page, x0: at.x - opts.extrude, y0: at.y - opts.extrude, x1: at.x + item.w + opts.extrude + opts.gap, y1: at.y + item.h + opts.extrude + opts.gap };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.page === b.page && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${list[i]!.key} і ${list[j]!.key}`).toBe(false);
      }
    }
    // Детерміновано: той самий перелік у іншому порядку — те саме розміщення.
    const again = pack([...list].reverse());
    expect([...again.placements].sort()).toEqual([...result.placements].sort());
    expect(again.pages).toEqual(result.pages);
    // Щільність горизонту: 300 прямокутників до 300² — не більше 4 сторінок.
    expect(result.pages.length).toBeLessThanOrEqual(4);
  });

  it("групи: наступна група лягає з останньої сторінки попередньої й далі, а не в прогалини її ранніх сторінок", () => {
    const opts = { maxSize: 64, extrude: 0, gap: 0 };
    const list: PackItem[] = [
      { key: "c", w: 10, h: 10, group: 1 },
      { key: "a", w: 64, h: 40 },
      { key: "e", w: 60, h: 30, group: 1 },
      { key: "b", w: 64, h: 40, group: 0 },
      { key: "d", w: 10, h: 10, group: 1 },
      { key: "f", w: 10, h: 10 },
    ];
    const result = pack(list, opts);
    const page = (key: string): number | undefined => result.placements.get(key)?.page;
    // Група 0: a і b — кожен на свою сторінку, f — у прогалину сторінки 0.
    expect([page("a"), page("b"), page("f")]).toEqual([0, 1, 0]);
    // Група 1: c і d — на останню сторінку групи 0 (там ще є місце), а не на сторінку 0; e туди не влазить — нова.
    expect([page("c"), page("d"), page("e")]).toEqual([1, 1, 2]);
    // Детерміновано.
    const again = pack([...list].reverse(), opts);
    expect([...again.placements].sort()).toEqual([...result.placements].sort());
    // Без груп — як досі: усе в одній групі.
    const flat = pack(list.map(({ key, w, h }) => ({ key, w, h })), opts);
    expect(flat.placements.get("c")?.page).toBe(0);
  });

  it("растр, ширший за сторінку, — помилка з ключем", () => {
    expect(() => pack([{ key: "env/slab#all", w: 2046, h: 10 }])).toThrow(/«env\/slab#all»: 2046×10 px/);
    expect(pack([{ key: "a", w: 2042, h: 2042 }]).pages).toEqual([{ w: 2048, h: 2048 }]);
  });

  it("сторінка: растр на місці, край продубльовано, решта прозора", () => {
    const image: Rgba = { w: 2, h: 2, data: Buffer.from([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 128]) };
    const page = composePage(8, 8, [{ image, x: 3, y: 3 }], 2);
    const red = (x: number, y: number) => [page.data[(y * 8 + x) * 4], page.data[(y * 8 + x) * 4 + 3]];
    expect(red(3, 3)).toEqual([10, 255]);
    expect(red(4, 4)).toEqual([40, 128]);
    // Ліворуч і згори — край, кути — кутовий піксель.
    expect(red(1, 3)).toEqual([10, 255]);
    expect(red(4, 1)).toEqual([20, 255]);
    expect(red(1, 1)).toEqual([10, 255]);
    expect(red(6, 6)).toEqual([40, 128]);
    expect(red(0, 0)).toEqual([0, 0]);
    expect(red(7, 7)).toEqual([0, 0]);
  });
});

// --- Кеш ----------------------------------------------------------------------------------------------

const temps: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "kotoklopit-art-test-"));
  temps.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("кеш", () => {
  it("кадр записується атомарно й читається тим самим; немає — null; без теки — вимкнено", async () => {
    const dir = tempDir();
    const cache = new ArtCache(dir);
    const frame = await rasterFrame(headJob("front", 1));
    expect(cache.readFrame("abc")).toBeNull();
    cache.writeFrame("abc", frame);
    const back = cache.readFrame("abc");
    expect(back?.trim).toEqual(frame.trim);
    expect([back?.w, back?.h]).toEqual([frame.w, frame.h]);
    // Кожен шар — зі своєю рамкою.
    expect(back?.layers.map((l) => [l.layer, l.x, l.y, l.w, l.h])).toEqual(frame.layers.map((l) => [l.layer, l.x, l.y, l.w, l.h]));
    expect(new Set(frame.layers.map((l) => `${l.w}×${l.h}`)).size).toBeGreaterThan(1);
    for (let i = 0; i < frame.layers.length; i++) expect(back?.layers[i]?.data.equals(frame.layers[i]!.data)).toBe(true);
    // Тимчасових файлів не лишилося.
    const left = readdirSync(dir, { recursive: true }).map(String);
    expect(left.filter((file) => file.endsWith(".tmp"))).toEqual([]);
    expect(left.some((file) => file.endsWith("abc.frame"))).toBe(true);
    const off = new ArtCache(null);
    off.writeFrame("abc", frame);
    expect(off.readFrame("abc")).toBeNull();
  });

  it("кадр старого формату (шари спільною рамкою, без своїх) не береться: його растеризують заново", () => {
    const cache = new ArtCache(tempDir());
    const header = Buffer.from(JSON.stringify({ canvas: { w: 4, h: 4 }, trim: { x: 1, y: 1 }, w: 2, h: 2, layers: ["fill", "ink"] }));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(header.length, 0);
    cache.write("old", "frame", deflateSync(Buffer.concat([length, header, Buffer.alloc(2 * 2 * 4 * 2, 255)])));
    expect(cache.read("old", "frame")).not.toBeNull();
    expect(cache.readFrame("old")).toBeNull();
  });
});

// --- Збирання атласу -------------------------------------------------------------------------------

describe("збирання атласу на фікстурах", () => {
  const run = (entries: readonly ArtEntry[], cache = new ArtCache(null), requireAll = false) =>
    buildArt({ artDir: FIXTURES, entries, defaultRes: 2, cache, requireAll });

  it("index.json: кадри станів і ракурсів, шари в межах сторінок, заглушка, однакові растри — один раз", async () => {
    const build = await run(FIXTURE_ENTRIES);
    expect(build.errors).toEqual([]);
    expect(build.warnings).toEqual(["art/item/ghost.svg: немає — заглушка («item/ghost»)", "art/item/lost.svg: немає запису в маніфесті — не растеризується"]);
    const index = JSON.parse(build.files.get("index.json")!.toString()) as ArtIndex;
    expect(index).toEqual(build.index);
    expect(Object.keys(index.frames)).toEqual([
      "cat/head/back",
      "cat/head/front",
      "env/box/closed",
      "env/box/half",
      "env/box/open",
      "item/ball/a",
      "item/ball/b",
      "item/ghost",
    ]);
    const head = index.frames["cat/head/front"]!;
    expect(Object.keys(head.layers)).toEqual(["fill", "shade", "ink"]);
    expect(head).toMatchObject({ size: HEAD.size, res: 2, pivot: HEAD.pivot });
    expect(head.stub).toBeUndefined();
    // Кожен шар — зі своєю рамкою обрізки: зсув у полотні кадру й розмір; спільної рамки кадру немає.
    expect(head).not.toHaveProperty("trim");
    const frame = await rasterFrame(headJob("front"));
    // Рамка вмісту кадру з шарами — об'єднання рамок шарів (тут — контур): на ній гра запікає кадр.
    expect(head.box).toEqual({ x: frame.trim.x, y: frame.trim.y, w: frame.w, h: frame.h });
    expect(head.box).toEqual({ x: 18, y: 14, w: 92, h: 92 });
    for (const layer of Object.values(head.layers)) {
      expect(layer!.dx).toBeGreaterThanOrEqual(head.box!.x);
      expect(layer!.dy + layer!.h).toBeLessThanOrEqual(head.box!.y + head.box!.h);
    }
    // Кадр без шарів малює Phaser напряму — рамка йому не потрібна.
    expect(index.frames["env/box/open"]).not.toHaveProperty("box");
    for (const layer of frame.layers) expect(head.layers[layer.layer]).toMatchObject({ dx: layer.x, dy: layer.y, w: layer.w, h: layer.h });
    expect(head.layers.ink).toMatchObject({ dx: 18, dy: 14, w: 92, h: 92 });
    expect(head.layers.shade!.w).toBeLessThan(92);
    expect(index.frames["env/box/open"]!.points).toEqual({ lid: { x: 60, y: 20 } });
    expect(Object.keys(index.frames["env/box/open"]!.layers)).toEqual(["all"]);
    // Заглушка: роздільність не більша за STUB_ATLAS_RES, без обрізки.
    const ghost = index.frames["item/ghost"]!;
    expect(ghost).toMatchObject({ stub: true, res: stubRes(GHOST, 2) });
    expect(ghost.res).toBe(STUB_ATLAS_RES);
    expect(ghost.layers.all).toMatchObject({ dx: 0, dy: 0, w: 40 * STUB_ATLAS_RES, h: 30 * STUB_ATLAS_RES });
    // Два стани без класів st-* — той самий растр.
    expect(index.frames["item/ball/a"]!.layers.all).toEqual(index.frames["item/ball/b"]!.layers.all);
    expect(build.stats).toMatchObject({ entries: 4, frames: 8, stubs: 1, pages: 1 });
    expect(build.stats.images).toBe(build.stats.layers - 1);

    // Сторінка — webp розміру з index.json; пікселі шару — без втрат ті самі, що в растрі.
    const page = index.pages[0]!;
    expect(page.file).toMatch(/^page-0\.[0-9a-f]{10}\.webp$/);
    // Розмір файлу — для смуги заставки (поступ за байтами, `loadprogress.ts`).
    expect(page.bytes).toBe(build.files.get(page.file)!.length);
    const decoded = await sharp(build.files.get(page.file)!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([decoded.info.width, decoded.info.height]).toEqual([page.w, page.h]);
    const pageRgba: Rgba = { w: decoded.info.width, h: decoded.info.height, data: decoded.data };
    for (const layer of frame.layers) {
      const rect = head.layers[layer.layer]!;
      let differ = 0;
      for (let y = 0; y < layer.h; y++) {
        for (let x = 0; x < layer.w; x++) {
          const want = pixel(layer, x, y);
          const got = pixel(pageRgba, rect.x + x, rect.y + y);
          if (want[3] === 0 ? got[3] !== 0 : got.some((v, i) => v !== want[i])) differ++;
        }
      }
      expect(differ, layer.layer).toBe(0);
    }
    // Усі прямокутники — у межах сторінки.
    for (const f of Object.values(index.frames)) {
      for (const r of Object.values(f.layers)) {
        expect(r!.x + r!.w).toBeLessThanOrEqual(page.w);
        expect(r!.y + r!.h).toBeLessThanOrEqual(page.h);
      }
    }
  });

  it("порожній шар не займає місця на сторінці: усі порожні — один спільний прозорий піксель", async () => {
    const dir = tempDir();
    const write = (file: string, body: string): void => {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), svg(body));
    };
    write("cat/part.svg", '<g id="fill"><rect x="10" y="10" width="20" height="20" fill="#ffffff"/></g><g id="shade"/><g id="ink"/>');
    write("cat/other.svg", '<g id="fill"><circle cx="32" cy="30" r="12" fill="#ffffff"/></g><g id="shade"/><g id="ink"><circle cx="32" cy="30" r="12" fill="none" stroke="#1f1a24" stroke-width="4"/></g>');
    const part: ArtEntry = { id: "cat/part", size: HEAD.size, pivot: HEAD.pivot, layers: ["fill", "shade", "ink"] };
    const other: ArtEntry = { id: "cat/other", size: HEAD.size, pivot: HEAD.pivot, layers: ["fill", "shade", "ink"] };
    const build = await buildArt({ artDir: dir, entries: [part, other], defaultRes: 2, cache: new ArtCache(null), requireAll: true });
    expect(build.errors).toEqual([]);
    const a = build.index.frames["cat/part"]!.layers;
    const b = build.index.frames["cat/other"]!.layers;
    const empty = { page: a.shade!.page, x: a.shade!.x, y: a.shade!.y, w: 1, h: 1, dx: 0, dy: 0 };
    expect(a.shade).toEqual(empty);
    expect(a.ink).toEqual(empty);
    expect(b.shade).toEqual(empty);
    expect(a.fill).toMatchObject({ dx: 20, dy: 20, w: 40, h: 40 });
    // Порожні шари рамки вмісту не розтягують: вона — лише заливка.
    expect(build.index.frames["cat/part"]!.box).toEqual({ x: 20, y: 20, w: 40, h: 40 });
    // Дві заливки, контур і один порожній піксель.
    expect(build.stats.images).toBe(4);
  });

  it("шари записів із layers — групою після решти: кадр бере шари з якомога менше сторінок", async () => {
    // Сторінки 256²: стани коробки — кожен на свою, у прогалинах лишається місце для шарів голови.
    const build = await buildArt({ artDir: FIXTURES, entries: FIXTURE_ENTRIES, defaultRes: 2, cache: new ArtCache(null), requireAll: false, pack: { maxSize: 256, extrude: 2, gap: 2 } });
    expect(build.errors).toEqual([]);
    const pagesOf = (layered: boolean): number[] =>
      Object.entries(build.index.frames)
        .filter(([id]) => id.startsWith("cat/") === layered)
        .flatMap(([, f]) => Object.values(f.layers).map((r) => r!.page));
    expect(build.index.pages.length).toBeGreaterThan(2);
    // Жоден шар не лежить на сторінці, ранішій за останню сторінку кадрів без шарів.
    expect(Math.min(...pagesOf(true))).toBeGreaterThanOrEqual(Math.max(...pagesOf(false)));
  });

  it("порожній кадр без шарів і порожній шар — різні растри: шар не тягне сторінку групи без шарів", async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "cat"), { recursive: true });
    mkdirSync(path.join(dir, "item"), { recursive: true });
    writeFileSync(path.join(dir, "cat", "part.svg"), svg('<g id="fill"><rect x="10" y="10" width="20" height="20" fill="#ffffff"/></g><g id="ink"/>'));
    writeFileSync(path.join(dir, "item", "none.svg"), svg(""));
    const part: ArtEntry = { id: "cat/part", size: HEAD.size, pivot: HEAD.pivot, layers: ["fill", "ink"] };
    const none: ArtEntry = { id: "item/none", size: HEAD.size, pivot: HEAD.pivot };
    const build = await buildArt({ artDir: dir, entries: [part, none], defaultRes: 2, cache: new ArtCache(null), requireAll: true });
    expect(build.errors).toEqual([]);
    const ink = build.index.frames["cat/part"]!.layers.ink!;
    const all = build.index.frames["item/none"]!.layers.all!;
    expect([ink.w, ink.h, all.w, all.h]).toEqual([1, 1, 1, 1]);
    expect([ink.page, ink.x, ink.y]).not.toEqual([all.page, all.x, all.y]);
    expect(build.stats.images).toBe(3);
  });

  it("з кешем друге збирання нічого не растеризує й дає той самий атлас", async () => {
    const cache = new ArtCache(tempDir());
    const first = await run(FIXTURE_ENTRIES, cache);
    const second = await run(FIXTURE_ENTRIES, cache);
    expect(first.stats.rastered).toBeGreaterThan(0);
    expect(second.stats.rastered).toBe(0);
    expect(second.files.get("index.json")!.equals(first.files.get("index.json")!)).toBe(true);
    expect([...second.files.keys()]).toEqual([...first.files.keys()]);
  });

  it("помилки: SVG не за маніфестом, відсутній арт із REQUIRE_ALL, кадр ширший за сторінку", async () => {
    const wrong: ArtEntry = { ...HEAD, size: { w: 64, h: 64 } };
    const build = await run([wrong, GHOST], new ArtCache(null), true);
    expect(build.errors).toEqual([
      'art/cat/head/front.svg: viewBox "0 0 64 60" — не полотно запису "0 0 64 64"',
      'art/cat/head/back.svg: viewBox "0 0 64 60" — не полотно запису "0 0 64 64"',
      "«item/ghost»: немає item/ghost.svg (KOTOKLOPIT_REQUIRE_ALL_ART)",
    ]);
    // М'яч — коло діаметром 25 одиниць із контуром: при 85 пікселях на одиницю ≈ 2125 px.
    const huge = await run([{ ...BALL, res: 85 }]);
    expect(huge.errors).toHaveLength(1);
    expect(huge.errors[0]).toMatch(/^«item\/ball\/a#all»: \d+×\d+ px з краєм не влазить у сторінку 2048² — меншу res чи поділити на частини$/);
    expect(huge.index.pages).toEqual([]);
  });

  it("порожній маніфест — порожній index.json без сторінок", async () => {
    const build = await run([]);
    expect(build.errors).toEqual([]);
    expect(build.index).toEqual({ version: 3, pages: [], frames: {} });
    expect([...build.files.keys()]).toEqual(["index.json"]);
  });
});

describe("для плагіна", () => {
  it("перезбирає на зміни SVG у art/ і модулів маніфесту, решту пропускає", () => {
    const at = (...parts: string[]) => path.join(GAME_DIR, ...parts);
    expect(artChange(GAME_DIR, at("art", "cat", "head", "front.svg"))).toBe("svg");
    expect(artChange(GAME_DIR, at("art", "palette.ts"))).toBeNull();
    expect(artChange(GAME_DIR, at("src", "view", "art", "manifest", "cat.ts"))).toBe("manifest");
    expect(artChange(GAME_DIR, at("src", "view", "art", "manifest.ts"))).toBe("manifest");
    expect(artChange(GAME_DIR, at("src", "view", "art", "atlas.ts"))).toBeNull();
    expect(artChange(GAME_DIR, at("tests", "fixtures", "art", "item", "ball.svg"))).toBeNull();
    expect(artChange(GAME_DIR, path.join(GAME_DIR, "..", "other", "art", "x.svg"))).toBeNull();
  });

  it("перезбирає й на зміни того, що імпортує маніфест (мапа гри src/sim/home.ts): файли з dependencies останнього збирання", async () => {
    const at = (...parts: string[]) => path.join(GAME_DIR, ...parts);
    const home = at("src", "sim", "home.ts");
    expect(artChange(GAME_DIR, home)).toBeNull();
    // Шлях залежності — як його дає Vite (через «/»), подія — як її дає спостерігач (через «\» на Windows).
    expect(artChange(GAME_DIR, home, [home.split(path.sep).join("/")])).toBe("manifest");
    expect(artChange(GAME_DIR, at("src", "sim", "cat.ts"), [home])).toBeNull();
    // Справжній маніфест справді імпортує мапу гри.
    const manifest = await loadManifest(GAME_DIR);
    expect(manifest.dependencies.some((file) => artChange(GAME_DIR, home, [file]) === "manifest")).toBe(true);
  });

  it("віддає з пам'яті лише згенероване: index.json і сторінки з хешем", () => {
    expect(isAtlasFile("index.json")).toBe(true);
    expect(isAtlasFile("page-0.3f9a2c1b07.webp")).toBe(true);
    expect(isAtlasFile("page-12.ab.webp")).toBe(true);
    expect(isAtlasFile("palette.ts")).toBe(false);
    expect(isAtlasFile("cat/head/front.svg")).toBe(false);
    expect(isAtlasFile("page-0.webp")).toBe(false);
  });
});
