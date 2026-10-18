import type { GridPoint } from '../../domain/grid/GridPoint';

/**
 * Returns a deterministic four-connected supercover line. Diagonal cursor
 * jumps become a staircase, so painted walls never leave corner-only gaps.
 */
export function connectedGridLine(
  start: GridPoint,
  end: GridPoint,
): readonly GridPoint[] {
  assertGridPoint(start);
  assertGridPoint(end);

  const points: GridPoint[] = [{ x: start.x, y: start.y }];
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const stepX = Math.sign(deltaX);
  const stepY = Math.sign(deltaY);
  const width = Math.abs(deltaX);
  const height = Math.abs(deltaY);

  let x = start.x;
  let y = start.y;
  let crossedX = 0;
  let crossedY = 0;

  while (crossedX < width || crossedY < height) {
    const xDecision = (1 + crossedX * 2) * height;
    const yDecision = (1 + crossedY * 2) * width;

    if (xDecision <= yDecision && crossedX < width) {
      x += stepX;
      crossedX += 1;
      points.push({ x, y });
    }

    if (yDecision <= xDecision && crossedY < height) {
      y += stepY;
      crossedY += 1;
      points.push({ x, y });
    }
  }

  return points;
}

function assertGridPoint(point: GridPoint): void {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    throw new RangeError('Grid-line endpoints must use integer coordinates.');
  }
}
