import type { GridPoint } from './GridPoint';

export interface GridSnapshot {
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly core: GridPoint;
  readonly spawnPoints: readonly GridPoint[];
  readonly wallHp: Int16Array;
  readonly debris: Uint8Array;
}
