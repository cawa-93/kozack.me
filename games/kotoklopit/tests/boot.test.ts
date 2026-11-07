// Заставка завантаження (крок 16): статична, у index.html — видно ще до коду гри; PreloadScene веде її смугу, а якщо атлас
// не прийшов (продакшн), показує в ній повідомлення з кнопкою «Спробувати ще» (`LOAD_FAILED`).

import { describe, expect, it } from "vitest";

import { LOAD_FAILED } from "../src/texts";
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

  it("повідомлення, що гра не завантажилася, — заголовок, текст і кнопка", () => {
    expect(LOAD_FAILED.title).toBeTruthy();
    expect(LOAD_FAILED.body).toMatch(/спробуйте ще раз/);
    expect(LOAD_FAILED.retry).toBe("Спробувати ще");
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
