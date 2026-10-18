import {
  BONUS_TYPES,
  type BonusType,
} from '../../domain/bonuses';

export interface OwnedBonusPresentation {
  readonly type: BonusType;
  readonly count: number;
}

export function bonusIllustrationTextureKey(type: BonusType): string {
  return `bonus-illustration-${type}`;
}

export function bonusInventoryLabel(count: number): string {
  assertStackCount(count);
  return count === 0 ? '' : `В наявності: ${count}`;
}

export function collectOwnedBonuses(
  stacks: Readonly<Record<BonusType, number>>,
): readonly OwnedBonusPresentation[] {
  const owned: OwnedBonusPresentation[] = [];
  for (const type of BONUS_TYPES) {
    const count = stacks[type];
    assertStackCount(count);
    if (count > 0) {
      owned.push(Object.freeze({ type, count }));
    }
  }
  return Object.freeze(owned);
}

function assertStackCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('A bonus stack count must be a non-negative safe integer.');
  }
}
