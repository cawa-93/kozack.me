import { CORE_MAX_HP } from '../domain/structures/Core';
import {
  type DamageTowerType,
  type Tower,
  type TowerType,
  towerIdAt,
} from '../domain/structures/Tower';
import {
  type Mine,
  type MineType,
  mineIdAt,
} from '../domain/structures/Mine';
import {
  getMineDefinition,
} from '../data/mines';
import {
  WALL_COST,
  WALL_MAX_HP,
  wallIdAt,
} from '../domain/structures/Wall';
import type { Enemy, EnemyState } from '../domain/enemies/Enemy';
import {
  type EnemyDefinition,
  type EnemyType,
} from '../domain/enemies/EnemyDefinition';
import type { GridPoint } from '../domain/grid/GridPoint';
import { GridModel } from '../domain/grid/GridModel';
import { DEBRIS_MOVEMENT_TIME_MULTIPLIER } from '../domain/grid/GridTerrain';
import {
  createEnemyLevelData,
  type EnemyLevelData,
} from '../data/enemies';
import {
  PROTOTYPE_CAMPAIGN,
  type CampaignDefinition,
  type LevelDefinition,
} from '../data/levels';
import {
  getTowerDefinition,
  TOWER_WALL_HP_BONUS,
} from '../data/towers';
import { FlowDirection, type FlowField } from '../navigation/FlowField';
import type { FlowFieldSet } from '../navigation/FlowFieldSet';
import { GraphlibFlowFieldService } from '../navigation/GraphlibFlowFieldService';
import type { NavigationCostSnapshot } from '../navigation/NavigationCostSnapshot';
import {
  createTowerExposure,
  type TowerExposureSource,
} from '../navigation/TowerExposure';
import { NavigationCoordinator } from './NavigationCoordinator';
import type { SimulationEvent } from './SimulationEvent';
import {
  towerDamageForCellVictim,
  type TowerDamageZone,
} from './TowerCombat';
import { WallAttackersIndex } from './WallAttackersIndex';
import { LevelSystem, type LevelSystemEvent } from './LevelSystem';
import {
  calculateLevelRewardCoins,
  smoothLevelRewardCoins,
} from './LevelReward';
import type { BonusOffer, BonusType } from '../domain/bonuses';
import { BonusSystem } from './BonusSystem';
import {
  catTreatsMultiplier,
  enemyDamageMultiplier,
  enemySpeedMultiplier,
  reducedEnemyCount,
  socialDebtRewardBounds,
  twitterFightEnemyCount,
} from './BonusMath';
import { selectCharmBubbleEnemyIds } from './KittenCharm';

export type GameStatus = 'build' | 'running' | 'bonus' | 'victory' | 'defeat';

type TemporaryLevelBonusType = Extract<
  BonusType,
  'hide-under-blanket' | 'twitter-fight'
>;

type TemporaryLevelBonusModifier =
  | {
      readonly phase: 'pending';
      readonly type: TemporaryLevelBonusType;
      readonly levelNumber: number;
    }
  | {
      readonly phase: 'active';
      readonly type: TemporaryLevelBonusType;
      readonly levelNumber: number;
    };

export interface RuntimeEnemy extends Enemy {
  targetCell: GridPoint | null;
  transitionProgress: number;
  targetWall: GridPoint | null;
  attackElapsedMs: number;
  stunRemainingMs: number;
  readonly visualOffsetX: number;
  readonly visualOffsetY: number;
}

export interface BuildResult {
  readonly built: boolean;
  readonly reason:
    | 'built'
    | 'not-build-phase'
    | 'insufficient-funds'
    | 'blocked-cell'
    | 'would-block-route';
}

export interface TowerBuildResult {
  readonly built: boolean;
  readonly reason:
    | 'built'
    | 'not-build-phase'
    | 'locked'
    | 'insufficient-funds'
    | 'no-wall'
    | 'occupied'
    | 'would-block-route';
}

export interface SellWallResult {
  readonly sold: boolean;
  readonly reason: 'sold' | 'not-build-phase' | 'no-wall';
}

export interface MineBuildResult {
  readonly built: boolean;
  readonly reason:
    | 'built'
    | 'not-build-phase'
    | 'locked'
    | 'insufficient-funds'
    | 'outside-grid'
    | 'wall'
    | 'occupied';
}

export interface SellDefenseResult {
  readonly sold: boolean;
  readonly reason: 'sold' | 'not-build-phase' | 'no-defense';
}

export interface SellDefensesResult {
  readonly soldCount: number;
  readonly reason: 'sold' | 'not-build-phase' | 'no-defense';
}

export interface GameSimulationOptions {
  readonly initialLevelNumber?: number;
  readonly initialCoinBonus?: number;
}

const EMPTY_BUILD_RESULT: BuildResult = Object.freeze({
  built: false,
  reason: 'blocked-cell',
});

export const INITIAL_PLAYER_COINS = 20;
export const SOCIAL_HOBBY_BATTERY_BONUS = 50;
export const PET_CATS_BATTERY_RESTORE = 100;
export const THICK_LITERATURE_WALL_HP_BONUS = 50;

const MAX_PLAYER_COINS = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_ENEMY_CELLS_PER_SECOND = 0.25;

export class GameSimulation {
  readonly grid: GridModel;
  readonly levelSystem: LevelSystem;
  readonly bonusSystem: BonusSystem;
  readonly flowFieldService = new GraphlibFlowFieldService();
  readonly navigation: NavigationCoordinator;

  readonly #campaign: CampaignDefinition;
  readonly #enemies = new Map<string, RuntimeEnemy>();
  readonly #towers = new Map<string, Tower>();
  readonly #mines = new Map<string, Mine>();
  readonly #attackers = new WallAttackersIndex();
  readonly #events: SimulationEvent[] = [];
  #nextEnemyOrdinal = 1;
  #coreHp = CORE_MAX_HP;
  #coreMaxHp = CORE_MAX_HP;
  #coins: bigint;
  #activeLevelRewardCoins: number | null = null;
  #activeLevelNormalRewardCoins: number | null = null;
  #lastCompletedNormalRewardCoins: number | null = null;
  #temporaryLevelBonus: TemporaryLevelBonusModifier | null = null;
  #completedLevelCount = 0;
  #status: GameStatus = 'build';
  #enemyLevelData: EnemyLevelData;
  #kittenActivationOrdinal = 0;
  readonly #minesTriggeredThisTick = new Set<string>();

  constructor(
    campaign: CampaignDefinition = PROTOTYPE_CAMPAIGN,
    bonusSeed = randomBonusSeed(),
    options: GameSimulationOptions = {},
  ) {
    this.#campaign = campaign;
    const initialCoins = (
      wholeCoinAmount(INITIAL_PLAYER_COINS)
      + wholeCoinAmount(options.initialCoinBonus ?? 0)
    );
    this.#coins = initialCoins >= MAX_PLAYER_COINS
      ? MAX_PLAYER_COINS
      : initialCoins;
    this.bonusSystem = new BonusSystem(bonusSeed);
    this.grid = new GridModel(
      campaign.width,
      campaign.height,
      campaign.core,
      campaign.spawnPoints,
    );
    this.levelSystem = new LevelSystem({
      ...campaign,
      getLevel: (levelNumber) => this.createEffectiveLevelDefinition(
        campaign.getLevel(levelNumber),
        levelNumber,
      ),
    }, options);
    const initialLevelNumber = this.levelSystem.nextLevelNumber;
    if (initialLevelNumber === null) {
      throw new RangeError('A fresh simulation must have an initial level.');
    }
    this.#enemyLevelData = this.createEffectiveEnemyLevelData(
      initialLevelNumber,
    );
    this.navigation = new NavigationCoordinator(
      this.flowFieldService,
      this.#enemyLevelData.navigationProfiles,
    );
    this.installNextLevelPreparation();
  }

  get status(): GameStatus {
    return this.#status;
  }

  get coreHp(): number {
    return this.#coreHp;
  }

  get coreMaxHp(): number {
    return this.#coreMaxHp;
  }

  get pendingBonusOffer(): BonusOffer | null {
    return this.bonusSystem.pendingOffer;
  }

  get bonusStacks(): Readonly<Record<BonusType, number>> {
    return this.bonusSystem.stacks;
  }

  get isBlanketProtectionActive(): boolean {
    return this.#temporaryLevelBonus?.type === 'hide-under-blanket';
  }

  get coins(): number {
    if (this.#coins === MAX_PLAYER_COINS) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(this.#coins);
  }

  get activeEnemies(): ReadonlyMap<string, RuntimeEnemy> {
    return this.#enemies;
  }

  get towers(): ReadonlyMap<string, Tower> {
    return this.#towers;
  }

  get mines(): ReadonlyMap<string, Mine> {
    return this.#mines;
  }

  get fields(): FlowFieldSet {
    return this.navigation.fields;
  }

  get canBuild(): boolean {
    return this.#status === 'build';
  }

  get canStartLevel(): boolean {
    return this.#status === 'build' && this.levelSystem.canStartNextLevel;
  }

  get currentLevelNumber(): number | null {
    return this.levelSystem.currentLevelNumber;
  }

  get nextLevelNumber(): number | null {
    return this.levelSystem.nextLevelNumber;
  }

  get levelEnemyTotal(): number {
    return this.#status === 'bonus' ? 0 : this.levelSystem.levelEnemyTotal;
  }

  get completedLevelCount(): number {
    return this.#completedLevelCount;
  }

  get totalLevelCount(): number | null {
    return this.#campaign.maxLevel;
  }

  get buildLevelNumber(): number {
    return this.nextLevelNumber ?? this.currentLevelNumber ?? 1;
  }

  towerUnlockLevel(type: TowerType): number {
    return getTowerDefinition(type).unlockLevel;
  }

  isTowerUnlocked(type: TowerType): boolean {
    return this.buildLevelNumber >= this.towerUnlockLevel(type);
  }

  mineUnlockLevel(type: MineType): number {
    return getMineDefinition(type).unlockLevel;
  }

  isMineUnlocked(type: MineType): boolean {
    return this.buildLevelNumber >= this.mineUnlockLevel(type);
  }

  buildWall(point: GridPoint): BuildResult {
    return this.buildWalls([point])[0] ?? EMPTY_BUILD_RESULT;
  }

  buildWalls(points: readonly GridPoint[]): readonly BuildResult[] {
    if (points.length === 0) {
      return Object.freeze([]);
    }
    if (!this.canBuild) {
      return Object.freeze(
        points.map(() =>
          Object.freeze({ built: false, reason: 'not-build-phase' } as const),
        ),
      );
    }

    const accepted: GridPoint[] = [];
    const acceptedKeys = new Set<string>();
    const results: BuildResult[] = [];
    let affordableWallCount = Math.floor(this.coins / WALL_COST);
    for (const point of points) {
      const key = `${point.x}:${point.y}`;
      if (
        !this.grid.isBuildable(point)
        || this.#mines.has(mineIdAt(point))
        || acceptedKeys.has(key)
      ) {
        results.push(EMPTY_BUILD_RESULT);
        continue;
      }
      if (affordableWallCount === 0) {
        results.push(
          Object.freeze({ built: false, reason: 'insufficient-funds' }),
        );
        continue;
      }
      acceptedKeys.add(key);
      accepted.push({ x: point.x, y: point.y });
      affordableWallCount -= 1;
      results.push(Object.freeze({ built: true, reason: 'built' }));
    }

    if (accepted.length === 0) {
      return Object.freeze(results);
    }

    const candidateSnapshot = this.snapshotWithCandidateWalls(accepted);
    const candidateFields = this.navigation.prepare(candidateSnapshot);
    if (
      this.navigation.findUnreachableSpawns(candidateSnapshot, candidateFields)
        .length > 0
    ) {
      return Object.freeze(
        results.map((result) =>
          result.built
            ? Object.freeze({ built: false, reason: 'would-block-route' } as const)
            : result,
        ),
      );
    }

    const wallMaxHp = this.wallMaxHpForBuild();
    for (const point of accepted) {
      if (!this.grid.placeWall(point, wallMaxHp)) {
        throw new Error(`Accepted wall could not be placed at (${point.x}, ${point.y}).`);
      }
    }
    this.spendCoins(accepted.length * WALL_COST);

    this.navigation.publish(candidateFields);
    this.#events.push({
      type: 'navigation-rebuilt',
      gridRevision: this.grid.revision,
    });
    return Object.freeze(results);
  }

  canBuildTower(point: GridPoint, type: TowerType): boolean {
    const definition = getTowerDefinition(type);
    return (
      this.canBuild &&
      this.buildLevelNumber >= definition.unlockLevel &&
      this.canAffordCoins(definition.cost) &&
      this.grid.hasWall(point) &&
      !this.#towers.has(towerIdAt(point))
    );
  }

  buildTower(point: GridPoint, type: TowerType): TowerBuildResult {
    if (!this.canBuild) {
      return Object.freeze({ built: false, reason: 'not-build-phase' });
    }
    if (!this.isTowerUnlocked(type)) {
      return Object.freeze({ built: false, reason: 'locked' });
    }
    if (!this.grid.hasWall(point)) {
      return Object.freeze({ built: false, reason: 'no-wall' });
    }

    const id = towerIdAt(point);
    if (this.#towers.has(id)) {
      return Object.freeze({ built: false, reason: 'occupied' });
    }

    const definition = getTowerDefinition(type);
    if (!this.canAffordCoins(definition.cost)) {
      return Object.freeze({ built: false, reason: 'insufficient-funds' });
    }

    const candidateSnapshot = this.snapshotWithTowerBonus(point, type);
    const candidateFields = this.navigation.prepare(candidateSnapshot);
    if (
      this.navigation.findUnreachableSpawns(candidateSnapshot, candidateFields)
        .length > 0
    ) {
      return Object.freeze({ built: false, reason: 'would-block-route' });
    }

    if (!this.grid.addWallHpBonus(point, TOWER_WALL_HP_BONUS)) {
      return Object.freeze({ built: false, reason: 'no-wall' });
    }

    this.#towers.set(id, {
      id,
      type,
      position: { x: point.x, y: point.y },
      cooldownRemainingMs: 0,
    });
    this.spendCoins(definition.cost);
    this.navigation.publish(candidateFields);
    this.#events.push({
      type: 'navigation-rebuilt',
      gridRevision: this.grid.revision,
    });
    return Object.freeze({ built: true, reason: 'built' });
  }

  canBuildMine(point: GridPoint, type: MineType): boolean {
    const definition = getMineDefinition(type);
    return (
      this.canBuild
      && this.isMineUnlocked(type)
      && this.canAffordCoins(definition.cost)
      && this.grid.isInside(point)
      && !this.grid.hasWall(point)
      && !this.#mines.has(mineIdAt(point))
    );
  }

  buildMine(point: GridPoint, type: MineType): MineBuildResult {
    if (!this.canBuild) {
      return Object.freeze({ built: false, reason: 'not-build-phase' });
    }
    if (!this.isMineUnlocked(type)) {
      return Object.freeze({ built: false, reason: 'locked' });
    }
    if (!this.grid.isInside(point)) {
      return Object.freeze({ built: false, reason: 'outside-grid' });
    }
    if (this.grid.hasWall(point)) {
      return Object.freeze({ built: false, reason: 'wall' });
    }
    const id = mineIdAt(point);
    if (this.#mines.has(id)) {
      return Object.freeze({ built: false, reason: 'occupied' });
    }
    const definition = getMineDefinition(type);
    if (!this.canAffordCoins(definition.cost)) {
      return Object.freeze({ built: false, reason: 'insufficient-funds' });
    }

    this.#mines.set(id, {
      id,
      type,
      position: { ...point },
      state: 'armed',
      triggerRemainingMs: 0,
    });
    this.spendCoins(definition.cost);
    return Object.freeze({ built: true, reason: 'built' });
  }

  canSellWall(point: GridPoint): boolean {
    return this.canBuild && this.grid.hasWall(point);
  }

  canSellDefense(point: GridPoint): boolean {
    return this.canBuild && (
      this.grid.hasWall(point) || this.#mines.has(mineIdAt(point))
    );
  }

  sellDefense(point: GridPoint): SellDefenseResult {
    const result = this.sellDefenses([point]);
    return Object.freeze({
      sold: result.soldCount > 0,
      reason: result.reason,
    });
  }

  sellDefenses(points: readonly GridPoint[]): SellDefensesResult {
    if (!this.canBuild) {
      return Object.freeze({ soldCount: 0, reason: 'not-build-phase' });
    }

    const visited = new Set<string>();
    const removedWallIds: string[] = [];
    let refund = 0;
    let soldCount = 0;

    for (const point of points) {
      const cellKey = `${point.x}:${point.y}`;
      if (visited.has(cellKey)) {
        continue;
      }
      visited.add(cellKey);

      if (this.grid.hasWall(point)) {
        const wallId = wallIdAt(point);
        const tower = this.#towers.get(towerIdAt(point));
        refund += WALL_COST + (
          tower === undefined ? 0 : getTowerDefinition(tower.type).cost
        );
        this.destroyTowerAt(point);
        if (!this.grid.removeWall(point)) {
          throw new Error(
            `Existing wall could not be sold at (${point.x}, ${point.y}).`,
          );
        }
        this.#events.push({
          type: 'wall-sold',
          wallId,
          position: { ...point },
        });
        removedWallIds.push(wallId);
        soldCount += 1;
        continue;
      }

      const mine = this.#mines.get(mineIdAt(point));
      if (mine === undefined) {
        continue;
      }
      this.#mines.delete(mine.id);
      refund += getMineDefinition(mine.type).cost;
      this.#events.push({
        type: 'mine-sold',
        mineId: mine.id,
        mineType: mine.type,
        position: { ...mine.position },
      });
      soldCount += 1;
    }

    if (soldCount === 0) {
      return Object.freeze({ soldCount: 0, reason: 'no-defense' });
    }

    this.creditCoins(refund);
    if (removedWallIds.length > 0) {
      this.rebuildNavigation();
      for (const wallId of removedWallIds) {
        for (const attackerId of this.#attackers.releaseWall(wallId)) {
          const attacker = this.#enemies.get(attackerId);
          if (attacker !== undefined) {
            this.resumeEnemy(attacker);
          }
        }
      }
    }
    return Object.freeze({ soldCount, reason: 'sold' });
  }

  sellWall(point: GridPoint): SellWallResult {
    if (!this.canBuild) {
      return Object.freeze({ sold: false, reason: 'not-build-phase' });
    }
    if (!this.grid.hasWall(point)) {
      return Object.freeze({ sold: false, reason: 'no-wall' });
    }

    const result = this.sellDefenses([point]);
    if (result.soldCount !== 1) {
      throw new Error(
        `Existing wall was not sold at (${point.x}, ${point.y}).`,
      );
    }
    return Object.freeze({ sold: true, reason: 'sold' });
  }

  startLevel(): boolean {
    if (!this.canStartLevel) {
      return false;
    }

    const nextLevel = this.levelSystem.nextLevelDefinition;
    if (nextLevel === null) {
      return false;
    }
    const nextLevelNumber = this.levelSystem.nextLevelNumber;
    if (nextLevelNumber === null) {
      return false;
    }
    this.configureEnemyLevel(nextLevelNumber);
    this.grid.setSpawnPoints(nextLevel.spawnPoints);

    const snapshot = this.navigationCostSnapshot();
    const fields = this.navigation.prepare(snapshot);
    if (this.navigation.findUnreachableSpawns(snapshot, fields).length > 0) {
      return false;
    }

    const socialDebtStacks = this.bonusSystem.stackCount('social-debt');
    const rewardBounds = socialDebtRewardBounds(socialDebtStacks);
    const calculatedRewardCoins = calculateLevelRewardCoins(
      nextLevel.groups,
      {
        multiplierNumerator: 10 + socialDebtStacks,
        multiplierDenominator: 10,
        minCoins: rewardBounds.minimum,
        maxCoins: rewardBounds.maximum,
      },
    );
    const normalRewardCoins = smoothLevelRewardCoins(
      nextLevelNumber,
      calculatedRewardCoins,
      this.#lastCompletedNormalRewardCoins,
      {
        minCoins: rewardBounds.minimum,
        maxCoins: rewardBounds.maximum,
      },
    );
    const temporaryBonusType = this.pendingTemporaryBonusForLevel(
      nextLevelNumber,
    );
    this.#activeLevelNormalRewardCoins = normalRewardCoins;
    this.#activeLevelRewardCoins = temporaryBonusType === 'hide-under-blanket'
      ? 0
      : temporaryBonusType === 'twitter-fight'
        ? doubleWholeCoinReward(normalRewardCoins)
        : normalRewardCoins;
    this.activatePendingTemporaryBonus(nextLevelNumber);
    this.navigation.publish(fields);
    this.#events.push({
      type: 'navigation-rebuilt',
      gridRevision: snapshot.revision,
    });
    this.#status = 'running';
    this.handleLevelEvents(this.levelSystem.startNextLevel());
    return true;
  }

  chooseBonus(offerId: string, selection: BonusType | null): boolean {
    if (this.#status !== 'bonus') {
      return false;
    }

    const result = this.bonusSystem.resolve(offerId, selection);
    if (!result.resolved) {
      return false;
    }

    if (selection === null) {
      this.#events.push({ type: 'bonus-skipped' });
    } else {
      const navigationChanged = this.applyBonus(selection);
      this.#events.push({
        type: 'bonus-selected',
        bonusType: selection,
        stackCount: result.newStacks ?? 0,
      });

      this.levelSystem.invalidateNextLevelPreparation();
      this.installNextLevelPreparation();
      this.#status = 'build';
      if (navigationChanged) {
        this.rebuildNavigation();
      }
      return true;
    }

    this.levelSystem.invalidateNextLevelPreparation();
    this.installNextLevelPreparation();
    this.#status = 'build';
    return true;
  }

  update(deltaMs: number): void {
    if (this.#status !== 'running') {
      return;
    }
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('Simulation delta must be a finite non-negative number.');
    }

    this.#minesTriggeredThisTick.clear();
    this.handleLevelEvents(this.levelSystem.update(deltaMs));
    this.updateMines(deltaMs);
    this.updateTowers(deltaMs);

    for (const enemy of [...this.#enemies.values()]) {
      if (this.#status !== 'running' || !this.#enemies.has(enemy.id)) {
        continue;
      }
      this.updateEnemy(enemy, deltaMs);
    }
  }

  drainEvents(): readonly SimulationEvent[] {
    const drained = this.#events.splice(0, this.#events.length);
    return drained;
  }

  private updateEnemy(enemy: RuntimeEnemy, deltaMs: number): void {
    let actionableDeltaMs = deltaMs;
    if (enemy.stunRemainingMs > 0) {
      const frozenMs = Math.min(actionableDeltaMs, enemy.stunRemainingMs);
      enemy.stunRemainingMs -= frozenMs;
      actionableDeltaMs -= frozenMs;
      if (actionableDeltaMs <= 0) {
        return;
      }
    }

    if (enemy.state === 'attacking-wall') {
      this.updateWallAttack(enemy, actionableDeltaMs);
      return;
    }
    if (enemy.state !== 'moving' && enemy.state !== 'spawning') {
      return;
    }

    enemy.state = 'moving';
    const definition = this.#enemyLevelData.definitions[enemy.type];
    const baseMovementDurationMs = 1000 / enemy.cellsPerSecond;
    let remainingMs = actionableDeltaMs;
    let boundaryGuard = 0;

    while (remainingMs > 0 && enemy.state === 'moving') {
      boundaryGuard += 1;
      if (boundaryGuard > 64) {
        enemy.state = 'stuck';
        return;
      }

      if (enemy.targetCell === null) {
        this.chooseNextCell(enemy, definition);
        if (enemy.targetCell === null) {
          return;
        }
      }

      const movementDurationMs = baseMovementDurationMs * (
        this.grid.hasDebris(enemy.targetCell)
          ? DEBRIS_MOVEMENT_TIME_MULTIPLIER
          : 1
      );
      const timeToBoundary =
        (1 - enemy.transitionProgress) * movementDurationMs;
      const consumedMs = Math.min(remainingMs, timeToBoundary);
      enemy.transitionProgress += consumedMs / movementDurationMs;
      remainingMs -= consumedMs;

      if (enemy.transitionProgress < 1 - Number.EPSILON) {
        continue;
      }

      enemy.cellX = enemy.targetCell.x;
      enemy.cellY = enemy.targetCell.y;
      enemy.targetCell = null;
      enemy.transitionProgress = 0;

      this.triggerMineAt(enemy.cellX, enemy.cellY);

      if (
        enemy.cellX === this.grid.core.x &&
        enemy.cellY === this.grid.core.y
      ) {
        this.resolveCoreArrival(enemy);
        return;
      }
    }
  }

  private chooseNextCell(
    enemy: RuntimeEnemy,
    definition: EnemyDefinition,
  ): void {
    const field = this.navigation.fields.get(enemy.profileId);
    if (field === undefined) {
      enemy.state = 'stuck';
      return;
    }

    const index = enemy.cellY * this.grid.width + enemy.cellX;
    const direction = field.nextDirection[index] ?? FlowDirection.None;
    const nextCell = this.resolveDirection(enemy.cellX, enemy.cellY, direction);
    if (nextCell === null || !this.grid.isInside(nextCell)) {
      enemy.state = 'stuck';
      return;
    }

    if (this.grid.hasWall(nextCell)) {
      if (definition.navigationProfile.instantWallBreak === true) {
        const wall = this.grid.getWall(nextCell);
        if (wall === null) {
          return;
        }
        this.applyWallHit(enemy, nextCell, wall.hp);
        return;
      }

      if (definition.navigationProfile.damagePerHit <= 0) {
        enemy.state = 'stuck';
        return;
      }

      enemy.state = 'attacking-wall';
      enemy.targetWall = nextCell;
      enemy.attackElapsedMs = 0;
      this.#attackers.add(wallIdAt(nextCell), enemy.id);
      return;
    }

    enemy.targetCell = nextCell;
    enemy.transitionProgress = 0;
  }

  private updateWallAttack(enemy: RuntimeEnemy, deltaMs: number): void {
    const target = enemy.targetWall;
    if (target === null || !this.grid.hasWall(target)) {
      this.resumeEnemy(enemy);
      return;
    }

    const definition = this.#enemyLevelData.definitions[enemy.type];
    const profile = definition.navigationProfile;
    if (profile.damagePerHit <= 0) {
      enemy.state = 'stuck';
      return;
    }

    enemy.attackElapsedMs += deltaMs;
    while (enemy.attackElapsedMs >= profile.attackIntervalMs) {
      enemy.attackElapsedMs -= profile.attackIntervalMs;
      if (!this.applyWallHit(enemy, target, profile.damagePerHit)) {
        continue;
      }
      return;
    }
  }

  private resolveCoreArrival(enemy: RuntimeEnemy): void {
    const definition = this.#enemyLevelData.definitions[enemy.type];
    if (definition.coreHealing > 0) {
      const previousHp = this.#coreHp;
      this.#coreHp = Math.min(
        this.#coreMaxHp,
        this.#coreHp + definition.coreHealing,
      );
      enemy.state = 'reached-core';
      this.#events.push({
        type: 'enemy-healed-core',
        enemyId: enemy.id,
        healing: this.#coreHp - previousHp,
      });
      this.removeResolvedEnemy(enemy);
      return;
    }

    const coreDamage = this.activeTemporaryBonusIs('hide-under-blanket')
      ? 0
      : definition.coreDamage;
    enemy.state = 'reached-core';
    this.#coreHp = Math.max(0, this.#coreHp - coreDamage);
    this.#events.push({
      type: 'enemy-reached-core',
      enemyId: enemy.id,
      damage: coreDamage,
    });

    if (
      coreDamage > 0
      && this.#coreHp === 0
      && this.#status === 'running'
    ) {
      this.#status = 'defeat';
      this.#events.push({ type: 'level-defeat' });
    }
    this.removeResolvedEnemy(enemy);
  }

  private removeResolvedEnemy(enemy: RuntimeEnemy): void {
    this.#attackers.removeEnemy(enemy.id);
    this.#enemies.delete(enemy.id);
    this.handleLevelEvents(this.levelSystem.notifyEnemyResolved());
  }

  private updateTowers(deltaMs: number): void {
    const combatMultiplier = this.towerCombatMultiplier();
    for (const tower of this.#towers.values()) {
      tower.cooldownRemainingMs -= deltaMs;

      let shotGuard = 0;
      while (tower.cooldownRemainingMs <= 0) {
        shotGuard += 1;
        if (shotGuard > 64) {
          throw new Error(`Tower attack loop exceeded guard for ${tower.id}.`);
        }

        const definition = getTowerDefinition(tower.type);
        if (definition.behavior === 'charm') {
          const affected = this.enemiesInTowerRange(tower);
          if (affected.length === 0) {
            tower.cooldownRemainingMs = 0;
            break;
          }
          this.charmEnemies(tower, affected);
          tower.cooldownRemainingMs += definition.attackIntervalMs;
        } else {
          const target = this.selectTowerTarget(tower);
          if (target === null) {
            tower.cooldownRemainingMs = 0;
            break;
          }
          this.fireTower(tower, target);
          tower.cooldownRemainingMs += (
            definition.attackIntervalMs / combatMultiplier
          );
        }
      }
    }
  }

  private enemiesInTowerRange(tower: Tower): RuntimeEnemy[] {
    const definition = getTowerDefinition(tower.type);
    const rangeSquared = definition.rangeCells * definition.rangeCells;
    return [...this.#enemies.values()].filter((enemy) => {
      const deltaX = enemy.cellX - tower.position.x;
      const deltaY = enemy.cellY - tower.position.y;
      return deltaX * deltaX + deltaY * deltaY <= rangeSquared;
    });
  }

  private charmEnemies(tower: Tower, affected: readonly RuntimeEnemy[]): void {
    const definition = getTowerDefinition(tower.type);
    for (const enemy of affected) {
      enemy.stunRemainingMs = Math.max(
        enemy.stunRemainingMs,
        definition.charmDurationMs,
      );
    }
    const affectedEnemyIds = Object.freeze(affected.map((enemy) => enemy.id));
    const bubbleEnemyIds = selectCharmBubbleEnemyIds(
      affectedEnemyIds,
      this.#kittenActivationOrdinal,
    );
    this.#kittenActivationOrdinal += 1;
    this.#events.push({
      type: 'kitten-meowed',
      towerId: tower.id,
      from: { ...tower.position },
      radiusCells: definition.rangeCells,
      durationMs: definition.charmDurationMs,
      affectedEnemyIds,
      bubbleEnemyIds,
    });
  }

  private selectTowerTarget(tower: Tower): RuntimeEnemy | null {
    const definition = getTowerDefinition(tower.type);
    const rangeSquared = definition.rangeCells * definition.rangeCells;

    if (tower.type === 'heavy') {
      return this.selectDensestCellTarget(tower, rangeSquared);
    }

    let selected: RuntimeEnemy | null = null;
    let selectedCoreDistance = Number.POSITIVE_INFINITY;
    let selectedTowerDistance = Number.POSITIVE_INFINITY;

    for (const enemy of this.#enemies.values()) {
      const deltaX = enemy.cellX - tower.position.x;
      const deltaY = enemy.cellY - tower.position.y;
      const towerDistance = deltaX * deltaX + deltaY * deltaY;
      if (towerDistance > rangeSquared) {
        continue;
      }

      const coreDistance =
        Math.abs(enemy.cellX - this.grid.core.x) +
        Math.abs(enemy.cellY - this.grid.core.y);
      if (
        coreDistance < selectedCoreDistance ||
        (coreDistance === selectedCoreDistance &&
          towerDistance < selectedTowerDistance)
      ) {
        selected = enemy;
        selectedCoreDistance = coreDistance;
        selectedTowerDistance = towerDistance;
      }
    }

    return selected;
  }

  private selectDensestCellTarget(
    tower: Tower,
    rangeSquared: number,
  ): RuntimeEnemy | null {
    interface CellCandidate {
      readonly representative: RuntimeEnemy;
      readonly count: number;
      readonly coreDistance: number;
      readonly towerDistance: number;
      readonly cellIndex: number;
    }

    const candidates = new Map<number, CellCandidate>();
    for (const enemy of this.#enemies.values()) {
      const deltaX = enemy.cellX - tower.position.x;
      const deltaY = enemy.cellY - tower.position.y;
      const towerDistance = deltaX * deltaX + deltaY * deltaY;
      if (towerDistance > rangeSquared) {
        continue;
      }

      const cellIndex = enemy.cellY * this.grid.width + enemy.cellX;
      const existing = candidates.get(cellIndex);
      if (existing !== undefined) {
        candidates.set(cellIndex, { ...existing, count: existing.count + 1 });
        continue;
      }

      candidates.set(cellIndex, {
        representative: enemy,
        count: 1,
        coreDistance:
          Math.abs(enemy.cellX - this.grid.core.x) +
          Math.abs(enemy.cellY - this.grid.core.y),
        towerDistance,
        cellIndex,
      });
    }

    let selected: CellCandidate | null = null;
    for (const candidate of candidates.values()) {
      if (
        selected === null ||
        candidate.count > selected.count ||
        (candidate.count === selected.count &&
          (candidate.coreDistance < selected.coreDistance ||
            (candidate.coreDistance === selected.coreDistance &&
              (candidate.towerDistance < selected.towerDistance ||
                (candidate.towerDistance === selected.towerDistance &&
                  candidate.cellIndex < selected.cellIndex)))))
      ) {
        selected = candidate;
      }
    }

    return selected?.representative ?? null;
  }

  private fireTower(tower: Tower, target: RuntimeEnemy): void {
    const definition = getTowerDefinition(tower.type);
    if (definition.behavior !== 'damage') {
      return;
    }
    const combatMultiplier = this.towerCombatMultiplier();
    this.#events.push({
      type: 'tower-shot',
      towerId: tower.id,
      towerType: tower.type as DamageTowerType,
      targetEnemyId: target.id,
      from: tower.position,
      to: { x: target.cellX, y: target.cellY },
      damage: definition.damagePerShot * combatMultiplier,
      splashDamage: definition.splashDamage * combatMultiplier,
      adjacentSplashDamage:
        definition.adjacentSplashDamage * combatMultiplier,
    });

    const targetCell = { x: target.cellX, y: target.cellY };
    const victims =
      definition.splashDamage > 0 || definition.adjacentSplashDamage > 0
        ? [...this.#enemies.values()].filter(
            (enemy) => {
              const cellDistance =
                Math.abs(enemy.cellX - targetCell.x) +
                Math.abs(enemy.cellY - targetCell.y);
              return cellDistance <= 1;
            },
          )
        : [target];

    for (const victim of victims) {
      if (!this.#enemies.has(victim.id)) {
        continue;
      }
      const damageZone: TowerDamageZone = victim.id === target.id
        ? 'primary'
        : victim.cellX === targetCell.x && victim.cellY === targetCell.y
          ? 'target-cell'
          : 'adjacent-cell';
      const damage = (
        towerDamageForCellVictim(definition, damageZone) * combatMultiplier
      );
      if (damage > 0) {
        this.damageEnemy(victim, damage, tower.id, damageZone);
      }
    }
  }

  private damageEnemy(
    enemy: RuntimeEnemy,
    damage: number,
    towerId: string,
    damageZone: TowerDamageZone,
  ): void {
    const appliedDamage = Math.min(enemy.hp, damage);
    enemy.hp -= appliedDamage;
    this.#events.push({
      type: 'enemy-damaged',
      enemyId: enemy.id,
      towerId,
      damage: appliedDamage,
      remainingHp: enemy.hp,
      damageZone,
      position: { x: enemy.cellX, y: enemy.cellY },
    });

    if (enemy.hp > 0) {
      return;
    }

    enemy.state = 'dead';
    this.#events.push({ type: 'enemy-killed', enemyId: enemy.id, towerId });
    this.removeResolvedEnemy(enemy);
  }

  private destroyTowerAt(point: GridPoint): void {
    const id = towerIdAt(point);
    const tower = this.#towers.get(id);
    if (tower === undefined) {
      return;
    }
    this.#towers.delete(id);
    this.#events.push({
      type: 'tower-destroyed',
      towerId: id,
      towerType: tower.type,
      position: tower.position,
    });
  }

  private applyWallHit(
    enemy: RuntimeEnemy,
    target: GridPoint,
    damagePerHit: number,
  ): boolean {
    const wallId = wallIdAt(target);
    this.#events.push({
      type: 'wall-shot',
      enemyId: enemy.id,
      wallId,
      from: { x: enemy.cellX, y: enemy.cellY },
      to: target,
    });

    const damage = this.grid.damageWall(target, damagePerHit);
    if (!damage.destroyed) {
      return false;
    }

    this.destroyTowerAt(target);
    this.#events.push({
      type: 'wall-destroyed',
      wallId,
      position: target,
    });
    this.rebuildNavigation();
    for (const attackerId of this.#attackers.releaseWall(wallId)) {
      const attacker = this.#enemies.get(attackerId);
      if (attacker !== undefined) {
        this.resumeEnemy(attacker);
      }
    }
    return true;
  }

  private triggerMineAt(x: number, y: number): void {
    const mine = this.#mines.get(mineIdAt({ x, y }));
    if (mine === undefined || mine.state !== 'armed') {
      return;
    }
    const definition = getMineDefinition(mine.type);
    mine.state = 'triggered';
    mine.triggerRemainingMs = definition.triggerDelayMs;
    this.#minesTriggeredThisTick.add(mine.id);
    this.#events.push({
      type: 'mine-triggered',
      mineId: mine.id,
      mineType: mine.type,
      position: { ...mine.position },
      triggerDelayMs: definition.triggerDelayMs,
    });
  }

  private updateMines(deltaMs: number): void {
    for (const mine of [...this.#mines.values()]) {
      if (
        mine.state !== 'triggered'
        || this.#minesTriggeredThisTick.has(mine.id)
      ) {
        continue;
      }
      mine.triggerRemainingMs -= deltaMs;
      if (mine.triggerRemainingMs <= 0) {
        this.detonateMine(mine);
      }
    }
  }

  private detonateMine(mine: Mine): void {
    const definition = getMineDefinition(mine.type);
    const victims = [...this.#enemies.values()];
    for (const enemy of victims) {
      enemy.state = 'dead';
      this.#attackers.removeEnemy(enemy.id);
      this.#enemies.delete(enemy.id);
    }

    const cardinalOffsets: readonly GridPoint[] = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const damagedWallPositions: GridPoint[] = [];
    const destroyedWallIds: string[] = [];
    for (const offset of cardinalOffsets) {
      const point = {
        x: mine.position.x + offset.x,
        y: mine.position.y + offset.y,
      };
      if (!this.grid.isInside(point) || !this.grid.hasWall(point)) {
        continue;
      }
      damagedWallPositions.push(point);
      const damage = this.grid.damageWall(
        point,
        definition.adjacentWallDamage,
      );
      if (!damage.destroyed) {
        continue;
      }
      const destroyedWallId = wallIdAt(point);
      destroyedWallIds.push(destroyedWallId);
      this.destroyTowerAt(point);
      this.#events.push({
        type: 'wall-destroyed',
        wallId: destroyedWallId,
        position: point,
      });
    }

    this.#mines.delete(mine.id);
    this.#events.push({
      type: 'mine-detonated',
      mineId: mine.id,
      mineType: mine.type,
      position: { ...mine.position },
      killedEnemyCount: victims.length,
      damagedWallPositions: Object.freeze(damagedWallPositions),
    });

    if (destroyedWallIds.length > 0) {
      this.rebuildNavigation();
      for (const destroyedWallId of destroyedWallIds) {
        for (const attackerId of this.#attackers.releaseWall(destroyedWallId)) {
          const attacker = this.#enemies.get(attackerId);
          if (attacker !== undefined) {
            this.resumeEnemy(attacker);
          }
        }
      }
    }
    if (victims.length > 0) {
      this.handleLevelEvents(
        this.levelSystem.notifyEnemyResolved(victims.length),
      );
    }
  }

  private handleLevelEvents(events: readonly LevelSystemEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'level-started':
          this.grid.setSpawnPoints(event.spawnPoints);
          this.ensureCurrentNavigation();
          this.#events.push({
            type: 'level-started',
            levelNumber: event.levelNumber,
          });
          break;
        case 'enemy-spawn':
          this.spawnEnemy(event.enemyType, event.spawnPoint, event.levelNumber);
          break;
        case 'level-completed': {
          if (this.#status !== 'running') {
            break;
          }
          if (this.#completedLevelCount < Number.MAX_SAFE_INTEGER) {
            this.#completedLevelCount += 1;
          }
          this.#events.push({
            type: 'level-completed',
            levelNumber: event.levelNumber,
          });
          if (this.grid.restoreAllWallsToMaxHp() > 0) {
            this.rebuildNavigation();
          }
          const completedLevelRewardCoins = this.#activeLevelRewardCoins;
          const completedLevelNormalRewardCoins =
            this.#activeLevelNormalRewardCoins;
          this.#activeLevelRewardCoins = null;
          this.#activeLevelNormalRewardCoins = null;
          if (
            completedLevelRewardCoins === null
            || completedLevelNormalRewardCoins === null
          ) {
            throw new Error('A completed level has no prepared coin reward.');
          }
          this.#lastCompletedNormalRewardCoins =
            completedLevelNormalRewardCoins;
          this.clearCompletedTemporaryBonus(event.levelNumber);
          if (!this.levelSystem.isComplete) {
            this.creditCoins(completedLevelRewardCoins);
            this.readyTowersForBuildPhase();
            this.readyMinesForBuildPhase();
            const offer = this.bonusSystem.createOffer({
              completedLevel: event.levelNumber,
              coreHp: this.#coreHp,
              coreMaxHp: this.#coreMaxHp,
            });
            if (offer !== null) {
              this.#status = 'bonus';
              this.#events.push({ type: 'bonus-offered', offer });
            } else {
              this.installNextLevelPreparation();
              this.#status = 'build';
            }
          }
          break;
        }
        case 'campaign-completed':
          if (this.#status === 'running') {
            this.#status = 'victory';
            this.#events.push({ type: 'level-victory' });
          }
          break;
      }
    }
  }

  private readyTowersForBuildPhase(): void {
    for (const tower of this.#towers.values()) {
      tower.cooldownRemainingMs = 0;
    }
  }

  private readyMinesForBuildPhase(): void {
    for (const mine of this.#mines.values()) {
      mine.state = 'armed';
      mine.triggerRemainingMs = 0;
    }
  }

  private creditCoins(amount: number): void {
    const creditedCoins = this.#coins + wholeCoinAmount(amount);
    this.#coins = creditedCoins >= MAX_PLAYER_COINS
      ? MAX_PLAYER_COINS
      : creditedCoins;
  }

  private canAffordCoins(amount: number): boolean {
    return this.#coins >= wholeCoinAmount(amount);
  }

  private spendCoins(amount: number): void {
    const spentCoins = wholeCoinAmount(amount);
    if (spentCoins > this.#coins) {
      throw new RangeError('Cannot spend more coins than the current balance.');
    }
    this.#coins -= spentCoins;
  }

  private installNextLevelPreparation(): void {
    const nextLevel = this.levelSystem.nextLevelDefinition;
    const nextLevelNumber = this.levelSystem.nextLevelNumber;
    if (nextLevel === null || nextLevelNumber === null) {
      return;
    }

    this.grid.setSpawnPoints(nextLevel.spawnPoints);
    this.configureEnemyLevel(nextLevelNumber);
  }

  private configureEnemyLevel(levelNumber: number): void {
    if (this.#enemyLevelData.levelNumber === levelNumber) {
      return;
    }

    this.#enemyLevelData = this.createEffectiveEnemyLevelData(levelNumber);
    this.navigation.configureProfiles(this.#enemyLevelData.navigationProfiles);
  }

  private createEffectiveEnemyLevelData(levelNumber: number): EnemyLevelData {
    return createEnemyLevelData(levelNumber, {
      speedMultiplier: enemySpeedMultiplier(
        this.bonusSystem.stackCount('move'),
      ),
      damageMultiplier: enemyDamageMultiplier(
        this.bonusSystem.stackCount('earplugs'),
      ),
      minimumCellsPerSecond: MIN_ENEMY_CELLS_PER_SECOND,
    });
  }

  private createEffectiveLevelDefinition(
    level: LevelDefinition,
    levelNumber: number,
  ): LevelDefinition {
    const burnBridgesStacks = this.bonusSystem.stackCount('burn-bridges');
    const twitterFightIsPending = this.temporaryBonusForLevel(levelNumber)
      === 'twitter-fight';
    if (burnBridgesStacks === 0 && !twitterFightIsPending) {
      return level;
    }

    return Object.freeze({
      ...level,
      groups: Object.freeze(level.groups.map((group) => {
        let count = group.count;
        if (group.enemyType !== 'roach' && burnBridgesStacks > 0) {
          count = reducedEnemyCount(count, burnBridgesStacks);
        }
        if (twitterFightIsPending) {
          count = twitterFightEnemyCount(count, group.enemyType);
        }
        return Object.freeze({ ...group, count });
      })),
    });
  }

  private applyBonus(type: BonusType): boolean {
    switch (type) {
      case 'vacation':
        this.#coreHp = this.#coreMaxHp;
        return false;
      case 'social-hobby':
        this.#coreMaxHp += SOCIAL_HOBBY_BATTERY_BONUS;
        this.#coreHp = Math.min(
          this.#coreMaxHp,
          this.#coreHp + SOCIAL_HOBBY_BATTERY_BONUS,
        );
        return false;
      case 'move':
      case 'earplugs':
      case 'burn-bridges':
      case 'wider-thinking':
      case 'cat-treats':
      case 'social-debt':
        return false;
      case 'hide-under-blanket':
      case 'twitter-fight':
        this.queueTemporaryBonus(type);
        return false;
      case 'pet-cats':
        this.#coreHp = Math.min(
          this.#coreMaxHp,
          this.#coreHp + PET_CATS_BATTERY_RESTORE,
        );
        return false;
      case 'thick-literature':
        return this.grid.addHpBonusToAllWalls(
          THICK_LITERATURE_WALL_HP_BONUS,
        ) > 0;
    }
  }

  private queueTemporaryBonus(type: TemporaryLevelBonusType): void {
    if (this.#temporaryLevelBonus !== null) {
      throw new Error('A temporary level bonus is already pending or active.');
    }
    const levelNumber = this.levelSystem.nextLevelNumber;
    if (levelNumber === null) {
      throw new Error('Cannot queue a temporary bonus without a next level.');
    }

    this.#temporaryLevelBonus = Object.freeze({
      phase: 'pending',
      type,
      levelNumber,
    });
  }

  private temporaryBonusForLevel(
    levelNumber: number,
  ): TemporaryLevelBonusType | null {
    const modifier = this.#temporaryLevelBonus;
    return modifier?.levelNumber === levelNumber ? modifier.type : null;
  }

  private pendingTemporaryBonusForLevel(
    levelNumber: number,
  ): TemporaryLevelBonusType | null {
    const modifier = this.#temporaryLevelBonus;
    if (modifier === null) {
      return null;
    }
    if (modifier.phase !== 'pending' || modifier.levelNumber !== levelNumber) {
      throw new Error('Temporary bonus does not match the level being started.');
    }
    return modifier.type;
  }

  private activatePendingTemporaryBonus(levelNumber: number): void {
    const modifier = this.#temporaryLevelBonus;
    if (modifier === null) {
      return;
    }
    if (modifier.phase !== 'pending' || modifier.levelNumber !== levelNumber) {
      throw new Error('Cannot activate a temporary bonus for another level.');
    }

    this.#temporaryLevelBonus = Object.freeze({
      ...modifier,
      phase: 'active',
    });
  }

  private activeTemporaryBonusIs(type: TemporaryLevelBonusType): boolean {
    return this.#temporaryLevelBonus?.phase === 'active'
      && this.#temporaryLevelBonus.type === type;
  }

  private clearCompletedTemporaryBonus(levelNumber: number): void {
    const modifier = this.#temporaryLevelBonus;
    if (modifier === null) {
      return;
    }
    if (modifier.phase !== 'active' || modifier.levelNumber !== levelNumber) {
      throw new Error('Cannot clear a temporary bonus before its level completes.');
    }
    this.#temporaryLevelBonus = null;
  }

  private wallMaxHpForBuild(): number {
    return WALL_MAX_HP + (
      this.bonusSystem.stackCount('thick-literature')
      * THICK_LITERATURE_WALL_HP_BONUS
    );
  }

  private towerCombatMultiplier(): number {
    return catTreatsMultiplier(this.bonusSystem.stackCount('cat-treats'));
  }

  private spawnEnemy(
    type: EnemyType,
    spawn: GridPoint,
    levelNumber: number,
  ): void {
    if (this.#enemyLevelData.levelNumber !== levelNumber) {
      throw new Error(`Enemy level data is not prepared for level ${levelNumber}.`);
    }

    const definition = this.#enemyLevelData.definitions[type];
    const ordinal = this.#nextEnemyOrdinal;
    const id = `enemy:${ordinal}`;
    this.#nextEnemyOrdinal += 1;
    const offset = this.visualOffsetFor(ordinal);
    const enemy: RuntimeEnemy = {
      id,
      type,
      profileId: definition.navigationProfile.id,
      maxHp: definition.maxHp,
      cellsPerSecond: definition.navigationProfile.cellsPerSecond,
      cellX: spawn.x,
      cellY: spawn.y,
      hp: definition.maxHp,
      state: 'moving',
      targetCell: null,
      transitionProgress: 0,
      targetWall: null,
      attackElapsedMs: 0,
      stunRemainingMs: 0,
      visualOffsetX: offset.x,
      visualOffsetY: offset.y,
    };
    this.#enemies.set(enemy.id, enemy);
    this.#events.push({
      type: 'enemy-spawned',
      enemyId: enemy.id,
      enemyType: type,
    });
    this.triggerMineAt(spawn.x, spawn.y);
  }

  private rebuildNavigation(): void {
    const snapshot = this.navigationCostSnapshot();
    this.navigation.rebuild(snapshot);
    this.#events.push({
      type: 'navigation-rebuilt',
      gridRevision: snapshot.revision,
    });

    for (const enemy of this.#enemies.values()) {
      if (enemy.state === 'stuck') {
        this.resumeEnemy(enemy);
      }
    }
  }

  private ensureCurrentNavigation(): void {
    const firstField = this.navigation.fields.values().next().value as
      | FlowField
      | undefined;
    if (firstField?.gridRevision === this.grid.revision) {
      return;
    }
    this.rebuildNavigation();
  }

  private resumeEnemy(enemy: RuntimeEnemy): void {
    this.#attackers.removeEnemy(enemy.id);
    enemy.state = 'moving';
    enemy.targetCell = null;
    enemy.targetWall = null;
    enemy.transitionProgress = 0;
    enemy.attackElapsedMs = 0;
  }

  private resolveDirection(
    x: number,
    y: number,
    direction: FlowDirection,
  ): GridPoint | null {
    switch (direction) {
      case FlowDirection.Up:
        return { x, y: y - 1 };
      case FlowDirection.Right:
        return { x: x + 1, y };
      case FlowDirection.Down:
        return { x, y: y + 1 };
      case FlowDirection.Left:
        return { x: x - 1, y };
      case FlowDirection.None:
        return null;
    }
  }

  private navigationCostSnapshot(
    candidateTower?: TowerExposureSource,
  ): NavigationCostSnapshot {
    const snapshot = this.grid.snapshot();
    const exposureSources: TowerExposureSource[] = [
      ...this.#towers.values(),
    ];
    if (candidateTower !== undefined) {
      exposureSources.push(candidateTower);
    }

    return Object.freeze({
      ...snapshot,
      towerExposure: createTowerExposure(
        snapshot.width,
        snapshot.height,
        exposureSources,
      ),
    });
  }

  private snapshotWithCandidateWalls(
    points: readonly GridPoint[],
  ): NavigationCostSnapshot {
    const snapshot = this.navigationCostSnapshot();
    const wallHp = new Int16Array(snapshot.wallHp);
    const debris = new Uint8Array(snapshot.debris);
    const wallMaxHp = this.wallMaxHpForBuild();
    for (const point of points) {
      const index = this.grid.indexOf(point);
      wallHp[index] = wallMaxHp;
      debris[index] = 0;
    }
    return Object.freeze({
      ...snapshot,
      revision: snapshot.revision + points.length,
      wallHp,
      debris,
    });
  }

  private snapshotWithTowerBonus(
    point: GridPoint,
    type: TowerType,
  ): NavigationCostSnapshot {
    const snapshot = this.navigationCostSnapshot({
      type,
      position: { x: point.x, y: point.y },
    });
    const wallHp = new Int16Array(snapshot.wallHp);
    const index = this.grid.indexOf(point);
    wallHp[index] = (wallHp[index] ?? 0) + TOWER_WALL_HP_BONUS;
    return Object.freeze({
      ...snapshot,
      revision: snapshot.revision + 1,
      wallHp,
    });
  }

  private visualOffsetFor(ordinal: number): GridPoint {
    const offsets: readonly GridPoint[] = [
      { x: -3, y: -2 },
      { x: 3, y: 2 },
      { x: -2, y: 3 },
      { x: 2, y: -3 },
      { x: 0, y: 0 },
    ];
    return offsets[(ordinal - 1) % offsets.length] ?? { x: 0, y: 0 };
  }
}

function wholeCoinAmount(amount: number): bigint {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('Coin amount must be a non-negative safe integer.');
  }

  return BigInt(amount);
}

function doubleWholeCoinReward(amount: number): number {
  const doubled = wholeCoinAmount(amount) * 2n;
  return doubled >= MAX_PLAYER_COINS
    ? Number.MAX_SAFE_INTEGER
    : Number(doubled);
}

function randomBonusSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

export function isEnemyStateTerminal(state: EnemyState): boolean {
  return state === 'dead' || state === 'reached-core';
}
