// Vite-плагін конвеєра арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): атлас із SVG теки `art/` за
// маніфестом (`build.ts`) — у dev з пам'яті за адресою `${base}art/…` і з перезбиранням на гарячу, у `vite build` —
// файлами `art/index.json` і `art/page-<n>.<хеш>.webp` у теці збірки. Нічого не пише в теку гри (окрім кешу в
// `node_modules/.cache/kotoklopit-art`).
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою): тут лише вбудовані модулі Node і `vite`, а сам
// конвеєр (`build.ts` і код гри, який він бере, — з імпортами без розширень) завантажує Vite (`runnerImport`). Так
// збирач конфігу Vite не тягне в конфіг код гри.
//
// У тестах (Vitest читає той самий vite.config.ts) плагін вимкнено.

import path from "node:path";

import { runnerImport, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";

type Art = typeof import("./build.ts");
type ArtBuild = Awaited<ReturnType<Art["buildGameArt"]>>;

/** Скільки мілісекунд чекати тиші після зміни файлу, перш ніж перезбирати (git checkout міняє десятки файлів разом). */
const SETTLE_MS = 80;
/** Скільки помилок і попереджень показувати в лозі dev-сервера. */
const LOG_LIMIT = 20;

export interface ArtPluginOptions {
  /** Тека гри; за замовчуванням — корінь Vite. */
  gameDir?: string;
}

/** Модуль конвеєра: завантажується раз на процес (зміни в коді конвеєра — після перезапуску сервера). */
async function loadArt(gameDir: string): Promise<Art> {
  const { module } = await runnerImport<Art>(path.join(import.meta.dirname, "build.ts"), { root: gameDir, logLevel: "error" });
  return module;
}

export function artPlugin(options: ArtPluginOptions = {}): Plugin {
  let config: ResolvedConfig | null = null;
  let art: Art | null = null;
  let building: Promise<ArtBuild> | null = null;
  const gameDir = (): string => options.gameDir ?? config?.root ?? process.cwd();

  return {
    name: "kotoklopit-art",
    // Vitest бере vite.config.ts гри: тестам атлас не потрібен.
    apply: () => !process.env["VITEST"],

    async configResolved(resolved) {
      config = resolved;
      art = await loadArt(gameDir());
    },

    configureServer(server) {
      if (art) serveArt(server, art, gameDir());
    },

    buildStart() {
      if (config?.command !== "build" || !art) return;
      building = art.buildGameArt({ gameDir: gameDir() });
      // Помилку покаже generateBundle; тут — лише щоб не було «необробленої відмови», поки збирається код.
      building.catch(() => undefined);
    },

    async generateBundle() {
      if (!building || !art) return;
      const build = await building;
      for (const warning of build.warnings) this.warn(warning);
      if (build.errors.length > 0) this.error(`Арт (${build.errors.length}):\n- ${build.errors.join("\n- ")}`);
      for (const [name, source] of build.files) this.emitFile({ type: "asset", fileName: `${art.ART_DIR}/${name}`, source });
      config?.logger.info(art.describeBuild(build));
    },
  };
}

/**
 * Dev: атлас збирається при старті сервера й після кожної зміни SVG чи маніфесту (з усім, що він імпортує, — мапою гри
 * `src/sim/home.ts` тощо: `dependencies` останнього збирання); запити `${base}art/…` чекають поточного збирання, тож
 * сторінка, яку перезавантажили після зміни, бачить уже новий атлас. Зміна SVG перезавантажує сторінку, якщо атлас
 * справді змінився (зміну модулів маніфесту й того, що вони імпортують, Vite перезавантажує сам).
 */
function serveArt(server: ViteDevServer, art: Art, gameDir: string): void {
  const logger = server.config.logger;
  const prefix = `${server.config.base}${art.ART_DIR}/`;
  let current: ArtBuild | null = null;
  /** Файли, з яких зібрано маніфест останнього вдалого збирання: їхня зміна — зміна маніфесту. */
  let dependencies: readonly string[] = [];
  let running: Promise<void> | null = null;
  let dirty = false;
  let svgChanged = false;
  let first = true;

  const report = (build: ArtBuild): void => {
    const lines = [...build.errors.map((e) => `помилка: ${e}`), ...build.warnings];
    for (const line of lines.slice(0, LOG_LIMIT)) logger.warn(`  арт — ${line}`, { timestamp: true });
    if (lines.length > LOG_LIMIT) logger.warn(`  арт — … ще ${lines.length - LOG_LIMIT}`, { timestamp: true });
    logger.info(art.describeBuild(build), { timestamp: true });
  };

  const fingerprint = (build: ArtBuild | null): string => build?.files.get(art.ART_INDEX_FILE)?.toString() ?? "";

  const kick = (): void => {
    dirty = true;
    if (running) return;
    running = (async () => {
      while (dirty) {
        dirty = false;
        if (!first) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        // Нові зміни, поки чекали, — чекати далі.
        if (dirty) continue;
        const reload = svgChanged;
        svgChanged = false;
        const before = fingerprint(current);
        try {
          current = await art.buildGameArt({ gameDir });
          dependencies = current.manifest.dependencies;
          report(current);
        } catch (error) {
          // Маніфест не завантажився (помилка в записах чи синтаксис) — лишається попередній атлас.
          logger.error(`атлас арту не зібрано: ${error instanceof Error ? error.message : String(error)}`, { timestamp: true });
        }
        if (!first && reload && !dirty && fingerprint(current) !== before) server.ws.send({ type: "full-reload", path: "*" });
        first = false;
      }
      running = null;
    })();
  };

  const ready = async (): Promise<ArtBuild | null> => {
    while (running) await running;
    return current;
  };

  server.watcher.on("all", (_event, file) => {
    const change = art.artChange(gameDir, file, dependencies);
    if (change === null) return;
    if (change === "svg") svgChanged = true;
    kick();
  });
  // SVG арту лежать у корені гри, тож Vite за ними вже стежить; тека може з'явитися пізніше.
  server.watcher.add(path.join(gameDir, art.ART_DIR));

  server.middlewares.use((req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0] ?? "";
    if (!pathname.startsWith(prefix)) {
      next();
      return;
    }
    const name = decodeURIComponent(pathname.slice(prefix.length));
    // Лише згенероване: index.json і сторінки; решту `art/` (SVG, палітру) Vite віддає як файли гри.
    if (!art.isAtlasFile(name)) {
      next();
      return;
    }
    ready().then(
      (build) => {
        const data = build?.files.get(name);
        if (!data) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "image/webp");
        res.setHeader("Content-Length", String(data.length));
        // Сторінки з хешем у назві не змінюються; index.json — щоразу свіжий.
        res.setHeader("Cache-Control", name === art.ART_INDEX_FILE ? "no-cache" : "max-age=31536000, immutable");
        res.end(data);
      },
      (error: unknown) => next(error),
    );
  });

  kick();
}
