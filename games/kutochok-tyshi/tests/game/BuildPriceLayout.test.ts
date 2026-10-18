import { describe, expect, it } from 'vitest';

import { centerBuildPrice } from '../../src/game/ui/BuildPriceLayout';

describe('build-card price layout', () => {
  it.each([9, 18, 27, 36])(
    'centers a price row for a %i-pixel label without overlap',
    (priceWidth) => {
      const cardWidth = 84;
      const coinDiameter = 13.6;
      const gap = 4;
      const layout = centerBuildPrice(
        cardWidth,
        coinDiameter,
        priceWidth,
        gap,
      );

      const coinLeft = layout.coinCenterX - coinDiameter / 2;
      const coinRight = layout.coinCenterX + coinDiameter / 2;
      expect(coinRight + gap).toBeCloseTo(layout.priceLeftX);
      expect(coinLeft).toBeCloseTo((cardWidth - layout.totalWidth) / 2);
      expect(layout.priceLeftX + priceWidth).toBeCloseTo(
        cardWidth - coinLeft,
      );
    },
  );

  it('rejects invalid dimensions', () => {
    expect(() => centerBuildPrice(84, 13.6, Number.NaN, 4)).toThrow(
      RangeError,
    );
    expect(() => centerBuildPrice(84, 13.6, 27, -1)).toThrow(RangeError);
  });
});
