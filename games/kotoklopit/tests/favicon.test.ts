// Іконка гри для браузера (§2.1 «Іконка гри»): ICO, SVG і PNG домашнього екрана, які збирання робить із `favicon/tab.svg`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ALLOWED_COLORS } from "../art/palette";
import { faviconFiles, faviconTags, packIco, touchSvg } from "../scripts/favicon/icons";

const gameDir = fileURLToPath(new URL("..", import.meta.url));
const tabSvg = (): string => readFileSync(path.join(gameDir, "favicon", "tab.svg"), "utf8");

interface IcoFrame {
  w: number;
  h: number;
  planes: number;
  bpp: number;
  png: Buffer;
}

/** Кадри ICO за форматом: заголовок 6 байт, записи по 16, дані за зсувами (0 у ширині — 256). */
function readIco(ico: Buffer): IcoFrame[] {
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + i * 16;
    const bytes = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    return {
      w: ico.readUInt8(entry) || 256,
      h: ico.readUInt8(entry + 1) || 256,
      planes: ico.readUInt16LE(entry + 4),
      bpp: ico.readUInt16LE(entry + 6),
      png: ico.subarray(offset, offset + bytes),
    };
  });
}

const blank = (size: number): Promise<Buffer> =>
  sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

/** Альфа пікселя (x, y) PNG. */
async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3] ?? -1;
}

describe("іконка гри для браузера (§2.1)", () => {
  it("ICO складається з PNG: записи кажуть розмір, а зсуви ведуть до самих PNG", async () => {
    const images = [
      { size: 16, png: await blank(16) },
      { size: 256, png: await blank(256) },
    ];
    const frames = readIco(packIco(images));
    expect(frames.map((f) => [f.w, f.h, f.planes, f.bpp])).toEqual([
      [16, 16, 1, 32],
      [256, 256, 1, 32],
    ]);
    expect(frames.map((f) => f.png)).toEqual(images.map((image) => image.png));
  });

  it("збирання дає ICO 16, 32 і 48 з прозорими кутами, сам SVG і непрозору PNG 180 для домашнього екрана", async () => {
    const files = await faviconFiles(gameDir);
    expect([...files.keys()].sort()).toEqual(["apple-touch-icon.png", "favicon.ico", "favicon.svg"]);

    const frames = readIco(files.get("favicon.ico") ?? Buffer.alloc(6));
    expect(frames.map((f) => f.w)).toEqual([16, 32, 48]);
    for (const frame of frames) {
      const meta = await sharp(frame.png).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", frame.w, frame.h]);
      // Тло вкладки прозоре, а голова — на весь квадрат: кут порожній, середина непрозора.
      expect(await alphaAt(frame.png, 0, 0)).toBe(0);
      expect(await alphaAt(frame.png, frame.w / 2, frame.h / 2)).toBe(255);
    }

    expect(files.get("favicon.svg")?.toString("utf8")).toBe(tabSvg());

    // iOS кладе прозоре на чорне, тож тло домашнього екрана — суцільне.
    const touch = sharp(files.get("apple-touch-icon.png") ?? Buffer.alloc(0));
    const meta = await touch.metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 180, 180]);
    expect((await touch.stats()).isOpaque).toBe(true);
  });

  it("кольори іконки — лише з палітри арту (art/STYLE.md §3)", () => {
    for (const svg of [tabSvg(), touchSvg(tabSvg())]) {
      expect(svg).not.toMatch(/rgba?\(|gradient|\b(?:black|white)\b/i);
      const colors = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);
      expect(colors.length).toBeGreaterThan(0);
      expect(colors.filter((color) => !ALLOWED_COLORS.has(color))).toEqual([]);
    }
  });

  it("на домашньому екрані — та сама голова на бірюзовому тлі", () => {
    const touch = touchSvg(tabSvg());
    expect(touch).toMatch(/<rect[^>]*fill="#5f9089"/);
    const head = tabSvg().match(/<path d="[^"]+"/g) ?? [];
    expect(head.length).toBeGreaterThan(0);
    for (const part of head) expect(touch).toContain(part);
  });

  it("кожна сторінка гри посилається на іконки з урахуванням base збірки", () => {
    expect(faviconTags("/games/kotoklopit/")).toEqual([
      { tag: "link", attrs: { rel: "icon", href: "/games/kotoklopit/favicon.ico", sizes: "32x32" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "icon", href: "/games/kotoklopit/favicon.svg", type: "image/svg+xml" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: "/games/kotoklopit/apple-touch-icon.png" }, injectTo: "head" },
    ]);
  });
});
