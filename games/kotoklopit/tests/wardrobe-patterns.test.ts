// Візерунки тканини (§5.1, `WARDROBE.md`, «Візерунки»): як плитка й принт лягають на кадр (фальшивий контекст — порядок
// викликів компонувальника), тканина з обрізаного атласом кадру, що лягає на який фасон, ключі рецепта й другий тон.

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { clothFrame, clothIds, clothPaint, type ClothCtx, type ClothLayers, type ClothPaint } from "../src/view/art/cloth";
import { composeFrame, type LayerImage } from "../src/view/art/compose";
import { artEntry } from "../src/view/art/manifest";
import { personRecipe } from "../src/view/art/recipes";
import type { ArtId, ArtLayer, TintPattern, TintRecipe, TintStep } from "../src/view/art/types";
import { BUILDS } from "../src/view/wardrobe/body";
import { BOTTOM_CUTS } from "../src/view/wardrobe/bottoms";
import { CLOTHES } from "../src/view/wardrobe/clothes";
import { PATTERNS, patternFits, secondTone } from "../src/view/wardrobe/patterns";
import { TOP_CUTS } from "../src/view/wardrobe/tops";

// --- Фальшивий контекст ---------------------------------------------------------------------------

interface Op {
  ctx: string;
  op: "clear" | "fill" | "draw" | "transform" | "pattern";
  what?: string;
  gco: string;
  alpha?: number;
  fillStyle?: string;
  args?: number[];
}

/** Фальшивий контекст: записує виклики в спільний журнал; `save` / `restore` — зі стеком стану. */
function fakeCtx(name: string, log: Op[], w = 64, h = 32): ClothCtx {
  const canvas = { width: w, height: h, name } as unknown as HTMLCanvasElement;
  const stack: { gco: GlobalCompositeOperation; alpha: number; fill: string | CanvasGradient | CanvasPattern }[] = [];
  const ctx: ClothCtx = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    clearRect: () => log.push({ ctx: name, op: "clear", gco: ctx.globalCompositeOperation }),
    fillRect: (...args: number[]) => log.push({ ctx: name, op: "fill", gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, fillStyle: String(ctx.fillStyle), args }),
    drawImage: (image: CanvasImageSource, ...args: number[]) =>
      log.push({ ctx: name, op: "draw", what: (image as unknown as { name: string }).name, gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, args }),
    save: () => stack.push({ gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, fill: ctx.fillStyle }),
    restore: () => {
      const top = stack.pop();
      if (top) {
        ctx.globalCompositeOperation = top.gco;
        ctx.globalAlpha = top.alpha;
        ctx.fillStyle = top.fill;
      }
    },
    setTransform: (...args: number[]) => log.push({ ctx: name, op: "transform", gco: ctx.globalCompositeOperation, args }),
    createPattern: (image: CanvasImageSource) => {
      log.push({ ctx: name, op: "pattern", what: (image as unknown as { name: string }).name, gco: ctx.globalCompositeOperation });
      return { toString: () => `pattern:${(image as unknown as { name: string }).name}` } as unknown as CanvasPattern;
    },
  };
  return ctx;
}

const image = (name: string): CanvasImageSource => ({ name }) as unknown as CanvasImageSource;
const layerOf =
  (present: readonly string[]) =>
  (layer: ArtLayer): LayerImage | null =>
    present.includes(layer) ? { image: image(layer), sx: 0, sy: 0, sw: 32, sh: 16 } : null;

const draws = (log: readonly Op[], ctx: string): string[] => log.filter((o) => o.ctx === ctx && o.op === "draw").map((o) => `${o.what}@${o.gco}`);

/** Фарба, що не потребує полотен: плитка й принти — фальшиві зображення. */
const PAINT_TILE: ClothPaint = { fill: { toString: () => "pattern:tile" } as unknown as CanvasPattern, print: null, cuff: null };
const PAINT_PRINT: ClothPaint = {
  fill: null,
  print: { image: image("print"), w: 20, h: 18, px: 10, py: 9 },
  cuff: { image: image("cuff"), w: 16, h: 8, px: 8, py: 4 },
};

const TILE: TintPattern = { tile: "cloth/test", color: 0x123456 };
const RECIPE: TintRecipe = {
  key: "test",
  steps: [
    { layer: "fill-skin", color: 0xe8c39e, put: "source-over" },
    { layer: "fill-top", color: 0xc0675a, put: "source-over" },
    { layer: "fill-top", color: null, put: "source-over", pattern: TILE },
    { layer: "fill-bottom", color: 0x3a3440, put: "source-over" },
    { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
    { layer: "ink", color: null, put: "source-over" },
  ],
};
const PLAIN: TintRecipe = { key: "plain", steps: RECIPE.steps.filter((s) => !s.pattern) };
const LAYERS = layerOf(["fill-skin", "fill-top", "fill-bottom", "shade", "ink"]);

function compose(recipe: TintRecipe, paint: ClothPaint | null, frame: Partial<Parameters<typeof clothFrame>[0]> = {}): Op[] {
  const log: Op[] = [];
  const target = fakeCtx("frame", log);
  const scratch = fakeCtx("scratch", log, 128, 128);
  const cloth = paint ? { k: 2, pivot: { x: 13, y: 14 }, view: "front" as const, points: { print: { x: 15, y: 8 }, cuff: { x: 14, y: 12 } }, ...frame, paint: () => paint } : undefined;
  composeFrame(target, LAYERS, recipe, { w: 64, h: 32, scratch: () => scratch, cloth });
  return log;
}

// --- Компонувальник --------------------------------------------------------------------------------

describe("візерунок у компонувальнику", () => {
  it("плитка — від pivot кадру й лише в межах своєї заливки: на шкіру й сусідній одяг не лізе", () => {
    const log = compose(RECIPE, PAINT_TILE);
    expect(draws(log, "frame")).toEqual(["fill-skin@source-over", "scratch@source-over", "scratch@source-over", "scratch@source-over", "scratch@multiply", "ink@source-over"]);
    const at = log.findIndex((o) => o.ctx === "scratch" && o.op === "fill" && o.fillStyle === "pattern:tile");
    expect(at).toBeGreaterThan(0);
    // Допоміжне полотно очищено, плитка — зі зсувом pivot · k у цілих пікселях, далі — обтинання заливкою верху.
    expect(log.slice(at - 2, at + 4).map((o) => [o.ctx, o.op, o.what ?? o.fillStyle ?? "", o.gco, (o.args ?? []).join(",")])).toEqual([
      ["scratch", "clear", "", "source-over", ""],
      ["scratch", "transform", "", "source-over", "1,0,0,1,26,28"],
      ["scratch", "fill", "pattern:tile", "source-over", "-26,-28,64,32"],
      ["scratch", "transform", "", "source-over", "1,0,0,1,0,0"],
      ["scratch", "draw", "fill-top", "destination-in", "0,0,32,16,0,0,32,16"],
      ["frame", "draw", "scratch", "source-over", "0,0,64,32,0,0,64,32"],
    ]);
    // Шкіра лягла раніше й під візерунок не потрапляє: обтинає лише `fill-top`.
    expect(log.filter((o) => o.gco === "destination-in" && o.ctx === "scratch" && o.op === "draw").map((o) => o.what)).toEqual(["fill-top", "shade", "frame"]);
  });

  it("без візерунка — ті самі виклики малювання, що й до механізму; без тканини чи заливки крок пропускається", () => {
    const plain = compose(PLAIN, null);
    expect(compose(PLAIN, PAINT_TILE)).toEqual(plain);
    expect(compose(RECIPE, null)).toEqual(plain);
    const noTop = (): Op[] => {
      const log: Op[] = [];
      composeFrame(fakeCtx("frame", log), layerOf(["fill-skin", "shade", "ink"]), RECIPE, { w: 64, h: 32, scratch: () => fakeCtx("scratch", log, 128, 128), cloth: { k: 2, pivot: { x: 0, y: 0 }, view: null, paint: () => PAINT_TILE } });
      return log;
    };
    expect(noTop().some((o) => o.fillStyle === "pattern:tile")).toBe(false);
    // Вигляд без візерунків (зокрема старе збереження) — рецепт без кроків візерунка.
    expect(personRecipe(DEFAULT_LOOK).steps.some((s) => s.pattern)).toBe(false);
    expect(clothIds(personRecipe(DEFAULT_LOOK))).toEqual([]);
  });

  it("принт — у точці `print` (центр на точці), манжет — у `cuff`; груди ззаду не видно, манжет — видно", () => {
    const front = compose({ ...RECIPE, steps: RECIPE.steps.map((s) => (s.pattern ? { ...s, pattern: { ...TILE, kind: "print" } } : s)) }, PAINT_PRINT);
    const placed = (log: readonly Op[]): string[] => log.filter((o) => o.ctx === "scratch" && o.op === "draw" && (o.what === "print" || o.what === "cuff")).map((o) => `${o.what}:${(o.args ?? []).slice(4, 6).join(",")}`);
    // print (15, 8) · 2 − (10, 9) = (20, 7); cuff (14, 12) · 2 − (8, 4) = (20, 20).
    expect(placed(front)).toEqual(["print:20,7", "cuff:20,20"]);
    const back = compose(RECIPE, PAINT_PRINT, { view: "back" });
    expect(placed(back)).toEqual(["cuff:20,20"]);
    // Точка ракурсу (`cuff-back`) — замість спільної.
    expect(placed(compose(RECIPE, PAINT_PRINT, { view: "back", points: { cuff: { x: 14, y: 12 }, "cuff-back": { x: 10, y: 10 } } }))).toEqual(["cuff:12,16"]);
    // Точок немає — нічого не кладеться, кадр як без візерунка.
    expect(compose(RECIPE, PAINT_PRINT, { points: {} })).toEqual(compose(PLAIN, null));
  });
});

// --- Тканина з атласу -------------------------------------------------------------------------------

describe("тканина з кадрів атласу", () => {
  /** Плитка 8 × 8 одиниць (16 × 16 пікселів при res 2), обрізана атласом до 10 × 6 зі зсувом (3, 5). */
  const tileLayers = (page: object): ClothLayers => {
    const at = (layer: string): LayerImage => ({ image: Object.assign(page, { name: "page" }) as unknown as CanvasImageSource, sx: layer === "fill" ? 100 : 200, sy: 40, sw: 10, sh: 6, dx: 3, dy: 5 });
    return { source: (layer) => (layer === "fill" || layer === "detail" ? at(layer) : null), w: 16, h: 16, size: { w: 8, h: 8 }, pivot: { x: 0, y: 0 } };
  };

  it("плитка відновлюється на полотні повного розміру зі зсувом обрізки: маска — кольором, деталі — поверх; будується раз", () => {
    const log: Op[] = [];
    const made: string[] = [];
    const page = {};
    const make = (w: number, h: number): ClothCtx => {
      made.push(`${w}x${h}`);
      return fakeCtx(`tile${made.length}`, log, w, h);
    };
    const paint = clothPaint(TILE, 2, () => tileLayers(page), make);
    expect(made).toEqual(["16x16"]);
    expect(String(paint?.fill)).toBe("pattern:tile1");
    const ops = log.filter((o) => o.op !== "transform").map((o) => [o.op, o.op === "draw" ? `${(o.args ?? []).slice(0, 1).join()}→${(o.args ?? []).slice(4).join(",")}` : (o.fillStyle ?? o.what ?? ""), o.gco]);
    expect(ops).toEqual([
      ["clear", "", "source-over"],
      ["draw", "100→3,5,10,6", "source-over"],
      ["fill", "#123456", "source-atop"],
      ["draw", "200→3,5,10,6", "source-over"],
      ["pattern", "tile1", "source-over"],
    ]);
    // Удруге — з кешу: ні полотна, ні малювання.
    const again = clothPaint(TILE, 2, () => tileLayers(page), make);
    expect(made).toHaveLength(1);
    expect(again?.fill).toBe(paint?.fill);
    // Свої кольори: маски немає, лише деталі.
    log.length = 0;
    clothPaint({ ...TILE, color: null }, 2, () => tileLayers(page), make);
    expect(log.filter((o) => o.op === "draw" || o.op === "fill").map((o) => `${o.op}:${(o.args ?? [])[0] ?? o.fillStyle}`)).toEqual(["draw:200"]);
  });

  it("повернута плитка — на полотні з переставленими сторонами, поворотом на чверть; інший масштаб — свій розмір", () => {
    const log: Op[] = [];
    const sizes: string[] = [];
    const make = (w: number, h: number): ClothCtx => {
      sizes.push(`${w}x${h}`);
      return fakeCtx("turned", log, w, h);
    };
    const layers = (): ClothLayers => ({ ...tileLayers({}), size: { w: 8, h: 6 }, h: 12 });
    clothPaint({ ...TILE, turn: true }, 2, layers, make);
    expect(sizes).toEqual(["12x16"]);
    expect(log.filter((o) => o.op === "transform").map((o) => (o.args ?? []).join(","))).toContain("0,1,-1,0,12,0");
    clothPaint(TILE, 3, layers, make);
    expect(sizes).toEqual(["12x16", "24x18"]);
  });

  it("принт і манжет — зображення з pivot у масштабі кадру; без кадрів тканини — нічого", () => {
    const layers = (id: ArtId): ClothLayers | null =>
      id === "cloth/print/missing" ? null : { ...tileLayers({}), size: { w: 20, h: 18 }, w: 40, h: 36, pivot: { x: 10, y: 9 } };
    const make = (w: number, h: number): ClothCtx => fakeCtx("print", [], w, h);
    const paint = clothPaint({ tile: "cloth/print/a", color: null, kind: "print", cuff: "cloth/print/b" }, 2, layers, make);
    expect(paint?.fill).toBeNull();
    expect(paint?.print).toMatchObject({ w: 40, h: 36, px: 20, py: 18 });
    expect(paint?.cuff).toMatchObject({ w: 40, h: 36 });
    expect(clothPaint({ tile: "cloth/print/missing", color: null, kind: "print" }, 2, layers, make)).toBeNull();
    expect(clothPaint({ tile: "cloth/print/missing", color: null }, 2, layers, make)).toBeNull();
  });
});

// --- Реєстр -----------------------------------------------------------------------------------------

describe("реєстр візерунків", () => {
  afterEach(() => {
    vi.doUnmock("../src/view/wardrobe/tops");
    vi.doUnmock("../src/view/wardrobe/bottoms");
    vi.resetModules();
  });

  it("однотонний — нульовий і лягає на все; візерунок — лише на те, що в `on`; принт — лише на верх", () => {
    expect(PATTERNS[0]?.tile).toBeNull();
    for (const [garment, cuts] of [
      ["top", TOP_CUTS],
      ["bottom", BOTTOM_CUTS],
    ] as const) {
      for (let cut = 0; cut < cuts.length; cut++) {
        expect(patternFits(0, garment, cut)).toBe(true);
        for (let p = 1; p < PATTERNS.length; p++) {
          const pattern = PATTERNS[p]!;
          if (!pattern.on.includes(garment) || cuts[cut]?.plain) expect(patternFits(p, garment, cut), `${pattern.name}, ${garment} ${cut}`).toBe(false);
          if (pattern.kind === "print") expect(pattern.on).toEqual(["top"]);
        }
      }
    }
    expect(patternFits(PATTERNS.length, "top", 0)).toBe(false);
  });

  it("принт лягає на торс кожної статури: у кожного є точка `print`; манжет — точка `cuff` рукава", () => {
    for (let build = 0; build < BUILDS.length; build++) expect(artEntry(`person/torso/${build}`)?.points?.["print"], `торс ${build}`).toBeDefined();
    for (const arm of ["person/arm", "person/arm-far"]) expect(artEntry(arm)?.points?.["cuff"], arm).toBeDefined();
  });

  it("на фасон «без візерунків» (`plain`) не лягає жоден", async () => {
    vi.resetModules();
    vi.doMock("../src/view/wardrobe/tops", async (original) => {
      const mod = await original<typeof import("../src/view/wardrobe/tops")>();
      return { ...mod, TOP_CUTS: [...mod.TOP_CUTS, { name: "без візерунків", group: "повсякденне", plain: true }] };
    });
    vi.doMock("../src/view/wardrobe/bottoms", async (original) => {
      const mod = await original<typeof import("../src/view/wardrobe/bottoms")>();
      return { ...mod, BOTTOM_CUTS: [...mod.BOTTOM_CUTS, { name: "без візерунків", group: "довгі штани", plain: true }] };
    });
    const fresh = await import("../src/view/wardrobe/patterns");
    const top = TOP_CUTS.length;
    const bottom = BOTTOM_CUTS.length;
    expect(fresh.patternFits(0, "top", top)).toBe(true);
    expect(fresh.patternFits(0, "bottom", bottom)).toBe(true);
    for (let p = 1; p < fresh.PATTERNS.length; p++) {
      expect(fresh.patternFits(p, "top", top)).toBe(false);
      expect(fresh.patternFits(p, "bottom", bottom)).toBe(false);
    }
  });

  it("ключ рецепта: кожен візерунок верху й низу — свій ключ (і кадри запікаються окремо), однотонний — як без механізму", () => {
    const base: Look = { ...DEFAULT_LOOK, top: 1, bottom: 0 };
    const keys = new Map<string, string>();
    const add = (label: string, look: Look): void => {
      const key = personRecipe(look).key;
      expect(keys.get(key), `${label} і ${keys.get(key)}`).toBeUndefined();
      keys.set(key, label);
    };
    add("однотонний", base);
    for (let p = 1; p < PATTERNS.length; p++) {
      if (patternFits(p, "top", 0)) add(`верх ${p}`, { ...base, topPattern: p });
      if (patternFits(p, "bottom", 0)) add(`низ ${p}`, { ...base, bottomPattern: p });
    }
    expect(personRecipe({ ...base, topPattern: 0, bottomPattern: 0 }).key).toBe(personRecipe(base).key);
  });

  it("крок візерунка: лише задані поля, після заливки свого одягу", () => {
    for (let p = 1; p < PATTERNS.length; p++) {
      const pattern = PATTERNS[p]!;
      const garment = pattern.on[0]!;
      const recipe = personRecipe({ ...DEFAULT_LOOK, [garment === "top" ? "topPattern" : "bottomPattern"]: p });
      const at = recipe.steps.findIndex((s) => s.pattern);
      const step: TintStep | undefined = recipe.steps[at];
      expect(step?.layer, pattern.name).toBe(garment === "top" ? "fill-top" : "fill-bottom");
      expect(recipe.steps.findIndex((s) => s.layer === step?.layer && !s.pattern), pattern.name).toBeLessThan(at);
      for (const value of Object.values(step?.pattern ?? {})) expect(value, pattern.name).not.toBeUndefined();
      expect(clothIds(recipe), pattern.name).toEqual([pattern.tile, ...(pattern.cuff ? [pattern.cuff] : [])]);
      expect(artEntry(pattern.tile!)?.layers, pattern.name).toBeDefined();
      if (pattern.cuff) expect(artEntry(pattern.cuff)?.layers, pattern.name).toBeDefined();
    }
  });
});

// --- Другий тон ---------------------------------------------------------------------------------------

describe("другий тон", () => {
  it("контраст — пара з палітри одягу, виразна на кожному кольорі (ΔE2000 ≥ 25)", () => {
    for (const color of CLOTHES) {
      const pair = secondTone("contrast", color);
      expect(CLOTHES, hexOf(color)).toContain(pair);
      expect(deltaE2000(color, pair!), `${hexOf(color)} → ${hexOf(pair!)}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("тон у тон — помітний, але м'який на кожному кольорі (ΔE2000 10…16), свої кольори — без маски", () => {
    for (const color of CLOTHES) {
      const tone = secondTone("tone", color)!;
      expect(deltaE2000(color, tone), `${hexOf(color)} → ${hexOf(tone)}`).toBeGreaterThanOrEqual(10);
      expect(deltaE2000(color, tone), `${hexOf(color)} → ${hexOf(tone)}`).toBeLessThanOrEqual(16);
      expect(secondTone("own", color)).toBeNull();
    }
  });
});

const hexOf = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

// --- Різниця кольорів (CIEDE2000; та сама, що в `compose.test.ts`) ---------------------------------------

function lab(color: number): [number, number, number] {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = lin(((color >> 16) & 255) / 255);
  const g = lin(((color >> 8) & 255) / 255);
  const b = lin((color & 255) / 255);
  const f = (v: number): number => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE2000(c1: number, c2: number): number {
  const [l1, a1, b1] = lab(c1);
  const [l2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number): number => ((Math.atan2(b, a) / rad) % 360 + 360) % 360;
  const h1 = hue(b1, a1p);
  const h2 = hue(b2, a2p);
  let dh = h2 - h1;
  if (c1p * c2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * rad);
  const lb = (l1 + l2) / 2;
  const cbp = (c1p + c2p) / 2;
  let hb = h1 + h2;
  if (c1p * c2p !== 0) hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lb - 50) ** 2) / Math.sqrt(20 + (lb - 50) ** 2);
  const sc = 1 + 0.045 * cbp;
  const sh = 1 + 0.015 * cbp * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  const dl = (l2 - l1) / sl;
  const dc = (c2p - c1p) / sc;
  const dhh = dH / sh;
  return Math.sqrt(dl * dl + dc * dc + dhh * dhh + rt * dc * dhh);
}
