import { describe, expect, it } from 'vitest';

import { FAST_ENEMY, STRONG_ENEMY, WEAK_ENEMY } from '../../src/data/enemies';
import { calculateCoreDamage } from '../../src/domain/enemies/EnemyDefinition';

describe('calculateCoreDamage', () => {
  it('deals one quarter of base damage, rounded down, with a minimum of one', () => {
    expect(calculateCoreDamage(0)).toBe(1);
    expect(calculateCoreDamage(1)).toBe(1);
    expect(calculateCoreDamage(4)).toBe(1);
    expect(calculateCoreDamage(7)).toBe(1);
    expect(calculateCoreDamage(8)).toBe(2);
    expect(calculateCoreDamage(20)).toBe(5);
  });

  it('uses each enemy attack value when damaging the social battery', () => {
    expect(WEAK_ENEMY.baseDamage).toBe(4);
    expect(calculateCoreDamage(WEAK_ENEMY.baseDamage)).toBe(1);

    expect(FAST_ENEMY.baseDamage).toBe(2);
    expect(calculateCoreDamage(FAST_ENEMY.baseDamage)).toBe(1);

    expect(STRONG_ENEMY.baseDamage).toBe(8);
    expect(calculateCoreDamage(STRONG_ENEMY.baseDamage)).toBe(2);
  });

  it('doubles every base movement speed, including the reduced strong profile', () => {
    expect(WEAK_ENEMY.navigationProfile.cellsPerSecond).toBe(2.4);
    expect(FAST_ENEMY.navigationProfile.cellsPerSecond).toBe(5.6);
    expect(STRONG_ENEMY.navigationProfile.cellsPerSecond).toBe(4 / 3);
  });
});
