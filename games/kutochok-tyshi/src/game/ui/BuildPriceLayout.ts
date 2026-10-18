export interface BuildPriceLayout {
  readonly coinCenterX: number;
  readonly priceLeftX: number;
  readonly totalWidth: number;
}

export function centerBuildPrice(
  cardWidth: number,
  coinDiameter: number,
  priceWidth: number,
  gap: number,
): BuildPriceLayout {
  for (const value of [cardWidth, coinDiameter, priceWidth, gap]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        'Build-price dimensions must be finite and non-negative.',
      );
    }
  }

  const totalWidth = coinDiameter + gap + priceWidth;
  const left = (cardWidth - totalWidth) / 2;
  return {
    coinCenterX: left + coinDiameter / 2,
    priceLeftX: left + coinDiameter + gap,
    totalWidth,
  };
}
