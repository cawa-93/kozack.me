import { describe, expect, it, vi } from 'vitest';

import {
  WALL_AUTOTILE_MASK_ALL,
  WALL_EAST,
  WALL_NORTH,
  WALL_SOUTH,
  WALL_WEST,
  BOOK_WALL_SIZE,
  WALL_AUTOTILE_RENDER_SCALE,
  WALL_AUTOTILE_TEXTURE_SIZE,
  isBookWallPixelSolid,
  wallAutotileMask,
  wallAutotileTextureKey,
} from '../../src/game/assets/WallAutotiles';

describe('wall autotiles', () => {
  it('assigns one stable bit to each cardinal neighbor', () => {
    expect([WALL_NORTH, WALL_EAST, WALL_SOUTH, WALL_WEST]).toEqual([1, 2, 4, 8]);
    expect(WALL_AUTOTILE_MASK_ALL).toBe(15);
  });

  it('queries neighbors in deterministic N, E, S, W order', () => {
    const queried: string[] = [];
    const occupied = new Set(['7,8', '8,9', '6,9']);

    const mask = wallAutotileMask((x, y) => {
      const key = `${x},${y}`;
      queried.push(key);
      return occupied.has(key);
    }, 7, 9);

    expect(queried).toEqual(['7,8', '8,9', '7,10', '6,9']);
    expect(mask).toBe(WALL_NORTH | WALL_EAST | WALL_WEST);
  });

  it('covers all 16 adjacency combinations with unique stable texture keys', () => {
    const keys = Array.from(
      { length: WALL_AUTOTILE_MASK_ALL + 1 },
      (_, mask) => wallAutotileTextureKey(mask),
    );

    expect(keys).toEqual(
      Array.from({ length: 16 }, (_, mask) => `book-wall-autotile-${mask}`),
    );
    expect(new Set(keys).size).toBe(16);
    expect(BOOK_WALL_SIZE).toBe(26);
    expect(WALL_AUTOTILE_RENDER_SCALE).toBe(4);
    expect(WALL_AUTOTILE_TEXTURE_SIZE).toBe(120);
  });

  it('uses one fixed book-stack footprint with seamless cardinal connectors', () => {
    expect(isBookWallPixelSolid(0, 1, 15)).toBe(false);
    expect(isBookWallPixelSolid(0, 2, 15)).toBe(true);
    expect(isBookWallPixelSolid(0, 27, 15)).toBe(true);
    expect(isBookWallPixelSolid(0, 28, 15)).toBe(false);

    expect(isBookWallPixelSolid(WALL_EAST, 30, 15)).toBe(true);
    expect(isBookWallPixelSolid(WALL_WEST, -1, 15)).toBe(true);
    expect(isBookWallPixelSolid(WALL_NORTH, 15, -1)).toBe(true);
    expect(isBookWallPixelSolid(WALL_SOUTH, 15, 30)).toBe(true);
  });

  it('does not query the wall cell itself', () => {
    const hasWall = vi.fn(() => false);

    expect(wallAutotileMask(hasWall, 4, 6)).toBe(0);
    expect(hasWall).not.toHaveBeenCalledWith(4, 6);
    expect(hasWall).toHaveBeenCalledTimes(4);
  });

  it.each([-1, 16, 1.5, Number.NaN])('rejects invalid mask %s', (mask) => {
    expect(() => wallAutotileTextureKey(mask)).toThrow(RangeError);
  });
});
