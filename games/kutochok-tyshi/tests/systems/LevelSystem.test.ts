import { describe, expect, it, vi } from 'vitest';

import {
  createLevelDefinition,
  createSpawnPoints,
  enemyCountAtLevel,
  PROTOTYPE_CAMPAIGN,
  ROACH_LEVEL_ENEMY_COUNT,
  ROACH_LEVEL_NUMBERS,
  spawnIntervalMsAtLevel,
  spawnPointCountAtLevel,
  type CampaignDefinition,
  type LevelDefinition,
} from '../../src/data/levels';
import { LevelSystem, type LevelSystemEvent } from '../../src/systems/LevelSystem';

function eventTypes(events: readonly LevelSystemEvent[]): string[] {
  return events.map((event) => event.type);
}

function enemyCount(level: LevelDefinition): number {
  return level.groups.reduce((sum, group) => sum + group.count, 0);
}

type EnemySpawnEvent = Extract<LevelSystemEvent, { type: 'enemy-spawn' }>;

function enemySpawnEvents(
  events: readonly LevelSystemEvent[],
): EnemySpawnEvent[] {
  return events.filter(
    (event): event is EnemySpawnEvent => event.type === 'enemy-spawn',
  );
}

function finishCurrentLevel(
  system: LevelSystem,
  campaign: CampaignDefinition,
): readonly LevelSystemEvent[] {
  const level = system.nextLevelDefinition;
  if (level === null) {
    throw new Error('Expected a next level.');
  }
  const count = enemyCount(level);
  system.startNextLevel();
  system.update(campaign.spawnIntervalMs * (count - 1));
  return system.notifyEnemyResolved(count);
}

describe('procedural level data', () => {
  it('scales each enemy type by 1.4 through level 15, then by 1.15 through level 19', () => {
    expect([
      enemyCountAtLevel(1, 1, 10),
      enemyCountAtLevel(2, 1, 10),
      enemyCountAtLevel(3, 1, 10),
      enemyCountAtLevel(4, 1, 10),
      enemyCountAtLevel(5, 1, 10),
    ]).toEqual([10, 14, 20, 28, 40]);

    expect([
      enemyCountAtLevel(3, 4, 5),
      enemyCountAtLevel(4, 4, 5),
      enemyCountAtLevel(5, 4, 5),
      enemyCountAtLevel(6, 4, 5),
    ]).toEqual([0, 5, 7, 10]);

    expect([
      enemyCountAtLevel(9, 10, 1),
      enemyCountAtLevel(10, 10, 1),
      enemyCountAtLevel(11, 10, 1),
      enemyCountAtLevel(12, 10, 1),
    ]).toEqual([0, 1, 2, 3]);

    expect([
      enemyCountAtLevel(14, 1, 10),
      enemyCountAtLevel(15, 1, 10),
      enemyCountAtLevel(16, 1, 10),
      enemyCountAtLevel(17, 1, 10),
    ]).toEqual([843, 1_181, 1_359, 1_563]);
    expect([
      enemyCountAtLevel(14, 4, 5),
      enemyCountAtLevel(15, 4, 5),
      enemyCountAtLevel(16, 4, 5),
      enemyCountAtLevel(17, 4, 5),
    ]).toEqual([156, 219, 252, 290]);
    expect([
      enemyCountAtLevel(14, 10, 1),
      enemyCountAtLevel(15, 10, 1),
      enemyCountAtLevel(16, 10, 1),
      enemyCountAtLevel(17, 10, 1),
    ]).toEqual([7, 10, 12, 14]);

    // A type introduced in the late game uses the late ratio from its first
    // post-unlock transition as well.
    expect(enemyCountAtLevel(16, 16, 10)).toBe(10);
    expect(enemyCountAtLevel(17, 16, 10)).toBe(12);
  });

  it('uses type-specific bounded population growth from level 20 onward', () => {
    expect([
      enemyCountAtLevel(19, 1, 10, 'weak'),
      enemyCountAtLevel(20, 1, 10, 'weak'),
      enemyCountAtLevel(21, 1, 10, 'weak'),
    ]).toEqual([2_068, 2_110, 2_153]);
    expect([
      enemyCountAtLevel(19, 4, 5, 'fast'),
      enemyCountAtLevel(20, 4, 5, 'fast'),
      enemyCountAtLevel(21, 4, 5, 'fast'),
    ]).toEqual([385, 405, 426]);
    expect([
      enemyCountAtLevel(19, 10, 1, 'strong'),
      enemyCountAtLevel(20, 10, 1, 'strong'),
      enemyCountAtLevel(21, 10, 1, 'strong'),
    ]).toEqual([20, 24, 29]);

    expect(enemyCountAtLevel(28, 1, 10, 'weak')).toBe(2_476);
    expect(enemyCountAtLevel(29, 1, 10, 'weak')).toBe(2_500);
    expect(enemyCountAtLevel(42, 4, 5, 'fast')).toBe(1_202);
    expect(enemyCountAtLevel(43, 4, 5, 'fast')).toBe(1_250);
    expect(enemyCountAtLevel(44, 10, 1, 'strong')).toBe(1_419);
    expect(enemyCountAtLevel(45, 10, 1, 'strong')).toBe(1_500);

    expect(createLevelDefinition(20).groups).toEqual([
      { enemyType: 'weak', count: 2_110 },
      { enemyType: 'fast', count: 405 },
      { enemyType: 'strong', count: 24 },
    ]);
  });

  it('unlocks fast enemies on level 4 and strong enemies on level 10', () => {
    expect(createLevelDefinition(3).groups).toEqual([
      { enemyType: 'weak', count: 20 },
    ]);
    expect(createLevelDefinition(4).groups).toEqual([
      { enemyType: 'weak', count: 28 },
      { enemyType: 'fast', count: 5 },
    ]);
    expect(createLevelDefinition(10).groups).toEqual([
      { enemyType: 'weak', count: 219 },
      { enemyType: 'fast', count: 40 },
      { enemyType: 'strong', count: 1 },
    ]);
  });

  it('replaces levels 15 and 77 with exactly one static Roach group', () => {
    expect([...ROACH_LEVEL_NUMBERS]).toEqual([15, 77]);

    for (const levelNumber of ROACH_LEVEL_NUMBERS) {
      expect(createLevelDefinition(levelNumber).groups).toEqual([{
        enemyType: 'roach',
        count: ROACH_LEVEL_ENEMY_COUNT,
      }]);
    }

    expect(createLevelDefinition(14).groups.some(
      (group) => group.enemyType === 'roach',
    )).toBe(false);
    expect(createLevelDefinition(16).groups.some(
      (group) => group.enemyType === 'roach',
    )).toBe(false);
    expect(createLevelDefinition(76).groups.some(
      (group) => group.enemyType === 'roach',
    )).toBe(false);
    expect(createLevelDefinition(78).groups.some(
      (group) => group.enemyType === 'roach',
    )).toBe(false);
  });

  it('adds one deterministic unique border spawn every five levels, capped at one hundred', () => {
    expect(spawnPointCountAtLevel(1)).toBe(1);
    expect(spawnPointCountAtLevel(4)).toBe(1);
    expect(spawnPointCountAtLevel(5)).toBe(2);
    expect(spawnPointCountAtLevel(9)).toBe(2);
    expect(spawnPointCountAtLevel(10)).toBe(3);
    expect(spawnPointCountAtLevel(90)).toBe(19);
    expect(spawnPointCountAtLevel(95)).toBe(20);
    expect(spawnPointCountAtLevel(100)).toBe(21);
    expect(spawnPointCountAtLevel(490)).toBe(99);
    expect(spawnPointCountAtLevel(495)).toBe(100);
    expect(spawnPointCountAtLevel(10_000)).toBe(100);

    expect(createSpawnPoints(4)).toEqual([{ x: 18, y: 35 }]);
    const first = createSpawnPoints(495);
    const second = createSpawnPoints(495);
    expect(first).toEqual(second);
    expect(new Set(first.map((point) => `${point.x}:${point.y}`)).size).toBe(100);
    expect(first.every((point) => (
      point.x === 0 || point.x === 35 || point.y === 0 || point.y === 35
    ))).toBe(true);
    expect(createSpawnPoints(496)).not.toEqual(first);

    const smallArena = createSpawnPoints(495, 3, 3);
    expect(smallArena).toHaveLength(8);
    expect(new Set(
      smallArena.map((point) => `${point.x}:${point.y}`),
    ).size).toBe(8);
    expect(createSpawnPoints(495, 3, 3)).toEqual(smallArena);
  });

  it('keeps enormous-level groups at their type caps without allocating enemy queues', () => {
    const level = createLevelDefinition(Number.MAX_SAFE_INTEGER);

    expect(level.groups).toEqual([
      { enemyType: 'weak', count: 2_500 },
      { enemyType: 'fast', count: 1_250 },
      { enemyType: 'strong', count: 1_500 },
    ]);
    expect(level.spawnPoints).toHaveLength(100);
    expect(createLevelDefinition(Number.MAX_SAFE_INTEGER)).toEqual(level);
  });

  it('accelerates cadence after level 20 before capping it at 500 enemies per second', () => {
    expect(spawnIntervalMsAtLevel(1)).toBe(500);
    expect(spawnIntervalMsAtLevel(2)).toBe(450);
    expect(spawnIntervalMsAtLevel(9)).toBe(100);
    expect(spawnIntervalMsAtLevel(10)).toBe(50);

    expect(spawnIntervalMsAtLevel(11)).toBe(40);
    expect(spawnIntervalMsAtLevel(12)).toBe(30);
    expect(spawnIntervalMsAtLevel(13)).toBe(20);
    expect(spawnIntervalMsAtLevel(14)).toBe(10);
    expect(spawnIntervalMsAtLevel(15)).toBe(500);
    expect(spawnIntervalMsAtLevel(16)).toBe(10);
    expect(spawnIntervalMsAtLevel(19)).toBe(10);
    expect(spawnIntervalMsAtLevel(20)).toBe(8);
    expect(spawnIntervalMsAtLevel(21)).toBe(6);
    expect(spawnIntervalMsAtLevel(22)).toBe(4);
    expect(spawnIntervalMsAtLevel(23)).toBe(2);
    expect(1_000 / spawnIntervalMsAtLevel(23)).toBe(500);
    expect(spawnIntervalMsAtLevel(77)).toBe(500);
    expect(spawnIntervalMsAtLevel(Number.MAX_SAFE_INTEGER)).toBe(2);
  });
});

describe('LevelSystem', () => {
  it('stays in an unlimited build phase and returns one stable next-level definition', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN);

    expect(system.phase).toBe('build');
    expect(system.currentLevelNumber).toBeNull();
    expect(system.currentLevelId).toBeNull();
    expect(system.nextLevelNumber).toBe(1);
    expect(system.canStartNextLevel).toBe(true);
    expect(system.nextLevelDefinition).toBe(system.peekNextLevel());
    expect(system.nextLevelDefinition).toMatchObject({
      id: 'level-1',
      groups: [{ enemyType: 'weak', count: 10 }],
      spawnPoints: [{ x: 18, y: 35 }],
    });
    expect(system.update(1_000_000)).toEqual([]);
    expect(system.phase).toBe('build');
  });

  it('starts a fresh run at an arbitrary level without counting skipped levels', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN, {
      initialLevelNumber: 10,
    });

    expect(system.phase).toBe('build');
    expect(system.currentLevelNumber).toBeNull();
    expect(system.currentLevelId).toBeNull();
    expect(system.completedLevelCount).toBe(0);
    expect(system.nextLevelNumber).toBe(10);
    expect(system.nextLevelDefinition).toMatchObject({
      id: 'level-10',
      groups: [
        { enemyType: 'weak', count: 219 },
        { enemyType: 'fast', count: 40 },
        { enemyType: 'strong', count: 1 },
      ],
      spawnPoints: createSpawnPoints(10),
    });
    expect(system.levelEnemyTotal).toBe(260);

    const startEvents = system.startNextLevel();
    expect(startEvents[0]).toMatchObject({
      type: 'level-started',
      levelNumber: 10,
      levelId: 'level-10',
    });
    expect(system.currentLevelNumber).toBe(10);
    expect(system.completedLevelCount).toBe(0);
    expect(system.nextLevelNumber).toBeNull();

    system.update(spawnIntervalMsAtLevel(10) * 259);
    expect(system.phase).toBe('active');
    expect(system.activeEnemyCount).toBe(260);
    const completionEvents = system.notifyEnemyResolved(260);

    expect(completionEvents).toEqual([
      {
        type: 'level-completed',
        levelNumber: 10,
        levelId: 'level-10',
      },
    ]);
    expect(system.phase).toBe('build');
    expect(system.currentLevelNumber).toBe(10);
    expect(system.completedLevelCount).toBe(1);
    expect(system.nextLevelNumber).toBe(11);
    expect(system.nextLevelDefinition?.id).toBe('level-11');
  });

  it('validates an initial level without iterating through prior levels', () => {
    for (const invalidLevel of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => new LevelSystem(PROTOTYPE_CAMPAIGN, {
        initialLevelNumber: invalidLevel,
      })).toThrow(RangeError);
    }

    const finiteCampaign: CampaignDefinition = Object.freeze({
      ...PROTOTYPE_CAMPAIGN,
      maxLevel: 9,
    });
    expect(() => new LevelSystem(finiteCampaign, {
      initialLevelNumber: 10,
    })).toThrow(RangeError);

    const maximumLevel = new LevelSystem(PROTOTYPE_CAMPAIGN, {
      initialLevelNumber: Number.MAX_SAFE_INTEGER,
    });
    expect(maximumLevel.nextLevelNumber).toBe(Number.MAX_SAFE_INTEGER);
    expect(maximumLevel.completedLevelCount).toBe(0);
  });

  it('invalidates only a lazily cached build-phase level and regenerates it on demand', () => {
    const spawnPoints = Object.freeze([Object.freeze({ x: 1, y: 2 })]);
    let configuredCount = 1;
    const getLevel = vi.fn((levelNumber: number): LevelDefinition => Object.freeze({
      id: `level-${levelNumber}`,
      groups: Object.freeze([
        Object.freeze({ enemyType: 'weak' as const, count: configuredCount }),
      ]),
      spawnPoints,
    }));
    const campaign: CampaignDefinition = Object.freeze({
      id: 'invalidated-next-level',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: null,
      getLevel,
    });
    const system = new LevelSystem(campaign);

    expect(system.invalidateNextLevelPreparation()).toBe(false);
    const first = system.nextLevelDefinition;
    expect(first?.groups[0]?.count).toBe(1);
    expect(getLevel).toHaveBeenCalledTimes(1);

    configuredCount = 3;
    expect(system.nextLevelDefinition).toBe(first);
    expect(system.invalidateNextLevelPreparation()).toBe(true);

    const regenerated = system.nextLevelDefinition;
    expect(regenerated).not.toBe(first);
    expect(regenerated?.groups[0]?.count).toBe(3);
    expect(getLevel).toHaveBeenCalledTimes(2);

    system.startNextLevel();
    expect(system.phase).toBe('spawning');
    expect(system.invalidateNextLevelPreparation()).toBe(false);
  });

  it('reports the complete planned level population without decrementing it during play', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN);

    expect(system.nextLevelNumber).toBe(1);
    expect(system.levelEnemyTotal).toBe(10);

    system.startNextLevel();
    system.update(PROTOTYPE_CAMPAIGN.spawnIntervalMs * 9);
    expect(system.phase).toBe('active');
    expect(system.levelEnemyTotal).toBe(10);

    system.notifyEnemyResolved(1);
    expect(system.activeEnemyCount).toBe(9);
    expect(system.levelEnemyTotal).toBe(10);

    system.notifyEnemyResolved(9);
    expect(system.phase).toBe('build');
    expect(system.levelEnemyTotal).toBe(14);

    finishCurrentLevel(system, PROTOTYPE_CAMPAIGN);
    finishCurrentLevel(system, PROTOTYPE_CAMPAIGN);
    expect(system.nextLevelNumber).toBe(4);
    expect(system.levelEnemyTotal).toBe(33);
  });

  it('saturates the displayed total for an enormous multi-group level', () => {
    const spawnPoints = Object.freeze([Object.freeze({ x: 1, y: 2 })]);
    const campaign: CampaignDefinition = Object.freeze({
      id: 'saturated-level-total',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: null,
      getLevel: (levelNumber: number) => Object.freeze({
        id: `level-${levelNumber}`,
        groups: Object.freeze([
          Object.freeze({
            enemyType: 'weak' as const,
            count: Number.MAX_SAFE_INTEGER,
          }),
          Object.freeze({
            enemyType: 'fast' as const,
            count: Number.MAX_SAFE_INTEGER,
          }),
        ]),
        spawnPoints,
      }),
    });

    expect(new LevelSystem(campaign).levelEnemyTotal).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('starts the first enemy immediately and lazily respects spawn cadence', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN);

    const initialEvents = system.startNextLevel();
    expect(eventTypes(initialEvents)).toEqual(['level-started', 'enemy-spawn']);
    expect(initialEvents[0]).toMatchObject({
      levelNumber: 1,
      levelId: 'level-1',
      spawnPoints: [{ x: 18, y: 35 }],
    });
    expect(initialEvents[1]).toMatchObject({
      enemyType: 'weak',
      spawnPoint: { x: 18, y: 35 },
      levelSpawnOrdinal: 1,
      campaignSpawnOrdinal: 1,
    });
    expect(system.phase).toBe('spawning');
    expect(system.activeEnemyCount).toBe(1);
    expect(system.pendingSpawnCount).toBe(9);

    expect(system.update(PROTOTYPE_CAMPAIGN.spawnIntervalMs - 1)).toEqual([]);
    expect(eventTypes(system.update(1))).toEqual(['enemy-spawn']);
    expect(system.activeEnemyCount).toBe(2);
    expect(system.pendingSpawnCount).toBe(8);
    expect(system.startNextLevel()).toEqual([]);
  });

  it('uses the current level cadence and preserves exact spawn boundaries at the cap', () => {
    const spawnPoints = Object.freeze([Object.freeze({ x: 1, y: 2 })]);
    const campaign: CampaignDefinition = Object.freeze({
      id: 'level-spawn-cadence',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 500,
      maxLevel: null,
      getLevel: (levelNumber: number) => Object.freeze({
        id: `level-${levelNumber}`,
        groups: Object.freeze([
          Object.freeze({ enemyType: 'weak' as const, count: 2 }),
        ]),
        spawnPoints,
      }),
    });
    const system = new LevelSystem(campaign);

    for (let levelNumber = 1; levelNumber <= 15; levelNumber += 1) {
      const intervalMs = spawnIntervalMsAtLevel(
        levelNumber,
        campaign.spawnIntervalMs,
      );
      const initialEvents = system.startNextLevel();

      expect(eventTypes(initialEvents)).toEqual(['level-started', 'enemy-spawn']);
      expect(system.currentLevelNumber).toBe(levelNumber);
      expect(system.activeEnemyCount).toBe(1);
      expect(system.update(intervalMs - 1)).toEqual([]);
      expect(eventTypes(system.update(1))).toEqual(['enemy-spawn']);
      expect(system.phase).toBe('active');

      expect(eventTypes(system.notifyEnemyResolved(2))).toEqual(['level-completed']);
    }
  });

  it('streams exactly 500 scheduled enemies per simulation second at the late cap', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN, {
      initialLevelNumber: 23,
    });

    const initialSpawns = enemySpawnEvents(system.startNextLevel());
    const cappedSecondSpawns = enemySpawnEvents(system.update(1_000));

    expect(initialSpawns).toHaveLength(1);
    expect(cappedSecondSpawns).toHaveLength(500);
    expect(cappedSecondSpawns[0]?.levelSpawnOrdinal).toBe(2);
    expect(cappedSecondSpawns.at(-1)?.levelSpawnOrdinal).toBe(501);
    expect(system.activeEnemyCount).toBe(501);
    expect(system.pendingSpawnCount).toBe(system.levelEnemyTotal - 501);
    expect(system.phase).toBe('spawning');
  });

  it('streams mixed enemy groups fairly and deterministically without changing their totals', () => {
    const spawnPoints = Object.freeze([
      Object.freeze({ x: 0, y: 1 }),
      Object.freeze({ x: 2, y: 1 }),
      Object.freeze({ x: 1, y: 0 }),
    ]);
    const campaign: CampaignDefinition = Object.freeze({
      id: 'mixed-spawn-order',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: null,
      getLevel: (levelNumber: number) => Object.freeze({
        id: `level-${levelNumber}`,
        groups: Object.freeze([
          Object.freeze({ enemyType: 'weak' as const, count: 6 }),
          Object.freeze({ enemyType: 'fast' as const, count: 4 }),
          Object.freeze({ enemyType: 'strong' as const, count: 2 }),
        ]),
        spawnPoints,
      }),
    });
    const first = new LevelSystem(campaign);
    const second = new LevelSystem(campaign);

    const firstEvents = first.startNextLevel();
    expect(first.pendingSpawnCount).toBe(11);

    const partialEvents = first.update(200);
    expect(first.pendingSpawnCount).toBe(9);
    expect(first.activeEnemyCount).toBe(3);

    const remainingEvents = first.update(900);
    expect(first.pendingSpawnCount).toBe(0);
    expect(first.activeEnemyCount).toBe(12);
    expect(first.phase).toBe('active');

    const spawns = enemySpawnEvents([
      ...firstEvents,
      ...partialEvents,
      ...remainingEvents,
    ]);
    const enemyTypes = spawns.map((event) => event.enemyType);
    const deterministicTypes = enemySpawnEvents([
      ...second.startNextLevel(),
      ...second.update(1_100),
    ]).map((event) => event.enemyType);

    expect(enemyTypes).toHaveLength(12);
    expect(enemyTypes.filter((enemyType) => enemyType === 'weak')).toHaveLength(6);
    expect(enemyTypes.filter((enemyType) => enemyType === 'fast')).toHaveLength(4);
    expect(enemyTypes.filter((enemyType) => enemyType === 'strong')).toHaveLength(2);
    expect(enemyTypes).toEqual(deterministicTypes);

    const lastWeakIndex = enemyTypes.lastIndexOf('weak');
    expect(enemyTypes.indexOf('fast')).toBeLessThan(lastWeakIndex);
    expect(enemyTypes.indexOf('strong')).toBeLessThan(lastWeakIndex);
    expect(enemyTypes).not.toEqual([
      'weak', 'weak', 'weak', 'weak', 'weak', 'weak',
      'fast', 'fast', 'fast', 'fast',
      'strong', 'strong',
    ]);

    expect(spawns.map((event) => event.spawnPoint)).toEqual(
      spawns.map((_, index) => spawnPoints[index % spawnPoints.length]),
    );
    expect(spawns.map((event) => event.levelSpawnOrdinal)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(spawns.map((event) => event.campaignSpawnOrdinal)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );

    first.notifyEnemyResolved(12);
    const nextLevelSpawns = enemySpawnEvents([
      ...first.startNextLevel(),
      ...first.update(1_100),
    ]);
    expect(nextLevelSpawns.map((event) => event.levelSpawnOrdinal)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(nextLevelSpawns.map((event) => event.campaignSpawnOrdinal)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 13),
    );
    expect(nextLevelSpawns.map((event) => event.spawnPoint)).toEqual(
      nextLevelSpawns.map((_, index) => spawnPoints[index % spawnPoints.length]),
    );
  });

  it('returns to build after every endless level and never starts one automatically', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN);

    const completionEvents = finishCurrentLevel(system, PROTOTYPE_CAMPAIGN);
    expect(eventTypes(completionEvents)).toEqual(['level-completed']);
    expect(completionEvents[0]).toMatchObject({
      levelNumber: 1,
      levelId: 'level-1',
    });
    expect(system.phase).toBe('build');
    expect(system.isComplete).toBe(false);
    expect(system.completedLevelCount).toBe(1);
    expect(system.nextLevelNumber).toBe(2);

    expect(system.update(1_000_000)).toEqual([]);
    expect(system.currentLevelNumber).toBe(1);
    expect(eventTypes(system.startNextLevel())).toEqual([
      'level-started',
      'enemy-spawn',
    ]);
    expect(system.currentLevelNumber).toBe(2);
  });

  it('cycles each level across its own spawn points from the first point', () => {
    const spawnPoints = Object.freeze([
      Object.freeze({ x: 0, y: 1 }),
      Object.freeze({ x: 2, y: 1 }),
    ]);
    const campaign: CampaignDefinition = Object.freeze({
      id: 'spawn-cycle',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: null,
      getLevel: (levelNumber: number) => Object.freeze({
        id: `level-${levelNumber}`,
        groups: Object.freeze([
          Object.freeze({ enemyType: 'weak' as const, count: 4 }),
        ]),
        spawnPoints,
      }),
    });
    const system = new LevelSystem(campaign);

    const events = [...system.startNextLevel(), ...system.update(300)];
    const spawns = events.filter(
      (event): event is Extract<LevelSystemEvent, { type: 'enemy-spawn' }> => (
        event.type === 'enemy-spawn'
      ),
    );
    expect(spawns.map((event) => event.spawnPoint)).toEqual([
      spawnPoints[0],
      spawnPoints[1],
      spawnPoints[0],
      spawnPoints[1],
    ]);
  });

  it('can start a huge lazy level without materializing its full queue', () => {
    const spawnPoints = Object.freeze([Object.freeze({ x: 1, y: 2 })]);
    const campaign: CampaignDefinition = Object.freeze({
      id: 'huge-lazy-level',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: null,
      getLevel: (levelNumber: number) => Object.freeze({
        id: `level-${levelNumber}`,
        groups: Object.freeze([
          Object.freeze({
            enemyType: 'weak' as const,
            count: Number.MAX_SAFE_INTEGER,
          }),
        ]),
        spawnPoints,
      }),
    });
    const system = new LevelSystem(campaign);

    expect(eventTypes(system.startNextLevel())).toEqual([
      'level-started',
      'enemy-spawn',
    ]);
    expect(system.pendingSpawnCount).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(system.activeEnemyCount).toBe(1);
  });

  it('still supports a finite campaign for isolated simulations', () => {
    const level = createLevelDefinition(1, 3, 3);
    const finiteCampaign: CampaignDefinition = Object.freeze({
      id: 'finite-test',
      width: 3,
      height: 3,
      core: Object.freeze({ x: 1, y: 1 }),
      spawnPoints: level.spawnPoints,
      spawnIntervalMs: 100,
      maxLevel: 1,
      getLevel: () => level,
    });
    const system = new LevelSystem(finiteCampaign);

    const completionEvents = finishCurrentLevel(system, finiteCampaign);
    expect(eventTypes(completionEvents)).toEqual([
      'level-completed',
      'campaign-completed',
    ]);
    expect(system.phase).toBe('completed');
    expect(system.isComplete).toBe(true);
    expect(system.nextLevelNumber).toBeNull();
  });

  it('rejects invalid time deltas, generated levels, and resolution counts', () => {
    const system = new LevelSystem(PROTOTYPE_CAMPAIGN);

    expect(() => system.update(-1)).toThrow(RangeError);
    expect(() => system.update(Number.NaN)).toThrow(RangeError);
    expect(() => system.notifyEnemyResolved(1)).toThrow(RangeError);

    system.startNextLevel();
    expect(() => system.notifyEnemyResolved(0)).toThrow(RangeError);
    expect(() => system.notifyEnemyResolved(2)).toThrow(RangeError);

    const invalidCampaign: CampaignDefinition = Object.freeze({
      ...PROTOTYPE_CAMPAIGN,
      getLevel: () => Object.freeze({
        id: 'invalid',
        groups: Object.freeze([]),
        spawnPoints: PROTOTYPE_CAMPAIGN.spawnPoints,
      }),
    });
    expect(() => new LevelSystem(invalidCampaign).peekNextLevel()).toThrow(RangeError);
  });
});
