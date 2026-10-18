import { describe, expect, it } from 'vitest';
import type { NavigationProfile } from '../../src/domain/enemies/NavigationProfile';
import {
  FlowDirection,
  type FlowField,
} from '../../src/navigation/FlowField';
import {
  GraphlibFlowFieldService,
} from '../../src/navigation/GraphlibFlowFieldService';
import type { NavigationCostSnapshot } from '../../src/navigation/NavigationCostSnapshot';

interface WallPlacement {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
}

interface DebrisPlacement {
  readonly x: number;
  readonly y: number;
}

interface TowerExposurePlacement {
  readonly x: number;
  readonly y: number;
}

const weakProfile: NavigationProfile = {
  id: 'weak',
  cellsPerSecond: 1,
  damagePerHit: 0,
  attackIntervalMs: 1_000,
};

const strongProfile: NavigationProfile = {
  id: 'strong',
  cellsPerSecond: 0.5,
  damagePerHit: 10,
  attackIntervalMs: 100,
};

function createSnapshot(
  width: number,
  height: number,
  core: { readonly x: number; readonly y: number },
  walls: readonly WallPlacement[] = [],
  debrisPlacements: readonly DebrisPlacement[] = [],
  towerExposurePlacements: readonly TowerExposurePlacement[] = [],
): NavigationCostSnapshot {
  const wallHp = new Int16Array(width * height);
  for (const wall of walls) {
    wallHp[wall.y * width + wall.x] = wall.hp;
  }
  const debris = new Uint8Array(width * height);
  for (const placement of debrisPlacements) {
    debris[placement.y * width + placement.x] = 1;
  }
  const towerExposure = new Uint8Array(width * height);
  for (const placement of towerExposurePlacements) {
    towerExposure[placement.y * width + placement.x] = 1;
  }

  return {
    width,
    height,
    revision: 1,
    core,
    spawnPoints: [{ x: 0, y: 0 }],
    wallHp,
    debris,
    towerExposure,
  };
}

function createLongSafeWallRouteSnapshot(): NavigationCostSnapshot {
  const width = 36;
  const height = 36;
  const core = { x: 18, y: 18 };
  const safeCells = new Set<string>();

  for (let x = 18; x < width; x += 1) {
    safeCells.add(`${x},35`);
    safeCells.add(`${x},18`);
  }
  for (let y = 18; y < height; y += 1) {
    safeCells.add(`35,${y}`);
  }

  const walls = Array.from({ length: 10 }, (_, index) => ({
    x: 20 + index,
    y: 35,
    hp: 10,
  }));
  const towerExposure: TowerExposurePlacement[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!safeCells.has(`${x},${y}`)) {
        towerExposure.push({ x, y });
      }
    }
  }

  return createSnapshot(
    width,
    height,
    core,
    walls,
    [],
    towerExposure,
  );
}

function createAllRoutesExposedSnapshot(): NavigationCostSnapshot {
  const width = 36;
  const height = 36;
  const core = { x: 18, y: 18 };
  const openCells = new Set<string>();

  for (let y = 18; y < height; y += 1) {
    openCells.add(`18,${y}`);
    openCells.add(`29,${y}`);
  }
  for (let x = 18; x <= 29; x += 1) {
    openCells.add(`${x},18`);
    openCells.add(`${x},35`);
  }

  const walls: WallPlacement[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!openCells.has(`${x},${y}`)) {
        walls.push({ x, y, hp: 1 });
      }
    }
  }

  return createSnapshot(
    width,
    height,
    core,
    walls,
    [],
    [
      { x: 18, y: 34 },
      { x: 18, y: 33 },
      { x: 19, y: 35 },
    ],
  );
}

function moveIndex(field: FlowField, index: number): number {
  const direction = field.nextDirection[index];
  switch (direction) {
    case FlowDirection.Up:
      return index - field.width;
    case FlowDirection.Right:
      return index + 1;
    case FlowDirection.Down:
      return index + field.width;
    case FlowDirection.Left:
      return index - 1;
    default:
      return index;
  }
}

function traceRoute(
  field: FlowField,
  startIndex: number,
  coreIndex: number,
): readonly number[] {
  const route: number[] = [];
  let current = startIndex;

  for (let step = 0; step < field.nextDirection.length; step += 1) {
    if (current === coreIndex) {
      return route;
    }
    const next = moveIndex(field, current);
    if (next === current) {
      throw new Error(`Route became stuck at index ${current}.`);
    }
    route.push(next);
    current = next;
  }

  throw new Error('Route did not reach the core without looping.');
}

function normalizedPhysicalScore(
  physicalTimeMs: number,
  maxFinitePhysicalEnterCost: number,
  cellCount: number,
): number {
  return (
    physicalTimeMs
    / maxFinitePhysicalEnterCost
    / (4 * cellCount)
  );
}

describe('GraphlibFlowFieldService', () => {
  it('points every cell of an empty grid toward the core', () => {
    const snapshot = createSnapshot(5, 5, { x: 2, y: 2 });
    const service = new GraphlibFlowFieldService();
    const field = service.build(snapshot, weakProfile);
    const coreIndex = snapshot.core.y * snapshot.width + snapshot.core.x;

    for (let start = 0; start < field.nextDirection.length; start += 1) {
      let current = start;
      for (
        let step = 0;
        current !== coreIndex && step < field.nextDirection.length;
        step += 1
      ) {
        expect(field.nextDirection[current]).not.toBe(FlowDirection.None);
        const next = moveIndex(field, current);
        expect(next).not.toBe(current);
        current = next;
      }
      expect(current).toBe(coreIndex);
    }

    expect(field.costToCore[coreIndex]).toBe(0);
    expect(field.nextDirection[coreIndex]).toBe(FlowDirection.None);
    expect(service.solverInvocationCount).toBe(1);
  });

  it('treats a wall as a blocker for a profile with zero wall damage', () => {
    const snapshot = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [{ x: 1, y: 0, hp: 100 }],
    );
    const field = new GraphlibFlowFieldService().build(snapshot, weakProfile);

    expect(field.costToCore[0]).toBe(Number.POSITIVE_INFINITY);
    expect(field.costToCore[1]).toBe(Number.POSITIVE_INFINITY);
    expect(field.nextDirection[0]).toBe(FlowDirection.None);
    expect(field.nextDirection[1]).toBe(FlowDirection.None);
  });

  it('routes a weak profile around a wall and a strong profile through it', () => {
    const snapshot = createSnapshot(
      5,
      3,
      { x: 4, y: 1 },
      [{ x: 2, y: 1, hp: 10 }],
    );
    const service = new GraphlibFlowFieldService();
    const fields = service.buildAll(snapshot, [weakProfile, strongProfile]);
    const weakField = fields.get(weakProfile.id);
    const strongField = fields.get(strongProfile.id);
    const leftOfWall = 1 * snapshot.width + 1;

    expect(weakField).toBeDefined();
    expect(strongField).toBeDefined();
    expect(weakField?.nextDirection[leftOfWall]).toBe(FlowDirection.Up);
    expect(strongField?.nextDirection[leftOfWall]).toBe(FlowDirection.Right);
    expect(service.solverInvocationCount).toBe(2);
  });

  it('prices an instant wall break as zero break time', () => {
    const profile: NavigationProfile = {
      id: 'roach-ground',
      cellsPerSecond: 2,
      damagePerHit: 4,
      attackIntervalMs: 1_000,
      instantWallBreak: true,
    };
    const snapshot = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [{ x: 1, y: 0, hp: 32_000 }],
    );
    const field = new GraphlibFlowFieldService().build(snapshot, profile);

    expect(field.costToCore).toBeInstanceOf(Float64Array);
    expect(field.costToCore[2]).toBe(0);
    expect(field.costToCore[1]).toBeCloseTo(
      normalizedPhysicalScore(500, 500, 3),
    );
    expect(field.costToCore[0]).toBeCloseTo(
      normalizedPhysicalScore(1_000, 500, 3),
    );
    expect(field.nextDirection[0]).toBe(FlowDirection.Right);
  });

  it('charges twice the ordinary movement time when entering debris for every profile', () => {
    const snapshot = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [],
      [{ x: 1, y: 0 }],
    );
    const fields = new GraphlibFlowFieldService().buildAll(
      snapshot,
      [weakProfile, strongProfile],
    );

    expect(fields.get(weakProfile.id)?.costToCore[1]).toBeCloseTo(
      normalizedPhysicalScore(1_000, 2_000, 3),
    );
    expect(fields.get(weakProfile.id)?.costToCore[0]).toBeCloseTo(
      normalizedPhysicalScore(3_000, 2_000, 3),
    );
    expect(fields.get(strongProfile.id)?.costToCore[1]).toBeCloseTo(
      normalizedPhysicalScore(2_000, 4_000, 3),
    );
    expect(fields.get(strongProfile.id)?.costToCore[0]).toBeCloseTo(
      normalizedPhysicalScore(6_000, 4_000, 3),
    );
  });

  it('routes around a long debris patch when its doubled traversal cost is slower', () => {
    const debris = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ];
    const clearSnapshot = createSnapshot(6, 3, { x: 5, y: 1 });
    const debrisSnapshot = createSnapshot(
      6,
      3,
      { x: 5, y: 1 },
      [],
      debris,
    );
    const service = new GraphlibFlowFieldService();
    const clearField = service.build(clearSnapshot, weakProfile);
    const debrisField = service.build(debrisSnapshot, weakProfile);
    const startIndex = debrisSnapshot.width;

    expect(clearField.nextDirection[startIndex]).toBe(FlowDirection.Right);
    expect(debrisField.nextDirection[startIndex]).toBe(FlowDirection.Up);
    expect(debrisField.costToCore[startIndex]).toBeCloseTo(
      normalizedPhysicalScore(7_000, 2_000, 18),
    );
  });

  it('deduplicates shared profiles and exposes the same field object', () => {
    const snapshot = createSnapshot(3, 3, { x: 1, y: 1 });
    const duplicateProfile = { ...strongProfile };
    const service = new GraphlibFlowFieldService();
    const fields = service.buildAll(snapshot, [strongProfile, duplicateProfile]);
    const firstEnemyDefinition = { navigationProfileId: strongProfile.id };
    const secondEnemyDefinition = { navigationProfileId: duplicateProfile.id };

    expect(fields.size).toBe(1);
    expect(fields.get(firstEnemyDefinition.navigationProfileId)).toBe(
      fields.get(secondEnemyDefinition.navigationProfileId),
    );
    expect(service.solverInvocationCount).toBe(1);
  });

  it('allows one thousand reads without invoking the solver again', () => {
    const snapshot = createSnapshot(10, 10, { x: 5, y: 5 });
    const service = new GraphlibFlowFieldService();
    const field = service.build(snapshot, strongProfile);
    const invocationsAfterBuild = service.solverInvocationCount;
    let checksum = 0;

    for (let unit = 0; unit < 1_000; unit += 1) {
      checksum += field.nextDirection[unit % field.nextDirection.length] ?? 0;
    }

    expect(checksum).toBeGreaterThan(0);
    expect(service.solverInvocationCount).toBe(invocationsAfterBuild);
  });

  it('uses the forward cost of entering a cell during reverse search', () => {
    const asymmetricProfile: NavigationProfile = {
      id: 'asymmetric',
      cellsPerSecond: 2,
      damagePerHit: 6,
      attackIntervalMs: 100,
    };
    const snapshot = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [{ x: 1, y: 0, hp: 11 }],
    );
    const field = new GraphlibFlowFieldService().build(
      snapshot,
      asymmetricProfile,
    );

    expect(field.costToCore[2]).toBe(0);
    expect(field.costToCore[1]).toBeCloseTo(
      normalizedPhysicalScore(500, 700, 3),
    );
    expect(field.costToCore[0]).toBeCloseTo(
      normalizedPhysicalScore(1_200, 700, 3),
    );
    expect(field.nextDirection[0]).toBe(FlowDirection.Right);
  });

  it('breaks equal-cost direction ties in Up, Right, Down, Left order', () => {
    const snapshot = createSnapshot(3, 3, { x: 1, y: 1 });
    const field = new GraphlibFlowFieldService().build(snapshot, weakProfile);

    expect(field.nextDirection[0]).toBe(FlowDirection.Right);
    expect(field.nextDirection[8]).toBe(FlowDirection.Up);
  });

  it('prefers the safer branch when two physical routes have equal length', () => {
    const clearSnapshot = createSnapshot(3, 3, { x: 2, y: 2 });
    const exposedSnapshot = createSnapshot(
      3,
      3,
      { x: 2, y: 2 },
      [],
      [],
      [{ x: 1, y: 0 }],
    );
    const service = new GraphlibFlowFieldService();
    const clearField = service.build(clearSnapshot, weakProfile);
    const exposedField = service.build(exposedSnapshot, weakProfile);

    expect(clearField.nextDirection[0]).toBe(FlowDirection.Right);
    expect(exposedField.nextDirection[0]).toBe(FlowDirection.Down);
  });

  it('takes a zero-exposure half-arena detour through ten walls over a short exposed route', () => {
    const snapshot = createLongSafeWallRouteSnapshot();
    const field = new GraphlibFlowFieldService().build(snapshot, strongProfile);
    const spawnIndex = 35 * snapshot.width + 18;
    const coreIndex = snapshot.core.y * snapshot.width + snapshot.core.x;
    const route = traceRoute(field, spawnIndex, coreIndex);

    expect(field.nextDirection[spawnIndex]).toBe(FlowDirection.Right);
    expect(route[route.length - 1]).toBe(coreIndex);
    expect(
      route.filter((index) => snapshot.towerExposure[index] === 1),
    ).toHaveLength(0);
    expect(route.filter((index) => (snapshot.wallHp[index] ?? 0) > 0)).toHaveLength(10);
  });

  it('minimizes exposed destinations before physical distance when every route is exposed', () => {
    const snapshot = createAllRoutesExposedSnapshot();
    const field = new GraphlibFlowFieldService().build(snapshot, weakProfile);
    const spawnIndex = 35 * snapshot.width + 18;
    const coreIndex = snapshot.core.y * snapshot.width + snapshot.core.x;
    const route = traceRoute(field, spawnIndex, coreIndex);

    expect(field.nextDirection[spawnIndex]).toBe(FlowDirection.Right);
    expect(route[route.length - 1]).toBe(coreIndex);
    expect(
      route.filter((index) => snapshot.towerExposure[index] === 1),
    ).toHaveLength(1);
  });

  it('uses physical movement and wall-break time after exposure counts tie', () => {
    const towerExposure = [{ x: 4, y: 1 }];
    const cheapWall = createSnapshot(
      5,
      3,
      { x: 4, y: 1 },
      [{ x: 2, y: 1, hp: 10 }],
      [],
      towerExposure,
    );
    const expensiveWall = createSnapshot(
      5,
      3,
      { x: 4, y: 1 },
      [{ x: 2, y: 1, hp: 500 }],
      [],
      towerExposure,
    );
    const service = new GraphlibFlowFieldService();
    const cheapField = service.build(cheapWall, strongProfile);
    const expensiveField = service.build(expensiveWall, strongProfile);
    const forkIndex = 1 * cheapWall.width + 1;

    expect(cheapField.nextDirection[forkIndex]).toBe(FlowDirection.Right);
    expect(expensiveField.nextDirection[forkIndex]).toBe(FlowDirection.Up);
  });

  it('encodes exposure before normalized physical cost only for finite destinations', () => {
    const exposedDebris = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [],
      [{ x: 1, y: 0 }],
      [{ x: 1, y: 0 }],
    );
    const exposedWall = createSnapshot(
      3,
      1,
      { x: 2, y: 0 },
      [{ x: 1, y: 0, hp: 10 }],
      [],
      [{ x: 1, y: 0 }],
    );
    const service = new GraphlibFlowFieldService();
    const weakField = service.build(exposedDebris, weakProfile);
    const strongField = service.build(exposedWall, strongProfile);
    const weakMovementMs = 1_000 / weakProfile.cellsPerSecond;
    const strongMovementMs = 1_000 / strongProfile.cellsPerSecond;
    const cellCount = 3;
    const weakMaxPhysicalCost = weakMovementMs * 2;
    const strongWallPhysicalCost = (
      strongMovementMs + strongProfile.attackIntervalMs
    );

    expect(weakField.costToCore).toBeInstanceOf(Float64Array);
    expect(weakField.costToCore[0]).toBeCloseTo(
      1 + normalizedPhysicalScore(
        weakMovementMs * 3,
        weakMaxPhysicalCost,
        cellCount,
      ),
    );
    expect(strongField.costToCore).toBeInstanceOf(Float64Array);
    expect(strongField.costToCore[0]).toBeCloseTo(
      1 + normalizedPhysicalScore(
        strongWallPhysicalCost + strongMovementMs,
        strongWallPhysicalCost,
        cellCount,
      ),
    );

    const blockedField = service.build(exposedWall, weakProfile);
    expect(blockedField.costToCore[0]).toBe(Number.POSITIVE_INFINITY);
  });

  it('rejects malformed tower-exposure overlays', () => {
    const snapshot = createSnapshot(3, 3, { x: 1, y: 1 });
    const service = new GraphlibFlowFieldService();

    expect(() => service.build({
      ...snapshot,
      towerExposure: new Uint8Array(8),
    }, weakProfile)).toThrow('towerExposure length');

    const invalidExposure = new Uint8Array(snapshot.towerExposure);
    invalidExposure[0] = 2;
    expect(() => service.build({
      ...snapshot,
      towerExposure: invalidExposure,
    }, weakProfile)).toThrow('Tower exposure entries');
  });
});
