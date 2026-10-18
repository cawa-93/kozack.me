import { describe, expect, it } from 'vitest';

import {
  GUEST_DIALOGUE_LIFETIME_MS,
  GUEST_DIALOGUE_MAX_INTERVAL_MS,
  GUEST_DIALOGUE_MIN_INTERVAL_MS,
  MAX_GUEST_DIALOGUES,
  guestDialogueFrame,
  guestDialogueIntervalMs,
  isWithinGuestDialogueRadius,
} from '../../src/game/views/GuestDialoguePresentation';

describe('guest dialogue presentation', () => {
  it('maps random samples to the inclusive 3-12 second interval', () => {
    expect(guestDialogueIntervalMs(0)).toBe(GUEST_DIALOGUE_MIN_INTERVAL_MS);
    expect(guestDialogueIntervalMs(0.999_999)).toBe(GUEST_DIALOGUE_MAX_INTERVAL_MS);
    expect(() => guestDialogueIntervalMs(-0.01)).toThrow(RangeError);
    expect(() => guestDialogueIntervalMs(1)).toThrow(RangeError);
  });

  it('uses a ten-cell Euclidean radius including its boundary', () => {
    expect(isWithinGuestDialogueRadius(18, 18, 18, 18)).toBe(true);
    expect(isWithinGuestDialogueRadius(24, 26, 18, 18)).toBe(true);
    expect(isWithinGuestDialogueRadius(28, 18, 18, 18)).toBe(true);
    expect(isWithinGuestDialogueRadius(29, 18, 18, 18)).toBe(false);
    expect(isWithinGuestDialogueRadius(26, 26, 18, 18)).toBe(false);
  });

  it('animates 1.5 real-time seconds with bounded opacity and a small rise', () => {
    expect(GUEST_DIALOGUE_LIFETIME_MS).toBe(1_500);
    expect(MAX_GUEST_DIALOGUES).toBe(8);
    for (let elapsedMs = 0; elapsedMs <= 1_500; elapsedMs += 25) {
      const frame = guestDialogueFrame(elapsedMs);
      expect(frame.alpha).toBeGreaterThanOrEqual(0);
      expect(frame.alpha).toBeLessThanOrEqual(1);
      expect(frame.scale).toBeGreaterThanOrEqual(0.82);
      expect(frame.scale).toBeLessThanOrEqual(1.1);
      expect(frame.rise).toBeGreaterThanOrEqual(-6);
      expect(frame.rise).toBeLessThanOrEqual(0);
    }
    expect(guestDialogueFrame(0).alpha).toBe(0);
    expect(guestDialogueFrame(750).alpha).toBe(1);
    expect(guestDialogueFrame(1_500).alpha).toBe(0);
  });
});
