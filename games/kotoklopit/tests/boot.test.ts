// Заставка завантаження (крок 16): статична, у index.html — видно ще до коду гри; PreloadScene веде її смугу, а якщо атлас
// не прийшов (продакшн), показує в ній повідомлення з кнопкою «Спробувати ще» (`#boot-failed`). Те саме повідомлення — і коли
// не прийшов чи впав сам код гри, ще до PreloadScene (запобіжник у index.html).

import { describe, expect, it } from "vitest";

import { AtlasLoadProgress, DONE_SHARE, INDEX_SHARE, PAGE_BYTES_PER_PIXEL } from "../src/view/art/loadprogress";

const pages = import.meta.glob<string>("../index.html", { query: "?raw", import: "default", eager: true });
const html = pages["../index.html"] ?? "";

describe("заставка завантаження", () => {
  it("у index.html: назва гри, смуга й місце для повідомлення — без зовнішніх стилів і скриптів", () => {
    expect(html).toMatch(/<div class="boot" id="boot"[^>]*>/);
    expect(html).toMatch(/<p class="boot-title">Котоклопіт<\/p>/);
    expect(html).toContain('class="boot-bar"');
    expect(html).toContain('class="boot-fail"');
    // Стиль заставки — у самій сторінці: зовнішній CSS прийшов би разом із кодом гри, коли заставка вже не потрібна.
    expect(html).toMatch(/<style>[\s\S]*\.boot\s*\{[\s\S]*<\/style>/);
    expect(html).toContain("--boot-progress");
  });

  it("заставка — над полотном гри: після #game у документі", () => {
    expect(html.indexOf('id="boot"')).toBeGreaterThan(html.indexOf('id="game"'));
  });

  it("повідомлення, що гра не завантажилася, — заголовок, текст і кнопка (`#boot-failed`)", () => {
    const failed = template();
    expect(failed).toMatch(/<p class="boot-fail-title">Гра не завантажилася<\/p>/);
    expect(failed).toMatch(/<p>[^<]*інтернет[^<]*<\/p>/);
    expect(failed).toMatch(/<button type="button" class="button primary">Спробувати ще<\/button>/);
  });
});

/** Вміст `<template id="boot-failed">`. */
function template(): string {
  return /<template id="boot-failed">([\s\S]*?)<\/template>/.exec(html)?.[1] ?? "";
}

/** Запобіжник заставки — звичайний (не модуль) скрипт у index.html. */
function guard(): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");
  expect(scripts).toHaveLength(1);
  return scripts[0] ?? "";
}

type Listener = (event: { target: unknown }) => void;

/** Сторінка з заставкою для запобіжника: вікно, документ, заставка, шаблон повідомлення й перезавантаження. */
function bootPage(readyState: "loading" | "complete" = "complete") {
  const listeners: { type: string; listener: Listener; capture: boolean }[] = [];
  const ready: (() => void)[] = [];
  const classes = new Set<string>();
  const attributes = new Set<string>();
  let reloads = 0;
  let focused = 0;
  const clicks: (() => void)[] = [];
  const button = {
    addEventListener: (type: string, listener: () => void) => {
      if (type === "click") clicks.push(listener);
    },
    focus: () => focused++,
  };
  const box = {
    innerHTML: "",
    querySelector: (selector: string) => (selector === "button" && box.innerHTML.includes("<button") ? button : null),
  };
  const root = {
    isConnected: true,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
    hasAttribute: (name: string) => attributes.has(name),
    querySelector: (selector: string) => (selector === ".boot-fail" ? box : null),
  };
  const document = {
    readyState,
    getElementById: (id: string) =>
      document.readyState === "loading" ? null : id === "boot" ? root : id === "boot-failed" ? { innerHTML: template() } : null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === "DOMContentLoaded") ready.push(listener);
    },
  };
  const window = {
    addEventListener: (type: string, listener: Listener, capture?: boolean) => listeners.push({ type, listener, capture: capture === true }),
  };
  const location = { reload: () => reloads++ };
  new Function("window", "document", "location", guard())(window, document, location);
  /** Подія `error` на вікні: помилка ресурсу (`target` — елемент) не спливає, тож її чують лише на перехопленні. */
  const error = (target: unknown): void => {
    const resource = target !== window;
    for (const entry of listeners) if (entry.type === "error" && (entry.capture || !resource)) entry.listener({ target });
  };
  return {
    window,
    root,
    classes,
    attributes,
    box,
    error,
    click: () => clicks.forEach((click) => click()),
    /** Сторінку прочитано: заставка є. */
    parsed: () => {
      document.readyState = "complete";
      ready.forEach((listener) => listener());
    },
    reloads: () => reloads,
    focused: () => focused,
  };
}

describe("запобіжник заставки: код гри не прийшов чи впав до PreloadScene", () => {
  it("скрипт гри не прийшов — повідомлення з шаблону замість смуги, кнопка перезавантажує сторінку", () => {
    const page = bootPage();
    page.error({ tagName: "SCRIPT" });
    expect(page.classes.has("boot-failed")).toBe(true);
    expect(page.box.innerHTML).toBe(template());
    expect(page.focused()).toBe(1);
    page.click();
    expect(page.reloads()).toBe(1);
  });

  it("не прийшов стиль гри чи частина коду — так само; іконка вкладки чи наперед узятий атлас — ні (їх беруть ще раз)", () => {
    for (const rel of ["stylesheet", "modulepreload"]) {
      const page = bootPage();
      page.error({ tagName: "LINK", rel });
      expect(page.classes.has("boot-failed"), rel).toBe(true);
    }
    for (const target of [{ tagName: "LINK", rel: "icon" }, { tagName: "LINK", rel: "preload" }, { tagName: "IMG" }]) {
      const page = bootPage();
      page.error(target);
      expect(page.classes.has("boot-failed"), JSON.stringify(target)).toBe(false);
    }
  });

  it("код гри впав на старті — повідомлення; заставку вже веде PreloadScene (`data-started`) — ні, свій збій вона показує сама", () => {
    const early = bootPage();
    early.error(early.window);
    expect(early.classes.has("boot-failed")).toBe(true);
    const started = bootPage();
    started.attributes.add("data-started");
    started.error(started.window);
    started.error({ tagName: "SCRIPT" });
    expect(started.classes.has("boot-failed")).toBe(false);
  });

  it("повідомлення вже на заставці (гра в іншій вкладці) чи заставки вже немає — не чіпає", () => {
    const busy = bootPage();
    busy.classes.add("boot-busy");
    busy.error({ tagName: "SCRIPT" });
    expect(busy.classes.has("boot-failed")).toBe(false);
    expect(busy.box.innerHTML).toBe("");
    const gone = bootPage();
    gone.root.isConnected = false;
    gone.error({ tagName: "SCRIPT" });
    expect(gone.classes.has("boot-failed")).toBe(false);
  });

  it("запобіжник — у <head>: збірка ставить код гри, його частини й стиль у кінець <head>, а запобіжник має чути, якщо ті не прийдуть", () => {
    expect(html.indexOf("<script>")).toBeGreaterThan(0);
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</head>"));
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it("файл не прийшов, ще поки сторінку читають (заставки ще немає), — повідомлення, щойно її прочитали", () => {
    const page = bootPage("loading");
    page.error({ tagName: "LINK", rel: "stylesheet" });
    expect(page.classes.has("boot-failed")).toBe(false);
    page.parsed();
    expect(page.classes.has("boot-failed")).toBe(true);
  });
});

describe("смуга заставки за байтами (AtlasLoadProgress)", () => {
  /** Частка смуги на сторінки: між index.json і хвостом на розпакування й старт дня. */
  const PAGES = 1 - INDEX_SHARE - DONE_SHARE;
  const PAGE_LIST = [
    { file: "page-0.a.webp", w: 2048, h: 2048, bytes: 400_000 },
    { file: "page-1.b.webp", w: 2048, h: 2048, bytes: 1_000_000 },
    { file: "page-2.c.webp", w: 1024, h: 512, bytes: 600_000 },
  ];

  it("index.json — перша, мала частка; далі — байти сторінок, що прийшли, до байтів усіх сторінок", () => {
    const p = new AtlasLoadProgress();
    expect(p.indexProgress(0.5)).toBeCloseTo(INDEX_SHARE / 2, 9);
    expect(p.indexProgress(1)).toBeCloseTo(INDEX_SHARE, 9);
    expect(p.pages(PAGE_LIST)).toBeCloseTo(INDEX_SHARE, 9);
    // Сторінки йдуть разом: половина байтів кожної — половина смуги сторінок, хоч жодна ще не прийшла (раніше — стояла).
    p.pageProgress(0, 200_000, 400_000);
    p.pageProgress(1, 500_000, 1_000_000);
    expect(p.pageProgress(2, 300_000, 600_000)).toBeCloseTo(INDEX_SHARE + PAGES * 0.5, 9);
    p.pageDone(0);
    p.pageDone(1);
    // Усе прийшло — лишається хвіст на розпакування сторінок і старт дня: смуга не стоїть повною, поки гра ще не готова.
    expect(p.pageDone(2)).toBeCloseTo(1 - DONE_SHARE, 9);
    expect(p.value).toBeLessThan(1);
  });

  it("рівномірно: та сама кількість байтів — той самий крок смуги, хоч би якої сторінки", () => {
    const p = new AtlasLoadProgress();
    p.indexProgress(1);
    p.pages(PAGE_LIST);
    const a = p.pageProgress(1, 100_000, 1_000_000);
    const b = p.pageProgress(2, 100_000, 600_000);
    const c = p.pageProgress(0, 100_000, 400_000);
    expect(a - INDEX_SHARE).toBeCloseTo((PAGES * 100_000) / 2_000_000, 9);
    expect(b - a).toBeCloseTo(a - INDEX_SHARE, 9);
    expect(c - b).toBeCloseTo(a - INDEX_SHARE, 9);
  });

  it("не спадає: подія з меншими байтами, розмір із заголовків більший за оцінку, нова спроба — смуга не повертається", () => {
    const p = new AtlasLoadProgress();
    p.indexProgress(1);
    p.pages(PAGE_LIST);
    const a = p.pageProgress(1, 600_000, 1_000_000);
    expect(p.pageProgress(1, 300_000, 1_000_000)).toBe(a);
    expect(p.indexProgress(0)).toBe(a);
    // Старий index.json без bytes: оцінка за площею, а сервер каже більше — смуга стоїть, а не відкочується.
    const old = new AtlasLoadProgress();
    old.pages([{ file: "p.webp", w: 1000, h: 1000 }]);
    const est = 1000 * 1000 * PAGE_BYTES_PER_PIXEL;
    const half = old.pageProgress(0, est / 2, 0);
    expect(half).toBeCloseTo(INDEX_SHARE + PAGES * 0.5, 9);
    expect(old.pageProgress(0, est / 2 + 1, est * 4)).toBe(half);
    expect(old.pageProgress(0, est * 3, est * 4)).toBeCloseTo(INDEX_SHARE + PAGES * 0.75, 9);
    // Байтів більше, ніж обіцяв index.json, — не далі за кінець сторінки.
    const over = new AtlasLoadProgress();
    over.pages([PAGE_LIST[0]!]);
    expect(over.pageProgress(0, 900_000, 900_000)).toBeLessThanOrEqual(1);
  });

  it("повтор («Спробувати ще»): сторінки, що вже прийшли, — уже на смузі", () => {
    const p = new AtlasLoadProgress();
    p.indexProgress(1);
    const share = (400_000 + 600_000) / 2_000_000;
    expect(p.pages(PAGE_LIST, [true, false, true])).toBeCloseTo(INDEX_SHARE + PAGES * share, 9);
    expect(p.pageDone(1)).toBeCloseTo(1 - DONE_SHARE, 9);
  });
});
