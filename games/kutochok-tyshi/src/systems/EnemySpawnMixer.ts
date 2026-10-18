import type { EnemyGroup } from '../data/levels';
import type { EnemyType } from '../domain/enemies/EnemyDefinition';

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

interface EnemyGroupCursor {
  readonly enemyType: EnemyType;
  readonly count: bigint;
  spawned: bigint;
}

/**
 * Streams a deterministic, evenly distributed merge of compact enemy groups.
 *
 * Each group contributes one virtual stream whose next item is positioned at
 * `(spawned + 0.5) / count` across the level. Merging those positions spreads
 * every type over the complete schedule without expanding groups into a
 * per-enemy queue. Equal positions use a rotating group priority.
 */
export class EnemySpawnMixer {
  private readonly cursors: EnemyGroupCursor[];
  private nextTiePriority = 0;
  private pendingTotal: bigint;

  constructor(groups: readonly EnemyGroup[]) {
    let pendingTotal = 0n;
    this.cursors = groups.map((group) => {
      if (!Number.isSafeInteger(group.count) || group.count <= 0) {
        throw new RangeError('Enemy group count must be a positive safe integer.');
      }

      const count = BigInt(group.count);
      pendingTotal += count;
      return {
        enemyType: group.enemyType,
        count,
        spawned: 0n,
      };
    });
    this.pendingTotal = pendingTotal;
  }

  get isComplete(): boolean {
    return this.pendingTotal === 0n;
  }

  get pendingCount(): number {
    return this.pendingTotal >= MAX_SAFE_INTEGER_BIGINT
      ? Number.MAX_SAFE_INTEGER
      : Number(this.pendingTotal);
  }

  nextEnemyType(): EnemyType | null {
    if (this.isComplete) {
      return null;
    }

    const selectedIndex = this.findNextGroupIndex();
    const selected = this.cursors[selectedIndex];
    if (selected === undefined) {
      throw new RangeError('Enemy spawn mixer has pending enemies but no group to select.');
    }

    selected.spawned += 1n;
    this.pendingTotal -= 1n;
    this.nextTiePriority = (selectedIndex + 1) % this.cursors.length;
    return selected.enemyType;
  }

  private findNextGroupIndex(): number {
    let selectedIndex = -1;

    for (let offset = 0; offset < this.cursors.length; offset += 1) {
      const index = (this.nextTiePriority + offset) % this.cursors.length;
      const candidate = this.cursors[index];
      if (candidate === undefined || candidate.spawned === candidate.count) {
        continue;
      }

      if (selectedIndex === -1) {
        selectedIndex = index;
        continue;
      }

      const selected = this.cursors[selectedIndex];
      if (selected === undefined) {
        throw new RangeError('Enemy spawn mixer selected an unknown group.');
      }

      if (compareNextPositions(candidate, selected) < 0) {
        selectedIndex = index;
      }
    }

    return selectedIndex;
  }
}

function compareNextPositions(
  left: EnemyGroupCursor,
  right: EnemyGroupCursor,
): number {
  const leftNumerator = left.spawned * 2n + 1n;
  const rightNumerator = right.spawned * 2n + 1n;
  const leftCrossProduct = leftNumerator * right.count;
  const rightCrossProduct = rightNumerator * left.count;

  if (leftCrossProduct < rightCrossProduct) {
    return -1;
  }
  if (leftCrossProduct > rightCrossProduct) {
    return 1;
  }
  return 0;
}
