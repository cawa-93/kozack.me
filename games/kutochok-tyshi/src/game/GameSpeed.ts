import type { LevelPhase } from '../systems/LevelSystem';
import type { GameStatus } from '../systems/GameSimulation';

export type GameSpeed = 1 | 2 | 4 | 10;
export type SelectableGameSpeed = Exclude<GameSpeed, 1>;

export function toggleGameSpeed(
  currentSpeed: GameSpeed,
  selectedSpeed: SelectableGameSpeed,
): GameSpeed {
  return currentSpeed === selectedSpeed ? 1 : selectedSpeed;
}

export function isLevelSpeedControlVisible(phase: LevelPhase): boolean {
  return phase === 'spawning' || phase === 'active';
}

export function scaleSimulationDelta(
  deltaMs: number,
  speed: GameSpeed,
): number {
  return deltaMs * speed;
}

export function gameSpeedForStatus(
  currentSpeed: GameSpeed,
  status: GameStatus,
): GameSpeed {
  return status === 'defeat' || status === 'victory' ? 1 : currentSpeed;
}
