import {
  calculateCoreDamage,
  type EnemyDefinition,
  type EnemyType,
} from '../domain/enemies/EnemyDefinition';
import type { NavigationProfile } from '../domain/enemies/NavigationProfile';

export const ENEMY_BASE_DAMAGE = 4;
export const ENEMY_HP_GAIN_INTERVAL_LEVELS = 2;
export const ENEMY_HP_GAIN_PER_INTERVAL = 1;
export const ENEMY_SPEED_GAIN_INTERVAL_LEVELS = 3;
export const ENEMY_SPEED_GAIN_PER_INTERVAL = 1;
export const LATE_ENEMY_SCALING_START_LEVEL = 20;
export const LATE_ENEMY_HP_GROWTH_DENOMINATOR = 8;
export const LATE_ENEMY_DAMAGE_GROWTH_DENOMINATOR = 4;
export const LATE_ENEMY_SPEED_GROWTH_DENOMINATOR = 20;
export const ROACH_CORE_HEALING = 1;
export const ROACH_MAX_HP_MULTIPLIER = 5;
export const ROACH_SPEED_MULTIPLIER = 3;

const WEAK_NAVIGATION: NavigationProfile = Object.freeze({
  id: 'weak-ground',
  cellsPerSecond: 2.4,
  damagePerHit: 4,
  attackIntervalMs: 1_000,
});

const FAST_NAVIGATION: NavigationProfile = Object.freeze({
  id: 'fast-ground',
  cellsPerSecond: 5.6,
  damagePerHit: 2,
  attackIntervalMs: 1_000,
});

const STRONG_NAVIGATION: NavigationProfile = Object.freeze({
  id: 'strong-ground',
  cellsPerSecond: 4 / 3,
  damagePerHit: 8,
  attackIntervalMs: 250,
});

const ROACH_NAVIGATION: NavigationProfile = Object.freeze({
  id: 'roach-ground',
  cellsPerSecond: Math.round(
    WEAK_NAVIGATION.cellsPerSecond * ROACH_SPEED_MULTIPLIER * 10,
  ) / 10,
  damagePerHit: ENEMY_BASE_DAMAGE,
  attackIntervalMs: 1_000,
  instantWallBreak: true,
});

export const WEAK_ENEMY: EnemyDefinition = Object.freeze({
  id: 'weak',
  name: 'Weak',
  maxHp: 15,
  baseDamage: ENEMY_BASE_DAMAGE,
  coreDamage: calculateCoreDamage(ENEMY_BASE_DAMAGE),
  coreHealing: 0,
  navigationProfile: WEAK_NAVIGATION,
});

export const FAST_ENEMY: EnemyDefinition = Object.freeze({
  id: 'fast',
  name: 'Fast',
  maxHp: 10,
  baseDamage: FAST_NAVIGATION.damagePerHit,
  coreDamage: calculateCoreDamage(FAST_NAVIGATION.damagePerHit),
  coreHealing: 0,
  navigationProfile: FAST_NAVIGATION,
});

export const STRONG_ENEMY: EnemyDefinition = Object.freeze({
  id: 'strong',
  name: 'Strong',
  maxHp: 40,
  baseDamage: STRONG_NAVIGATION.damagePerHit,
  coreDamage: calculateCoreDamage(STRONG_NAVIGATION.damagePerHit),
  coreHealing: 0,
  navigationProfile: STRONG_NAVIGATION,
});

export const ROACH_ENEMY: EnemyDefinition = Object.freeze({
  id: 'roach',
  name: 'Roach',
  maxHp: WEAK_ENEMY.maxHp * ROACH_MAX_HP_MULTIPLIER,
  baseDamage: ENEMY_BASE_DAMAGE,
  coreDamage: 0,
  coreHealing: ROACH_CORE_HEALING,
  navigationProfile: ROACH_NAVIGATION,
});

export const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = Object.freeze({
  weak: WEAK_ENEMY,
  fast: FAST_ENEMY,
  strong: STRONG_ENEMY,
  roach: ROACH_ENEMY,
});

export const NAVIGATION_PROFILES: readonly NavigationProfile[] = Object.freeze([
  WEAK_NAVIGATION,
  FAST_NAVIGATION,
  STRONG_NAVIGATION,
  ROACH_NAVIGATION,
]);

export interface EnemyLevelData {
  readonly levelNumber: number;
  readonly definitions: Readonly<Record<EnemyType, EnemyDefinition>>;
  readonly navigationProfiles: readonly NavigationProfile[];
}

export interface EnemyLevelModifiers {
  readonly speedMultiplier?: number;
  readonly damageMultiplier?: number;
  readonly minimumCellsPerSecond?: number;
}

/**
 * Creates the immutable enemy definitions shared by every unit on one level.
 * Profile ids remain stable so one flow field can still serve every enemy of
 * the same navigation profile.
 */
export function createEnemyLevelData(
  levelNumber: number,
  modifiers: EnemyLevelModifiers = {},
): EnemyLevelData {
  assertPositiveSafeInteger(levelNumber, 'Level number');

  const speedMultiplier = modifiers.speedMultiplier ?? 1;
  const damageMultiplier = modifiers.damageMultiplier ?? 1;
  const minimumCellsPerSecond = modifiers.minimumCellsPerSecond ?? 0;
  assertPositiveFinite(speedMultiplier, 'Enemy speed multiplier');
  assertPositiveFinite(damageMultiplier, 'Enemy damage multiplier');
  if (!Number.isFinite(minimumCellsPerSecond) || minimumCellsPerSecond < 0) {
    throw new RangeError('Minimum enemy speed must be a finite non-negative number.');
  }

  if (
    levelNumber === 1
    && speedMultiplier === 1
    && damageMultiplier === 1
    && minimumCellsPerSecond === 0
  ) {
    return Object.freeze({
      levelNumber,
      definitions: ENEMY_DEFINITIONS,
      navigationProfiles: NAVIGATION_PROFILES,
    });
  }

  const weak = createEffectiveDefinition(
    WEAK_ENEMY,
    levelNumber,
    speedMultiplier,
    damageMultiplier,
    minimumCellsPerSecond,
  );
  const fast = createEffectiveDefinition(
    FAST_ENEMY,
    levelNumber,
    speedMultiplier,
    damageMultiplier,
    minimumCellsPerSecond,
  );
  const strong = createEffectiveDefinition(
    STRONG_ENEMY,
    levelNumber,
    speedMultiplier,
    damageMultiplier,
    minimumCellsPerSecond,
  );

  return Object.freeze({
    levelNumber,
    definitions: Object.freeze({ weak, fast, strong, roach: ROACH_ENEMY }),
    navigationProfiles: Object.freeze([
      weak.navigationProfile,
      fast.navigationProfile,
      strong.navigationProfile,
      ROACH_NAVIGATION,
    ]),
  });
}

export function getEnemyDefinition(type: EnemyType): EnemyDefinition {
  return ENEMY_DEFINITIONS[type];
}

function createEffectiveDefinition(
  baseDefinition: EnemyDefinition,
  levelNumber: number,
  speedMultiplier: number,
  damageMultiplier: number,
  minimumCellsPerSecond: number,
): EnemyDefinition {
  const levelDamage = damageAtLevel(baseDefinition.baseDamage, levelNumber);
  const effectiveLevelDamage = effectiveDamage(levelDamage, damageMultiplier);
  const navigationProfile: NavigationProfile = Object.freeze({
    ...baseDefinition.navigationProfile,
    cellsPerSecond: Math.max(
      minimumCellsPerSecond,
      speedAtLevel(
        baseDefinition.navigationProfile.cellsPerSecond,
        levelNumber,
      ) * speedMultiplier,
    ),
    damagePerHit: effectiveLevelDamage,
  });

  return Object.freeze({
    ...baseDefinition,
    maxHp: maxHpAtLevel(baseDefinition.maxHp, levelNumber),
    baseDamage: effectiveLevelDamage,
    coreDamage: effectiveDamage(
      calculateCoreDamage(levelDamage),
      damageMultiplier,
    ),
    navigationProfile,
  });
}

function effectiveDamage(baseDamage: number, multiplier: number): number {
  return Math.max(1, Math.round(baseDamage * multiplier));
}

function maxHpAtLevel(baseMaxHp: number, levelNumber: number): number {
  if (levelNumber < LATE_ENEMY_SCALING_START_LEVEL) {
    const completedHpIntervals = BigInt(levelNumber - 1)
      / BigInt(ENEMY_HP_GAIN_INTERVAL_LEVELS);
    const scaledHp = BigInt(baseMaxHp)
      + completedHpIntervals * BigInt(ENEMY_HP_GAIN_PER_INTERVAL);
    return saturatingSafeInteger(scaledHp);
  }

  const lateLevelCount = lateLevelCountAt(levelNumber);
  const baselineHp = BigInt(baseMaxHp) + (
    BigInt(LATE_ENEMY_SCALING_START_LEVEL - 2)
    / BigInt(ENEMY_HP_GAIN_INTERVAL_LEVELS)
  ) * BigInt(ENEMY_HP_GAIN_PER_INTERVAL);
  return scaleSafeIntegerNearest(
    baselineHp,
    BigInt(LATE_ENEMY_HP_GROWTH_DENOMINATOR) + lateLevelCount,
    BigInt(LATE_ENEMY_HP_GROWTH_DENOMINATOR),
  );
}

function damageAtLevel(baseDamage: number, levelNumber: number): number {
  if (levelNumber < LATE_ENEMY_SCALING_START_LEVEL) {
    return baseDamage;
  }

  return scaleSafeIntegerNearest(
    BigInt(baseDamage),
    BigInt(LATE_ENEMY_DAMAGE_GROWTH_DENOMINATOR)
      + lateLevelCountAt(levelNumber),
    BigInt(LATE_ENEMY_DAMAGE_GROWTH_DENOMINATOR),
  );
}

function speedAtLevel(baseSpeed: number, levelNumber: number): number {
  if (levelNumber < LATE_ENEMY_SCALING_START_LEVEL) {
    const completedSpeedIntervals = Math.floor(
      (levelNumber - 1) / ENEMY_SPEED_GAIN_INTERVAL_LEVELS,
    );
    return baseSpeed
      + completedSpeedIntervals * ENEMY_SPEED_GAIN_PER_INTERVAL;
  }

  const baselineSpeed = baseSpeed + (
    Math.floor(
      (LATE_ENEMY_SCALING_START_LEVEL - 2)
      / ENEMY_SPEED_GAIN_INTERVAL_LEVELS,
    ) * ENEMY_SPEED_GAIN_PER_INTERVAL
  );
  return baselineSpeed * (
    1
    + Number(lateLevelCountAt(levelNumber))
      / LATE_ENEMY_SPEED_GROWTH_DENOMINATOR
  );
}

function lateLevelCountAt(levelNumber: number): bigint {
  return BigInt(levelNumber - LATE_ENEMY_SCALING_START_LEVEL + 1);
}

function scaleSafeIntegerNearest(
  value: bigint,
  numerator: bigint,
  denominator: bigint,
): number {
  return saturatingSafeInteger(
    (value * numerator + denominator / 2n) / denominator,
  );
}

function saturatingSafeInteger(value: bigint): number {
  return value >= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(value);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}
