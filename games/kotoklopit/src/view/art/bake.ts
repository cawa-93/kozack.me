// Запікання тонованих кадрів у Phaser (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): частина кота чи персонажа —
// це кілька білих шарів атласу, які компонувальник (`compose.ts`) складає за рецептом (`recipes.ts`) у CanvasTexture.
// CanvasTexture, а не tint: tint не діє в Canvas-режимі Phaser (`Phaser.AUTO` на старих телефонах), а полотно переживає
// втрату WebGL-контексту — Phaser сам завантажує його у відеопам'ять знову.
//
// - Ліниво: кадр запікається, коли його вперше показують (`setBakedArt`), і лише той стан і ракурс, що потрібні.
// - Кеш — за (кадр, `recipe.key`): однакові коти ділять текстури, а новий рецепт (тьмяна шерсть, залисини) — нові кадри.
// - Бюджет пам'яті на власника (кота) й загальний — `bakecache.ts` (`BAKE_BUDGET`); що показує зображення, не звільняється.
// - Кота не стало — `releaseBaked(scene, owner)`.
// - Шарів кадру в атласі немає (конвеєра чи SVG ще немає) — запікається заглушка з синтетичними шарами (`stubLayers`):
//   маджентова штриховка поверх кольорів і візерунків рецепта.

import Phaser from "phaser";

import { hasArtFrame, type ArtParent } from "./atlas";
import { BakeCache, BAKE_BUDGET, SHARED_OWNER, type BakeStats } from "./bakecache";
import { composeFrame, stubLayers, type LayerImage, type LayerSource } from "./compose";
import { artEntry, DEFAULT_RES } from "./manifest";
import { artGeometry, artPlacement, frameNameFor, type ArtFallback, type ArtGeometry, type ArtPlacement } from "./placement";
import { ART_TEXTURE, framesOf, layerFrameName, type ArtEntry, type ArtId, type ArtLayer, type ArtSize, type ArtView, type FrameId, type TintRecipe } from "./types";

export { BAKE_BUDGET, SHARED_OWNER, type BakeBudget, type BakeStats } from "./bakecache";

/** Початок ключа запечених текстур: `art-baked:<кадр>@<ключ рецепта>`. */
export const BAKED_PREFIX = "art-baked:";

export interface BakeOptions {
  /** Чий кадр (кіт — `cat:<id>`, персонаж — `person`); за замовчуванням — спільний. Бюджет пам'яті — на власника. */
  owner?: string | undefined;
  /** Розмір і pivot, якщо запису в маніфесті немає. */
  fallback?: ArtFallback | undefined;
}

export interface BakedArtOptions extends BakeOptions {
  /** Стан (`open`, `half`); не задано — перший стан запису, якщо він їх має; null — без стану. */
  state?: string | null | undefined;
  /** Ракурс; не задано — перший ракурс запису (`front`), якщо він їх має; null — без ракурсу. */
  view?: ArtView | null | undefined;
}

/** Запечений кадр: текстура, розмір її полотна, розмір і pivot кадру й чи це заглушка. */
export interface BakedFrame {
  key: string;
  px: ArtSize;
  geometry: ArtGeometry;
  stub: boolean;
}

/**
 * Запекти кадр `frame` (`frameId(id, стан, ракурс)`) за рецептом — або взяти вже запечений — і повернути ключ CanvasTexture.
 * Ключ дійсний, доки кадр не звільнив бюджет, тож показувати його варто через `addBakedArt` / `setBakedArt`: кадр, який
 * показує зображення, не звільняється.
 */
export function bakeFrame(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe, opts: BakeOptions = {}): string {
  return bake(scene, frame, recipe, opts).key;
}

/** Що відомо про запечений кадр (розмір полотна, pivot); undefined — такого немає. */
export function bakedFrame(scene: Phaser.Scene, key: string): BakedFrame | undefined {
  return bakerOf(scene.game).cache.peek(key);
}

/** Як поставити запечений кадр: origin у pivot, масштаб — щоб 1 одиниця арту була 1 px світу (як `addArt`). */
export function bakedPlacement(baked: BakedFrame): ArtPlacement {
  return artPlacement(baked.geometry, baked.px);
}

/**
 * Зображення запеченого кадру запису `id` у точці (0, 0) батька: origin — у pivot, масштаб — 1 одиниця арту = 1 px світу.
 * Позицію, глибину, віддзеркалення (`scaleX` зі знаком «−») і додатковий масштаб задає той, хто кличе.
 */
export function addBakedArt(scene: Phaser.Scene, parent: ArtParent, id: ArtId, recipe: TintRecipe, opts: BakedArtOptions = {}): Phaser.GameObjects.Image {
  const baked = bake(scene, bakedFrameId(id, opts), recipe, opts);
  const image = new Phaser.GameObjects.Image(scene, 0, 0, baked.key);
  show(image, baked, null);
  if (parent) parent.add(image);
  else scene.add.existing(image);
  return image;
}

/**
 * Показати на зображенні запечений кадр (запис, стан, ракурс, рецепт): origin стає в pivot, а масштаб лишається тим самим
 * відносно базового — віддзеркалення й масштаб того, хто кличе (кошеня), зберігаються. Той самий кадр із тим самим
 * рецептом — лише позначка «користувалися» для бюджету, тож кликати можна щокадру.
 */
export function setBakedArt(image: Phaser.GameObjects.Image, id: ArtId, recipe: TintRecipe, opts: BakedArtOptions = {}): Phaser.GameObjects.Image {
  const scene = image.scene as Phaser.Scene | undefined;
  if (!scene) return image;
  const baked = bake(scene, bakedFrameId(id, opts), recipe, opts);
  const prev = shown.get(image);
  if (prev && prev.key === baked.key && image.texture.key === baked.key) return image;
  show(image, baked, prev);
  return image;
}

/** Звільнити запечені кадри власника (кота не стало) чи всіх (без `owner`); що зараз показують — коли перестануть. */
export function releaseBaked(scene: Phaser.Scene, owner?: string): void {
  const baker = bakers.get(scene.game);
  if (!baker) return;
  if (owner === undefined) baker.cache.dropAll();
  else baker.cache.dropOwner(owner);
}

/** Скільки запечено (галерея, перевірка продуктивності). */
export function bakeStats(scene: Phaser.Scene): BakeStats {
  return bakers.get(scene.game)?.cache.stats() ?? { frames: 0, pixels: 0, owners: 0, shown: 0 };
}

/** Чи зображення показує запечений кадр-заглушку (шарів у атласі немає). */
export function isBakedStub(image: Phaser.GameObjects.Image): boolean {
  return shown.get(image)?.stub ?? false;
}

/** Власник для кота: `cat:<id>`. */
export function catOwner(catId: number): string {
  return `cat:${catId}`;
}

// --- Усередині --------------------------------------------------------------------------------

interface Baker {
  cache: BakeCache<BakedFrame>;
}

/** Кеш запечених кадрів на гру: текстури належать менеджерові текстур гри, а не сцені. */
const bakers = new WeakMap<Phaser.Game, Baker>();

function bakerOf(game: Phaser.Game): Baker {
  let baker = bakers.get(game);
  if (!baker) {
    const cache = new BakeCache<BakedFrame>((key) => {
      if (game.textures.exists(key)) game.textures.remove(key);
    }, BAKE_BUDGET);
    baker = { cache };
    bakers.set(game, baker);
    // Гру знищено — разом із текстурами.
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      cache.forget();
      bakers.delete(game);
    });
  }
  return baker;
}

function bake(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe, opts: BakeOptions): BakedFrame {
  const baker = bakerOf(scene.game);
  const key = `${BAKED_PREFIX}${frame}@${recipe.key}`;
  const owner = opts.owner ?? SHARED_OWNER;
  // Текстуру могли прибрати повз кеш (`textures.remove`): тоді запекти знову.
  if (baker.cache.peek(key) && !scene.textures.exists(key)) baker.cache.forgetKey(key);
  return baker.cache.use(owner, key, recipe.key, () => {
    const baked = make(scene, frame, recipe, key, opts.fallback);
    return { value: baked, pixels: baked.px.w * baked.px.h };
  });
}

/** Запекти кадр: шари з атласу, а якщо їх немає — синтетичні шари заглушки. */
function make(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe, key: string, fallback: ArtFallback | undefined): BakedFrame {
  const found = resolveFrame(frame);
  const atlas = atlasLayers(scene, frame, recipe);
  let px: ArtSize;
  let geometry: ArtGeometry;
  let layers: LayerSource;
  let stub = false;
  if (atlas) {
    px = atlas.px;
    geometry = artGeometry(found?.entry, fallback, { px, res: found?.entry.res ?? DEFAULT_RES });
    layers = atlas.source;
  } else {
    geometry = artGeometry(found?.entry, fallback, null);
    const synthetic = stubLayers(found?.id ?? frame, geometry);
    px = synthetic ? { w: synthetic.w, h: synthetic.h } : { w: 1, h: 1 };
    layers = synthetic?.source ?? (() => null);
    stub = true;
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, px.w, px.h);
  if (texture) {
    composeFrame(texture.getContext(), layers, recipe, { w: px.w, h: px.h });
    texture.refresh();
  }
  return { key, px, geometry, stub };
}

/**
 * Шари кадру з атласу (`ART_TEXTURE`, кадри `<кадр>#<шар>` з обрізкою, див. `atlas.ts`): кожен крок рецепта — свій кадр
 * текстури. Жодного шару немає — null (заглушка). Кадр, позначений конвеєром як заглушка (`customData.stub`), — теж.
 */
function atlasLayers(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe): { source: LayerSource; px: ArtSize } | null {
  const found = new Map<ArtLayer, LayerImage>();
  let px: ArtSize | null = null;
  for (const { layer } of recipe.steps) {
    if (found.has(layer)) continue;
    const name = layerFrameName(frame, layer);
    if (!hasArtFrame(scene, name)) continue;
    const f = scene.textures.getFrame(ART_TEXTURE, name);
    const image = f.source.image as CanvasImageSource | null;
    if (!image || (f.customData as { stub?: unknown }).stub === true) continue;
    px ??= { w: Math.round(f.realWidth), h: Math.round(f.realHeight) };
    // Обрізка: кадр лежить на полотні кадру зі зсувом (`setTrim` → `x`, `y`).
    found.set(layer, { image, sx: f.cutX, sy: f.cutY, sw: f.cutWidth, sh: f.cutHeight, dx: f.x, dy: f.y });
  }
  if (!px || found.size === 0) return null;
  return { source: (layer) => found.get(layer) ?? null, px };
}

/** Запис маніфесту для кадру: id запису — кадр без стану й ракурсу (кадри всіх записів різні, тож збіг один). */
function resolveFrame(frame: FrameId): { id: ArtId; entry: ArtEntry } | null {
  const cached = resolved.get(frame);
  if (cached !== undefined) return cached;
  const segments = frame.split("/");
  let result: { id: ArtId; entry: ArtEntry } | null = null;
  for (let n = segments.length; n >= Math.max(2, segments.length - 2) && !result; n--) {
    const entry = artEntry(segments.slice(0, n).join("/"));
    if (entry && framesOf(entry).some((f) => f.frame === frame)) result = { id: entry.id, entry };
  }
  resolved.set(frame, result);
  return result;
}
const resolved = new Map<FrameId, { id: ArtId; entry: ArtEntry } | null>();

/** Кадр запису для зображення: стан і ракурс, яких не задано, — перші з маніфесту. */
function bakedFrameId(id: ArtId, opts: BakedArtOptions): FrameId {
  return frameNameFor(id, artEntry(id), { state: opts.state, view: opts.view, layer: "all" }) as FrameId;
}

/** Що показує зображення: ключ запеченого кадру, чи заглушка, і базовий масштаб (без масштабу того, хто кличе). */
interface Shown {
  key: string;
  stub: boolean;
  baseX: number;
  baseY: number;
}
const shown = new WeakMap<Phaser.GameObjects.Image, Shown>();

function show(image: Phaser.GameObjects.Image, baked: BakedFrame, prev: Shown | null | undefined): void {
  const baker = bakerOf(image.scene.game);
  const placement = bakedPlacement(baked);
  const factorX = prev ? image.scaleX / prev.baseX : 1;
  const factorY = prev ? image.scaleY / prev.baseY : 1;
  image.setTexture(baked.key);
  image.setOrigin(placement.originX, placement.originY);
  image.setScale(placement.scaleX * factorX, placement.scaleY * factorY);
  baker.cache.retain(baked.key);
  if (prev) baker.cache.release(prev.key);
  else {
    // Зображення знищено — кадр більше не показують.
    image.once(Phaser.GameObjects.Events.DESTROY, () => {
      const last = shown.get(image);
      shown.delete(image);
      if (last) baker.cache.release(last.key);
    });
  }
  shown.set(image, { key: baked.key, stub: baked.stub, baseX: placement.scaleX, baseY: placement.scaleY });
}
