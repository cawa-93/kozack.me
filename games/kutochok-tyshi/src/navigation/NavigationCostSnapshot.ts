import type { GridSnapshot } from '../domain/grid/GridSnapshot';

export interface NavigationCostSnapshot extends GridSnapshot {
  readonly towerExposure: Uint8Array;
}
