// Як квартира лягає на екран: камера «три чверті» (§2.1) — підлога трохи стиснута
// по вертикалі, а стіни й речі мають видиму висоту.

import { MAP_HEIGHT, MAP_WIDTH, type Rect } from "../sim/home";
import type { Vec } from "../sim/types";

/** Полотно для екрана 16:9; на екрані іншої форми воно ширшає чи вищає (Phaser.Scale.EXPAND). */
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

export const TILE_W = 60;
export const TILE_H = 50;
/** Висота стіни на екрані. */
export const WALL_RISE = 30;

/** Поле довкола квартири, щоб стіни не впиралися в край екрана. */
const MARGIN = 14;

export const ORIGIN: Vec = { x: MARGIN, y: MARGIN + WALL_RISE };

/** Квартира з полем: у цих межах ходить камера (§8.4). */
export const WORLD = {
  width: MAP_WIDTH * TILE_W + MARGIN * 2,
  height: WALL_RISE + MAP_HEIGHT * TILE_H + MARGIN * 2,
} as const;

export function toScreen(p: Vec): Vec {
  return { x: ORIGIN.x + p.x * TILE_W, y: ORIGIN.y + p.y * TILE_H };
}

export function rectToScreen(r: Rect): { x: number; y: number; w: number; h: number } {
  const { x, y } = toScreen(r);
  return { x, y, w: r.w * TILE_W, h: r.h * TILE_H };
}

/** Порядок малювання: що нижче на екрані, те ближче до камери. */
export function depthOf(screenY: number): number {
  return screenY;
}

export const COLORS = {
  background: 0x2b2530,
  ink: 0x1f1a24,
  inkSoft: 0x3a3140,
  paper: 0xf3e9dc,
  wallTop: 0x3b3340,
  wallFace: 0x6b5d6e,
  floors: {
    bedroom: 0x8f7a66,
    bathroom: 0x7f8f94,
    kitchen: 0x9a8c74,
    living: 0x86725f,
  },
  highlight: 0xffd36b,
  danger: 0xd8483b,
  warning: 0xe8a33a,
  good: 0x6fae6a,
} as const;
