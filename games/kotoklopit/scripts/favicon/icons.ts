// Іконка гри для браузера (§2.1 «Іконка гри»): з одного малюнка `favicon/tab.svg` — ICO для вкладки, сам SVG і PNG
// домашнього екрана. Растрів у репозиторії немає: їх щоразу робить збирання (`plugin.ts`).

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import type { HtmlTagDescriptor } from "vite";

import { PALETTE, SHADE } from "../../art/palette";

/** Малюнок іконки відносно теки гри. */
export const FAVICON_SOURCE = "favicon/tab.svg";

/** Файли поруч зі сторінками гри: назва → тип для dev-сервера. */
export const FAVICON_FILES: Readonly<Record<string, string>> = {
  "favicon.ico": "image/x-icon",
  "favicon.svg": "image/svg+xml",
  "apple-touch-icon.png": "image/png",
};

/** Кадри ICO: вкладка (16 і 32 на щільних екранах) і ярлик Windows (48). */
const ICO_SIZES = [16, 32, 48] as const;
/** Розмір, якого чекає iOS для домашнього екрана; Android бере той самий файл. */
const TOUCH_SIZE = 180;
/** Голова на домашньому екрані — частка квадрата: iOS заокруглює кути, а лаунчери Android можуть обрізати й до кола. */
const TOUCH_SCALE = 0.74;

export interface IcoImage {
  size: number;
  png: Buffer;
}

/** ICO з готових PNG (так його читають усі сучасні браузери): заголовок, записи по 16 байт, далі самі PNG. */
export function packIco(images: readonly IcoImage[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const entry = 6 + i * 16;
    // 256 у байті не вміщується: формат пише 0.
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

/** Голова на суцільному тлі для домашнього екрана: iOS кладе прозоре на чорне. */
export function touchSvg(tab: string): string {
  const inner = tab.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${TOUCH_SIZE}" height="${TOUCH_SIZE}">
<rect width="64" height="64" fill="${PALETTE.teal}"/>
<g transform="translate(32 33) scale(${TOUCH_SCALE}) translate(-32 -32)">
<ellipse cx="32" cy="61" rx="24" ry="4.5" fill="${PALETTE.shade}" fill-opacity="${SHADE.base}"/>
${inner}</g>
</svg>
`;
}

/** Растр розміру `size`: librsvg малює одразу в пікселях кадру, а не зменшує більший растр (у 16 px це чіткіше). */
function render(svg: string, size: number): Promise<Buffer> {
  const sized = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\swidth="[^"]*"/, ` width="${size}"`).replace(/\sheight="[^"]*"/, ` height="${size}"`));
  return sharp(Buffer.from(sized)).png().toBuffer();
}

/** Усі файли іконки з малюнка в теці гри: назва (з `FAVICON_FILES`) → вміст. */
export async function faviconFiles(gameDir: string): Promise<Map<string, Buffer>> {
  const tab = await readFile(path.join(gameDir, FAVICON_SOURCE), "utf8");
  const ico = packIco(await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await render(tab, size) }))));
  const touch = await sharp(Buffer.from(touchSvg(tab))).flatten({ background: PALETTE.teal }).png().toBuffer();
  return new Map([
    ["favicon.ico", ico],
    ["favicon.svg", Buffer.from(tab, "utf8")],
    ["apple-touch-icon.png", touch],
  ]);
}

/**
 * Посилання на іконки для `<head>` сторінки. `sizes="32x32"` в ICO — щоб Chrome узяв SVG, а не ICO; ICO лишається для
 * браузерів без SVG-іконок.
 */
export function faviconTags(base: string): HtmlTagDescriptor[] {
  const link = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: "link", attrs, injectTo: "head" });
  return [
    link({ rel: "icon", href: `${base}favicon.ico`, sizes: "32x32" }),
    link({ rel: "icon", href: `${base}favicon.svg`, type: "image/svg+xml" }),
    link({ rel: "apple-touch-icon", href: `${base}apple-touch-icon.png` }),
  ];
}
