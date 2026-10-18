import { describe, expect, it } from 'vitest';

import { connectedGridLine } from '../../src/game/input/GridLine';

describe('connectedGridLine', () => {
  it('includes every horizontal cell between sparse pointer samples', () => {
    expect(connectedGridLine({ x: 2, y: 4 }, { x: 7, y: 4 })).toEqual([
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 7, y: 4 },
    ]);
  });

  it('turns diagonal cursor movement into a four-connected staircase', () => {
    const points = connectedGridLine({ x: 2, y: 2 }, { x: 5, y: 5 });

    expect(points[0]).toEqual({ x: 2, y: 2 });
    expect(points.at(-1)).toEqual({ x: 5, y: 5 });
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      expect(
        Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y),
      ).toBe(1);
    }
  });

  it('works in reverse and does not duplicate a stationary endpoint', () => {
    expect(connectedGridLine({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual([
      { x: 5, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(connectedGridLine({ x: 8, y: 8 }, { x: 8, y: 8 })).toEqual([
      { x: 8, y: 8 },
    ]);
  });

  it('rejects fractional grid coordinates', () => {
    expect(() => connectedGridLine({ x: 1.5, y: 2 }, { x: 3, y: 4 })).toThrow(
      RangeError,
    );
  });
});
