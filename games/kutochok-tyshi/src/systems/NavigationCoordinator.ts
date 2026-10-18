import type { NavigationProfile } from '../domain/enemies/NavigationProfile';
import type { GridPoint } from '../domain/grid/GridPoint';
import type { FlowField } from '../navigation/FlowField';
import type { FlowFieldService } from '../navigation/FlowFieldService';
import type { FlowFieldSet } from '../navigation/FlowFieldSet';
import type { NavigationCostSnapshot } from '../navigation/NavigationCostSnapshot';

export interface UnreachableSpawn {
  readonly profileId: string;
  readonly spawn: GridPoint;
}

export class NavigationCoordinator {
  readonly #service: FlowFieldService;
  #profiles: readonly NavigationProfile[];
  #activeFields: FlowFieldSet = new Map<string, FlowField>();
  #rebuildCount = 0;

  constructor(
    service: FlowFieldService,
    profiles: readonly NavigationProfile[],
  ) {
    this.#service = service;
    this.#profiles = profiles;
  }

  get fields(): FlowFieldSet {
    return this.#activeFields;
  }

  get rebuildCount(): number {
    return this.#rebuildCount;
  }

  configureProfiles(profiles: readonly NavigationProfile[]): boolean {
    if (haveEqualProfiles(this.#profiles, profiles)) {
      return false;
    }

    this.#profiles = Object.freeze(profiles.map((profile) => Object.freeze({ ...profile })));
    this.#activeFields = new Map<string, FlowField>();
    return true;
  }

  rebuild(snapshot: NavigationCostSnapshot): FlowFieldSet {
    const nextFields = this.prepare(snapshot);
    this.publish(nextFields);
    return nextFields;
  }

  prepare(snapshot: NavigationCostSnapshot): FlowFieldSet {
    return this.#service.buildAll(snapshot, this.#profiles);
  }

  publish(fields: FlowFieldSet): void {
    this.#activeFields = fields;
    this.#rebuildCount += 1;
  }

  findUnreachableSpawns(
    snapshot: NavigationCostSnapshot,
    fields: FlowFieldSet = this.#activeFields,
  ): readonly UnreachableSpawn[] {
    const unreachable: UnreachableSpawn[] = [];

    for (const profile of this.#profiles) {
      const field = fields.get(profile.id);
      if (field === undefined) {
        for (const spawn of snapshot.spawnPoints) {
          unreachable.push({ profileId: profile.id, spawn });
        }
        continue;
      }

      for (const spawn of snapshot.spawnPoints) {
        const index = spawn.y * snapshot.width + spawn.x;
        if (!Number.isFinite(field.costToCore[index])) {
          unreachable.push({ profileId: profile.id, spawn });
        }
      }
    }

    return unreachable;
  }
}

function haveEqualProfiles(
  left: readonly NavigationProfile[],
  right: readonly NavigationProfile[],
): boolean {
  return left.length === right.length && left.every((profile, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && profile.id === candidate.id
      && profile.cellsPerSecond === candidate.cellsPerSecond
      && profile.damagePerHit === candidate.damagePerHit
      && profile.attackIntervalMs === candidate.attackIntervalMs
      && (profile.instantWallBreak === true)
        === (candidate.instantWallBreak === true);
  });
}
