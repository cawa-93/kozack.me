import type { GridPoint } from '../../domain/grid/GridPoint';

export interface GridRectangleBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function gridRectangleBounds(
  start: GridPoint,
  end: GridPoint,
): GridRectangleBounds {
  assertGridPoint(start);
  assertGridPoint(end);
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
}

export function cellsInGridRectangle(
  start: GridPoint,
  end: GridPoint,
): readonly GridPoint[] {
  const bounds = gridRectangleBounds(start, end);
  const cells: GridPoint[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function assertGridPoint(point: GridPoint): void {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    throw new RangeError(
      'Grid-rectangle endpoints must use integer coordinates.',
    );
  }
}
