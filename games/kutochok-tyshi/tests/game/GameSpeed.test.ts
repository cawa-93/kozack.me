import { describe, expect, it } from 'vitest';

import {
  gameSpeedForStatus,
  isLevelSpeedControlVisible,
  scaleSimulationDelta,
  toggleGameSpeed,
} from '../../src/game/GameSpeed';

describe('game speed controls', () => {
  it('selects 2x, 4x, or 10x and toggles the selected speed back to 1x', () => {
    expect(toggleGameSpeed(1, 2)).toBe(2);
    expect(toggleGameSpeed(2, 2)).toBe(1);
    expect(toggleGameSpeed(2, 4)).toBe(4);
    expect(toggleGameSpeed(4, 4)).toBe(1);
    expect(toggleGameSpeed(4, 10)).toBe(10);
    expect(toggleGameSpeed(10, 10)).toBe(1);
  });

  it('shows speed controls only while a level is spawning or active', () => {
    expect(isLevelSpeedControlVisible('build')).toBe(false);
    expect(isLevelSpeedControlVisible('spawning')).toBe(true);
    expect(isLevelSpeedControlVisible('active')).toBe(true);
    expect(isLevelSpeedControlVisible('completed')).toBe(false);
  });

  it('scales simulation time without changing the source frame delta', () => {
    expect(scaleSimulationDelta(16, 1)).toBe(16);
    expect(scaleSimulationDelta(16, 2)).toBe(32);
    expect(scaleSimulationDelta(16, 4)).toBe(64);
    expect(scaleSimulationDelta(16, 10)).toBe(160);
  });

  it('preserves the selected speed between levels and across bonus choices', () => {
    expect(gameSpeedForStatus(10, 'running')).toBe(10);
    expect(gameSpeedForStatus(10, 'build')).toBe(10);
    expect(gameSpeedForStatus(10, 'bonus')).toBe(10);
    expect(gameSpeedForStatus(10, 'defeat')).toBe(1);
    expect(gameSpeedForStatus(10, 'victory')).toBe(1);
  });
});
