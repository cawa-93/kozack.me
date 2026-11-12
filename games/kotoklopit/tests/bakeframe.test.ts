// Запечений кадр — на рамці вмісту, а не на повному полотні кадру (`art/STYLE.md` §15): рамка з `index.json`, разом із
// накладками; розміщення на рамці — піксель у піксель те саме, що на повному полотні; складання зі зсувом рамки.

import { afterEach, describe, expect, it } from "vitest";

import { bakeLayers } from "../src/view/art/bakeframe";
import { clothFrame, type ClothCtx, type ClothLayers } from "../src/view/art/cloth";
import { composeFrame, type Ctx2D, type LayerImage } from "../src/view/art/compose";
import { artEntries, DEFAULT_RES } from "../src/view/art/manifest";
import { artPlacement, boxCrop, boxOrigin, boxPlacement, unionBox, type ArtGeometry } from "../src/view/art/placement";
import { artLayerSource, resetArtSources, shareArtAtlas } from "../src/view/art/sources";
import { ART_INDEX_VERSION, type ArtIndex, type ArtLayer, type ArtSize, type FrameBox, type FrameId, type IndexFrame, type TintRecipe } from "../src/view/art/types";

/** Де на екрані (одиниці світу від точки зображення) лежить піксель `p` текстури розміру `px` з таким розміщенням. */
function world(placement: { originX: number; originY: number; scaleX: number; scaleY: number }, px: ArtSize, p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - placement.originX * px.w) * placement.scaleX, y: (p.y - placement.originY * px.h) * placement.scaleY };
}

describe("розміщення кадру на рамці вмісту (`boxPlacement`)", () => {
  const geometry: ArtGeometry = { size: { w: 64, h: 60 }, pivot: { x: 30, y: 50 } };
  const canvas = { w: 128, h: 120 };

  it("pivot і кожен піксель рамки — там само, де на повному полотні", () => {
    const box = { x: 18, y: 14, w: 92, h: 70 };
    const full = artPlacement(geometry, canvas);
    const boxed = boxPlacement(geometry, canvas, box);
    // Масштаб — той самий: рамка лише обтинає полотно.
    expect([boxed.scaleX, boxed.scaleY]).toEqual([full.scaleX, full.scaleY]);
    // Pivot: на повному полотні — піксель (60, 100), на рамці — (42, 86); обидва — у точці зображення.
    const pivot = world(boxed, box, { x: 60 - box.x, y: 100 - box.y });
    expect(pivot.x).toBeCloseTo(0, 9);
    expect(pivot.y).toBeCloseTo(0, 9);
    for (const p of [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: 61, y: 33 },
    ]) {
      const was = world(full, canvas, p);
      const now = world(boxed, box, { x: p.x - box.x, y: p.y - box.y });
      expect(now.x).toBeCloseTo(was.x, 9);
      expect(now.y).toBeCloseTo(was.y, 9);
    }
  });

  it("pivot поза рамкою (суглоб поза намальованим) — origin поза 0–1, місце те саме", () => {
    const box = { x: 80, y: 10, w: 20, h: 20 };
    const boxed = boxPlacement(geometry, canvas, box);
    expect(boxed.originX).toBeLessThan(0);
    expect(boxed.originY).toBeGreaterThan(1);
    const pivot = world(boxed, box, { x: 60 - box.x, y: 100 - box.y });
    expect(pivot.x).toBeCloseTo(0, 9);
    expect(pivot.y).toBeCloseTo(0, 9);
  });

  it("рамка на все полотно — рівно `artPlacement` (заглушки, кадри без рамки)", () => {
    expect(boxPlacement(geometry, canvas, { x: 0, y: 0, w: 128, h: 120 })).toEqual(artPlacement(geometry, canvas));
  });

  it("кожен запис маніфесту з шарами: будь-яка рамка в його полотні — те саме місце й менше пікселів", () => {
    let checked = 0;
    for (const entry of artEntries()) {
      if (!entry.layers) continue;
      const res = entry.res ?? DEFAULT_RES;
      const px = { w: Math.round(entry.size.w * res), h: Math.round(entry.size.h * res) };
      if (px.w < 8 || px.h < 8) continue;
      const g: ArtGeometry = { size: entry.size, pivot: entry.pivot };
      const full = artPlacement(g, px);
      // Рамка — середина полотна: чверть поля з кожного боку (цілі пікселі, як у конвеєра).
      const box = { x: Math.floor(px.w / 4), y: Math.floor(px.h / 4), w: Math.ceil(px.w / 2), h: Math.ceil(px.h / 2) };
      const boxed = boxPlacement(g, px, box);
      for (const p of [
        { x: entry.pivot.x * (px.w / entry.size.w), y: entry.pivot.y * (px.h / entry.size.h) },
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
      ]) {
        const was = world(full, px, p);
        const now = world(boxed, box, { x: p.x - box.x, y: p.y - box.y });
        expect(Math.abs(now.x - was.x), entry.id).toBeLessThan(1e-9);
        expect(Math.abs(now.y - was.y), entry.id).toBeLessThan(1e-9);
      }
      expect(box.w * box.h, entry.id).toBeLessThan(px.w * px.h);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("origin у точці кадру (кінчик хвоста) і обтинання — у пікселях рамки", () => {
    const box = { x: 18, y: 14, w: 92, h: 70 };
    // Точка (40, 20) одиниць — піксель (80, 40) полотна, (62, 26) рамки.
    const origin = boxOrigin(geometry, canvas, box, { x: 40, y: 20 });
    expect(origin.x * box.w).toBeCloseTo(62, 9);
    expect(origin.y * box.h).toBeCloseTo(26, 9);
    // Вікно обтинання полотна → рамки: зсунуте й обтяте рамкою (Phaser сам від'ємного початку не обтинає).
    expect(boxCrop(box, { x: 30, y: 20, w: 40, h: 30 })).toEqual({ x: 12, y: 6, w: 40, h: 30 });
    expect(boxCrop(box, { x: 0, y: 0, w: 40, h: 30 })).toEqual({ x: 0, y: 0, w: 22, h: 16 });
    expect(boxCrop(box, { x: 100, y: 70, w: 40, h: 30 })).toEqual({ x: 82, y: 56, w: 10, h: 14 });
    // Поза рамкою — нічого.
    expect(boxCrop(box, { x: 0, y: 0, w: 10, h: 10 })).toMatchObject({ w: 0, h: 0 });
  });

  it("об'єднання рамок", () => {
    expect(unionBox({ x: 10, y: 20, w: 30, h: 40 }, { x: 5, y: 30, w: 10, h: 50 })).toEqual({ x: 5, y: 20, w: 35, h: 60 });
    expect(unionBox({ x: 10, y: 20, w: 30, h: 40 }, { x: 12, y: 22, w: 3, h: 4 })).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

// --- Шари й рамка кадру для запікання --------------------------------------------------------------

const PAGE = { tag: "сторінка" } as unknown as CanvasImageSource;
const BODY = "cat/body/normal/front" as FrameId;
const BODY_EXTRA = "cat/body-extra/normal/front" as FrameId;
const rect = (dx: number, dy: number, w: number, h: number): { page: number; x: number; y: number; w: number; h: number; dx: number; dy: number } => ({ page: 0, x: 0, y: 0, w, h, dx, dy });
/** Порожній шар: спільний прозорий піксель у (0, 0). */
const EMPTY = rect(0, 0, 1, 1);

function share(frames: Record<string, IndexFrame>): void {
  const index: ArtIndex = { version: ART_INDEX_VERSION, pages: [{ file: "page-0.webp", w: 2048, h: 2048 }], frames };
  shareArtAtlas(index, [PAGE]);
}

const body: IndexFrame = {
  size: { w: 100, h: 60 },
  res: 2,
  pivot: { x: 50, y: 40 },
  layers: { fill: rect(40, 30, 100, 60), "tabby-mackerel": rect(50, 34, 70, 40), shade: EMPTY, ink: rect(38, 28, 104, 64) },
  box: { x: 38, y: 28, w: 104, h: 64 },
};
const bodyExtra: IndexFrame = {
  size: { w: 100, h: 60 },
  res: 2,
  pivot: { x: 50, y: 40 },
  layers: { "extra-collar": rect(120, 20, 30, 30), "extra-bald": EMPTY },
  box: { x: 120, y: 20, w: 30, h: 30 },
};

const step = (layer: ArtLayer, color: number | null = null): TintRecipe["steps"][number] => ({ layer, color, put: "source-over" });
const PLAIN: TintRecipe = { key: "plain", steps: [step("fill", 0xd98a3e), step("tabby-mackerel", 0x333333), step("shade"), step("ink")] };
const COLLAR: TintRecipe = { key: "collar", steps: [step("fill", 0xd98a3e), step("extra-collar"), step("ink")] };

/** Чи рамка вміщує шар (порожній піксель не рахується). */
function covers(box: FrameBox, layer: LayerImage | null): boolean {
  if (!layer || (layer.sw === 1 && layer.sh === 1)) return true;
  const dx = layer.dx ?? 0;
  const dy = layer.dy ?? 0;
  return dx >= box.x && dy >= box.y && dx + layer.sw <= box.x + box.w && dy + layer.sh <= box.y + box.h;
}

describe("шари й рамка кадру для запікання (`bakeLayers`)", () => {
  afterEach(() => resetArtSources());

  it("рамка — з `index.json`: покриває всі шари рецепта, а пікселів менше, ніж у полотні", () => {
    share({ [BODY]: body, [BODY_EXTRA]: bodyExtra });
    const got = bakeLayers(BODY, BODY_EXTRA, PLAIN);
    expect(got?.canvas).toEqual({ w: 200, h: 120 });
    expect(got?.box).toEqual({ x: 38, y: 28, w: 104, h: 64 });
    for (const { layer } of PLAIN.steps) expect(covers(got!.box, got!.source(layer)), layer).toBe(true);
    expect(got!.box.w * got!.box.h).toBeLessThan(got!.canvas.w * got!.canvas.h);
    // Шари — зі сторінок атласу (`sources.ts`), зі своїм зсувом у полотні кадру.
    expect(got?.source("fill")).toEqual({ image: PAGE, sx: 0, sy: 0, sw: 100, sh: 60, dx: 40, dy: 30 });
    expect(got?.source("fluff")).toBeNull();
  });

  it("накладки `extra-*` — з кадру накладок того самого полотна, і рамка покриває і їх", () => {
    share({ [BODY]: body, [BODY_EXTRA]: bodyExtra });
    const got = bakeLayers(BODY, BODY_EXTRA, COLLAR);
    expect(got?.source("extra-collar")).toMatchObject({ dx: 120, dy: 20, sw: 30, sh: 30 });
    expect(got?.box).toEqual({ x: 38, y: 20, w: 112, h: 72 });
    for (const { layer } of COLLAR.steps) expect(covers(got!.box, got!.source(layer)), layer).toBe(true);
    // Рецепт без накладок рамки накладок не тягне.
    expect(bakeLayers(BODY, BODY_EXTRA, PLAIN)?.box).toEqual(body.box);
    // Порожня накладка (прозорий піксель у (0, 0)) рамки не розтягує.
    const bald: TintRecipe = { key: "bald", steps: [step("fill", 0xd98a3e), step("extra-bald")] };
    share({ [BODY]: body, [BODY_EXTRA]: { ...bodyExtra, layers: { "extra-bald": EMPTY }, box: { x: 0, y: 0, w: 1, h: 1 } } });
    expect(bakeLayers(BODY, BODY_EXTRA, bald)?.box).toEqual(body.box);
  });

  it("кадр без рамки в індексі — усе полотно", () => {
    const { box: _box, ...bare } = body;
    share({ [BODY]: bare });
    expect(bakeLayers(BODY, null, PLAIN)?.box).toEqual({ x: 0, y: 0, w: 200, h: 120 });
    expect(artLayerSource(BODY)?.box).toEqual({ x: 0, y: 0, w: 200, h: 120 });
  });

  it("кадру немає, він заглушка конвеєра чи жодного шару рецепта в ньому немає — null (запікається заглушка)", () => {
    share({ [BODY]: { ...body, stub: true } });
    expect(bakeLayers(BODY, null, PLAIN)).toBeNull();
    share({ [BODY]: body });
    expect(bakeLayers("cat/head/normal/front" as FrameId, null, PLAIN)).toBeNull();
    expect(bakeLayers(BODY, null, { key: "none", steps: [step("fill-skin", 0xffffff)] })).toBeNull();
  });

  it("атласу немає (тести, гра без атласу) — null", () => {
    expect(bakeLayers(BODY, BODY_EXTRA, PLAIN)).toBeNull();
  });
});

// --- Складання на рамці -----------------------------------------------------------------------------

interface Op {
  ctx: string;
  op: "clear" | "fill" | "draw";
  what?: string;
  gco: string;
  /** Прямокутник призначення з урахуванням перетворення контексту. */
  dest: number[];
  fillStyle?: string;
}

/** Фальшивий контекст: журнал викликів із місцем призначення (зсув `setTransform` враховано). */
function fakeCtx(name: string, log: Op[], w: number, h: number): Ctx2D & ClothCtx {
  let tx = 0;
  let ty = 0;
  const ctx = {
    canvas: { width: w, height: h, name } as unknown as HTMLCanvasElement,
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    clearRect: (x: number, y: number, cw: number, ch: number) => log.push({ ctx: name, op: "clear", gco: ctx.globalCompositeOperation, dest: [x + tx, y + ty, cw, ch] }),
    fillRect: (x: number, y: number, fw: number, fh: number) =>
      log.push({ ctx: name, op: "fill", gco: ctx.globalCompositeOperation, dest: [x + tx, y + ty, fw, fh], fillStyle: typeof ctx.fillStyle === "string" ? ctx.fillStyle : `pattern@${tx},${ty}` }),
    drawImage: (image: CanvasImageSource, ...a: number[]) =>
      log.push({ ctx: name, op: "draw", what: (image as unknown as { name: string }).name, gco: ctx.globalCompositeOperation, dest: [(a[4] ?? 0) + tx, (a[5] ?? 0) + ty, a[6] ?? 0, a[7] ?? 0] }),
    save: () => {},
    restore: () => {},
    setTransform: (_a: number, _b: number, _c: number, _d: number, e: number, f: number) => {
      tx = e;
      ty = f;
    },
    createPattern: () => ({ pattern: name }) as unknown as CanvasPattern,
  };
  return ctx;
}

const named = (name: string): CanvasImageSource => ({ name }) as unknown as CanvasImageSource;

describe("складання кадру на рамці вмісту (`composeFrame` з `x`, `y`)", () => {
  const CANVAS = { w: 200, h: 120 };
  const BOX = { x: 38, y: 28, w: 104, h: 64 };
  const layers = (layer: ArtLayer): LayerImage | null => {
    const at: Partial<Record<ArtLayer, [number, number, number, number]>> = {
      "fill-top": [40, 30, 100, 60],
      "extra-stain": [60, 40, 20, 20],
      shade: [44, 60, 90, 30],
      ink: [38, 28, 104, 64],
    };
    const r = at[layer];
    return r ? { image: named(layer), sx: 0, sy: 0, sw: r[2], sh: r[3], dx: r[0], dy: r[1] } : null;
  };
  /** Тканина: плитка 6 × 4 одиниці й принт 10 × 10 з центром посередині. */
  const cloth = (id: string): ClothLayers => ({
    source: (layer) => (layer === "detail" ? { image: named(`${id}#detail`), sx: 0, sy: 0, sw: 12, sh: 8 } : null),
    w: 12,
    h: 8,
    size: { w: 6, h: 4 },
    pivot: id.includes("print") ? { x: 3, y: 2 } : { x: 0, y: 0 },
  });
  const recipe: TintRecipe = {
    key: "boxed",
    steps: [
      { layer: "fill-top", color: 0x336699, put: "source-over" },
      { layer: "fill-top", color: null, put: "source-atop", pattern: { tile: "cloth/stripe", color: null } },
      { layer: "fill-top", color: null, put: "source-atop", pattern: { tile: "cloth/print/star", color: null, kind: "print" } },
      { layer: "extra-stain", color: null, put: "source-atop" },
      { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
      { layer: "ink", color: null, put: "source-over" },
    ],
  };

  /** Скласти кадр і повернути журнал; місця — у пікселях полотна кадру (до журналу рамки додано її зсув). */
  function run(box: FrameBox): Op[] {
    const log: Op[] = [];
    const target = fakeCtx("frame", log, box.w, box.h);
    const scratch = fakeCtx("scratch", log, 256, 256);
    const made: ClothCtx[] = [];
    const frame = clothFrame({ k: 2, pivot: { x: 50, y: 40 }, points: { print: { x: 55, y: 30 } }, view: "front" }, cloth, (w, h) => {
      const ctx = fakeCtx(`cloth${made.length}`, [], w, h);
      made.push(ctx);
      return ctx;
    });
    composeFrame(target, layers, recipe, { w: box.w, h: box.h, x: box.x, y: box.y, scratch: () => scratch, cloth: frame });
    return log;
  }

  it("ті самі кроки, що на повному полотні; усе, що лягає на кадр, — зсунуте рівно на початок рамки", () => {
    const full = run({ x: 0, y: 0, ...CANVAS });
    const boxed = run(BOX);
    expect(boxed.map((o) => [o.ctx, o.op, o.what, o.gco])).toEqual(full.map((o) => [o.ctx, o.op, o.what, o.gco]));
    expect(full.filter((o) => o.op === "draw" && o.what === "cloth1").length).toBe(1);
    for (const [i, was] of full.entries()) {
      const now = boxed[i]!;
      // Шари, принт і плитка (її початок — pivot кадру) — у тому самому місці полотна кадру.
      if (was.op === "draw" && was.what !== "scratch" && was.what !== "frame") {
        expect([now.dest[0]! + BOX.x, now.dest[1]! + BOX.y, now.dest[2], now.dest[3]], `${i}: ${was.what}`).toEqual(was.dest);
      }
      if (was.op === "fill" && was.fillStyle?.startsWith("pattern@")) {
        const origin = (o: Op): number[] => (o.fillStyle ?? "").slice("pattern@".length).split(",").map(Number);
        expect([origin(now)[0]! + BOX.x, origin(now)[1]! + BOX.y]).toEqual(origin(was));
        expect(origin(was)).toEqual([100, 80]);
      }
    }
  });

  it("малює й чистить лише рамку: заливки, очищення й перекладання полотен — її розміру", () => {
    const boxed = run(BOX);
    for (const o of boxed) {
      if (o.op === "draw" && o.what !== "scratch" && o.what !== "frame") continue;
      expect(o.dest, `${o.ctx} ${o.op}`).toEqual([0, 0, BOX.w, BOX.h]);
    }
    expect(boxed.some((o) => o.op === "clear" && o.ctx === "frame")).toBe(true);
  });

  it("шар цілком поза рамкою не малюється", () => {
    const log: Op[] = [];
    const target = fakeCtx("frame", log, 10, 10);
    composeFrame(target, layers, { key: "ink", steps: [{ layer: "ink", color: null, put: "source-over" }] }, { w: 10, h: 10, x: 150, y: 100 });
    expect(log.filter((o) => o.op === "draw")).toEqual([]);
  });
});
