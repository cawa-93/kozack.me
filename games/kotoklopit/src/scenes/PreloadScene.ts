// Завантаження атласу арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): перша сцена гри. Бере
// `<BASE_URL>art/index.json` і сторінки атласу, реєструє їх як одну текстуру `ART_TEXTURE` з кадрами за контрактом
// `src/view/art/atlas.ts`, позначає `<html data-art>` і запускає DayScene. Атласу немає (404, порожній, не той формат,
// сторінка не завантажилася) — гра йде далі на заглушках `atlas.ts`.
//
// Вантажить fetch і Image, а не завантажувач Phaser у `preload()`: той додає файли, що з'явилися посеред завантаження
// (сторінки після index.json), лише на кадрах гри, а скрипт знімків тримає кадри на паузі, доки сторінка не готова. DayScene
// стартує, щойно атлас готовий, ще до першого кадру — у ту саму мить гри, що й раніше без PreloadScene, тож знімки старого
// вигляду не змінилися.
//
// Сторінки — джерела-зображення (Image) однієї текстури: після втрати контексту WebGL Phaser сам завантажує їх знову.

import Phaser from "phaser";

import { markArtReady } from "../view/art/atlas";
import {
  ART_DIR,
  ART_INDEX_FILE,
  ART_INDEX_VERSION,
  ART_TEXTURE,
  layerFrameName,
  type ArtIndex,
  type AtlasRect,
  type FrameId,
  type FrameLayer,
  type IndexFrame,
} from "../view/art/types";

/** Чим скінчилося завантаження атласу: «ready» — кадри є, «none» — атласу немає, лише заглушки. */
export type ArtLoadState = "ready" | "none";

/** Де в реєстрі гри (`game.registry`) лежить розібраний `index.json` (стани кадрів, `stub`) — для галереї й компонувальника. */
export const ART_INDEX_REGISTRY_KEY = "art-index";

/** Адреса файлу каталогу атласу від `BASE_URL` (у збірці — `/games/kotoklopit/art/…`). */
export function artUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${ART_DIR}/${file}`;
}

/** Чи схоже на `index.json` цієї версії: сторінки й кадри на місці. */
function isArtIndex(value: unknown): value is ArtIndex {
  if (typeof value !== "object" || value === null) return false;
  const index = value as Partial<ArtIndex>;
  return index.version === ART_INDEX_VERSION && Array.isArray(index.pages) && typeof index.frames === "object" && index.frames !== null;
}

/** `index.json` атласу або null: немає (404; у dev без конвеєра — index.html замість JSON), не той формат, мережа. */
export async function fetchArtIndex(): Promise<ArtIndex | null> {
  try {
    const response = await fetch(artUrl(ART_INDEX_FILE), { cache: "no-cache" });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    if (!isArtIndex(json)) {
      console.warn("Атлас арту: art/index.json не тієї версії — малюю заглушки");
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

/** Завантажити зображення; помилка — відмова. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Атлас арту: не завантажилася сторінка ${url} — малюю заглушки`));
    image.src = url;
  });
}

/**
 * Зареєструвати атлас: сторінки — джерела текстури `ART_TEXTURE` (номер сторінки — номер джерела), кожен шар кожного
 * кадру — кадр текстури `layerFrameName(кадр, шар)`, вирізаний зі сторінки, з обрізкою: `realWidth × realHeight` — повне
 * полотно `size · res`. У `customData` кадру — pivot, точки й `stub` з `index.json` (для того, хто дивиться на кадр сам по
 * собі; розміщення бере pivot з маніфесту). Стара текстура з тим самим ключем замінюється. Повертає кількість кадрів.
 */
export function registerArt(textures: Phaser.Textures.TextureManager, index: ArtIndex, pages: readonly HTMLImageElement[]): number {
  if (textures.exists(ART_TEXTURE)) textures.remove(ART_TEXTURE);
  const texture = textures.create(ART_TEXTURE, [...pages]);
  if (!texture) return 0;
  const first = pages[0];
  if (first) texture.add("__BASE", 0, 0, 0, first.naturalWidth, first.naturalHeight);
  let count = 0;
  for (const [id, frame] of Object.entries(index.frames) as [FrameId, IndexFrame][]) {
    for (const [layer, rect] of Object.entries(frame.layers) as [FrameLayer, AtlasRect | undefined][]) {
      if (!rect || rect.page < 0 || rect.page >= pages.length) continue;
      const added = texture.add(layerFrameName(id, layer), rect.page, rect.x, rect.y, rect.w, rect.h);
      if (!added) continue;
      added.setTrim(frame.size.w * frame.res, frame.size.h * frame.res, frame.trim.x, frame.trim.y, rect.w, rect.h);
      Object.assign(added.customData, { pivot: frame.pivot, points: frame.points ?? {}, stub: frame.stub === true });
      count++;
    }
  }
  return count;
}

/**
 * Завантажити атлас у гру: `index.json`, потім усі сторінки разом; `onProgress` — частка 0…1. Будь-яка невдача — «none»
 * (гра на заглушках), без винятку.
 */
export async function loadArt(scene: Phaser.Scene, onProgress?: (done: number) => void): Promise<ArtLoadState> {
  const index = await fetchArtIndex();
  if (!index || index.pages.length === 0 || Object.keys(index.frames).length === 0) return "none";
  const total = index.pages.length + 1;
  let loaded = 1;
  onProgress?.(loaded / total);
  let pages: HTMLImageElement[];
  try {
    pages = await Promise.all(
      index.pages.map(async (page) => {
        const image = await loadImage(artUrl(page.file));
        loaded++;
        onProgress?.(loaded / total);
        return image;
      }),
    );
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
    return "none";
  }
  // Сцену могли зупинити (чи гру закрити), поки вантажилося.
  if (!scene.sys.isActive()) return "none";
  const count = registerArt(scene.textures, index, pages);
  scene.registry.set(ART_INDEX_REGISTRY_KEY, index);
  return count > 0 ? "ready" : "none";
}

/** Індикатор: доріжка трохи світліша за тло гри (#2b2530, main.ts), смуга — колір паперу інтерфейсу; без тексту. */
const BAR = { track: 0x3b3340, fill: 0xf3e9dc, height: 6, maxWidth: 280, share: 0.4 };

/** Перша сцена: смуга завантаження, атлас, потім `next` (DayScene). */
export class PreloadScene extends Phaser.Scene {
  private readonly next: string;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private progress = 0;

  constructor(next = "day") {
    super("preload");
    this.next = next;
  }

  create(): void {
    this.bar = this.add.graphics();
    this.draw();
    const onResize = (): void => this.draw();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
    void loadArt(this, (done) => {
      this.progress = done;
      this.draw();
    }).then((state) => this.finish(state));
  }

  /** Смуга посередині екрана: доріжка й заповнена частка. */
  private draw(): void {
    const bar = this.bar;
    if (!bar) return;
    const { width, height } = this.scale.gameSize;
    const w = Math.round(Math.min(BAR.maxWidth, width * BAR.share));
    const x = Math.round((width - w) / 2);
    const y = Math.round(height / 2 - BAR.height / 2);
    bar.clear();
    bar.fillStyle(BAR.track, 1).fillRoundedRect(x, y, w, BAR.height, BAR.height / 2);
    const filled = Math.round(w * Math.min(1, Math.max(0, this.progress)));
    if (filled > 0) bar.fillStyle(BAR.fill, 1).fillRoundedRect(x, y, Math.max(BAR.height, filled), BAR.height, BAR.height / 2);
  }

  /**
   * Атлас готовий (чи його немає): ця сцена зупиняється, а `next` стартує одразу, не чекаючи кадру, — через менеджер сцен
   * гри, а не `this.scene.start`, що відклав би старт до наступного кадру. `<html data-art>` (`markArtReady`) з'являється в
   * тому самому завданні, що й старт DayScene, тож скрипт знімків, який чекає його, бачить гру вже створеною.
   */
  private finish(state: ArtLoadState): void {
    const game = this.sys.game;
    if (!game || !this.sys.isActive()) return;
    this.bar = null;
    try {
      game.scene.stop(this.scene.key);
      game.scene.start(this.next);
    } finally {
      // І якщо сцена впала: скрипт знімків покаже її помилку, а не «не дочекався атласу».
      markArtReady(state);
    }
  }
}
