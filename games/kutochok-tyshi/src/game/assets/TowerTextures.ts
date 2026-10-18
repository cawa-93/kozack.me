import type Phaser from 'phaser';

import type {
  DamageTowerType,
  TowerType,
} from '../../domain/structures/Tower';
import { drawAtlasFrame } from './AtlasFrame';

export const WIZARD_CAT_ATLAS_SOURCE = 'wizard-cat-atlas-source';
export const KITTEN_TOWER_SOURCE = 'kitten-tower-source';
export const KITTEN_TOWER_TEXTURE = 'wizard-cat-kitten';
export const CAT_MAGIC_PROJECTILE_TEXTURE = 'wizard-cat-magic-projectile';

const TOWER_TEXTURE_PREFIX = 'wizard-cat';
const OUTPUT_SIZE = 96;

interface CatFrame {
  readonly column: number;
  readonly row: number;
}

const CAT_FRAMES: Readonly<Record<DamageTowerType, CatFrame>> = Object.freeze({
  basic: Object.freeze({ column: 0, row: 0 }),
  rapid: Object.freeze({ column: 1, row: 0 }),
  heavy: Object.freeze({ column: 0, row: 1 }),
});

export function towerTextureKey(type: TowerType): string {
  if (type === 'kitten') {
    return KITTEN_TOWER_TEXTURE;
  }
  return `${TOWER_TEXTURE_PREFIX}-${type}`;
}

export function createTowerTextures(scene: Phaser.Scene): void {
  const source = scene.textures
    .get(WIZARD_CAT_ATLAS_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  for (const type of ['basic', 'rapid', 'heavy'] as const) {
    createAtlasTexture(scene, source, towerTextureKey(type), CAT_FRAMES[type]);
  }
  createAtlasTexture(scene, source, CAT_MAGIC_PROJECTILE_TEXTURE, {
    column: 1,
    row: 1,
  });

  const kittenSource = scene.textures
    .get(KITTEN_TOWER_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  createStandaloneTexture(
    scene,
    kittenSource,
    KITTEN_TOWER_TEXTURE,
    OUTPUT_SIZE,
  );
}

export function createStandaloneTexture(
  scene: Phaser.Scene,
  source: HTMLImageElement | HTMLCanvasElement,
  key: string,
  outputSize: number,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, outputSize, outputSize);
  if (texture === null) {
    throw new Error(`Could not create standalone texture: ${key}.`);
  }
  drawAtlasFrame(texture.getContext(), source, 1, 1, 0, 0, outputSize);
  texture.refresh();
}

function createAtlasTexture(
  scene: Phaser.Scene,
  source: HTMLImageElement | HTMLCanvasElement,
  key: string,
  frame: CatFrame,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, OUTPUT_SIZE, OUTPUT_SIZE);
  if (texture === null) {
    throw new Error(`Could not create wizard-cat texture: ${key}.`);
  }
  drawAtlasFrame(
    texture.getContext(),
    source,
    2,
    2,
    frame.column,
    frame.row,
    OUTPUT_SIZE,
  );
  texture.refresh();
}
