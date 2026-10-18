import type { TowerDefinition } from '../domain/structures/Tower';

export type TowerDamageZone = 'primary' | 'target-cell' | 'adjacent-cell';

export function towerDamageForCellVictim(
  definition: TowerDefinition,
  zone: TowerDamageZone,
): number {
  switch (zone) {
    case 'primary':
      return definition.damagePerShot + definition.splashDamage;
    case 'target-cell':
      return definition.splashDamage;
    case 'adjacent-cell':
      return definition.adjacentSplashDamage;
  }
}
