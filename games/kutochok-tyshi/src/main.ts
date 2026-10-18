import Phaser from 'phaser';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config/gameConfig';
import { mountDevelopmentLevelLauncher } from './dev/DevelopmentLauncher';
import { BonusScene } from './game/scenes/BonusScene';
import { GameScene } from './game/scenes/GameScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PauseScene } from './game/scenes/PauseScene';
import './style.css';

if (import.meta.env.DEV) {
  mountDevelopmentLevelLauncher();
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#4b3655',
  antialias: true,
  pixelArt: false,
  roundPixels: true,
  scene: [MenuScene, GameScene, PauseScene, BonusScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  },
};

new Phaser.Game(config);
