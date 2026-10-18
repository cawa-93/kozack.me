import type Phaser from 'phaser';

import { drawAtlasFrame } from './AtlasFrame';

export const PROTOTYPE_ATLAS_SOURCE = 'social-character-atlas-source';
export const PROTOTYPE_STRONG_CROWD_SOURCE = 'social-crowd-strong-source';
export const PROTOTYPE_ROACH_SOURCE = 'social-roach-special-source';
export const PROTOTYPE_ARENA_FLOOR = 'cozy-reading-room-arena-floor';

export const PrototypeTexture = {
  Core: 'introvert-girl',
  EnemyWeak: 'social-visitor-coffee',
  EnemyFast: 'social-visitor-invitation',
  EnemyStrong: 'social-visitor-crowd',
  EnemyRoach: 'social-visitor-roach',
  Projectile: 'social-chatter-projectile',
  Spawn: 'social-invitation-spawn',
} as const;

type PrototypeTextureKey = (typeof PrototypeTexture)[keyof typeof PrototypeTexture];

interface AtlasFrame {
  readonly key: PrototypeTextureKey;
  readonly column: number;
  readonly row: number;
}

const FRAMES: readonly AtlasFrame[] = [
  { key: PrototypeTexture.Core, column: 0, row: 0 },
  { key: PrototypeTexture.EnemyWeak, column: 1, row: 0 },
  { key: PrototypeTexture.EnemyFast, column: 0, row: 1 },
];

const OUTPUT_SIZE = 96;
const STANDALONE_ENEMY_OUTPUT_SIZE = 192;
const ATLAS_COLUMNS = 2;
const ATLAS_ROWS = 2;

export function extractPrototypeTextures(scene: Phaser.Scene): void {
  const source = scene.textures
    .get(PROTOTYPE_ATLAS_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  for (const frame of FRAMES) {
    if (scene.textures.exists(frame.key)) {
      continue;
    }

    const texture = scene.textures.createCanvas(frame.key, OUTPUT_SIZE, OUTPUT_SIZE);
    if (texture === null) {
      throw new Error(`Could not create illustrated texture: ${frame.key}`);
    }
    drawAtlasFrame(
      texture.getContext(),
      source,
      ATLAS_COLUMNS,
      ATLAS_ROWS,
      frame.column,
      frame.row,
      OUTPUT_SIZE,
    );
    texture.refresh();
  }

  createStrongCrowdTexture(scene);
  createRoachTexture(scene);
  createSocialProjectileTexture(scene);
  createSpawnTexture(scene);
}

function createStrongCrowdTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PrototypeTexture.EnemyStrong)) {
    return;
  }
  const source = scene.textures
    .get(PROTOTYPE_STRONG_CROWD_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const texture = scene.textures.createCanvas(
    PrototypeTexture.EnemyStrong,
    STANDALONE_ENEMY_OUTPUT_SIZE,
    STANDALONE_ENEMY_OUTPUT_SIZE,
  );
  if (texture === null) {
    throw new Error('Could not create noisy-crowd texture.');
  }
  drawAtlasFrame(
    texture.getContext(),
    source,
    1,
    1,
    0,
    0,
    STANDALONE_ENEMY_OUTPUT_SIZE,
  );
  texture.refresh();
}

function createRoachTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PrototypeTexture.EnemyRoach)) {
    return;
  }
  const source = scene.textures
    .get(PROTOTYPE_ROACH_SOURCE)
    .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const texture = scene.textures.createCanvas(
    PrototypeTexture.EnemyRoach,
    STANDALONE_ENEMY_OUTPUT_SIZE,
    STANDALONE_ENEMY_OUTPUT_SIZE,
  );
  if (texture === null) {
    throw new Error('Could not create handstand-horse texture.');
  }
  drawAtlasFrame(
    texture.getContext(),
    source,
    1,
    1,
    0,
    0,
    STANDALONE_ENEMY_OUTPUT_SIZE,
  );
  texture.refresh();
}

function createSocialProjectileTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PrototypeTexture.Projectile)) {
    return;
  }
  const texture = scene.textures.createCanvas(PrototypeTexture.Projectile, 64, 40);
  if (texture === null) {
    throw new Error('Could not create social chatter projectile texture.');
  }
  const context = texture.getContext();
  context.clearRect(0, 0, 64, 40);
  context.fillStyle = '#51345f';
  context.beginPath();
  context.roundRect(7, 5, 43, 25, 8);
  context.fill();
  context.beginPath();
  context.moveTo(47, 18);
  context.lineTo(61, 25);
  context.lineTo(48, 27);
  context.closePath();
  context.fill();
  context.fillStyle = '#fff8e8';
  context.beginPath();
  context.roundRect(10, 8, 37, 19, 6);
  context.fill();
  context.fillStyle = '#e9788f';
  context.beginPath();
  context.arc(20, 18, 3, 0, Math.PI * 2);
  context.arc(29, 18, 3, 0, Math.PI * 2);
  context.arc(38, 18, 3, 0, Math.PI * 2);
  context.fill();
  texture.refresh();
}

function createSpawnTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PrototypeTexture.Spawn)) {
    return;
  }
  const texture = scene.textures.createCanvas(PrototypeTexture.Spawn, 64, 64);
  if (texture === null) {
    throw new Error('Could not create social invitation spawn texture.');
  }
  const context = texture.getContext();
  context.clearRect(0, 0, 64, 64);
  context.fillStyle = 'rgba(81, 52, 95, 0.24)';
  context.beginPath();
  context.ellipse(32, 45, 25, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#51345f';
  context.beginPath();
  context.roundRect(13, 18, 38, 28, 7);
  context.fill();
  context.fillStyle = '#f7b6c5';
  context.beginPath();
  context.roundRect(17, 22, 30, 20, 4);
  context.fill();
  context.strokeStyle = '#fff4cf';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(18, 23);
  context.lineTo(32, 34);
  context.lineTo(46, 23);
  context.stroke();
  texture.refresh();
}
