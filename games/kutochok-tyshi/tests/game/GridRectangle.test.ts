import { describe, expect, it } from 'vitest';

import {
  cellsInGridRectangle,
  gridRectangleBounds,
} from '../../src/game/input/GridRectangle';

describe('grid rectangle selection', () => {
  it('normalizes a reverse drag into inclusive bounds', () => {
    expect(gridRectangleBounds({ x: 6, y: 8 }, { x: 4, y: 5 })).toEqual({
      minX: 4,
      minY: 5,
      maxX: 6,
      maxY: 8,
    });
  });

  it('enumerates every selected cell once in deterministic row-major order', () => {
    expect(cellsInGridRectangle({ x: 3, y: 4 }, { x: 1, y: 5 })).toEqual([
      { x: 1, y: 4 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ]);
  });

  it('treats a click as a one-cell rectangle', () => {
    expect(cellsInGridRectangle({ x: 9, y: 7 }, { x: 9, y: 7 })).toEqual([
      { x: 9, y: 7 },
    ]);
  });

  it('rejects fractional grid coordinates', () => {
    expect(() => cellsInGridRectangle(
      { x: 1.5, y: 2 },
      { x: 3, y: 4 },
    )).toThrow(RangeError);
  });
});
