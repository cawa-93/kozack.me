// Карти сяйва в атласі (§8.2; `art/STYLE.md` §15, «Атлас»): конвеєр рахує ореол кадрів речей, які бувають ціллю дії, і
// кладе його на сторінку атласу; `index.json` каже, де карта й як вона лягає на кадр.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { buildArt } from "../scripts/art/build";
import { ArtCache } from "../scripts/art/cache";
import { rasterFrame } from "../scripts/art/raster";
import { topLevelLayers } from "../scripts/art/svg";
import { OBJECTS } from "../src/sim/home";
import type { CleaningTool, HomeItem, MessKind, Quality } from "../src/sim/types";
import { artIndexProblems } from "../src/view/art/atlasindex";
import { GLOW_MAP, glowMap } from "../src/view/art/glowmap";
import { artEntries } from "../src/view/art/manifest";
import type { ArtEntry } from "../src/view/art/types";
import { messFrame } from "../src/view/iso/looks";

const GAME_DIR = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = path.join(GAME_DIR, "tests", "fixtures", "art");

const BOX: ArtEntry = { id: "env/box", size: { w: 120, h: 100 }, pivot: { x: 60, y: 90 }, states: ["closed", "half", "open"], glow: true };
const BALL: ArtEntry = { id: "item/ball", size: { w: 30, h: 30 }, pivot: { x: 15, y: 28 }, states: ["a", "b"] };
/** Без SVG — заглушка. */
const GHOST: ArtEntry = { id: "item/ghost", size: { w: 40, h: 30 }, pivot: { x: 20, y: 28 }, glow: true };

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const run = (cache = new ArtCache(null)) => buildArt({ artDir: FIXTURES, entries: [BOX, BALL, GHOST], defaultRes: 2, cache, requireAll: false });

describe("карти сяйва в атласі", () => {
  it("кадр запису з glow має карту: ореол альфи кадру, білий, у зниженій роздільності; інші кадри й заглушки — без карти", async () => {
    const build = await run();
    expect(build.errors).toEqual([]);
    const index = build.index;
    expect(artIndexProblems(JSON.parse(build.files.get("index.json")!.toString()))).toEqual([]);
    expect(index.frames["item/ball/a"]!.glow).toBeUndefined();
    expect(index.frames["item/ghost"]!.glow).toBeUndefined();
    expect(build.stats.glows).toBe(3);

    const text = readFileSync(path.join(FIXTURES, "env/box.svg"), "utf8");
    for (const state of BOX.states!) {
      const frame = index.frames[`env/box/${state}`]!;
      const raster = await rasterFrame({ svg: text, size: BOX.size, res: 2, layers: null, fileLayers: topLevelLayers(text), state, states: BOX.states! });
      const layer = raster.layers[0]!;
      const alpha = new Uint8Array(layer.w * layer.h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = layer.data[i * 4 + 3]!;
      const want = glowMap({ w: layer.w, h: layer.h, data: alpha });
      const glow = frame.glow!;
      // Зсув — від полотна кадру: рамка шару плюс поле карти.
      expect(glow).toMatchObject({ w: want.w, h: want.h, dx: layer.x + want.dx, dy: layer.y + want.dy, scale: GLOW_MAP.scale });
      const page = index.pages[glow.page]!;
      const decoded = await sharp(build.files.get(page.file)!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let differ = 0;
      for (let y = 0; y < glow.h; y++) {
        for (let x = 0; x < glow.w; x++) {
          const at = ((glow.y + y) * decoded.info.width + glow.x + x) * 4;
          const a = want.data[y * want.w + x]!;
          if (decoded.data[at + 3] !== a) differ++;
          else if (a > 0 && (decoded.data[at] !== 255 || decoded.data[at + 1] !== 255 || decoded.data[at + 2] !== 255)) differ++;
        }
      }
      expect(differ, state).toBe(0);
    }
  });

  it("з кешем друге збирання дає той самий атлас", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kotoklopit-glow-"));
    temps.push(dir);
    const cache = new ArtCache(dir);
    const first = await run(cache);
    const second = await run(cache);
    expect(first.index.frames["env/box/open"]!.glow).toBeDefined();
    expect(second.files.get("index.json")!.equals(first.files.get("index.json")!)).toBe(true);
    expect([...second.files.keys()]).toEqual([...first.files.keys()]);
  });

  it("карти лягають після всього іншого: кадри й шари лежать там само, де лежали б без карт", async () => {
    const withGlow = await run();
    const plain = await buildArt({ artDir: FIXTURES, entries: [BOX, BALL, GHOST].map(({ glow: _glow, ...entry }) => entry), defaultRes: 2, cache: new ArtCache(null), requireAll: false });
    expect(plain.stats.glows).toBe(0);
    const layersOf = (build: typeof plain): unknown => Object.fromEntries(Object.entries(build.index.frames).map(([id, frame]) => [id, frame.layers]));
    expect(layersOf(withGlow)).toEqual(layersOf(plain));
  });

  it("index.json: карта сяйва — прямокутник у межах сторінки з додатним scale", () => {
    const index = (glow: unknown): unknown => ({
      version: 3,
      pages: [{ file: "p.webp", w: 64, h: 64 }],
      frames: { "env/box": { size: { w: 10, h: 10 }, res: 2, pivot: { x: 5, y: 5 }, layers: { all: { page: 0, x: 0, y: 0, w: 20, h: 20, dx: 0, dy: 0 } }, glow } },
    });
    expect(artIndexProblems(index({ page: 0, x: 24, y: 0, w: 20, h: 20, dx: -10, dy: -10, scale: 2 }))).toEqual([]);
    expect(artIndexProblems(index({ page: 0, x: 50, y: 0, w: 20, h: 20, dx: -10, dy: -10, scale: 2 }))).toEqual(["кадр «env/box», сяйво: виходить за сторінку 0 (64 × 64)"]);
    expect(artIndexProblems(index({ page: 1, x: 0, y: 0, w: 20, h: 20, dx: -10, dy: -10, scale: 2 }))).toEqual(["кадр «env/box», сяйво: немає сторінки 1"]);
    expect(artIndexProblems(index({ page: 0, x: 0, y: 0, w: 20, h: 20, dx: -10, dy: -10, scale: 0 }))).toEqual(["кадр «env/box», сяйво: треба { page, x, y, w, h, dx, dy, scale }"]);
    expect(artIndexProblems(index(true))).toEqual(["кадр «env/box», сяйво: треба { page, x, y, w, h, dx, dy, scale }"]);
  });
});

describe("маніфест: кому рахувати сяйво", () => {
  it("кожна ціль дії, крім кота, — з картою сяйва: речі квартири й те, що стоїть чи лежить на підлозі; і лише вони", () => {
    const qualities: readonly Quality[] = ["cheap", "premium"];
    // Речі котячого кутка й переноска — в обох якостях; безлад кожного виду й уламки переноски; пилосос чи віник на підлозі.
    const itemKinds: Record<HomeItem["kind"] | "carrier", true> = { bowl: true, water: true, litter: true, toy: true, house: true, scratcher: true, carrier: true };
    const messKinds: Record<MessKind, true> = { surprise: true, vomit: true, hairball: true, litter: true, broken: true, fur: true, mark: true, pee: true, puddle: true, paper: true, garbage: true };
    const tools: Record<CleaningTool, true> = { vacuum: true, broom: true };
    const targets = [
      ...OBJECTS.map((object) => `env/${object.id}`),
      ...Object.keys(itemKinds).flatMap((kind) => qualities.map((quality) => `item/${kind}/${quality}`)),
      ...(Object.keys(messKinds) as MessKind[]).map((kind) => messFrame({ kind }).id as string),
      ...qualities.map((quality) => messFrame({ kind: "broken", carrier: quality }).id as string),
      ...Object.keys(tools).map((tool) => `env/${tool}`),
    ].sort();
    const glowing = artEntries()
      .filter((entry) => entry.glow === true)
      .map((entry) => entry.id as string)
      .sort();
    expect(glowing).toEqual(targets);
    // Карта — з єдиного шару готових кольорів.
    for (const entry of artEntries()) if (entry.glow) expect(entry.layers, entry.id).toBeUndefined();
  });
});
