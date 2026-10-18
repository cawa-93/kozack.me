import { describe, expect, it } from 'vitest';

import {
  spawnMarkerAnimation,
  spawnMarkerPlacement,
} from '../../src/game/views/SpawnMarkerMath';

describe('spawn marker presentation math', () => {
  it('places bubbles inward from every arena edge with stable corner priority', () => {
    expect(spawnMarkerPlacement(18, 0, 36, 36)).toMatchObject({
      bubbleOffsetX: 0,
      bubbleOffsetY: 29,
      pointerDirectionY: -1,
    });
    expect(spawnMarkerPlacement(18, 35, 36, 36)).toMatchObject({
      bubbleOffsetX: 0,
      bubbleOffsetY: -29,
      pointerDirectionY: 1,
    });
    expect(spawnMarkerPlacement(0, 18, 36, 36)).toMatchObject({
      bubbleOffsetX: 29,
      bubbleOffsetY: 0,
      pointerDirectionX: -1,
    });
    expect(spawnMarkerPlacement(35, 18, 36, 36)).toMatchObject({
      bubbleOffsetX: -29,
      bubbleOffsetY: 0,
      pointerDirectionX: 1,
    });
    expect(spawnMarkerPlacement(0, 0, 36, 36)).toEqual(
      spawnMarkerPlacement(18, 0, 36, 36),
    );
  });

  it('keeps ambient animation bounded and exactly periodic', () => {
    const start = spawnMarkerAnimation(0, 137);
    const repeated = spawnMarkerAnimation(900, 137);
    expect(repeated).toEqual(start);

    for (let elapsedMs = 0; elapsedMs <= 900; elapsedMs += 45) {
      const frame = spawnMarkerAnimation(elapsedMs);
      expect(frame.bubbleOffset).toBeGreaterThanOrEqual(-2);
      expect(frame.bubbleOffset).toBeLessThanOrEqual(0);
      expect(frame.bubbleScale).toBeGreaterThanOrEqual(0.96);
      expect(frame.bubbleScale).toBeLessThanOrEqual(1.06);
      expect(frame.bubbleAlpha).toBeGreaterThanOrEqual(0.86);
      expect(frame.bubbleAlpha).toBeLessThanOrEqual(1);
      expect(frame.anchorScale).toBeGreaterThanOrEqual(0.9);
      expect(frame.anchorScale).toBeLessThanOrEqual(1.22);
    }
  });

  it('rejects non-edge spawn points', () => {
    expect(() => spawnMarkerPlacement(5, 5, 36, 36)).toThrow(RangeError);
  });
});
