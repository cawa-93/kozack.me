// Шкали показників на панелі (§6, §8.4): що саме малює кожна шкала цього кадру. Без Phaser.
//
// Заливка й початок штрихування — в одиницях панелі, але до цілих px полотна: меншої зміни на екрані не видно, а так показник,
// що плавно росте чи спадає, не перемальовує шкал щокадру (`barsKey`).

import type { Slice3Frame } from "./slice3";

/** Що малює шкала: ширина заливки й де починається штрихування над межею (одиниці від лівого краю шкали; null — межі немає). */
export interface BarDraw {
  fill: number;
  blink: boolean;
  hatch: number | null;
}

/** Довжина частки `percent` (0–100) шкали завширшки `width` одиниць, до цілих px полотна (`ui` px на одиницю). */
function snapped(width: number, percent: number, ui: number): number {
  return Math.round(((width * Math.max(0, percent)) / 100) * ui) / ui;
}

/** Шкала завширшки `width` одиниць: показник `value`, межа, вище якої він зараз не росте (`ceiling`), блимання низького показника. */
export function barDraw(width: number, value: number, ceiling: number, blink: boolean, ui: number): BarDraw {
  return { fill: snapped(width, value, ui), blink, hatch: ceiling < 100 ? snapped(width, ceiling, ui) : null };
}

/** Ключ шкал панелі: той самий — нічого на них не змінилося. */
export function barsKey(bars: readonly BarDraw[]): string {
  let key = "";
  for (const bar of bars) key += `${bar.fill}:${bar.blink ? 1 : 0}:${bar.hatch ?? "-"};`;
  return key;
}

/** Яку частину кадру штрихування показати й де: полотно кадру (`x`, `y`, масштаб) і вікно в ньому (одиниці арту від лівого краю). */
export interface HatchCrop {
  x: number;
  y: number;
  scale: number;
  src: number;
  srcW: number;
}

/**
 * Штрихування шкали `bar` від `from` (одиниці від її лівого краю) до кінця — вікно кадру `ui/hud/bar-hatch`, чиє тіло починається в
 * лівому краї шкали: смужки стоять на місці, коли межа рухається. null — штрихувати нічого.
 */
export function hatchCrop(frame: Slice3Frame, bar: { x: number; y: number; w: number; h: number }, from: number): HatchCrop | null {
  const { body } = frame;
  const scale = bar.h / (body.bottom - body.top);
  const src = body.left + from / scale;
  const end = Math.min(body.right, body.left + bar.w / scale);
  if (end <= src) return null;
  return { x: bar.x - body.left * scale, y: bar.y - body.top * scale, scale, src, srcW: end - src };
}
