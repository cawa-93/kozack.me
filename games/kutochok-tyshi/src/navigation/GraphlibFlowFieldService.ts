import { Graph, alg } from '@dagrejs/graphlib';
import type { NavigationProfile } from '../domain/enemies/NavigationProfile';
import { DEBRIS_MOVEMENT_TIME_MULTIPLIER } from '../domain/grid/GridTerrain';
import { FlowDirection, type FlowField } from './FlowField';
import type { FlowFieldService } from './FlowFieldService';
import type { FlowFieldSet } from './FlowFieldSet';
import type { NavigationCostSnapshot } from './NavigationCostSnapshot';

const PHYSICAL_ROUTE_SCORE_DIVISOR = 4;

const DIRECTIONS = [
  { direction: FlowDirection.Up, deltaX: 0, deltaY: -1 },
  { direction: FlowDirection.Right, deltaX: 1, deltaY: 0 },
  { direction: FlowDirection.Down, deltaX: 0, deltaY: 1 },
  { direction: FlowDirection.Left, deltaX: -1, deltaY: 0 },
] as const;

export class GraphlibFlowFieldService implements FlowFieldService {
  private invocationCount = 0;

  public get solverInvocationCount(): number {
    return this.invocationCount;
  }

  public build(
    snapshot: NavigationCostSnapshot,
    profile: NavigationProfile,
  ): FlowField {
    this.validateInputs(snapshot, profile);

    const cellCount = snapshot.width * snapshot.height;
    const enterCosts = this.createEnterCosts(snapshot, profile);
    const graph = this.createGraph(snapshot.width, snapshot.height, enterCosts);
    const coreIndex = this.toIndex(
      snapshot.core.x,
      snapshot.core.y,
      snapshot.width,
    );

    this.invocationCount += 1;
    const paths = alg.dijkstra(
      graph,
      String(coreIndex),
      (edge) => {
        const weight = graph.edge(edge);
        if (typeof weight !== 'number') {
          throw new Error('Graph edge weight must be numeric.');
        }
        return weight;
      },
      (nodeId) => graph.inEdges(nodeId) ?? [],
    );

    const costToCore = new Float64Array(cellCount);
    for (let index = 0; index < cellCount; index += 1) {
      costToCore[index] = paths[String(index)]?.distance ?? Number.POSITIVE_INFINITY;
    }

    const nextDirection = this.createDirectionField(
      snapshot.width,
      snapshot.height,
      coreIndex,
      enterCosts,
      costToCore,
    );

    return {
      profileId: profile.id,
      gridRevision: snapshot.revision,
      width: snapshot.width,
      height: snapshot.height,
      costToCore,
      nextDirection,
    };
  }

  public buildAll(
    snapshot: NavigationCostSnapshot,
    profiles: readonly NavigationProfile[],
  ): FlowFieldSet {
    const uniqueProfiles = new Map<string, NavigationProfile>();

    for (const profile of profiles) {
      const existing = uniqueProfiles.get(profile.id);
      if (existing === undefined) {
        uniqueProfiles.set(profile.id, profile);
        continue;
      }

      if (!this.haveEqualNavigationValues(existing, profile)) {
        throw new Error(
          `Navigation profile id "${profile.id}" has conflicting values.`,
        );
      }
    }

    const fields = new Map<string, FlowField>();
    for (const profile of uniqueProfiles.values()) {
      fields.set(profile.id, this.build(snapshot, profile));
    }

    return fields;
  }

  private createEnterCosts(
    snapshot: NavigationCostSnapshot,
    profile: NavigationProfile,
  ): Float64Array {
    const physicalEnterCosts = this.createPhysicalEnterCosts(snapshot, profile);
    let maxFinitePhysicalEnterCost = 0;

    for (const physicalEnterCost of physicalEnterCosts) {
      if (
        Number.isFinite(physicalEnterCost)
        && physicalEnterCost > maxFinitePhysicalEnterCost
      ) {
        maxFinitePhysicalEnterCost = physicalEnterCost;
      }
    }

    const cellCount = snapshot.width * snapshot.height;
    const normalizationBase = maxFinitePhysicalEnterCost > 0
      ? maxFinitePhysicalEnterCost
      : 1;
    const enterCosts = new Float64Array(physicalEnterCosts.length);

    for (let index = 0; index < physicalEnterCosts.length; index += 1) {
      const physicalEnterCost = physicalEnterCosts[index];
      if (
        physicalEnterCost === undefined
        || !Number.isFinite(physicalEnterCost)
      ) {
        enterCosts[index] = Number.POSITIVE_INFINITY;
        continue;
      }

      const normalizedPhysicalCost = (
        physicalEnterCost / normalizationBase
      ) / (PHYSICAL_ROUTE_SCORE_DIVISOR * cellCount);
      enterCosts[index] = (
        snapshot.towerExposure[index] === 1 ? 1 : 0
      ) + normalizedPhysicalCost;
    }

    return enterCosts;
  }

  private createPhysicalEnterCosts(
    snapshot: NavigationCostSnapshot,
    profile: NavigationProfile,
  ): Float64Array {
    const movementTimeMs = 1000 / profile.cellsPerSecond;
    const physicalEnterCosts = new Float64Array(snapshot.wallHp.length);

    for (let index = 0; index < snapshot.wallHp.length; index += 1) {
      const wallHp = snapshot.wallHp[index];
      let physicalEnterCost: number;
      if (wallHp === undefined || wallHp <= 0) {
        physicalEnterCost = movementTimeMs * (
          snapshot.debris[index] === 1
            ? DEBRIS_MOVEMENT_TIME_MULTIPLIER
            : 1
        );
      } else if (profile.instantWallBreak === true) {
        physicalEnterCost = movementTimeMs;
      } else if (profile.damagePerHit === 0) {
        physicalEnterCost = Number.POSITIVE_INFINITY;
      } else {
        const hitsRequired = Math.ceil(wallHp / profile.damagePerHit);
        physicalEnterCost =
          movementTimeMs + hitsRequired * profile.attackIntervalMs;
      }

      physicalEnterCosts[index] = physicalEnterCost;
    }

    return physicalEnterCosts;
  }

  private createGraph(
    width: number,
    height: number,
    enterCosts: Float64Array,
  ): Graph {
    const graph = new Graph({ directed: true });
    const cellCount = width * height;

    for (let index = 0; index < cellCount; index += 1) {
      graph.setNode(String(index));
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = this.toIndex(x, y, width);
        const sourceCost = enterCosts[sourceIndex];
        if (sourceCost === undefined || !Number.isFinite(sourceCost)) {
          continue;
        }

        for (const candidate of DIRECTIONS) {
          const targetX = x + candidate.deltaX;
          const targetY = y + candidate.deltaY;
          if (!this.isInBounds(targetX, targetY, width, height)) {
            continue;
          }

          const targetIndex = this.toIndex(targetX, targetY, width);
          const targetCost = enterCosts[targetIndex];
          if (targetCost === undefined || !Number.isFinite(targetCost)) {
            continue;
          }

          graph.setEdge(String(sourceIndex), String(targetIndex), targetCost);
        }
      }
    }

    return graph;
  }

  private createDirectionField(
    width: number,
    height: number,
    coreIndex: number,
    enterCosts: Float64Array,
    costToCore: Float64Array,
  ): Uint8Array {
    const nextDirection = new Uint8Array(width * height);
    nextDirection.fill(FlowDirection.None);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = this.toIndex(x, y, width);
        if (
          index === coreIndex ||
          !Number.isFinite(enterCosts[index] ?? Number.POSITIVE_INFINITY) ||
          !Number.isFinite(costToCore[index] ?? Number.POSITIVE_INFINITY)
        ) {
          continue;
        }

        let bestTotalCost = Number.POSITIVE_INFINITY;
        let bestDirection = FlowDirection.None;

        for (const candidate of DIRECTIONS) {
          const neighborX = x + candidate.deltaX;
          const neighborY = y + candidate.deltaY;
          if (!this.isInBounds(neighborX, neighborY, width, height)) {
            continue;
          }

          const neighborIndex = this.toIndex(neighborX, neighborY, width);
          const enterCost = enterCosts[neighborIndex];
          const remainingCost = costToCore[neighborIndex];
          if (
            enterCost === undefined ||
            remainingCost === undefined ||
            !Number.isFinite(enterCost) ||
            !Number.isFinite(remainingCost)
          ) {
            continue;
          }

          const totalCost = enterCost + remainingCost;
          if (totalCost < bestTotalCost) {
            bestTotalCost = totalCost;
            bestDirection = candidate.direction;
          }
        }

        nextDirection[index] = bestDirection;
      }
    }

    return nextDirection;
  }

  private validateInputs(
    snapshot: NavigationCostSnapshot,
    profile: NavigationProfile,
  ): void {
    if (!Number.isInteger(snapshot.width) || snapshot.width <= 0) {
      throw new Error('Grid width must be a positive integer.');
    }
    if (!Number.isInteger(snapshot.height) || snapshot.height <= 0) {
      throw new Error('Grid height must be a positive integer.');
    }
    if (snapshot.wallHp.length !== snapshot.width * snapshot.height) {
      throw new Error('wallHp length must match the grid dimensions.');
    }
    if (snapshot.debris.length !== snapshot.width * snapshot.height) {
      throw new Error('debris length must match the grid dimensions.');
    }
    if (snapshot.towerExposure.length !== snapshot.width * snapshot.height) {
      throw new Error('towerExposure length must match the grid dimensions.');
    }
    if (
      !this.isInBounds(
        snapshot.core.x,
        snapshot.core.y,
        snapshot.width,
        snapshot.height,
      )
    ) {
      throw new Error('Core must be inside the grid.');
    }
    for (let index = 0; index < snapshot.wallHp.length; index += 1) {
      const wallHp = snapshot.wallHp[index] ?? 0;
      if (wallHp < 0) {
        throw new Error('Wall HP cannot be negative.');
      }
      const debris = snapshot.debris[index] ?? 0;
      if (debris !== 0 && debris !== 1) {
        throw new Error('Debris entries must be either 0 or 1.');
      }
      if (wallHp > 0 && debris === 1) {
        throw new Error('A cell cannot contain both a wall and debris.');
      }
      const towerExposure = snapshot.towerExposure[index] ?? 0;
      if (towerExposure !== 0 && towerExposure !== 1) {
        throw new Error('Tower exposure entries must be either 0 or 1.');
      }
    }
    if (profile.id.length === 0) {
      throw new Error('Navigation profile id cannot be empty.');
    }
    if (
      !Number.isFinite(profile.cellsPerSecond) ||
      profile.cellsPerSecond <= 0
    ) {
      throw new Error('cellsPerSecond must be greater than zero.');
    }
    if (!Number.isFinite(profile.damagePerHit) || profile.damagePerHit < 0) {
      throw new Error('damagePerHit cannot be negative.');
    }
    if (
      profile.instantWallBreak !== undefined
      && typeof profile.instantWallBreak !== 'boolean'
    ) {
      throw new Error('instantWallBreak must be a boolean when provided.');
    }
    if (
      !Number.isFinite(profile.attackIntervalMs) ||
      profile.attackIntervalMs <= 0
    ) {
      throw new Error('attackIntervalMs must be greater than zero.');
    }
  }

  private haveEqualNavigationValues(
    first: NavigationProfile,
    second: NavigationProfile,
  ): boolean {
    return (
      first.cellsPerSecond === second.cellsPerSecond &&
      first.damagePerHit === second.damagePerHit &&
      first.attackIntervalMs === second.attackIntervalMs &&
      (first.instantWallBreak === true) === (second.instantWallBreak === true)
    );
  }

  private isInBounds(
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean {
    return x >= 0 && x < width && y >= 0 && y < height;
  }

  private toIndex(x: number, y: number, width: number): number {
    return y * width + x;
  }
}
