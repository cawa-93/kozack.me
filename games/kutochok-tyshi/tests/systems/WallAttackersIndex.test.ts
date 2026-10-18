import { describe, expect, it } from 'vitest';

import { WallAttackersIndex } from '../../src/systems/WallAttackersIndex';

describe('WallAttackersIndex', () => {
  it('releases only enemies committed to the destroyed wall', () => {
    const index = new WallAttackersIndex();
    index.add('wall-a', 'enemy-1');
    index.add('wall-a', 'enemy-2');
    index.add('wall-b', 'enemy-3');

    expect(index.releaseWall('wall-a')).toEqual(['enemy-1', 'enemy-2']);
    expect([...index.attackersOf('wall-b')]).toEqual(['enemy-3']);
    expect(index.attackersOf('wall-a').size).toBe(0);
  });

  it('moves an enemy between target walls without leaving a stale entry', () => {
    const index = new WallAttackersIndex();
    index.add('wall-a', 'enemy-1');
    index.add('wall-b', 'enemy-1');

    expect(index.attackersOf('wall-a').size).toBe(0);
    expect([...index.attackersOf('wall-b')]).toEqual(['enemy-1']);
  });
});
