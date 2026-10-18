import { BONUS_DEFINITIONS } from '../domain/bonuses';
import type { EnemyType } from '../domain/enemies/EnemyDefinition';

export const ENEMY_SPEED_FACTOR_PER_MOVE_STACK = 0.91;
export const MIN_ENEMY_SPEED_MULTIPLIER = 0.25;
export const ENEMY_DAMAGE_FACTOR_PER_EARPLUGS_STACK = 0.91;
export const ENEMY_COUNT_FACTOR_NUMERATOR = 95n;
export const ENEMY_COUNT_FACTOR_DENOMINATOR = 100n;
export const CAT_TREATS_BONUS_PER_STACK = 0.1;
export const SOCIAL_DEBT_BONUS_PER_STACK = 0.1;
export const BASE_MIN_LEVEL_REWARD = 20;
export const BASE_MAX_LEVEL_REWARD = 200;

const MAX_SAFE_ENEMY_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const TWITTER_FIGHT_COUNT_MULTIPLIERS: Readonly<
  Record<Exclude<EnemyType, 'roach'>, readonly [numerator: bigint, denominator: bigint]>
> = Object.freeze({
  weak: Object.freeze([3n, 2n] as const),
  fast: Object.freeze([2n, 1n] as const),
  strong: Object.freeze([3n, 1n] as const),
});

export interface LevelRewardBounds {
  readonly minimum: number;
  readonly maximum: number;
}

export function enemySpeedMultiplier(moveStacks: number): number {
  assertStackCount(
    moveStacks,
    BONUS_DEFINITIONS.move.maxStacks,
    'Move bonus stack count',
  );
  return Math.max(
    MIN_ENEMY_SPEED_MULTIPLIER,
    ENEMY_SPEED_FACTOR_PER_MOVE_STACK ** moveStacks,
  );
}

export function enemyDamageMultiplier(earplugsStacks: number): number {
  assertStackCount(
    earplugsStacks,
    BONUS_DEFINITIONS.earplugs.maxStacks,
    'Earplugs bonus stack count',
  );
  return ENEMY_DAMAGE_FACTOR_PER_EARPLUGS_STACK ** earplugsStacks;
}

export function weakenedEnemyDamage(
  baseDamage: number,
  earplugsStacks: number,
): number {
  if (!Number.isFinite(baseDamage) || baseDamage <= 0) {
    throw new RangeError('Base enemy damage must be a positive finite number.');
  }

  return Math.max(
    1,
    Math.round(baseDamage * enemyDamageMultiplier(earplugsStacks)),
  );
}

export function reducedEnemyCount(
  baseCount: number,
  burnBridgesStacks: number,
): number {
  if (!Number.isSafeInteger(baseCount) || baseCount <= 0) {
    throw new RangeError('Base enemy count must be a positive safe integer.');
  }
  assertStackCount(
    burnBridgesStacks,
    BONUS_DEFINITIONS['burn-bridges'].maxStacks,
    'Burn Bridges bonus stack count',
  );

  const exponent = BigInt(burnBridgesStacks);
  const numerator = ENEMY_COUNT_FACTOR_NUMERATOR ** exponent;
  const denominator = ENEMY_COUNT_FACTOR_DENOMINATOR ** exponent;
  const reduced = (
    BigInt(baseCount) * numerator
    + denominator - 1n
  ) / denominator;

  return Math.max(1, Number(reduced));
}

/** Applies the one-level Twitter Fight population increase with exact ceiling. */
export function twitterFightEnemyCount(
  baseCount: number,
  enemyType: EnemyType,
): number {
  if (!Number.isSafeInteger(baseCount) || baseCount <= 0) {
    throw new RangeError('Base enemy count must be a positive safe integer.');
  }
  if (enemyType === 'roach') {
    return baseCount;
  }

  const [numerator, denominator] = TWITTER_FIGHT_COUNT_MULTIPLIERS[enemyType];
  const multiplied = (
    BigInt(baseCount) * numerator
    + denominator - 1n
  ) / denominator;

  return multiplied >= MAX_SAFE_ENEMY_COUNT
    ? Number.MAX_SAFE_INTEGER
    : Number(multiplied);
}

export function catTreatsMultiplier(catTreatsStacks: number): number {
  assertStackCount(
    catTreatsStacks,
    BONUS_DEFINITIONS['cat-treats'].maxStacks,
    'Cat Treats bonus stack count',
  );
  return 1 + CAT_TREATS_BONUS_PER_STACK * catTreatsStacks;
}

export function socialDebtMultiplier(socialDebtStacks: number): number {
  assertStackCount(
    socialDebtStacks,
    BONUS_DEFINITIONS['social-debt'].maxStacks,
    'Social Debt bonus stack count',
  );
  return 1 + SOCIAL_DEBT_BONUS_PER_STACK * socialDebtStacks;
}

export function socialDebtRewardBounds(
  socialDebtStacks: number,
): LevelRewardBounds {
  assertStackCount(
    socialDebtStacks,
    BONUS_DEFINITIONS['social-debt'].maxStacks,
    'Social Debt bonus stack count',
  );
  return Object.freeze({
    minimum: BASE_MIN_LEVEL_REWARD + 2 * socialDebtStacks,
    maximum: BASE_MAX_LEVEL_REWARD + 20 * socialDebtStacks,
  });
}

function assertStackCount(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a safe integer from 0 through ${maximum}.`,
    );
  }
}
