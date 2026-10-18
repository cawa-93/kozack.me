export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export function sameGridPoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

export function copyGridPoint(point: GridPoint): GridPoint {
  return Object.freeze({ x: point.x, y: point.y });
}

