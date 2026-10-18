import { describe, expect, it } from 'vitest';

import { actionDockLayout } from '../../src/game/ui/ActionDockLayout';

describe('action dock layout', () => {
  it('keeps the complete panel shadow fourteen pixels from the canvas edges', () => {
    const layout = actionDockLayout(1_080, 1_080);

    expect(layout.panel).toEqual({ x: 782, y: 990, width: 280, height: 72 });
    expect(layout.hitArea).toEqual({ x: 782, y: 990, width: 284, height: 76 });
    expect(layout.hitArea.x + layout.hitArea.width).toBe(1_066);
    expect(layout.hitArea.y + layout.hitArea.height).toBe(1_066);
  });

  it('uses one shared row for the start action and three speed chips', () => {
    const layout = actionDockLayout(1_080, 1_080);

    expect(layout.startButton).toEqual({ x: 822, y: 1_002, width: 200, height: 48 });
    expect(layout.speedButtons).toEqual([
      { x: 794, y: 1_002, width: 80, height: 48 },
      { x: 882, y: 1_002, width: 80, height: 48 },
      { x: 970, y: 1_002, width: 80, height: 48 },
    ]);
  });

  it('rejects a canvas that cannot contain the dock', () => {
    expect(() => actionDockLayout(100, 100)).toThrow(RangeError);
  });
});
