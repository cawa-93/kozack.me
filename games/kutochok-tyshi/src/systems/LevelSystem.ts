import {
  spawnIntervalMsAtLevel,
  type CampaignDefinition,
  type EnemyGroup,
  type LevelDefinition,
} from '../data/levels';
import type { EnemyType } from '../domain/enemies/EnemyDefinition';
import type { GridPoint } from '../domain/grid/GridPoint';
import { EnemySpawnMixer } from './EnemySpawnMixer';

export type LevelPhase = 'build' | 'spawning' | 'active' | 'completed';

interface LevelEventContext {
  readonly levelNumber: number;
  readonly levelId: string;
}

export interface LevelStartedEvent extends LevelEventContext {
  readonly type: 'level-started';
  readonly spawnPoints: readonly GridPoint[];
}

export interface EnemySpawnEvent extends LevelEventContext {
  readonly type: 'enemy-spawn';
  readonly enemyType: EnemyType;
  readonly spawnPoint: GridPoint;
  readonly levelSpawnOrdinal: number;
  readonly campaignSpawnOrdinal: number;
}

export interface LevelCompletedEvent extends LevelEventContext {
  readonly type: 'level-completed';
}

export interface CampaignCompletedEvent extends LevelEventContext {
  readonly type: 'campaign-completed';
  readonly campaignId: string;
}

export type LevelSystemEvent =
  | LevelStartedEvent
  | EnemySpawnEvent
  | LevelCompletedEvent
  | CampaignCompletedEvent;

export interface LevelSystemOptions {
  readonly initialLevelNumber?: number;
}

const EMPTY_EVENTS: readonly LevelSystemEvent[] = Object.freeze([]);
const VALID_ENEMY_TYPES: ReadonlySet<EnemyType> = new Set([
  'weak',
  'fast',
  'strong',
  'roach',
]);

export class LevelSystem {
  private phaseValue: LevelPhase = 'build';
  private currentLevelNumberValue: number | null = null;
  private nextLevelNumberValue: number | null;
  private completedLevelCountValue = 0;
  private currentLevelValue: LevelDefinition | null = null;
  private nextLevelCache: LevelDefinition | null = null;
  private spawnMixer: EnemySpawnMixer | null = null;
  private levelSpawned = 0;
  private nextSpawnPointIndex = 0;
  private spawnElapsedMs = 0;
  private activeSpawnIntervalMs = 0;
  private activeEnemies = 0;
  private campaignSpawned = 0;

  constructor(
    private readonly campaign: CampaignDefinition,
    options: LevelSystemOptions = {},
  ) {
    this.validateCampaign(campaign);
    const initialLevelNumber = options.initialLevelNumber ?? 1;
    this.validateInitialLevelNumber(initialLevelNumber);
    this.nextLevelNumberValue = initialLevelNumber;
  }

  get phase(): LevelPhase {
    return this.phaseValue;
  }

  get currentLevelNumber(): number | null {
    return this.currentLevelNumberValue;
  }

  get currentLevelId(): string | null {
    return this.currentLevelValue?.id ?? null;
  }

  get nextLevelNumber(): number | null {
    return this.canStartNextLevel
      ? this.nextLevelNumberValue
      : null;
  }

  get nextLevelDefinition(): LevelDefinition | null {
    if (!this.canStartNextLevel) {
      return null;
    }

    if (this.nextLevelCache === null) {
      const levelNumber = this.nextLevelNumberValue;
      if (levelNumber === null) {
        return null;
      }
      const level = this.campaign.getLevel(levelNumber);
      this.validateLevel(level, levelNumber);
      this.nextLevelCache = level;
    }

    return this.nextLevelCache;
  }

  get completedLevelCount(): number {
    return this.completedLevelCountValue;
  }

  get activeEnemyCount(): number {
    return this.activeEnemies;
  }

  get levelEnemyTotal(): number {
    const level = this.phaseValue === 'build'
      ? this.nextLevelDefinition
      : this.currentLevelValue;

    if (level === null) {
      return 0;
    }

    let total = 0;
    for (const group of level.groups) {
      total = saturatingAdd(total, group.count);
    }
    return total;
  }

  get pendingSpawnCount(): number {
    if (this.phaseValue === 'build' || this.phaseValue === 'completed') {
      return 0;
    }

    return this.spawnMixer?.pendingCount ?? 0;
  }

  get canStartNextLevel(): boolean {
    if (this.phaseValue !== 'build' || this.nextLevelNumberValue === null) {
      return false;
    }

    return this.campaign.maxLevel === null
      || this.nextLevelNumberValue <= this.campaign.maxLevel;
  }

  get isComplete(): boolean {
    return this.phaseValue === 'completed';
  }

  peekNextLevel(): LevelDefinition | null {
    return this.nextLevelDefinition;
  }

  /**
   * Drops a lazily prepared build-phase level so between-level modifiers can
   * be applied before the definition is requested again.
   */
  invalidateNextLevelPreparation(): boolean {
    if (this.phaseValue !== 'build' || this.nextLevelCache === null) {
      return false;
    }

    this.nextLevelCache = null;
    return true;
  }

  startNextLevel(): readonly LevelSystemEvent[] {
    const level = this.nextLevelDefinition;
    const levelNumber = this.nextLevelNumber;
    if (level === null || levelNumber === null) {
      return EMPTY_EVENTS;
    }

    this.currentLevelNumberValue = levelNumber;
    this.nextLevelNumberValue = this.levelAfter(levelNumber);
    this.currentLevelValue = level;
    this.nextLevelCache = null;
    this.spawnMixer = new EnemySpawnMixer(level.groups);
    this.levelSpawned = 0;
    this.nextSpawnPointIndex = 0;
    this.spawnElapsedMs = 0;
    this.activeSpawnIntervalMs = spawnIntervalMsAtLevel(
      levelNumber,
      this.campaign.spawnIntervalMs,
    );
    this.activeEnemies = 0;
    this.phaseValue = 'spawning';

    const events: LevelSystemEvent[] = [Object.freeze({
      type: 'level-started',
      levelNumber,
      levelId: level.id,
      spawnPoints: level.spawnPoints,
    })];
    this.emitNextSpawn(events);

    return Object.freeze(events);
  }

  update(deltaMs: number): readonly LevelSystemEvent[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('Level update delta must be a finite non-negative number.');
    }

    if (this.phaseValue !== 'spawning' || deltaMs === 0) {
      return EMPTY_EVENTS;
    }

    const events: LevelSystemEvent[] = [];
    let remainingMs = deltaMs;

    while (remainingMs > 0 && this.phaseValue === 'spawning') {
      const untilNextSpawnMs = this.activeSpawnIntervalMs - this.spawnElapsedMs;
      if (remainingMs < untilNextSpawnMs) {
        this.spawnElapsedMs += remainingMs;
        break;
      }

      remainingMs -= untilNextSpawnMs;
      this.spawnElapsedMs = 0;
      this.emitNextSpawn(events);
    }

    return events.length === 0 ? EMPTY_EVENTS : Object.freeze(events);
  }

  notifyEnemyResolved(count = 1): readonly LevelSystemEvent[] {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError('Resolved enemy count must be a positive integer.');
    }

    if (count > this.activeEnemies) {
      throw new RangeError('Cannot resolve more enemies than are currently active.');
    }

    this.activeEnemies -= count;
    if (this.activeEnemies !== 0 || this.phaseValue !== 'active') {
      return EMPTY_EVENTS;
    }

    return this.finishCurrentLevel();
  }

  private emitNextSpawn(events: LevelSystemEvent[]): void {
    const level = this.currentLevelValue;
    const levelNumber = this.currentLevelNumberValue;
    if (level === null || levelNumber === null) {
      throw new RangeError('Cannot spawn an enemy without an active level.');
    }

    const spawnMixer = this.spawnMixer;
    if (spawnMixer === null) {
      throw new RangeError('Cannot spawn without an enemy schedule.');
    }
    const enemyType = spawnMixer.nextEnemyType();
    if (enemyType === null) {
      throw new RangeError('Cannot spawn beyond the configured enemy schedule.');
    }

    const spawnPoint = level.spawnPoints[this.nextSpawnPointIndex];
    if (spawnPoint === undefined) {
      throw new RangeError('The level has no spawn point for this enemy.');
    }

    this.nextSpawnPointIndex = (
      this.nextSpawnPointIndex + 1
    ) % level.spawnPoints.length;
    this.levelSpawned = saturatingAdd(this.levelSpawned, 1);
    this.campaignSpawned = saturatingAdd(this.campaignSpawned, 1);
    this.activeEnemies = saturatingAdd(this.activeEnemies, 1);

    events.push(Object.freeze({
      type: 'enemy-spawn',
      levelNumber,
      levelId: level.id,
      enemyType,
      spawnPoint,
      levelSpawnOrdinal: this.levelSpawned,
      campaignSpawnOrdinal: this.campaignSpawned,
    }));

    if (spawnMixer.isComplete) {
      this.phaseValue = 'active';
    }
  }

  private finishCurrentLevel(): readonly LevelSystemEvent[] {
    const level = this.currentLevelValue;
    const levelNumber = this.currentLevelNumberValue;
    if (level === null || levelNumber === null) {
      throw new RangeError('Cannot complete a level before one has started.');
    }

    if (this.completedLevelCountValue < Number.MAX_SAFE_INTEGER) {
      this.completedLevelCountValue += 1;
    }

    const levelContext = Object.freeze({
      levelNumber,
      levelId: level.id,
    });
    const events: LevelSystemEvent[] = [Object.freeze({
      type: 'level-completed',
      ...levelContext,
    })];

    if (this.campaign.maxLevel !== null
      && levelNumber === this.campaign.maxLevel) {
      this.phaseValue = 'completed';
      events.push(Object.freeze({
        type: 'campaign-completed',
        campaignId: this.campaign.id,
        ...levelContext,
      }));
    } else {
      this.phaseValue = 'build';
    }

    this.spawnMixer = null;
    this.levelSpawned = 0;
    this.nextSpawnPointIndex = 0;
    this.spawnElapsedMs = 0;
    this.activeSpawnIntervalMs = 0;

    return Object.freeze(events);
  }

  private validateCampaign(campaign: CampaignDefinition): void {
    if (campaign.id.trim().length === 0) {
      throw new RangeError('A campaign must have a non-empty id.');
    }

    if (!Number.isSafeInteger(campaign.width) || campaign.width < 3
      || !Number.isSafeInteger(campaign.height) || campaign.height < 3) {
      throw new RangeError('Campaign dimensions must be safe integers of at least 3.');
    }

    if (!this.isPointInsideArena(campaign.core)
      || this.isPointOnArenaEdge(campaign.core)) {
      throw new RangeError('The campaign core must be inside the arena and off its edge.');
    }

    this.validateSpawnPoints(campaign.spawnPoints, 'campaign');

    if (!Number.isFinite(campaign.spawnIntervalMs) || campaign.spawnIntervalMs <= 0) {
      throw new RangeError('Enemy spawn interval must be a positive number.');
    }

    if (campaign.maxLevel !== null
      && (!Number.isSafeInteger(campaign.maxLevel) || campaign.maxLevel <= 0)) {
      throw new RangeError('A finite campaign max level must be a positive safe integer.');
    }

    if (typeof campaign.getLevel !== 'function') {
      throw new RangeError('A campaign must provide a level generator.');
    }
  }

  private validateInitialLevelNumber(initialLevelNumber: number): void {
    if (!Number.isSafeInteger(initialLevelNumber) || initialLevelNumber <= 0) {
      throw new RangeError('Initial level number must be a positive safe integer.');
    }
    if (
      this.campaign.maxLevel !== null
      && initialLevelNumber > this.campaign.maxLevel
    ) {
      throw new RangeError('Initial level number cannot exceed the campaign maximum.');
    }
  }

  private levelAfter(levelNumber: number): number | null {
    if (levelNumber >= Number.MAX_SAFE_INTEGER) {
      return null;
    }

    const nextLevelNumber = levelNumber + 1;
    return this.campaign.maxLevel !== null
      && nextLevelNumber > this.campaign.maxLevel
      ? null
      : nextLevelNumber;
  }

  private validateLevel(level: LevelDefinition, expectedLevelNumber: number): void {
    if (level.id.trim().length === 0) {
      throw new RangeError(`Level ${expectedLevelNumber} must have a non-empty id.`);
    }
    if (level.groups.length === 0) {
      throw new RangeError(`Level ${expectedLevelNumber} must contain an enemy group.`);
    }

    for (const group of level.groups) {
      this.validateEnemyGroup(group, expectedLevelNumber);
    }
    this.validateSpawnPoints(level.spawnPoints, `level ${expectedLevelNumber}`);
  }

  private validateEnemyGroup(group: EnemyGroup, levelNumber: number): void {
    if (!VALID_ENEMY_TYPES.has(group.enemyType)) {
      throw new RangeError(`Level ${levelNumber} contains an unknown enemy type.`);
    }
    if (!Number.isSafeInteger(group.count) || group.count <= 0) {
      throw new RangeError('Enemy group count must be a positive safe integer.');
    }
  }

  private validateSpawnPoints(
    spawnPoints: readonly GridPoint[],
    owner: string,
  ): void {
    if (spawnPoints.length === 0) {
      throw new RangeError(`The ${owner} must have at least one spawn point.`);
    }

    const uniquePoints = new Set<string>();
    for (const spawnPoint of spawnPoints) {
      if (!this.isPointOnArenaEdge(spawnPoint)) {
        throw new RangeError(`Every ${owner} spawn point must be on the arena edge.`);
      }
      const key = `${spawnPoint.x}:${spawnPoint.y}`;
      if (uniquePoints.has(key)) {
        throw new RangeError(`Duplicate ${owner} spawn point: ${key}.`);
      }
      uniquePoints.add(key);
    }
  }

  private isPointInsideArena(point: GridPoint): boolean {
    return Number.isSafeInteger(point.x)
      && Number.isSafeInteger(point.y)
      && point.x >= 0
      && point.x < this.campaign.width
      && point.y >= 0
      && point.y < this.campaign.height;
  }

  private isPointOnArenaEdge(point: GridPoint): boolean {
    return this.isPointInsideArena(point)
      && (point.x === 0
        || point.x === this.campaign.width - 1
        || point.y === 0
        || point.y === this.campaign.height - 1);
  }
}

function saturatingAdd(left: number, right: number): number {
  if (left >= Number.MAX_SAFE_INTEGER - right) {
    return Number.MAX_SAFE_INTEGER;
  }
  return left + right;
}
