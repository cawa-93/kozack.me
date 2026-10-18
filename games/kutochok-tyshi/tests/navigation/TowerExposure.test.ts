import { describe, expect, it } from 'vitest';

import type { TowerType } from '../../src/domain/structures/Tower';
import { createTowerExposure } from '../../src/navigation/TowerExposure';

function exposureAt(
  exposure: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  return exposure[y * width + x] ?? 0;
}

describe('tower exposure', () => {
  it.each(['basic', 'rapid', 'heavy'] as const)(
    'uses the exact five-cell Euclidean range for the %s tower',
    (type) => {
      const width = 25;
      const exposure = createTowerExposure(width, 25, [{
        type,
        position: { x: 12, y: 12 },
      }]);

      expect(exposureAt(exposure, width, 17, 12)).toBe(1);
      expect(exposureAt(exposure, width, 15, 16)).toBe(1);
      expect(exposureAt(exposure, width, 16, 16)).toBe(0);
      expect(exposureAt(exposure, width, 18, 12)).toBe(0);
    },
  );

  it('uses the kitten ten-cell range and clips it at arena edges', () => {
    const width = 25;
    const exposure = createTowerExposure(width, 25, [{
      type: 'kitten',
      position: { x: 2, y: 2 },
    }]);

    expect(exposure).toHaveLength(625);
    expect(exposureAt(exposure, width, 12, 2)).toBe(1);
    expect(exposureAt(exposure, width, 12, 3)).toBe(0);
    expect(exposureAt(exposure, width, 0, 0)).toBe(1);
  });

  it('keeps overlapping tower ranges binary instead of stacking them', () => {
    const width = 15;
    const towerTypes: readonly TowerType[] = [
      'basic',
      'rapid',
      'heavy',
      'kitten',
    ];
    const exposure = createTowerExposure(
      width,
      15,
      towerTypes.map((type) => ({ type, position: { x: 7, y: 7 } })),
    );

    expect(exposureAt(exposure, width, 7, 7)).toBe(1);
    expect(Math.max(...exposure)).toBe(1);
  });
});
