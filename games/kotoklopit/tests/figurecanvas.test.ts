// Компонувальник для живих портретів котів (§9.7, `compose.ts`): спільний кеш тонованих частин (LRU за пікселями), межі
// намальованого — раз на кадр і «силует» рецепта (`alphaKey`), «лише з кешу» для першого кадру, допоміжне полотно того самого
// виду, що й ціль. Полотна тут — модель лише альфи: справжні `composeFrame`, `FigureCanvas` і `clothFrame` малюють на ній, як на
// Canvas2D, а вона рахує альфу за правилами режимів Canvas2D (від альфи й залежать межі намальованого) і лічить полотна,
// малювання й читання пікселів.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import { coatOf, type Coat } from "../src/sim/genetics";
import type { Genes, Look, Shape } from "../src/sim/types";
import { clothFrame, type ClothCtx, type ClothLayers } from "../src/view/art/cloth";
import type { Ctx2D, LayerSource, PortraitPart } from "../src/view/art/compose";
import { catRecipe, farRecipe, personRecipe, type CatRecipeOptions } from "../src/view/art/recipes";
import { ART_INDEX_VERSION, type ArtIndex, type ArtLayer, type FrameId, type IndexFrame, type TintRecipe } from "../src/view/art/types";
import { PATTERNS, patternFits } from "../src/view/wardrobe/patterns";

// --- Модель полотна: лише альфа ----------------------------------------------------------------

/** Що створено, намальовано (крім полотен портрета) і прочитано. */
const stats = { canvases: 0, draws: 0, reads: 0 };
/** Створені полотна по черзі: які й з якими налаштуваннями контексту. */
const created: AlphaCanvas[] = [];

function resetStats(): void {
  stats.canvases = 0;
  stats.draws = 0;
  stats.reads = 0;
  created.length = 0;
}

/** Полотно-модель: альфа 0–1 кожного пікселя. Розмір можна змінити й після створення (як у `<canvas>`), тоді воно чисте. */
class AlphaCanvas {
  settings: CanvasRenderingContext2DSettings | undefined;
  private data = new Float64Array(0);
  private sized = "";
  private context: AlphaCtx | null = null;

  constructor(
    public width = 300,
    public height = 150,
    readonly name = "canvas",
    counted = true,
  ) {
    if (counted) {
      stats.canvases++;
      created.push(this);
    }
  }

  get alpha(): Float64Array {
    if (this.sized !== `${this.width}x${this.height}`) {
      this.data = new Float64Array(this.width * this.height);
      this.sized = `${this.width}x${this.height}`;
    }
    return this.data;
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.alpha[y * this.width + x] ?? 0;
  }

  getContext(_type: "2d", settings?: CanvasRenderingContext2DSettings): AlphaCtx {
    this.settings ??= settings;
    return (this.context ??= new AlphaCtx(this));
  }
}

/** Як `OffscreenCanvas` і `<canvas>` у браузері (`instanceof` у компонувальнику розрізняє їх). */
class FakeOffscreen extends AlphaCanvas {
  constructor(width: number, height: number) {
    super(width, height, "offscreen");
  }
}
class FakeElement extends AlphaCanvas {
  constructor() {
    super(300, 150, "element");
  }
}

/** Картинка, з якої беруть шари (сторінка атласу, тканина): альфа за формулою, у лічильники не йде. */
function image(width: number, height: number, alpha: (x: number, y: number) => number, name = "page"): AlphaCanvas {
  const canvas = new AlphaCanvas(width, height, name, false);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) canvas.alpha[y * width + x] = alpha(x, y);
  return canvas;
}

/** Плитка візерунка (`createPattern`). */
interface AlphaPattern {
  readonly tile: AlphaCanvas;
}

class AlphaCtx {
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "low";
  private m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private readonly stack: { gco: GlobalCompositeOperation; alpha: number; fill: string | CanvasGradient | CanvasPattern; m: [number, number, number, number, number, number] }[] = [];

  constructor(readonly canvas: AlphaCanvas) {}

  getContextAttributes(): CanvasRenderingContext2DSettings {
    return { willReadFrequently: this.canvas.settings?.willReadFrequently === true };
  }

  save(): void {
    this.stack.push({ gco: this.globalCompositeOperation, alpha: this.globalAlpha, fill: this.fillStyle, m: [...this.m] });
  }

  restore(): void {
    const top = this.stack.pop();
    if (!top) return;
    this.globalCompositeOperation = top.gco;
    this.globalAlpha = top.alpha;
    this.fillStyle = top.fill;
    this.m = top.m;
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = [a, b, c, d, e, f];
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.paint((u, v) => (inside(u, v, x, y, w, h) ? 1 : 0), true);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.count();
    const fill = this.fillStyle;
    this.paint((u, v) => (inside(u, v, x, y, w, h) ? fillAlpha(fill, u, v) : 0));
  }

  drawImage(source: CanvasImageSource, ...args: number[]): void {
    this.count();
    const src = source as unknown as AlphaCanvas;
    let [sx, sy, sw, sh, dx, dy, dw, dh] = [0, 0, src.width, src.height, 0, 0, src.width, src.height];
    if (args.length === 2) [dx, dy] = args as [number, number];
    else if (args.length === 4) [dx, dy, dw, dh] = args as [number, number, number, number];
    else [sx, sy, sw, sh, dx, dy, dw, dh] = args as [number, number, number, number, number, number, number, number];
    this.paint((u, v) => (inside(u, v, dx, dy, dw, dh) ? src.at(Math.floor(sx + ((u - dx) * sw) / dw), Math.floor(sy + ((v - dy) * sh) / dh)) : 0));
  }

  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } {
    stats.reads++;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[(j * w + i) * 4 + 3] = Math.round(this.canvas.at(x + i, y + j) * 255);
    return { data };
  }

  createPattern(tile: CanvasImageSource): CanvasPattern {
    return { tile: tile as unknown as AlphaCanvas } satisfies AlphaPattern as unknown as CanvasPattern;
  }

  private count(): void {
    if (this.canvas.name !== "portrait") stats.draws++;
  }

  /** Кожен піксель полотна: центр — у простір користувача (обернене перетворення), там — альфа джерела, і режим кладе її. */
  private paint(source: (u: number, v: number) => number, clear = false): void {
    const { width, height } = this.canvas;
    const alpha = this.canvas.alpha;
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = x + 0.5 - e;
        const py = y + 0.5 - f;
        const s = source((d * px - c * py) / det, (-b * px + a * py) / det);
        const i = y * width + x;
        if (clear) {
          if (s > 0) alpha[i] = 0;
          continue;
        }
        alpha[i] = composite(this.globalCompositeOperation, s * this.globalAlpha, alpha[i] ?? 0);
      }
    }
  }
}

function inside(u: number, v: number, x: number, y: number, w: number, h: number): boolean {
  return u >= Math.min(x, x + w) && u < Math.max(x, x + w) && v >= Math.min(y, y + h) && v < Math.max(y, y + h);
}

/** Альфа заливки: колір — непрозорий, плитка — своєю альфою, з повтором. */
function fillAlpha(fill: string | CanvasGradient | CanvasPattern, u: number, v: number): number {
  if (typeof fill === "string") return 1;
  const { tile } = fill as unknown as AlphaPattern;
  const mod = (n: number, m: number): number => ((n % m) + m) % m;
  return tile.at(mod(Math.floor(u), tile.width), mod(Math.floor(v), tile.height));
}

/** Альфа результату за режимом Canvas2D: від кольорів не залежить у жодному з них. */
function composite(op: GlobalCompositeOperation, s: number, d: number): number {
  switch (op) {
    case "source-over":
    case "multiply":
      return s + d * (1 - s);
    case "source-atop":
      return d;
    case "destination-in":
      return d * s;
    default:
      throw new Error(`модель не знає режиму ${op}`);
  }
}

const asCtx = (canvas: AlphaCanvas, settings?: CanvasRenderingContext2DSettings): Ctx2D => canvas.getContext("2d", settings) as unknown as Ctx2D;

/** Свіжі модулі: кеші компонувальника й атлас — модульні, тож кожен тест починає з порожніх. */
async function fresh(): Promise<{ compose: typeof import("../src/view/art/compose"); sources: typeof import("../src/view/art/sources") }> {
  vi.resetModules();
  const sources = await import("../src/view/art/sources");
  const compose = await import("../src/view/art/compose");
  return { compose, sources };
}

beforeEach(() => resetStats());
afterEach(() => vi.unstubAllGlobals());

// --- Синтетичні шари -----------------------------------------------------------------------------

/** Альфа шару: напівпрозорі місця всюди, у кожного шару свої (тож видно, як режим змінює альфу на краях). */
function layerAlpha(name: string): (x: number, y: number) => number {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  return (x, y) => ((x * 3 + y * 5 + seed * 7) % 5) / 4;
}

const FW = 16;
const FH = 12;
const layerImages = new Map<string, AlphaCanvas>();
/** Кожен шар кадру є, свого малюнка: як у кадрі, де намальовано все, що може дати рецепт. */
const allLayers: LayerSource = (layer: ArtLayer) => {
  let have = layerImages.get(layer);
  if (!have) {
    have = image(FW, FH, layerAlpha(layer), layer);
    layerImages.set(layer, have);
  }
  return { image: have as unknown as CanvasImageSource, sx: 0, sy: 0, sw: FW, sh: FH };
};

// --- Допоміжне полотно ---------------------------------------------------------------------------

describe("допоміжне полотно — того самого виду, що й ціль", () => {
  const recipe: TintRecipe = {
    key: "t",
    steps: [
      { layer: "fill", color: 0xd98a3e, put: "source-over" },
      { layer: "tabby-mackerel", color: 0xbd6a2a, put: "source-atop", alpha: 0.55 },
      { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
      { layer: "ink", color: null, put: "source-over" },
    ],
  };
  const kinds = (): string[] => created.map((c) => `${c.name}${c.settings?.willReadFrequently ? "+cpu" : ""}`);

  it("ціль — OffscreenCanvas у пам'яті процесора (`willReadFrequently`): допоміжне — теж", async () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    const { compose } = await fresh();
    const target = asCtx(new FakeOffscreen(FW, FH), { willReadFrequently: true });
    resetStats();
    compose.composeFrame(target, allLayers, recipe, { w: FW, h: FH });
    expect(kinds()).toEqual(["offscreen+cpu"]);
  });

  it("ціль — `<canvas>`: допоміжне — `<canvas>`, хоч OffscreenCanvas і є; одне на всі цілі того самого виду", async () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    vi.stubGlobal("HTMLCanvasElement", FakeElement);
    vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? new FakeElement() : null) });
    const { compose } = await fresh();
    const element = (): Ctx2D => {
      const canvas = new FakeElement();
      canvas.width = FW;
      canvas.height = FH;
      return asCtx(canvas);
    };
    const targets = [element(), element()];
    resetStats();
    for (const target of targets) compose.composeFrame(target, allLayers, recipe, { w: FW, h: FH });
    expect(kinds()).toEqual(["element"]);
    // Інший вид цілі — своє допоміжне полотно.
    compose.composeFrame(asCtx(new FakeOffscreen(FW, FH)), allLayers, recipe, { w: FW, h: FH });
    expect(kinds()).toEqual(["element", "offscreen", "offscreen"]);
  });
});

// --- «Силует» рецепта ------------------------------------------------------------------------------

/** По одному представнику кожного фенотипу гена (як у `compose.test.ts`). */
const PAIRS = {
  orange: [[false], [true], [false, false], [false, true], [true, true]],
  bool: [
    [true, true],
    [false, false],
  ],
  tabby: [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  white: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
} as const;

function allCoats(): { coat: Coat; fur: Shape["coat"] }[] {
  const seen = new Map<string, { coat: Coat; fur: Shape["coat"] }>();
  for (const orange of PAIRS.orange)
    for (const black of PAIRS.bool)
      for (const dense of PAIRS.bool)
        for (const agouti of PAIRS.bool)
          for (const tabby of PAIRS.tabby)
            for (const white of PAIRS.white)
              for (const full of PAIRS.bool)
                for (const short of PAIRS.bool)
                  for (const eyes of [0, 1, 2])
                    for (const fur of [null, "hairless", "curly"] as const) {
                      const genes: Genes = {
                        orange: [...orange],
                        black: [...black],
                        dense: [...dense],
                        agouti: [...agouti],
                        tabby: [...tabby],
                        white: [...white],
                        full: [...full],
                        short: [...short],
                        eyes,
                      };
                      const coat = coatOf(genes, { coat: fur });
                      seen.set(JSON.stringify({ coat, fur }), { coat, fur });
                    }
  return [...seen.values()];
}

const CAT_OPTIONS: readonly CatRecipeOptions[] = [{}, { dull: true }, { bald: true, collar: true }, { dull: true, bald: true, collar: true }];

/**
 * Рецепти, згруповані за `alphaKey`: у кожній групі складаємо кілька різних (за `key`) і порівнюємо альфу. Альфа від кольорів не
 * залежить, тож якщо ключ щось пропустив (шар поверх, множення на краях, непрозорість кроку, тканину), рецепти групи розійдуться.
 */
function expectSameAlphaWithinKey(alphaKey: (recipe: TintRecipe) => string, composeFrame: typeof import("../src/view/art/compose").composeFrame, recipes: readonly TintRecipe[], opts: { cloth?: ReturnType<typeof clothFrame> } = {}): number {
  const groups = new Map<string, Map<string, TintRecipe>>();
  for (const recipe of recipes) {
    const key = alphaKey(recipe);
    expect(typeof key).toBe("string");
    let group = groups.get(key);
    if (!group) {
      group = new Map();
      groups.set(key, group);
    }
    if (group.size < 3) group.set(recipe.key, recipe);
  }
  const scratch = new AlphaCanvas(FW, FH, "scratch", false);
  const looks = new Set<string>();
  for (const [key, group] of groups) {
    let first: string | null = null;
    for (const recipe of group.values()) {
      const target = new AlphaCanvas(FW, FH, "frame", false);
      composeFrame(asCtx(target), allLayers, recipe, { w: FW, h: FH, scratch: () => asCtx(scratch), cloth: opts.cloth });
      const alpha = Array.from(target.alpha).join(",");
      looks.add(alpha);
      if (first === null) first = alpha;
      else expect(alpha, `${key}: ${recipe.key}`).toBe(first);
    }
  }
  return looks.size;
}

describe("«силует» рецепта (`alphaKey`): від чого залежить альфа кадру", () => {
  it("коти, зокрема дальні частини: рецепти з тим самим ключем — та сама альфа, хоч які кольори; довга шерсть — інший ключ", async () => {
    const { compose } = await fresh();
    const recipes: TintRecipe[] = [];
    for (const { coat, fur } of allCoats()) {
      for (const opts of CAT_OPTIONS) {
        for (const seed of coat.second ? [0, 1, 2] : [0]) {
          const recipe = catRecipe({ coat, fur, seed }, opts);
          recipes.push(recipe, farRecipe(recipe));
        }
      }
    }
    // Модель розрізняє силуети: інакше перевірка нічого б не значила.
    expect(expectSameAlphaWithinKey(compose.alphaKey, compose.composeFrame, recipes)).toBeGreaterThan(4);
    const coat: Coat = { base: "black", second: null, tabby: null, white: 0, pointed: false, long: false, eyes: "green" };
    const short = compose.alphaKey(catRecipe({ coat, fur: null, seed: 1 }));
    expect(compose.alphaKey(catRecipe({ coat: { ...coat, base: "orange", tabby: "mackerel", white: 2 }, fur: null, seed: 1 }))).toBe(short);
    expect(compose.alphaKey(catRecipe({ coat: { ...coat, long: true }, fur: null, seed: 1 }))).not.toBe(short);
    expect(compose.alphaKey(catRecipe({ coat, fur: null, seed: 1 }, { collar: true }))).not.toBe(short);
  });

  it("персонаж з візерунками тканини (плитки, принти, манжети): те саме", async () => {
    const { compose } = await fresh();
    const pages = new Map<string, AlphaCanvas>();
    const clothImage = (id: string, layer: string): AlphaCanvas => {
      const name = `${id}:${layer}`;
      let have = pages.get(name);
      if (!have) {
        have = image(6, 4, layerAlpha(name), name);
        pages.set(name, have);
      }
      return have;
    };
    const lookup = (id: string): ClothLayers => ({
      source: (layer) => ({ image: clothImage(id, layer) as unknown as CanvasImageSource, sx: 0, sy: 0, sw: 6, sh: 4 }),
      w: 6,
      h: 4,
      size: { w: 6, h: 4 },
      pivot: { x: 3, y: 2 },
    });
    const cloth = clothFrame(
      { k: 1, pivot: { x: 8, y: 6 }, points: { print: { x: 8, y: 5 }, cuff: { x: 3, y: 9 } }, view: "front" },
      lookup,
      (w, h) => new AlphaCanvas(w, h, "cloth", false).getContext("2d") as unknown as ClothCtx,
    );
    const recipes: TintRecipe[] = [];
    for (const top of [0, 1, 3, 5]) {
      const base: Look = { ...DEFAULT_LOOK, top, bottom: top };
      for (const stained of [false, true]) {
        recipes.push(personRecipe(base, { stained }));
        for (let p = 1; p < PATTERNS.length; p++) {
          if (patternFits(p, "top", 0)) recipes.push(personRecipe({ ...base, topPattern: p }, { stained }));
          if (patternFits(p, "bottom", 0)) recipes.push(personRecipe({ ...base, bottomPattern: p }, { stained }));
        }
      }
    }
    expect(recipes.some((r) => r.steps.some((s) => s.pattern?.kind === "print"))).toBe(true);
    // Ближня й дальня частина поруч: у групу ключа потрапляють обидві.
    expect(expectSameAlphaWithinKey(compose.alphaKey, compose.composeFrame, recipes.flatMap((r) => [r, farRecipe(r)]), { cloth })).toBeGreaterThan(4);
  });
});

// --- Живий портрет ---------------------------------------------------------------------------------

const BODY = "cat/body/normal/front" as FrameId;
const HEAD = "cat/head/base/front" as FrameId;
const POSE: readonly PortraitPart[] = [
  { id: "cat/body/normal", view: "front", far: true, x: -4, y: 0 },
  { id: "cat/body/normal", view: "front", x: 0, y: 0 },
  { id: "cat/head/base", view: "front", x: 6, y: -8, rot: 10 },
];
const CAT_LAYERS: readonly ArtLayer[] = ["fill", "fluff", "white-1", "shade", "ink"];

/** Кадр атласу з шарами `layers`: кожен — своє місце сторінки (`spread`) чи всі з її кута. */
function indexFrame(w: number, h: number, layers: readonly ArtLayer[] = CAT_LAYERS, spread = true): IndexFrame {
  return {
    size: { w, h },
    res: 1,
    pivot: { x: w / 2, y: h },
    trim: { x: 0, y: 0 },
    layers: Object.fromEntries(layers.map((layer, i) => [layer, { page: 0, x: spread ? (i * 7) % 24 : 0, y: spread ? (i * 5) % 24 : 0, w, h }])),
  };
}

const PAGE = image(64, 64, layerAlpha("page"));
const atlas = (): ArtIndex => ({ version: ART_INDEX_VERSION, pages: [{ file: "page-0.webp", w: 64, h: 64 }], frames: { [BODY]: indexFrame(24, 14), [HEAD]: indexFrame(14, 12) } });

/** Кольори різні, а шари поверх і множення ті самі. */
const SHORT: TintRecipe = {
  key: "short",
  steps: [
    { layer: "fill", color: 0x222222, put: "source-over" },
    { layer: "white-1", color: 0xffffff, put: "source-atop" },
    { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
    { layer: "ink", color: null, put: "source-over" },
  ],
};
const SHORT_ORANGE: TintRecipe = {
  key: "short-orange",
  steps: [
    { layer: "fill", color: 0xd98a3e, put: "source-over" },
    { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
    { layer: "ink", color: null, put: "source-over" },
  ],
};
/** Довга шерсть: `fluff` поверх — інший силует. */
const LONG: TintRecipe = { key: "long", steps: [SHORT.steps[0]!, { layer: "fluff", color: 0x222222, put: "source-over" }, ...SHORT.steps.slice(1)] };

const portrait = (): AlphaCanvas => new AlphaCanvas(80, 80, "portrait", false);
const asElement = (canvas: AlphaCanvas): HTMLCanvasElement => canvas as unknown as HTMLCanvasElement;
const picture = (canvas: AlphaCanvas): string => Array.from(canvas.alpha).join(",");

describe("живий портрет (`FigureCanvas`): спільний кеш", () => {
  beforeEach(() => vi.stubGlobal("OffscreenCanvas", FakeOffscreen));

  it("повторне відкриття картки не складає частин і не читає пікселів; малюнок той самий", async () => {
    const { compose, sources } = await fresh();
    sources.shareArtAtlas(atlas(), [PAGE as unknown as CanvasImageSource]);
    const first = portrait();
    expect(new compose.FigureCanvas(asElement(first), SHORT, 0.02).draw(POSE)).toBe(true);
    expect(stats.canvases).toBeGreaterThan(0);
    expect(stats.reads).toBeGreaterThan(0);
    expect(picture(first)).not.toBe(picture(portrait()));

    resetStats();
    const again = portrait();
    expect(new compose.FigureCanvas(asElement(again), SHORT, 0.02).draw(POSE)).toBe(true);
    expect(stats).toEqual({ canvases: 0, draws: 0, reads: 0 });
    expect(picture(again)).toBe(picture(first));
  });

  it("межі намальованого — раз на кадр і силует: кіт інших кольорів складається, але пікселів не читає; довгошерстий — читає", async () => {
    const { compose, sources } = await fresh();
    sources.shareArtAtlas(atlas(), [PAGE as unknown as CanvasImageSource]);
    const first = portrait();
    new compose.FigureCanvas(asElement(first), SHORT, 0.02).draw(POSE);

    resetStats();
    const orange = portrait();
    expect(new compose.FigureCanvas(asElement(orange), SHORT_ORANGE, 0.02).draw(POSE)).toBe(true);
    expect(stats.draws).toBeGreaterThan(0);
    expect(stats.reads).toBe(0);
    // Альфа від кольору не залежить: та сама й на портреті, і місце фігури те саме.
    expect(picture(orange)).toBe(picture(first));

    resetStats();
    new compose.FigureCanvas(asElement(portrait()), LONG, 0.02).draw(POSE);
    expect(stats.reads).toBeGreaterThan(0);
  });

  it("кеш обмежений пікселями: випадає найдавніше вжите", async () => {
    const { compose, sources } = await fresh();
    const budget = compose.FIGURE_TINT_PIXELS;
    expect(budget).toBeGreaterThan(0);
    // Три кадри влазять, четвертий — уже ні.
    const side = Math.ceil(Math.sqrt(budget / 3.5));
    const ids = ["cat/a", "cat/b", "cat/c", "cat/d"] as const;
    const page = image(side, side, () => 1);
    const frames = Object.fromEntries(ids.map((id) => [`${id}/front`, indexFrame(side, side, ["fill", "ink"], false)])) as Record<FrameId, IndexFrame>;
    sources.shareArtAtlas({ version: ART_INDEX_VERSION, pages: [{ file: "big.webp", w: side, h: side }], frames }, [page as unknown as CanvasImageSource]);
    const plain: TintRecipe = { key: "plain", steps: [{ layer: "fill", color: 0x222222, put: "source-over" }, { layer: "ink", color: null, put: "source-over" }] };
    const figure = new compose.FigureCanvas(asElement(portrait()), plain, 0.02);
    const draw = (...which: (typeof ids)[number][]): number => {
      resetStats();
      for (const id of which) expect(figure.draw([{ id, view: "front" }])).toBe(true);
      return stats.canvases;
    };
    expect(draw("cat/a", "cat/b", "cat/c")).toBe(3);
    expect(draw("cat/a")).toBe(0);
    expect(draw("cat/d")).toBe(1);
    expect(draw("cat/a", "cat/c", "cat/d")).toBe(0);
    expect(draw("cat/b")).toBe(1);
  });

  it("«лише з кешу»: чого ще не складено — не складає й не малює; складене — малює одразу", async () => {
    const { compose, sources } = await fresh();
    sources.shareArtAtlas(atlas(), [PAGE as unknown as CanvasImageSource]);
    const empty = picture(portrait());
    const first = portrait();
    const figure = new compose.FigureCanvas(asElement(first), SHORT, 0.02);
    expect(figure.draw(POSE, { cachedOnly: true })).toBe(false);
    expect(stats).toEqual({ canvases: 0, draws: 0, reads: 0 });
    expect(picture(first)).toBe(empty);
    expect(figure.draw(POSE)).toBe(true);

    resetStats();
    const again = portrait();
    expect(new compose.FigureCanvas(asElement(again), SHORT, 0.02).draw(POSE, { cachedOnly: true })).toBe(true);
    expect(stats).toEqual({ canvases: 0, draws: 0, reads: 0 });
    expect(picture(again)).toBe(picture(first));
  });

  it("новий атлас (гаряча перезбірка) — частини складаються заново, старі не беруться", async () => {
    const { compose, sources } = await fresh();
    sources.shareArtAtlas(atlas(), [PAGE as unknown as CanvasImageSource]);
    new compose.FigureCanvas(asElement(portrait()), SHORT, 0.02).draw(POSE);
    sources.shareArtAtlas(atlas(), [PAGE as unknown as CanvasImageSource]);
    resetStats();
    new compose.FigureCanvas(asElement(portrait()), SHORT, 0.02).draw(POSE);
    expect(stats.canvases).toBeGreaterThan(0);
    expect(stats.reads).toBeGreaterThan(0);
  });
});
