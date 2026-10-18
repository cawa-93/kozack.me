import { describe, expect, it } from 'vitest';

import type { NavigationProfile } from '../../src/domain/enemies/NavigationProfile';
import { FlowDirection, type FlowField } from '../../src/navigation/FlowField';
import type { FlowFieldService } from '../../src/navigation/FlowFieldService';
import type { NavigationCostSnapshot } from '../../src/navigation/NavigationCostSnapshot';
import { NavigationCoordinator } from '../../src/systems/NavigationCoordinator';

const PROFILE: NavigationProfile = {
  id: 'test',
  cellsPerSecond: 1,
  damagePerHit: 0,
  attackIntervalMs: 1000,
};

const SNAPSHOT: NavigationCostSnapshot = {
  width: 3,
  height: 3,
  revision: 2,
  core: { x: 1, y: 1 },
  spawnPoints: [{ x: 0, y: 1 }],
  wallHp: new Int16Array(9),
  debris: new Uint8Array(9),
  towerExposure: new Uint8Array(9),
};

function field(costAtSpawn: number): FlowField {
  const costs = new Float64Array(9);
  costs.fill(1);
  costs[3] = costAtSpawn;
  const directions = new Uint8Array(9);
  directions.fill(FlowDirection.Right);
  return {
    profileId: PROFILE.id,
    gridRevision: SNAPSHOT.revision,
    width: SNAPSHOT.width,
    height: SNAPSHOT.height,
    costToCore: costs,
    nextDirection: directions,
  };
}

describe('NavigationCoordinator', () => {
  it('publishes a complete set atomically and reports unreachable spawns', () => {
    let current = field(Number.POSITIVE_INFINITY);
    const service: FlowFieldService = {
      build: () => current,
      buildAll: () => new Map([[PROFILE.id, current]]),
    };
    const coordinator = new NavigationCoordinator(service, [PROFILE]);

    coordinator.rebuild(SNAPSHOT);
    expect(coordinator.findUnreachableSpawns(SNAPSHOT)).toEqual([
      { profileId: 'test', spawn: { x: 0, y: 1 } },
    ]);

    current = field(2);
    const previousFields = coordinator.fields;
    const nextFields = coordinator.rebuild(SNAPSHOT);
    expect(nextFields).not.toBe(previousFields);
    expect(coordinator.findUnreachableSpawns(SNAPSHOT)).toEqual([]);
    expect(coordinator.rebuildCount).toBe(2);
  });

  it('invalidates published fields when level navigation profiles change', () => {
    let preparedProfiles: readonly NavigationProfile[] = [];
    const service: FlowFieldService = {
      build: () => field(2),
      buildAll: (_snapshot, profiles) => {
        preparedProfiles = profiles;
        return new Map([[PROFILE.id, field(2)]]);
      },
    };
    const coordinator = new NavigationCoordinator(service, [PROFILE]);

    coordinator.rebuild(SNAPSHOT);
    expect(coordinator.fields.size).toBe(1);
    expect(coordinator.configureProfiles([PROFILE])).toBe(false);
    expect(coordinator.fields.size).toBe(1);

    const fasterProfile = { ...PROFILE, cellsPerSecond: 2 };
    expect(coordinator.configureProfiles([fasterProfile])).toBe(true);
    expect(coordinator.fields.size).toBe(0);

    coordinator.prepare(SNAPSHOT);
    expect(preparedProfiles).toEqual([fasterProfile]);

    const instantProfile = { ...fasterProfile, instantWallBreak: true };
    expect(coordinator.configureProfiles([instantProfile])).toBe(true);
    coordinator.prepare(SNAPSHOT);
    expect(preparedProfiles).toEqual([instantProfile]);
  });
});
