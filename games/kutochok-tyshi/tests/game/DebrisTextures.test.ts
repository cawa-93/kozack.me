import { describe, expect, it } from 'vitest';

import {
  DEBRIS_DISPLAY_HEIGHT,
  DEBRIS_DISPLAY_WIDTH,
  DEBRIS_TEXTURE_SIZE,
  DEBRIS_VARIANT_COUNT,
  debrisTextureKey,
  debrisVariantIndex,
} from '../../src/game/assets/DebrisTextures';

describe('damaged-book debris textures', () => {
  it('uses four stable high-resolution texture keys', () => {
    expect(DEBRIS_VARIANT_COUNT).toBe(4);
    expect(DEBRIS_DISPLAY_WIDTH).toBe(38);
    expect(DEBRIS_DISPLAY_HEIGHT).toBe(34);
    expect(DEBRIS_TEXTURE_SIZE).toBe(120);
    expect(
      Array.from(
        { length: DEBRIS_VARIANT_COUNT },
        (_, variant) => debrisTextureKey(variant),
      ),
    ).toEqual([
      'damaged-book-debris-0',
      'damaged-book-debris-1',
      'damaged-book-debris-2',
      'damaged-book-debris-3',
    ]);
  });

  it('selects one deterministic spatial variant for every grid cell', () => {
    const firstPass = Array.from({ length: 36 }, (_, y) => (
      Array.from({ length: 36 }, (_, x) => debrisVariantIndex(x, y))
    ));
    const secondPass = Array.from({ length: 36 }, (_, y) => (
      Array.from({ length: 36 }, (_, x) => debrisVariantIndex(x, y))
    ));

    expect(secondPass).toEqual(firstPass);
    expect(new Set(firstPass.flat())).toEqual(new Set([0, 1, 2, 3]));
    expect(firstPass.flat().every(
      (variant) => variant >= 0 && variant < DEBRIS_VARIANT_COUNT,
    )).toBe(true);
  });

  it.each([-1, 4, 1.5, Number.NaN])(
    'rejects invalid texture variant %s',
    (variant) => {
      expect(() => debrisTextureKey(variant)).toThrow(RangeError);
    },
  );

  it.each([
    [0.5, 1],
    [1, Number.POSITIVE_INFINITY],
    [Number.NaN, 2],
    [Number.MAX_SAFE_INTEGER + 1, 0],
  ])('rejects invalid coordinates (%s, %s)', (x, y) => {
    expect(() => debrisVariantIndex(x, y)).toThrow(RangeError);
  });
});
