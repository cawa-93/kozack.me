// Сяйво підсвітки цілі (§8.2; `art/STYLE.md` §15, «Атлас»): числа сяйва й розрахунок карти сяйва кадру. Річ квартири не
// рухається, тож її ореол рахує конвеєр атласу один раз (`scripts/art/build.ts`), а гра кладе готову карту під річ
// (`iso/highlight.ts`); фільтр Phaser Glow (десятки вибірок текстури на піксель щокадру) лишився тільки котові — він
// анімований. Карта — та сама зважена сума альфи довкола точки, що в шейдері фільтра (`FilterGlow.frag`), лише без його
// шуму: кути вибірок шейдер зсуває псевдовипадково, а тут кільце взяте рівномірно й густо. Без Phaser, DOM і Node.

import { HIGHLIGHT_DARK } from "../light/lightlook";
import type { FrameId } from "./types";

/** Сила сяйва цілі (`outerStrength` шейдера): від `min` до `min + pulse` за пульсом позначок; у темряві — ще й × `HIGHLIGHT_DARK`. */
export const TARGET_GLOW = { min: 2, pulse: 4 } as const;

/**
 * Карта сяйва речі: ширина ореолу (px атласу, як `distance` фільтра), вибірок на кільце (густо — рівний ореол без шуму),
 * у скільки разів карта дрібніша за кадр (ореол плавний, а різкий внутрішній край закриває сама річ) і сила, з якою
 * карту запечено, — найслабший пульс: тоді один шар карти — рівно сяйво шейдера, а сильніше дають шари поверх
 * (`glowLayerAlpha`).
 */
export const GLOW_MAP = { distance: 10, quality: 32, scale: 2, gain: TARGET_GLOW.min } as const;

/** Скільки шарів карти треба для найсильнішого сяйва — найсильнішого пульсу в найтемнішому місці (`HIGHLIGHT_DARK`). */
export const GLOW_LAYERS = Math.ceil(((TARGET_GLOW.min + TARGET_GLOW.pulse) * HIGHLIGHT_DARK.boost) / GLOW_MAP.gain);

/**
 * Фільтр сяйва кота: вибірок на кільце й ширина (px). Кіт анімований, тож фільтр рахує щокадру — `quality × distance`
 * вибірок текстури на піксель; менше за це сяйво рветься на цятки.
 */
export const CAT_GLOW_FILTER = { quality: 5, distance: 6 } as const;

/** Альфа растра: байт на піксель, рядки один за одним. */
export interface AlphaRaster {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/**
 * Ядро сяйва: вага кожного текселя довкола точки. Сума ваг — 1, тож згортка з альфою (0–1) — `alphaRatio` шейдера.
 * `weights[(oy + reach) · size + ox + reach]` — вага текселя на зсуві (ox, oy).
 */
export interface GlowKernel {
  readonly reach: number;
  readonly size: number;
  readonly weights: Float64Array;
}

export interface GlowKernelOptions {
  /** Кут, з якого починається кожне кільце (у шейдері — накопичений псевдовипадковий зсув); без них — 0. */
  readonly phases?: readonly number[];
  /** Зсув точки від центру текселя по обох осях, частка текселя (центр квадрата 2 × 2 — 0,5). */
  readonly shift?: number;
}

/**
 * Ядро шейдера Glow: кільця радіусом 1…`distance` px, на кожному `quality` вибірок через рівні кути, кільце `d` (від 0) —
 * з вагою `distance − d`; кожна вибірка білінійна, тож її вага ділиться між чотирма текселями.
 */
export function glowKernel(distance: number, quality: number, options: GlowKernelOptions = {}): GlowKernel {
  const reach = distance + 1;
  const size = 2 * reach + 2;
  const weights = new Float64Array(size * size);
  const total = (distance * (distance + 1) * quality) / 2;
  const shift = options.shift ?? 0;
  for (let d = 0; d < distance; d++) {
    const weight = (distance - d) / total;
    const phase = options.phases?.[d] ?? 0;
    for (let i = 0; i < quality; i++) {
      const angle = phase + ((i + 1) * Math.PI * 2) / quality;
      const x = shift + Math.cos(angle) * (d + 1);
      const y = shift + Math.sin(angle) * (d + 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const at = (y0 + reach) * size + x0 + reach;
      weights[at] = (weights[at] ?? 0) + weight * (1 - fx) * (1 - fy);
      weights[at + 1] = (weights[at + 1] ?? 0) + weight * fx * (1 - fy);
      weights[at + size] = (weights[at + size] ?? 0) + weight * (1 - fx) * fy;
      weights[at + size + 1] = (weights[at + size + 1] ?? 0) + weight * fx * fy;
    }
  }
  return { reach, size, weights };
}

/** Частка сяйва (`alphaRatio` шейдера, 0–1) довкола текселя (x, y) растра; за межами растра — прозоро. Точка може бути й поза растром. */
export function glowRatio(alpha: AlphaRaster, kernel: GlowKernel, x: number, y: number): number {
  const { reach, size, weights } = kernel;
  const { w, h, data } = alpha;
  const oy0 = Math.max(0, reach - y);
  const oy1 = Math.min(size, h - y + reach);
  const ox0 = Math.max(0, reach - x);
  const ox1 = Math.min(size, w - x + reach);
  let sum = 0;
  for (let oy = oy0; oy < oy1; oy++) {
    const row = (y + oy - reach) * w + x - reach;
    const k = oy * size;
    for (let ox = ox0; ox < ox1; ox++) {
      const a = data[row + ox] as number;
      if (a !== 0) sum += a * (weights[k + ox] as number);
    }
  }
  return sum / 255;
}

/** Карта сяйва: альфа ореолу (байт на піксель) і де вона лежить відносно растра, з якого порахована. */
export interface GlowMap {
  readonly w: number;
  readonly h: number;
  /** Лівий верхній кут карти від лівого верхнього кута растра, px растра (від'ємні: карта ширша за растр). */
  readonly dx: number;
  readonly dy: number;
  /** Скільки px растра в одному пікселі карти. */
  readonly scale: number;
  readonly data: Uint8Array;
}

export interface GlowMapOptions {
  readonly distance: number;
  readonly quality: number;
  readonly scale: number;
  readonly gain: number;
}

/** Розмір і місце карти сяйва растра `size`: ширша за нього на ширину сяйва з кожного боку (до цілого пікселя карти). */
export function glowMapBox(size: { w: number; h: number }, options: Pick<GlowMapOptions, "distance" | "scale"> = GLOW_MAP): Omit<GlowMap, "data"> {
  const { distance, scale } = options;
  const pad = Math.ceil(distance / scale) * scale;
  return { w: Math.ceil((size.w + 2 * pad) / scale), h: Math.ceil((size.h + 2 * pad) / scale), dx: -pad, dy: -pad, scale };
}

/**
 * Карта сяйва растра: у кожному пікселі — `min(1, частка сяйва × gain)` у центрі його квадрата `scale × scale`. Під самим
 * малюнком карта суцільна (множника `1 − альфа` шейдера в ній немає): у грі вона лежить під річчю, і накладання речі дає
 * той самий множник саме, а розмитий зменшенням внутрішній край ховається під річчю.
 */
export function glowMap(alpha: AlphaRaster, options: GlowMapOptions = GLOW_MAP): GlowMap {
  const { distance, quality, scale, gain } = options;
  const { w, h, dx } = glowMapBox(alpha, options);
  const pad = -dx;
  // Центр квадрата — (scale − 1) / 2 від центру його першого текселя: ціла частина — зсув текселя, дробова — зсув ядра.
  const centre = (scale - 1) / 2;
  const whole = Math.floor(centre);
  const kernel = glowKernel(distance, quality, { shift: centre - whole });
  const data = new Uint8Array(w * h);
  // Більшість пікселів карти — глибоко під малюнком чи далеко від нього: там вікно ядра суцільне (1) чи порожнє (0), і
  // згортку можна не рахувати. Сума альфи у вікні — з таблиці сум.
  const sums = alphaSums(alpha);
  const full = 255 * kernel.size * kernel.size;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = i * scale + whole - pad;
      const y = j * scale + whole - pad;
      const inWindow = windowSum(sums, alpha, x - kernel.reach, y - kernel.reach, kernel.size);
      if (inWindow === 0) continue;
      const ratio = inWindow === full ? 1 : glowRatio(alpha, kernel, x, y);
      data[j * w + i] = Math.round(255 * Math.min(1, ratio * gain));
    }
  }
  return { w, h, dx: -pad, dy: -pad, scale, data };
}

/** Таблиця сум альфи: `sums[y · (w + 1) + x]` — сума прямокутника від (0, 0) до (x, y), не включаючи їх. */
function alphaSums(alpha: AlphaRaster): Float64Array {
  const { w, h, data } = alpha;
  const sums = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x] as number;
      sums[(y + 1) * (w + 1) + x + 1] = (sums[y * (w + 1) + x + 1] as number) + row;
    }
  }
  return sums;
}

/** Сума альфи у квадраті `size × size` з кутом (x, y), обтятому растром. */
function windowSum(sums: Float64Array, alpha: AlphaRaster, x: number, y: number, size: number): number {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(alpha.w, x + size);
  const y1 = Math.min(alpha.h, y + size);
  if (x1 <= x0 || y1 <= y0) return 0;
  const stride = alpha.w + 1;
  return (sums[y1 * stride + x1] as number) - (sums[y0 * stride + x1] as number) - (sums[y1 * stride + x0] as number) + (sums[y0 * stride + x0] as number);
}

/**
 * Прозорість шару `layer` (від 0) карти для сяйва в `t` разів сильнішого за запечене (`сила / GLOW_MAP.gain`): шари
 * заповнюються по черзі до 1. Сума прозоростей — `t`, тож слабкий край ореолу — той самий, що в шейдера (`частка × сила`),
 * а біля речі шари, накладаючись, насичуються до суцільного, як обрізане `min(1, …)` шейдера (трохи м'якше за нього).
 */
export function glowLayerAlpha(t: number, layer: number): number {
  return Math.min(1, Math.max(0, t - layer));
}

/** Назва кадру Phaser для карти сяйва кадру (кадри шарів — `<кадр>#<шар>`). */
export function glowFrameName(frame: FrameId | string): string {
  return `${frame}@glow`;
}

/**
 * Як покласти карту на кадр речі: origin карти — у точці опори зображення речі (`origin` 0–1 його полотна `canvas`, px
 * атласу), масштаб — у `scale` разів більший за масштаб речі. Тоді та сама позиція дає карту рівно довкола речі.
 */
export function glowPlacement(
  glow: Pick<GlowMap, "dx" | "dy" | "w" | "h" | "scale">,
  canvas: { w: number; h: number },
  origin: { x: number; y: number },
): { originX: number; originY: number; scale: number } {
  return {
    originX: (origin.x * canvas.w - glow.dx) / (glow.w * glow.scale),
    originY: (origin.y * canvas.h - glow.dy) / (glow.h * glow.scale),
    scale: glow.scale,
  };
}
