// Завантаження атласу арту в Phaser (крок 16, GRAPHICS_PLAN.md: «Шов хвилі 1», контракт кадрів у `atlas.ts`): `index.json`
// → сторінки → одна текстура `ART_TEXTURE`, у якій кожна сторінка — джерело з тим самим номером, а кожен шар кожного кадру —
// кадр `layerFrameName(frameId, шар)` з обрізкою до полотна `size · res`. Так атлас вантажать галерея (`src/dev/gallery`) і
// PreloadScene гри — однаково, одним кодом (DOM-портрет бере ті самі файли через `sources.ts` і ті самі адреси й перевірку
// `index.json` з `atlasindex.ts`).
//
// Кликати з `create()` сцени, а не з `preload()`: завантажувач іде двома проходами (спершу `index.json`, потім сторінки,
// яких до нього не знати), і кожен запускає сам (`load.start()`), тож він не чекає кадрів гри — і скрипт знімків, у якого
// час стоїть, дочекається атласу. Хід завантаження — звичайні події `scene.load` (`progress`) для індикатора.

import Phaser from "phaser";

import { artIndexUrl, artPageUrl, parseArtIndex } from "./atlasindex";
import { ART_TEXTURE, layerFrameName, type ArtIndex, type FrameId, type FrameLayer } from "./types";

/** Атлас завантажено («ready») чи його немає й усе малюють заглушки («none») — те, що далі отримує `markArtReady`. */
export type ArtAtlasState = "ready" | "none";

export interface ArtAtlasResult {
  state: ArtAtlasState;
  /** Розібраний `index.json`; null — атласу немає. */
  index: ArtIndex | null;
}

/** Ключ тексту `index.json` у кеші Phaser на час завантаження. */
const INDEX_KEY = "art-index";
/** Ключі файлів сторінок у завантажувачі: `art-page:<номер>` (у кеш текстур вони не потрапляють). */
const PAGE_KEY = "art-page:";
/** Де в реєстрі гри (`game.registry`) лежить розібраний `index.json`. */
const REGISTRY_KEY = "art-index";

/** Що вже вантажиться: друга сцена, що попросила атлас, чекає те саме завантаження. */
const pending = new WeakMap<Phaser.Game, Promise<ArtAtlasResult>>();

/**
 * Завантажити атлас (якщо його ще немає) і скласти текстуру `ART_TEXTURE`. Атласу немає (файлу немає, він не той, сторінка
 * не прийшла) — `state: "none"`, і `addArt` малює заглушки; помилки формату — `console.warn`. `base` — базова адреса гри.
 */
export function loadArtAtlas(scene: Phaser.Scene, base: string = import.meta.env.BASE_URL): Promise<ArtAtlasResult> {
  if (scene.textures.exists(ART_TEXTURE)) return Promise.resolve({ state: "ready", index: loadedArtIndex(scene) });
  const game = scene.game;
  let loading = pending.get(game);
  if (!loading) {
    loading = load(scene, base).finally(() => pending.delete(game));
    pending.set(game, loading);
  }
  return loading;
}

/** Розібраний `index.json` завантаженого атласу (стани кадрів, `stub`); null — атласу немає. */
export function loadedArtIndex(scene: Phaser.Scene): ArtIndex | null {
  const index: unknown = scene.registry.get(REGISTRY_KEY);
  return (index as ArtIndex | undefined) ?? null;
}

function load(scene: Phaser.Scene, base: string): Promise<ArtAtlasResult> {
  return new Promise((resolve) => {
    const loader = scene.load;
    const none = (): void => resolve({ state: "none", index: null });
    /**
     * Обробник події завантажувача: виняток у ньому (зламаний кадр, текстура не склалася) — «none», а не вічне очікування
     * (обіцянка інакше так і не скінчилася б, і гра лишилася б на смузі завантаження).
     */
    const guarded =
      (step: () => void): (() => void) =>
      () => {
        try {
          step();
        } catch (error) {
          console.warn("Атлас арту не склався, малюю заглушки:", error);
          if (scene.textures.exists(ART_TEXTURE)) scene.textures.remove(ART_TEXTURE);
          none();
        }
      };
    scene.cache.text.remove(INDEX_KEY);
    loader.text(INDEX_KEY, artIndexUrl(base));
    loader.once(Phaser.Loader.Events.COMPLETE, guarded(() => {
      const text: unknown = scene.cache.text.get(INDEX_KEY);
      scene.cache.text.remove(INDEX_KEY);
      const problems: string[] = [];
      const index = typeof text === "string" ? parseArtIndex(text, problems) : null;
      if (problems.length > 0) console.warn(`Атлас арту: index.json не той, малюю заглушки:\n- ${problems.join("\n- ")}`);
      if (!index) {
        none();
        return;
      }
      const images: (HTMLImageElement | undefined)[] = index.pages.map(() => undefined);
      index.pages.forEach((page, i) => {
        loader.addFile(new PageFile(loader, `${PAGE_KEY}${i}`, artPageUrl(base, page.file), (image) => (images[i] = image)));
      });
      loader.once(Phaser.Loader.Events.COMPLETE, guarded(() => {
        const missing = index.pages.filter((_, i) => images[i] === undefined).map((page) => page.file);
        if (missing.length > 0) {
          console.warn(`Атлас арту: не завантажилися сторінки ${missing.join(", ")}, малюю заглушки`);
          none();
          return;
        }
        if (!installAtlas(scene, index, images as HTMLImageElement[])) {
          none();
          return;
        }
        resolve({ state: "ready", index });
      }));
      loader.start();
    }));
    loader.start();
  });
}

/**
 * Сторінка атласу: звичайне зображення, але воно не стає окремою текстурою (у WebGL — ще одна копія у відеопам'яті), а
 * віддається, щоб стати джерелом спільної `ART_TEXTURE`.
 */
class PageFile extends Phaser.Loader.FileTypes.ImageFile {
  private readonly sink: (image: HTMLImageElement) => void;

  constructor(loader: Phaser.Loader.LoaderPlugin, key: string, url: string, sink: (image: HTMLImageElement) => void) {
    super(loader, key, url);
    this.sink = sink;
  }

  override addToCache(): void {
    this.sink(this.data as HTMLImageElement);
  }
}

/** Скласти `ART_TEXTURE` зі сторінок і додати кадри всіх шарів (контракт — `atlas.ts`); false — не вдалося. */
function installAtlas(scene: Phaser.Scene, index: ArtIndex, images: readonly HTMLImageElement[]): boolean {
  index.pages.forEach((page, i) => {
    const image = images[i];
    if (image && (image.naturalWidth !== page.w || image.naturalHeight !== page.h)) {
      console.warn(`Атлас арту: сторінка ${page.file} — ${image.naturalWidth} × ${image.naturalHeight}, а в index.json ${page.w} × ${page.h}`);
    }
  });
  const texture = scene.textures.create(ART_TEXTURE, [...images]);
  if (!texture) return false;
  const first = index.pages[0];
  if (first) texture.add("__BASE", 0, 0, 0, first.w, first.h);
  for (const [id, frame] of Object.entries(index.frames)) {
    for (const [layer, rect] of Object.entries(frame.layers)) {
      if (!rect) continue;
      const added = texture.add(layerFrameName(id as FrameId, layer as FrameLayer), rect.page, rect.x, rect.y, rect.w, rect.h);
      if (!added) continue;
      added.setTrim(frame.size.w * frame.res, frame.size.h * frame.res, frame.trim.x, frame.trim.y, rect.w, rect.h);
      // Pivot і точки для розміщення беруться з маніфесту (`atlas.ts`); тут — для того, хто дивиться на кадр сам по собі.
      Object.assign(added.customData, { pivot: frame.pivot, points: frame.points ?? {}, stub: frame.stub === true });
    }
  }
  scene.registry.set(REGISTRY_KEY, index);
  return true;
}
