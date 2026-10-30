// Як квартира лягає на екран: камера «три чверті» (§2.1) — підлога трохи стиснута
// по вертикалі, а стіни й речі мають видиму висоту.

import { MAP_HEIGHT, MAP_WIDTH, type Rect } from "../sim/home";
import type { Vec } from "../sim/types";

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
