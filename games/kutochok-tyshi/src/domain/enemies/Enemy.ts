import type { EnemyType } from './EnemyDefinition';

export type EnemyState =
  | 'spawning'
  | 'moving'
  | 'attacking-wall'
  | 'stuck'
  | 'dead'
  | 'reached-core';

export interface Enemy {
  readonly id: string;
  readonly type: EnemyType;
  readonly profileId: string;
  readonly maxHp: number;
  readonly cellsPerSecond: number;
  cellX: number;
  cellY: number;
  hp: number;
  state: EnemyState;
}
