import { describe, expect, it } from 'vitest';

import {
  CELL_SIZE,
  CORE_POSITION,
  GRID_HEIGHT,
  GRID_WIDTH,
  SPAWN_POINTS,
} from '../../src/config/gameConfig';
import { GridModel } from '../../src/domain/grid/GridModel';
import { WALL_MAX_HP } from '../../src/domain/structures/Wall';

describe('GridModel', () => {
  it('uses a 36 by 36 grid made of 30 pixel cells', () => {
    expect(GRID_WIDTH).toBe(36);
    expect(GRID_HEIGHT).toBe(36);
    expect(CELL_SIZE).toBe(30);
    expect(GRID_WIDTH * CELL_SIZE).toBe(1080);
    expect(GRID_HEIGHT * CELL_SIZE).toBe(1080);
  });

  it('marks all 140 outer-edge cells as unbuildable', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    let edgeCells = 0;
    let initiallyBuildableInteriorCells = 0;

    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        const point = { x, y };
        if (grid.isEdge(point)) {
          edgeCells += 1;
          expect(grid.isBuildable(point)).toBe(false);
        } else if (grid.isBuildable(point)) {
          initiallyBuildableInteriorCells += 1;
        }
      }
    }

    expect(edgeCells).toBe(140);
    expect(initiallyBuildableInteriorCells).toBe(34 * 34 - 1);
  });

  it('replaces spawn points with a validated detached edge-cell set', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const nextSpawnPoints = [
      { x: 0, y: 5 },
      { x: GRID_WIDTH - 1, y: 17 },
    ];

    expect(grid.setSpawnPoints(nextSpawnPoints)).toBe(true);
    expect(grid.revision).toBe(0);
    expect(grid.spawnPoints).toEqual(nextSpawnPoints);
    expect(grid.snapshot().spawnPoints).toEqual(nextSpawnPoints);

    nextSpawnPoints[0]!.y = 9;
    expect(grid.spawnPoints[0]).toEqual({ x: 0, y: 5 });
    expect(grid.setSpawnPoints(grid.spawnPoints)).toBe(false);
    expect(grid.revision).toBe(0);

    expect(() => grid.setSpawnPoints([])).toThrow('At least one spawn point');
    expect(() => grid.setSpawnPoints([{ x: 4, y: 4 }])).toThrow(
      'grid-edge cell',
    );
    expect(() =>
      grid.setSpawnPoints([
        { x: 0, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).toThrow('Duplicate spawn point');
  });

  it('tracks wall occupancy and changes revision for navigation-relevant wall changes', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const wallPoint = { x: 4, y: 5 };

    expect(WALL_MAX_HP).toBe(100);
    expect(grid.revision).toBe(0);
    expect(grid.placeWall(CORE_POSITION)).toBe(false);
    expect(grid.placeWall(SPAWN_POINTS[0]!)).toBe(false);
    expect(grid.placeWall(wallPoint)).toBe(true);
    expect(grid.revision).toBe(1);
    expect(grid.hasWall(wallPoint)).toBe(true);
    expect(grid.wallHpAt(wallPoint)).toBe(WALL_MAX_HP);
    expect(grid.getWall(wallPoint)).toEqual({
      id: 'wall:4:5',
      position: wallPoint,
      hp: WALL_MAX_HP,
      maxHp: WALL_MAX_HP,
    });

    expect(grid.placeWall(wallPoint)).toBe(false);
    expect(grid.revision).toBe(1);

    const firstHit = grid.damageWall(wallPoint, 25);
    expect(firstHit).toEqual({
      previousHp: 100,
      appliedDamage: 25,
      remainingHp: 75,
      destroyed: false,
    });
    expect(grid.revision).toBe(1);

    const stableSnapshot = grid.snapshot();
    const destroyed = grid.damageWall(wallPoint, 100);
    expect(destroyed.destroyed).toBe(true);
    expect(grid.hasWall(wallPoint)).toBe(false);
    expect(grid.revision).toBe(2);
    expect(stableSnapshot.wallHp[grid.indexOf(wallPoint)]).toBe(75);

    expect(grid.placeWall(wallPoint, 50)).toBe(true);
    expect(grid.revision).toBe(3);
    expect(grid.removeWall(wallPoint)).toBe(true);
    expect(grid.removeWall(wallPoint)).toBe(false);
    expect(grid.revision).toBe(4);
  });

  it('adds the tower bonus to both current and maximum wall health', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const wallPoint = { x: 7, y: 8 };

    expect(grid.addWallHpBonus(wallPoint, 50)).toBe(false);
    expect(grid.placeWall(wallPoint)).toBe(true);
    grid.damageWall(wallPoint, 10);

    expect(grid.addWallHpBonus(wallPoint, 50)).toBe(true);
    expect(grid.getWall(wallPoint)).toMatchObject({ hp: 140, maxHp: 150 });
    expect(grid.snapshot().wallHp[grid.indexOf(wallPoint)]).toBe(140);
    expect(grid.revision).toBe(2);
  });

  it('adds one HP bonus to every standing wall in one revision', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const damagedPoint = { x: 7, y: 8 };
    const fullPoint = { x: 9, y: 10 };

    expect(grid.addHpBonusToAllWalls(50)).toBe(0);
    expect(grid.revision).toBe(0);
    expect(grid.placeWall(damagedPoint)).toBe(true);
    expect(grid.placeWall(fullPoint)).toBe(true);
    grid.damageWall(damagedPoint, 10);
    const revisionBeforeBonus = grid.revision;

    expect(grid.addHpBonusToAllWalls(50)).toBe(2);
    expect(grid.getWall(damagedPoint)).toMatchObject({ hp: 140, maxHp: 150 });
    expect(grid.getWall(fullPoint)).toMatchObject({ hp: 150, maxHp: 150 });
    expect(grid.revision).toBe(revisionBeforeBonus + 1);
  });

  it('restores every damaged standing wall without reviving destroyed walls', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const ordinaryPoint = { x: 7, y: 8 };
    const reinforcedPoint = { x: 9, y: 10 };
    const destroyedPoint = { x: 11, y: 12 };

    expect(grid.placeWall(ordinaryPoint)).toBe(true);
    expect(grid.placeWall(reinforcedPoint)).toBe(true);
    expect(grid.addWallHpBonus(reinforcedPoint, 50)).toBe(true);
    expect(grid.placeWall(destroyedPoint)).toBe(true);
    grid.damageWall(ordinaryPoint, 35);
    grid.damageWall(reinforcedPoint, 60);
    grid.damageWall(destroyedPoint, WALL_MAX_HP);
    const revisionBeforeRestore = grid.revision;

    expect(grid.restoreAllWallsToMaxHp()).toBe(2);
    expect(grid.getWall(ordinaryPoint)).toMatchObject({ hp: 100, maxHp: 100 });
    expect(grid.getWall(reinforcedPoint)).toMatchObject({ hp: 150, maxHp: 150 });
    expect(grid.getWall(destroyedPoint)).toBeNull();
    expect(grid.hasDebris(destroyedPoint)).toBe(true);
    expect(grid.revision).toBe(revisionBeforeRestore + 1);

    expect(grid.restoreAllWallsToMaxHp()).toBe(0);
    expect(grid.revision).toBe(revisionBeforeRestore + 1);
  });

  it('rejects an overflowing bulk wall bonus atomically', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const ordinaryPoint = { x: 6, y: 7 };
    const nearLimitPoint = { x: 8, y: 9 };

    expect(grid.placeWall(ordinaryPoint)).toBe(true);
    expect(grid.placeWall(nearLimitPoint, 32_730)).toBe(true);
    grid.damageWall(ordinaryPoint, 10);
    const revisionBeforeBonus = grid.revision;
    const ordinaryBefore = grid.getWall(ordinaryPoint);
    const nearLimitBefore = grid.getWall(nearLimitPoint);

    expect(() => grid.addHpBonusToAllWalls(50)).toThrow(RangeError);
    expect(grid.getWall(ordinaryPoint)).toEqual(ordinaryBefore);
    expect(grid.getWall(nearLimitPoint)).toEqual(nearLimitBefore);
    expect(grid.revision).toBe(revisionBeforeBonus);
  });

  it('persists navigable debris until a wall is rebuilt on the cell', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const point = { x: 6, y: 6 };

    expect(grid.markDebris(CORE_POSITION)).toBe(false);
    expect(grid.markDebris(SPAWN_POINTS[0]!)).toBe(false);
    expect(grid.placeWall(point)).toBe(true);
    expect(grid.damageWall(point, WALL_MAX_HP).destroyed).toBe(true);
    expect(grid.hasDebris(point)).toBe(true);
    expect(grid.markDebris(point)).toBe(false);
    expect(grid.revision).toBe(2);
    expect(grid.hasDebris(point)).toBe(true);
    expect(grid.hasWall(point)).toBe(false);
    expect(grid.isBuildable(point)).toBe(true);

    const debrisSnapshot = grid.snapshot();
    const index = grid.indexOf(point);
    debrisSnapshot.debris[index] = 0;
    expect(grid.hasDebris(point)).toBe(true);
    const stableSnapshot = grid.snapshot();

    expect(grid.placeWall(point)).toBe(true);
    expect(grid.revision).toBe(3);
    expect(grid.hasWall(point)).toBe(true);
    expect(grid.hasDebris(point)).toBe(false);
    expect(stableSnapshot.debris[index]).toBe(1);
  });

  it('clears debris explicitly and revisions only real terrain changes', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const point = { x: 9, y: 9 };

    expect(grid.clearDebris(point)).toBe(false);
    expect(grid.revision).toBe(0);
    expect(grid.markDebris(point)).toBe(true);
    expect(grid.revision).toBe(1);
    expect(grid.clearDebris(point)).toBe(true);
    expect(grid.revision).toBe(2);
    expect(grid.clearDebris(point)).toBe(false);
    expect(grid.revision).toBe(2);
  });

  it('returns snapshots detached from later model and consumer mutations', () => {
    const grid = new GridModel(GRID_WIDTH, GRID_HEIGHT, CORE_POSITION, SPAWN_POINTS);
    const wallPoint = { x: 2, y: 2 };
    const debrisPoint = { x: 3, y: 3 };
    grid.placeWall(wallPoint);
    grid.markDebris(debrisPoint);

    const first = grid.snapshot();
    const wallIndex = grid.indexOf(wallPoint);
    const debrisIndex = grid.indexOf(debrisPoint);
    first.wallHp[wallIndex] = 7;
    first.debris[debrisIndex] = 0;

    expect(grid.wallHpAt(wallPoint)).toBe(WALL_MAX_HP);
    expect(grid.hasDebris(debrisPoint)).toBe(true);
    const second = grid.snapshot();
    expect(second.wallHp[wallIndex]).toBe(WALL_MAX_HP);
    expect(second.debris[debrisIndex]).toBe(1);

    grid.damageWall(wallPoint, 10);
    grid.clearDebris(debrisPoint);
    expect(second.wallHp[wallIndex]).toBe(WALL_MAX_HP);
    expect(second.debris[debrisIndex]).toBe(1);
  });
});
