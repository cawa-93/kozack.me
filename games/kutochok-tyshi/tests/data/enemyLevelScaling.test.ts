import { describe, expect, it } from 'vitest';

import {
  createEnemyLevelData,
  ENEMY_HP_GAIN_INTERVAL_LEVELS,
  ENEMY_HP_GAIN_PER_INTERVAL,
  ENEMY_SPEED_GAIN_INTERVAL_LEVELS,
  ENEMY_SPEED_GAIN_PER_INTERVAL,
  FAST_ENEMY,
  LATE_ENEMY_DAMAGE_GROWTH_DENOMINATOR,
  LATE_ENEMY_HP_GROWTH_DENOMINATOR,
  LATE_ENEMY_SCALING_START_LEVEL,
  LATE_ENEMY_SPEED_GROWTH_DENOMINATOR,
  NAVIGATION_PROFILES,
  ROACH_ENEMY,
  STRONG_ENEMY,
  WEAK_ENEMY,
} from '../../src/data/enemies';

describe('enemy level scaling', () => {
  it('uses doubled base speed and unmodified base health on level one', () => {
    const data = createEnemyLevelData(1);

    expect(ENEMY_HP_GAIN_INTERVAL_LEVELS).toBe(2);
    expect(ENEMY_HP_GAIN_PER_INTERVAL).toBe(1);
    expect(ENEMY_SPEED_GAIN_INTERVAL_LEVELS).toBe(3);
    expect(ENEMY_SPEED_GAIN_PER_INTERVAL).toBe(1);
    expect(data.definitions.weak).toBe(WEAK_ENEMY);
    expect(data.definitions.fast).toBe(FAST_ENEMY);
    expect(data.definitions.strong).toBe(STRONG_ENEMY);
    expect(data.definitions.roach).toBe(ROACH_ENEMY);
    expect(data.navigationProfiles).toBe(NAVIGATION_PROFILES);
    expect(data.definitions.weak).toMatchObject({ maxHp: 15 });
    expect(data.definitions.fast).toMatchObject({ maxHp: 10 });
    expect(data.definitions.strong).toMatchObject({ maxHp: 40 });
    expect(data.definitions.roach).toMatchObject({ maxHp: 75 });
    expect(data.navigationProfiles.map((profile) => profile.cellsPerSecond)).toEqual([
      2.4,
      5.6,
      4 / 3,
      7.2,
    ]);
  });

  it('adds one health only after each completed two-level interval', () => {
    const levelTwo = createEnemyLevelData(2).definitions;
    const levelThree = createEnemyLevelData(3).definitions;
    const levelTen = createEnemyLevelData(10).definitions;

    expect(levelTwo.weak.maxHp).toBe(15);
    expect(levelTwo.fast.maxHp).toBe(10);
    expect(levelTwo.strong.maxHp).toBe(40);
    expect(levelThree.weak.maxHp).toBe(16);
    expect(levelThree.fast.maxHp).toBe(11);
    expect(levelThree.strong.maxHp).toBe(41);
    expect(levelTen.weak.maxHp).toBe(19);
    expect(levelTen.fast.maxHp).toBe(14);
    expect(levelTen.strong.maxHp).toBe(44);
  });

  it('adds one movement speed only after each completed three-level interval', () => {
    expect(createEnemyLevelData(3).definitions.weak.navigationProfile.cellsPerSecond).toBe(2.4);
    expect(createEnemyLevelData(4).definitions.weak.navigationProfile.cellsPerSecond).toBe(3.4);
    expect(createEnemyLevelData(6).definitions.fast.navigationProfile.cellsPerSecond).toBe(6.6);
    expect(createEnemyLevelData(7).definitions.fast.navigationProfile.cellsPerSecond).toBe(7.6);
    expect(createEnemyLevelData(10).definitions.strong.navigationProfile.cellsPerSecond).toBe(
      4 / 3 + 3,
    );
  });

  it('accelerates proportional health, damage, and speed scaling from level twenty', () => {
    expect(LATE_ENEMY_SCALING_START_LEVEL).toBe(20);
    expect(LATE_ENEMY_HP_GROWTH_DENOMINATOR).toBe(8);
    expect(LATE_ENEMY_DAMAGE_GROWTH_DENOMINATOR).toBe(4);
    expect(LATE_ENEMY_SPEED_GROWTH_DENOMINATOR).toBe(20);

    const samples = [
      {
        level: 20,
        maxHp: [27, 21, 55],
        damage: [5, 3, 10],
        coreDamage: [1, 1, 2],
        speed: [8.82, 12.18, 7.7],
      },
      {
        level: 25,
        maxHp: [42, 33, 86],
        damage: [10, 5, 20],
        coreDamage: [2, 1, 5],
        speed: [10.92, 15.08, 9.533_333_333_333_333],
      },
      {
        level: 30,
        maxHp: [57, 45, 116],
        damage: [15, 8, 30],
        coreDamage: [3, 2, 7],
        speed: [13.02, 17.98, 11.366_666_666_666_667],
      },
      {
        level: 40,
        maxHp: [87, 69, 178],
        damage: [25, 13, 50],
        coreDamage: [6, 3, 12],
        speed: [17.22, 23.78, 15.033_333_333_333_333],
      },
      {
        level: 50,
        maxHp: [117, 93, 239],
        damage: [35, 18, 70],
        coreDamage: [8, 4, 17],
        speed: [21.42, 29.58, 18.7],
      },
      {
        level: 100,
        maxHp: [267, 211, 545],
        damage: [85, 43, 170],
        coreDamage: [21, 10, 42],
        speed: [42.42, 58.58, 37.033_333_333_333_33],
      },
    ] as const;

    for (const sample of samples) {
      const definitions = createEnemyLevelData(sample.level).definitions;
      const ordinaryDefinitions = [
        definitions.weak,
        definitions.fast,
        definitions.strong,
      ];

      expect(ordinaryDefinitions.map((definition) => definition.maxHp)).toEqual(
        sample.maxHp,
      );
      expect(ordinaryDefinitions.map((definition) => definition.baseDamage)).toEqual(
        sample.damage,
      );
      expect(ordinaryDefinitions.map((definition) => definition.coreDamage)).toEqual(
        sample.coreDamage,
      );
      ordinaryDefinitions.forEach((definition, index) => {
        expect(definition.navigationProfile.damagePerHit).toBe(sample.damage[index]);
        expect(definition.navigationProfile.cellsPerSecond).toBeCloseTo(
          sample.speed[index] ?? 0,
          10,
        );
      });
    }
  });

  it('applies optional speed and damage modifiers to one shared level snapshot', () => {
    const data = createEnemyLevelData(4, {
      speedMultiplier: 0.5,
      damageMultiplier: 0.5,
    });

    expect(data.navigationProfiles.map((profile) => profile.cellsPerSecond)).toEqual([
      1.7,
      3.3,
      (4 / 3 + 1) * 0.5,
      7.2,
    ]);
    expect(data.navigationProfiles.map((profile) => profile.damagePerHit)).toEqual([
      2,
      1,
      4,
      4,
    ]);
    expect([
      data.definitions.weak.baseDamage,
      data.definitions.fast.baseDamage,
      data.definitions.strong.baseDamage,
      data.definitions.roach.baseDamage,
    ]).toEqual([2, 1, 4, 4]);
    expect(data.definitions.weak.navigationProfile).toBe(data.navigationProfiles[0]);
    expect(data.definitions.fast.navigationProfile).toBe(data.navigationProfiles[1]);
    expect(data.definitions.strong.navigationProfile).toBe(data.navigationProfiles[2]);
    expect(data.definitions.roach.navigationProfile).toBe(data.navigationProfiles[3]);
  });

  it('enforces the configured minimum speed and never reduces damage below one', () => {
    const data = createEnemyLevelData(1, {
      speedMultiplier: 0.000_1,
      damageMultiplier: 0.000_1,
      minimumCellsPerSecond: 0.25,
    });

    expect(data.navigationProfiles.map((profile) => profile.cellsPerSecond)).toEqual([
      0.25,
      0.25,
      0.25,
      7.2,
    ]);
    expect(data.navigationProfiles.map((profile) => profile.damagePerHit)).toEqual([
      1,
      1,
      1,
      4,
    ]);
    expect(Object.values(data.definitions).map((definition) => definition.baseDamage)).toEqual([
      1,
      1,
      1,
      4,
    ]);
  });

  it('rejects invalid optional enemy modifiers', () => {
    expect(() => createEnemyLevelData(1, { speedMultiplier: 0 })).toThrow(RangeError);
    expect(() => createEnemyLevelData(1, { damageMultiplier: -1 })).toThrow(RangeError);
    expect(() => createEnemyLevelData(1, {
      minimumCellsPerSecond: Number.NaN,
    })).toThrow(RangeError);
    expect(() => createEnemyLevelData(1, {
      minimumCellsPerSecond: -0.1,
    })).toThrow(RangeError);
  });

  it('keeps stable profile ids and shares one profile per type within a level', () => {
    const levelFour = createEnemyLevelData(4);

    expect(levelFour.navigationProfiles.map((profile) => profile.id)).toEqual([
      'weak-ground',
      'fast-ground',
      'strong-ground',
      'roach-ground',
    ]);
    expect(levelFour.definitions.weak.navigationProfile).toBe(levelFour.navigationProfiles[0]);
    expect(levelFour.definitions.fast.navigationProfile).toBe(levelFour.navigationProfiles[1]);
    expect(levelFour.definitions.strong.navigationProfile).toBe(levelFour.navigationProfiles[2]);
    expect(levelFour.definitions.roach.navigationProfile).toBe(levelFour.navigationProfiles[3]);
    expect(new Set(levelFour.navigationProfiles.map((profile) => profile.id)).size).toBe(4);
  });

  it('returns detached immutable level data without changing the base definitions', () => {
    const levelFour = createEnemyLevelData(4);

    expect(Object.isFrozen(levelFour)).toBe(true);
    expect(Object.isFrozen(levelFour.definitions)).toBe(true);
    expect(Object.isFrozen(levelFour.navigationProfiles)).toBe(true);
    expect(Object.isFrozen(levelFour.definitions.weak)).toBe(true);
    expect(Object.isFrozen(levelFour.definitions.weak.navigationProfile)).toBe(true);
    expect(Object.isFrozen(levelFour.definitions.roach)).toBe(true);
    expect(Object.isFrozen(levelFour.definitions.roach.navigationProfile)).toBe(true);
    expect(levelFour.definitions.weak).not.toBe(WEAK_ENEMY);
    expect(WEAK_ENEMY).toMatchObject({
      maxHp: 15,
      navigationProfile: { cellsPerSecond: 2.4 },
    });
  });

  it('rejects invalid level numbers and keeps health safe on extreme levels', () => {
    for (const invalidLevel of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createEnemyLevelData(invalidLevel)).toThrow(RangeError);
    }

    const extreme = createEnemyLevelData(Number.MAX_SAFE_INTEGER);
    expect(extreme.definitions.weak.maxHp).toBe(Number.MAX_SAFE_INTEGER);
    expect(extreme.definitions.fast.maxHp).toBe(Number.MAX_SAFE_INTEGER);
    expect(extreme.definitions.strong.maxHp).toBe(Number.MAX_SAFE_INTEGER);
    for (const definition of [
      extreme.definitions.weak,
      extreme.definitions.fast,
      extreme.definitions.strong,
    ]) {
      expect(Number.isSafeInteger(definition.baseDamage)).toBe(true);
      expect(definition.baseDamage).toBeGreaterThan(0);
      expect(Number.isFinite(definition.navigationProfile.cellsPerSecond)).toBe(true);
      expect(definition.navigationProfile.cellsPerSecond).toBeGreaterThan(0);
    }
    expect(extreme.definitions.roach.maxHp).toBe(75);
  });

  it('keeps Roach stats static across special levels and enemy debuffs', () => {
    for (const levelNumber of [15, 77]) {
      const roach = createEnemyLevelData(levelNumber, {
        speedMultiplier: 0.25,
        damageMultiplier: 0.25,
        minimumCellsPerSecond: 0.25,
      }).definitions.roach;

      expect(roach).toBe(ROACH_ENEMY);
      expect(roach).toMatchObject({
        maxHp: 75,
        baseDamage: 4,
        coreDamage: 0,
        coreHealing: 1,
        navigationProfile: {
          id: 'roach-ground',
          cellsPerSecond: 7.2,
          damagePerHit: 4,
          instantWallBreak: true,
        },
      });
    }
  });
});
