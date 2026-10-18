import type { GridPoint } from '../grid/GridPoint';

export type MineType = 'sheer-heart-attack';

export interface MineDefinition {
  readonly id: MineType;
  readonly name: string;
  readonly description: string;
  readonly unlockLevel: number;
  readonly cost: number;
  readonly triggerDelayMs: number;
  readonly adjacentWallDamage: number;
}

export type MineState = 'armed' | 'triggered';

export interface Mine {
  readonly id: string;
  readonly type: MineType;
  readonly position: GridPoint;
  state: MineState;
  triggerRemainingMs: number;
}

export function mineIdAt(point: GridPoint): string {
  return `mine:${point.x}:${point.y}`;
}
