import type { NavigationProfile } from './NavigationProfile';

export type EnemyType = 'weak' | 'fast' | 'strong' | 'roach';

export interface EnemyDefinition {
  readonly id: EnemyType;
  readonly name: string;
  readonly maxHp: number;
  readonly baseDamage: number;
  readonly coreDamage: number;
  readonly coreHealing: number;
  readonly navigationProfile: NavigationProfile;
}

export function calculateCoreDamage(baseDamage: number): number {
  return Math.max(1, Math.floor(baseDamage / 4));
}
