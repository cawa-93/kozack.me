import { describe, expect, it } from 'vitest';

import {
  clampVolume,
  sliderPositionForVolume,
  volumeAtSliderPosition,
} from '../../src/game/audio/VolumeMath';

describe('volume controls', () => {
  it.each([
    [-0.2, 0],
    [0, 0],
    [0.35, 0.35],
    [1, 1],
    [1.4, 1],
    [Number.NEGATIVE_INFINITY, 0],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NaN, 0],
  ])('clamps volume %s to %s', (input, expected) => {
    expect(clampVolume(input)).toBe(expected);
  });

  it('maps pointer positions to the complete slider range', () => {
    expect(volumeAtSliderPosition(50, 100, 200)).toBe(0);
    expect(volumeAtSliderPosition(100, 100, 200)).toBe(0);
    expect(volumeAtSliderPosition(200, 100, 200)).toBe(0.5);
    expect(volumeAtSliderPosition(300, 100, 200)).toBe(1);
    expect(volumeAtSliderPosition(450, 100, 200)).toBe(1);
  });

  it('maps clamped volume back to the thumb position', () => {
    expect(sliderPositionForVolume(-1, 100, 200)).toBe(100);
    expect(sliderPositionForVolume(0.5, 100, 200)).toBe(200);
    expect(sliderPositionForVolume(2, 100, 200)).toBe(300);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid slider width %s',
    (width) => {
      expect(() => volumeAtSliderPosition(100, 100, width)).toThrow(RangeError);
      expect(() => sliderPositionForVolume(0.5, 100, width)).toThrow(RangeError);
    },
  );
});
