// Кадри арту в Phaser (крок 16, GRAPHICS_PLAN.md: «Шов хвилі 1»): частини світу, скелети й галерея ставлять кадр за id
// запису маніфесту — і однаково працюють, чи є вже атлас, чи ні: кадру, якого немає, відповідає заглушка в рантаймі.
//
// Контракт із PreloadScene (конвеєр, F2):
// - атлас — одна текстура Phaser з ключем `ART_TEXTURE`, кожна сторінка `index.json` — її джерело з тим самим номером;
// - кожен шар кожного кадру — кадр текстури з назвою `layerFrameName(frameId(id, стан, ракурс), шар)` (без шарів — `all`,
//   тобто сама назва кадру), вирізаний зі сторінки (`texture.add(назва, сторінка, x, y, w, h)`) і з обрізкою
//   (`frame.setTrim(size.w · res, size.h · res, trim.x, trim.y, w, h)`), так що `realWidth × realHeight` кадру —
//   повне полотно запису в пікселях атласу;
// - pivot і точки кріплення беруться з маніфесту (`artEntry`), не з атласу;
// - коли атлас завантажено (чи з'ясувалося, що його немає), сцена кличе `markArtReady`.
//
// Кадр, якого в текстурі немає (конвеєра ще немає, SVG ще немає, `index.json` немає), — заглушка потрібного розміру й
// pivot (`STUB_LOOK`): згенерована й закешована текстура з ключем `ART_STUB_PREFIX…`. Так код інтегрується до появи арту.

import Phaser from "phaser";

import { artEntry, DEFAULT_RES } from "./manifest";
import {
  artGeometry,
  artPlacement,
  frameNameFor,
  stubHatch,
  stubPixels,
  STUB_LOOK,
  type ArtFallback,
  type ArtFrameOptions,
  type ArtGeometry,
  type ArtPlacement,
} from "./placement";
import { ART_TEXTURE, type ArtId, type ArtSize } from "./types";

export type { ArtFallback, ArtFrameOptions } from "./placement";

/** Куди покласти зображення: шар світу, контейнер (скелет) чи сама сцена (null). */
export type ArtParent = Phaser.GameObjects.Layer | Phaser.GameObjects.Container | null;

export interface AddArtOptions extends ArtFrameOptions {
  /** Розмір і pivot, якщо запису в маніфесті немає (інакше — з самого кадру атласу чи 64 × 64 з pivot посередині). */
  fallback?: ArtFallback | undefined;
}

/** Початок ключа текстур-заглушок: за ним галерея відрізняє заглушку від намальованого. */
export const ART_STUB_PREFIX = "art-stub:";

/** Атрибут `<html data-art>`: «ready» — атлас завантажено, «none» — атласу немає (самі заглушки). */
export const ART_READY_ATTR = "art";

/**
 * Назва кадру Phaser для запису: стан і ракурс, яких не задано, — перші з маніфесту, шар — `all` (див. `frameNameFor`).
 */
export function artFrameName(id: ArtId, opts?: ArtFrameOptions): string {
  return frameNameFor(id, artEntry(id), opts);
}

/** Чи є кадр із такою назвою в атласі. */
export function hasArtFrame(scene: Phaser.Scene, name: string): boolean {
  const textures = scene.textures;
  return textures.exists(ART_TEXTURE) && textures.get(ART_TEXTURE).has(name);
}

/**
 * Зображення кадру запису `id` у точці (0, 0) батька: origin — у pivot, масштаб — щоб 1 одиниця арту була 1 px світу.
 * Позицію, глибину, віддзеркалення (`scaleX` зі знаком «−») і додатковий масштаб задає той, хто кличе.
 */
export function addArt(scene: Phaser.Scene, parent: ArtParent, id: ArtId, opts: AddArtOptions = {}): Phaser.GameObjects.Image {
  const look = resolve(scene, id, opts);
  const image = new Phaser.GameObjects.Image(scene, 0, 0, look.key, look.frame);
  image.setOrigin(look.placement.originX, look.placement.originY);
  image.setScale(look.placement.scaleX, look.placement.scaleY);
  placed.set(image, { id, name: look.name, stub: look.stub, baseX: look.placement.scaleX, baseY: look.placement.scaleY });
  if (parent) parent.add(image);
  else scene.add.existing(image);
  return image;
}

/**
 * Змінити кадр (запис, стан, ракурс, шар) зображення з `addArt`: origin стає в pivot нового запису, а масштаб лишається
 * тим самим відносно базового — віддзеркалення й додатковий масштаб того, хто кличе (кошеня), зберігаються. Той самий
 * кадр — нічого не робить, тож кликати можна щокадру. Зображення не з `addArt` отримує базовий масштаб.
 */
export function setArt(image: Phaser.GameObjects.Image, id: ArtId, opts: AddArtOptions = {}): Phaser.GameObjects.Image {
  const scene = image.scene as Phaser.Scene | undefined;
  if (!scene) return image;
  const prev = placed.get(image);
  if (prev && prev.id === id && prev.name === artFrameName(id, opts) && (!prev.stub || !hasArtFrame(scene, prev.name))) return image;
  const look = resolve(scene, id, opts);
  const factorX = prev ? image.scaleX / prev.baseX : 1;
  const factorY = prev ? image.scaleY / prev.baseY : 1;
  image.setTexture(look.key, look.frame);
  image.setOrigin(look.placement.originX, look.placement.originY);
  image.setScale(look.placement.scaleX * factorX, look.placement.scaleY * factorY);
  placed.set(image, { id, name: look.name, stub: look.stub, baseX: look.placement.scaleX, baseY: look.placement.scaleY });
  return image;
}

/** Чи зображення показує заглушку, а не кадр атласу. */
export function isArtStub(image: Phaser.GameObjects.Image): boolean {
  return image.texture.key.startsWith(ART_STUB_PREFIX);
}

/**
 * Позначка для скрипта знімків: атлас завантажено («ready») чи його немає («none»). Кличе PreloadScene; скрипт знімків
 * чекає `<html data-art>`, якщо в сторінці є PreloadScene.
 */
export function markArtReady(state: "ready" | "none"): void {
  document.documentElement.dataset[ART_READY_ATTR] = state;
}

// --- Усередині --------------------------------------------------------------------------------

/** Що зображення з `addArt` показує: запис, назва кадру, чи заглушка, і базовий масштаб (без масштабу того, хто кличе). */
interface Placed {
  id: ArtId;
  name: string;
  stub: boolean;
  baseX: number;
  baseY: number;
}

const placed = new WeakMap<Phaser.GameObjects.Image, Placed>();

interface Look {
  key: string;
  frame: string | undefined;
  name: string;
  stub: boolean;
  placement: ArtPlacement;
}

/** Текстура, кадр і розміщення для запису: кадр атласу, якщо він є, інакше заглушка. */
function resolve(scene: Phaser.Scene, id: ArtId, opts: AddArtOptions): Look {
  const entry = artEntry(id);
  const name = frameNameFor(id, entry, opts);
  if (hasArtFrame(scene, name)) {
    const frame = scene.textures.getFrame(ART_TEXTURE, name);
    const px = { w: frame.realWidth, h: frame.realHeight };
    const geometry = artGeometry(entry, opts.fallback, { px, res: entry?.res ?? DEFAULT_RES });
    return { key: ART_TEXTURE, frame: name, name, stub: false, placement: artPlacement(geometry, px) };
  }
  const geometry = artGeometry(entry, opts.fallback, null);
  const stub = stubTexture(scene, geometry);
  return { key: stub.key, frame: undefined, name, stub: true, placement: artPlacement(geometry, stub.px) };
}

/** Текстура-заглушка під розмір і pivot: одна на кожну пару, створюється при першій потребі. */
function stubTexture(scene: Phaser.Scene, geometry: ArtGeometry): { key: string; px: ArtSize } {
  const px = stubPixels(geometry.size);
  const kx = px.w / geometry.size.w;
  const ky = px.h / geometry.size.h;
  const pivot = { x: Math.round(geometry.pivot.x * kx), y: Math.round(geometry.pivot.y * ky) };
  const key = `${ART_STUB_PREFIX}${px.w}x${px.h}@${pivot.x},${pivot.y}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, px.w, px.h);
    if (texture) {
      drawStub(texture.getContext(), px, (kx + ky) / 2, pivot);
      texture.refresh();
    }
  }
  return { key, px };
}

/** Малює заглушку (`STUB_LOOK`) на полотні `px`; `k` — пікселів на одиницю арту. Те саме, що `stubSvg`. */
function drawStub(ctx: CanvasRenderingContext2D, px: ArtSize, k: number, pivot: { x: number; y: number }): void {
  const look = STUB_LOOK;
  ctx.clearRect(0, 0, px.w, px.h);
  ctx.globalAlpha = look.fillAlpha;
  ctx.fillStyle = look.fill;
  ctx.fillRect(0, 0, px.w, px.h);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = look.hatch;
  ctx.lineWidth = Math.max(1, look.hatchWidth * k);
  ctx.beginPath();
  for (const line of stubHatch(px.w, px.h, Math.max(4, look.hatchStep * k))) {
    ctx.moveTo(line.x0, line.y0);
    ctx.lineTo(line.x1, line.y1);
  }
  ctx.stroke();

  const outline = Math.max(1, look.outlineWidth * k);
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = outline;
  ctx.strokeRect(outline / 2, outline / 2, Math.max(0, px.w - outline), Math.max(0, px.h - outline));

  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, Math.max(2, look.pivotRadius * k), 0, Math.PI * 2);
  ctx.fillStyle = look.pivotFill;
  ctx.fill();
  ctx.stroke();
}
