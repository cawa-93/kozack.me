import { describe, expect, it } from 'vitest';

import {
  BASE_MAX_LEVEL_REWARD,
  BASE_MIN_LEVEL_REWARD,
  catTreatsMultiplier,
  enemyDamageMultiplier,
  enemySpeedMultiplier,
  MIN_ENEMY_SPEED_MULTIPLIER,
  reducedEnemyCount,
  socialDebtMultiplier,
  socialDebtRewardBounds,
  twitterFightEnemyCount,
  weakenedEnemyDamage,
} from '../../src/systems/BonusMath';

describe('bonus math', () => {
  it('compounds movement slowdown and preserves the configured speed floor', () => {
    expect(enemySpeedMultiplier(0)).toBe(1);
    expect(enemySpeedMultiplier(1)).toBeCloseTo(0.91);
    expect(enemySpeedMultiplier(10)).toBeCloseTo(0.91 ** 10);
    expect(enemySpeedMultiplier(10)).toBeGreaterThanOrEqual(
      MIN_ENEMY_SPEED_MULTIPLIER,
    );
  });

  it('compounds enemy weakening without permitting zero damage', () => {
    expect(enemyDamageMultiplier(0)).toBe(1);
    expect(enemyDamageMultiplier(10)).toBeCloseTo(0.91 ** 10);
    expect(weakenedEnemyDamage(4, 0)).toBe(4);
    expect(weakenedEnemyDamage(4, 10)).toBe(2);
    expect(weakenedEnemyDamage(2, 10)).toBe(1);
    expect(weakenedEnemyDamage(1, 10)).toBe(1);
  });

  it('reduces enemy counts with exact ceiling arithmetic and a minimum of one', () => {
    expect(reducedEnemyCount(100, 0)).toBe(100);
    expect(reducedEnemyCount(100, 1)).toBe(95);
    expect(reducedEnemyCount(3, 1)).toBe(3);
    expect(reducedEnemyCount(100, 10)).toBe(60);
    expect(reducedEnemyCount(1, 10)).toBe(1);
    expect(reducedEnemyCount(Number.MAX_SAFE_INTEGER, 10)).toBeLessThanOrEqual(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('applies the exact Twitter Fight count multiplier by ordinary enemy type', () => {
    expect(twitterFightEnemyCount(1, 'weak')).toBe(2);
    expect(twitterFightEnemyCount(2, 'weak')).toBe(3);
    expect(twitterFightEnemyCount(3, 'weak')).toBe(5);
    expect(twitterFightEnemyCount(100, 'weak')).toBe(150);
    expect(twitterFightEnemyCount(100, 'fast')).toBe(200);
    expect(twitterFightEnemyCount(100, 'strong')).toBe(300);
  });

  it('preserves the fixed Roach count and saturates ordinary counts safely', () => {
    expect(twitterFightEnemyCount(100, 'roach')).toBe(100);
    expect(twitterFightEnemyCount(Number.MAX_SAFE_INTEGER, 'weak')).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(twitterFightEnemyCount(Number.MAX_SAFE_INTEGER, 'fast')).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(twitterFightEnemyCount(Number.MAX_SAFE_INTEGER, 'strong')).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('adds ten percent tower power per Cat Treats stack', () => {
    expect(catTreatsMultiplier(0)).toBe(1);
    expect(catTreatsMultiplier(1)).toBe(1.1);
    expect(catTreatsMultiplier(5)).toBe(1.5);
  });

  it('adds ten percent reward and expands both Social Debt bounds per stack', () => {
    expect({ BASE_MIN_LEVEL_REWARD, BASE_MAX_LEVEL_REWARD }).toEqual({
      BASE_MIN_LEVEL_REWARD: 20,
      BASE_MAX_LEVEL_REWARD: 200,
    });
    expect(socialDebtMultiplier(0)).toBe(1);
    expect(socialDebtMultiplier(1)).toBe(1.1);
    expect(socialDebtMultiplier(10)).toBe(2);
    expect(socialDebtRewardBounds(0)).toEqual({ minimum: 20, maximum: 200 });
    expect(socialDebtRewardBounds(1)).toEqual({ minimum: 22, maximum: 220 });
    expect(socialDebtRewardBounds(10)).toEqual({ minimum: 40, maximum: 400 });
  });

  it('rejects invalid base values and stack counts beyond each logical cap', () => {
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => enemySpeedMultiplier(invalid)).toThrow(RangeError);
      expect(() => enemyDamageMultiplier(invalid)).toThrow(RangeError);
      expect(() => reducedEnemyCount(10, invalid)).toThrow(RangeError);
      expect(() => catTreatsMultiplier(invalid)).toThrow(RangeError);
      expect(() => socialDebtMultiplier(invalid)).toThrow(RangeError);
    }

    for (const invalid of [
      -1,
      0,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => twitterFightEnemyCount(invalid, 'weak')).toThrow(RangeError);
    }

    expect(() => enemySpeedMultiplier(11)).toThrow(RangeError);
    expect(() => enemyDamageMultiplier(11)).toThrow(RangeError);
    expect(() => reducedEnemyCount(10, 11)).toThrow(RangeError);
    expect(() => catTreatsMultiplier(6)).toThrow(RangeError);
    expect(() => socialDebtMultiplier(11)).toThrow(RangeError);
    expect(() => weakenedEnemyDamage(0, 0)).toThrow(RangeError);
    expect(() => reducedEnemyCount(0, 0)).toThrow(RangeError);
  });
});
