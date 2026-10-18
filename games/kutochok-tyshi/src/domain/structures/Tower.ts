import type { GridPoint } from '../grid/GridPoint';

export type DamageTowerType = 'basic' | 'rapid' | 'heavy';
export type TowerType = DamageTowerType | 'kitten';

export type TowerBehavior = 'damage' | 'charm';

export interface TowerDefinition {
  readonly id: TowerType;
  readonly name: string;
  readonly description: string;
  readonly behavior: TowerBehavior;
  readonly unlockLevel: number;
  readonly cost: number;
  readonly damagePerShot: number;
  readonly shotsPerSecond: number;
  readonly attackIntervalMs: number;
  readonly splashDamage: number;
  readonly adjacentSplashDamage: number;
  readonly rangeCells: number;
  readonly charmDurationMs: number;
}

export interface Tower {
  readonly id: string;
  readonly type: TowerType;
  readonly position: GridPoint;
  cooldownRemainingMs: number;
}

export function towerIdAt(point: GridPoint): string {
  return `tower:${point.x}:${point.y}`;
}
