import { describe, expect, it } from 'vitest';

import type { EnemyGroup } from '../../src/data/levels';
import type { EnemyType } from '../../src/domain/enemies/EnemyDefinition';
import { EnemySpawnMixer } from '../../src/systems/EnemySpawnMixer';

function drain(mixer: EnemySpawnMixer): EnemyType[] {
  const result: EnemyType[] = [];
  while (!mixer.isComplete) {
    const enemyType = mixer.nextEnemyType();
    if (enemyType === null) {
      throw new Error('A non-complete mixer must return an enemy type.');
    }
    result.push(enemyType);
  }
  return result;
}

describe('EnemySpawnMixer', () => {
  it('preserves an unchanged stream for a single enemy type', () => {
    const mixer = new EnemySpawnMixer([
      { enemyType: 'weak', count: 4 },
    ]);

    expect(drain(mixer)).toEqual(['weak', 'weak', 'weak', 'weak']);
    expect(mixer.isComplete).toBe(true);
    expect(mixer.pendingCount).toBe(0);
    expect(mixer.nextEnemyType()).toBeNull();
  });

  it('alternates equal groups across the entire spawn schedule', () => {
    const mixer = new EnemySpawnMixer([
      { enemyType: 'weak', count: 10 },
      { enemyType: 'fast', count: 10 },
      { enemyType: 'strong', count: 10 },
    ]);

    expect(drain(mixer)).toEqual(
      Array.from({ length: 10 }, () => ['weak', 'fast', 'strong'] as const).flat(),
    );
  });

  it('places a rare type near its normalized midpoint instead of at the end', () => {
    const result = drain(new EnemySpawnMixer([
      { enemyType: 'weak', count: 10 },
      { enemyType: 'fast', count: 5 },
      { enemyType: 'strong', count: 1 },
    ]));

    expect(result).toHaveLength(16);
    expect(result.indexOf('strong')).toBe(8);
    expect(result.at(-1)).toBe('weak');
  });

  it('emits exact per-type totals and decrements the pending total', () => {
    const groups: readonly EnemyGroup[] = [
      { enemyType: 'weak', count: 6 },
      { enemyType: 'fast', count: 4 },
      { enemyType: 'strong', count: 2 },
    ];
    const mixer = new EnemySpawnMixer(groups);

    expect(mixer.pendingCount).toBe(12);
    expect(mixer.nextEnemyType()).toBe('weak');
    expect(mixer.pendingCount).toBe(11);

    const counts = [mixer.nextEnemyType(), ...drain(mixer)].reduce(
      (totals, enemyType) => {
        if (enemyType !== null) {
          totals[enemyType] += 1;
        }
        return totals;
      },
      { weak: 1, fast: 0, strong: 0, roach: 0 } satisfies Record<EnemyType, number>,
    );

    expect(counts).toEqual({ weak: 6, fast: 4, strong: 2, roach: 0 });
    expect(mixer.pendingCount).toBe(0);
  });

  it('produces identical output for independent instances', () => {
    const groups: readonly EnemyGroup[] = [
      { enemyType: 'weak', count: 7 },
      { enemyType: 'fast', count: 4 },
      { enemyType: 'strong', count: 3 },
    ];

    expect(drain(new EnemySpawnMixer(groups))).toEqual(
      drain(new EnemySpawnMixer(groups)),
    );
  });

  it('accepts huge compact groups and saturates their pending total', () => {
    const mixer = new EnemySpawnMixer([
      { enemyType: 'weak', count: Number.MAX_SAFE_INTEGER },
      { enemyType: 'fast', count: Number.MAX_SAFE_INTEGER },
      { enemyType: 'strong', count: Number.MAX_SAFE_INTEGER },
    ]);

    expect(mixer.pendingCount).toBe(Number.MAX_SAFE_INTEGER);
    expect([
      mixer.nextEnemyType(),
      mixer.nextEnemyType(),
      mixer.nextEnemyType(),
      mixer.nextEnemyType(),
      mixer.nextEnemyType(),
      mixer.nextEnemyType(),
    ]).toEqual(['weak', 'fast', 'strong', 'weak', 'fast', 'strong']);
    expect(mixer.pendingCount).toBe(Number.MAX_SAFE_INTEGER);
    expect(mixer.isComplete).toBe(false);
  });
});
