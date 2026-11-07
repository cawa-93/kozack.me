// Кеш конвеєра арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): файли за ключем — хешем вмісту SVG і
// параметрів — у `node_modules/.cache/kotoklopit-art`. У git worktree `node_modules` — посилання (junction) на спільну
// теку, тож кеш спільний для всіх копій і кількох процесів одночасно: запис атомарний (тимчасовий файл у тій самій теці +
// rename), а читання недописаного файлу неможливе. Кеш — лише прискорення: будь-яка помилка читання чи запису означає
// «немає в кеші», а не збій збирання.
//
// Формати:
// - `<ключ>.frame` — растри шарів кадру: deflate від [4 байти довжини заголовка (LE) | заголовок JSON | RGBA шарів підряд];
//   заголовок — `FrameRasterHeader`;
// - `<ключ>.webp` — закодована сторінка атласу.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import type { FrameLayer } from "../../src/view/art/types";
import type { FrameRaster } from "./raster";

/** Тека кешу в теці гри. */
export const CACHE_SUBDIR = path.join("node_modules", ".cache", "kotoklopit-art");

/** Хеш (sha256, hex) від частин: рядків і буферів, з розділювачем, щоб `ab|c` і `a|bc` не збігалися. */
export function hashOf(...parts: readonly (string | Buffer | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(typeof part === "string" ? Buffer.from(part) : part);
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

/** Файловий кеш; `dir` null — кеш вимкнено. */
export class ArtCache {
  readonly dir: string | null;
  hits = 0;
  misses = 0;

  constructor(dir: string | null) {
    this.dir = dir;
  }

  private file(key: string, ext: string): string | null {
    return this.dir === null ? null : path.join(this.dir, key.slice(0, 2), `${key}.${ext}`);
  }

  /** Вміст за ключем або null. */
  read(key: string, ext: string): Buffer | null {
    const file = this.file(key, ext);
    if (file === null) return null;
    try {
      const data = readFileSync(file);
      this.hits++;
      return data;
    } catch {
      this.misses++;
      return null;
    }
  }

  /** Записати атомарно: тимчасовий файл поруч, потім rename (інший процес бачить або старе, або все нове). */
  write(key: string, ext: string, data: Buffer | Uint8Array): void {
    const file = this.file(key, ext);
    if (file === null) return;
    const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(temp, data);
      renameSync(temp, file);
    } catch {
      // Інший процес саме перейменовує той самий ключ (Windows), диск повний тощо — без кешу.
      try {
        rmSync(temp, { force: true });
      } catch {
        // Нічого.
      }
    }
  }

  /** Растри кадру за ключем або null. */
  readFrame(key: string): FrameRaster | null {
    const packed = this.read(key, "frame");
    if (packed === null) return null;
    try {
      return decodeFrame(inflateSync(packed));
    } catch {
      return null;
    }
  }

  writeFrame(key: string, frame: FrameRaster): void {
    if (this.dir === null) return;
    this.write(key, "frame", deflateSync(encodeFrame(frame), { level: 1 }));
  }
}

/** Заголовок `<ключ>.frame`: полотно, рамка обрізки й шари по порядку (дані — підряд, кожен `w · h · 4` байтів). */
interface FrameRasterHeader {
  canvas: { w: number; h: number };
  trim: { x: number; y: number };
  w: number;
  h: number;
  layers: FrameLayer[];
}

function encodeFrame(frame: FrameRaster): Buffer {
  const header: FrameRasterHeader = {
    canvas: frame.canvas,
    trim: frame.trim,
    w: frame.w,
    h: frame.h,
    layers: frame.layers.map((layer) => layer.layer),
  };
  const json = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json, ...frame.layers.map((layer) => layer.data)]);
}

function decodeFrame(buf: Buffer): FrameRaster {
  const length = buf.readUInt32LE(0);
  const header = JSON.parse(buf.subarray(4, 4 + length).toString()) as FrameRasterHeader;
  const bytes = header.w * header.h * 4;
  let offset = 4 + length;
  const layers = header.layers.map((layer) => {
    const data = Buffer.from(buf.subarray(offset, offset + bytes));
    offset += bytes;
    if (data.length !== bytes) throw new Error("обірваний кадр у кеші");
    return { layer, w: header.w, h: header.h, data };
  });
  return { canvas: header.canvas, trim: header.trim, w: header.w, h: header.h, layers };
}
