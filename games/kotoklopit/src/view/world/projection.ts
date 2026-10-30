// Як квартира лягає на екран (§2.1, §8.4): точки підлоги в клітинках — у точки світу на екрані (px до масштабу камери).
// Усе, що переводить клітинки в екран (сцена, камера, частини світу), бере це з об'єкта проєкції, а не з чисел, — тож
// нова графіка кроку 16 лише додає свою проєкцію. Без Phaser.
//
// Реалізації: стара коса «три чверті» (OBLIQUE) — підлога трохи стиснута по вертикалі, стіни й речі мають видиму
// висоту; ізометрія 2:1 (крок 16, `GRAPHICS_PLAN.md`) ляже поруч.

import { MAP_HEIGHT, MAP_WIDTH, type Rect } from "../../sim/home";
import type { Vec } from "../../sim/types";

/** Прямокутник на екрані, px світу. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projection {
  /** «oblique» — коса «три чверті» старого вигляду, «iso» — ізометрія 2:1 (крок 16). */
  readonly kind: "oblique" | "iso";
  /** Точка підлоги в клітинках → точка на екрані. */
  toScreen(p: Vec): Vec;
  /** Прямокутник клітинок → прямокутник на екрані, що його вміщує (у косій — він сам). */
  rectToScreen(r: Rect): ScreenRect;
  /** Порядок малювання точки за її висотою на екрані: що нижче, те ближче до камери. */
  depthOf(screenY: number): number;
  /** Порядок малювання точки підлоги в клітинках. */
  depthAt(p: Vec): number;
  /** Квартира з полем довкола на екрані: у цих межах ходить камера (§8.4). */
  readonly world: { readonly width: number; readonly height: number };
  /**
   * Клітинка підлоги на екрані: у косій — прямокутник, в ізометрії — ромб (його ширина й висота). З висоти камера
   * рахує найменший масштаб, за якого підлогу ще видно на телефоні (§8.4).
   */
  readonly tile: { readonly width: number; readonly height: number };
  /** Висота задньої стіни на екрані. */
  readonly wallRise: number;
}

/** Коса проєкція старого вигляду: її малюнки квартири й котячого кутка (`legacy/*`) інших не вміють. */
export interface ObliqueProjection extends Projection {
  readonly kind: "oblique";
}

/** Коса «три чверті»: клітинка 60 × 50, стіна заввишки 30. */
const TILE_W = 60;
const TILE_H = 50;
const WALL_RISE = 30;
/** Поле довкола квартири, щоб стіни не впиралися в край екрана. */
const MARGIN = 14;
/** Де на екрані верхній лівий кут клітинки (0, 0): над нею ще видно верх задньої стіни. */
const ORIGIN: Vec = { x: MARGIN, y: MARGIN + WALL_RISE };

function obliqueToScreen(p: Vec): Vec {
  return { x: ORIGIN.x + p.x * TILE_W, y: ORIGIN.y + p.y * TILE_H };
}

function screenDepth(screenY: number): number {
  return screenY;
}

export const OBLIQUE: ObliqueProjection = {
  kind: "oblique",
  toScreen: obliqueToScreen,
  rectToScreen(r) {
    const { x, y } = obliqueToScreen(r);
    return { x, y, w: r.w * TILE_W, h: r.h * TILE_H };
  },
  depthOf: screenDepth,
  depthAt: (p) => screenDepth(obliqueToScreen(p).y),
  world: {
    width: MAP_WIDTH * TILE_W + MARGIN * 2,
    height: WALL_RISE + MAP_HEIGHT * TILE_H + MARGIN * 2,
  },
  tile: { width: TILE_W, height: TILE_H },
  wallRise: WALL_RISE,
};
