import { describe, expect, it } from 'vitest';

import {
  BONUS_TYPES,
  type BonusType,
} from '../../src/domain/bonuses';
import {
  bonusIllustrationTextureKey,
  bonusInventoryLabel,
  collectOwnedBonuses,
} from '../../src/game/ui/BonusPresentation';

describe('bonus presentation', () => {
  it('uses one stable illustration key per bonus type', () => {
    const keys = BONUS_TYPES.map(bonusIllustrationTextureKey);

    expect(new Set(keys).size).toBe(BONUS_TYPES.length);
    expect(bonusIllustrationTextureKey('cat-treats')).toBe(
      'bonus-illustration-cat-treats',
    );
  });

  it('hides the inventory label until the first stack is owned', () => {
    expect(bonusInventoryLabel(0)).toBe('');
    expect(bonusInventoryLabel(1)).toBe('В наявності: 1');
    expect(bonusInventoryLabel(20)).toBe('В наявності: 20');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid inventory count: %s',
    (count) => {
      expect(() => bonusInventoryLabel(count)).toThrow(RangeError);
    },
  );

  it('collects only owned bonuses in the canonical display order', () => {
    const stacks = emptyStacks();
    stacks['social-hobby'] = 2;
    stacks.move = 1;
    stacks['social-debt'] = 4;
    stacks['hide-under-blanket'] = 1;
    stacks['twitter-fight'] = 3;

    expect(collectOwnedBonuses(stacks)).toEqual([
      { type: 'social-hobby', count: 2 },
      { type: 'move', count: 1 },
      { type: 'social-debt', count: 4 },
      { type: 'hide-under-blanket', count: 1 },
      { type: 'twitter-fight', count: 3 },
    ]);
  });

  it('returns an empty collection when no bonuses have been picked', () => {
    expect(collectOwnedBonuses(emptyStacks())).toEqual([]);
  });
});

function emptyStacks(): Record<BonusType, number> {
  return Object.fromEntries(BONUS_TYPES.map((type) => [type, 0])) as Record<
    BonusType,
    number
  >;
}
