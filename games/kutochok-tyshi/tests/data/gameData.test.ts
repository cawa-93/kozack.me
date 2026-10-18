import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_SIZE,
  GRID_HEIGHT,
  GRID_WIDTH,
  SPAWN_POINTS,
} from '../../src/config/gameConfig';
import {
  ENEMY_BASE_DAMAGE,
  ENEMY_DEFINITIONS,
  FAST_ENEMY,
  ROACH_ENEMY,
  STRONG_ENEMY,
  WEAK_ENEMY,
} from '../../src/data/enemies';
import {
  createLevelDefinition,
  PROTOTYPE_CAMPAIGN,
} from '../../src/data/levels';
import { calculateCoreDamage } from '../../src/domain/enemies/EnemyDefinition';
import { CORE_MAX_HP } from '../../src/domain/structures/Core';
import {
  WALL_COST,
  WALL_MAX_HP,
} from '../../src/domain/structures/Wall';
import {
  BASIC_TOWER,
  HEAVY_TOWER,
  KITTEN_TOWER,
  RAPID_TOWER,
  TOWER_RANGE_CELLS,
  TOWER_WALL_HP_BONUS,
} from '../../src/data/towers';
import { SHEER_HEART_ATTACK } from '../../src/data/mines';

describe('prototype game data', () => {
  it('defines the requested logical canvas and cell dimensions', () => {
    expect({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }).toEqual({ width: 1080, height: 1080 });
    expect({ width: GRID_WIDTH, height: GRID_HEIGHT, cell: CELL_SIZE }).toEqual({
      width: 36,
      height: 36,
      cell: 30,
    });
  });

  it('uses one spawn point at the bottom center', () => {
    expect(SPAWN_POINTS).toEqual([{ x: 18, y: 35 }]);
    expect(PROTOTYPE_CAMPAIGN.spawnPoints).toBe(SPAWN_POINTS);
  });

  it('defines differentiated core and wall interactions for all enemy types', () => {
    expect(ENEMY_BASE_DAMAGE).toBe(4);
    expect(WEAK_ENEMY.baseDamage).toBe(ENEMY_BASE_DAMAGE);
    expect(FAST_ENEMY.baseDamage).toBe(2);
    expect(STRONG_ENEMY.baseDamage).toBe(8);
    expect(WEAK_ENEMY.navigationProfile.damagePerHit).toBe(4);
    expect(FAST_ENEMY.navigationProfile.damagePerHit).toBe(2);
    expect(STRONG_ENEMY.navigationProfile.damagePerHit).toBe(8);
    expect(STRONG_ENEMY.navigationProfile.attackIntervalMs).toBe(250);
    expect(ROACH_ENEMY.coreHealing).toBe(1);
    expect(ROACH_ENEMY.navigationProfile).toMatchObject({
      cellsPerSecond: 7.2,
      instantWallBreak: true,
    });
    expect(STRONG_ENEMY.navigationProfile.cellsPerSecond).toBeCloseTo(4 / 3);
    expect(FAST_ENEMY.navigationProfile.cellsPerSecond).toBeGreaterThan(
      WEAK_ENEMY.navigationProfile.cellsPerSecond,
    );
    expect(STRONG_ENEMY.navigationProfile.cellsPerSecond).toBeLessThanOrEqual(
      WEAK_ENEMY.navigationProfile.cellsPerSecond,
    );
  });

  it('defines the requested enemy health', () => {
    expect(WEAK_ENEMY.maxHp).toBe(15);
    expect(FAST_ENEMY.maxHp).toBe(10);
    expect(STRONG_ENEMY.maxHp).toBe(40);
    expect(ROACH_ENEMY.maxHp).toBe(75);
  });

  it('defines the requested tower and mine profiles', () => {
    expect(BASIC_TOWER).toMatchObject({
      unlockLevel: 1,
      cost: 5,
      damagePerShot: 10,
      shotsPerSecond: 1,
      attackIntervalMs: 1_000,
      splashDamage: 0,
      adjacentSplashDamage: 0,
    });
    expect(RAPID_TOWER).toMatchObject({
      unlockLevel: 4,
      cost: 8,
      damagePerShot: 6,
      shotsPerSecond: 2.5,
      attackIntervalMs: 400,
      splashDamage: 0,
      adjacentSplashDamage: 0,
    });
    expect(HEAVY_TOWER).toMatchObject({
      unlockLevel: 10,
      cost: 11,
      damagePerShot: 60,
      shotsPerSecond: 0.2,
      attackIntervalMs: 5_000,
      splashDamage: 20,
      adjacentSplashDamage: 15,
    });
    expect(KITTEN_TOWER).toMatchObject({
      unlockLevel: 16,
      cost: 110,
      damagePerShot: 0,
      shotsPerSecond: 0.125,
      attackIntervalMs: 8_000,
      rangeCells: 10,
      behavior: 'charm',
      charmDurationMs: 2_000,
      description: 'Неймовірно миленьке',
    });
    expect(SHEER_HEART_ATTACK).toMatchObject({
      name: 'Sheer Heart Attack',
      unlockLevel: 21,
      cost: 300,
      triggerDelayMs: 1_000,
      adjacentWallDamage: 10,
    });
    expect(TOWER_RANGE_CELLS).toBe(5);
    expect(TOWER_WALL_HP_BONUS).toBe(50);
  });

  it('defines 200 HP for the core and 100 HP walls costing one coin', () => {
    expect(CORE_MAX_HP).toBe(200);
    expect(WALL_MAX_HP).toBe(100);
    expect(WALL_COST).toBe(1);
  });

  it('defines an endless procedural campaign with the requested unlock levels', () => {
    expect(PROTOTYPE_CAMPAIGN.maxLevel).toBeNull();
    expect(PROTOTYPE_CAMPAIGN.getLevel(1)).toEqual(createLevelDefinition(1));
    expect(PROTOTYPE_CAMPAIGN.getLevel(3).groups).toEqual([
      { enemyType: 'weak', count: 20 },
    ]);
    expect(PROTOTYPE_CAMPAIGN.getLevel(4).groups).toEqual([
      { enemyType: 'weak', count: 28 },
      { enemyType: 'fast', count: 5 },
    ]);
    expect(PROTOTYPE_CAMPAIGN.getLevel(10).groups).toEqual([
      { enemyType: 'weak', count: 219 },
      { enemyType: 'fast', count: 40 },
      { enemyType: 'strong', count: 1 },
    ]);
    expect(PROTOTYPE_CAMPAIGN.getLevel(15).groups).toEqual([
      { enemyType: 'roach', count: 100 },
    ]);
    expect(PROTOTYPE_CAMPAIGN.getLevel(77).groups).toEqual([
      { enemyType: 'roach', count: 100 },
    ]);
  });

  it('derives core damage independently from wall-attack damage', () => {
    expect(calculateCoreDamage(WEAK_ENEMY.baseDamage)).toBe(1);
    expect(calculateCoreDamage(FAST_ENEMY.baseDamage)).toBe(1);
    expect(calculateCoreDamage(STRONG_ENEMY.baseDamage)).toBe(2);
    expect(calculateCoreDamage(8)).toBe(2);
    expect(calculateCoreDamage(2)).toBe(1);
    expect(ENEMY_DEFINITIONS.strong.navigationProfile.damagePerHit).toBe(8);
  });
});
