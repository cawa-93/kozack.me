import { WALL_MAX_HP, type Wall, wallIdAt } from '../structures/Wall';
import { copyGridPoint, sameGridPoint, type GridPoint } from './GridPoint';
import type { GridSnapshot } from './GridSnapshot';

export interface WallDamageResult {
  readonly previousHp: number;
  readonly appliedDamage: number;
  readonly remainingHp: number;
  readonly destroyed: boolean;
}

export class GridModel {
  readonly width: number;
  readonly height: number;

  private revisionValue = 0;
  private readonly corePoint: GridPoint;
  private spawnPointList: readonly GridPoint[];
  private readonly wallHp: Int16Array;
  private readonly wallMaxHp: Int16Array;
  private readonly debris: Uint8Array;

  constructor(
    width: number,
    height: number,
    core: GridPoint,
    spawnPoints: readonly GridPoint[],
  ) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 3 || height < 3) {
      throw new RangeError('Grid dimensions must be integers of at least 3 cells.');
    }

    if (!Number.isSafeInteger(width * height)) {
      throw new RangeError('Grid dimensions are too large.');
    }

    this.width = width;
    this.height = height;

    if (!this.isInside(core) || this.isEdge(core)) {
      throw new RangeError('The core must occupy an interior grid cell.');
    }

    this.corePoint = copyGridPoint(core);
    this.spawnPointList = this.copyValidatedSpawnPoints(spawnPoints);
    this.wallHp = new Int16Array(width * height);
    this.wallMaxHp = new Int16Array(width * height);
    this.debris = new Uint8Array(width * height);
  }

  get revision(): number {
    return this.revisionValue;
  }

  get core(): GridPoint {
    return this.corePoint;
  }

  get spawnPoints(): readonly GridPoint[] {
    return this.spawnPointList;
  }

  setSpawnPoints(spawnPoints: readonly GridPoint[]): boolean {
    const nextSpawnPoints = this.copyValidatedSpawnPoints(spawnPoints);
    if (
      nextSpawnPoints.length === this.spawnPointList.length
      && nextSpawnPoints.every((point, index) =>
        sameGridPoint(point, this.spawnPointList[index] ?? point))
    ) {
      return false;
    }

    this.spawnPointList = nextSpawnPoints;
    return true;
  }

  isInside(point: GridPoint): boolean {
    return (
      Number.isInteger(point.x)
      && Number.isInteger(point.y)
      && point.x >= 0
      && point.x < this.width
      && point.y >= 0
      && point.y < this.height
    );
  }

  isEdge(point: GridPoint): boolean {
    return (
      this.isInside(point)
      && (point.x === 0 || point.x === this.width - 1 || point.y === 0 || point.y === this.height - 1)
    );
  }

  indexOf(point: GridPoint): number {
    if (!this.isInside(point)) {
      throw new RangeError(`Grid point is out of bounds: (${point.x}, ${point.y}).`);
    }

    return point.y * this.width + point.x;
  }

  isBuildable(point: GridPoint): boolean {
    return (
      this.isInside(point)
      && !this.isEdge(point)
      && !sameGridPoint(point, this.corePoint)
      && !this.hasWall(point)
    );
  }

  hasWall(point: GridPoint): boolean {
    if (!this.isInside(point)) {
      return false;
    }

    return (this.wallHp[this.indexOf(point)] ?? 0) > 0;
  }

  wallHpAt(point: GridPoint): number {
    return this.wallHp[this.indexOf(point)] ?? 0;
  }

  hasDebris(point: GridPoint): boolean {
    if (!this.isInside(point)) {
      return false;
    }

    return (this.debris[this.indexOf(point)] ?? 0) === 1;
  }

  markDebris(point: GridPoint): boolean {
    if (!this.isBuildable(point) || this.hasDebris(point)) {
      return false;
    }

    this.debris[this.indexOf(point)] = 1;
    this.revisionValue += 1;
    return true;
  }

  clearDebris(point: GridPoint): boolean {
    if (!this.hasDebris(point)) {
      return false;
    }

    this.debris[this.indexOf(point)] = 0;
    this.revisionValue += 1;
    return true;
  }

  getWall(point: GridPoint): Wall | null {
    if (!this.hasWall(point)) {
      return null;
    }

    const index = this.indexOf(point);
    return Object.freeze({
      id: wallIdAt(point),
      position: copyGridPoint(point),
      hp: this.wallHp[index] ?? 0,
      maxHp: this.wallMaxHp[index] ?? 0,
    });
  }

  placeWall(point: GridPoint, maxHp = WALL_MAX_HP): boolean {
    this.assertValidWallHp(maxHp);

    if (!this.isBuildable(point)) {
      return false;
    }

    const index = this.indexOf(point);
    this.wallHp[index] = maxHp;
    this.wallMaxHp[index] = maxHp;
    this.debris[index] = 0;
    this.revisionValue += 1;
    return true;
  }

  addWallHpBonus(point: GridPoint, bonusHp: number): boolean {
    if (!Number.isSafeInteger(bonusHp) || bonusHp <= 0) {
      throw new RangeError('Wall HP bonus must be a positive integer.');
    }
    if (!this.hasWall(point)) {
      return false;
    }

    const index = this.indexOf(point);
    const nextHp = (this.wallHp[index] ?? 0) + bonusHp;
    const nextMaxHp = (this.wallMaxHp[index] ?? 0) + bonusHp;
    this.assertValidWallHp(nextHp);
    this.assertValidWallHp(nextMaxHp);
    this.wallHp[index] = nextHp;
    this.wallMaxHp[index] = nextMaxHp;
    this.revisionValue += 1;
    return true;
  }

  /** Adds the same current/max HP bonus to every standing wall atomically. */
  addHpBonusToAllWalls(bonusHp: number): number {
    if (!Number.isSafeInteger(bonusHp) || bonusHp <= 0) {
      throw new RangeError('Wall HP bonus must be a positive integer.');
    }

    const liveIndexes: number[] = [];
    for (let index = 0; index < this.wallHp.length; index += 1) {
      const hp = this.wallHp[index] ?? 0;
      if (hp <= 0) {
        continue;
      }

      this.assertValidWallHp(hp + bonusHp);
      this.assertValidWallHp((this.wallMaxHp[index] ?? 0) + bonusHp);
      liveIndexes.push(index);
    }

    if (liveIndexes.length === 0) {
      return 0;
    }

    for (const index of liveIndexes) {
      this.wallHp[index] = (this.wallHp[index] ?? 0) + bonusHp;
      this.wallMaxHp[index] = (this.wallMaxHp[index] ?? 0) + bonusHp;
    }
    this.revisionValue += 1;
    return liveIndexes.length;
  }

  /** Restores every damaged standing wall to its own maximum HP atomically. */
  restoreAllWallsToMaxHp(): number {
    let restoredWallCount = 0;
    for (let index = 0; index < this.wallHp.length; index += 1) {
      const hp = this.wallHp[index] ?? 0;
      const maxHp = this.wallMaxHp[index] ?? 0;
      if (hp <= 0 || hp >= maxHp) {
        continue;
      }

      this.wallHp[index] = maxHp;
      restoredWallCount += 1;
    }

    if (restoredWallCount > 0) {
      this.revisionValue += 1;
    }
    return restoredWallCount;
  }

  removeWall(point: GridPoint): boolean {
    if (!this.hasWall(point)) {
      return false;
    }

    const index = this.indexOf(point);
    this.wallHp[index] = 0;
    this.wallMaxHp[index] = 0;
    this.revisionValue += 1;
    return true;
  }

  damageWall(point: GridPoint, damage: number): WallDamageResult {
    if (!Number.isSafeInteger(damage) || damage <= 0) {
      throw new RangeError('Wall damage must be a positive integer.');
    }

    const index = this.indexOf(point);
    const previousHp = this.wallHp[index] ?? 0;
    if (previousHp === 0) {
      return Object.freeze({
        previousHp: 0,
        appliedDamage: 0,
        remainingHp: 0,
        destroyed: false,
      });
    }

    const remainingHp = Math.max(0, previousHp - damage);
    const appliedDamage = previousHp - remainingHp;
    this.wallHp[index] = remainingHp;

    const destroyed = remainingHp === 0;
    if (destroyed) {
      this.wallMaxHp[index] = 0;
      this.debris[index] = 1;
      this.revisionValue += 1;
    }

    return Object.freeze({ previousHp, appliedDamage, remainingHp, destroyed });
  }

  snapshot(): GridSnapshot {
    return Object.freeze({
      width: this.width,
      height: this.height,
      revision: this.revisionValue,
      core: this.corePoint,
      spawnPoints: this.spawnPointList,
      wallHp: new Int16Array(this.wallHp),
      debris: new Uint8Array(this.debris),
    });
  }

  createSnapshot(): GridSnapshot {
    return this.snapshot();
  }

  private assertValidWallHp(maxHp: number): void {
    if (!Number.isSafeInteger(maxHp) || maxHp <= 0 || maxHp > 32_767) {
      throw new RangeError('Wall HP must be an integer from 1 through 32767.');
    }
  }

  private copyValidatedSpawnPoints(
    spawnPoints: readonly GridPoint[],
  ): readonly GridPoint[] {
    if (spawnPoints.length === 0) {
      throw new RangeError('At least one spawn point is required.');
    }

    const uniqueSpawnPoints = new Set<string>();
    for (const spawnPoint of spawnPoints) {
      if (!this.isInside(spawnPoint) || !this.isEdge(spawnPoint)) {
        throw new RangeError('Every spawn point must occupy a grid-edge cell.');
      }
      if (sameGridPoint(this.corePoint, spawnPoint)) {
        throw new RangeError('The core and a spawn point cannot share a cell.');
      }

      const key = `${spawnPoint.x}:${spawnPoint.y}`;
      if (uniqueSpawnPoints.has(key)) {
        throw new RangeError(`Duplicate spawn point: ${key}.`);
      }
      uniqueSpawnPoints.add(key);
    }

    return Object.freeze(spawnPoints.map(copyGridPoint));
  }
}
