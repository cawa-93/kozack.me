// Компонувальник шарів арту (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): складає кадр частини з окремо
// растеризованих шарів за рецептом (`recipes.ts`) — білі заливки фарбує, маски шерсті обтинає по силуету, тінь кладе
// множенням, контур поверх. Canvas2D, БЕЗ Phaser: той самий код запікає кадри в грі (`bake.ts` → CanvasTexture) і малює
// DOM-портрет у редакторі (`composePortrait`). Портрет імпортує `ui/cards.ts`, а його — тести в Node, тож тут немає
// звернень до DOM під час імпорту — лише всередині функцій.
//
// Швидкість (телефон): лише `globalCompositeOperation` і `drawImage`, без циклів по пікселях `ImageData`. Шар, який треба
// перефарбувати, проходить через одне допоміжне полотно (спільне, росте під найбільший кадр): намалювати шар → залити
// кольором `source-atop` (чи множенням) → покласти на кадр. Це 3–4 операції на шар; кадр кота — ≈ 10 кроків.

import type { Look } from "../../sim/types";
import { FACES, HAIR_STYLES } from "../palette";
import { STUB_LOOK, stubHatch, stubPixels } from "./placement";
import { personRecipe } from "./recipes";
import { artFrameState, artLayerSource, loadArtFrames, type FrameLayers } from "./sources";
import { frameId, type ArtId, type ArtLayer, type ArtPoint, type ArtSize, type ArtView, type FrameId, type TintRecipe } from "./types";

// --- Шари й полотна ----------------------------------------------------------------------------

/**
 * Один шар кадру: прямокутник `sx, sy, sw, sh` зображення (сторінки атласу) і куди він лягає на полотні кадру, пікселі:
 * за замовчуванням у (0, 0) того самого розміру. Шари атласу обрізано спільною рамкою, тож `dx, dy` — зсув обрізки
 * (`IndexFrame.trim`, у Phaser — `frame.data.spriteSourceSize`).
 */
export interface LayerImage {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx?: number;
  dy?: number;
  dw?: number;
  dh?: number;
}

/** Джерело шарів кадру: шар → його зображення, або null — шару в кадрі немає (крок рецепта пропускається). */
export type LayerSource = (layer: ArtLayer) => LayerImage | null;

/**
 * Полотно, на якому малює компонувальник: контекст звичайного полотна чи OffscreenCanvas — або будь-що з тими самими
 * властивостями й методами (тести записують виклики на фальшивому контексті).
 */
export interface Ctx2D {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  fillStyle: string | CanvasGradient | CanvasPattern;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

/** Де взяти допоміжне полотно щонайменше `w × h` (тести дають свій фальшивий контекст). */
export type ScratchFactory = (w: number, h: number) => Ctx2D | null;

export interface ComposeOptions {
  /** Розмір полотна кадру, пікселі (`size · res`). */
  w: number;
  h: number;
  /** Допоміжне полотно для перефарбування; за замовчуванням — спільне (OffscreenCanvas чи `<canvas>`). */
  scratch?: ScratchFactory;
  /** Очистити полотно перед складанням; за замовчуванням так. */
  clear?: boolean;
}

/** Колір 0xRRGGBB → `#rrggbb`. */
export function cssColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Справжній контекст 2D: звичайного полотна чи OffscreenCanvas. */
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Нове полотно 2D: OffscreenCanvas, якщо є, інакше `<canvas>`; поза браузером — null. */
export function createCtx(w: number, h: number): Canvas2D | null {
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== "undefined") {
    const ctx = new OffscreenCanvas(width, height).getContext("2d");
    if (ctx) return ctx;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d");
  }
  return null;
}

/** Спільні полотна за призначенням: ростуть під найбільший кадр і не звільняються (їх кілька, по одному на призначення). */
const pooled = new Map<string, Canvas2D>();

function pooledCtx(name: string, w: number, h: number): Canvas2D | null {
  const have = pooled.get(name);
  if (have && have.canvas.width >= w && have.canvas.height >= h) return have;
  const ctx = createCtx(Math.max(w, have?.canvas.width ?? 0), Math.max(h, have?.canvas.height ?? 0));
  if (ctx) pooled.set(name, ctx);
  return ctx;
}

const sharedScratch: ScratchFactory = (w, h) => pooledCtx("scratch", w, h);

// --- Складання кадру ---------------------------------------------------------------------------

/**
 * Скласти кадр за рецептом на полотно `target` розміру `w × h` (пікселі кадру). Кроки — по черзі знизу догори:
 * - шар без кольору (`color: null`) кладеться як є, режимом `put`;
 * - шар із кольором спершу перефарбовується на допоміжному полотні (`tint`: `source-atop` — колір по силуету шару,
 *   `multiply` — множенням, сірі місця темніші), а потім кладеться режимом `put`;
 * - `put: source-atop` — лише там, де вже намальовано (маски обтинаються по заливці);
 * - `put: multiply` — множенням і теж лише там, де вже намальовано: множення по порожньому полотну просто намалювало б шар,
 *   тож перед множенням шар обтинається по складеному (`destination-in`) — тінь і смуги не виходять за силует;
 * - `alpha` — непрозорість кроку.
 * Шари, яких немає (`layers` дає null), пропускаються. Стан контексту (`globalAlpha`, режим, перетворення) після виклику —
 * той самий, що й до нього.
 */
export function composeFrame(target: Ctx2D, layers: LayerSource, recipe: TintRecipe, opts: ComposeOptions): void {
  const w = Math.max(1, Math.round(opts.w));
  const h = Math.max(1, Math.round(opts.h));
  const clear = opts.clear ?? true;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = 1;
  target.globalCompositeOperation = "source-over";
  if (clear) target.clearRect(0, 0, w, h);
  // Полотно ще порожнє: тоді `source-atop` і множенню нема на що лягати, а першу заливку можна фарбувати просто на ньому.
  let empty = clear;
  let scratch: Ctx2D | null | undefined;
  for (const step of recipe.steps) {
    const alpha = step.alpha ?? 1;
    if (alpha <= 0) continue;
    if (empty && step.put !== "source-over") continue;
    const src = layers(step.layer);
    if (!src) continue;
    if (step.color === null && step.put !== "multiply") {
      // Як є: контур, деталі, накладки.
      target.globalCompositeOperation = step.put;
      target.globalAlpha = alpha;
      drawLayer(target, src, w, h);
    } else if (empty && step.color !== null && alpha === 1 && (step.tint ?? "source-atop") === "source-atop") {
      // Перша заливка: намалювати й перефарбувати просто на кадрі, без допоміжного полотна.
      target.globalCompositeOperation = "source-over";
      target.globalAlpha = 1;
      drawLayer(target, src, w, h);
      target.globalCompositeOperation = "source-atop";
      target.fillStyle = cssColor(step.color);
      target.fillRect(0, 0, w, h);
    } else {
      scratch ??= (opts.scratch ?? sharedScratch)(w, h);
      if (!scratch) {
        // Поза браузером без допоміжного полотна: хоч шар як є.
        target.globalCompositeOperation = step.put;
        target.globalAlpha = alpha;
        drawLayer(target, src, w, h);
      } else {
        const s = scratch;
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.globalAlpha = 1;
        s.globalCompositeOperation = "source-over";
        s.clearRect(0, 0, w, h);
        drawLayer(s, src, w, h);
        if (step.color !== null) {
          s.fillStyle = cssColor(step.color);
          if ((step.tint ?? "source-atop") === "source-atop") {
            s.globalCompositeOperation = "source-atop";
            s.fillRect(0, 0, w, h);
          } else {
            // Множення по прозорому дало б сам колір: після заливки повернути шарові його прозорість.
            s.globalCompositeOperation = "multiply";
            s.fillRect(0, 0, w, h);
            s.globalCompositeOperation = "destination-in";
            drawLayer(s, src, w, h);
          }
        }
        if (step.put === "multiply") {
          s.globalCompositeOperation = "destination-in";
          s.drawImage(target.canvas, 0, 0, w, h, 0, 0, w, h);
        }
        target.globalCompositeOperation = step.put;
        target.globalAlpha = alpha;
        target.drawImage(s.canvas, 0, 0, w, h, 0, 0, w, h);
      }
    }
    empty = false;
  }
  target.restore();
}

function drawLayer(ctx: Ctx2D, src: LayerImage, w: number, h: number): void {
  if (src.sw <= 0 || src.sh <= 0) return;
  const dx = src.dx ?? 0;
  const dy = src.dy ?? 0;
  const dw = src.dw ?? src.sw;
  const dh = src.dh ?? src.sh;
  if (dx >= w || dy >= h || dx + dw <= 0 || dy + dh <= 0) return;
  ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, dx, dy, dw, dh);
}

// --- Заглушки ------------------------------------------------------------------------------------

/** Розмір і pivot кадру, одиниці арту. */
export interface StubGeometry {
  size: ArtSize;
  pivot: ArtPoint;
}

/** Шари заглушки: джерело, розмір полотна кадру в пікселях і пікселів на одиницю арту. */
export interface StubLayers {
  source: LayerSource;
  w: number;
  h: number;
  /** Пікселів полотна на одиницю арту. */
  k: number;
}

/** Сірий тіні заглушки (кладеться множенням). */
const STUB_SHADE = "#c9bfc6";

/**
 * Шари заглушки для частини, якої ще немає в атласі: силует-заглушка (заокруглений прямокутник розміру й pivot запису) і
 * синтетичні маски — смуги табі, черепахові плями, білі плями, «кінчики» колорпойнта, пасма, тінь, а контуром — маджентова
 * штриховка заглушки (`STUB_LOOK`). Тож навіть до появи арту в грі й галереї видно, що рецепт працює: заглушка кожного
 * кота — своїх кольорів і візерунків. Частини персонажа — заливкою своєї ділянки (голова — шкіра, торс — верх…). Поза
 * браузером — null.
 */
export function stubLayers(id: string, geometry: StubGeometry): StubLayers | null {
  const px = stubPixels(geometry.size);
  const k = px.w / geometry.size.w;
  const pivot = { x: geometry.pivot.x * k, y: geometry.pivot.y * (px.h / geometry.size.h) };
  const key = `${stubKind(id)}:${px.w}x${px.h}@${Math.round(pivot.x)},${Math.round(pivot.y)}`;
  let sheet = stubSheets.get(key);
  if (!sheet) {
    const made = drawStubSheet(stubKind(id), px, k, pivot);
    if (!made) return null;
    sheet = made;
    stubSheets.set(key, sheet);
    // Заглушок небагато (розмір × вид частини), але про всяк випадок — не більше кількох десятків.
    if (stubSheets.size > STUB_SHEETS_MAX) stubSheets.delete(stubSheets.keys().next().value ?? key);
  }
  const { ctx, cells } = sheet;
  const source: LayerSource = (layer) => {
    const i = cells.get(layer);
    if (i === undefined) return null;
    return { image: ctx.canvas, sx: (i % STUB_COLUMNS) * px.w, sy: Math.floor(i / STUB_COLUMNS) * px.h, sw: px.w, sh: px.h };
  };
  return { source, w: px.w, h: px.h, k };
}

const STUB_COLUMNS = 6;
const STUB_SHEETS_MAX = 48;

interface StubSheet {
  ctx: Canvas2D;
  /** Шар → номер клітинки на аркуші. */
  cells: Map<ArtLayer, number>;
}
const stubSheets = new Map<string, StubSheet>();

/** Вид заглушки: кіт, очі кота чи ділянка персонажа. */
type StubKind = "cat" | "cat-eyes" | "person-skin" | "person-hair" | "person-top" | "person-arm" | "person-bottom" | "person-shoes" | "person-eyes" | "plain";

function stubKind(id: string): StubKind {
  if (id.startsWith("cat/")) return id.startsWith("cat/eyes") ? "cat-eyes" : "cat";
  if (!id.startsWith("person/")) return "plain";
  const part = id.split("/")[1] ?? "";
  if (part === "eyes") return "person-eyes";
  if (part.startsWith("hair")) return "person-hair";
  if (part === "torso") return "person-top";
  if (part === "arm") return "person-arm";
  if (part === "leg") return "person-bottom";
  if (part === "shoe") return "person-shoes";
  return "person-skin";
}

/** Синтетичні шари заглушки — на одному аркуші, по клітинці на шар. */
function drawStubSheet(kind: StubKind, px: ArtSize, k: number, pivot: ArtPoint): StubSheet | null {
  const layers = stubLayerList(kind);
  const rows = Math.ceil(layers.length / STUB_COLUMNS);
  const ctx = createCtx(px.w * Math.min(STUB_COLUMNS, layers.length), px.h * rows);
  if (!ctx) return null;
  const c = ctx;
  const cells = new Map<ArtLayer, number>();
  const { w, h } = px;
  const inset = Math.max(1, STUB_LOOK.outlineWidth * k);
  const radius = Math.min(w, h) * 0.22;
  const silhouette = (): void => {
    c.beginPath();
    c.roundRect(inset, inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2), radius);
  };
  const s = Math.min(w, h);
  layers.forEach((layer, i) => {
    cells.set(layer, i);
    c.save();
    c.setTransform(1, 0, 0, 1, (i % STUB_COLUMNS) * w, Math.floor(i / STUB_COLUMNS) * h);
    c.beginPath();
    c.rect(0, 0, w, h);
    c.clip();
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#ffffff";
    drawStubLayer(c, layer, { kind, w, h, s, k, pivot, silhouette });
    c.restore();
  });
  return { ctx, cells };
}

function stubLayerList(kind: StubKind): ArtLayer[] {
  const common: ArtLayer[] = ["shade", "ink"];
  switch (kind) {
    case "cat":
    case "cat-eyes":
      return [
        "fill",
        "fluff",
        "point",
        "tortie-a",
        "tortie-b",
        "tortie-c",
        "tabby-classic",
        "tabby-mackerel",
        "tabby-spotted",
        "tabby-ticked",
        "white-1",
        "white-2",
        "white-3",
        ...(kind === "cat-eyes" ? (["fill-iris"] as ArtLayer[]) : []),
        ...common,
        "fluff-ink",
      ];
    case "person-skin":
      return ["fill-skin", ...common];
    case "person-hair":
      return ["fill-hair", ...common];
    case "person-top":
      return ["fill-top", ...common];
    case "person-arm":
      return ["fill-top", "fill-skin", ...common];
    case "person-bottom":
      return ["fill-bottom", ...common];
    case "person-shoes":
      return ["fill-shoes", ...common];
    case "person-eyes":
      return ["fill-skin", "fill-iris", ...common];
    case "plain":
      return ["fill", ...common];
  }
}

interface StubCell {
  kind: StubKind;
  w: number;
  h: number;
  /** Менша сторона. */
  s: number;
  k: number;
  pivot: ArtPoint;
  silhouette(): void;
}

/** Один синтетичний шар заглушки білим (крім тіні й контуру) у клітинці `w × h`. */
function drawStubLayer(c: Canvas2D, layer: ArtLayer, cell: StubCell): void {
  const { w, h, s, k, pivot, silhouette } = cell;
  const blob = (x: number, y: number, rx: number, ry: number): void => {
    c.beginPath();
    c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    c.fill();
  };
  switch (layer) {
    case "fill":
    case "fill-skin":
    case "fill-hair":
    case "fill-top":
    case "fill-bottom":
    case "fill-shoes":
      if (layer === "fill-skin" && cell.kind === "person-arm") {
        // Рука: долоня внизу.
        c.fillRect(0, h * 0.72, w, h * 0.28);
        return;
      }
      silhouette();
      c.fill();
      return;
    case "fluff": {
      // Пасма: зубці за краєм силуету.
      const r = s * 0.09;
      for (let x = r; x < w; x += r * 1.6) {
        blob(x, r * 0.9, r, r);
        blob(x, h - r * 0.9, r, r);
      }
      for (let y = r; y < h; y += r * 1.6) {
        blob(r * 0.9, y, r, r);
        blob(w - r * 0.9, y, r, r);
      }
      return;
    }
    case "point":
      // «Кінчики»: передній (морда, праворуч), задній (хвіст) край і лапи внизу.
      c.fillRect(0, 0, w * 0.2, h);
      c.fillRect(w * 0.78, 0, w * 0.22, h);
      c.fillRect(0, h * 0.84, w, h * 0.16);
      return;
    case "tortie-a":
      blob(w * 0.3, h * 0.35, w * 0.2, h * 0.18);
      blob(w * 0.72, h * 0.7, w * 0.16, h * 0.16);
      return;
    case "tortie-b":
      blob(w * 0.62, h * 0.3, w * 0.22, h * 0.16);
      blob(w * 0.25, h * 0.72, w * 0.14, h * 0.2);
      return;
    case "tortie-c":
      blob(w * 0.5, h * 0.5, w * 0.18, h * 0.24);
      blob(w * 0.12, h * 0.2, w * 0.12, h * 0.14);
      blob(w * 0.88, h * 0.8, w * 0.12, h * 0.14);
      return;
    case "tabby-classic":
      // Мармуровий: кільця «мішені».
      c.lineWidth = Math.max(1.5, s * 0.07);
      for (let r = s * 0.12; r < Math.max(w, h); r += s * 0.2) {
        c.beginPath();
        c.ellipse(w * 0.45, h * 0.5, r * (w / s) * 0.8, r * (h / s) * 0.8, 0, 0, Math.PI * 2);
        c.stroke();
      }
      return;
    case "tabby-mackerel":
      // Смугастий: вузькі вертикальні смуги.
      for (let x = s * 0.06; x < w; x += s * 0.16) c.fillRect(x, 0, Math.max(1, s * 0.06), h);
      return;
    case "tabby-spotted":
      for (let y = s * 0.12; y < h; y += s * 0.2) {
        for (let x = s * (0.1 + ((y / (s * 0.2)) % 2) * 0.1); x < w; x += s * 0.2) blob(x, y, s * 0.045, s * 0.045);
      }
      return;
    case "tabby-ticked":
      // Тікований: дрібні короткі риски.
      for (let y = s * 0.05; y < h; y += s * 0.09) {
        for (let x = s * 0.04 + (y % (s * 0.18)) * 0.3; x < w; x += s * 0.1) c.fillRect(x, y, Math.max(1, s * 0.035), Math.max(1, s * 0.06));
      }
      return;
    case "white-1":
      // Лапки, груди й живіт — низ.
      c.fillRect(0, h * 0.7, w, h * 0.3);
      return;
    case "white-2":
      // Морда (кіт дивиться праворуч) — передній край.
      c.fillRect(w * 0.68, 0, w * 0.32, h);
      return;
    case "white-3":
      // Спина — верх.
      c.fillRect(0, 0, w, h * 0.4);
      return;
    case "fill-iris":
      blob(w * 0.35, h * 0.5, s * 0.16, s * 0.2);
      blob(w * 0.68, h * 0.5, s * 0.16, s * 0.2);
      return;
    case "shade":
      // Тінь: низ силуету (світло спереду-згори).
      c.save();
      silhouette();
      c.clip();
      c.fillStyle = STUB_SHADE;
      c.fillRect(0, h * 0.6, w, h * 0.4);
      c.restore();
      return;
    case "ink": {
      // Контур заглушки: маджентова штриховка, темна рамка силуету й кружечок у pivot.
      c.save();
      silhouette();
      c.clip();
      // Штриховка блідіша й тонша, ніж у звичайної заглушки: під нею мають читатися кольори рецепта.
      c.strokeStyle = STUB_LOOK.hatch;
      c.globalAlpha = 0.3;
      c.lineWidth = Math.max(1, STUB_LOOK.hatchWidth * k * 0.6);
      c.beginPath();
      for (const line of stubHatch(w, h, Math.max(4, STUB_LOOK.hatchStep * k))) {
        c.moveTo(line.x0, line.y0);
        c.lineTo(line.x1, line.y1);
      }
      c.stroke();
      c.restore();
      c.strokeStyle = STUB_LOOK.outline;
      c.lineWidth = Math.max(1, STUB_LOOK.outlineWidth * k);
      silhouette();
      c.stroke();
      c.beginPath();
      c.arc(pivot.x, pivot.y, Math.max(2, STUB_LOOK.pivotRadius * k), 0, Math.PI * 2);
      c.fillStyle = STUB_LOOK.pivotFill;
      c.fill();
      c.stroke();
      return;
    }
    case "fluff-ink": {
      c.strokeStyle = STUB_LOOK.outline;
      c.lineWidth = Math.max(1, k);
      const r = s * 0.09;
      for (let x = r; x < w; x += r * 1.6) {
        c.beginPath();
        c.arc(x, r * 0.9, r, Math.PI, Math.PI * 2);
        c.stroke();
      }
      return;
    }
    default:
      return;
  }
}

// --- Портрет -------------------------------------------------------------------------------------

/** Частина портрета: запис маніфесту, стан, ракурс і де стоїть її pivot. */
export interface PortraitPart {
  id: ArtId;
  /** Стан кадру (`open` для очей); не задано — без стану. */
  state?: string | null;
  /** Ракурс; за замовчуванням `front`. */
  view?: ArtView | null;
  /** Де pivot частини: одиниці арту від точки фігури (вісь y донизу); за замовчуванням (0, 0). */
  x?: number;
  y?: number;
  /** Поворот, градуси за годинниковою стрілкою, і масштаб — як у кістки скелета у вихідній позі. */
  rot?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface PortraitOptions {
  /**
   * Частини знизу догори; за замовчуванням — голова (`portraitHead`), усі частини з pivot у тій самій точці. Для фігури
   * на весь зріст (як теперішній портрет) — частини скелета персонажа з місцями слотів його вихідної пози `front`.
   */
  parts?: readonly PortraitPart[];
  /** Плями на одязі (`extra-stain`). */
  stained?: boolean;
  /** Поле навколо фігури, частка меншої сторони полотна; за замовчуванням 0.06. */
  padding?: number;
  /** Як вирівняти фігуру: посередині (голова) чи знизу, на підлозі (фігура на весь зріст); за замовчуванням посередині. */
  align?: "center" | "bottom";
  /**
   * Атлас ще вантажиться: що зробити, коли він буде готовий (зазвичай — перемалювати). Для кожного полотна діє лише
   * останній переданий виклик, тож перемальовування на кожен рух повзунка не накопичує їх.
   */
  onReady?: () => void;
}

/** Голова персонажа для портрета: потилиця волосся, обличчя, очі, чубчик — з вигляду `Look`, ракурс `front`. */
export function portraitHead(look: Look): PortraitPart[] {
  const face = wrap(look.face, FACES.length);
  const hair = wrap(look.hair, HAIR_STYLES.length);
  return [
    { id: `person/hair-back/${hair}` },
    { id: `person/head/${face}` },
    { id: "person/eyes", state: "open" },
    { id: `person/hair-front/${hair}` },
  ];
}

const portraitWaiters = new WeakMap<object, () => void>();

/**
 * Намалювати портрет персонажа з кадрів атласу (`sources.ts`, без Phaser) на полотно `canvas` (його пікселі — як є, з
 * урахуванням devicePixelRatio того, хто його створив): частини тонуються тим самим рецептом, що й у грі (`personRecipe`),
 * і вписуються в полотно. Повертає false, якщо намалювати не вдалося — атласу немає, у ньому ще немає цих частин (лише
 * заглушки) чи він ще вантажиться (тоді, коли завантажиться, кличе `onReady`), — і тоді полотно не змінюється: той, хто
 * кличе, малює запасний портрет.
 */
export function composePortrait(canvas: HTMLCanvasElement | OffscreenCanvas, look: Look, opts: PortraitOptions = {}): boolean {
  const parts = opts.parts ?? portraitHead(look);
  const frames: FrameId[] = parts.map((p) => frameId(p.id, p.state ?? null, p.view === undefined ? "front" : p.view));
  const state = artFrameState(frames);
  if (state === "missing") return false;
  if (state === "loading") {
    if (opts.onReady) {
      const onReady = opts.onReady;
      portraitWaiters.set(canvas, onReady);
      void loadArtFrames(frames).then((ok) => {
        if (ok && portraitWaiters.get(canvas) === onReady) {
          portraitWaiters.delete(canvas);
          onReady();
        }
      });
    } else void loadArtFrames(frames);
    return false;
  }
  const ctx = canvas.getContext("2d") as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) | null;
  if (!ctx) return false;
  const placed: { part: PortraitPart; source: FrameLayers }[] = [];
  for (const [i, part] of parts.entries()) {
    const source = artLayerSource(frames[i] ?? part.id);
    if (!source) return false;
    placed.push({ part, source });
  }

  // Межі фігури в одиницях арту: полотно кожної частини навколо її pivot, з поворотом і масштабом.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const drawn = placed.map(({ part, source }) => {
    const { size, pivot } = source.frame;
    const m = partMatrix(part, pivot);
    for (const [cx, cy] of [
      [0, 0],
      [size.w, 0],
      [0, size.h],
      [size.w, size.h],
    ] as const) {
      const x = m.a * cx + m.c * cy + m.e;
      const y = m.b * cx + m.d * cy + m.f;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { source, m };
  });
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.min(W, H) * (opts.padding ?? 0.06);
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const k = Math.max(0, Math.min((W - pad * 2) / bw, (H - pad * 2) / bh));
  const ox = (W - bw * k) / 2 - minX * k;
  const oy = (opts.align === "bottom" ? H - pad - bh * k : (H - bh * k) / 2) - minY * k;

  const recipe = personRecipe(look, opts.stained ? { stained: true } : {});
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const { source, m } of drawn) {
    const part = pooledCtx("portrait-part", source.w, source.h);
    if (!part) continue;
    composeFrame(part, source.source, recipe, { w: source.w, h: source.h });
    // Пікселі кадру → одиниці арту (÷ res) → місце частини → полотно портрета.
    const sx = source.frame.size.w / source.w;
    const sy = source.frame.size.h / source.h;
    ctx.setTransform(m.a * k * sx, m.b * k * sx, m.c * k * sy, m.d * k * sy, m.e * k + ox, m.f * k + oy);
    ctx.drawImage(part.canvas, 0, 0, source.w, source.h, 0, 0, source.w, source.h);
  }
  ctx.restore();
  return true;
}

/** Перетворення полотна частини (одиниці арту від лівого верхнього кута) у простір фігури: pivot → (x, y), поворот, масштаб. */
function partMatrix(part: PortraitPart, pivot: ArtPoint): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const rad = ((part.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = part.scaleX ?? 1;
  const sy = part.scaleY ?? 1;
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return { a, b, c, d, e: (part.x ?? 0) - (a * pivot.x + c * pivot.y), f: (part.y ?? 0) - (b * pivot.x + d * pivot.y) };
}

function wrap(i: number, n: number): number {
  return ((Math.trunc(i) % n) + n) % n;
}
