import {
  CORE_POSITION,
  GRID_HEIGHT,
  GRID_WIDTH,
  SPAWN_POINTS,
} from '../config/gameConfig';
import type { EnemyType } from '../domain/enemies/EnemyDefinition';
import type { GridPoint } from '../domain/grid/GridPoint';

export const ENEMY_SPAWN_INTERVAL_MS = 500;
export const ENEMY_SPAWN_INTERVAL_DECREASE_PER_LEVEL_MS = 50;
export const LATE_ENEMY_SPAWN_INTERVAL_DECREASE_PER_LEVEL_MS = 10;
export const SPAWN_INTERVAL_SMOOTHING_START_LEVEL = 11;
export const POST_LEVEL_20_SCALING_START_LEVEL = 20;
export const PRE_LEVEL_20_MIN_ENEMY_SPAWN_INTERVAL_MS = 10;
export const POST_LEVEL_20_SPAWN_INTERVAL_DECREASE_MS = 2;
export const MAX_ENEMY_SPAWNS_PER_SECOND = 500;
export const MIN_ENEMY_SPAWN_INTERVAL_MS = (
  1_000 / MAX_ENEMY_SPAWNS_PER_SECOND
);
export const ENEMY_COUNT_GROWTH_NUMERATOR = 14;
export const ENEMY_COUNT_GROWTH_DENOMINATOR = 10;
export const LATE_ENEMY_COUNT_GROWTH_NUMERATOR = 115;
export const LATE_ENEMY_COUNT_GROWTH_DENOMINATOR = 100;
export const LATE_ENEMY_COUNT_GROWTH_START_LEVEL = 16;
export const FAST_ENEMY_UNLOCK_LEVEL = 4;
export const STRONG_ENEMY_UNLOCK_LEVEL = 10;
export const EXTRA_SPAWN_POINT_INTERVAL = 5;
export const MAX_SPAWN_POINT_COUNT = 100;
export const ROACH_LEVEL_ENEMY_COUNT = 100;
export const ROACH_SPAWN_INTERVAL_MS = 500;
export const ROACH_LEVEL_NUMBERS: ReadonlySet<number> = new Set([15, 77]);

const MAX_SAFE_ENEMY_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

export interface EnemyGroup {
  readonly enemyType: EnemyType;
  readonly count: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly groups: readonly EnemyGroup[];
  readonly spawnPoints: readonly GridPoint[];
}

export interface CampaignDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly core: GridPoint;
  /** Initial points used before the first procedural level is selected. */
  readonly spawnPoints: readonly GridPoint[];
  readonly spawnIntervalMs: number;
  /** `null` means the campaign has no final level. */
  readonly maxLevel: number | null;
  readonly getLevel: (levelNumber: number) => LevelDefinition;
}

type OrdinaryEnemyType = Exclude<EnemyType, 'roach'>;

interface EnemyProgression {
  readonly enemyType: OrdinaryEnemyType;
  readonly unlockLevel: number;
  readonly initialCount: number;
}

interface PostLevel20EnemyCountRule {
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly maximum: bigint;
}

const POST_LEVEL_20_ENEMY_COUNT_RULES: Readonly<
  Record<OrdinaryEnemyType, PostLevel20EnemyCountRule>
> = Object.freeze({
  weak: Object.freeze({ numerator: 102n, denominator: 100n, maximum: 2_500n }),
  fast: Object.freeze({ numerator: 105n, denominator: 100n, maximum: 1_250n }),
  strong: Object.freeze({ numerator: 118n, denominator: 100n, maximum: 1_500n }),
});

const ENEMY_PROGRESSION: readonly EnemyProgression[] = Object.freeze([
  Object.freeze({ enemyType: 'weak', unlockLevel: 1, initialCount: 10 }),
  Object.freeze({
    enemyType: 'fast',
    unlockLevel: FAST_ENEMY_UNLOCK_LEVEL,
    initialCount: 5,
  }),
  Object.freeze({
    enemyType: 'strong',
    unlockLevel: STRONG_ENEMY_UNLOCK_LEVEL,
    initialCount: 1,
  }),
]);

export function enemyCountAtLevel(
  levelNumber: number,
  unlockLevel: number,
  initialCount: number,
  enemyType: OrdinaryEnemyType = 'weak',
): number {
  assertPositiveSafeInteger(levelNumber, 'Level number');
  assertPositiveSafeInteger(unlockLevel, 'Enemy unlock level');
  assertPositiveSafeInteger(initialCount, 'Initial enemy count');

  if (levelNumber < unlockLevel) {
    return 0;
  }

  let count = BigInt(initialCount);
  for (let level = unlockLevel; level < levelNumber; level += 1) {
    const nextLevel = level + 1;
    const postLevel20Rule = POST_LEVEL_20_ENEMY_COUNT_RULES[enemyType];
    const usesPostLevel20Growth = nextLevel >= POST_LEVEL_20_SCALING_START_LEVEL;
    const usesLateGrowth = (
      !usesPostLevel20Growth
      && nextLevel >= LATE_ENEMY_COUNT_GROWTH_START_LEVEL
    );
    const numerator = usesPostLevel20Growth
      ? postLevel20Rule.numerator
      : BigInt(
          usesLateGrowth
            ? LATE_ENEMY_COUNT_GROWTH_NUMERATOR
            : ENEMY_COUNT_GROWTH_NUMERATOR,
        );
    const denominator = usesPostLevel20Growth
      ? postLevel20Rule.denominator
      : BigInt(
          usesLateGrowth
            ? LATE_ENEMY_COUNT_GROWTH_DENOMINATOR
            : ENEMY_COUNT_GROWTH_DENOMINATOR,
        );
    count = (
      count * numerator
      + denominator - 1n
    ) / denominator;

    if (usesPostLevel20Growth && count >= postLevel20Rule.maximum) {
      return Number(postLevel20Rule.maximum);
    }

    if (count >= MAX_SAFE_ENEMY_COUNT) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  return Number(count);
}

export function spawnIntervalMsAtLevel(
  levelNumber: number,
  baseIntervalMs = ENEMY_SPAWN_INTERVAL_MS,
): number {
  assertPositiveSafeInteger(levelNumber, 'Level number');
  if (!Number.isFinite(baseIntervalMs) || baseIntervalMs <= 0) {
    throw new RangeError('Base enemy spawn interval must be a positive number.');
  }

  if (ROACH_LEVEL_NUMBERS.has(levelNumber)) {
    return ROACH_SPAWN_INTERVAL_MS;
  }

  const earlyReductionCount = Math.min(
    levelNumber - 1,
    SPAWN_INTERVAL_SMOOTHING_START_LEVEL - 2,
  );
  const lateReductionCount = Math.max(
    0,
    levelNumber - SPAWN_INTERVAL_SMOOTHING_START_LEVEL + 1,
  );
  const levelReductionMs = (
    earlyReductionCount * ENEMY_SPAWN_INTERVAL_DECREASE_PER_LEVEL_MS
    + lateReductionCount * LATE_ENEMY_SPAWN_INTERVAL_DECREASE_PER_LEVEL_MS
  );
  const preLevel20IntervalMs = Math.max(
    PRE_LEVEL_20_MIN_ENEMY_SPAWN_INTERVAL_MS,
    baseIntervalMs - levelReductionMs,
  );

  if (levelNumber < POST_LEVEL_20_SCALING_START_LEVEL) {
    return preLevel20IntervalMs;
  }

  const postLevel20ReductionCount = (
    levelNumber - POST_LEVEL_20_SCALING_START_LEVEL + 1
  );

  return Math.max(
    MIN_ENEMY_SPAWN_INTERVAL_MS,
    preLevel20IntervalMs
      - postLevel20ReductionCount * POST_LEVEL_20_SPAWN_INTERVAL_DECREASE_MS,
  );
}

export function spawnPointCountAtLevel(levelNumber: number): number {
  assertPositiveSafeInteger(levelNumber, 'Level number');

  if (levelNumber < EXTRA_SPAWN_POINT_INTERVAL) {
    return 1;
  }

  return Math.min(
    MAX_SPAWN_POINT_COUNT,
    1 + Math.floor(levelNumber / EXTRA_SPAWN_POINT_INTERVAL),
  );
}

export function createLevelDefinition(
  levelNumber: number,
  width = GRID_WIDTH,
  height = GRID_HEIGHT,
): LevelDefinition {
  assertPositiveSafeInteger(levelNumber, 'Level number');
  assertArenaDimension(width, 'Arena width');
  assertArenaDimension(height, 'Arena height');

  const groups: readonly EnemyGroup[] = ROACH_LEVEL_NUMBERS.has(levelNumber)
    ? [Object.freeze({
        enemyType: 'roach',
        count: ROACH_LEVEL_ENEMY_COUNT,
      })]
    : ENEMY_PROGRESSION.flatMap((progression) => {
        const count = enemyCountAtLevel(
          levelNumber,
          progression.unlockLevel,
          progression.initialCount,
          progression.enemyType,
        );
        return count === 0
          ? []
          : [Object.freeze({ enemyType: progression.enemyType, count })];
      });

  return Object.freeze({
    id: `level-${levelNumber}`,
    groups: Object.freeze(groups),
    spawnPoints: createSpawnPoints(levelNumber, width, height),
  });
}

export function createSpawnPoints(
  levelNumber: number,
  width = GRID_WIDTH,
  height = GRID_HEIGHT,
): readonly GridPoint[] {
  assertPositiveSafeInteger(levelNumber, 'Level number');
  assertArenaDimension(width, 'Arena width');
  assertArenaDimension(height, 'Arena height');

  if (levelNumber < EXTRA_SPAWN_POINT_INTERVAL) {
    return Object.freeze([
      Object.freeze({ x: Math.floor(width / 2), y: height - 1 }),
    ]);
  }

  const candidates = createBorderPoints(width, height);
  const selectedCount = Math.min(
    spawnPointCountAtLevel(levelNumber),
    candidates.length,
  );
  let randomState = seedForLevel(levelNumber, width, height);

  for (let index = 0; index < selectedCount; index += 1) {
    randomState = nextRandomState(randomState);
    const swapIndex = index + randomState % (candidates.length - index);
    const current = candidates[index];
    const selected = candidates[swapIndex];
    if (current === undefined || selected === undefined) {
      throw new RangeError('Could not select a deterministic border spawn point.');
    }
    candidates[index] = selected;
    candidates[swapIndex] = current;
  }

  return Object.freeze(
    candidates
      .slice(0, selectedCount)
      .map((point) => Object.freeze({ ...point })),
  );
}

export const PROTOTYPE_CAMPAIGN: CampaignDefinition = Object.freeze({
  id: 'endless-prototype',
  width: GRID_WIDTH,
  height: GRID_HEIGHT,
  core: CORE_POSITION,
  spawnPoints: SPAWN_POINTS,
  spawnIntervalMs: ENEMY_SPAWN_INTERVAL_MS,
  maxLevel: null,
  getLevel: (levelNumber: number) => createLevelDefinition(levelNumber),
});

function createBorderPoints(width: number, height: number): GridPoint[] {
  const points: GridPoint[] = [];

  for (let x = 0; x < width; x += 1) {
    points.push({ x, y: 0 });
  }
  for (let y = 1; y < height; y += 1) {
    points.push({ x: width - 1, y });
  }
  for (let x = width - 2; x >= 0; x -= 1) {
    points.push({ x, y: height - 1 });
  }
  for (let y = height - 2; y > 0; y -= 1) {
    points.push({ x: 0, y });
  }

  return points;
}

function seedForLevel(levelNumber: number, width: number, height: number): number {
  const low = levelNumber >>> 0;
  const high = Math.floor(levelNumber / 0x1_0000_0000) >>> 0;
  let seed = Math.imul(low ^ 0x9e37_79b9, 0x85eb_ca6b);
  seed ^= Math.imul(high ^ width, 0xc2b2_ae35);
  seed ^= Math.imul(height, 0x27d4_eb2f);
  return seed >>> 0 || 0x6d2b_79f5;
}

function nextRandomState(state: number): number {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertArenaDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 3) {
    throw new RangeError(`${label} must be a safe integer of at least 3.`);
  }
}
