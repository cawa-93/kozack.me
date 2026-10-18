export type HeroineVisualState = 100 | 75 | 50 | 25 | 0;

export function heroineVisualState(
  currentHp: number,
  maximumHp: number,
): HeroineVisualState {
  if (!Number.isFinite(currentHp) || !Number.isFinite(maximumHp)) {
    throw new RangeError('Heroine HP values must be finite.');
  }
  if (maximumHp <= 0) {
    throw new RangeError('Heroine maximum HP must be positive.');
  }

  const ratio = Math.max(0, Math.min(1, currentHp / maximumHp));
  if (ratio > 0.75) return 100;
  if (ratio > 0.5) return 75;
  if (ratio > 0.25) return 50;
  if (ratio > 0) return 25;
  return 0;
}
