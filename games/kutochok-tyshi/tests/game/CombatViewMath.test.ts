import { describe, expect, it } from 'vitest';

import {
  enemySpriteFlipX,
  rotationForRightFacingSprite,
  rotationForUpFacingSprite,
  shouldShowHealth,
  towerCastScale,
} from '../../src/game/views/CombatViewMath';

describe('combat view math', () => {
  it('rotates an upward-facing tower sprite toward its target', () => {
    expect(rotationForUpFacingSprite(0, -1)).toBeCloseTo(0);
    expect(rotationForUpFacingSprite(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(rotationForUpFacingSprite(0, 1)).toBeCloseTo(Math.PI);
  });

  it('rotates a right-facing projectile toward its target', () => {
    expect(rotationForRightFacingSprite(1, 0)).toBeCloseTo(0);
    expect(rotationForRightFacingSprite(0, 1)).toBeCloseTo(Math.PI / 2);
    expect(rotationForRightFacingSprite(-1, 0)).toBeCloseTo(Math.PI);
  });

  it('derives every cat casting pose from the immutable base scale', () => {
    const firstPose = towerCastScale(0.5, 0.75, 1.1, 0.9);
    const laterPose = towerCastScale(0.5, 0.75, 1.1, 0.9);

    expect(firstPose).toEqual({ scaleX: 0.55, scaleY: 0.675 });
    expect(laterPose).toEqual(firstPose);
  });

  it('shows health only while a living unit is damaged', () => {
    expect(shouldShowHealth(15, 15)).toBe(false);
    expect(shouldShowHealth(5, 15)).toBe(true);
    expect(shouldShowHealth(0, 15)).toBe(false);
  });

  it('faces the native-left fast visitor along horizontal movement', () => {
    expect(enemySpriteFlipX('fast', -1, true)).toBe(false);
    expect(enemySpriteFlipX('fast', 1, false)).toBe(true);
  });

  it.each(['weak', 'strong', 'roach'] as const)(
    'faces the native-right %s visitor along horizontal movement',
    (enemyType) => {
      expect(enemySpriteFlipX(enemyType, -1, false)).toBe(true);
      expect(enemySpriteFlipX(enemyType, 1, true)).toBe(false);
    },
  );

  it.each(['weak', 'fast', 'strong', 'roach'] as const)(
    'preserves the %s visitor flip when there is no horizontal movement',
    (enemyType) => {
      expect(enemySpriteFlipX(enemyType, 0, false)).toBe(false);
      expect(enemySpriteFlipX(enemyType, 0, true)).toBe(true);
    },
  );
});
