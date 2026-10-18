import { describe, expect, it } from 'vitest';

import type { EnemyGroup } from '../../src/data/levels';
import {
  BASE_LEVEL_REWARD_COINS,
  calculateLevelRewardCoins,
  LEVEL_REWARD_SMOOTHING_START_LEVEL,
  MAX_LEVEL_REWARD_INCREASE_COINS,
  MAX_LEVEL_REWARD_COINS,
  MIN_LEVEL_REWARD_COINS,
  smoothLevelRewardCoins,
} from '../../src/systems/LevelReward';

describe('level reward', () => {
  it('uses the configured base, minimum, and maximum reward bounds', () => {
    expect({
      base: BASE_LEVEL_REWARD_COINS,
      minimum: MIN_LEVEL_REWARD_COINS,
      maximum: MAX_LEVEL_REWARD_COINS,
    }).toEqual({ base: 10, minimum: 20, maximum: 200 });
  });

  it('matches the requested mixed-enemy example', () => {
    const groups: readonly EnemyGroup[] = [
      { enemyType: 'weak', count: 100 },
      { enemyType: 'fast', count: 100 },
    ];

    expect(calculateLevelRewardCoins(groups)).toBe(40);
  });

  it('never awards less than twenty coins', () => {
    expect(calculateLevelRewardCoins([
      { enemyType: 'weak', count: 1 },
    ])).toBe(MIN_LEVEL_REWARD_COINS);
  });

  it('weights one hundred Roaches like weak enemies for a twenty-coin reward', () => {
    expect(calculateLevelRewardCoins([
      { enemyType: 'roach', count: 100 },
    ])).toBe(20);
  });

  it('never awards more than two hundred coins', () => {
    expect(calculateLevelRewardCoins([
      { enemyType: 'strong', count: 1_000 },
    ])).toBe(MAX_LEVEL_REWARD_COINS);
  });

  it('sums repeated groups of the same enemy type', () => {
    const groups: readonly EnemyGroup[] = [
      { enemyType: 'weak', count: 40 },
      { enemyType: 'fast', count: 100 },
      { enemyType: 'weak', count: 60 },
    ];

    expect(calculateLevelRewardCoins(groups)).toBe(40);
  });

  it.each([
    { count: 114, rawReward: 21.4, expectedReward: 21 },
    { count: 115, rawReward: 21.5, expectedReward: 22 },
  ])(
    'rounds a $rawReward-coin reward to $expectedReward coins',
    ({ count, expectedReward }) => {
      expect(calculateLevelRewardCoins([
        { enemyType: 'weak', count },
      ])).toBe(expectedReward);
    },
  );

  it('returns a whole-coin reward when the weighted total is fractional', () => {
    const groups: readonly EnemyGroup[] = [
      { enemyType: 'weak', count: 79 },
      { enemyType: 'fast', count: 14 },
    ];

    const reward = calculateLevelRewardCoins(groups);

    expect(reward).toBe(21);
    expect(Number.isInteger(reward)).toBe(true);
  });

  it('applies a dynamic multiplier and matching minimum and maximum bounds', () => {
    const doubledReward = {
      multiplierNumerator: 2,
      multiplierDenominator: 1,
      minCoins: 40,
      maxCoins: 400,
    } as const;

    expect(calculateLevelRewardCoins([
      { enemyType: 'weak', count: 100 },
      { enemyType: 'fast', count: 100 },
    ], doubledReward)).toBe(80);
    expect(calculateLevelRewardCoins([
      { enemyType: 'weak', count: 1 },
    ], doubledReward)).toBe(40);
    expect(calculateLevelRewardCoins([
      { enemyType: 'strong', count: 1_000 },
    ], doubledReward)).toBe(400);
  });

  it('keeps rationally multiplied rewards whole and rounds positive halves upward', () => {
    const reward = calculateLevelRewardCoins([
      { enemyType: 'weak', count: 115 },
    ], {
      multiplierNumerator: 11,
      multiplierDenominator: 10,
      minCoins: 22,
      maxCoins: 220,
    });

    expect(reward).toBe(24);
    expect(Number.isInteger(reward)).toBe(true);
  });

  it('caps each reward increase after level eleven while preserving whole coins', () => {
    expect(LEVEL_REWARD_SMOOTHING_START_LEVEL).toBe(12);
    expect(MAX_LEVEL_REWARD_INCREASE_COINS).toBe(20);
    expect(smoothLevelRewardCoins(11, 200, 20)).toBe(200);
    expect(smoothLevelRewardCoins(12, 200, 20)).toBe(40);
    expect(smoothLevelRewardCoins(13, 200, 40)).toBe(60);
    expect(smoothLevelRewardCoins(13, 35, 40)).toBe(35);
  });

  it('honours a raised dynamic minimum even when it exceeds the smoothing allowance', () => {
    expect(smoothLevelRewardCoins(12, 40, 10, {
      minCoins: 40,
      maxCoins: 400,
      maxIncreaseCoins: 20,
    })).toBe(40);
  });
});
