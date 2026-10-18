import type { GridPoint } from '../grid/GridPoint';

export const CORE_MAX_HP = 200;

export interface Core {
  readonly position: GridPoint;
  readonly maxHp: number;
  hp: number;
}
