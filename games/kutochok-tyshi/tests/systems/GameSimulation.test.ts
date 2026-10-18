import { describe, expect, it, vi } from 'vitest';

import {
  CORE_POSITION,
  GRID_HEIGHT,
  GRID_WIDTH,
  SPAWN_POINTS,
} from '../../src/config/gameConfig';
import {
  createSpawnPoints,
  PROTOTYPE_CAMPAIGN,
  type CampaignDefinition,
} from '../../src/data/levels';
import {
  BONUS_TYPES,
  type BonusOffer,
  type BonusType,
} from '../../src/domain/bonuses';
import type { EnemyType } from '../../src/domain/enemies/EnemyDefinition';
import { CORE_MAX_HP } from '../../src/domain/structures/Core';
import type { TowerType } from '../../src/domain/structures/Tower';
import { FlowDirection } from '../../src/navigation/FlowField';
import {
  GameSimulation,
  INITIAL_PLAYER_COINS,
} from '../../src/systems/GameSimulation';
import { BonusSystem } from '../../src/systems/BonusSystem';
import { MIN_LEVEL_REWARD_COINS } from '../../src/systems/LevelReward';
import type { SimulationEvent } from '../../src/systems/SimulationEvent';

const LEVEL_TRAVEL_MS = 60_000;

function createSingleEnemyPerLevelCampaign(
  enemyTypeForLevel: (levelNumber: number) => EnemyType = () => 'weak',
  maxLevel: number | null = null,
): CampaignDefinition {
  return {
    id: `single-enemy-${maxLevel ?? 'endless'}`,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    core: CORE_POSITION,
    spawnPoints: SPAWN_POINTS,
    spawnIntervalMs: 1,
    maxLevel,
    getLevel: (levelNumber) => ({
      id: `test-level-${levelNumber}`,
      groups: [{ enemyType: enemyTypeForLevel(levelNumber), count: 1 }],
      spawnPoints: SPAWN_POINTS,
    }),
  };
}

function createNarrowSingleEnemyPerLevelCampaign(
  enemyType: EnemyType,
): CampaignDefinition {
  const spawnPoint = { x: 1, y: 4 } as const;
  return {
    id: `narrow-single-${enemyType}`,
    width: 3,
    height: 5,
    core: { x: 1, y: 1 },
    spawnPoints: [spawnPoint],
    spawnIntervalMs: 1,
    maxLevel: null,
    getLevel: (levelNumber) => ({
      id: `narrow-${enemyType}-${levelNumber}`,
      groups: [{ enemyType, count: 1 }],
      spawnPoints: [spawnPoint],
    }),
  };
}

function advanceToBuildLevel(
  simulation: GameSimulation,
  targetLevel: number,
): void {
  while (simulation.buildLevelNumber < targetLevel) {
    const completedLevel = simulation.buildLevelNumber;
    expect(simulation.status).toBe('build');
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    expect(simulation.drainEvents()).toContainEqual({
      type: 'level-completed',
      levelNumber: completedLevel,
    });
    skipPendingBonus(simulation);
    expect(simulation.status).toBe('build');
  }

  expect(simulation.buildLevelNumber).toBe(targetLevel);
}

function skipPendingBonus(simulation: GameSimulation): void {
  if (simulation.status !== 'bonus') {
    return;
  }

  const offer = simulation.pendingBonusOffer;
  expect(offer).not.toBeNull();
  expect(simulation.chooseBonus(offer?.id ?? '', null)).toBe(true);
  expect(simulation.status).toBe('build');
  simulation.drainEvents();
}

function completeNextLevel(simulation: GameSimulation): readonly SimulationEvent[] {
  const completedLevel = simulation.buildLevelNumber;
  expect(simulation.status).toBe('build');
  expect(simulation.startLevel()).toBe(true);
  simulation.drainEvents();
  simulation.update(LEVEL_TRAVEL_MS);
  const events = simulation.drainEvents();
  expect(events).toContainEqual({
    type: 'level-completed',
    levelNumber: completedLevel,
  });
  return events;
}

function advanceToBonusAfterLevel(
  simulation: GameSimulation,
  completedLevel: number,
): BonusOffer {
  while (simulation.completedLevelCount < completedLevel) {
    completeNextLevel(simulation);
    if (
      simulation.status === 'bonus'
      && simulation.completedLevelCount < completedLevel
    ) {
      skipPendingBonus(simulation);
    }
  }

  expect(simulation.completedLevelCount).toBe(completedLevel);
  expect(simulation.status).toBe('bonus');
  const offer = simulation.pendingBonusOffer;
  if (offer === null) {
    throw new Error(`Expected a bonus offer after level ${completedLevel}.`);
  }
  return offer;
}

function bonusSeedOffering(type: BonusType, completedLevel = 3): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const offer = new BonusSystem(seed).createOffer({
      completedLevel,
      coreHp: 1,
      coreMaxHp: CORE_MAX_HP,
    });
    if (offer?.options.some((option) => option.type === type)) {
      return seed;
    }
  }

  throw new Error(`Could not find a deterministic seed offering ${type}.`);
}

function bonusSeedOfferingSequence(
  selections: Readonly<Record<number, BonusType>>,
): number {
  const completedLevels = Object.keys(selections).map(Number);
  const lastCompletedLevel = Math.max(...completedLevels);

  for (let seed = 0; seed < 100_000; seed += 1) {
    const system = new BonusSystem(seed);
    let matches = true;
    for (
      let completedLevel = 3;
      completedLevel <= lastCompletedLevel;
      completedLevel += 3
    ) {
      const offer = system.createOffer({
        completedLevel,
        coreHp: 1,
        coreMaxHp: CORE_MAX_HP,
      });
      if (offer === null) {
        matches = false;
        break;
      }

      const requested = selections[completedLevel] ?? null;
      if (
        requested !== null
        && !offer.options.some((option) => option.type === requested)
      ) {
        matches = false;
        break;
      }
      if (!system.resolve(offer.id, requested).resolved) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return seed;
    }
  }

  throw new Error('Could not find a deterministic seed for the bonus sequence.');
}

function chooseBonusAfterLevel(
  simulation: GameSimulation,
  type: BonusType,
  completedLevel = 3,
): void {
  const offer = advanceToBonusAfterLevel(simulation, completedLevel);
  expect(offer.options.map((option) => option.type)).toContain(type);
  expect(simulation.chooseBonus(offer.id, type)).toBe(true);
  expect(simulation.bonusStacks[type]).toBe(1);
  expect(simulation.status).toBe('build');
  simulation.drainEvents();
}

function expectTowerUnlocks(
  simulation: GameSimulation,
  levelNumber: number,
  expected: Readonly<Record<TowerType, boolean>>,
): void {
  expect(simulation.buildLevelNumber).toBe(levelNumber);
  expect(simulation.isTowerUnlocked('basic')).toBe(expected.basic);
  expect(simulation.isTowerUnlocked('rapid')).toBe(expected.rapid);
  expect(simulation.isTowerUnlocked('heavy')).toBe(expected.heavy);
  expect(simulation.isTowerUnlocked('kitten')).toBe(expected.kitten);
}

describe('GameSimulation', () => {
  it('exposes the complete next-level population for the HUD', () => {
    const simulation = new GameSimulation();

    expect(simulation.nextLevelNumber).toBe(1);
    expect(simulation.levelEnemyTotal).toBe(10);
  });

  it('prepares an arbitrary initial level, its spawns, scaling, and shared profiles directly', () => {
    const simulation = new GameSimulation(PROTOTYPE_CAMPAIGN, 0, {
      initialLevelNumber: 10,
    });

    expect(simulation.status).toBe('build');
    expect(simulation.currentLevelNumber).toBeNull();
    expect(simulation.nextLevelNumber).toBe(10);
    expect(simulation.buildLevelNumber).toBe(10);
    expect(simulation.completedLevelCount).toBe(0);
    expect(simulation.levelSystem.completedLevelCount).toBe(0);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    expect(Object.values(simulation.bonusStacks)).toEqual(
      Array.from({ length: BONUS_TYPES.length }, () => 0),
    );
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 219 },
      { enemyType: 'fast', count: 40 },
      { enemyType: 'strong', count: 1 },
    ]);
    expect(simulation.grid.spawnPoints).toEqual(createSpawnPoints(10));
    expect(simulation.levelEnemyTotal).toBe(260);
    expect(simulation.isTowerUnlocked('basic')).toBe(true);
    expect(simulation.isTowerUnlocked('rapid')).toBe(true);
    expect(simulation.isTowerUnlocked('heavy')).toBe(true);
    expect(simulation.flowFieldService.solverInvocationCount).toBe(0);

    expect(simulation.startLevel()).toBe(true);

    expect(simulation.currentLevelNumber).toBe(10);
    expect(simulation.completedLevelCount).toBe(0);
    expect(simulation.flowFieldService.solverInvocationCount).toBe(4);
    expect([...simulation.fields.keys()].sort()).toEqual([
      'fast-ground',
      'roach-ground',
      'strong-ground',
      'weak-ground',
    ]);
    expect([...simulation.activeEnemies.values()][0]).toMatchObject({
      type: 'weak',
      profileId: 'weak-ground',
      maxHp: 19,
      hp: 19,
      cellsPerSecond: 5.4,
    });
  });

  it('adds an explicit diagnostic coin bonus without changing normal starts', () => {
    const diagnosticSimulation = new GameSimulation(PROTOTYPE_CAMPAIGN, 0, {
      initialLevelNumber: 10,
      initialCoinBonus: 1_000,
    });

    expect(new GameSimulation().coins).toBe(INITIAL_PLAYER_COINS);
    expect(diagnosticSimulation.coins).toBe(INITIAL_PLAYER_COINS + 1_000);
  });

  it('spawns level-15 Roaches every half-second through one shared profile', () => {
    const simulation = new GameSimulation(PROTOTYPE_CAMPAIGN, 0, {
      initialLevelNumber: 15,
    });

    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([{
      enemyType: 'roach',
      count: 100,
    }]);
    expect(simulation.levelEnemyTotal).toBe(100);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    expect(simulation.activeEnemies.size).toBe(1);

    simulation.update(499);
    expect(simulation.activeEnemies.size).toBe(1);

    simulation.update(1);

    expect(simulation.activeEnemies.size).toBe(2);
    expect(new Set(
      [...simulation.activeEnemies.values()].map((enemy) => enemy.profileId),
    )).toEqual(new Set(['roach-ground']));
    expect(simulation.fields.get('roach-ground')).toBeDefined();
    expect(simulation.flowFieldService.solverInvocationCount).toBe(4);
  });

  it('rejects invalid arbitrary initial levels through the simulation API', () => {
    for (const initialLevelNumber of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => new GameSimulation(PROTOTYPE_CAMPAIGN, 0, {
        initialLevelNumber,
      })).toThrow(RangeError);
    }
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid initial coin bonus: %s',
    (initialCoinBonus) => {
      expect(() => new GameSimulation(PROTOTYPE_CAMPAIGN, 0, {
        initialCoinBonus,
      })).toThrow(RangeError);
    },
  );

  it('allows affordable interior wall placement only during build phases', () => {
    const simulation = new GameSimulation();

    expect(simulation.buildWall({ x: 0, y: 10 })).toEqual({
      built: false,
      reason: 'blocked-cell',
    });
    expect(simulation.buildWall({ x: 4, y: 4 })).toEqual({
      built: true,
      reason: 'built',
    });
    expect(simulation.buildWall({ x: 5, y: 4 }).built).toBe(true);
    expect(simulation.buildWall({ x: 4, y: 4 }).built).toBe(false);

    expect(simulation.startLevel()).toBe(true);
    expect(simulation.startLevel()).toBe(false);
    expect(simulation.buildWall({ x: 6, y: 4 })).toEqual({
      built: false,
      reason: 'not-build-phase',
    });
  });

  it('spends wall coins only on successful cells and exhausts a painted segment in input order', () => {
    const simulation = new GameSimulation();
    const points = [
      { x: 0, y: 4 },
      ...Array.from({ length: INITIAL_PLAYER_COINS + 1 }, (_, index) => ({
        x: index + 1,
        y: 4,
      })),
    ];

    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    const results = simulation.buildWalls(points);

    expect(results[0]).toEqual({ built: false, reason: 'blocked-cell' });
    expect(results.slice(1, -1).every((result) => result.built)).toBe(true);
    expect(results.at(-1)).toEqual({
      built: false,
      reason: 'insufficient-funds',
    });
    expect(simulation.coins).toBe(0);
    expect(
      points.slice(1, -1).every((point) => simulation.grid.hasWall(point)),
    ).toBe(true);
    expect(simulation.buildWall({ x: 22, y: 4 })).toEqual({
      built: false,
      reason: 'insufficient-funds',
    });
  });

  it('allows enclosing the core because every navigation profile can break walls', () => {
    const simulation = new GameSimulation();
    const { x, y } = CORE_POSITION;

    expect(simulation.buildWall({ x: x - 1, y }).built).toBe(true);
    expect(simulation.buildWall({ x: x + 1, y }).built).toBe(true);
    expect(simulation.buildWall({ x, y: y - 1 }).built).toBe(true);
    expect(simulation.buildWall({ x, y: y + 1 })).toEqual({
      built: true,
      reason: 'built',
    });
  });

  it('builds a painted wall segment with one shared navigation rebuild', () => {
    const simulation = new GameSimulation();

    const results = simulation.buildWalls([
      { x: 4, y: 8 },
      { x: 5, y: 8 },
      { x: 6, y: 8 },
      { x: 6, y: 8 },
      { x: 0, y: 8 },
    ]);

    expect(results.map((result) => result.reason)).toEqual([
      'built',
      'built',
      'built',
      'blocked-cell',
      'blocked-cell',
    ]);
    expect(simulation.grid.revision).toBe(3);
    expect(simulation.grid.hasWall({ x: 4, y: 8 })).toBe(true);
    expect(simulation.grid.hasWall({ x: 5, y: 8 })).toBe(true);
    expect(simulation.grid.hasWall({ x: 6, y: 8 })).toBe(true);
    expect(simulation.flowFieldService.solverInvocationCount).toBe(4);
    expect(simulation.navigation.rebuildCount).toBe(1);
    expect(simulation.drainEvents()).toEqual([
      { type: 'navigation-rebuilt', gridRevision: 3 },
    ]);
  });

  it('places one tower per wall and grants its supporting wall 50 HP', () => {
    const simulation = new GameSimulation();
    const point = { x: 18, y: 34 };

    expect(simulation.buildTower(point, 'basic')).toEqual({
      built: false,
      reason: 'no-wall',
    });
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'basic')).toEqual({
      built: true,
      reason: 'built',
    });
    expect(simulation.grid.getWall(point)).toMatchObject({ hp: 150, maxHp: 150 });
    expect(simulation.towers.get('tower:18:34')).toMatchObject({
      type: 'basic',
      position: point,
    });
    expect(simulation.buildTower(point, 'basic')).toEqual({
      built: false,
      reason: 'occupied',
    });
    expect(simulation.grid.revision).toBe(2);

    expect(simulation.startLevel()).toBe(true);
    expect(simulation.buildTower({ x: 18, y: 33 }, 'heavy')).toEqual({
      built: false,
      reason: 'not-build-phase',
    });
  });

  it('publishes a candidate tower danger zone immediately and removes it in one rebuild when sold', () => {
    const campaign: CampaignDefinition = {
      id: 'tower-risk-routing',
      width: 15,
      height: 15,
      core: { x: 13, y: 7 },
      spawnPoints: [{ x: 0, y: 7 }],
      spawnIntervalMs: 1,
      maxLevel: null,
      getLevel: (levelNumber) => ({
        id: `tower-risk-level-${levelNumber}`,
        groups: [{ enemyType: 'weak', count: 1 }],
        spawnPoints: [{ x: 0, y: 7 }],
      }),
    };
    const simulation = new GameSimulation(campaign);
    const towerPoint = { x: 10, y: 5 };
    const decisionIndex = 6 * campaign.width + 5;

    expect(simulation.buildWall(towerPoint).built).toBe(true);
    expect(
      simulation.fields.get('weak-ground')?.nextDirection[decisionIndex],
    ).toBe(FlowDirection.Right);

    const rebuildsBeforeTower = simulation.navigation.rebuildCount;
    expect(simulation.buildTower(towerPoint, 'basic').built).toBe(true);
    expect(simulation.navigation.rebuildCount).toBe(rebuildsBeforeTower + 1);
    expect(
      simulation.fields.get('weak-ground')?.nextDirection[decisionIndex],
    ).toBe(FlowDirection.Down);

    const rebuildsBeforeSale = simulation.navigation.rebuildCount;
    expect(simulation.sellWall(towerPoint).sold).toBe(true);
    expect(simulation.navigation.rebuildCount).toBe(rebuildsBeforeSale + 1);
    expect(
      simulation.fields.get('weak-ground')?.nextDirection[decisionIndex],
    ).toBe(FlowDirection.Right);
  });

  it('spends tower prices only on successful construction and rejects an unaffordable tower', () => {
    const simulation = new GameSimulation();
    const towerPoints = [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ];
    for (const point of towerPoints) {
      expect(simulation.buildWall(point).built).toBe(true);
    }

    expect(simulation.buildTower(towerPoints[0]!, 'basic').built).toBe(true);
    expect(simulation.buildTower(towerPoints[1]!, 'basic').built).toBe(true);
    expect(simulation.coins).toBe(7);
    expect(
      simulation.buildWalls(
        Array.from({ length: 7 }, (_, index) => ({ x: 10 + index, y: 4 })),
      ).every((result) => result.built),
    ).toBe(true);

    expect(simulation.coins).toBe(0);
    expect(simulation.canBuildTower(towerPoints[2]!, 'basic')).toBe(false);
    expect(simulation.buildTower(towerPoints[2]!, 'basic')).toEqual({
      built: false,
      reason: 'insufficient-funds',
    });
    expect(simulation.towers.size).toBe(2);
    expect(simulation.grid.getWall(towerPoints[2]!)).toMatchObject({
      hp: 100,
      maxHp: 100,
    });
  });

  it('unlocks rapid towers at level 4 and heavy towers at level 10', () => {
    const simulation = new GameSimulation(createSingleEnemyPerLevelCampaign());
    const rapidPoint = { x: 4, y: 4 };
    const heavyPoint = { x: 5, y: 4 };
    expect(simulation.buildWall(rapidPoint).built).toBe(true);
    expect(simulation.buildWall(heavyPoint).built).toBe(true);

    expectTowerUnlocks(simulation, 1, {
      basic: true,
      rapid: false,
      heavy: false,
      kitten: false,
    });
    expect(simulation.buildTower(rapidPoint, 'rapid')).toEqual({
      built: false,
      reason: 'locked',
    });
    expect(simulation.buildTower(heavyPoint, 'heavy')).toEqual({
      built: false,
      reason: 'locked',
    });

    advanceToBuildLevel(simulation, 3);
    expectTowerUnlocks(simulation, 3, {
      basic: true,
      rapid: false,
      heavy: false,
      kitten: false,
    });
    expect(simulation.buildTower(rapidPoint, 'rapid').reason).toBe('locked');
    expect(simulation.buildTower(heavyPoint, 'heavy').reason).toBe('locked');

    advanceToBuildLevel(simulation, 4);
    expectTowerUnlocks(simulation, 4, {
      basic: true,
      rapid: true,
      heavy: false,
      kitten: false,
    });
    expect(simulation.canBuildTower(rapidPoint, 'rapid')).toBe(true);
    expect(simulation.buildTower(heavyPoint, 'heavy').reason).toBe('locked');

    advanceToBuildLevel(simulation, 9);
    expectTowerUnlocks(simulation, 9, {
      basic: true,
      rapid: true,
      heavy: false,
      kitten: false,
    });
    expect(simulation.buildTower(heavyPoint, 'heavy').reason).toBe('locked');

    advanceToBuildLevel(simulation, 10);
    expectTowerUnlocks(simulation, 10, {
      basic: true,
      rapid: true,
      heavy: true,
      kitten: false,
    });
    expect(simulation.canBuildTower(rapidPoint, 'rapid')).toBe(true);
    expect(simulation.canBuildTower(heavyPoint, 'heavy')).toBe(true);
  });

  it('sells a wall and removes its tower in the same build phase', () => {
    const simulation = new GameSimulation();
    const point = { x: 9, y: 10 };

    expect(simulation.sellWall(point)).toEqual({
      sold: false,
      reason: 'no-wall',
    });
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'basic').built).toBe(true);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS - 6);
    simulation.drainEvents();

    expect(simulation.sellWall(point)).toEqual({ sold: true, reason: 'sold' });
    expect(simulation.grid.hasWall(point)).toBe(false);
    expect(simulation.grid.hasDebris(point)).toBe(false);
    expect(simulation.towers.has('tower:9:10')).toBe(false);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    expect(simulation.drainEvents()).toEqual([
      {
        type: 'tower-destroyed',
        towerId: 'tower:9:10',
        towerType: 'basic',
        position: point,
      },
      { type: 'wall-sold', wallId: 'wall:9:10', position: point },
      { type: 'navigation-rebuilt', gridRevision: 3 },
    ]);

    expect(simulation.startLevel()).toBe(true);
    expect(simulation.sellWall({ x: 8, y: 10 })).toEqual({
      sold: false,
      reason: 'not-build-phase',
    });
    expect(simulation.sellDefenses([point])).toEqual({
      soldCount: 0,
      reason: 'not-build-phase',
    });
  });

  it('sells a mixed defense area with full refunds and one navigation rebuild', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 21, initialCoinBonus: 1_000 },
    );
    const towerWall = { x: 9, y: 10 };
    const plainWall = { x: 10, y: 10 };
    const minePoint = { x: 11, y: 10 };
    const emptyPoint = { x: 12, y: 10 };

    expect(simulation.buildWall(towerWall).built).toBe(true);
    expect(simulation.buildTower(towerWall, 'basic').built).toBe(true);
    expect(simulation.buildWall(plainWall).built).toBe(true);
    expect(
      simulation.buildMine(minePoint, 'sheer-heart-attack').built,
    ).toBe(true);
    expect(simulation.coins).toBe(713);
    simulation.drainEvents();
    const revisionBeforeSale = simulation.grid.revision;

    expect(simulation.sellDefenses([
      towerWall,
      minePoint,
      emptyPoint,
      plainWall,
      towerWall,
    ])).toEqual({ soldCount: 3, reason: 'sold' });
    expect(simulation.coins).toBe(1_020);
    expect(simulation.grid.hasWall(towerWall)).toBe(false);
    expect(simulation.grid.hasWall(plainWall)).toBe(false);
    expect(simulation.grid.hasDebris(towerWall)).toBe(false);
    expect(simulation.towers.has('tower:9:10')).toBe(false);
    expect(simulation.mines.has('mine:11:10')).toBe(false);
    expect(simulation.drainEvents()).toEqual([
      {
        type: 'tower-destroyed',
        towerId: 'tower:9:10',
        towerType: 'basic',
        position: towerWall,
      },
      { type: 'wall-sold', wallId: 'wall:9:10', position: towerWall },
      {
        type: 'mine-sold',
        mineId: 'mine:11:10',
        mineType: 'sheer-heart-attack',
        position: minePoint,
      },
      { type: 'wall-sold', wallId: 'wall:10:10', position: plainWall },
      {
        type: 'navigation-rebuilt',
        gridRevision: revisionBeforeSale + 2,
      },
    ]);
  });

  it('deduplicates a mine-only area without rebuilding navigation', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 21, initialCoinBonus: 1_000 },
    );
    const minePoint = { x: 11, y: 10 };
    expect(
      simulation.buildMine(minePoint, 'sheer-heart-attack').built,
    ).toBe(true);
    simulation.drainEvents();

    expect(simulation.sellDefenses([minePoint, minePoint])).toEqual({
      soldCount: 1,
      reason: 'sold',
    });
    expect(simulation.coins).toBe(1_020);
    expect(simulation.drainEvents()).toEqual([{
      type: 'mine-sold',
      mineId: 'mine:11:10',
      mineType: 'sheer-heart-attack',
      position: minePoint,
    }]);
  });

  it('grants the minimum income exactly once when entering each next build phase', () => {
    const simulation = new GameSimulation(createSingleEnemyPerLevelCampaign());

    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    expect(simulation.startLevel()).toBe(true);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    simulation.update(LEVEL_TRAVEL_MS);
    expect(simulation.status).toBe('build');
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS,
    );

    simulation.update(LEVEL_TRAVEL_MS);
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS,
    );
    expect(simulation.startLevel()).toBe(true);
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS,
    );
    simulation.update(LEVEL_TRAVEL_MS);
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS * 2,
    );
  });

  it('does not invent score, rewards, or bonus stacks for skipped initial levels', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 12 },
    );

    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
    expect(simulation.completedLevelCount).toBe(0);
    expect(simulation.levelSystem.completedLevelCount).toBe(0);
    expect(Object.values(simulation.bonusStacks).every((count) => count === 0)).toBe(true);

    const events = completeNextLevel(simulation);

    expect(events).toContainEqual({
      type: 'level-completed',
      levelNumber: 12,
    });
    expect(simulation.currentLevelNumber).toBe(12);
    expect(simulation.completedLevelCount).toBe(1);
    expect(simulation.levelSystem.completedLevelCount).toBe(1);
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS,
    );
    expect(simulation.status).toBe('bonus');
    expect(simulation.pendingBonusOffer?.completedLevel).toBe(12);
    expect(Object.values(simulation.bonusStacks).every((count) => count === 0)).toBe(true);

    const offer = simulation.pendingBonusOffer;
    expect(offer).not.toBeNull();
    expect(simulation.chooseBonus(offer?.id ?? '', null)).toBe(true);
    expect(simulation.status).toBe('build');
    expect(simulation.nextLevelNumber).toBe(13);
    expect(simulation.buildLevelNumber).toBe(13);
    expect(simulation.completedLevelCount).toBe(1);
    expect(simulation.coins).toBe(
      INITIAL_PLAYER_COINS + MIN_LEVEL_REWARD_COINS,
    );
    expect(Object.values(simulation.bonusStacks).every((count) => count === 0)).toBe(true);
  });

  it('credits a rounded whole-coin reward and keeps the balance integral', () => {
    const campaign: CampaignDefinition = {
      id: 'rounded-level-reward',
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      core: CORE_POSITION,
      spawnPoints: SPAWN_POINTS,
      spawnIntervalMs: 1,
      maxLevel: null,
      getLevel: (levelNumber) => ({
        id: `rounded-reward-level-${levelNumber}`,
        groups: levelNumber === 1
          ? [{ enemyType: 'strong', count: 21 }]
          : [{ enemyType: 'weak', count: 1 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(campaign);

    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'strong', count: 21 },
    ]);
    expect(simulation.startLevel()).toBe(true);
    simulation.update(LEVEL_TRAVEL_MS);

    expect(simulation.status).toBe('build');
    expect(simulation.completedLevelCount).toBe(1);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 1 },
    ]);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS + 21);
    expect(Number.isInteger(simulation.coins)).toBe(true);

    simulation.update(LEVEL_TRAVEL_MS);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS + 21);
    expect(Number.isInteger(simulation.coins)).toBe(true);

    const wallPoint = { x: 8, y: 10 };
    expect(simulation.buildWall(wallPoint).built).toBe(true);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS + 20);
    expect(Number.isInteger(simulation.coins)).toBe(true);
    expect(simulation.sellWall(wallPoint).sold).toBe(true);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS + 21);
    expect(Number.isInteger(simulation.coins)).toBe(true);
  });

  it('smooths the level reward increase beginning with level twelve', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'smoothed-late-reward',
      getLevel: (levelNumber) => ({
        id: `smoothed-reward-level-${levelNumber}`,
        groups: levelNumber === 12
          ? [{ enemyType: 'strong', count: 61 }]
          : [{ enemyType: 'weak', count: 1 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(campaign);
    advanceToBuildLevel(simulation, 12);
    const coinsBeforeLevelTwelve = simulation.coins;

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    skipPendingBonus(simulation);

    expect(simulation.status).toBe('build');
    expect(simulation.completedLevelCount).toBe(12);
    expect(simulation.coins).toBe(coinsBeforeLevelTwelve + 40);
    expect(Number.isInteger(simulation.coins)).toBe(true);
  });

  it('does not grant next-level income after a finite campaign victory', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(() => 'weak', 1),
    );

    expect(simulation.startLevel()).toBe(true);
    simulation.update(LEVEL_TRAVEL_MS);

    expect(simulation.status).toBe('victory');
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
  });

  it('offers bonuses only after every third completed level and blocks gameplay until Skip', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      17,
    );
    const existingWall = { x: 4, y: 4 };
    expect(simulation.buildWall(existingWall).built).toBe(true);

    completeNextLevel(simulation);
    expect(simulation.completedLevelCount).toBe(1);
    expect(simulation.status).toBe('build');
    expect(simulation.pendingBonusOffer).toBeNull();

    completeNextLevel(simulation);
    expect(simulation.completedLevelCount).toBe(2);
    expect(simulation.status).toBe('build');
    expect(simulation.pendingBonusOffer).toBeNull();

    completeNextLevel(simulation);
    expect(simulation.status).toBe('bonus');
    const offer = simulation.pendingBonusOffer;
    expect(offer).not.toBeNull();
    expect(offer?.completedLevel).toBe(3);
    expect(offer?.options).toHaveLength(2);
    expect(
      offer?.options.some((option) => option.type === 'hide-under-blanket'),
    ).toBe(false);
    expect(simulation.pendingBonusOffer).toBe(offer);
    expect(simulation.levelEnemyTotal).toBe(0);
    expect(simulation.canBuild).toBe(false);
    expect(simulation.canStartLevel).toBe(false);
    expect(simulation.startLevel()).toBe(false);
    expect(simulation.buildWall({ x: 5, y: 4 })).toEqual({
      built: false,
      reason: 'not-build-phase',
    });
    expect(simulation.sellWall(existingWall)).toEqual({
      sold: false,
      reason: 'not-build-phase',
    });

    expect(simulation.chooseBonus('wrong-offer-id', null)).toBe(false);
    expect(simulation.pendingBonusOffer).toBe(offer);
    const unoffered = BONUS_TYPES.find(
      (type) => !offer?.options.some((option) => option.type === type),
    );
    expect(unoffered).toBeDefined();
    expect(simulation.chooseBonus(offer?.id ?? '', unoffered ?? 'vacation')).toBe(false);
    expect(simulation.pendingBonusOffer).toBe(offer);
    expect(Object.values(simulation.bonusStacks).every((count) => count === 0)).toBe(true);

    expect(simulation.chooseBonus(offer?.id ?? '', null)).toBe(true);
    expect(simulation.status).toBe('build');
    expect(simulation.buildLevelNumber).toBe(4);
    expect(simulation.pendingBonusOffer).toBeNull();
    expect(Object.values(simulation.bonusStacks).every((count) => count === 0)).toBe(true);
    expect(simulation.drainEvents()).toContainEqual({ type: 'bonus-skipped' });
  });

  it.each<{
    type: 'vacation' | 'social-hobby' | 'pet-cats';
    expectedHp: number;
    expectedMaxHp: number;
  }>([
    { type: 'vacation', expectedHp: 200, expectedMaxHp: 200 },
    { type: 'social-hobby', expectedHp: 247, expectedMaxHp: 250 },
    { type: 'pet-cats', expectedHp: 200, expectedMaxHp: 200 },
  ])(
    'applies the $type social-battery effect with maximum clamping',
    ({ type, expectedHp, expectedMaxHp }) => {
      const simulation = new GameSimulation(
        createSingleEnemyPerLevelCampaign(),
        bonusSeedOffering(type),
      );

      const offer = advanceToBonusAfterLevel(simulation, 3);
      expect(simulation.coreHp).toBe(197);
      expect(simulation.chooseBonus(offer.id, type)).toBe(true);

      expect(simulation.coreHp).toBe(expectedHp);
      expect(simulation.coreMaxHp).toBe(expectedMaxHp);
      expect(simulation.bonusStacks[type]).toBe(1);
      expect(simulation.status).toBe('build');
      expect(simulation.buildLevelNumber).toBe(4);
    },
  );

  it('applies Move to the next level enemy speed and its shared profile', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      bonusSeedOffering('move'),
    );
    chooseBonusAfterLevel(simulation, 'move');

    expect(simulation.startLevel()).toBe(true);
    const enemy = simulation.activeEnemies.get('enemy:4');
    expect(enemy?.cellsPerSecond).toBeCloseTo(3.4 * 0.91, 10);
    expect(
      simulation.fields.get('weak-ground')?.profileId,
    ).toBe(enemy?.profileId);
  });

  it('uses the same Earplugs-modified damage for runtime walls and core arrival', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(() => 'strong'),
      bonusSeedOffering('earplugs'),
    );
    chooseBonusAfterLevel(simulation, 'earplugs');
    const wallPoint = { x: 18, y: 34 };
    expect(simulation.buildWall(wallPoint).built).toBe(true);
    expect(simulation.grid.damageWall(wallPoint, 92).remainingHp).toBe(8);

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(250);
    simulation.update(250);
    expect(simulation.grid.wallHpAt(wallPoint)).toBe(1);
    expect(simulation.drainEvents()).toContainEqual({
      type: 'wall-shot',
      enemyId: 'enemy:4',
      wallId: 'wall:18:34',
      from: { x: 18, y: 35 },
      to: wallPoint,
    });

    simulation.update(250);
    simulation.update(LEVEL_TRAVEL_MS);
    const coreEvents = simulation
      .drainEvents()
      .filter((event) => event.type === 'enemy-reached-core');
    expect(coreEvents).toEqual([
      { type: 'enemy-reached-core', enemyId: 'enemy:4', damage: 2 },
    ]);
    expect(coreEvents[0]?.damage).toBeGreaterThanOrEqual(1);
  });

  it('applies post-level-20 damage growth to wall attacks and core arrival', () => {
    const wallSimulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(() => 'strong'),
      undefined,
      { initialLevelNumber: 25 },
    );
    const wallPoint = { x: 18, y: 34 };
    for (let x = 16; x <= 20; x += 1) {
      expect(wallSimulation.buildWall({ x, y: wallPoint.y }).built).toBe(true);
    }
    expect(wallSimulation.grid.damageWall(wallPoint, 79).remainingHp).toBe(21);

    expect(wallSimulation.startLevel()).toBe(true);
    wallSimulation.drainEvents();
    wallSimulation.update(250);
    wallSimulation.update(250);
    expect(wallSimulation.grid.wallHpAt(wallPoint)).toBe(1);

    const coreSimulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(() => 'strong'),
      undefined,
      { initialLevelNumber: 25 },
    );
    expect(coreSimulation.startLevel()).toBe(true);
    coreSimulation.drainEvents();
    coreSimulation.update(LEVEL_TRAVEL_MS);
    expect(coreSimulation.drainEvents()).toContainEqual({
      type: 'enemy-reached-core',
      enemyId: 'enemy:1',
      damage: 5,
    });
  });

  it('reduces the next canonical population and calculates its reward from actual enemies', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'burn-bridges-next-plan',
      getLevel: (levelNumber) => ({
        id: `burn-bridges-level-${levelNumber}`,
        groups: [{
          enemyType: 'weak',
          count: levelNumber === 4 ? 200 : 1,
        }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOffering('burn-bridges'),
    );
    chooseBonusAfterLevel(simulation, 'burn-bridges');

    expect(campaign.getLevel(4).groups).toEqual([
      { enemyType: 'weak', count: 200 },
    ]);
    expect(simulation.levelEnemyTotal).toBe(190);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 190 },
    ]);
    const coinsBeforeLevelFour = simulation.coins;

    completeNextLevel(simulation);
    expect(simulation.status).toBe('build');
    expect(simulation.coins).toBe(coinsBeforeLevelFour + 29);
    expect(Number.isInteger(simulation.coins)).toBe(true);
  });

  it('does not reduce a Roach group with Burn Bridges', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'burn-bridges-roach-immunity',
      getLevel: (levelNumber) => ({
        id: `burn-bridges-roach-level-${levelNumber}`,
        groups: levelNumber === 4
          ? [{ enemyType: 'roach', count: 100 }]
          : [{ enemyType: 'weak', count: 1 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOffering('burn-bridges'),
    );

    chooseBonusAfterLevel(simulation, 'burn-bridges');

    expect(simulation.levelEnemyTotal).toBe(100);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'roach', count: 100 },
    ]);
  });

  it('applies Twitter Fight after Burn Bridges to the actual prepared plan and HUD total', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'twitter-after-burn-plan',
      getLevel: (levelNumber) => ({
        id: `twitter-after-burn-${levelNumber}`,
        groups: levelNumber === 7
          ? [
              { enemyType: 'weak' as const, count: 100 },
              { enemyType: 'fast' as const, count: 100 },
              { enemyType: 'strong' as const, count: 100 },
            ]
          : [{ enemyType: 'weak' as const, count: 1 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOfferingSequence({
        3: 'burn-bridges',
        6: 'twitter-fight',
      }),
    );

    chooseBonusAfterLevel(simulation, 'burn-bridges');
    const levelSixOffer = advanceToBonusAfterLevel(simulation, 6);
    expect(levelSixOffer.options.map((option) => option.type)).toContain(
      'twitter-fight',
    );
    expect(simulation.chooseBonus(levelSixOffer.id, 'twitter-fight')).toBe(true);
    simulation.drainEvents();

    expect(campaign.getLevel(7).groups).toEqual([
      { enemyType: 'weak', count: 100 },
      { enemyType: 'fast', count: 100 },
      { enemyType: 'strong', count: 100 },
    ]);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 143 },
      { enemyType: 'fast', count: 190 },
      { enemyType: 'strong', count: 285 },
    ]);
    expect(simulation.levelEnemyTotal).toBe(618);
  });

  it('calculates and exactly doubles reward from Twitter-increased ordinary groups', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'twitter-actual-group-reward',
      getLevel: (levelNumber) => ({
        id: `twitter-actual-reward-${levelNumber}`,
        groups: [{
          enemyType: levelNumber === 4 ? 'strong' : 'weak',
          count: levelNumber === 4 ? 25 : 1,
        }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOffering('twitter-fight'),
    );

    chooseBonusAfterLevel(simulation, 'twitter-fight');
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'strong', count: 75 },
    ]);
    expect(simulation.levelEnemyTotal).toBe(75);
    const coinsBeforeTwitterLevel = simulation.coins;

    completeNextLevel(simulation);

    expect(simulation.coins).toBe(coinsBeforeTwitterLevel + 96);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 1 },
    ]);
  });

  it('consumes Twitter Fight after one level while preserving lifetime stacks', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'twitter-non-stacking-lifecycle',
      getLevel: (levelNumber) => ({
        id: `twitter-lifecycle-${levelNumber}`,
        groups: [{ enemyType: 'weak', count: 2 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOfferingSequence({
        3: 'twitter-fight',
        6: 'twitter-fight',
      }),
    );

    chooseBonusAfterLevel(simulation, 'twitter-fight');
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 3 },
    ]);
    completeNextLevel(simulation);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 2 },
    ]);
    expect(simulation.bonusStacks['twitter-fight']).toBe(1);

    completeNextLevel(simulation);
    const levelSixOffer = advanceToBonusAfterLevel(simulation, 6);
    expect(levelSixOffer.options.map((option) => option.type)).toContain(
      'twitter-fight',
    );
    expect(simulation.chooseBonus(levelSixOffer.id, 'twitter-fight')).toBe(true);
    simulation.drainEvents();

    expect(simulation.bonusStacks['twitter-fight']).toBe(2);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'weak', count: 3 },
    ]);
  });

  it('doubles the normalized Social Debt reward without changing later smoothing', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(() => 'roach'),
      id: 'twitter-social-debt-reward-baseline',
      getLevel: (levelNumber) => ({
        id: `twitter-social-debt-${levelNumber}`,
        groups: [{
          enemyType: 'roach',
          count: levelNumber === 14
            ? 900
            : levelNumber === 12 || levelNumber === 13
              ? 200
              : 1,
        }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOfferingSequence({
        3: 'social-debt',
        12: 'twitter-fight',
      }),
    );

    chooseBonusAfterLevel(simulation, 'social-debt');
    const levelTwelveOffer = advanceToBonusAfterLevel(simulation, 12);
    expect(levelTwelveOffer.options.map((option) => option.type)).toContain(
      'twitter-fight',
    );
    const coinsAfterLevelTwelve = simulation.coins;
    expect(simulation.chooseBonus(levelTwelveOffer.id, 'twitter-fight')).toBe(
      true,
    );
    simulation.drainEvents();

    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'roach', count: 200 },
    ]);
    expect(simulation.levelEnemyTotal).toBe(200);
    completeNextLevel(simulation);
    expect(simulation.coins).toBe(coinsAfterLevelTwelve + 66);
    expect(simulation.bonusStacks['twitter-fight']).toBe(1);

    const coinsAfterTwitter = simulation.coins;
    completeNextLevel(simulation);
    expect(simulation.coins).toBe(coinsAfterTwitter + 53);
    expect(simulation.levelSystem.nextLevelDefinition?.groups).toEqual([
      { enemyType: 'roach', count: 1 },
    ]);
  });

  it('uses Wider Thinking only for future offers and adds one unique option', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      bonusSeedOffering('wider-thinking'),
    );
    const levelThreeOffer = advanceToBonusAfterLevel(simulation, 3);
    expect(levelThreeOffer.options).toHaveLength(2);
    expect(simulation.chooseBonus(levelThreeOffer.id, 'wider-thinking')).toBe(true);
    simulation.drainEvents();

    const levelSixOffer = advanceToBonusAfterLevel(simulation, 6);
    expect(levelSixOffer.options).toHaveLength(3);
    expect(new Set(levelSixOffer.options.map((option) => option.type)).size).toBe(3);
    expect(simulation.bonusStacks['wider-thinking']).toBe(1);
  });

  it('scales both Cat Treats damage and attack interval for existing tower definitions', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      bonusSeedOffering('cat-treats'),
    );
    chooseBonusAfterLevel(simulation, 'cat-treats');
    const towerPoint = { x: 18, y: 34 };
    expect(simulation.buildWall(towerPoint).built).toBe(true);
    expect(simulation.buildTower(towerPoint, 'basic').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(0);
    const firstShot = simulation
      .drainEvents()
      .find((event) => event.type === 'tower-shot');
    expect(firstShot).toMatchObject({
      type: 'tower-shot',
      towerType: 'basic',
      damage: 11,
    });
    expect(simulation.activeEnemies.get('enemy:4')?.hp).toBe(5);

    simulation.update(900);
    expect(
      simulation.drainEvents().filter((event) => event.type === 'tower-shot'),
    ).toHaveLength(0);
    simulation.update(10);
    expect(
      simulation.drainEvents().filter((event) => event.type === 'tower-shot'),
    ).toHaveLength(1);
  });

  it('upgrades existing and future walls once while preserving the tower reinforcement', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      bonusSeedOffering('thick-literature'),
    );
    const plainPoint = { x: 4, y: 4 };
    const towerPoint = { x: 5, y: 4 };
    const futurePoint = { x: 6, y: 4 };
    expect(simulation.buildWall(plainPoint).built).toBe(true);
    expect(simulation.buildWall(towerPoint).built).toBe(true);
    expect(simulation.buildTower(towerPoint, 'basic').built).toBe(true);

    const offer = advanceToBonusAfterLevel(simulation, 3);
    const revisionBeforeBonus = simulation.grid.revision;
    expect(simulation.chooseBonus(offer.id, 'thick-literature')).toBe(true);

    expect(simulation.grid.revision).toBe(revisionBeforeBonus + 1);
    expect(simulation.grid.getWall(plainPoint)).toMatchObject({ hp: 150, maxHp: 150 });
    expect(simulation.grid.getWall(towerPoint)).toMatchObject({ hp: 200, maxHp: 200 });
    expect(simulation.buildWall(futurePoint).built).toBe(true);
    expect(simulation.grid.getWall(futurePoint)).toMatchObject({ hp: 150, maxHp: 150 });
    expect(simulation.buildTower(futurePoint, 'basic').built).toBe(true);
    expect(simulation.grid.getWall(futurePoint)).toMatchObject({ hp: 200, maxHp: 200 });
  });

  it('applies Social Debt to future integer rewards without changing the completed reward', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      bonusSeedOffering('social-debt'),
    );
    const offer = advanceToBonusAfterLevel(simulation, 3);
    const coinsAfterLevelThree = simulation.coins;
    expect(simulation.chooseBonus(offer.id, 'social-debt')).toBe(true);

    expect(simulation.coins).toBe(coinsAfterLevelThree);
    expect(simulation.bonusStacks['social-debt']).toBe(1);
    completeNextLevel(simulation);
    expect(simulation.coins).toBe(coinsAfterLevelThree + 22);
    expect(Number.isInteger(simulation.coins)).toBe(true);
  });

  it('queues unique blanket protection and preserves positive battery through one level', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'blanket-one-level-protection',
      getLevel: (levelNumber) => ({
        id: `blanket-protection-${levelNumber}`,
        groups: [{
          enemyType: 'weak',
          count: levelNumber === 7 ? 250 : 1,
        }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOfferingSequence({
        3: 'social-debt',
        6: 'hide-under-blanket',
      }),
    );
    const levelThreeOffer = advanceToBonusAfterLevel(simulation, 3);
    expect(
      levelThreeOffer.options.some((option) => option.type === 'hide-under-blanket'),
    ).toBe(false);
    expect(levelThreeOffer.options.map((option) => option.type)).toContain(
      'social-debt',
    );
    expect(simulation.chooseBonus(levelThreeOffer.id, 'social-debt')).toBe(true);
    simulation.drainEvents();

    const levelSixOffer = advanceToBonusAfterLevel(simulation, 6);
    expect(
      levelSixOffer.options.map((option) => option.type),
    ).toContain('hide-under-blanket');
    expect(
      simulation.chooseBonus(levelSixOffer.id, 'hide-under-blanket'),
    ).toBe(true);
    const selectionEvents = simulation.drainEvents();
    const protectedHp = simulation.coreHp;
    const wallPoint = { x: 4, y: 4 };
    expect(simulation.buildWall(wallPoint).built).toBe(true);
    expect(simulation.grid.damageWall(wallPoint, 80).remainingHp).toBe(20);
    const coinsBeforeProtectedLevel = simulation.coins;

    expect(simulation.status).toBe('build');
    expect(simulation.coreHp).toBeGreaterThan(0);
    expect(simulation.isBlanketProtectionActive).toBe(true);
    expect(simulation.completedLevelCount).toBe(6);
    expect(simulation.bonusStacks['hide-under-blanket']).toBe(1);
    expect(simulation.bonusStacks['social-debt']).toBe(1);
    expect(simulation.canStartLevel).toBe(true);
    expect(selectionEvents).toContainEqual({
      type: 'bonus-selected',
      bonusType: 'hide-under-blanket',
      stackCount: 1,
    });

    const unreachable = vi
      .spyOn(simulation.navigation, 'findUnreachableSpawns')
      .mockReturnValue([{
        profileId: 'weak-ground',
        spawn: SPAWN_POINTS[0] ?? { x: 18, y: 35 },
      }]);
    expect(simulation.startLevel()).toBe(false);
    expect(simulation.status).toBe('build');
    expect(simulation.isBlanketProtectionActive).toBe(true);
    unreachable.mockRestore();

    expect(simulation.startLevel()).toBe(true);
    expect(simulation.isBlanketProtectionActive).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    const protectedEvents = simulation.drainEvents();

    const arrivals = protectedEvents.filter(
      (event) => event.type === 'enemy-reached-core',
    );
    expect(arrivals).toHaveLength(250);
    expect(arrivals.every((event) => event.damage === 0)).toBe(true);
    expect(protectedEvents.some((event) => event.type === 'level-defeat')).toBe(
      false,
    );
    expect(protectedEvents).toContainEqual({
      type: 'level-completed',
      levelNumber: 7,
    });
    expect(simulation.coreHp).toBe(protectedHp);
    expect(simulation.coins).toBe(coinsBeforeProtectedLevel);
    expect(simulation.completedLevelCount).toBe(7);
    expect(simulation.grid.getWall(wallPoint)).toMatchObject({ hp: 100, maxHp: 100 });
    expect(simulation.isBlanketProtectionActive).toBe(false);
    expect(simulation.status).toBe('build');

    completeNextLevel(simulation);
    expect(simulation.coreHp).toBe(protectedHp - 1);
    completeNextLevel(simulation);
    expect(simulation.status).toBe('bonus');
    expect(simulation.completedLevelCount).toBe(9);
  });

  it('keeps the normalized blanket-level reward as the next smoothing baseline', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(() => 'roach'),
      id: 'blanket-normal-reward-baseline',
      getLevel: (levelNumber) => ({
        id: `blanket-reward-${levelNumber}`,
        groups: [{
          enemyType: 'roach',
          count: levelNumber === 14
            ? 900
            : levelNumber === 12 || levelNumber === 13
              ? 200
              : 1,
        }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(
      campaign,
      bonusSeedOffering('hide-under-blanket', 12),
      { initialLevelNumber: 10 },
    );

    completeNextLevel(simulation);
    completeNextLevel(simulation);
    completeNextLevel(simulation);
    expect(simulation.status).toBe('bonus');
    const offer = simulation.pendingBonusOffer;
    expect(offer?.options.map((option) => option.type)).toContain(
      'hide-under-blanket',
    );
    if (offer === null) {
      throw new Error('Expected a bonus offer after absolute level 12.');
    }
    const coinsAfterLevelTwelve = simulation.coins;
    expect(simulation.chooseBonus(offer.id, 'hide-under-blanket')).toBe(true);
    simulation.drainEvents();

    completeNextLevel(simulation);
    expect(simulation.coins).toBe(coinsAfterLevelTwelve);
    expect(simulation.isBlanketProtectionActive).toBe(false);

    const coinsAfterBlanket = simulation.coins;
    completeNextLevel(simulation);
    expect(simulation.coins).toBe(coinsAfterBlanket + 50);
  });

  it('uses enemy HP and lets a basic tower kill the first weak enemy in two shots', () => {
    const simulation = new GameSimulation();
    const point = { x: 18, y: 34 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'basic').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(0);
    const enemyAfterFirstShot = simulation.activeEnemies.get('enemy:1');
    expect(enemyAfterFirstShot?.hp).toBe(5);
    expect(
      simulation.drainEvents().filter((event) => event.type === 'tower-shot'),
    ).toHaveLength(1);

    simulation.update(1_000);
    const events = simulation.drainEvents();
    expect(simulation.activeEnemies.has('enemy:1')).toBe(false);
    expect(events).toContainEqual({
      type: 'enemy-killed',
      enemyId: 'enemy:1',
      towerId: 'tower:18:34',
    });
  });

  it('lets a Roach instantly destroy a maximum-HP supporting wall', () => {
    const simulation = new GameSimulation(
      createNarrowSingleEnemyPerLevelCampaign('roach'),
    );
    const point = { x: 1, y: 3 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'basic').built).toBe(true);
    expect(simulation.grid.addHpBonusToAllWalls(400)).toBe(1);
    expect(simulation.grid.getWall(point)).toMatchObject({ hp: 550, maxHp: 550 });
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    const rebuildsBeforeContact = simulation.navigation.rebuildCount;

    simulation.update(1);
    const events = simulation.drainEvents();

    expect(events.filter((event) => event.type === 'wall-shot')).toEqual([{
      type: 'wall-shot',
      enemyId: 'enemy:1',
      wallId: 'wall:1:3',
      from: { x: 1, y: 4 },
      to: point,
    }]);
    expect(events.filter((event) => event.type === 'wall-destroyed')).toEqual([{
      type: 'wall-destroyed',
      wallId: 'wall:1:3',
      position: point,
    }]);
    expect(events.filter((event) => event.type === 'tower-destroyed')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'navigation-rebuilt')).toHaveLength(1);
    expect(simulation.navigation.rebuildCount).toBe(rebuildsBeforeContact + 1);
    expect(simulation.grid.hasWall(point)).toBe(false);
    expect(simulation.grid.hasDebris(point)).toBe(true);
    expect(simulation.towers.has('tower:1:3')).toBe(false);
  });

  it('applies heavy direct and splash damage to Roaches', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'heavy-roach-integration',
      getLevel: (levelNumber) => ({
        id: `heavy-roach-level-${levelNumber}`,
        groups: [{ enemyType: 'roach', count: 3 }],
        spawnPoints: [{ x: 17, y: 35 }, { x: 18, y: 35 }],
      }),
    };
    const simulation = new GameSimulation(campaign, 0, {
      initialLevelNumber: 10,
    });
    const point = { x: 18, y: 34 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'heavy').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(20);
    const events = simulation.drainEvents();

    expect(events.filter((event) => event.type === 'enemy-damaged')).toEqual([
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:1',
        towerId: 'tower:18:34',
        damage: 75,
        remainingHp: 0,
        damageZone: 'primary',
        position: { x: 17, y: 35 },
      },
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:2',
        towerId: 'tower:18:34',
        damage: 15,
        remainingHp: 60,
        damageZone: 'adjacent-cell',
        position: { x: 18, y: 35 },
      },
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:3',
        towerId: 'tower:18:34',
        damage: 20,
        remainingHp: 55,
        damageZone: 'target-cell',
        position: { x: 17, y: 35 },
      },
    ]);
    expect(events).toContainEqual({
      type: 'enemy-killed',
      enemyId: 'enemy:1',
      towerId: 'tower:18:34',
    });
  });

  it('moves at half speed while entering paper debris', () => {
    const simulation = new GameSimulation();
    const debrisPoint = { x: 18, y: 34 };
    expect(simulation.grid.markDebris(debrisPoint)).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(1_000 / 2.4);

    expect(simulation.activeEnemies.get('enemy:1')).toMatchObject({
      cellX: 18,
      cellY: 35,
      targetCell: debrisPoint,
    });
    expect(
      simulation.activeEnemies.get('enemy:1')?.transitionProgress,
    ).toBeCloseTo(0.5, 5);
  });

  it('does not physically slow an enemy while it crosses a tower danger zone', () => {
    const simulation = new GameSimulation();
    const towerPoint = { x: 16, y: 34 };
    expect(simulation.buildWall(towerPoint).built).toBe(true);
    expect(simulation.buildTower(towerPoint, 'basic').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    const enemy = simulation.activeEnemies.get('enemy:1');
    expect(enemy).toMatchObject({
      hp: 15,
      cellsPerSecond: 2.4,
      transitionProgress: 0,
    });
    if (enemy === undefined) {
      throw new Error('Expected the first enemy to spawn immediately.');
    }

    simulation.update((1_000 / enemy.cellsPerSecond) / 2);

    const movingEnemy = simulation.activeEnemies.get(enemy.id);
    expect(movingEnemy?.hp).toBe(5);
    expect(movingEnemy?.targetCell).not.toBeNull();
    expect(movingEnemy?.transitionProgress).toBeCloseTo(0.5, 5);
  });

  it('honors the rapid tower cadence', () => {
    const simulation = new GameSimulation(createSingleEnemyPerLevelCampaign());
    advanceToBuildLevel(simulation, 4);
    const point = { x: 18, y: 34 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'rapid').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(500);
    const firstEvents = simulation.drainEvents();
    expect(firstEvents.filter((event) => event.type === 'tower-shot')).toHaveLength(2);
    expect(simulation.activeEnemies.get('enemy:4')).toMatchObject({
      maxHp: 16,
      hp: 4,
      cellsPerSecond: 3.4,
    });

    simulation.update(500);
    const secondEvents = simulation.drainEvents();
    expect(secondEvents.filter((event) => event.type === 'tower-shot')).toHaveLength(1);
    expect(secondEvents.some((event) => event.type === 'enemy-killed')).toBe(true);
    expect(simulation.activeEnemies.has('enemy:4')).toBe(false);
  });

  it('targets the densest cell and applies heavy primary, collateral, and adjacent damage to enemies only', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'heavy-area-integration',
      getLevel: (levelNumber) => ({
        id: `heavy-area-level-${levelNumber}`,
        groups: [{ enemyType: 'weak', count: levelNumber === 10 ? 3 : 1 }],
        spawnPoints: levelNumber === 10
          ? [{ x: 17, y: 35 }, { x: 18, y: 35 }]
          : SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(campaign);
    advanceToBuildLevel(simulation, 10);
    const point = { x: 18, y: 34 };
    const neighboringWall = { x: 17, y: 34 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'heavy').built).toBe(true);
    expect(simulation.buildWall(neighboringWall).built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(20);
    const events = simulation.drainEvents();
    expect(events).toContainEqual({
      type: 'tower-shot',
      towerId: 'tower:18:34',
      towerType: 'heavy',
      targetEnemyId: 'enemy:10',
      from: point,
      to: { x: 17, y: 35 },
      damage: 60,
      splashDamage: 20,
      adjacentSplashDamage: 15,
    });
    expect(events.filter((event) => event.type === 'enemy-damaged')).toEqual([
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:10',
        towerId: 'tower:18:34',
        damage: 19,
        remainingHp: 0,
        damageZone: 'primary',
        position: { x: 17, y: 35 },
      },
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:11',
        towerId: 'tower:18:34',
        damage: 15,
        remainingHp: 4,
        damageZone: 'adjacent-cell',
        position: { x: 18, y: 35 },
      },
      {
        type: 'enemy-damaged',
        enemyId: 'enemy:12',
        towerId: 'tower:18:34',
        damage: 19,
        remainingHp: 0,
        damageZone: 'target-cell',
        position: { x: 17, y: 35 },
      },
    ]);
    expect(simulation.activeEnemies.get('enemy:11')?.hp).toBe(4);
    expect(simulation.grid.wallHpAt(neighboringWall)).toBe(100);
  });

  it('uses core proximity to break equal-density heavy target ties', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'heavy-core-proximity-tie',
      getLevel: (levelNumber) => ({
        id: `heavy-tie-level-${levelNumber}`,
        groups: [{ enemyType: 'weak', count: levelNumber === 10 ? 2 : 1 }],
        spawnPoints: levelNumber === 10
          ? [{ x: 17, y: 35 }, { x: 18, y: 35 }]
          : SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(campaign);
    advanceToBuildLevel(simulation, 10);
    const point = { x: 18, y: 34 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'heavy').built).toBe(true);
    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();

    simulation.update(10);

    expect(
      simulation.drainEvents().find((event) => event.type === 'tower-shot'),
    ).toMatchObject({
      type: 'tower-shot',
      targetEnemyId: 'enemy:11',
      to: { x: 18, y: 35 },
    });
  });

  it('destroys a tower together with its supporting wall', () => {
    const simulation = new GameSimulation(
      createNarrowSingleEnemyPerLevelCampaign('strong'),
    );
    const point = { x: 1, y: 3 };
    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildTower(point, 'basic').built).toBe(true);
    expect(simulation.grid.damageWall(point, 149).remainingHp).toBe(1);
    const coinsAfterConstruction = simulation.coins;
    expect(simulation.startLevel()).toBe(true);

    let towerDestroyed = false;
    for (let elapsedMs = 0; elapsedMs < 10_000; elapsedMs += 250) {
      simulation.update(250);
      towerDestroyed ||= simulation
        .drainEvents()
        .some((event) => event.type === 'tower-destroyed');
      if (towerDestroyed) {
        break;
      }
    }

    expect(towerDestroyed).toBe(true);
    expect(simulation.grid.hasWall(point)).toBe(false);
    expect(simulation.grid.hasDebris(point)).toBe(true);
    expect(simulation.towers.has('tower:1:3')).toBe(false);
    expect(simulation.coins).toBe(coinsAfterConstruction);
  });

  it('manually progresses endless levels while preserving build state', () => {
    const simulation = new GameSimulation(createSingleEnemyPerLevelCampaign());
    const persistentPoint = { x: 4, y: 4 };
    expect(simulation.buildWall(persistentPoint).built).toBe(true);
    expect(simulation.buildTower(persistentPoint, 'basic').built).toBe(true);
    simulation.drainEvents();

    const startedLevels: number[] = [];
    const completedLevels: number[] = [];
    let victoryEvents = 0;

    for (let levelNumber = 1; levelNumber <= 3; levelNumber += 1) {
      expect(simulation.status).toBe('build');
      expect(simulation.canBuild).toBe(true);
      expect(simulation.canStartLevel).toBe(true);
      expect(simulation.nextLevelNumber).toBe(levelNumber);
      expect(simulation.startLevel()).toBe(true);
      expect(simulation.startLevel()).toBe(false);
      expect(simulation.canBuild).toBe(false);

      simulation.update(LEVEL_TRAVEL_MS);
      for (const event of simulation.drainEvents()) {
        if (event.type === 'level-started') {
          startedLevels.push(event.levelNumber);
        } else if (event.type === 'level-completed') {
          completedLevels.push(event.levelNumber);
        } else if (event.type === 'level-victory') {
          victoryEvents += 1;
        }
      }
      skipPendingBonus(simulation);

      expect(simulation.currentLevelNumber).toBe(levelNumber);
      expect(simulation.completedLevelCount).toBe(levelNumber);
      expect(simulation.coreHp).toBe(CORE_MAX_HP - levelNumber);
      expect(simulation.grid.hasWall(persistentPoint)).toBe(true);
      expect(simulation.towers.has('tower:4:4')).toBe(true);
      expect(simulation.status).toBe('build');
      expect(simulation.levelSystem.phase).toBe('build');
      expect(simulation.levelSystem.isComplete).toBe(false);
      expect(simulation.canBuild).toBe(true);
      expect(simulation.canStartLevel).toBe(true);
      expect(simulation.nextLevelNumber).toBe(levelNumber + 1);

      const persistedCoreHp = simulation.coreHp;
      simulation.update(100_000);
      expect(simulation.status).toBe('build');
      expect(simulation.coreHp).toBe(persistedCoreHp);
      expect(simulation.activeEnemies.size).toBe(0);
      expect(simulation.drainEvents()).toEqual([]);

      const betweenLevelWall = { x: 5 + levelNumber, y: 4 };
      expect(simulation.buildWall(betweenLevelWall).built).toBe(true);
      expect(simulation.grid.hasWall(betweenLevelWall)).toBe(true);
      simulation.drainEvents();
    }

    expect(startedLevels).toEqual([1, 2, 3]);
    expect(completedLevels).toEqual([1, 2, 3]);
    expect(victoryEvents).toBe(0);
    expect(simulation.status).toBe('build');
    expect(simulation.canStartLevel).toBe(true);
    expect(simulation.nextLevelNumber).toBe(4);
  });

  it('restores every surviving wall after a successful level', () => {
    const simulation = new GameSimulation(createSingleEnemyPerLevelCampaign());
    const ordinaryPoint = { x: 4, y: 4 };
    const reinforcedPoint = { x: 6, y: 4 };
    expect(simulation.buildWall(ordinaryPoint).built).toBe(true);
    expect(simulation.buildWall(reinforcedPoint).built).toBe(true);
    expect(simulation.buildTower(reinforcedPoint, 'basic').built).toBe(true);
    expect(simulation.grid.damageWall(ordinaryPoint, 35).remainingHp).toBe(65);
    expect(simulation.grid.damageWall(reinforcedPoint, 60).remainingHp).toBe(90);

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    const completionEvents = simulation.drainEvents();

    expect(completionEvents).toContainEqual({
      type: 'level-completed',
      levelNumber: 1,
    });
    expect(
      completionEvents.filter((event) => event.type === 'navigation-rebuilt'),
    ).toHaveLength(1);
    expect(simulation.grid.getWall(ordinaryPoint)).toMatchObject({ hp: 100, maxHp: 100 });
    expect(simulation.grid.getWall(reinforcedPoint)).toMatchObject({ hp: 150, maxHp: 150 });
  });

  it('updates next-level spawn points without changing the topology revision', () => {
    const changingSpawnCampaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'changing-level-spawns',
      getLevel: (levelNumber) => ({
        id: `changing-spawn-level-${levelNumber}`,
        groups: [{ enemyType: 'weak', count: 1 }],
        spawnPoints: levelNumber === 1 ? SPAWN_POINTS : [{ x: 0, y: 10 }],
      }),
    };
    const simulation = new GameSimulation(changingSpawnCampaign);

    expect(simulation.startLevel()).toBe(true);
    expect(simulation.flowFieldService.solverInvocationCount).toBe(4);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    simulation.drainEvents();

    expect(simulation.status).toBe('build');
    expect(simulation.grid.spawnPoints).toEqual([{ x: 0, y: 10 }]);
    expect(simulation.grid.revision).toBe(0);
  });

  it.each<[EnemyType, number]>([
    ['weak', 1],
    ['fast', 1],
    ['strong', 2],
  ])('applies %s core-arrival damage from its attack value', (enemyType, damage) => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(() => enemyType, 1),
    );

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    const arrivalEvents = simulation
      .drainEvents()
      .filter((event) => event.type === 'enemy-reached-core');

    expect(arrivalEvents).toEqual([
      { type: 'enemy-reached-core', enemyId: 'enemy:1', damage },
    ]);
    expect(simulation.coreHp).toBe(CORE_MAX_HP - damage);
    expect(simulation.completedLevelCount).toBe(1);
  });

  it('heals the social battery on Roach arrival and clamps at its maximum', () => {
    const campaign: CampaignDefinition = {
      ...createSingleEnemyPerLevelCampaign(),
      id: 'roach-core-healing',
      getLevel: (levelNumber) => ({
        id: `roach-core-healing-${levelNumber}`,
        groups: levelNumber === 1
          ? [{ enemyType: 'weak', count: 1 }]
          : [{ enemyType: 'roach', count: 2 }],
        spawnPoints: SPAWN_POINTS,
      }),
    };
    const simulation = new GameSimulation(campaign);
    completeNextLevel(simulation);
    expect(simulation.coreHp).toBe(CORE_MAX_HP - 1);

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    const events = simulation.drainEvents();

    expect(events.filter((event) => event.type === 'enemy-healed-core')).toEqual([
      { type: 'enemy-healed-core', enemyId: 'enemy:2', healing: 1 },
      { type: 'enemy-healed-core', enemyId: 'enemy:3', healing: 0 },
    ]);
    expect(events.some((event) => event.type === 'enemy-reached-core')).toBe(false);
    expect(events.some((event) => event.type === 'level-defeat')).toBe(false);
    expect(simulation.coreHp).toBe(CORE_MAX_HP);
  });

  it('keeps defeat authoritative when the final enemy also completes the campaign', () => {
    const lethalCampaign: CampaignDefinition = {
      id: 'lethal-final-enemy',
      width: 3,
      height: 3,
      core: { x: 1, y: 1 },
      spawnPoints: [{ x: 1, y: 2 }],
      spawnIntervalMs: 1,
      maxLevel: 1,
      getLevel: () => ({
          id: 'only-level',
          groups: [{ enemyType: 'weak', count: CORE_MAX_HP }],
          spawnPoints: [{ x: 1, y: 2 }],
      }),
    };
    const simulation = new GameSimulation(lethalCampaign);

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(LEVEL_TRAVEL_MS);
    const events = simulation.drainEvents();

    expect(
      events.filter((event) => event.type === 'enemy-reached-core'),
    ).toHaveLength(CORE_MAX_HP);
    expect(events.filter((event) => event.type === 'level-defeat')).toHaveLength(1);
    expect(events.some((event) => event.type === 'level-victory')).toBe(false);
    expect(events.some((event) => event.type === 'level-completed')).toBe(false);
    expect(simulation.coreHp).toBe(0);
    expect(simulation.status).toBe('defeat');
    expect(simulation.canBuild).toBe(false);
    expect(simulation.canStartLevel).toBe(false);
    expect(simulation.startLevel()).toBe(false);
    expect(simulation.levelSystem.isComplete).toBe(true);
    expect(simulation.completedLevelCount).toBe(0);
    expect(simulation.activeEnemies.size).toBe(0);
    expect(simulation.coins).toBe(INITIAL_PLAYER_COINS);
  });

  it('unlocks the kitten after level 15 and freezes nearby enemies without damage', () => {
    const campaign = createSingleEnemyPerLevelCampaign();
    const locked = new GameSimulation(campaign, 0, {
      initialLevelNumber: 15,
      initialCoinBonus: 1_000,
    });
    expect(locked.isTowerUnlocked('kitten')).toBe(false);

    const simulation = new GameSimulation(campaign, 0, {
      initialLevelNumber: 16,
      initialCoinBonus: 1_000,
    });
    const towerPoint = { x: 17, y: 30 };
    expect(simulation.buildWall(towerPoint)).toEqual({
      built: true,
      reason: 'built',
    });
    expect(simulation.buildTower(towerPoint, 'kitten')).toEqual({
      built: true,
      reason: 'built',
    });
    expect(simulation.grid.getWall(towerPoint)).toMatchObject({
      hp: 150,
      maxHp: 150,
    });
    expect(simulation.coins).toBe(909);
    simulation.drainEvents();

    expect(simulation.startLevel()).toBe(true);
    simulation.drainEvents();
    simulation.update(0);
    const activationEvents = simulation.drainEvents();
    const meow = activationEvents.find(
      (event) => event.type === 'kitten-meowed',
    );
    expect(meow).toMatchObject({
      type: 'kitten-meowed',
      towerId: 'tower:17:30',
      radiusCells: 10,
      durationMs: 2_000,
      affectedEnemyIds: ['enemy:1'],
      bubbleEnemyIds: ['enemy:1'],
    });
    expect(
      activationEvents.some((event) => event.type === 'tower-shot'),
    ).toBe(false);
    expect(
      activationEvents.some((event) => event.type === 'enemy-damaged'),
    ).toBe(false);

    const enemy = simulation.activeEnemies.get('enemy:1');
    expect(enemy).toMatchObject({
      hp: 22,
      maxHp: 22,
      cellX: 18,
      cellY: 35,
      stunRemainingMs: 2_000,
    });
    simulation.update(1_999);
    expect(simulation.activeEnemies.get('enemy:1')).toMatchObject({
      cellX: 18,
      cellY: 35,
      transitionProgress: 0,
      stunRemainingMs: 1,
    });
    simulation.update(1);
    expect(simulation.activeEnemies.get('enemy:1')).toMatchObject({
      cellX: 18,
      cellY: 35,
      transitionProgress: 0,
      stunRemainingMs: 0,
    });
    simulation.update(100);
    expect(
      simulation.activeEnemies.get('enemy:1')?.transitionProgress,
    ).toBeGreaterThan(0);
  });

  it('places, sells, and mutually excludes a Sheer Heart Attack mine', () => {
    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 21, initialCoinBonus: 1_000 },
    );
    const point = { x: 10, y: 10 };
    const revision = simulation.grid.revision;

    expect(simulation.isMineUnlocked('sheer-heart-attack')).toBe(true);
    expect(simulation.buildMine(point, 'sheer-heart-attack')).toEqual({
      built: true,
      reason: 'built',
    });
    expect(simulation.coins).toBe(720);
    expect(simulation.grid.revision).toBe(revision);
    expect(simulation.buildWall(point)).toEqual({
      built: false,
      reason: 'blocked-cell',
    });
    expect(simulation.buildMine(point, 'sheer-heart-attack')).toEqual({
      built: false,
      reason: 'occupied',
    });
    expect(simulation.sellDefense(point)).toEqual({
      sold: true,
      reason: 'sold',
    });
    expect(simulation.coins).toBe(1_020);
    expect(simulation.grid.revision).toBe(revision);

    expect(simulation.buildWall(point).built).toBe(true);
    expect(simulation.buildMine(point, 'sheer-heart-attack')).toEqual({
      built: false,
      reason: 'wall',
    });
  });

  it('detonates after one second, kills active enemies, and damages only cardinal walls', () => {
    const level20 = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 20, initialCoinBonus: 1_000 },
    );
    expect(level20.isMineUnlocked('sheer-heart-attack')).toBe(false);

    const simulation = new GameSimulation(
      createSingleEnemyPerLevelCampaign(),
      0,
      { initialLevelNumber: 21, initialCoinBonus: 1_000 },
    );
    const spawn = { x: 18, y: 35 };
    const north = { x: 18, y: 34 };
    const diagonal = { x: 17, y: 34 };
    expect(simulation.buildWall(north).built).toBe(true);
    expect(simulation.buildWall(diagonal).built).toBe(true);
    const solverInvocationsBeforeMine =
      simulation.flowFieldService.solverInvocationCount;
    expect(simulation.buildMine(spawn, 'sheer-heart-attack').built).toBe(true);
    expect(simulation.flowFieldService.solverInvocationCount).toBe(
      solverInvocationsBeforeMine,
    );

    expect(simulation.startLevel()).toBe(true);
    const solverInvocationsBeforeDetonation =
      simulation.flowFieldService.solverInvocationCount;
    const startEvents = simulation.drainEvents();
    expect(startEvents).toContainEqual({
      type: 'mine-triggered',
      mineId: 'mine:18:35',
      mineType: 'sheer-heart-attack',
      position: spawn,
      triggerDelayMs: 1_000,
    });
    simulation.update(999);
    expect(simulation.mines.get('mine:18:35')).toMatchObject({
      state: 'triggered',
      triggerRemainingMs: 1,
    });
    expect(simulation.activeEnemies.size).toBe(1);

    simulation.update(1);
    const events = simulation.drainEvents();
    expect(events).toContainEqual({
      type: 'mine-detonated',
      mineId: 'mine:18:35',
      mineType: 'sheer-heart-attack',
      position: spawn,
      killedEnemyCount: 1,
      damagedWallPositions: [north],
    });
    expect(simulation.activeEnemies.size).toBe(0);
    expect(simulation.mines.size).toBe(0);
    expect(events).toContainEqual({ type: 'level-completed', levelNumber: 21 });
    expect(simulation.grid.getWall(north)?.hp).toBe(100);
    expect(simulation.grid.getWall(diagonal)?.hp).toBe(100);
    expect(simulation.coreHp).toBe(CORE_MAX_HP);
    expect(simulation.flowFieldService.solverInvocationCount).toBeGreaterThan(
      solverInvocationsBeforeDetonation,
    );
  });
});
