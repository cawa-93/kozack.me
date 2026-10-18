import { describe, expect, it } from 'vitest';

import {
  HEROINE_STATE_0_SOURCE,
  HeroineTexture,
  heroineTextureKey,
} from '../../src/game/assets/HeroineTextures';
import { PrototypeTexture } from '../../src/game/assets/PrototypeAtlas';
import { bonusIllustrationTextureKey } from '../../src/game/ui/BonusPresentation';
import { heroineVisualState } from '../../src/game/views/HeroineVisualState';

describe('heroine social-battery visual state', () => {
  it.each([
    [200, 200, 100],
    [151, 200, 100],
    [150, 200, 75],
    [101, 200, 75],
    [100, 200, 50],
    [51, 200, 50],
    [50, 200, 25],
    [1, 200, 25],
    [0, 200, 0],
  ] as const)('maps %i/%i HP to the %i%% visual', (hp, maxHp, expected) => {
    expect(heroineVisualState(hp, maxHp)).toBe(expected);
  });

  it('uses the current mutable maximum and returns through healthier states', () => {
    expect(heroineVisualState(300, 400)).toBe(75);
    expect(heroineVisualState(301, 400)).toBe(100);
    expect([
      heroineVisualState(50, 200),
      heroineVisualState(100, 200),
      heroineVisualState(150, 200),
      heroineVisualState(200, 200),
    ]).toEqual([25, 50, 75, 100]);
  });

  it('clamps depleted and overfilled HP while rejecting invalid values', () => {
    expect(heroineVisualState(-1, 200)).toBe(0);
    expect(heroineVisualState(250, 200)).toBe(100);
    expect(() => heroineVisualState(10, 0)).toThrow(RangeError);
    expect(() => heroineVisualState(Number.NaN, 200)).toThrow(RangeError);
  });

  it('maps healthy and depleted states to the established source art', () => {
    expect(heroineTextureKey(100)).toBe(PrototypeTexture.Core);
    expect(heroineTextureKey(75)).toBe(HeroineTexture.State75);
    expect(heroineTextureKey(50)).toBe(HeroineTexture.State50);
    expect(heroineTextureKey(25)).toBe(HeroineTexture.State25);
    expect(heroineTextureKey(0)).toBe(HeroineTexture.State0);
    expect(HEROINE_STATE_0_SOURCE).toBe(
      bonusIllustrationTextureKey('hide-under-blanket'),
    );
  });

  it('can force the blanket source without changing positive battery-derived state', () => {
    const positiveBatteryState = heroineVisualState(150, 200);
    const protectionPresentationState = 0 as const;

    expect(positiveBatteryState).toBe(75);
    expect(heroineTextureKey(protectionPresentationState)).toBe(
      HeroineTexture.State0,
    );
    expect(HEROINE_STATE_0_SOURCE).toBe(
      bonusIllustrationTextureKey('hide-under-blanket'),
    );
  });
});
