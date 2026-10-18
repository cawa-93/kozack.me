import Phaser from 'phaser';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../config/gameConfig';
import {
  BONUS_DEFINITIONS,
  type BonusOffer,
  type BonusType,
} from '../../domain/bonuses';
import { AUDIO_KEYS } from '../audio/AudioAssets';
import { playGameCue } from '../audio/GameAudio';
import {
  BONUS_CARD_HEIGHT,
  BONUS_CARD_WIDTH,
  BONUS_SKIP_HEIGHT,
  BONUS_SKIP_WIDTH,
  createBonusChoiceLayout,
} from '../ui/BonusChoiceLayout';
import {
  bonusIllustrationTextureKey,
  bonusInventoryLabel,
} from '../ui/BonusPresentation';

export interface BonusSceneData {
  readonly offer: BonusOffer;
  readonly onResolve: (
    offerId: string,
    selection: BonusType | null,
  ) => boolean;
}

interface BonusCardPalette {
  readonly fill: number;
  readonly hover: number;
  readonly imageBed: number;
  readonly stroke: number;
  readonly badge: number;
  readonly titleColor: string;
}

interface BonusCardView {
  readonly container: Phaser.GameObjects.Container;
  readonly surface: Phaser.GameObjects.Graphics;
  readonly palette: BonusCardPalette;
  readonly hasStacks: boolean;
  readonly negative: boolean;
  hovered: boolean;
}

const NEGATIVE_BONUSES: ReadonlySet<BonusType> = new Set([
  'hide-under-blanket',
  'twitter-fight',
]);
const PANEL_CORNER_RADIUS = 38;
const BONUS_ILLUSTRATION_SIZE = 116;

export class BonusScene extends Phaser.Scene {
  #sceneData: BonusSceneData | null = null;
  #resolving = false;
  readonly #cards: BonusCardView[] = [];
  readonly #inputSurfaces: Phaser.GameObjects.Graphics[] = [];
  #skipSurface: Phaser.GameObjects.Graphics | null = null;
  #skipLabel: Phaser.GameObjects.Text | null = null;
  #skipHovered = false;
  #errorText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('bonus');
  }

  init(data: BonusSceneData): void {
    this.#sceneData = data;
    this.#resolving = false;
    this.#cards.length = 0;
    this.#inputSurfaces.length = 0;
    this.#skipSurface = null;
    this.#skipLabel = null;
    this.#skipHovered = false;
    this.#errorText = null;
  }

  preload(): void {
    for (const option of this.#sceneData?.offer.options ?? []) {
      const type = option.type;
      const key = bonusIllustrationTextureKey(type);
      if (!this.textures.exists(key)) {
        this.load.image(key, BONUS_DEFINITIONS[type].imagePath);
      }
    }
  }

  create(): void {
    const sceneData = this.#sceneData;
    if (sceneData === null) {
      throw new Error('BonusScene requires a bonus offer and resolver callback.');
    }

    const layout = createBonusChoiceLayout(sceneData.offer.options.length);
    this.game.canvas.style.cursor = 'default';

    const shade = this.add
      .rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        0x3c2946,
        0.68,
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

    const panel = this.createPanel(
      layout.panel.x,
      layout.panel.y,
      layout.panel.width,
      layout.panel.height,
    );
    const title = this.add
      .text(
        CANVAS_WIDTH / 2,
        layout.panel.y + 43,
        'Невеличка перерва',
        {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: '32px',
          color: '#51345f',
          fontStyle: 'bold',
          stroke: '#fff4cf',
          strokeThickness: 4,
        },
      )
      .setOrigin(0.5);
    const subtitle = this.add
      .text(
        CANVAS_WIDTH / 2,
        layout.panel.y + 84,
        `Рівень ${sceneData.offer.completedLevel} витримано · оберіть турботу про себе`,
        {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: '16px',
          color: '#806987',
        },
      )
      .setOrigin(0.5);

    const cardContainers: Phaser.GameObjects.Container[] = [];
    for (const cardLayout of layout.cards) {
      const option = sceneData.offer.options[cardLayout.index];
      if (option === undefined) {
        throw new Error('Bonus offer and bonus-card layout are out of sync.');
      }
      cardContainers.push(this.createBonusCard(
        cardLayout.x,
        cardLayout.y,
        option.type,
        option.currentStacks,
      ));
    }

    const skipObjects = this.createSkipButton(
      layout.skipButton.x,
      layout.skipButton.y,
      layout.skipButton.width,
      layout.skipButton.height,
    );
    this.#errorText = this.add
      .text(
        CANVAS_WIDTH / 2,
        layout.skipButton.y - 16,
        '',
        {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: '13px',
          color: '#b64f66',
          fontStyle: 'bold',
          backgroundColor: '#fff8e8e8',
          padding: { left: 8, right: 8, top: 3, bottom: 3 },
        },
      )
      .setOrigin(0.5, 1)
      .setVisible(false);

    const panelContainer = this.add
      .container(0, 0, [
        panel,
        title,
        subtitle,
        ...cardContainers,
        ...skipObjects,
        this.#errorText,
      ])
      .setY(16)
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
      duration: 230,
      ease: 'Back.easeOut',
    });
  }

  private createPanel(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Graphics {
    const panel = this.add.graphics();
    panel
      .fillStyle(0x2f2038, 0.3)
      .fillRoundedRect(x + 11, y + 13, width, height, PANEL_CORNER_RADIUS)
      .fillStyle(0xfff8e8, 1)
      .fillRoundedRect(x, y, width, height, PANEL_CORNER_RADIUS)
      .fillStyle(0xffefd8, 0.9)
      .fillRoundedRect(x + 22, y + 20, width - 44, 82, 27)
      .lineStyle(5, 0xb78aaa, 0.96)
      .strokeRoundedRect(x, y, width, height, PANEL_CORNER_RADIUS);
    return panel;
  }

  private createBonusCard(
    x: number,
    y: number,
    type: BonusType,
    currentStacks: number,
  ): Phaser.GameObjects.Container {
    const definition = BONUS_DEFINITIONS[type];
    const palette = cardPalette(type);
    const negative = NEGATIVE_BONUSES.has(type);
    const inventoryLabel = bonusInventoryLabel(currentStacks);
    const surface = this.add.graphics();
    surface.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        0,
        0,
        BONUS_CARD_WIDTH,
        BONUS_CARD_HEIGHT,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    const illustration = this.add
      .image(BONUS_CARD_WIDTH / 2, 76, bonusIllustrationTextureKey(type))
      .setDisplaySize(BONUS_ILLUSTRATION_SIZE, BONUS_ILLUSTRATION_SIZE);
    const title = this.add
      .text(BONUS_CARD_WIDTH / 2, 150, definition.title, {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: type === 'hide-under-blanket' ? '13px' : '15px',
        color: palette.titleColor,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: BONUS_CARD_WIDTH - 20 },
      })
      .setOrigin(0.5, 0);
    const description = this.add
      .text(BONUS_CARD_WIDTH / 2, 194, definition.description, {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '12px',
        color: negative ? '#ffd9df' : '#765f7d',
        align: 'center',
        lineSpacing: 1,
        wordWrap: { width: BONUS_CARD_WIDTH - 24 },
      })
      .setOrigin(0.5, 0)
      .setMaxLines(4);
    const stackText = this.add
      .text(
        BONUS_CARD_WIDTH / 2,
        BONUS_CARD_HEIGHT - 17,
        inventoryLabel,
        {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: '12px',
          color: '#51345f',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setVisible(inventoryLabel.length > 0);
    const container = this.add
      .container(x, y, [surface, illustration, title, description, stackText]);
    const view: BonusCardView = {
      container,
      surface,
      palette,
      hasStacks: inventoryLabel.length > 0,
      negative,
      hovered: false,
    };
    this.#cards.push(view);
    this.#inputSurfaces.push(surface);
    this.drawCard(view);

    surface.on('pointerover', () => {
      if (this.#resolving) {
        return;
      }
      view.hovered = true;
      playGameCue(this, AUDIO_KEYS.uiHover);
      this.drawCard(view);
      this.tweens.killTweensOf(illustration);
      this.tweens.add({
        targets: illustration,
        scaleX: illustration.scaleX * 1.035,
        scaleY: illustration.scaleY * 1.035,
        duration: 120,
        ease: 'Back.easeOut',
      });
    });
    surface.on('pointerout', () => {
      view.hovered = false;
      this.drawCard(view);
      this.tweens.killTweensOf(illustration);
      illustration.setDisplaySize(
        BONUS_ILLUSTRATION_SIZE,
        BONUS_ILLUSTRATION_SIZE,
      );
    });
    surface.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.resolve(type);
      },
    );
    return container;
  }

  private drawCard(view: BonusCardView): void {
    const fill = view.hovered && !this.#resolving
      ? view.palette.hover
      : view.palette.fill;
    const strokeWidth = view.hovered && !this.#resolving ? 4 : 3;
    view.surface
      .clear()
      .fillStyle(0x51345f, 0.17)
      .fillRoundedRect(4, 6, BONUS_CARD_WIDTH, BONUS_CARD_HEIGHT, 22)
      .fillStyle(fill, 1)
      .fillRoundedRect(0, 0, BONUS_CARD_WIDTH, BONUS_CARD_HEIGHT, 22)
      .fillStyle(view.palette.imageBed, 0.96)
      .fillRoundedRect(12, 11, BONUS_CARD_WIDTH - 24, 132, 17)
      .lineStyle(1, view.palette.stroke, 0.28)
      .lineBetween(16, 184, BONUS_CARD_WIDTH - 16, 184);
    if (view.hasStacks) {
      view.surface
        .fillStyle(view.palette.badge, 0.88)
        .fillRoundedRect(
          BONUS_CARD_WIDTH / 2 - 57,
          BONUS_CARD_HEIGHT - 29,
          114,
          22,
          11,
        );
    }
    if (view.negative) {
      view.surface
        .lineStyle(5, 0x491f33, 0.92)
        .strokeRoundedRect(5, 5, BONUS_CARD_WIDTH - 10, BONUS_CARD_HEIGHT - 10, 18)
        .lineStyle(3, 0xff829c, 0.24);
      for (let x = -20; x < BONUS_CARD_WIDTH; x += 26) {
        view.surface.lineBetween(x, 142, x + 28, 114);
      }
      view.surface
        .fillStyle(0xffcf65, 1)
        .fillTriangle(13, 13, 37, 13, 13, 37)
        .fillStyle(0x491f33, 1)
        .fillCircle(19, 21, 2)
        .fillRect(18, 24, 3, 7);
    }
    view.surface
      .lineStyle(strokeWidth, view.palette.stroke, 0.96)
      .strokeRoundedRect(0, 0, BONUS_CARD_WIDTH, BONUS_CARD_HEIGHT, 22);
  }

  private createSkipButton(
    x: number,
    y: number,
    width: number,
    height: number,
  ): readonly Phaser.GameObjects.GameObject[] {
    const surface = this.add.graphics();
    surface.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    const icon = this.add.graphics().setPosition(49, height / 2);
    icon
      .lineStyle(4, 0x765080, 1)
      .lineBetween(-12, 0, 11, 0)
      .lineBetween(4, -8, 13, 0)
      .lineBetween(4, 8, 13, 0);
    const label = this.add
      .text(width / 2 + 12, height / 2, 'Пропустити', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#51345f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [surface, icon, label]);
    this.#skipSurface = surface;
    this.#skipLabel = label;
    this.#inputSurfaces.push(surface);
    this.drawSkipButton(width, height);

    surface.on('pointerover', () => {
      if (this.#resolving) {
        return;
      }
      this.#skipHovered = true;
      playGameCue(this, AUDIO_KEYS.uiHover);
      this.drawSkipButton(width, height);
    });
    surface.on('pointerout', () => {
      this.#skipHovered = false;
      this.drawSkipButton(width, height);
    });
    surface.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.resolve(null);
      },
    );
    return [container];
  }

  private drawSkipButton(width: number, height: number): void {
    const surface = this.#skipSurface;
    if (surface === null) {
      return;
    }
    const fill = this.#skipHovered && !this.#resolving ? 0xffe5bd : 0xffefd2;
    surface
      .clear()
      .fillStyle(0x51345f, 0.2)
      .fillRoundedRect(4, 6, width, height, height / 2)
      .fillStyle(fill, 1)
      .fillRoundedRect(0, 0, width, height, height / 2)
      .fillStyle(0xfff8e8, 0.52)
      .fillRoundedRect(10, 7, width - 20, 9, 5)
      .lineStyle(this.#skipHovered ? 4 : 3, 0x9c718f, 0.96)
      .strokeRoundedRect(0, 0, width, height, height / 2);
  }

  private resolve(selection: BonusType | null): void {
    const sceneData = this.#sceneData;
    if (sceneData === null || this.#resolving) {
      return;
    }

    this.#resolving = true;
    this.setChoiceInputEnabled(false);
    this.#errorText?.setVisible(false);
    playGameCue(this, AUDIO_KEYS.uiClick);

    let accepted: boolean;
    try {
      accepted = sceneData.onResolve(sceneData.offer.id, selection);
    } catch (error: unknown) {
      this.#resolving = false;
      this.setChoiceInputEnabled(true);
      throw error;
    }

    if (!accepted) {
      this.#resolving = false;
      this.setChoiceInputEnabled(true);
      this.#errorText
        ?.setText('Не вдалося застосувати вибір. Спробуйте ще раз.')
        .setVisible(true);
      playGameCue(this, AUDIO_KEYS.invalid);
      return;
    }

    this.scene.resume('game');
    this.scene.stop();
  }

  private setChoiceInputEnabled(enabled: boolean): void {
    for (const surface of this.#inputSurfaces) {
      if (surface.input !== null) {
        surface.input.enabled = enabled;
      }
    }
    for (const card of this.#cards) {
      card.container.setAlpha(enabled ? 1 : 0.68);
      this.drawCard(card);
    }
    this.#skipLabel?.setAlpha(enabled ? 1 : 0.62);
    this.#skipSurface?.setAlpha(enabled ? 1 : 0.68);
    if (this.#skipSurface !== null) {
      this.drawSkipButton(BONUS_SKIP_WIDTH, BONUS_SKIP_HEIGHT);
    }
  }
}

function cardPalette(type: BonusType): BonusCardPalette {
  switch (type) {
    case 'vacation':
      return palette(0xe1efdf, 0xd2e8d0, 0xf2f8ed, 0x668564, 0xbddbb9);
    case 'social-hobby':
      return palette(0xffe5e1, 0xffd7d4, 0xfff4ec, 0xbd7082, 0xf5bdc7);
    case 'move':
      return palette(0xe8def2, 0xded0ed, 0xf6effa, 0x846493, 0xd2bae3);
    case 'earplugs':
      return palette(0xffebbd, 0xffdfa0, 0xfff6db, 0xb47b42, 0xf3ca72);
    case 'burn-bridges':
      return palette(0xffdfcf, 0xffcfbe, 0xfff1e7, 0xbd6d5f, 0xf2ad98);
    case 'wider-thinking':
      return palette(0xdde9f5, 0xcfe0f1, 0xf0f6fb, 0x647f9d, 0xb6d2e8);
    case 'cat-treats':
      return palette(0xffedc8, 0xffdfaa, 0xfff7e2, 0xa97745, 0xf1c777);
    case 'pet-cats':
      return palette(0xf7deec, 0xf1cee2, 0xffeff7, 0xa96789, 0xe7b4d1);
    case 'thick-literature':
      return palette(0xeadfce, 0xdfcfbb, 0xf7f0e7, 0x8e6c55, 0xd3b99d);
    case 'social-debt':
      return palette(0xdcece4, 0xcde3d8, 0xf0f8f2, 0x5f8778, 0xb4d5c4);
    case 'hide-under-blanket':
      return {
        fill: 0x5a263d,
        hover: 0x713049,
        imageBed: 0x321e31,
        stroke: 0xf05c78,
        badge: 0xf3a0ad,
        titleColor: '#fff1e3',
      };
    case 'twitter-fight':
      return {
        fill: 0x28354f,
        hover: 0x344764,
        imageBed: 0x18243d,
        stroke: 0xf06c8c,
        badge: 0xe59ab0,
        titleColor: '#fff1e3',
      };
  }
  throw new RangeError(`Unknown bonus type: ${String(type)}`);
}

function palette(
  fill: number,
  hover: number,
  imageBed: number,
  stroke: number,
  badge: number,
): BonusCardPalette {
  return {
    fill,
    hover,
    imageBed,
    stroke,
    badge,
    titleColor: '#51345f',
  };
}
