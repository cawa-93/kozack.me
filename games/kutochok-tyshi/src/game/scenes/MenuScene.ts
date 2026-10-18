import Phaser from 'phaser';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../config/gameConfig';
import {
  resolveDevelopmentLaunch,
  type DevelopmentLaunch,
} from '../../dev/DevelopmentLaunch';
import { AUDIO_KEYS } from '../audio/AudioAssets';
import {
  playGameCue,
  preloadGameAudio,
  setGameEffectsVolume,
  setGameMusic,
  setGameMusicVolume,
} from '../audio/GameAudio';
import type { GameSceneData } from './GameScene';

const MENU_BACKGROUND_KEY = 'menu-background-v1';
const MENU_BACKGROUND_SOURCE = `${import.meta.env.BASE_URL}assets/menu-background-v1.png`;

export class MenuScene extends Phaser.Scene {
  #starting = false;
  #developmentLaunch: DevelopmentLaunch | null = null;

  constructor() {
    super('menu');
  }

  init(): void {
    this.#starting = false;
    this.#developmentLaunch = resolveDevelopmentLaunch(
      import.meta.env.DEV,
      window.location.search,
    );
  }

  preload(): void {
    if (this.#developmentLaunch !== null) {
      return;
    }
    this.load.image(MENU_BACKGROUND_KEY, MENU_BACKGROUND_SOURCE);
    preloadGameAudio(this);
  }

  create(): void {
    if (import.meta.env.DEV) {
      setGameMusicVolume(this, 0);
      setGameEffectsVolume(this, 0);
    }

    if (this.#developmentLaunch !== null) {
      const sceneData: GameSceneData = {
        developmentRun: true,
        initialLevelNumber: this.#developmentLaunch.initialLevelNumber,
        initialCoinBonus: this.#developmentLaunch.initialCoinBonus,
      };
      this.scene.start('game', sceneData);
      return;
    }

    setGameMusic(this, 'menu');

    const background = this.add
      .image(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, MENU_BACKGROUND_KEY)
      .setDisplaySize(CANVAS_WIDTH, CANVAS_HEIGHT);

    this.tweens.add({
      targets: background,
      scaleX: background.scaleX * 1.025,
      scaleY: background.scaleY * 1.025,
      duration: 9_000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.add
      .rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        0x3c2348,
        0.16,
      )
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.createSparkles();

    const titleShadow = this.add
      .text(CANVAS_WIDTH / 2 + 7, 172 + 9, 'Куточок тиші', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '86px',
        color: '#51345f',
        fontStyle: 'bold',
        stroke: '#51345f',
        strokeThickness: 18,
      })
      .setOrigin(0.5)
      .setAlpha(0.45);
    const title = this.add
      .text(CANVAS_WIDTH / 2, 172, 'Куточок тиші', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '86px',
        color: '#fff7e7',
        fontStyle: 'bold',
        stroke: '#6f477c',
        strokeThickness: 15,
        shadow: {
          offsetX: 0,
          offsetY: 5,
          color: '#d86f8d',
          blur: 0,
          stroke: true,
          fill: true,
        },
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: [titleShadow, title],
      y: '-=8',
      duration: 1_700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.createStartButton();
    this.cameras.main.fadeIn(450, 63, 39, 73);

    this.input.keyboard?.on('keydown-ENTER', this.startGame, this);
    this.input.keyboard?.on('keydown-SPACE', this.startGame, this);
  }

  private createSparkles(): void {
    const positions: ReadonlyArray<readonly [number, number, number]> = [
      [155, 282, 8],
      [912, 310, 10],
      [125, 660, 6],
      [944, 708, 7],
    ];

    positions.forEach(([x, y, radius], index) => {
      const sparkle = this.add
        .star(x, y, 4, radius * 0.35, radius, 0xfff2b3, 0.9)
        .setAngle(45);
      this.tweens.add({
        targets: sparkle,
        alpha: 0.25,
        scale: 0.65,
        angle: '+=90',
        duration: 900 + index * 180,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    });
  }

  private createStartButton(): void {
    const x = CANVAS_WIDTH / 2;
    const y = 900;
    const button = this.add.container(x, y).setSize(148, 148);
    const shadow = this.add
      .circle(7, 10, 70, 0x51345f, 0.55)
      .setStrokeStyle(5, 0x51345f, 0.75);
    const face = this.add
      .circle(0, 0, 68, 0xffd979, 1)
      .setStrokeStyle(7, 0x6f477c, 1);
    const inset = this.add
      .circle(0, 0, 53, 0xffe7a2, 0.72)
      .setStrokeStyle(3, 0xfff4bd, 0.78);
    const shine = this.add.ellipse(-20, -30, 32, 15, 0xfff8d7, 0.75);
    const playIcon = this.add.graphics();
    playIcon.fillStyle(0x6f477c, 1);
    playIcon.fillTriangle(-17, -29, -17, 29, 34, 0);

    button.add([shadow, face, inset, shine, playIcon]);
    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      playGameCue(this, AUDIO_KEYS.uiHover);
      this.tweens.killTweensOf(button);
      this.tweens.add({
        targets: button,
        scale: 1.055,
        duration: 130,
        ease: 'Back.easeOut',
      });
      face.setFillStyle(0xffe28f);
      inset.setFillStyle(0xffedb1, 0.82);
    });
    button.on('pointerout', () => {
      this.tweens.killTweensOf(button);
      this.tweens.add({ targets: button, scale: 1, duration: 120 });
      face.setFillStyle(0xffd979);
      inset.setFillStyle(0xffe7a2, 0.72);
    });
    button.on('pointerdown', () => {
      this.tweens.killTweensOf(button);
      button.setScale(0.97);
    });
    button.on('pointerup', () => {
      button.setScale(1.03);
      this.startGame();
    });
  }

  private startGame(): void {
    if (this.#starting) {
      return;
    }

    this.#starting = true;
    playGameCue(this, AUDIO_KEYS.uiClick);
    this.input.enabled = false;
    this.cameras.main.fadeOut(250, 53, 33, 66);
    this.time.delayedCall(260, () => this.scene.start('game'));
  }
}
