export interface CameraScroll {
  readonly x: number;
  readonly y: number;
}

const ZOOM_COMPARISON_EPSILON = 1e-6;

export function canPanCamera(zoom: number, minimumZoom: number): boolean {
  return zoom > minimumZoom + ZOOM_COMPARISON_EPSILON;
}

export function centeredCameraScroll(
  worldWidth: number,
  worldHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraScroll {
  return {
    x: (worldWidth - viewportWidth) / 2,
    y: (worldHeight - viewportHeight) / 2,
  };
}

export function keyboardPanDelta(
  horizontal: number,
  vertical: number,
  deltaMs: number,
  zoom: number,
  screenPixelsPerSecond: number,
): CameraScroll {
  const length = Math.hypot(horizontal, vertical);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  const distance = (screenPixelsPerSecond * deltaMs) / 1_000 / zoom;
  return {
    x: (horizontal / length) * distance,
    y: (vertical / length) * distance,
  };
}

export function scrollForZoomAtPointer(
  scroll: CameraScroll,
  pointer: CameraScroll,
  previousZoom: number,
  nextZoom: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraScroll {
  const originX = viewportWidth / 2;
  const originY = viewportHeight / 2;
  const worldX = scroll.x + originX + (pointer.x - originX) / previousZoom;
  const worldY = scroll.y + originY + (pointer.y - originY) / previousZoom;

  return {
    x: worldX - originX - (pointer.x - originX) / nextZoom,
    y: worldY - originY - (pointer.y - originY) / nextZoom,
  };
}

/**
 * Phaser camera scroll is measured relative to the unzoomed viewport origin.
 * These bounds let either world edge reach the viewport center, which means at
 * most half of the visible screen can move beyond the level.
 */
export function clampScrollToHalfViewport(
  scroll: CameraScroll,
  worldWidth: number,
  worldHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraScroll {
  return {
    x: clamp(scroll.x, -viewportWidth / 2, worldWidth - viewportWidth / 2),
    y: clamp(scroll.y, -viewportHeight / 2, worldHeight - viewportHeight / 2),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
