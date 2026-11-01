// Заставка завантаження (крок 16): статична, у index.html — видно ще до коду гри; PreloadScene веде її смугу, а якщо атлас
// не прийшов (продакшн), показує в ній повідомлення з кнопкою «Спробувати ще» (`LOAD_FAILED`).

import { describe, expect, it } from "vitest";

import { LOAD_FAILED } from "../src/texts";

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
