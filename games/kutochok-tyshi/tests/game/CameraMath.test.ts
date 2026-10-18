import { describe, expect, it } from 'vitest';

import {
  canPanCamera,
  centeredCameraScroll,
  clampScrollToHalfViewport,
  keyboardPanDelta,
  scrollForZoomAtPointer,
} from '../../src/game/input/CameraMath';

describe('camera input math', () => {
  it('locks panning at minimum zoom and enables it above minimum zoom', () => {
    expect(canPanCamera(1, 1)).toBe(false);
    expect(canPanCamera(1 + 1e-7, 1)).toBe(false);
    expect(canPanCamera(1.25, 1)).toBe(true);
  });

  it('centers the arena in the viewport when returning to minimum zoom', () => {
    expect(centeredCameraScroll(1_080, 1_080, 1_080, 1_080)).toEqual({
      x: 0,
      y: 0,
    });
    expect(centeredCameraScroll(1_280, 960, 1_080, 720)).toEqual({
      x: 100,
      y: 120,
    });
  });

  it('allows exactly half a viewport beyond every level edge', () => {
    expect(
      clampScrollToHalfViewport(
        { x: -2_000, y: 2_000 },
        1_080,
        1_080,
        1_080,
        1_080,
      ),
    ).toEqual({ x: -540, y: 540 });
  });

  it('keeps the same world point under an off-center zoom cursor', () => {
    const pointer = { x: 270, y: 810 };
    const previousScroll = { x: 0, y: 0 };
    const nextScroll = scrollForZoomAtPointer(
      previousScroll,
      pointer,
      1,
      2,
      1_080,
      1_080,
    );

    expect(nextScroll).toEqual({ x: -135, y: 135 });
    expect(worldAtPointer(previousScroll.x, pointer.x, 1)).toBe(
      worldAtPointer(nextScroll.x, pointer.x, 2),
    );
    expect(worldAtPointer(previousScroll.y, pointer.y, 1)).toBe(
      worldAtPointer(nextScroll.y, pointer.y, 2),
    );
  });

  it('normalizes diagonal keyboard panning and keeps screen speed across zoom', () => {
    const atOneX = keyboardPanDelta(1, 1, 1_000, 1, 480);
    const atTwoX = keyboardPanDelta(1, 1, 1_000, 2, 480);

    expect(Math.hypot(atOneX.x, atOneX.y)).toBeCloseTo(480);
    expect(Math.hypot(atTwoX.x, atTwoX.y)).toBeCloseTo(240);
    expect(atOneX.x).toBeCloseTo(atOneX.y);
    expect(keyboardPanDelta(0, 0, 1_000, 1, 480)).toEqual({ x: 0, y: 0 });
  });
});

function worldAtPointer(scroll: number, pointer: number, zoom: number): number {
  const origin = 1_080 / 2;
  return scroll + origin + (pointer - origin) / zoom;
}
