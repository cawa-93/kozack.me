import { getTowerDefinition } from '../data/towers';
import type { GridPoint } from '../domain/grid/GridPoint';
import type { TowerType } from '../domain/structures/Tower';

export interface TowerExposureSource {
  readonly type: TowerType;
  readonly position: GridPoint;
}

export function createTowerExposure(
  width: number,
  height: number,
  towers: Iterable<TowerExposureSource>,
): Uint8Array {
  const exposure = new Uint8Array(width * height);

  for (const tower of towers) {
    const rangeCells = getTowerDefinition(tower.type).rangeCells;
    const rangeSquared = rangeCells * rangeCells;
    const minX = Math.max(0, tower.position.x - rangeCells);
    const maxX = Math.min(width - 1, tower.position.x + rangeCells);
    const minY = Math.max(0, tower.position.y - rangeCells);
    const maxY = Math.min(height - 1, tower.position.y + rangeCells);

    for (let y = minY; y <= maxY; y += 1) {
      const deltaY = y - tower.position.y;
      for (let x = minX; x <= maxX; x += 1) {
        const deltaX = x - tower.position.x;
        if (deltaX * deltaX + deltaY * deltaY <= rangeSquared) {
          exposure[y * width + x] = 1;
        }
      }
    }
  }

  return exposure;
}
