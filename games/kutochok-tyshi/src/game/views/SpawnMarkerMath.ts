export interface SpawnMarkerPlacement {
  readonly bubbleOffsetX: number;
  readonly bubbleOffsetY: number;
  readonly pointerDirectionX: -1 | 0 | 1;
  readonly pointerDirectionY: -1 | 0 | 1;
}

export interface SpawnMarkerAnimation {
  readonly bubbleOffset: number;
  readonly bubbleScale: number;
  readonly bubbleAlpha: number;
  readonly anchorScale: number;
  readonly anchorAlpha: number;
}

const BUBBLE_INWARD_OFFSET = 29;
const ANIMATION_CYCLE_MS = 900;

export function spawnMarkerPlacement(
  x: number,
  y: number,
  width: number,
  height: number,
): SpawnMarkerPlacement {
  if (y === 0) {
    return {
      bubbleOffsetX: 0,
      bubbleOffsetY: BUBBLE_INWARD_OFFSET,
      pointerDirectionX: 0,
      pointerDirectionY: -1,
    };
  }
  if (y === height - 1) {
    return {
      bubbleOffsetX: 0,
      bubbleOffsetY: -BUBBLE_INWARD_OFFSET,
      pointerDirectionX: 0,
      pointerDirectionY: 1,
    };
  }
  if (x === 0) {
    return {
      bubbleOffsetX: BUBBLE_INWARD_OFFSET,
      bubbleOffsetY: 0,
      pointerDirectionX: -1,
      pointerDirectionY: 0,
    };
  }
  if (x === width - 1) {
    return {
      bubbleOffsetX: -BUBBLE_INWARD_OFFSET,
      bubbleOffsetY: 0,
      pointerDirectionX: 1,
      pointerDirectionY: 0,
    };
  }

  throw new RangeError('A spawn marker must be placed on a grid edge.');
}

export function spawnMarkerAnimation(
  elapsedMs: number,
  phaseMs = 0,
): SpawnMarkerAnimation {
  const normalized = positiveModulo(elapsedMs + phaseMs, ANIMATION_CYCLE_MS)
    / ANIMATION_CYCLE_MS;
  const pulse = (Math.sin(normalized * Math.PI * 2) + 1) / 2;

  return {
    bubbleOffset: -2 * pulse,
    bubbleScale: 0.96 + pulse * 0.1,
    bubbleAlpha: 0.86 + pulse * 0.14,
    anchorScale: 0.9 + pulse * 0.32,
    anchorAlpha: 0.28 + (1 - pulse) * 0.42,
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
