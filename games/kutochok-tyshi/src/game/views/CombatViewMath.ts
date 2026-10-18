import type { EnemyType } from '../../domain/enemies/EnemyDefinition';

export function enemySpriteFlipX(
  type: EnemyType,
  horizontalDelta: number,
  currentFlipX: boolean,
): boolean {
  if (horizontalDelta === 0) {
    return currentFlipX;
  }

  const sourceFacesLeft = type === 'fast';
  return sourceFacesLeft ? horizontalDelta > 0 : horizontalDelta < 0;
}

export function rotationForUpFacingSprite(
  deltaX: number,
  deltaY: number,
): number {
  return Math.atan2(deltaY, deltaX) + Math.PI / 2;
}

export function rotationForRightFacingSprite(
  deltaX: number,
  deltaY: number,
): number {
  return Math.atan2(deltaY, deltaX);
}

export interface TowerCastScale {
  readonly scaleX: number;
  readonly scaleY: number;
}

export function towerCastScale(
  baseScaleX: number,
  baseScaleY: number,
  scaleXMultiplier: number,
  scaleYMultiplier: number,
): TowerCastScale {
  return {
    scaleX: baseScaleX * scaleXMultiplier,
    scaleY: baseScaleY * scaleYMultiplier,
  };
}

export function shouldShowHealth(currentHp: number, maxHp: number): boolean {
  return currentHp > 0 && currentHp < maxHp;
}
