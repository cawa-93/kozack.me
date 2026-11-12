// Файли SVG інтерфейсу в збірці (§2.1 «Малювання й завантаження»): які імпорти збірка бере на себе, назва файлу з хешем і
// адреса `data:` малого файлу. Без Vite: їх кличуть плагін і тести.

import { createHash } from "node:crypto";

/** Імпорт SVG: файл і те, чим він стає в коді гри, — текстом (`?raw`), окремим файлом (`?no-inline`) чи адресою (`?url`). */
export interface SvgImport {
  file: string;
  as: "raw" | "file" | "url";
}

/** Імпорт `id` — SVG теки `artDir`, який гра бере текстом чи адресою; інакше null. */
export function svgImport(id: string, artDir: string): SvgImport | null {
  const at = id.indexOf("?");
  if (at < 0) return null;
  const file = id.slice(0, at).replaceAll("\\", "/");
  const dir = `${artDir.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  if (!file.startsWith(dir) || !file.endsWith(".svg")) return null;
  const query = new URLSearchParams(id.slice(at + 1));
  const as = query.has("raw") ? "raw" : query.has("no-inline") ? "file" : query.has("url") ? "url" : null;
  return as === null ? null : { file, as };
}

/** Назва файлу збірки з хешем вмісту: вміст змінився — нова адреса, тож файл можна кешувати надовго. */
export function hashedName(name: string, extension: string, source: string): string {
  return `${name}-${createHash("sha256").update(source).digest("base64url").slice(0, 8)}.${extension}`;
}

const NESTED_QUOTES = /"[^"']*'[^"]*"|'[^'"]*"[^']*'/;

/** Адреса `data:` малого SVG — так само, як її складає Vite: без base64, де це безпечно (так коротше й краще стискається). */
export function svgDataUrl(svg: string): string {
  if (svg.includes("<text") || svg.includes("<foreignObject") || NESTED_QUOTES.test(svg)) return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const escaped = svg.trim().replaceAll('"', "'").replaceAll("%", "%25").replaceAll("#", "%23").replaceAll("<", "%3c").replaceAll(">", "%3e").replaceAll(/\s+/g, "%20");
  return `data:image/svg+xml,${escaped}`;
}
