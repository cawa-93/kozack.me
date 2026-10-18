import { describe, expect, it } from 'vitest';

import { selectCharmBubbleEnemyIds } from '../../src/systems/KittenCharm';

describe('kitten charm bubble sampling', () => {
  it('shows two deterministic, staggerable representatives for fifteen enemies', () => {
    const enemies = Array.from({ length: 15 }, (_, index) => `enemy:${index + 1}`);

    const first = selectCharmBubbleEnemyIds(enemies, 0);
    const repeated = selectCharmBubbleEnemyIds(enemies, 0);
    const nextActivation = selectCharmBubbleEnemyIds(enemies, 1);

    expect(first).toHaveLength(2);
    expect(new Set(first).size).toBe(2);
    expect(repeated).toEqual(first);
    expect(nextActivation).not.toEqual(first);
  });

  it('shows one bubble for a small affected group and none for an empty group', () => {
    expect(selectCharmBubbleEnemyIds(['enemy:1'], 4)).toEqual(['enemy:1']);
    expect(selectCharmBubbleEnemyIds([], 4)).toEqual([]);
  });
});
