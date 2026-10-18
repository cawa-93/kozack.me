import type { GridPoint } from '../domain/grid/GridPoint';

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1080;

export const GRID_WIDTH = 36;
export const GRID_HEIGHT = 36;
export const CELL_SIZE = 30;

export const CORE_POSITION: GridPoint = Object.freeze({ x: 18, y: 18 });

export const SPAWN_POINTS: readonly GridPoint[] = Object.freeze([
  Object.freeze({ x: 18, y: 35 }),
]);
