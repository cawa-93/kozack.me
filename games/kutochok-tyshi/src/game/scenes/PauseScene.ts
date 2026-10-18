import Phaser from 'phaser';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../config/gameConfig';
import {
  BONUS_DEFINITIONS,
  type BonusType,
} from '../../domain/bonuses';
import { AUDIO_KEYS } from '../audio/AudioAssets';
import {
  getGameAudioVolumes,
  playGameCue,
  setGameEffectsVolume,
  setGameMusicVolume,
} from '../audio/GameAudio';
import {
  clampVolume,
  sliderPositionForVolume,
  volumeAtSliderPosition,
} from '../audio/VolumeMath';
import {
  bonusIllustrationTextureKey,
  collectOwnedBonuses,
  type OwnedBonusPresentation,
} from '../ui/BonusPresentation';

export interface PauseSceneData {
  readonly bonusStacks: Readonly<Record<BonusType, number>>;
}

type VolumeChannel = 'music' | 'effects';

interface VolumeSliderView {
  readonly channel: VolumeChannel;
  readonly trackStartX: number;
  readonly trackWidth: number;
  readonly fill: Phaser.GameObjects.Rectangle;
  readonly thumb: Phaser.GameObjects.Arc;
  readonly valueText: Phaser.GameObjects.Text;
  readonly objects: readonly Phaser.GameObjects.GameObject[];
}

const TRACK_START_X = 360;
const TRACK_WIDTH = 390;
const PANEL_X = 220;
const PANEL_Y = 278;
const PANEL_WIDTH = 636;
const PANEL_BASE_HEIGHT = 524;
const BONUS_ICON_SIZE = 64;
const BONUS_ICON_IMAGE_SIZE = 52;
const BONUS_ICON_COLUMN_GAP = 14;
const BONUS_ICON_ROW_GAP = 8;
const BONUS_ICON_MAX_COLUMNS = 6;
const BONUS_ICON_FIRST_ROW_Y = 680;
const BONUS_ICON_ROW_STEP = BONUS_ICON_SIZE + BONUS_ICON_ROW_GAP;

export class PauseScene extends Phaser.Scene {
  #draggingSlider: VolumeSliderView | null = null;
  #closing = false;
  #ownedBonuses: readonly OwnedBonusPresentation[] = [];

  constructor() {
    super('pause');
  }

  init(data: Partial<PauseSceneData> = {}): void {
    this.#ownedBonuses = data.bonusStacks === undefined
      ? []
      : collectOwnedBonuses(data.bonusStacks);
  }

  preload(): void {
    for (const { type } of this.#ownedBonuses) {
      const textureKey = bonusIllustrationTextureKey(type);
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, BONUS_DEFINITIONS[type].imagePath);
      }
    }
  }

  create(): void {
    this.#draggingSlider = null;
    this.#closing = false;
    this.game.canvas.style.cursor = 'default';

    const shade = this.add
      .rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        0x3c2946,
        0.64,
      )
      .setInteractive();
    shade.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );

    const bonusRowCount = Math.ceil(
      this.#ownedBonuses.length / BONUS_ICON_MAX_COLUMNS,
    );
    const panelHeight = bonusRowCount === 0
      ? PANEL_BASE_HEIGHT
      : 614 + (bonusRowCount - 1) * BONUS_ICON_ROW_STEP;
    const resumeY = bonusRowCount === 0
      ? 700
      : 788 + (bonusRowCount - 1) * BONUS_ICON_ROW_STEP;
    const panel = this.add.graphics();
    panel
      .fillStyle(0x2f2038, 0.3)
      .fillRoundedRect(PANEL_X + 14, PANEL_Y + 14, PANEL_WIDTH, panelHeight, 44)
      .fillStyle(0xfff8e8, 1)
      .fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, panelHeight, 44)
      .fillStyle(0xffefd8, 0.9)
      .fillRoundedRect(246, 304, 584, 82, 30)
      .lineStyle(6, 0xb78aaa, 0.96)
      .strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, panelHeight, 44);

    const title = this.add
      .text(CANVAS_WIDTH / 2, 345, 'Тиха пауза', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '42px',
        color: '#51345f',
        fontStyle: 'bold',
        stroke: '#fff4cf',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const volumes = getGameAudioVolumes(this);
    const musicSlider = this.createVolumeSlider(
      'music',
      'Музика',
      475,
      volumes.musicVolume,
    );
    const effectsSlider = this.createVolumeSlider(
      'effects',
      'Звуки',
      600,
      volumes.effectsVolume,
    );

    const bonusObjects = this.createOwnedBonusIcons();
    const resumeObjects = this.createResumeButton(resumeY);
    const hint = this.add
      .text(CANVAS_WIDTH / 2, resumeY + 60, 'ESC — продовжити', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '15px',
        color: '#8b718f',
      })
      .setOrigin(0.5);

    const panelContainer = this.add
      .container(0, 0, [
        panel,
        title,
        ...musicSlider.objects,
        ...effectsSlider.objects,
        ...bonusObjects,
        ...resumeObjects,
        hint,
      ])
      .setY(18)
      .setAlpha(0);

    this.tweens.add({
      targets: shade,
      alpha: { from: 0, to: 1 },
      duration: 150,
    });
    this.tweens.add({
      targets: panelContainer,
      y: 0,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.#draggingSlider === null) {
        return;
      }
      if (!pointer.leftButtonDown()) {
        this.#draggingSlider = null;
        return;
      }
      this.applySliderPointer(this.#draggingSlider, pointer.x);
    });
    this.input.on('pointerup', () => {
      this.#draggingSlider = null;
    });
    this.input.on('gameout', () => {
      this.#draggingSlider = null;
    });
    this.input.keyboard?.on('keydown-ESC', (event: KeyboardEvent) => {
      if (!event.repeat) {
        this.closePauseMenu();
      }
    });
  }

  private createVolumeSlider(
    channel: VolumeChannel,
    label: string,
    y: number,
    initialValue: number,
  ): VolumeSliderView {
    const icon = this.createVolumeIcon(channel, 316, y);
    const labelText = this.add.text(TRACK_START_X, y - 48, label, {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: '22px',
      color: '#51345f',
      fontStyle: 'bold',
    });
    const trackShadow = this.add
      .rectangle(TRACK_START_X + TRACK_WIDTH / 2 + 3, y + 4, TRACK_WIDTH, 18, 0x51345f, 0.18)
      .setOrigin(0.5);
    const track = this.add
      .rectangle(TRACK_START_X + TRACK_WIDTH / 2, y, TRACK_WIDTH, 18, 0xe4cfcd, 1)
      .setStrokeStyle(3, 0x9b7798, 0.9);
    const fill = this.add
      .rectangle(TRACK_START_X, y, TRACK_WIDTH, 12, 0xe9788f, 1)
      .setOrigin(0, 0.5);
    const thumb = this.add
      .circle(TRACK_START_X, y, 17, 0xffd979, 1)
      .setStrokeStyle(5, 0x765080, 1);
    const valueText = this.add
      .text(TRACK_START_X + TRACK_WIDTH, y - 47, '', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#765f7d',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    const hitZone = this.add
      .zone(TRACK_START_X + TRACK_WIDTH / 2, y, TRACK_WIDTH + 40, 64)
      .setInteractive({ useHandCursor: true });

    const view: VolumeSliderView = {
      channel,
      trackStartX: TRACK_START_X,
      trackWidth: TRACK_WIDTH,
      fill,
      thumb,
      valueText,
      objects: [
        icon,
        labelText,
        trackShadow,
        track,
        fill,
        thumb,
        valueText,
        hitZone,
      ],
    };
    this.drawSlider(view, initialValue);

    hitZone.on('pointerover', () => {
      playGameCue(this, AUDIO_KEYS.uiHover);
      thumb.setScale(1.08);
    });
    hitZone.on('pointerout', () => {
      if (this.#draggingSlider !== view) {
        thumb.setScale(1);
      }
    });
    hitZone.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        playGameCue(this, AUDIO_KEYS.uiClick);
        this.#draggingSlider = view;
        thumb.setScale(1.08);
        this.applySliderPointer(view, pointer.x);
      },
    );
    return view;
  }

  private createVolumeIcon(
    channel: VolumeChannel,
    x: number,
    y: number,
  ): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y);
    icon.fillStyle(0x765080, 1);
    if (channel === 'music') {
      icon.fillRect(-9, -21, 5, 31);
      icon.fillRect(-4, -21, 22, 5);
      icon.fillRect(13, -21, 5, 27);
      icon.fillCircle(-10, 12, 9);
      icon.fillCircle(12, 8, 9);
    } else {
      icon.fillTriangle(-19, -8, -6, -8, -6, 8);
      icon.fillTriangle(-6, -8, 8, -19, 8, 19);
      icon.lineStyle(4, 0x765080, 1);
      icon.beginPath();
      icon.arc(7, 0, 14, -0.75, 0.75, false);
      icon.strokePath();
      icon.beginPath();
      icon.arc(7, 0, 23, -0.7, 0.7, false);
      icon.strokePath();
    }
    return icon;
  }

  private createOwnedBonusIcons(): readonly Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    for (
      let row = 0;
      row * BONUS_ICON_MAX_COLUMNS < this.#ownedBonuses.length;
      row += 1
    ) {
      const rowStart = row * BONUS_ICON_MAX_COLUMNS;
      const rowEntries = this.#ownedBonuses.slice(
        rowStart,
        rowStart + BONUS_ICON_MAX_COLUMNS,
      );
      const rowWidth = rowEntries.length * BONUS_ICON_SIZE +
        Math.max(0, rowEntries.length - 1) * BONUS_ICON_COLUMN_GAP;
      const startX = CANVAS_WIDTH / 2 - rowWidth / 2 + BONUS_ICON_SIZE / 2;
      const y = BONUS_ICON_FIRST_ROW_Y + row * BONUS_ICON_ROW_STEP;

      rowEntries.forEach(({ type, count }, column) => {
        const x = startX + column * (
          BONUS_ICON_SIZE + BONUS_ICON_COLUMN_GAP
        );
        const shadow = this.add
          .rectangle(x + 3, y + 4, BONUS_ICON_SIZE, BONUS_ICON_SIZE, 0x51345f, 0.16)
          .setOrigin(0.5);
        const bed = this.add
          .rectangle(x, y, BONUS_ICON_SIZE, BONUS_ICON_SIZE, 0xffefd8, 1)
          .setStrokeStyle(3, 0xb78aaa, 0.88);
        const illustration = this.add
          .image(x, y, bonusIllustrationTextureKey(type))
          .setDisplaySize(BONUS_ICON_IMAGE_SIZE, BONUS_ICON_IMAGE_SIZE);
        const badge = this.add
          .circle(x + 25, y + 25, 15, 0x765080, 1)
          .setStrokeStyle(3, 0xfff8e8, 1);
        const countText = this.add
          .text(x + 25, y + 25, `×${count}`, {
            fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
            fontSize: count > 9 ? '12px' : '14px',
            color: '#fff8e8',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);
        objects.push(shadow, bed, illustration, badge, countText);
      });
    }
    return objects;
  }

  private createResumeButton(
    y: number,
  ): readonly Phaser.GameObjects.GameObject[] {
    const x = 540;
    const width = 270;
    const height = 64;
    const shadow = this.add
      .rectangle(x + 5, y + 7, width, height, 0x51345f, 0.24)
      .setOrigin(0.5);
    const face = this.add
      .rectangle(x, y, width, height, 0x9fd7c7, 1)
      .setStrokeStyle(4, 0x765080, 1)
      .setInteractive({ useHandCursor: true });
    const icon = this.add.graphics().setPosition(x - 83, y);
    icon.fillStyle(0x51345f, 1);
    icon.fillTriangle(-10, -13, -10, 13, 13, 0);
    const label = this.add
      .text(x + 18, y, 'Продовжити', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#51345f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    face.on('pointerover', () => {
      playGameCue(this, AUDIO_KEYS.uiHover);
      face.setFillStyle(0xb8e4d7);
    });
    face.on('pointerout', () => {
      face.setFillStyle(0x9fd7c7);
    });
    face.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.closePauseMenu();
      },
    );
    return [shadow, face, icon, label];
  }

  private applySliderPointer(view: VolumeSliderView, pointerX: number): void {
    const volume = volumeAtSliderPosition(
      pointerX,
      view.trackStartX,
      view.trackWidth,
    );
    if (view.channel === 'music') {
      setGameMusicVolume(this, volume);
    } else {
      setGameEffectsVolume(this, volume);
    }
    this.drawSlider(view, volume);
  }

  private drawSlider(view: VolumeSliderView, value: number): void {
    const volume = clampVolume(value);
    view.fill
      .setVisible(volume > 0)
      .setDisplaySize(view.trackWidth * volume, 12);
    view.thumb.setX(
      sliderPositionForVolume(volume, view.trackStartX, view.trackWidth),
    );
    view.valueText.setText(`${Math.round(volume * 100)}%`);
  }

  private closePauseMenu(): void {
    if (this.#closing) {
      return;
    }
    this.#closing = true;
    this.#draggingSlider = null;
    playGameCue(this, AUDIO_KEYS.uiClick);
    this.scene.resume('game');
    this.scene.stop();
  }
}
