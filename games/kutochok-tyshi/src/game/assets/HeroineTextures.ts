import type Phaser from 'phaser';

import { bonusIllustrationTextureKey } from '../ui/BonusPresentation';
import type { HeroineVisualState } from '../views/HeroineVisualState';
import { drawAtlasFrame } from './AtlasFrame';
import { PrototypeTexture } from './PrototypeAtlas';

export const HEROINE_STATE_75_SOURCE = 'introvert-girl-state-75-source';
export const HEROINE_STATE_50_SOURCE = 'introvert-girl-state-50-source';
export const HEROINE_STATE_25_SOURCE = 'introvert-girl-state-25-source';
export const HEROINE_STATE_0_SOURCE = bonusIllustrationTextureKey(
  'hide-under-blanket',
);

export const HeroineTexture = {
  State75: 'introvert-girl-state-75',
  State50: 'introvert-girl-state-50',
  State25: 'introvert-girl-state-25',
  State0: 'introvert-girl-state-0',
} as const;

const OUTPUT_SIZE = 96;

const DERIVED_TEXTURES: ReadonlyArray<{
  readonly source: string;
  readonly texture: (typeof HeroineTexture)[keyof typeof HeroineTexture];
}> = [
  { source: HEROINE_STATE_75_SOURCE, texture: HeroineTexture.State75 },
  { source: HEROINE_STATE_50_SOURCE, texture: HeroineTexture.State50 },
  { source: HEROINE_STATE_25_SOURCE, texture: HeroineTexture.State25 },
  { source: HEROINE_STATE_0_SOURCE, texture: HeroineTexture.State0 },
];

export function createHeroineTextures(scene: Phaser.Scene): void {
  for (const definition of DERIVED_TEXTURES) {
    if (scene.textures.exists(definition.texture)) {
      continue;
    }
    const source = scene.textures
      .get(definition.source)
      .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const texture = scene.textures.createCanvas(
      definition.texture,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    if (texture === null) {
      throw new Error(`Could not create heroine texture: ${definition.texture}`);
    }
    drawAtlasFrame(
      texture.getContext(),
      source,
      1,
      1,
      0,
      0,
      OUTPUT_SIZE,
    );
    texture.refresh();
  }
}

export function heroineTextureKey(state: HeroineVisualState): string {
  switch (state) {
    case 100:
      return PrototypeTexture.Core;
    case 75:
      return HeroineTexture.State75;
    case 50:
      return HeroineTexture.State50;
    case 25:
      return HeroineTexture.State25;
    case 0:
      return HeroineTexture.State0;
  }
}
