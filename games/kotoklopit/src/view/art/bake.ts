// Запікання тонованих кадрів у Phaser: частина кота чи персонажа — це кілька білих шарів атласу, які компонувальник
// (`compose.ts`) складає за рецептом (`recipes.ts`) на полотні, а воно стає текстурою. Полотно, а не tint: tint не діє в
// Canvas-режимі Phaser (`Phaser.AUTO` на старих телефонах), а полотно переживає втрату WebGL-контексту — Phaser сам
// завантажує його у відеопам'ять знову.
//
// Персонаж запікається так само, як кіт, хоч зовнішність у нього одна: рецептів усе одно кілька (плями на одязі, дальні
// частини), шари потрібні котам, портрету й галереї, а готові кадри додали б байтів атласу й другий шлях показу заради
// кількох десятків мілісекунд за гру.
//
// - Ліниво: кадр запікається, коли його вперше показують (`setBakedArt`), і лише той стан і ракурс, що потрібні.
// - Кеш — за (кадр, `recipe.key`): однакові коти ділять текстури, а новий рецепт (тьмяна шерсть, залисини) — нові кадри.
// - Бюджет пам'яті на власника (кота) й загальний — `bakecache.ts` (`BAKE_BUDGET`); що показує зображення, не звільняється.
// - Кота не стало — `releaseBaked(scene, owner)`.
// - Бюджет запікань на кадр гри (`BAKES_PER_FRAME`, `bakesThisFrame`, `isBakedArt`): скелет, якому бракує кадрів понад
//   нього, ще кадр-другий показує попередню позу (`rigsprite.ts`); інший ракурс запікається наперед у вільний час
//   (`prebakeArt`), тож поворот кота зазвичай нічого не запікає.
// - Текстура запеченого кадру — лише рамка вмісту кадру (`bakeframe.ts`), а не все полотно: розміщення (`bakedPlacement`,
//   `bakedOrigin`, `bakedCrop`) рахує від початку рамки.
// - Шари — зі сторінок атласу (`sources.ts`), а не з кадрів текстури Phaser: сторінок компонувальника в ній немає.
// - Шарів кадру в атласі немає (конвеєра чи SVG ще немає) — запікається заглушка з синтетичними шарами (`stubLayers`):
//   маджентова штриховка поверх кольорів і візерунків рецепта.

import Phaser from "phaser";

import type { ArtParent } from "./atlas";
import { bakeLayers } from "./bakeframe";
import { BakeCache, BAKE_BUDGET, BAKE_MS_GUESS, frameLeft, idleFits, nextBakeMs, SHARED_OWNER, type BakeStats } from "./bakecache";
import { clothFrame, clothIds, type ClothLayers } from "./cloth";
import { composeFrame, createCtx, stubLayers, type LayerSource } from "./compose";
import { artEntry, DEFAULT_RES } from "./manifest";
import { partExtraFrame } from "../wardrobe/index";
import { artGeometry, boxCrop, boxOrigin, boxPlacement, frameNameFor, type ArtFallback, type ArtGeometry, type ArtPlacement } from "./placement";
import { artLayerSource } from "./sources";
import { framesOf, type ArtEntry, type ArtId, type ArtPoint, type ArtSize, type ArtView, type FrameBox, type FrameId, type TintRecipe } from "./types";

export { BAKE_BUDGET, BAKES_PER_FRAME, mayBakeNow, SHARED_OWNER, type BakeBudget, type BakeStats } from "./bakecache";

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

/**
 * Запечений кадр: текстура, розмір її полотна, розмір і pivot кадру й чи це заглушка. Текстура — рамка вмісту `box` полотна
 * кадру `canvas`, тож пікселі текстури — не пікселі кадру: місце, масштаб і обтинання — `bakedPlacement`, `bakedOrigin`,
 * `bakedCrop`.
 */
export interface BakedFrame {
  key: string;
  /** Розмір текстури, пікселі: розмір рамки. */
  px: ArtSize;
  /** Розмір і pivot усього кадру, одиниці арту. */
  geometry: ArtGeometry;
  /** Усе полотно кадру, пікселі, і рамка вмісту в ньому, яка стала текстурою (у заглушки — усе полотно). */
  canvas: ArtSize;
  box: FrameBox;
  stub: boolean;
}

/** Що відомо про запечений кадр (розмір полотна, pivot); undefined — такого немає. */
export function bakedFrame(scene: Phaser.Scene, key: string): BakedFrame | undefined {
  return bakerOf(scene.game).cache.peek(key);
}

/** Як поставити запечений кадр: origin у pivot, масштаб — щоб 1 одиниця арту була 1 px світу (як `addArt`). */
export function bakedPlacement(baked: BakedFrame): ArtPlacement {
  return boxPlacement(baked.geometry, baked.canvas, baked.box);
}

/** Origin зображення запеченого кадру, щоб у точці зображення стояла точка кадру `point` (одиниці арту), а не pivot. */
export function bakedOrigin(baked: BakedFrame, point: ArtPoint): ArtPoint {
  return boxOrigin(baked.geometry, baked.canvas, baked.box, point);
}

/** Прямокутник кадру `rect` (одиниці арту) у пікселях текстури запеченого кадру — для `Image.setCrop`. */
export function bakedCrop(baked: BakedFrame, rect: FrameBox): FrameBox {
  const kx = baked.canvas.w / baked.geometry.size.w;
  const ky = baked.canvas.h / baked.geometry.size.h;
  return boxCrop(baked.box, { x: rect.x * kx, y: rect.y * ky, w: rect.w * kx, h: rect.h * ky });
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
  // Що ще чекало запікання наперед, — теж: інакше воно запекло б кадри власникові, якого вже немає.
  for (const [key, job] of baker.queue) if (owner === undefined || job.owner === owner) baker.queue.delete(key);
  if (owner === undefined) baker.cache.dropAll();
  else baker.cache.dropOwner(owner);
}

/** Скільки кадрів запечено цього кадру гри (`BAKES_PER_FRAME`). */
export function bakesThisFrame(scene: Phaser.Scene): number {
  const baker = bakers.get(scene.game);
  return baker && baker.frame === scene.game.loop.frame ? baker.baked : 0;
}

/** Чи кадр запису `id` (стан, ракурс) за рецептом уже запечено: показати його нічого не коштує. */
export function isBakedArt(scene: Phaser.Scene, id: ArtId, recipe: TintRecipe, opts: BakedArtOptions = {}): boolean {
  const baker = bakers.get(scene.game);
  if (!baker) return false;
  const key = bakedKey(bakedFrameId(id, opts), recipe);
  return baker.cache.peek(key) !== undefined && scene.textures.exists(key);
}

/**
 * Запекти кадр наперед, у вільний час між кадрами гри (`requestIdleCallback`): скелет просить так кадри іншого ракурсу
 * того, що зараз показує, — коли кіт обернеться, вони вже будуть. Уже запечене чи вже в черзі — нічого не робить.
 */
export function prebakeArt(scene: Phaser.Scene, id: ArtId, recipe: TintRecipe, opts: BakedArtOptions = {}): void {
  const baker = bakerOf(scene.game);
  const frame = bakedFrameId(id, opts);
  const key = bakedKey(frame, recipe);
  if (baker.queue.has(key) || baker.cache.peek(key) !== undefined) return;
  if (baker.queue.size >= PREBAKE_QUEUE) return;
  baker.queue.set(key, { scene, frame, recipe, owner: opts.owner ?? SHARED_OWNER, fallback: opts.fallback });
  scheduleIdle(baker);
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
  /** Кадр гри (`game.loop.frame`), у якому запікали востаннє, і скільки кадрів запекли в ньому. */
  frame: number;
  baked: number;
  /** Черга запікання наперед (`prebakeArt`) за ключем текстури. */
  queue: Map<string, Prebake>;
  /** Чи вже попрошено вільного часу для черги. */
  idle: boolean;
  /** Скільки триває запікання на цьому пристрої, мс (ковзне середнє, `nextBakeMs`). */
  bakeMs: number;
  /** Гра: її кадр (`loop.now`) — вільний час без `requestIdleCallback`. */
  game: Phaser.Game;
}

/** Кадр, що чекає запікання наперед. */
interface Prebake {
  scene: Phaser.Scene;
  frame: FrameId;
  recipe: TintRecipe;
  owner: string;
  fallback: ArtFallback | undefined;
}

/** Найдовша черга запікання наперед: 22 коти × ≈ 10 частин іншого ракурсу — з запасом. */
const PREBAKE_QUEUE = 512;
/** Без `requestIdleCallback` (Safari) — як часто перевіряти, чи до кадру гри лишилося на одне запікання (`frameLeft`). */
const TIMEOUT_MS = 50;

/** Кеш запечених кадрів на гру: текстури належать менеджерові текстур гри, а не сцені. */
const bakers = new WeakMap<Phaser.Game, Baker>();

function bakerOf(game: Phaser.Game): Baker {
  let baker = bakers.get(game);
  if (!baker) {
    const cache = new BakeCache<BakedFrame>((key) => dropTexture(game.textures, key), BAKE_BUDGET);
    const made: Baker = { cache, frame: -1, baked: 0, queue: new Map(), idle: false, bakeMs: BAKE_MS_GUESS, game };
    baker = made;
    bakers.set(game, made);
    // Гру знищено — разом із текстурами.
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      cache.forget();
      made.queue.clear();
      bakers.delete(game);
    });
  }
  return baker;
}

/** Ключ текстури запеченого кадру. */
function bakedKey(frame: FrameId, recipe: TintRecipe): string {
  return `${BAKED_PREFIX}${frame}@${recipe.key}`;
}

function bake(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe, opts: BakeOptions): BakedFrame {
  const baker = bakerOf(scene.game);
  const key = bakedKey(frame, recipe);
  const owner = opts.owner ?? SHARED_OWNER;
  // Текстуру могли прибрати повз кеш (`textures.remove`): тоді запекти знову.
  if (baker.cache.peek(key) && !scene.textures.exists(key)) baker.cache.forgetKey(key);
  // Вигляд власника — рід рецепта: ближні й дальні (`farRecipe`) частини того самого кота — один вигляд.
  return baker.cache.use(owner, key, recipe.family ?? recipe.key, () => {
    baker.queue.delete(key);
    const loop = scene.game.loop.frame;
    if (baker.frame !== loop) {
      baker.frame = loop;
      baker.baked = 0;
    }
    baker.baked++;
    const start = performance.now();
    const baked = make(scene, frame, recipe, key, opts.fallback);
    baker.bakeMs = nextBakeMs(baker.bakeMs, performance.now() - start);
    return { value: baked, pixels: baked.px.w * baked.px.h };
  });
}

/**
 * Попросити вільного часу для черги запікання наперед (раз, доки її не розібрано): запікати, доки вільного часу більше, ніж
 * триває запікання на цьому пристрої (`idleFits`). Без `requestIdleCallback` (Safari) — по одному кадру за раз і лише
 * тоді, коли до наступного кадру гри на нього лишилося часу (`frameLeft`), інакше запікання наперед само рвало б кадри.
 */
function scheduleIdle(baker: Baker): void {
  if (baker.idle || baker.queue.size === 0) return;
  baker.idle = true;
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback((deadline) => drainQueue(baker, () => idleFits(deadline.timeRemaining(), baker.bakeMs)));
  } else {
    setTimeout(() => drainQueue(baker, (baked) => baked === 0 && idleFits(frameLeft(performance.now(), baker.game.loop.now), baker.bakeMs)), TIMEOUT_MS);
  }
}

/**
 * Запікати з черги, доки є час (`more`: скільки вже запечено цього разу). Пропускає те, що вже запечене, сцену, якої вже
 * немає, і власника, чий вигляд відтоді змінився (кіт захворів, персонажа переодягли): запечене за старим рецептом скинуло
 * б кадри нового.
 */
function drainQueue(baker: Baker, more: (baked: number) => boolean): void {
  baker.idle = false;
  let baked = 0;
  for (const [key, job] of baker.queue) {
    if (!more(baked)) break;
    baker.queue.delete(key);
    const scene = job.scene;
    if (!(scene.sys as Phaser.Scenes.Systems | undefined)?.game || baker.cache.peek(key) !== undefined) continue;
    const family = job.recipe.family ?? job.recipe.key;
    const current = baker.cache.ownerRecipe(job.owner);
    if (current !== null && current !== family) continue;
    bake(scene, job.frame, job.recipe, { owner: job.owner, fallback: job.fallback });
    baked++;
  }
  scheduleIdle(baker);
}

/** Запекти кадр: шари з атласу, а якщо їх немає — синтетичні шари заглушки. */
function make(scene: Phaser.Scene, frame: FrameId, recipe: TintRecipe, key: string, fallback: ArtFallback | undefined): BakedFrame {
  const found = resolveFrame(frame);
  const atlas = bakeLayers(frame, partExtraFrame(frame) as FrameId | null, recipe);
  let canvasPx: ArtSize;
  let box: FrameBox;
  let geometry: ArtGeometry;
  let layers: LayerSource;
  let stub = false;
  if (atlas) {
    canvasPx = atlas.canvas;
    box = atlas.box;
    geometry = artGeometry(found?.entry, fallback, { px: canvasPx, res: found?.entry.res ?? DEFAULT_RES });
    layers = atlas.source;
  } else {
    geometry = artGeometry(found?.entry, fallback, null);
    // Продакшн без атласу гри не показує («Гра не завантажилася»), тож малювання заглушок у його збірку не йде: кадр, якого
    // чомусь немає, там порожній.
    const synthetic = __DEV_TOOLS__ ? stubLayers(found?.id ?? frame, geometry) : null;
    canvasPx = synthetic ? { w: synthetic.w, h: synthetic.h } : { w: 1, h: 1 };
    box = { x: 0, y: 0, w: canvasPx.w, h: canvasPx.h };
    layers = synthetic?.source ?? (() => null);
    stub = true;
  }
  const px = { w: box.w, h: box.h };
  dropTexture(scene.textures, key);
  // Спершу скласти кадр на полотні, а вже готове віддати текстурі: `createCanvas` і `refresh` завантажували його у
  // відеопам'ять двічі — порожнє полотно й готове. Текстура — звичайна, з полотна, а не `CanvasTexture`: та одразу читає
  // пікселі полотна (`getImageData`) і тримає їхню копію, а пікселів запеченого кадру ніхто не читає. Полотно — у пам'яті
  // процесора (`willReadFrequently`): після збою відеокарти Phaser перевантажує текстуру з нього, а полотно у відеопам'яті
  // браузер тоді очищує — запечені частини зникли б до наступного запікання.
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) {
    // Візерунок тканини запікається разом із кадром: щокадру його ніхто не малює.
    const cloth =
      clothIds(recipe).length > 0
        ? clothFrame({ k: canvasPx.w / geometry.size.w, pivot: geometry.pivot, points: found?.entry.points, view: frameView(frame, found?.entry) }, atlasCloth, createCtx)
        : undefined;
    composeFrame(context, layers, recipe, { w: px.w, h: px.h, x: box.x, y: box.y, cloth });
    scene.textures.create(key, canvas)?.add("__BASE", 0, 0, 0, px.w, px.h);
  }
  return { key, px, geometry, canvas: canvasPx, box, stub };
}

/**
 * Прибрати текстуру запеченого кадру, а її полотно обнулити одразу, не чекаючи збирача сміття: iOS обмежує сумарну пам'ять
 * полотен сторінки, і понад неї нові полотна порожні.
 */
function dropTexture(textures: Phaser.Textures.TextureManager, key: string): void {
  if (!textures.exists(key)) return;
  const image = textures.get(key).getSourceImage();
  textures.remove(key);
  if (image instanceof HTMLCanvasElement) {
    image.width = 0;
    image.height = 0;
  }
}

/** Ракурс кадру запису; без ракурсів — null. */
function frameView(frame: FrameId, entry: ArtEntry | undefined): ArtView | null {
  return (entry && framesOf(entry).find((f) => f.frame === frame)?.view) ?? null;
}

/** Шари кадру тканини (`cloth/*`) зі сторінок атласу для візерунка; немає — null. */
function atlasCloth(id: ArtId): ClothLayers | null {
  const entry = artEntry(id);
  const layers = entry?.layers ? artLayerSource(id) : null;
  if (!entry || !layers) return null;
  return { source: layers.source, w: layers.w, h: layers.h, size: entry.size, pivot: entry.pivot };
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
