import type { GridPoint } from '../grid/GridPoint';

export const WALL_MAX_HP = 100;
export const WALL_COST = 1;

export interface Wall {
  readonly id: string;
  readonly position: GridPoint;
  readonly hp: number;
  readonly maxHp: number;
}

export function wallIdAt(point: GridPoint): string {
  return `wall:${point.x}:${point.y}`;
}
