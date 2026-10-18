import type Phaser from 'phaser';

export const WALL_NORTH = 1 << 0;
export const WALL_EAST = 1 << 1;
export const WALL_SOUTH = 1 << 2;
export const WALL_WEST = 1 << 3;
export const WALL_AUTOTILE_MASK_ALL =
  WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST;

export const WALL_AUTOTILE_SIZE = 30;
export const BOOK_WALL_SIZE = 26;
export const WALL_AUTOTILE_RENDER_SCALE = 4;
export const WALL_AUTOTILE_TEXTURE_SIZE = (
  WALL_AUTOTILE_SIZE * WALL_AUTOTILE_RENDER_SCALE
);
export const BOOK_STACK_TEXTURE_SOURCE = 'book-stack-texture-source';

export type HasWallAt = (x: number, y: number) => boolean;

const WALL_TEXTURE_PREFIX = 'book-wall-autotile';

const BookColor = {
  Ink: '#3b2547',
  Page: '#ffe9bd',
} as const;

export function wallAutotileMask(hasWall: HasWallAt, x: number, y: number): number {
  let mask = 0;
  if (hasWall(x, y - 1)) mask |= WALL_NORTH;
  if (hasWall(x + 1, y)) mask |= WALL_EAST;
  if (hasWall(x, y + 1)) mask |= WALL_SOUTH;
  if (hasWall(x - 1, y)) mask |= WALL_WEST;
  return mask;
}

export function wallAutotileTextureKey(mask: number): string {
  validateMask(mask);
  return `${WALL_TEXTURE_PREFIX}-${mask}`;
}

export function isBookWallPixelSolid(mask: number, x: number, y: number): boolean {
  validateMask(mask);
  const inset = (WALL_AUTOTILE_SIZE - BOOK_WALL_SIZE) / 2;
  const innerEnd = inset + BOOK_WALL_SIZE;
  const inCenterX = x >= inset && x < innerEnd;
  const inCenterY = y >= inset && y < innerEnd;

  if (inCenterX && inCenterY) return true;
  if ((mask & WALL_NORTH) !== 0 && inCenterX && y < inset) return true;
  if ((mask & WALL_EAST) !== 0 && x >= innerEnd && inCenterY) return true;
  if ((mask & WALL_SOUTH) !== 0 && inCenterX && y >= innerEnd) return true;
  return (mask & WALL_WEST) !== 0 && x < inset && inCenterY;
}

export function createWallAutotileTextures(scene: Phaser.Scene): void {
  const source = scene.textures
    .get(BOOK_STACK_TEXTURE_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  for (let mask = 0; mask <= WALL_AUTOTILE_MASK_ALL; mask += 1) {
    const key = wallAutotileTextureKey(mask);
    if (scene.textures.exists(key)) {
      continue;
    }
    const texture = scene.textures.createCanvas(
      key,
      WALL_AUTOTILE_TEXTURE_SIZE,
      WALL_AUTOTILE_TEXTURE_SIZE,
    );
    if (texture === null) {
      throw new Error(`Could not create book wall autotile texture: ${key}`);
    }
    drawBookWallFrame(texture.getContext(), source, mask);
    texture.refresh();
  }
}

function drawBookWallFrame(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  mask: number,
): void {
  context.clearRect(
    0,
    0,
    WALL_AUTOTILE_TEXTURE_SIZE,
    WALL_AUTOTILE_TEXTURE_SIZE,
  );
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.scale(WALL_AUTOTILE_RENDER_SCALE, WALL_AUTOTILE_RENDER_SCALE);
  context.drawImage(
    source,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    WALL_AUTOTILE_SIZE,
    WALL_AUTOTILE_SIZE,
  );

  const isSolid = (x: number, y: number): boolean =>
    isBookWallPixelSolid(mask, x, y);
  for (let y = 0; y < WALL_AUTOTILE_SIZE; y += 1) {
    for (let x = 0; x < WALL_AUTOTILE_SIZE; x += 1) {
      if (!isSolid(x, y)) {
        context.clearRect(x, y, 1, 1);
      }
    }
  }

  const edgeColors = [BookColor.Ink, BookColor.Page] as const;
  for (let distance = edgeColors.length; distance >= 1; distance -= 1) {
    context.fillStyle = edgeColors[distance - 1] ?? BookColor.Ink;
    for (let y = 0; y < WALL_AUTOTILE_SIZE; y += 1) {
      for (let x = 0; x < WALL_AUTOTILE_SIZE; x += 1) {
        if (
          isSolid(x, y) &&
          distanceToOpenEdge(isSolid, x, y, edgeColors.length) === distance
        ) {
          context.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  context.restore();
}

type IsWallShapeSolid = (x: number, y: number) => boolean;

function distanceToOpenEdge(
  isSolid: IsWallShapeSolid,
  x: number,
  y: number,
  maximumDistance: number,
): number {
  for (let distance = 1; distance <= maximumDistance; distance += 1) {
    if (
      !isSolid(x - distance, y) ||
      !isSolid(x + distance, y) ||
      !isSolid(x, y - distance) ||
      !isSolid(x, y + distance)
    ) {
      return distance;
    }
  }
  return 0;
}

function validateMask(mask: number): void {
  if (!Number.isInteger(mask) || mask < 0 || mask > WALL_AUTOTILE_MASK_ALL) {
    throw new RangeError(
      `Wall autotile mask must be an integer from 0 to 15; received ${mask}`,
    );
  }
}
