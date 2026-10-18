// Спільне для генератора піксельарту (§11.4): зображення RGBA, PNG-кодер без залежностей,
// seeded RNG, шум, дизеринг і палітра гри.

import zlib from "node:zlib";

// ======================= палітра (дарк-фентезі, §11.4) =======================

export const PAL = {
  clear: null,
  black: 0x0b0a0c,
  ink: 0x151319,
  shadow: 0x1f1c24,
  deep: 0x2a2630,
  // Камінь, нейтральний.
  stone0: 0x35313b,
  stone1: 0x47424c,
  stone2: 0x5d5761,
  stone3: 0x78717a,
  stone4: 0x9a929a,
  bone: 0xc9bfae,
  parchment: 0xe6dcc6,
  // Бетон і побілка складу.
  conc0: 0x3e3a35,
  conc1: 0x4d4943,
  conc2: 0x5b574f,
  conc3: 0x6b665d,
  lime0: 0x8e877a,
  lime1: 0xaaa293,
  lime2: 0xc4bcab,
  lime3: 0xdcd4c1,
  brick: 0x7a3b2c,
  // Дерево й шкіра.
  wood0: 0x2b1d16,
  wood1: 0x3f2a1e,
  wood2: 0x5a3c28,
  wood3: 0x7a5436,
  wood4: 0x9c7249,
  tan: 0xbf9a6a,
  // Холодний тесаний камінь замку.
  slate0: 0x232833,
  slate1: 0x2f3643,
  slate2: 0x3f4756,
  slate3: 0x566072,
  slate4: 0x77829a,
  // Мох і вода.
  moss0: 0x243020,
  moss1: 0x3a4a28,
  moss2: 0x5a6e34,
  water0: 0x1d2a38,
  water1: 0x2f4658,
  water2: 0x5d7f96,
  // Печера: ґрунт, скеля, люмінесценція.
  soil0: 0x1c1a17,
  soil1: 0x2a2620,
  soil2: 0x3b352b,
  soil3: 0x4f473a,
  rock0: 0x1f2426,
  rock1: 0x2d3437,
  rock2: 0x40494c,
  rock3: 0x5a6568,
  teal0: 0x1d3a3a,
  teal1: 0x2f6660,
  teal2: 0x5fb3a0,
  glow: 0xa8f0d6,
  // Глибока печера: органіка.
  vio0: 0x1a1420,
  vio1: 0x2a1f33,
  vio2: 0x3f2e4c,
  vio3: 0x5a4468,
  // Акценти.
  blood0: 0x4a1616,
  blood1: 0x7a2420,
  blood2: 0xa83a2c,
  fire0: 0xc2561e,
  fire1: 0xe89a34,
  fire2: 0xf6d27a,
  fire3: 0xfff4d2,
  metal0: 0x3a3d44,
  metal1: 0x5c616b,
  metal2: 0x8a8f98,
  metal3: 0xbcc1c8,
  green0: 0x2c5a38,
  green1: 0x5bbf7a,
  sky0: 0xcfe3f5,
  sky1: 0xf4f9ff,
  grass0: 0x3f6a34,
  grass1: 0x5b8a45,
  web: 0xd8d6cc,
};

// ======================= зображення =======================

export class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /** Колір 0xRRGGBB (або null — прозорий піксель). a — непрозорість 0..255. */
  set(x, y, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c === null || c === undefined) {
      this.data[i + 3] = 0;
      return;
    }
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = a;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  rect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  fill(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = fn(x, y);
      if (c !== undefined) this.set(x, y, c);
    }
  }

  /** Заповнений диск (у центрі пікселів). */
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }

  /** Відрізок Брезенгема. */
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Накласти інше зображення (прозорі пікселі пропускаються). */
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.alpha(x, y) > 0) this.set(dx + x, dy + y, src.get(x, y), src.alpha(x, y));
  }

  /** Копія, повернута на 90° × k за годинниковою стрілкою (лише для квадратних). */
  rot90(k = 1) {
    let src = this;
    for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
      const out = new Img(src.h, src.w);
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c !== null) out.set(src.h - 1 - y, x, c, src.alpha(x, y));
      }
      src = out;
    }
    return src;
  }

  flipX() {
    const out = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.get(x, y);
      if (c !== null) out.set(this.w - 1 - x, y, c, this.alpha(x, y));
    }
    return out;
  }

  /** Темний контур навколо непрозорих пікселів (лише в прозорих сусідах, 4-зв'язно). */
  outline(c) {
    const pts = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) pts.push([x, y]);
    }
    for (const [x, y] of pts) this.set(x, y, c);
    return this;
  }
}

/**
 * Спрайт із піксельної сітки: рядки однакової довжини, символ → колір палітри (`.` — прозоро).
 */
export function fromGrid(rows, key) {
  const img = new Img(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      if (!(ch in key)) throw new Error(`fromGrid: невідомий символ «${ch}»`);
      img.set(x, y, key[ch]);
    }
  });
  return img;
}

// ======================= випадковість і шум =======================

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Згладжений value-noise, тайловий із періодом period. */
export function noise(x, y, scale, seed, period = 16) {
  const px = Math.max(1, Math.round(period / scale));
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sm = (t) => t * t * (3 - 2 * t);
  const v = (ix, iy) => hash2(((ix % px) + px) % px, ((iy % px) + px) % px, seed);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sm(tx);
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sm(tx);
  return a + (b - a) * sm(ty);
}

/** Кілька октав шуму, 0..1. */
export function fbm(x, y, seed, scales = [8, 4, 2]) {
  let s = 0;
  let w = 0;
  let k = 1;
  for (const sc of scales) {
    s += noise(x, y, sc, seed + sc * 17) * k;
    w += k;
    k *= 0.5;
  }
  return s / w;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Значення 0..1 → колір рампи. Упорядкований дизеринг лише у вузькій смузі переходу між тонами
 * (width — частка інтервалу), решта — плоскі плями: піксельарт читається плямами, а не шумом.
 */
export function ramp(colors, v, x, y, width = 0.35) {
  const t = Math.max(0, Math.min(0.9999, v)) * (colors.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const lo = 0.5 - width / 2;
  const g = Math.max(0, Math.min(1, (f - lo) / width));
  const threshold = BAYER4[(y & 3) * 4 + (x & 3)];
  return colors[Math.min(colors.length - 1, g > threshold ? i + 1 : i)];
}

// ======================= PNG =======================

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; // біт на канал
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
