// Збирання атласу арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): записи маніфесту → SVG з `art/` →
// растри шарів (кеш) → заглушки для записів без SVG → однакові растри один раз → сторінки атласу (webp з хешем у назві)
// і `index.json` (`ArtIndex`). Без Vite-плагіна: його кличуть плагін (`plugin.ts`, dev і build), скрипт `cli.ts`
// (`npm run art`) і тести.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";

import sharp, { type WebpOptions } from "sharp";
import { runnerImport } from "vite";

import { GLOW_MAP, glowMap, glowMapBox } from "../../src/view/art/glowmap";
import { stubSvg, STUB_MAX_PX } from "../../src/view/art/placement";
import {
  ART_DIR,
  ART_INDEX_FILE,
  ART_INDEX_VERSION,
  framesOf,
  type ArtEntry,
  type ArtIndex,
  type AtlasPage,
  type FrameId,
  type FrameLayer,
  type IndexFrame,
  type IndexGlow,
  type IndexLayer,
} from "../../src/view/art/types";
import { ArtCache, CACHE_SUBDIR, hashOf } from "./cache";
import { composePage, pack, PACK_DEFAULTS, type PackOptions } from "./pack";
import { crop, densityFor, rasterFrame, rasterize, stylesheetsFor, type FrameRaster, type LayerRaster, type Rgba } from "./raster";
import { drawnProblems, orphanSvgs, svgProblems, topLevelLayers } from "./svg";

export { ART_DIR, ART_INDEX_FILE };

/**
 * Версія конвеєра для ключів кешу: змінилося те, як SVG стає растром чи сторінкою, — нова версія, і старий кеш не
 * береться. «2» — кожен шар обрізано своєю рамкою.
 */
export const PIPELINE_VERSION = "2";

/** Бюджет усіх атласів разом (GRAPHICS_PLAN.md): більше — попередження в лозі. */
export const ART_BUDGET_BYTES = 5 * 1024 * 1024;

/**
 * Як кодувати сторінки: webp без втрат — шари фарбує компонувальник, і втрати на краях заливок і масок дали б ореоли; на
 * пласких кольорах без втрат і так компактно.
 */
export const WEBP_OPTIONS: WebpOptions = { lossless: true, effort: 4 };

/**
 * Змінна оточення вимоги всього арту. Типово (хвиля 3: увесь арт намальовано) запис без SVG — помилка: ламає збирання
 * (`vite build`, прев'ю Netlify), `npm run art` і тести. «0» чи «false» — дозволити заглушки. Dev-сервер заглушки дозволяє
 * завжди (`plugin.ts`): так малюють нове.
 */
export const REQUIRE_ALL_ENV = "KOTOKLOPIT_REQUIRE_ALL_ART";
/** Змінна оточення: «0» — без кешу (`node_modules/.cache/kotoklopit-art`). */
export const CACHE_ENV = "KOTOKLOPIT_ART_CACHE";

export interface ArtBuildOptions {
  /** Тека SVG (`<гра>/art`). */
  artDir: string;
  entries: readonly ArtEntry[];
  /** Роздільність записів без `res` (`DEFAULT_RES` з маніфесту). */
  defaultRes: number;
  cache: ArtCache;
  /** Запис без SVG — помилка, а не заглушка (із попередженням). */
  requireAll: boolean;
  /** Скільки кадрів растеризувати одночасно. */
  concurrency?: number;
  pack?: PackOptions;
  webp?: WebpOptions;
}

/** Що зібрано і скільки. */
export interface ArtStats {
  entries: number;
  frames: number;
  /** Шарів у всіх кадрах (кадр без шарів — один). */
  layers: number;
  /** Кадрів-заглушок. */
  stubs: number;
  /** Кадрів із картою сяйва. */
  glows: number;
  /** Різних растрів на сторінках (однакові шари лежать один раз). */
  images: number;
  pages: number;
  /** Розмір сторінок разом, байти. */
  bytes: number;
  /** Кадрів, растеризованих заново, і взятих із кешу. */
  rastered: number;
  cached: number;
  ms: number;
}

export interface ArtBuild {
  index: ArtIndex;
  /** Файли каталогу `art/`: `index.json` і сторінки (назва відносно `art/` → вміст). */
  files: Map<string, Buffer>;
  /** Помилки: у збиранні (`vite build`, `npm run art`) — збій, у dev — попередження. */
  errors: string[];
  warnings: string[];
  stats: ArtStats;
  /** SVG, які читалися (абсолютні шляхи), — для стеження в dev. */
  inputs: string[];
}

/** Кадр перед пакуванням. */
interface FrameJob {
  frame: FrameId;
  entry: ArtEntry;
  res: number;
  raster: FrameRaster;
  stub: boolean;
}

/** Виконати задачі не більше ніж по `limit` одночасно, зберігаючи порядок результатів. */
async function pool<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) out[i] = await run(items[i] as T);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/**
 * Найбільша роздільність заглушки в атласі, пікселів на одиницю арту: заглушка — пласка штриховка, і поки арту мало,
 * заглушок сотні, тож їм — чверть площі справжнього кадру (у світі вони займають той самий розмір — масштаб з `realWidth`).
 */
export const STUB_ATLAS_RES = 1;

/** Роздільність заглушки: як у запису, але не більше `STUB_ATLAS_RES` і `STUB_MAX_PX` по більшій стороні (як у рантаймі). */
export function stubRes(entry: Pick<ArtEntry, "size">, res: number): number {
  return Math.min(res, STUB_ATLAS_RES, STUB_MAX_PX / Math.max(entry.size.w, entry.size.h));
}

/**
 * Набір сторінок запису (`PackItem.sheet`): шари записів із `layers` (кіт, персонаж, гонка, тканини) читає лише
 * компонувальник через Canvas2D, а Phaser їх не малює, — тож вони на своїх сторінках (`AtlasPage.compose`), яких гра у
 * відеопам'ять не вантажить. Усе, що Phaser малює напряму (кадри без шарів, карти сяйва), туди не кладеться.
 */
export function packSheet(entry: Pick<ArtEntry, "layers">): number {
  return entry.layers ? COMPOSE_SHEET : 0;
}

/** Набір сторінок компонувальника: останній, тож номер сторінки для Phaser — номер джерела його текстури. */
const COMPOSE_SHEET = 1;

/**
 * Група пакування карт сяйва — після всіх кадрів без шарів: карта не зсуває інших растрів, тож решта сторінок від карт не
 * залежить (у гравця вони лишаються в кеші браузера), а плавні переходи альфи не лежать упереміш із пласкими кольорами —
 * так webp без втрат стискає сторінки помітно гірше.
 */
const GLOW_GROUP = 1;

/** Версія розрахунку карт сяйва для ключів кешу: змінилася формула в `glowmap.ts` — нова версія. */
const GLOW_VERSION = "1";

/**
 * Карта сяйва шару (`glowMap`): білий растр з альфою ореолу й зсув карти від полотна кадру. Рахується довго (сотні
 * вибірок на піксель), тож лежить у кеші за вмістом шару.
 */
function glowRaster(layer: LayerRaster, cache: ArtCache): { image: Rgba; dx: number; dy: number; scale: number } {
  const key = hashOf("glow", GLOW_VERSION, JSON.stringify(GLOW_MAP), String(layer.w), String(layer.h), layer.data);
  const { w, h, dx, dy, scale } = glowMapBox(layer);
  let data = cache.read(key, "glow");
  if (data === null || data.length !== w * h * 4) {
    const alpha = new Uint8Array(layer.w * layer.h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = layer.data[i * 4 + 3] ?? 0;
    const map = glowMap({ w: layer.w, h: layer.h, data: alpha });
    data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < map.data.length; i++) {
      const a = map.data[i] ?? 0;
      // Прозорий піксель — нулі в усіх каналах: таким його повертає й webp без втрат.
      if (a > 0) data.fill(255, i * 4, i * 4 + 3);
      data[i * 4 + 3] = a;
    }
    cache.write(key, "glow", data);
  }
  return { image: { w, h, data }, dx: layer.x + dx, dy: layer.y + dy, scale };
}

/** Растр заглушки запису: `stubSvg` з розміром і pivot запису, без обрізки; той самий растр — для кожного шару. */
async function stubRaster(entry: ArtEntry, res: number, cache: ArtCache): Promise<FrameRaster> {
  const svg = stubSvg({ size: entry.size, pivot: entry.pivot });
  const layers: FrameLayer[] = entry.layers ? [...entry.layers] : ["all"];
  const key = hashOf("stub", PIPELINE_VERSION, sharp.versions.rsvg ?? "", svg, String(res), layers.join(","));
  const cached = cache.readFrame(key);
  if (cached) return cached;
  const image = await rasterize(svg, densityFor(res), "");
  const frame: FrameRaster = {
    canvas: { w: image.w, h: image.h },
    trim: { x: 0, y: 0 },
    w: image.w,
    h: image.h,
    layers: layers.map((layer) => ({ layer, x: 0, y: 0, ...crop(image, 0, 0, image.w, image.h) })),
  };
  cache.writeFrame(key, frame);
  return frame;
}

/** Відносні шляхи (через «/») усіх файлів у теці, рекурсивно; теки немає — порожньо. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.relative(dir, path.join(dirent.parentPath, dirent.name)).split(path.sep).join("/"))
    .sort();
}

/** Зібрати атлас із записів маніфесту й SVG теки `artDir`. */
export async function buildArt(options: ArtBuildOptions): Promise<ArtBuild> {
  const started = Date.now();
  const { artDir, entries, cache } = options;
  const errors: string[] = [];
  const warnings: string[] = [];
  const inputs: string[] = [];
  const jobs: (() => Promise<FrameJob | null>)[] = [];
  let rastered = 0;

  const svgText = new Map<string, string | null>();
  const readSvg = (rel: string): string | null => {
    if (!svgText.has(rel)) {
      const file = path.join(artDir, ...rel.split("/"));
      let text: string | null = null;
      try {
        text = readFileSync(file, "utf8");
        inputs.push(file);
      } catch {
        text = null;
      }
      svgText.set(rel, text);
    }
    return svgText.get(rel) ?? null;
  };

  /** SVG, замість яких заглушка: попередження — одне на файл. */
  const stubbed = new Set<string>();
  for (const entry of entries) {
    const res = entry.res ?? options.defaultRes;
    errors.push(...drawnProblems(entry, (svg) => readSvg(svg) !== null, options.requireAll));
    const checked = new Set<string>();
    for (const ref of framesOf(entry)) {
      const text = readSvg(ref.svg);
      if (text === null) {
        if (!options.requireAll && !stubbed.has(ref.svg)) {
          stubbed.add(ref.svg);
          warnings.push(`art/${ref.svg}: немає — заглушка («${entry.id}»)`);
        }
        jobs.push(async () => ({ frame: ref.frame, entry, res: stubRes(entry, res), raster: await stubRaster(entry, stubRes(entry, res), cache), stub: true }));
        continue;
      }
      if (!checked.has(ref.svg)) {
        checked.add(ref.svg);
        for (const problem of svgProblems(text, entry)) errors.push(`art/${ref.svg}: ${problem}`);
      }
      const job = {
        svg: text,
        size: entry.size,
        res,
        layers: entry.layers ?? null,
        fileLayers: topLevelLayers(text),
        state: ref.state,
        states: entry.states ?? [],
      };
      jobs.push(async () => {
        const key = hashOf("frame", PIPELINE_VERSION, sharp.versions.rsvg ?? "", text, JSON.stringify({ size: job.size, res, sheets: stylesheetsFor(job) }));
        let raster = cache.readFrame(key);
        if (!raster) {
          try {
            raster = await rasterFrame(job);
          } catch (error) {
            errors.push(`art/${ref.svg} (${ref.frame}): не растеризується — ${error instanceof Error ? error.message : String(error)}`);
            return { frame: ref.frame, entry, res: stubRes(entry, res), raster: await stubRaster(entry, stubRes(entry, res), cache), stub: true };
          }
          rastered++;
          cache.writeFrame(key, raster);
        }
        return { frame: ref.frame, entry, res, raster, stub: false };
      });
    }
  }

  const concurrency = options.concurrency ?? Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  const frames = (await pool(jobs, concurrency, (job) => job())).filter((job): job is FrameJob => job !== null);
  frames.sort((a, b) => (a.frame < b.frame ? -1 : a.frame > b.frame ? 1 : 0));

  // Однакові растри (заглушки однакового розміру, однакові стани, усі порожні шари) лежать на сторінці один раз — у межах
  // набору сторінок: інакше шар брав би, скажімо, порожній піксель зі сторінки для Phaser.
  const images = new Map<string, { image: Rgba; sheet: number; group: number }>();
  const layerImage = new Map<string, string>();
  let layerCount = 0;
  for (const job of frames) {
    const sheet = packSheet(job.entry);
    for (const layer of job.raster.layers) {
      layerCount++;
      const key = hashOf(String(sheet), String(layer.w), String(layer.h), layer.data);
      if (!images.has(key)) images.set(key, { image: layer, sheet, group: 0 });
      layerImage.set(`${job.frame}#${layer.layer}`, key);
    }
  }

  // Карти сяйва кадрів-цілей (§8.2): однакові силуети станів — одна карта.
  const glows = new Map<FrameId, { key: string; w: number; h: number; dx: number; dy: number; scale: number }>();
  for (const job of frames) {
    const layer = job.raster.layers[0];
    if (!job.entry.glow || job.stub || job.entry.layers || !layer) continue;
    const { image, dx, dy, scale } = glowRaster(layer, cache);
    const key = hashOf("glow", String(image.w), String(image.h), image.data);
    if (!images.has(key)) images.set(key, { image, sheet: 0, group: GLOW_GROUP });
    layerImage.set(`${job.frame}@glow`, key);
    glows.set(job.frame, { key, w: image.w, h: image.h, dx, dy, scale });
  }

  const packOptions = options.pack ?? PACK_DEFAULTS;
  let packed: ReturnType<typeof pack>;
  try {
    packed = pack(
      [...images].map(([key, { image, sheet, group }]) => ({ key, w: image.w, h: image.h, sheet, group })),
      packOptions,
    );
  } catch (error) {
    // Ключ растра — хеш; у повідомленні — кадр, якому він належить.
    let message = error instanceof Error ? error.message : String(error);
    for (const [name, key] of layerImage) message = message.replace(key, name);
    errors.push(message);
    packed = { pages: [], placements: new Map() };
    frames.length = 0;
  }

  const webp = options.webp ?? WEBP_OPTIONS;
  const files = new Map<string, Buffer>();
  const pages: AtlasPage[] = [];
  let bytes = 0;
  for (let p = 0; p < packed.pages.length; p++) {
    const size = packed.pages[p] ?? { w: 1, h: 1, sheet: 0 };
    const placed = [...packed.placements].filter(([, at]) => at.page === p).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const key = hashOf("page", PIPELINE_VERSION, JSON.stringify(webp), JSON.stringify(packOptions), `${size.w}x${size.h}`, placed.map(([k, at]) => `${k}@${at.x},${at.y}`).join(";"));
    let data = cache.read(key, "webp");
    if (data === null) {
      const page = composePage(
        size.w,
        size.h,
        placed.map(([k, at]) => ({ image: (images.get(k) as { image: Rgba }).image, x: at.x, y: at.y })),
        packOptions.extrude,
      );
      data = await sharp(page.data, { raw: { width: page.w, height: page.h, channels: 4 } }).webp(webp).toBuffer();
      cache.write(key, "webp", data);
    }
    const file = `page-${p}.${hashOf(data).slice(0, 10)}.webp`;
    files.set(file, data);
    pages.push({ file, w: size.w, h: size.h, bytes: data.length, ...(size.sheet === COMPOSE_SHEET ? { compose: true as const } : {}) });
    bytes += data.length;
  }

  const indexFrames: Record<FrameId, IndexFrame> = {};
  let stubs = 0;
  for (const job of frames) {
    const layers: Partial<Record<FrameLayer, IndexLayer>> = {};
    for (const layer of job.raster.layers) {
      const at = packed.placements.get(layerImage.get(`${job.frame}#${layer.layer}`) ?? "");
      if (!at) continue;
      layers[layer.layer] = { page: at.page, x: at.x, y: at.y, w: layer.w, h: layer.h, dx: layer.x, dy: layer.y };
    }
    const frame: IndexFrame = {
      size: job.entry.size,
      res: job.res,
      pivot: job.entry.pivot,
      ...(job.entry.points ? { points: job.entry.points } : {}),
      layers,
      ...(job.entry.layers ? { box: { x: job.raster.trim.x, y: job.raster.trim.y, w: job.raster.w, h: job.raster.h } } : {}),
      ...(job.stub ? { stub: true as const } : {}),
    };
    const glow = glows.get(job.frame);
    const glowAt = glow ? packed.placements.get(glow.key) : undefined;
    if (glow && glowAt) {
      const rect: IndexGlow = { page: glowAt.page, x: glowAt.x, y: glowAt.y, w: glow.w, h: glow.h, dx: glow.dx, dy: glow.dy, scale: glow.scale };
      frame.glow = rect;
    }
    if (job.stub) stubs++;
    indexFrames[job.frame] = frame;
  }
  const index: ArtIndex = { version: ART_INDEX_VERSION, pages, frames: indexFrames };
  files.set(ART_INDEX_FILE, Buffer.from(JSON.stringify(index)));

  for (const orphan of orphanSvgs(entries, listFiles(artDir))) warnings.push(`art/${orphan}: немає запису в маніфесті — не растеризується`);
  if (bytes > ART_BUDGET_BYTES) {
    warnings.push(`атласи разом ${formatBytes(bytes)} — більше за бюджет ${formatBytes(ART_BUDGET_BYTES)} (GRAPHICS_PLAN.md)`);
  }

  return {
    index,
    files,
    errors,
    warnings,
    inputs,
    stats: {
      entries: entries.length,
      frames: frames.length,
      layers: layerCount,
      stubs,
      glows: glows.size,
      images: images.size,
      pages: pages.length,
      bytes,
      rastered,
      cached: frames.length - rastered - stubs,
      ms: Date.now() - started,
    },
  };
}

/** Розмір для лога: КБ чи МБ. */
export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} МБ` : `${(bytes / 1024).toFixed(1)} КБ`;
}

/** Рядок лога про зібраний атлас. */
export function describeBuild(build: ArtBuild): string {
  const s = build.stats;
  const parts = [
    `${s.frames} кадрів (${s.layers} шарів, ${s.images} різних растрів)`,
    `${s.pages} сторінок, ${formatBytes(s.bytes)}`,
    `заглушок: ${s.stubs}`,
    `растеризовано ${s.rastered}, з кешу ${Math.max(0, s.cached)}`,
    `${s.ms} мс`,
  ];
  return `атлас арту: ${parts.join("; ")}`;
}

// --- Маніфест і тека гри -----------------------------------------------------------------------

/** Що конвеєр бере з `src/view/art/manifest.ts`. */
interface ManifestApi {
  artEntries(): readonly ArtEntry[];
  DEFAULT_RES: number;
}

export interface LoadedManifest {
  entries: readonly ArtEntry[];
  defaultRes: number;
  /** Файли, з яких зібрано маніфест (модулі категорій, типи), — для стеження в dev. */
  dependencies: string[];
}

/**
 * Завантажити маніфест гри в Node: `manifest.ts` збирає записи через `import.meta.glob`, тож без Vite його не імпортувати —
 * беремо `runnerImport` (окреме тимчасове середовище Vite без конфігу гри, щоразу свіже, тож зміни файлів видно одразу).
 * Записи з помилками — виняток із переліком (`indexEntries`).
 */
export async function loadManifest(gameDir: string): Promise<LoadedManifest> {
  const file = path.join(gameDir, "src", "view", "art", "manifest.ts");
  const { module, dependencies } = await runnerImport<ManifestApi>(file, { root: gameDir, logLevel: "error" });
  return { entries: module.artEntries(), defaultRes: module.DEFAULT_RES, dependencies };
}

export interface GameArtOptions {
  gameDir: string;
  /** Запис без SVG — помилка; за замовчуванням — так, якщо змінна `KOTOKLOPIT_REQUIRE_ALL_ART` не вимикає (`requireAllFromEnv`). */
  requireAll?: boolean;
  /** Кеш у `node_modules/.cache/kotoklopit-art`; за замовчуванням — так, якщо `KOTOKLOPIT_ART_CACHE` не «0». */
  cache?: boolean;
}

/** Чи вимагати весь арт за змінною оточення: так, хіба що вона «0» чи «false». */
export function requireAllFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[REQUIRE_ALL_ENV];
  return value !== "0" && value !== "false";
}

/** Зібрати атлас гри: маніфест (`loadManifest`), SVG з `<гра>/art`, кеш у `<гра>/node_modules/.cache/kotoklopit-art`. */
export async function buildGameArt(options: GameArtOptions): Promise<ArtBuild & { manifest: LoadedManifest }> {
  const manifest = await loadManifest(options.gameDir);
  const useCache = options.cache ?? process.env[CACHE_ENV] !== "0";
  const build = await buildArt({
    artDir: path.join(options.gameDir, "art"),
    entries: manifest.entries,
    defaultRes: manifest.defaultRes,
    cache: new ArtCache(useCache ? path.join(options.gameDir, CACHE_SUBDIR) : null),
    requireAll: options.requireAll ?? requireAllFromEnv(),
  });
  return { ...build, manifest };
}

// --- Для плагіна -----------------------------------------------------------------------------------

/** Чи файл — згенерований атласом (`index.json`, `page-<n>.<хеш>.webp`), а не SVG чи палітра з теки `art/` гри. */
export function isAtlasFile(name: string): boolean {
  return name === ART_INDEX_FILE || /^page-\d+\.[0-9a-f]+\.webp$/.test(name);
}

/**
 * Що змінилося у файлі гри для конвеєра: SVG арту, маніфест чи ні те, ні те. Маніфест — його модулі й типи, а також
 * будь-який файл із `dependencies` останнього збирання (`LoadedManifest`): записи беруть розміри й pivot із мапи гри
 * (`src/sim/home.ts`), і без перезбирання атлас лишився б від старого маніфесту — кадри розтягнуто до нового розміру.
 */
export function artChange(gameDir: string, file: string, dependencies: readonly string[] = []): "svg" | "manifest" | null {
  const absolute = path.resolve(file);
  if (dependencies.some((dependency) => path.relative(path.resolve(dependency), absolute) === "")) return "manifest";
  const rel = path.relative(gameDir, file).split(path.sep).join("/");
  if (rel.startsWith("../") || path.isAbsolute(rel)) return null;
  if (rel.startsWith(`${ART_DIR}/`) && rel.toLowerCase().endsWith(".svg")) return "svg";
  if (rel === "src/view/art/manifest.ts" || rel === "src/view/art/types.ts" || rel.startsWith("src/view/art/manifest/")) return "manifest";
  return null;
}
