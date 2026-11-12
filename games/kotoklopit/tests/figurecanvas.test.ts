// Компонувальник (`compose.ts`): допоміжне полотно того самого виду, що й ціль. Полотна тут — модель лише альфи: справжній
// `composeFrame` малює на ній, як на Canvas2D, а вона рахує альфу за правилами режимів Canvas2D і лічить полотна, малювання й
// читання пікселів.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Ctx2D, LayerSource } from "../src/view/art/compose";
import type { ArtLayer, TintRecipe } from "../src/view/art/types";

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
