import type { EnemyGroup } from '../data/levels';
import type { EnemyType } from '../domain/enemies/EnemyDefinition';

export const BASE_LEVEL_REWARD_COINS = 10;
export const MIN_LEVEL_REWARD_COINS = 20;
export const MAX_LEVEL_REWARD_COINS = 200;
export const LEVEL_REWARD_SMOOTHING_START_LEVEL = 12;
export const MAX_LEVEL_REWARD_INCREASE_COINS = 20;

const COIN_TENTHS = 10;
const REWARD_TENTHS_PER_ENEMY: Readonly<Record<EnemyType, number>> =
  Object.freeze({
    weak: 1,
    fast: 2,
    strong: 5,
    roach: 1,
  });

export interface LevelRewardOptions {
  readonly multiplierNumerator?: number;
  readonly multiplierDenominator?: number;
  readonly minCoins?: number;
  readonly maxCoins?: number;
}

export interface LevelRewardSmoothingOptions {
  readonly minCoins?: number;
  readonly maxCoins?: number;
  readonly maxIncreaseCoins?: number;
}

/** Calculates the rounded whole-coin reward for one completed-level plan. */
export function calculateLevelRewardCoins(
  groups: readonly EnemyGroup[],
  options: LevelRewardOptions = {},
): number {
  const multiplierNumerator = options.multiplierNumerator ?? 1;
  const multiplierDenominator = options.multiplierDenominator ?? 1;
  const minCoins = options.minCoins ?? MIN_LEVEL_REWARD_COINS;
  const maxCoins = options.maxCoins ?? MAX_LEVEL_REWARD_COINS;
  assertPositiveSafeInteger(multiplierNumerator, 'Reward multiplier numerator');
  assertPositiveSafeInteger(multiplierDenominator, 'Reward multiplier denominator');
  assertRewardBounds(minCoins, maxCoins);

  let rewardTenths = BigInt(BASE_LEVEL_REWARD_COINS * COIN_TENTHS);

  for (const group of groups) {
    if (!Number.isSafeInteger(group.count) || group.count <= 0) {
      throw new RangeError('Enemy reward group count must be a positive safe integer.');
    }

    const rewardPerEnemyTenths = REWARD_TENTHS_PER_ENEMY[group.enemyType];
    rewardTenths += BigInt(group.count) * BigInt(rewardPerEnemyTenths);
  }

  const denominator = BigInt(multiplierDenominator);
  const scaledReward = rewardTenths * BigInt(multiplierNumerator);
  const boundedReward = clampBigInt(
    scaledReward,
    BigInt(minCoins * COIN_TENTHS) * denominator,
    BigInt(maxCoins * COIN_TENTHS) * denominator,
  );
  const wholeCoinDenominator = BigInt(COIN_TENTHS) * denominator;
  return Number(
    (boundedReward + wholeCoinDenominator / 2n) / wholeCoinDenominator,
  );
}

/** Caps late-game reward jumps without changing the weighted reward formula. */
export function smoothLevelRewardCoins(
  levelNumber: number,
  calculatedRewardCoins: number,
  previousRewardCoins: number | null,
  options: LevelRewardSmoothingOptions = {},
): number {
  if (!Number.isSafeInteger(levelNumber) || levelNumber <= 0) {
    throw new RangeError('Level number must be a positive safe integer.');
  }
  const minCoins = options.minCoins ?? MIN_LEVEL_REWARD_COINS;
  const maxCoins = options.maxCoins ?? MAX_LEVEL_REWARD_COINS;
  const maxIncreaseCoins = options.maxIncreaseCoins
    ?? MAX_LEVEL_REWARD_INCREASE_COINS;
  assertRewardBounds(minCoins, maxCoins);
  assertPositiveSafeInteger(maxIncreaseCoins, 'Maximum reward increase');
  assertValidReward(calculatedRewardCoins, 'Calculated reward', minCoins, maxCoins);
  if (previousRewardCoins !== null) {
    if (!Number.isSafeInteger(previousRewardCoins) || previousRewardCoins < 0) {
      throw new RangeError('Previous reward must be a non-negative whole coin amount.');
    }
  }

  if (
    levelNumber < LEVEL_REWARD_SMOOTHING_START_LEVEL ||
    previousRewardCoins === null
  ) {
    return calculatedRewardCoins;
  }

  return Math.max(
    minCoins,
    Math.min(
      calculatedRewardCoins,
      previousRewardCoins + maxIncreaseCoins,
    ),
  );
}

function assertValidReward(
  reward: number,
  label: string,
  minCoins: number,
  maxCoins: number,
): void {
  if (
    !Number.isSafeInteger(reward) ||
    reward < minCoins ||
    reward > maxCoins
  ) {
    throw new RangeError(
      `${label} must be a whole coin amount from ${minCoins} through ${maxCoins}.`,
    );
  }
}

function assertRewardBounds(minCoins: number, maxCoins: number): void {
  assertPositiveSafeInteger(minCoins, 'Minimum reward');
  assertPositiveSafeInteger(maxCoins, 'Maximum reward');
  if (minCoins > maxCoins) {
    throw new RangeError('Minimum reward cannot exceed maximum reward.');
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}
