// Завантаження атласу арту в Phaser (крок 16, GRAPHICS_PLAN.md: «Шов хвилі 1», контракт кадрів у `atlas.ts`): `index.json`
// → сторінки → одна текстура `ART_TEXTURE`, у якій сторінка — джерело з тим самим номером, а кожен шар кожного кадру на ній —
// кадр `layerFrameName(frameId, шар)` з обрізкою до полотна `size · res`. Сторінки компонувальника (`AtlasPage.compose`)
// вантажаться й розпаковуються разом з усіма, але джерелами текстури не стають і у відеопам'ять не йдуть: їхні шари читає
// лише Canvas2D — запікання (`bake.ts`) і DOM-портрет — через `sources.ts` (`shareArtAtlas`). Так атлас вантажать галерея
// (`src/dev/gallery`) і PreloadScene гри — однаково, одним кодом.
//
// Кликати з `create()` сцени, а не з `preload()`: завантажувач іде двома проходами (спершу `index.json`, потім сторінки,
// яких до нього не знати), і кожен запускає сам (`load.start()`), тож він не чекає кадрів гри — і скрипт знімків, у якого
// час стоїть, дочекається атласу. Хід завантаження для індикатора — `onProgress`: частка за байтами (`loadprogress.ts`), а не
// за файлами, як подія `progress` завантажувача.

import Phaser from "phaser";

import { artIndexUrl, artPageUrl, parseArtIndex, phaserPages } from "./atlasindex";
import { afterDecode, AtlasLoadProgress } from "./loadprogress";
import { shareArtAtlas } from "./sources";
import { ART_TEXTURE, layerFrameName, type ArtIndex, type FrameId, type FrameLayer } from "./types";

/** Атлас завантажено («ready») чи його немає й усе малюють заглушки («none») — те, що далі отримує `markArtReady`. */
export type ArtAtlasState = "ready" | "none";

export interface ArtAtlasResult {
  state: ArtAtlasState;
  /** Розібраний `index.json`; null — атласу немає. */
  index: ArtIndex | null;
}

export interface ArtAtlasOptions {
  /**
   * Шари записів із `layers` — теж кадрами Phaser: сторінки компонувальника стають джерелами текстури. Лише для галереї,
   * яка показує шари окремо; грі вони у відеопам'яті не потрібні.
   */
  layerFrames?: boolean;
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
 * Сторінки, що вже прийшли, за назвою файлу (з хешем вмісту): спроба після невдалої («Спробувати ще», PreloadScene)
 * довантажує лише решту. Коли атлас склався, вони вже в текстурі — тут їх забуто.
 */
const arrived = new WeakMap<Phaser.Game, Map<string, HTMLImageElement>>();

/**
 * Завантажити атлас (якщо його ще немає) і скласти текстуру `ART_TEXTURE`. Атласу немає (файлу немає, він не той, сторінка
 * не прийшла) — `state: "none"`, і `addArt` малює заглушки; помилки формату — `console.warn`. `base` — базова адреса гри.
 * `onProgress` — хід завантаження, частка 0–1 за байтами, що не спадає (для смуги заставки; лише тому, хто почав
 * завантаження); `options` — теж лише його.
 */
export function loadArtAtlas(
  scene: Phaser.Scene,
  base: string = import.meta.env.BASE_URL,
  onProgress?: (fraction: number) => void,
  options: ArtAtlasOptions = {},
): Promise<ArtAtlasResult> {
  if (scene.textures.exists(ART_TEXTURE)) return Promise.resolve({ state: "ready", index: loadedArtIndex(scene) });
  const game = scene.game;
  let loading = pending.get(game);
  if (!loading) {
    loading = load(scene, base, onProgress, options).finally(() => pending.delete(game));
    pending.set(game, loading);
  }
  return loading;
}

/** Розібраний `index.json` завантаженого атласу (стани кадрів, `stub`); null — атласу немає. */
export function loadedArtIndex(scene: Phaser.Scene): ArtIndex | null {
  const index: unknown = scene.registry.get(REGISTRY_KEY);
  return (index as ArtIndex | undefined) ?? null;
}

function load(scene: Phaser.Scene, base: string, onProgress: ((fraction: number) => void) | undefined, options: ArtAtlasOptions): Promise<ArtAtlasResult> {
  return new Promise((resolve) => {
    const loader = scene.load;
    // Поступ за байтами: спершу `index.json`, потім сторінки (`AtlasLoadProgress`); слухач знято, щойно завантаження скінчилося.
    const progress = new AtlasLoadProgress();
    const report = (fraction: number): void => onProgress?.(fraction);
    const onFile = (file: Phaser.Loader.File): void => {
      if (file.key === INDEX_KEY) report(progress.indexProgress(file.percentComplete));
      else if (file.key.startsWith(PAGE_KEY)) report(progress.pageProgress(Number(file.key.slice(PAGE_KEY.length)), file.bytesLoaded, file.bytesTotal));
    };
    if (onProgress) loader.on(Phaser.Loader.Events.FILE_PROGRESS, onFile);
    const finish = (result: ArtAtlasResult): void => {
      loader.off(Phaser.Loader.Events.FILE_PROGRESS, onFile);
      resolve(result);
    };
    const none = (): void => finish({ state: "none", index: null });
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
      let kept = arrived.get(scene.game);
      if (!kept) {
        kept = new Map();
        arrived.set(scene.game, kept);
      }
      const have = kept;
      const images: (HTMLImageElement | undefined)[] = index.pages.map((page) => have.get(page.file));
      report(progress.pages(index.pages, images.map((image) => image !== undefined)));
      index.pages.forEach((page, i) => {
        if (images[i]) return;
        loader.addFile(
          new PageFile(loader, `${PAGE_KEY}${i}`, artPageUrl(base, page.file), (image) => {
            images[i] = image;
            have.set(page.file, image);
            report(progress.pageDone(i));
          }),
        );
      });
      loader.once(Phaser.Loader.Events.COMPLETE, guarded(() => {
        const missing = index.pages.filter((_, i) => images[i] === undefined).map((page) => page.file);
        if (missing.length > 0) {
          console.warn(`Атлас арту: не завантажилися сторінки ${missing.join(", ")}, малюю заглушки`);
          none();
          return;
        }
        if (!installAtlas(scene, index, images as HTMLImageElement[], options.layerFrames === true)) {
          none();
          return;
        }
        // Ті самі сторінки — портретові в редакторі (`sources.ts`): інакше він вантажив би й тримав їх удруге.
        shareArtAtlas(index, images as HTMLImageElement[]);
        arrived.delete(scene.game);
        finish({ state: "ready", index });
      }));
      loader.start();
    }));
    loader.start();
  });
}

/**
 * Сторінка атласу: звичайне зображення, але воно не стає окремою текстурою (у WebGL — ще одна копія у відеопам'яті), а
 * віддається, щоб стати джерелом спільної `ART_TEXTURE`. Готова — лише розпакованою (`afterDecode`): доки вона
 * розпаковується, завантажувач її чекає, і `COMPLETE` прийде вже з усіма розпакованими сторінками.
 */
class PageFile extends Phaser.Loader.FileTypes.ImageFile {
  private readonly sink: (image: HTMLImageElement) => void;

  constructor(loader: Phaser.Loader.LoaderPlugin, key: string, url: string, sink: (image: HTMLImageElement) => void) {
    super(loader, key, url);
    this.sink = sink;
  }

  override onProcessComplete(): void {
    afterDecode(this.data as HTMLImageElement, () => super.onProcessComplete());
  }

  override addToCache(): void {
    this.sink(this.data as HTMLImageElement);
  }
}

/**
 * Скласти `ART_TEXTURE` зі сторінок для Phaser (`phaserPages`; з `layerFrames` — з усіх) і додати кадри шарів, що на них
 * лежать (контракт — `atlas.ts`); false — не вдалося.
 */
function installAtlas(scene: Phaser.Scene, index: ArtIndex, images: readonly HTMLImageElement[], layerFrames: boolean): boolean {
  index.pages.forEach((page, i) => {
    const image = images[i];
    if (image && (image.naturalWidth !== page.w || image.naturalHeight !== page.h)) {
      console.warn(`Атлас арту: сторінка ${page.file} — ${image.naturalWidth} × ${image.naturalHeight}, а в index.json ${page.w} × ${page.h}`);
    }
  });
  const pages = phaserPages(index, layerFrames);
  /** Сторінка → номер джерела текстури. Сторінки компонувальника — останні (`artIndexProblems`), тож номери збігаються. */
  const sourceOf = new Map(pages.map((page, source) => [page, source]));
  const texture = scene.textures.create(
    ART_TEXTURE,
    pages.map((page) => images[page] as HTMLImageElement),
  );
  if (!texture) return false;
  const first = index.pages[pages[0] ?? 0];
  if (first) texture.add("__BASE", 0, 0, 0, first.w, first.h);
  for (const [id, frame] of Object.entries(index.frames)) {
    for (const [layer, rect] of Object.entries(frame.layers)) {
      const source = rect ? sourceOf.get(rect.page) : undefined;
      if (!rect || source === undefined) continue;
      const added = texture.add(layerFrameName(id as FrameId, layer as FrameLayer), source, rect.x, rect.y, rect.w, rect.h);
      if (!added) continue;
      added.setTrim(frame.size.w * frame.res, frame.size.h * frame.res, rect.dx, rect.dy, rect.w, rect.h);
      // Pivot і точки для розміщення беруться з маніфесту (`atlas.ts`); тут — для того, хто дивиться на кадр сам по собі.
      Object.assign(added.customData, { pivot: frame.pivot, points: frame.points ?? {}, stub: frame.stub === true });
    }
  }
  scene.registry.set(REGISTRY_KEY, index);
  return true;
}
