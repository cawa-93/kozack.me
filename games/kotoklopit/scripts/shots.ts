// Знімки гри для перевірки графіки (крок 16, GRAPHICS_PLAN.md): сценарії режиму розробки в кількох розмірах екрана
// і попіксельне порівняння двох наборів знімків.
//
//   node games/kotoklopit/scripts/shots.ts [--scenario a,b] [--size 844x390,1280x720] [--gfx iso] [--out тека] [--dpr 1]
//   node games/kotoklopit/scripts/shots.ts --compare <тека A> <тека B> [--diff тека] [--tolerance 0] [--channel-delta 0]
//
// Скрипт сам запускає Vite гри (тієї копії репозиторію, з якої його запущено) на вільному порту з власною текою кешу, тож
// паралельні копії (git worktree) одна одній не заважають. Браузер — Edge через playwright-core.
//
// Знімки детерміновані: той самий код дає ті самі пікселі. Гра йде в реальному часі, тож час у сторінці фальшивий
// (годинник Playwright, на паузі від початку): сторінка завантажується, а потім гра йде рівно `--ms` мілісекунд кадрами
// по 16 мс. `performance.now` починається з нуля, `Math.random` — стала послідовність, анімації CSS на знімку вимкнено,
// WebGL малює програмний SwiftShader (той самий результат на будь-якому залізі; `--gpu` — відеокарта).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { chromium, type Browser, type Page } from "playwright-core";
import sharp from "sharp";
import { createServer, type ViteDevServer } from "vite";

/** Тека гри тієї копії репозиторію, з якої запущено скрипт. */
const GAME_DIR = path.resolve(import.meta.dirname, "..");
const SCENARIOS_DIR = path.join(GAME_DIR, "scenarios");

const DEFAULT_SIZES = "844x390,1280x720";
/** Скільки мілісекунд іде гра від завантаження до знімка. */
const DEFAULT_MS = 2000;
/** Стала «зараз» у сторінці: 26.10.2026, 10:00 за Києвом. */
const CLOCK_START = Date.UTC(2026, 9, 26, 7, 0, 0);
/** Годинник стає на паузу трохи пізніше за встановлення: Playwright не дає зупинити його в минулому. */
const CLOCK_PAUSE = CLOCK_START + 60_000;
const RANDOM_SEED = 0x6b6f746f;
/** Менша сторона екрана до цієї межі — телефон: дотик і мобільний перегляд. */
const PHONE_MAX_SIDE = 500;
const READY_TIMEOUT_MS = 60_000;
const BROWSER_CLOSE_MS = 5_000;

const USAGE = `Знімки сценаріїв гри та їх порівняння.

  node games/kotoklopit/scripts/shots.ts [параметри]
    --scenario a,b       сценарії (назви файлів scenarios/*.json без .json); за замовчуванням усі
    --size WxH,...       розміри вікна в CSS px; за замовчуванням ${DEFAULT_SIZES}
                         (менша сторона ≤ ${PHONE_MAX_SIDE} — телефон: дотик і мобільний перегляд)
    --gfx <значення>     додати ?gfx=<значення> до адреси
    --out <тека>         куди класти PNG і shots.json; за замовчуванням тимчасова тека з комітом
    --dpr <n>            щільність пікселів (deviceScaleFactor), за замовчуванням 1
    --ms <n>             скільки мілісекунд гра йде до знімка, за замовчуванням ${DEFAULT_MS}
    --jobs <n>           скільки сторінок знімати одночасно, за замовчуванням 2
    --url <адреса>       не запускати Vite, а знімати вже запущену гру (напр. прев'ю Netlify)
    --gpu                малювати відеокартою, а не програмно (SwiftShader)
    --verbose            писати кроки кожного знімка

  node games/kotoklopit/scripts/shots.ts --compare <тека A> <тека B> [параметри]
    --diff <тека>        картинки різниці (лише для пар, що відрізняються) і compare.json
    --tolerance <x>      допустима частка різних пікселів у парі: 0.001 чи 0.1%; за замовчуванням 0
    --channel-delta <n>  піксель різний, якщо якийсь канал відрізняється більше ніж на n (0–255), за замовчуванням 0
    --json <файл>        куди записати підсумок; за замовчуванням <diff>/compare.json або <B>/compare.json

Код виходу: 0 — усе гаразд; 1 — знімок не вдався чи різниця більша за поріг; 2 — неправильні параметри.`;

interface Size {
  width: number;
  height: number;
}

interface ShotOptions {
  scenarios: string[];
  sizes: Size[];
  gfx: string | null;
  out: string;
  dpr: number;
  ms: number;
  jobs: number;
  url: string | null;
  gpu: boolean;
  verbose: boolean;
}

interface ShotResult {
  file: string;
  scenario: string;
  width: number;
  height: number;
  /** Ігровий час на знімку: так видно, що гра справді йшла однаково. */
  day: number | null;
  minute: number | null;
  errors: string[];
  warnings: string[];
  ok: boolean;
}

class UsageError extends Error {}

/** Шлях із параметра: відносно теки, з якої запустили npm чи node. */
function resolveUserPath(value: string): string {
  return path.resolve(process.env["INIT_CWD"] ?? process.cwd(), value);
}

function parseSizes(value: string): Size[] {
  return value.split(",").map((part) => {
    const match = /^(\d+)x(\d+)$/.exec(part.trim());
    if (!match) throw new UsageError(`Розмір «${part}» — треба ШИРИНАxВИСОТА, напр. 844x390`);
    return { width: Number(match[1]), height: Number(match[2]) };
  });
}

function parseNumber(name: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw new UsageError(`--${name}: «${value}» — треба число не менше за ${min}`);
  return number;
}

/** Частка: «0.001» чи «0.1%». */
function parseFraction(value: string | undefined): number {
  if (value === undefined) return 0;
  const percent = value.endsWith("%");
  const number = Number(percent ? value.slice(0, -1) : value);
  if (!Number.isFinite(number) || number < 0) throw new UsageError(`--tolerance: «${value}» — треба частку, напр. 0.001 чи 0.1%`);
  return percent ? number / 100 : number;
}

const sizeName = (size: Size): string => `${size.width}x${size.height}`;
const shotFile = (scenario: string, size: Size): string => `${scenario}.${sizeName(size)}.png`;

async function allScenarios(): Promise<string[]> {
  const files = await readdir(SCENARIOS_DIR);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: GAME_DIR, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Коротка назва коміту гри: «c2902a7» чи «c2902a7-dirty», якщо в теці гри є незакомічені зміни. */
function commitLabel(): string {
  const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
  return git(["status", "--porcelain", "--", "."]) ? `${commit}-dirty` : commit;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Vite гри на вільному порту. Кеш — поза node_modules і свій для кожної копії репозиторію: у worktree node_modules —
 * посилання на спільну теку, і паралельні сервери, що ділять node_modules/.vite, ламають один одному залежності.
 */
async function startVite(): Promise<{ server: ViteDevServer; url: string }> {
  const hash = createHash("sha1").update(GAME_DIR.toLowerCase()).digest("hex").slice(0, 12);
  const cacheDir = path.join(tmpdir(), "kotoklopit-vite", hash);
  const server = await createServer({
    root: GAME_DIR,
    configFile: path.join(GAME_DIR, "vite.config.ts"),
    cacheDir,
    logLevel: "warn",
    clearScreen: false,
    server: { host: "127.0.0.1", port: await freePort(), strictPort: false, open: false, watch: null },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    await server.close();
    throw new Error("Vite не повідомив адреси сервера");
  }
  return { server, url };
}

/** Що скрипт знімків додає в сторінку. */
interface ShotsProbe {
  raf: number;
  error: string;
}

/**
 * Скрипт у сторінці до коду гри, одразу після годинника Playwright (він стоїть на паузі): прибирає решту випадковості.
 * - `performance.now` від нуля: інакше початок залежав би від того, скільки мілісекунд минуло між встановленням і паузою
 *   годинника, а з ним — перший крок гри й усі анімації, що залежать від часу.
 * - `requestAnimationFrame` — кадр кожні 16 мс від нуля, на фальшивому `setTimeout`; лічильник кадрів показує, що Phaser
 *   уже запустив свій цикл.
 * - `Math.random` — стала послідовність (mulberry32): її беруть Phaser (seed RND) і серця настрою.
 */
function pageInit(seed: number): void {
  const page = window as unknown as Window & { __shots: ShotsProbe; __pwClock?: unknown };
  const probe: ShotsProbe = { raf: 0, error: "" };
  page.__shots = probe;
  if (page.__pwClock === undefined) {
    probe.error = "годинник Playwright не встановлено до скрипта знімків";
    return;
  }
  let state = seed >>> 0;
  Math.random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clockNow = performance.now.bind(performance);
  const base = clockNow();
  performance.now = (): number => clockNow() - base;
  page.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    probe.raf++;
    return page.setTimeout(() => callback(performance.now()), 16 - (performance.now() % 16));
  };
  page.cancelAnimationFrame = (id: number): void => page.clearTimeout(id);
}

/** Чекати, доки умова в сторінці справдиться: опитуванням із Node, бо таймери сторінки стоять на паузі. */
async function waitInPage(page: Page, what: string, check: () => boolean, timeout = READY_TIMEOUT_MS): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await page.evaluate(check))) {
    if (Date.now() > until) throw new Error(`не дочекалися: ${what}`);
    await sleep(50);
  }
}

function scenarioUrl(base: string, scenario: string, gfx: string | null): string {
  const url = new URL(base);
  url.searchParams.set("scenario", scenario);
  if (gfx !== null) url.searchParams.set("gfx", gfx);
  return url.href;
}

/**
 * Перше відкриття гри в реальному часі: Vite перетворює модулі й може доупакувати залежності, а після цього —
 * перезавантажити сторінку. Знімки починаються, коли сторінка відкривається без перезавантажень.
 */
async function warmUp(browser: Browser, base: string, scenario: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  try {
    const page = await context.newPage();
    let loads = 0;
    page.on("load", () => loads++);
    for (let attempt = 0; attempt < 3; attempt++) {
      loads = 0;
      await page.goto(scenarioUrl(base, scenario, null), { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await sleep(1000);
      if (loads <= 1) return;
    }
  } finally {
    await context.close();
  }
}

async function shoot(browser: Browser, base: string, options: ShotOptions, scenario: string, size: Size): Promise<ShotResult> {
  const file = shotFile(scenario, size);
  const result: ShotResult = { file, scenario, ...size, day: null, minute: null, errors: [], warnings: [], ok: false };
  const phone = Math.min(size.width, size.height) <= PHONE_MAX_SIDE;
  const step = (text: string): void => {
    if (options.verbose) console.log(`    ${file}: ${text}`);
  };
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: options.dpr,
    isMobile: phone,
    hasTouch: phone,
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    // Годинник — до сторінки й до скрипта знімків: він має стояти на паузі з першого рядка коду гри.
    await context.clock.install({ time: CLOCK_START });
    await context.clock.pauseAt(CLOCK_PAUSE);
    await context.addInitScript(pageInit, RANDOM_SEED);
    const page = await context.newPage();
    let loads = 0;
    page.on("load", () => loads++);
    page.on("pageerror", (error) => result.errors.push(`помилка в сторінці: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") result.warnings.push(`console.error: ${message.text()}`);
    });
    step("відкриваю сторінку");
    await page.goto(scenarioUrl(base, scenario, options.gfx), { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    step("сторінка завантажилася");
    const probeError = await page.evaluate(() => (window as unknown as { __shots?: ShotsProbe }).__shots?.error ?? "немає скрипта знімків");
    if (probeError) throw new Error(probeError);
    // Phaser запустив цикл кадрів (а до того створив сцену), режим розробки відкрив сценарій.
    await waitInPage(page, "цикл кадрів Phaser", () => (window as unknown as { __shots: ShotsProbe }).__shots.raf > 0 && document.querySelector("canvas") !== null);
    await waitInPage(page, "сценарій", () => (window as unknown as { kotoklopit?: { persistent: boolean } }).kotoklopit?.persistent === false);
    // Події, що приходять самі (фокус, зміна розміру), — поки час стоїть, щоб гра отримала їх в одну й ту саму мить.
    await page.waitForLoadState("networkidle");
    await sleep(200);
    if (loads !== 1) throw new Error(`сторінка перезавантажилася (${loads} завантажень)`);
    step(`гра запустилася, ${options.ms} мс гри`);
    await page.clock.runFor(options.ms);
    step("знімаю");
    const time = await page.evaluate(() => {
      const session = (window as unknown as { kotoklopit?: { save: { current: { day: number; minute: number } } } }).kotoklopit;
      return session ? { day: session.save.current.day, minute: session.save.current.minute } : null;
    });
    result.day = time?.day ?? null;
    result.minute = time?.minute ?? null;
    await page.screenshot({ path: path.join(options.out, file), animations: "disabled", caret: "hide" });
    result.ok = result.errors.length === 0;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return result;
}

async function runShots(options: ShotOptions): Promise<number> {
  const started = Date.now();
  await mkdir(options.out, { recursive: true });
  const log = (text: string): void => {
    if (options.verbose) console.log(text);
  };
  const vite = options.url === null ? await startVite() : null;
  const base = options.url ?? vite?.url ?? "";
  log(`Гра: ${base}`);
  const args = options.gpu ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = await chromium.launch({ channel: "msedge", args: [...args, "--force-color-profile=srgb"] });
  const results: ShotResult[] = [];
  try {
    const first = options.scenarios[0];
    if (first !== undefined) await warmUp(browser, base, first);
    log("Гра відкривається без перезавантажень");
    const queue = options.scenarios.flatMap((scenario) => options.sizes.map((size) => ({ scenario, size })));
    const total = queue.length;
    const worker = async (): Promise<void> => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const result = await shoot(browser, base, options, job.scenario, job.size);
        results.push(result);
        const time = result.minute === null ? "" : ` (день ${result.day}, ${Math.floor(result.minute / 60)}:${String(Math.floor(result.minute % 60)).padStart(2, "0")})`;
        console.log(`[${results.length}/${total}] ${result.ok ? "✓" : "✗"} ${result.file}${time}`);
        for (const line of [...result.errors, ...result.warnings]) console.log(`    ${line}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.jobs, total) }, () => worker()));
  } finally {
    // Браузер закривається за частку секунди, але потім Playwright прибирає тимчасовий профіль, а на комп'ютері автора
    // частину файлів профілю Edge видалити не вдається (доступ заборонено), і Playwright повторює спроби хвилинами.
    // Тож чекаємо недовго: процес браузера на той час уже завершився, а сам скрипт виходить через process.exit.
    await Promise.race([browser.close(), sleep(BROWSER_CLOSE_MS)]);
    await vite?.server.close();
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  const failed = results.filter((result) => !result.ok);
  const durationMs = Date.now() - started;
  const manifest = {
    commit: commitLabel(),
    gameDir: GAME_DIR,
    url: options.url,
    gfx: options.gfx,
    dpr: options.dpr,
    ms: options.ms,
    gpu: options.gpu,
    durationMs,
    shots: results,
  };
  await writeFile(path.join(options.out, "shots.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Знімків: ${results.length - failed.length} з ${results.length}, ${(durationMs / 1000).toFixed(0)} с → ${options.out}`,
  );
  return failed.length === 0 ? 0 : 1;
}

interface PairResult {
  file: string;
  status: "same" | "different" | "size" | "missing-a" | "missing-b";
  width?: number;
  height?: number;
  diffPixels?: number;
  fraction?: number;
  /** Рамка різниці в пікселях знімка: x, y, ширина, висота. */
  box?: [number, number, number, number];
  overTolerance: boolean;
}

async function pngFiles(dir: string): Promise<Set<string>> {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) throw new UsageError(`Теки «${dir}» немає`);
  return new Set((await readdir(dir)).filter((file) => file.toLowerCase().endsWith(".png")));
}

async function readRaw(file: string): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function comparePair(a: string, b: string, file: string, diffDir: string | null, tolerance: number, channelDelta: number): Promise<PairResult> {
  const [imageA, imageB] = await Promise.all([readRaw(path.join(a, file)), readRaw(path.join(b, file))]);
  const { width, height } = imageA;
  if (width !== imageB.width || height !== imageB.height) return { file, status: "size", width, height, overTolerance: true };
  const diff = diffDir === null ? null : Buffer.alloc(width * height * 4);
  let count = 0;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(imageA.data[i + c]! - imageB.data[i + c]!));
      const different = delta > channelDelta;
      if (different) {
        count++;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      if (diff) {
        if (different) diff.set([230, 0, 40, 255], i);
        else {
          // Незмінене — блідою сірою тінню знімка A, щоб було видно, де різниця.
          const gray = 0.299 * imageA.data[i]! + 0.587 * imageA.data[i + 1]! + 0.114 * imageA.data[i + 2]!;
          const light = Math.round(190 + gray / 4);
          diff.set([light, light, light, 255], i);
        }
      }
    }
  }
  const fraction = count / (width * height);
  const result: PairResult = { file, status: count === 0 ? "same" : "different", width, height, diffPixels: count, fraction, overTolerance: fraction > tolerance };
  if (count > 0) {
    result.box = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    if (diff && diffDir !== null) await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(path.join(diffDir, file));
  }
  return result;
}

async function runCompare(a: string, b: string, diffDir: string | null, jsonFile: string, tolerance: number, channelDelta: number): Promise<number> {
  const [filesA, filesB] = await Promise.all([pngFiles(a), pngFiles(b)]);
  if (diffDir !== null) await mkdir(diffDir, { recursive: true });
  const names = [...new Set([...filesA, ...filesB])].sort();
  const results: PairResult[] = [];
  for (const file of names) {
    if (!filesA.has(file)) results.push({ file, status: "missing-a", overTolerance: true });
    else if (!filesB.has(file)) results.push({ file, status: "missing-b", overTolerance: true });
    else results.push(await comparePair(a, b, file, diffDir, tolerance, channelDelta));
  }
  const percent = (fraction: number): string => `${(fraction * 100).toFixed(4)}%`;
  for (const result of results) {
    if (result.status === "same") continue;
    const mark = result.overTolerance ? "✗" : "≈";
    if (result.status === "missing-a") console.log(`${mark} ${result.file}: немає в A`);
    else if (result.status === "missing-b") console.log(`${mark} ${result.file}: немає в B`);
    else if (result.status === "size") console.log(`${mark} ${result.file}: різні розміри`);
    else console.log(`${mark} ${result.file}: ${result.diffPixels} px (${percent(result.fraction ?? 0)}), рамка ${result.box?.join(", ")}`);
  }
  const same = results.filter((result) => result.status === "same").length;
  const over = results.filter((result) => result.overTolerance).length;
  const summary = {
    a,
    b,
    tolerance,
    channelDelta,
    pairs: results.length,
    same,
    different: results.length - same,
    overTolerance: over,
    results,
  };
  await mkdir(path.dirname(jsonFile), { recursive: true });
  await writeFile(jsonFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Пар: ${results.length}, однакових: ${same}, різних: ${results.length - same}, понад поріг ${percent(tolerance)}: ${over} → ${jsonFile}`);
  return over === 0 ? 0 : 1;
}

/** Параметри командного рядка. */
const OPTIONS = {
  help: { type: "boolean", short: "h" },
  scenario: { type: "string" },
  size: { type: "string" },
  gfx: { type: "string" },
  out: { type: "string" },
  dpr: { type: "string" },
  ms: { type: "string" },
  jobs: { type: "string" },
  url: { type: "string" },
  gpu: { type: "boolean" },
  verbose: { type: "boolean" },
  compare: { type: "boolean" },
  diff: { type: "string" },
  tolerance: { type: "string" },
  "channel-delta": { type: "string" },
  json: { type: "string" },
} as const;

function parseCommandLine() {
  try {
    return parseArgs({ allowPositionals: true, options: OPTIONS });
  } catch (error) {
    // Невідомий параметр чи параметр без значення.
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseCommandLine();
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.compare) {
    const [a, b, ...rest] = positionals;
    if (a === undefined || b === undefined || rest.length > 0) throw new UsageError("--compare: треба дві теки, A і B");
    const dirA = resolveUserPath(a);
    const dirB = resolveUserPath(b);
    const diffDir = values.diff === undefined ? null : resolveUserPath(values.diff);
    const jsonFile = values.json === undefined ? path.join(diffDir ?? dirB, "compare.json") : resolveUserPath(values.json);
    const channelDelta = parseNumber("channel-delta", values["channel-delta"], 0, 0);
    return runCompare(dirA, dirB, diffDir, jsonFile, parseFraction(values.tolerance), channelDelta);
  }
  if (positionals.length > 0) throw new UsageError(`Зайві параметри: ${positionals.join(" ")}`);
  const known = await allScenarios();
  const scenarios = values.scenario === undefined ? known : values.scenario.split(",").map((name) => name.trim().replace(/\.json$/, ""));
  const unknown = scenarios.filter((name) => !known.includes(name));
  if (unknown.length > 0 && values.url === undefined) throw new UsageError(`Немає сценаріїв: ${unknown.join(", ")} (є: ${known.join(", ")})`);
  const options: ShotOptions = {
    scenarios,
    sizes: parseSizes(values.size ?? DEFAULT_SIZES),
    gfx: values.gfx ?? null,
    out: values.out === undefined ? path.join(tmpdir(), "kotoklopit-shots", commitLabel()) : resolveUserPath(values.out),
    dpr: parseNumber("dpr", values.dpr, 1, 0.5),
    ms: Math.round(parseNumber("ms", values.ms, DEFAULT_MS, 0)),
    jobs: Math.max(1, Math.round(parseNumber("jobs", values.jobs, 2, 1))),
    url: values.url ?? null,
    gpu: values.gpu ?? false,
    verbose: values.verbose ?? false,
  };
  return runShots(options);
}

let exitCode: number;
try {
  exitCode = await main();
} catch (error) {
  exitCode = error instanceof UsageError ? 2 : 1;
  console.error(error instanceof UsageError ? `${error.message}\n\n${USAGE}` : error);
}
// Явний вихід: незавершене прибирання профілю браузера (див. runShots) не тримає процес.
process.exit(exitCode);
