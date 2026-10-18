import type Phaser from 'phaser';

import { createStandaloneTexture } from './TowerTextures';

export const SHEER_HEART_ATTACK_SOURCE = 'sheer-heart-attack-source';
export const SHEER_HEART_ATTACK_TEXTURE = 'sheer-heart-attack';

export function createMineTextures(scene: Phaser.Scene): void {
  const source = scene.textures
    .get(SHEER_HEART_ATTACK_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  createStandaloneTexture(
    scene,
    source,
    SHEER_HEART_ATTACK_TEXTURE,
    96,
  );
}
