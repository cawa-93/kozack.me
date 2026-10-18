import Phaser from 'phaser';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_SIZE,
  GRID_HEIGHT,
  GRID_WIDTH,
} from '../../config/gameConfig';
import type { EnemyType } from '../../domain/enemies/EnemyDefinition';
import type { GridPoint } from '../../domain/grid/GridPoint';
import type { TowerType } from '../../domain/structures/Tower';
import type { MineType } from '../../domain/structures/Mine';
import { WALL_COST, wallIdAt } from '../../domain/structures/Wall';
import { BONUS_DEFINITIONS } from '../../domain/bonuses';
import {
  PROTOTYPE_CAMPAIGN,
  ROACH_LEVEL_NUMBERS,
} from '../../data/levels';
import { getTowerDefinition } from '../../data/towers';
import { getMineDefinition } from '../../data/mines';
import {
  canPanCamera,
  centeredCameraScroll,
  clampScrollToHalfViewport,
  keyboardPanDelta,
  scrollForZoomAtPointer,
} from '../input/CameraMath';
import { connectedGridLine } from '../input/GridLine';
import {
  cellsInGridRectangle,
  gridRectangleBounds,
} from '../input/GridRectangle';
import {
  extractPrototypeTextures,
  PROTOTYPE_ARENA_FLOOR,
  PROTOTYPE_ATLAS_SOURCE,
  PROTOTYPE_ROACH_SOURCE,
  PROTOTYPE_STRONG_CROWD_SOURCE,
  PrototypeTexture,
} from '../assets/PrototypeAtlas';
import {
  BOOK_STACK_TEXTURE_SOURCE,
  createWallAutotileTextures,
  wallAutotileMask,
  wallAutotileTextureKey,
} from '../assets/WallAutotiles';
import {
  createHeroineTextures,
  HEROINE_STATE_25_SOURCE,
  HEROINE_STATE_50_SOURCE,
  HEROINE_STATE_75_SOURCE,
  heroineTextureKey,
} from '../assets/HeroineTextures';
import {
  CAT_MAGIC_PROJECTILE_TEXTURE,
  createTowerTextures,
  KITTEN_TOWER_SOURCE,
  towerTextureKey,
  WIZARD_CAT_ATLAS_SOURCE,
} from '../assets/TowerTextures';
import {
  createMineTextures,
  SHEER_HEART_ATTACK_SOURCE,
  SHEER_HEART_ATTACK_TEXTURE,
} from '../assets/MineTextures';
import {
  DEBRIS_DISPLAY_HEIGHT,
  DEBRIS_DISPLAY_WIDTH,
  createDebrisTextures,
  debrisTextureKey,
  debrisVariantIndex,
} from '../assets/DebrisTextures';
import {
  GameSimulation,
  type RuntimeEnemy,
  type TowerBuildResult,
} from '../../systems/GameSimulation';
import type { SimulationEvent } from '../../systems/SimulationEvent';
import { updateHighScore } from '../../persistence/HighScoreStore';
import {
  enemySpriteFlipX,
  rotationForRightFacingSprite,
  rotationForUpFacingSprite,
  shouldShowHealth,
  towerCastScale,
} from '../views/CombatViewMath';
import {
  gameSpeedForStatus,
  isLevelSpeedControlVisible,
  scaleSimulationDelta,
  toggleGameSpeed,
  type GameSpeed,
  type SelectableGameSpeed,
} from '../GameSpeed';
import { AUDIO_KEYS } from '../audio/AudioAssets';
import {
  clearCombatAudioQueue,
  flushCombatAudio,
  playDefeatCue,
  playGameCue,
  playKittenMeowCue,
  preloadGameAudio,
  queueTowerShotCue,
  setGameMusic,
} from '../audio/GameAudio';
import type { BonusSceneData } from './BonusScene';
import type { PauseSceneData } from './PauseScene';
import { bonusIllustrationTextureKey } from '../ui/BonusPresentation';
import { centerBuildPrice } from '../ui/BuildPriceLayout';
import { actionDockLayout } from '../ui/ActionDockLayout';
import {
  spawnMarkerAnimation,
  spawnMarkerPlacement,
} from '../views/SpawnMarkerMath';
import {
  GUEST_DIALOGUE_LIFETIME_MS,
  MAX_GUEST_DIALOGUES,
  guestDialogueFrame,
  guestDialogueIntervalMs,
  isWithinGuestDialogueRadius,
} from '../views/GuestDialoguePresentation';
import { heroineVisualState } from '../views/HeroineVisualState';
import { getGuestDialogueCatalog } from '../dialogue/GuestDialoguePhrases';

interface ButtonView {
  readonly background: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly width: number;
  readonly height: number;
  fillColor: number;
  hovered: boolean;
}

interface BuildButtonPalette {
  readonly fill: number;
  readonly hover: number;
  readonly selected: number;
  readonly iconBed: number;
  readonly stroke: number;
}

interface BuildButtonView {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly icon: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  readonly footerIcon: Phaser.GameObjects.Graphics;
  readonly tool: BuildTool;
  readonly tooltipTitle: string;
  readonly tooltipBody: string;
  readonly palette: BuildButtonPalette;
  enabled: boolean;
  selected: boolean;
}

type TowerButtonView = BuildButtonView;

interface EnemyView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly healthBack: Phaser.GameObjects.Rectangle;
  readonly healthFill: Phaser.GameObjects.Rectangle;
}

interface TowerView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly baseScaleX: number;
  readonly baseScaleY: number;
  castTween: Phaser.Tweens.Tween | null;
}

interface MineView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  pulsing: boolean;
}

interface SpawnView {
  readonly anchor: Phaser.GameObjects.Arc;
  readonly bubble: Phaser.GameObjects.Container;
  readonly baseBubbleX: number;
  readonly baseBubbleY: number;
  readonly phaseMs: number;
}

interface GuestDialogueView {
  readonly enemyId: string;
  readonly container: Phaser.GameObjects.Container;
  elapsedMs: number;
}

type BuildTool = 'wall' | 'sell' | TowerType | MineType;

export interface GameSceneData {
  readonly developmentRun: boolean;
  readonly initialLevelNumber: number;
  readonly initialCoinBonus: number;
}

const UI_DEPTH = 1_000;
const STATUS_PANEL_BOUNDS = new Phaser.Geom.Rectangle(14, 14, 402, 82);
const BUILD_PANEL_BOUNDS = new Phaser.Geom.Rectangle(14, 930, 484, 136);
const ACTION_DOCK_LAYOUT = actionDockLayout(CANVAS_WIDTH, CANVAS_HEIGHT);
const ACTION_DOCK_BOUNDS = new Phaser.Geom.Rectangle(
  ACTION_DOCK_LAYOUT.hitArea.x,
  ACTION_DOCK_LAYOUT.hitArea.y,
  ACTION_DOCK_LAYOUT.hitArea.width,
  ACTION_DOCK_LAYOUT.hitArea.height,
);
const BUILD_CARD_WIDTH = 84;
const BUILD_CARD_HEIGHT = 116;
const BUILD_CARD_GAP = 10;
const BUILD_PANEL_PADDING = 10;
const BUILD_TOOLTIP_WIDTH = 244;
const BUILD_PRICE_COIN_DIAMETER = 20 * 0.68;
const BUILD_PRICE_GAP = 4;
const WORLD_DEPTH_BASE = 100;
const CAMERA_MIN_ZOOM = 1;
const CAMERA_MAX_ZOOM = 2.5;
const CAMERA_ZOOM_STEP = 0.25;
const CAMERA_KEYBOARD_SPEED = 480;
const CAMERA_DRAG_THRESHOLD = 4;

export class GameScene extends Phaser.Scene {
  #simulation!: GameSimulation;
  readonly #spawnViews = new Map<string, SpawnView>();
  readonly #debrisViews = new Map<string, Phaser.GameObjects.Image>();
  readonly #wallViews = new Map<string, Phaser.GameObjects.Image>();
  readonly #towerViews = new Map<string, TowerView>();
  readonly #mineViews = new Map<string, MineView>();
  readonly #enemyViews = new Map<string, EnemyView>();
  readonly #guestDialogueViews = new Map<number, GuestDialogueView>();
  readonly #queuedWallCells = new Map<string, GridPoint>();

  #buildTool: BuildTool | null = null;
  #paintingWalls = false;
  #lastPaintCell: GridPoint | null = null;
  #sellSelectionStart: GridPoint | null = null;
  #sellSelectionEnd: GridPoint | null = null;
  #panningCamera = false;
  #panMoved = false;
  #panPointerStartX = 0;
  #panPointerStartY = 0;
  #panScrollStartX = 0;
  #panScrollStartY = 0;
  #gridOverlay!: Phaser.GameObjects.Graphics;
  #hoverOverlay!: Phaser.GameObjects.Graphics;
  #coreView!: Phaser.GameObjects.Image;
  #interfacePanel!: Phaser.GameObjects.Container;
  #buildPanelBackground!: Phaser.GameObjects.Graphics;
  #buildTooltip!: Phaser.GameObjects.Container;
  #buildTooltipBackground!: Phaser.GameObjects.Graphics;
  #buildTooltipTitle!: Phaser.GameObjects.Text;
  #buildTooltipBody!: Phaser.GameObjects.Text;
  #hoveredBuildButton: BuildButtonView | null = null;
  #buildPanelRenderedWidth = 0;
  #wallButton!: BuildButtonView;
  #sellButton!: BuildButtonView;
  #basicTowerButton!: TowerButtonView;
  #rapidTowerButton!: TowerButtonView;
  #heavyTowerButton!: TowerButtonView;
  #kittenTowerButton!: TowerButtonView;
  #mineButton!: BuildButtonView;
  #actionDock!: Phaser.GameObjects.Container;
  #startButton!: ButtonView;
  #startIcon!: Phaser.GameObjects.Graphics;
  #startControlVisible = false;
  #speed2Button!: ButtonView;
  #speed4Button!: ButtonView;
  #speed10Button!: ButtonView;
  #speedControlsVisible = false;
  #statusText!: Phaser.GameObjects.Text;
  #phaseText!: Phaser.GameObjects.Text;
  #phaseCard!: Phaser.GameObjects.Graphics;
  #phaseCardFill = -1;
  #coinsText!: Phaser.GameObjects.Text;
  #guestTotalText!: Phaser.GameObjects.Text;
  #socialBatteryFill!: Phaser.GameObjects.Rectangle;
  #socialBatteryLabel!: Phaser.GameObjects.Text;
  #helpText!: Phaser.GameObjects.Text;
  #toastText!: Phaser.GameObjects.Text;
  #uiCamera!: Phaser.Cameras.Scene2D.Camera;
  #endOverlay: Phaser.GameObjects.Container | null = null;
  #toastTimer: Phaser.Time.TimerEvent | null = null;
  #pauseRequested = false;
  #bonusRequested = false;
  #developmentRun = false;
  #animationTimeMs = 0;
  #ambientTimeMs = 0;
  #nextGuestDialogueInMs: number | null = null;
  #nextGuestDialogueOrdinal = 1;
  #gameSpeed: GameSpeed = 1;
  #cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  #wasdKeys: Readonly<{
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  }> | null = null;

  constructor() {
    super('game');
  }

  init(data: Partial<GameSceneData> = {}): void {
    this.#guestDialogueViews.clear();
    this.#sellSelectionStart = null;
    this.#sellSelectionEnd = null;
    this.#nextGuestDialogueInMs = null;
    this.#nextGuestDialogueOrdinal = 1;
    this.#gameSpeed = 1;
    this.#developmentRun = import.meta.env.DEV
      && data.developmentRun === true;
    const initialLevelNumber = this.#developmentRun
      ? data.initialLevelNumber ?? 1
      : 1;
    const initialCoinBonus = this.#developmentRun
      ? data.initialCoinBonus ?? 0
      : 0;
    this.#simulation = new GameSimulation(
      PROTOTYPE_CAMPAIGN,
      undefined,
      { initialLevelNumber, initialCoinBonus },
    );
  }

  preload(): void {
    preloadGameAudio(this);
    this.load.image(
      PROTOTYPE_ATLAS_SOURCE,
      `${import.meta.env.BASE_URL}assets/social-character-atlas-v1.png`,
    );
    this.load.image(
      PROTOTYPE_STRONG_CROWD_SOURCE,
      `${import.meta.env.BASE_URL}assets/social-crowd-strong-v2.png`,
    );
    this.load.image(
      PROTOTYPE_ROACH_SOURCE,
      `${import.meta.env.BASE_URL}assets/social-roach-special-v1.png`,
    );
    this.load.image(
      PROTOTYPE_ARENA_FLOOR,
      `${import.meta.env.BASE_URL}assets/cozy-arena-floor-v2.png`,
    );
    this.load.image(
      BOOK_STACK_TEXTURE_SOURCE,
      `${import.meta.env.BASE_URL}assets/book-stack-texture-v2.png`,
    );
    this.load.image(
      WIZARD_CAT_ATLAS_SOURCE,
      `${import.meta.env.BASE_URL}assets/wizard-cat-atlas-v1.png`,
    );
    this.load.image(
      KITTEN_TOWER_SOURCE,
      `${import.meta.env.BASE_URL}assets/kitten-defense-v1.png`,
    );
    this.load.image(
      SHEER_HEART_ATTACK_SOURCE,
      `${import.meta.env.BASE_URL}assets/sheer-heart-attack-mine-v1.png`,
    );
    this.load.image(
      bonusIllustrationTextureKey('hide-under-blanket'),
      BONUS_DEFINITIONS['hide-under-blanket'].imagePath,
    );
    this.load.image(
      HEROINE_STATE_75_SOURCE,
      `${import.meta.env.BASE_URL}assets/heroine/introvert-girl-state-75-v1.png`,
    );
    this.load.image(
      HEROINE_STATE_50_SOURCE,
      `${import.meta.env.BASE_URL}assets/heroine/introvert-girl-state-50-v1.png`,
    );
    this.load.image(
      HEROINE_STATE_25_SOURCE,
      `${import.meta.env.BASE_URL}assets/heroine/introvert-girl-state-25-v1.png`,
    );
  }

  create(): void {
    setGameMusic(this, 'level');
    extractPrototypeTextures(this);
    createHeroineTextures(this);
    createWallAutotileTextures(this);
    createTowerTextures(this);
    createMineTextures(this);
    createDebrisTextures(this);
    this.cameras.main.removeBounds().setZoom(CAMERA_MIN_ZOOM);
    this.cameras.main.roundPixels = true;
    this.createPlayfield();
    this.createGridOverlay();
    const worldObjects = [...this.children.list];
    this.createInterface();
    this.createUiCamera(worldObjects);
    this.bindInput();
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.clearGuestDialogues,
      this,
    );
    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.cancelSellSelection,
      this,
    );
    this.syncViews();
    this.updateInterface();
  }

  override update(_time: number, delta: number): void {
    if (this.#pauseRequested) {
      return;
    }
    this.#ambientTimeMs += delta;
    this.updateKeyboardCamera(delta);
    this.flushQueuedWalls();
    const scaledDelta = scaleSimulationDelta(delta, this.#gameSpeed);
    this.#animationTimeMs += scaledDelta;
    this.#simulation.update(scaledDelta);
    this.handleSimulationEvents(this.#simulation.drainEvents());
    flushCombatAudio(this);
    this.syncViews();
    this.updateGuestDialogues(delta);
    this.updateInterface();
  }

  private createPlayfield(): void {
    this.add
      .rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        0x4b3655,
      )
      .setDepth(-20);

    this.add
      .image(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        PROTOTYPE_ARENA_FLOOR,
      )
      .setDisplaySize(CANVAS_WIDTH, CANVAS_HEIGHT)
      .setAlpha(1)
      .setDepth(-10);

    const rim = this.add.graphics().setDepth(5);
    rim.fillStyle(0x6f526d, 0.58);
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        if (x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1) {
          rim.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    const coreX = this.cellCenterX(this.#simulation.grid.core.x);
    const coreY = this.cellCenterY(this.#simulation.grid.core.y);
    this.add
      .ellipse(coreX + 2, coreY + 15, 43, 15, 0x51345f, 0.22)
      .setDepth(this.worldDepth(coreY, 1));
    this.#coreView = this.add
      .image(
        coreX,
        coreY - 8,
        PrototypeTexture.Core,
      )
      .setDisplaySize(70, 70)
      .setDepth(this.worldDepth(coreY, 3));
    this.tweens.add({
      targets: this.#coreView,
      y: coreY - 11,
      angle: 1.5,
      duration: 1_350,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private createGridOverlay(): void {
    this.#gridOverlay = this.add.graphics().setDepth(20);
    this.#gridOverlay.fillStyle(0xe9788f, 0.14);
    this.#gridOverlay.fillRect(0, 0, CANVAS_WIDTH, CELL_SIZE);
    this.#gridOverlay.fillRect(
      0,
      CANVAS_HEIGHT - CELL_SIZE,
      CANVAS_WIDTH,
      CELL_SIZE,
    );
    this.#gridOverlay.fillRect(0, CELL_SIZE, CELL_SIZE, CANVAS_HEIGHT - CELL_SIZE * 2);
    this.#gridOverlay.fillRect(
      CANVAS_WIDTH - CELL_SIZE,
      CELL_SIZE,
      CELL_SIZE,
      CANVAS_HEIGHT - CELL_SIZE * 2,
    );
    this.#gridOverlay.lineStyle(1, 0x765080, 0.42);
    for (let x = 0; x <= GRID_WIDTH; x += 1) {
      this.#gridOverlay.lineBetween(
        x * CELL_SIZE,
        0,
        x * CELL_SIZE,
        CANVAS_HEIGHT,
      );
    }
    for (let y = 0; y <= GRID_HEIGHT; y += 1) {
      this.#gridOverlay.lineBetween(
        0,
        y * CELL_SIZE,
        CANVAS_WIDTH,
        y * CELL_SIZE,
      );
    }
    this.#gridOverlay.setVisible(false);

    this.#hoverOverlay = this.add.graphics().setDepth(3_001).setVisible(false);
  }

  private createInterface(): void {
    this.#buildPanelBackground = this.add.graphics().setDepth(UI_DEPTH);

    const sellIcon = this.createTrashIcon(
      BUILD_CARD_WIDTH / 2,
      42,
    ).setScale(1.35);
    this.#sellButton = this.createBuildButton(
      'sell',
      sellIcon,
      null,
      'Продати',
      'Повертає повну вартість книжок і котика на них.',
      () => {
        if (!this.#simulation.canBuild) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast('Продаж доступний між рівнями');
          return;
        }
        this.selectBuildTool(this.#buildTool === 'sell' ? null : 'sell');
      },
      {
        fill: 0xffe7df,
        hover: 0xffd8d2,
        selected: 0xf6bdca,
        iconBed: 0xfff4ec,
        stroke: 0xc87588,
      },
    );

    const wallIcon = this.add
      .image(BUILD_CARD_WIDTH / 2, 42, wallAutotileTextureKey(0))
      .setDisplaySize(58, 58)
      .setDepth(UI_DEPTH + 3);
    this.#wallButton = this.createBuildButton(
      'wall',
      wallIcon,
      WALL_COST,
      'Стопка книг',
      'Змінює шлях гостей. Затисни ЛКМ, щоб малювати ряд.',
      () => {
        if (!this.#simulation.canBuild) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast('Будівництво доступне між рівнями');
          return;
        }
        this.selectBuildTool(this.#buildTool === 'wall' ? null : 'wall');
      },
      {
        fill: 0xfff0cf,
        hover: 0xffe7bd,
        selected: 0xffd99a,
        iconBed: 0xfff8e8,
        stroke: 0xb9875d,
      },
    );

    this.#basicTowerButton = this.createTowerButton('basic');
    this.#rapidTowerButton = this.createTowerButton('rapid');
    this.#heavyTowerButton = this.createTowerButton('heavy');
    this.#kittenTowerButton = this.createTowerButton('kitten');
    this.#mineButton = this.createMineButton('sheer-heart-attack');

    this.#interfacePanel = this.add
      .container(0, 0, [
        this.#buildPanelBackground,
        this.#sellButton.container,
        this.#wallButton.container,
        this.#basicTowerButton.container,
        this.#rapidTowerButton.container,
        this.#heavyTowerButton.container,
        this.#kittenTowerButton.container,
        this.#mineButton.container,
      ])
      .setDepth(UI_DEPTH);
    this.createBuildTooltip();
    this.layoutBuildButtons();

    this.#helpText = this.add
      .text(CANVAS_WIDTH / 2, BUILD_PANEL_BOUNDS.y - 8, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '13px',
        color: '#51345f',
        backgroundColor: '#fff8e8f2',
        padding: { left: 9, right: 9, top: 3, bottom: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH);

    this.#toastText = this.add
      .text(CANVAS_WIDTH / 2, 165, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '18px',
        color: '#51345f',
        backgroundColor: '#fff4cfee',
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(UI_DEPTH + 10);

    this.createStatusPanel();
    this.createActionDock();
  }

  private createStatusPanel(): void {
    const panel = this.add.graphics();
    const drawChip = (
      x: number,
      y: number,
      width: number,
      height: number,
      fill: number,
      radius: number,
    ): void => {
      panel
        .fillStyle(0x51345f, 0.13)
        .fillRoundedRect(x + 3, y + 4, width, height, radius)
        .fillStyle(fill, 0.98)
        .fillRoundedRect(x, y, width, height, radius)
        .lineStyle(2, 0x765080, 0.72)
        .strokeRoundedRect(x, y, width, height, radius);
    };
    drawChip(14, 14, 112, 34, 0xfff0c9, 12);
    drawChip(14, 54, 90, 42, 0xffe9ae, 14);
    drawChip(112, 54, 98, 42, 0xe8dcf3, 14);
    drawChip(218, 54, 198, 42, 0xf9dfe2, 14);
    panel
      .fillStyle(0xb99bc9, 0.72)
      .fillRoundedRect(89, 10, 27, 8, 3)
      .lineStyle(1, 0xfff8e8, 0.72)
      .lineBetween(94, 14, 111, 14);

    this.#phaseCard = this.add.graphics().setPosition(132, 14);
    this.drawPhaseCard(0xdde8d0);

    const levelCaption = this.add.text(27, 31, 'РІВЕНЬ', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '10px',
      color: '#765080',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.#statusText = this.add.text(96, 31, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '18px',
      color: '#51345f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const phaseIcon = this.createStatusPhaseIcon(151, 31);
    this.#phaseText = this.add.text(169, 31, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '14px',
      color: '#51345f',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const coinIcon = this.createCoinIcon(33, 75, 0.88);
    this.#coinsText = this.add.text(50, 75, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '16px',
      color: '#51345f',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const guestIcon = this.createGuestNoiseIcon(132, 75);
    this.#guestTotalText = this.add.text(149, 75, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '16px',
      color: '#51345f',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const batteryIcon = this.createBatteryIcon(239, 75).setScale(0.76);
    const batteryBack = this.add
      .rectangle(254, 75, 148, 18, 0x51345f, 1)
      .setOrigin(0, 0.5);
    this.#socialBatteryFill = this.add
      .rectangle(257, 75, 142, 12, 0x6bc5a4, 1)
      .setOrigin(0, 0.5);
    this.#socialBatteryLabel = this.add
      .text(328, 75, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '12px',
        color: '#3f294a',
        fontStyle: 'bold',
        stroke: '#fff8e8',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.add
      .container(0, 0, [
        panel,
        this.#phaseCard,
        levelCaption,
        this.#statusText,
        phaseIcon,
        this.#phaseText,
        coinIcon,
        this.#coinsText,
        guestIcon,
        this.#guestTotalText,
        batteryIcon,
        batteryBack,
        this.#socialBatteryFill,
        this.#socialBatteryLabel,
      ])
      .setDepth(UI_DEPTH + 5);
  }

  private createActionDock(): void {
    const { panel: bounds, startButton, speedButtons } = ACTION_DOCK_LAYOUT;
    const panel = this.add.graphics();
    panel
      .fillStyle(0x51345f, 0.13)
      .fillRoundedRect(
        bounds.x + 4,
        bounds.y + 4,
        bounds.width,
        bounds.height,
        20,
      )
      .fillStyle(0xfff8e8, 0.98)
      .fillRoundedRect(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        20,
      )
      .fillStyle(0xb99bc9, 0.6)
      .fillRoundedRect(bounds.x + 119, bounds.y - 3, 42, 8, 3)
      .lineStyle(1, 0xfff8e8, 0.72)
      .lineBetween(bounds.x + 125, bounds.y + 1, bounds.x + 155, bounds.y + 1)
      .lineStyle(2, 0x765080, 0.72)
      .strokeRoundedRect(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        20,
      );

    this.#startButton = this.createButton(
      startButton.x,
      startButton.y,
      startButton.width,
      startButton.height,
      'ПОЧАТИ',
      () => {
        if (this.#simulation.startLevel()) {
          this.selectBuildTool(null);
          this.showToast('До дверей уже хтось іде…');
        } else {
          playGameCue(this, AUDIO_KEYS.invalid);
        }
      },
    );
    this.#startButton.label.setPosition(
      startButton.x + 126,
      startButton.y + startButton.height / 2,
    );
    this.#startIcon = this.createPlayIcon(
      startButton.x + 44,
      startButton.y + startButton.height / 2,
    );
    this.setActionButtonFill(this.#startButton, 0xc4e6d8);
    this.#startButton.background.setDepth(UI_DEPTH + 31);
    this.#startButton.label.setDepth(UI_DEPTH + 32);
    this.#startIcon.setDepth(UI_DEPTH + 32);

    const [speed2, speed4, speed10] = speedButtons;
    this.#speed2Button = this.createButton(
      speed2.x,
      speed2.y,
      speed2.width,
      speed2.height,
      '2×',
      () => this.selectGameSpeed(2),
    );
    this.#speed4Button = this.createButton(
      speed4.x,
      speed4.y,
      speed4.width,
      speed4.height,
      '4×',
      () => this.selectGameSpeed(4),
    );
    this.#speed10Button = this.createButton(
      speed10.x,
      speed10.y,
      speed10.width,
      speed10.height,
      '10×',
      () => this.selectGameSpeed(10),
    );
    for (const button of [
      this.#speed2Button,
      this.#speed4Button,
      this.#speed10Button,
    ]) {
      button.background.setDepth(UI_DEPTH + 31).setVisible(false);
      button.label.setDepth(UI_DEPTH + 32).setVisible(false);
    }
    this.#actionDock = this.add
      .container(0, 0, [panel])
      .setDepth(UI_DEPTH + 30);
  }

  private drawPhaseCard(fillColor: number): void {
    if (this.#phaseCardFill === fillColor) {
      return;
    }
    this.#phaseCardFill = fillColor;
    this.#phaseCard
      .clear()
      .fillStyle(0x51345f, 0.13)
      .fillRoundedRect(3, 4, 284, 34, 12)
      .fillStyle(fillColor, 0.98)
      .fillRoundedRect(0, 0, 284, 34, 12)
      .fillStyle(0xfff8e8, 0.45)
      .fillRoundedRect(9, 5, 264, 5, 2)
      .lineStyle(2, 0x765080, 0.72)
      .strokeRoundedRect(0, 0, 284, 34, 12);
  }

  private createTowerButton(type: TowerType): TowerButtonView {
    const icon = this.add
      .image(BUILD_CARD_WIDTH / 2, 42, towerTextureKey(type))
      .setDisplaySize(type === 'heavy' ? 62 : 58, type === 'heavy' ? 62 : 58)
      .setDepth(UI_DEPTH + 3);
    const content = this.towerTooltip(type);
    return this.createBuildButton(
      type,
      icon,
      getTowerDefinition(type).cost,
      content.title,
      content.body,
      () => {
        if (!this.#simulation.canBuild) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast('Будівництво доступне між рівнями');
          return;
        }
        if (!this.#simulation.isTowerUnlocked(type)) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast(
            `Цей котик відкриється на рівні ${this.#simulation.towerUnlockLevel(type)}`,
          );
          return;
        }
        this.selectBuildTool(this.#buildTool === type ? null : type);
      },
      this.towerButtonPalette(type),
    );
  }

  private createMineButton(type: MineType): BuildButtonView {
    const definition = getMineDefinition(type);
    const icon = this.add
      .image(BUILD_CARD_WIDTH / 2, 42, SHEER_HEART_ATTACK_TEXTURE)
      .setDisplaySize(62, 62)
      .setDepth(UI_DEPTH + 3);
    return this.createBuildButton(
      type,
      icon,
      definition.cost,
      definition.name,
      definition.description,
      () => {
        if (!this.#simulation.canBuild) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast('Будівництво доступне між рівнями');
          return;
        }
        if (!this.#simulation.isMineUnlocked(type)) {
          playGameCue(this, AUDIO_KEYS.invalid);
          this.showToast(
            `Цей захист відкриється на рівні ${this.#simulation.mineUnlockLevel(type)}`,
          );
          return;
        }
        this.selectBuildTool(this.#buildTool === type ? null : type);
      },
      {
        fill: 0xddeaf0,
        hover: 0xcde0e8,
        selected: 0xaacdd9,
        iconBed: 0xeff7f8,
        stroke: 0x4d7888,
      },
    );
  }

  private createBuildButton(
    tool: BuildTool,
    icon: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics,
    price: number | null,
    tooltipTitle: string,
    tooltipBody: string,
    onClick: () => void,
    palette: BuildButtonPalette,
  ): BuildButtonView {
    const background = this.add.graphics().setDepth(UI_DEPTH + 1);
    background.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        0,
        0,
        BUILD_CARD_WIDTH,
        BUILD_CARD_HEIGHT,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    const footerIcon =
      price === null
        ? this.createReturnIcon(BUILD_CARD_WIDTH / 2, 96)
        : this.createCoinIcon(BUILD_CARD_WIDTH / 2, 96, 0.68);
    const label = this.add
      .text(
        BUILD_CARD_WIDTH / 2,
        96,
        price === null ? '' : `${price}`,
        {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '17px',
          color: '#51345f',
          fontStyle: 'bold',
        },
      )
      .setOrigin(price === null ? 0.5 : 0, 0.5)
      .setDepth(UI_DEPTH + 3);
    if (price !== null) {
      const priceLayout = centerBuildPrice(
        BUILD_CARD_WIDTH,
        BUILD_PRICE_COIN_DIAMETER,
        label.width,
        BUILD_PRICE_GAP,
      );
      footerIcon.setX(priceLayout.coinCenterX);
      label.setX(priceLayout.priceLeftX);
    }
    const container = this.add
      .container(0, 0, [background, icon, footerIcon, label])
      .setDepth(UI_DEPTH + 1);
    const button: BuildButtonView = {
      container,
      background,
      label,
      icon,
      footerIcon,
      tool,
      tooltipTitle,
      tooltipBody,
      palette,
      enabled: true,
      selected: false,
    };

    background.on('pointerover', () => {
      playGameCue(this, AUDIO_KEYS.uiHover);
      this.#hoveredBuildButton = button;
      this.drawBuildButton(button);
      this.showBuildTooltip(button);
    });
    background.on('pointerout', () => {
      if (this.#hoveredBuildButton === button) {
        this.#hoveredBuildButton = null;
        this.#buildTooltip.setVisible(false);
      }
      this.drawBuildButton(button);
    });
    background.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        playGameCue(this, AUDIO_KEYS.uiClick);
        onClick();
      },
    );
    this.drawBuildButton(button);
    return button;
  }

  private createBuildTooltip(): void {
    this.#buildTooltipBackground = this.add.graphics();
    this.#buildTooltipTitle = this.add.text(14, 10, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '16px',
      color: '#51345f',
      fontStyle: 'bold',
    });
    this.#buildTooltipBody = this.add.text(14, 35, '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '13px',
      color: '#765f7d',
      lineSpacing: 2,
      wordWrap: { width: BUILD_TOOLTIP_WIDTH - 28 },
    });
    this.#buildTooltip = this.add
      .container(0, 0, [
        this.#buildTooltipBackground,
        this.#buildTooltipTitle,
        this.#buildTooltipBody,
      ])
      .setDepth(UI_DEPTH + 60)
      .setVisible(false);
  }

  private showBuildTooltip(button: BuildButtonView): void {
    this.#buildTooltipTitle.setText(button.tooltipTitle);
    this.#buildTooltipBody.setText(button.tooltipBody);
    const height = Math.max(76, 47 + this.#buildTooltipBody.height);
    this.#buildTooltipBackground
      .clear()
      .fillStyle(0x51345f, 0.2)
      .fillRoundedRect(4, 5, BUILD_TOOLTIP_WIDTH, height, 16)
      .fillStyle(0xfff8e8, 0.99)
      .fillRoundedRect(0, 0, BUILD_TOOLTIP_WIDTH, height, 16)
      .lineStyle(2, 0xb58aa7, 0.9)
      .strokeRoundedRect(0, 0, BUILD_TOOLTIP_WIDTH, height, 16);
    const preferredX =
      button.container.x + BUILD_CARD_WIDTH / 2 - BUILD_TOOLTIP_WIDTH / 2;
    this.#buildTooltip
      .setPosition(
        Phaser.Math.Clamp(
          preferredX,
          14,
          CANVAS_WIDTH - BUILD_TOOLTIP_WIDTH - 14,
        ),
        BUILD_PANEL_BOUNDS.y - height - 10,
      )
      .setVisible(true);
  }

  private layoutBuildButtons(): void {
    const towerButtons: readonly (readonly [TowerType, TowerButtonView])[] = [
      ['basic', this.#basicTowerButton],
      ['rapid', this.#rapidTowerButton],
      ['heavy', this.#heavyTowerButton],
      ['kitten', this.#kittenTowerButton],
    ];
    const visibleButtons: BuildButtonView[] = [
      this.#sellButton,
      this.#wallButton,
    ];
    for (const [type, button] of towerButtons) {
      const visible = this.#simulation.isTowerUnlocked(type);
      button.container.setVisible(visible);
      if (button.background.input !== null) {
        button.background.input.enabled = visible;
      }
      if (visible) {
        visibleButtons.push(button);
      } else if (this.#hoveredBuildButton === button) {
        this.#hoveredBuildButton = null;
        this.#buildTooltip.setVisible(false);
      }
    }
    const mineVisible = this.#simulation.isMineUnlocked('sheer-heart-attack');
    this.#mineButton.container.setVisible(mineVisible);
    if (this.#mineButton.background.input !== null) {
      this.#mineButton.background.input.enabled = mineVisible;
    }
    if (mineVisible) {
      visibleButtons.push(this.#mineButton);
    } else if (this.#hoveredBuildButton === this.#mineButton) {
      this.#hoveredBuildButton = null;
      this.#buildTooltip.setVisible(false);
    }

    visibleButtons.forEach((button, index) => {
      button.container.setPosition(
        BUILD_PANEL_BOUNDS.x +
          BUILD_PANEL_PADDING +
          index * (BUILD_CARD_WIDTH + BUILD_CARD_GAP),
        BUILD_PANEL_BOUNDS.y + BUILD_PANEL_PADDING,
      );
    });
    const panelWidth =
      BUILD_PANEL_PADDING * 2 +
      visibleButtons.length * BUILD_CARD_WIDTH +
      Math.max(0, visibleButtons.length - 1) * BUILD_CARD_GAP;
    BUILD_PANEL_BOUNDS.width = panelWidth;
    if (this.#buildPanelRenderedWidth !== panelWidth) {
      this.#buildPanelRenderedWidth = panelWidth;
      this.drawBuildPanel(panelWidth);
    }
  }

  private drawBuildPanel(width: number): void {
    this.#buildPanelBackground
      .setPosition(BUILD_PANEL_BOUNDS.x, BUILD_PANEL_BOUNDS.y)
      .clear()
      .fillStyle(0x51345f, 0.2)
      .fillRoundedRect(4, 6, width, BUILD_PANEL_BOUNDS.height, 24)
      .fillStyle(0xfff8e8, 0.96)
      .fillRoundedRect(0, 0, width, BUILD_PANEL_BOUNDS.height, 24)
      .lineStyle(3, 0xb58aa7, 0.85)
      .strokeRoundedRect(0, 0, width, BUILD_PANEL_BOUNDS.height, 24);
  }

  private updateBuildButton(
    button: BuildButtonView,
    enabled: boolean,
    selected: boolean,
  ): void {
    if (button.enabled === enabled && button.selected === selected) {
      return;
    }
    button.enabled = enabled;
    button.selected = selected;
    button.container.setAlpha(enabled ? 1 : 0.52);
    this.drawBuildButton(button);
  }

  private drawBuildButton(button: BuildButtonView): void {
    const hovered = this.#hoveredBuildButton === button;
    const fill = button.selected
      ? button.palette.selected
      : hovered && button.enabled
        ? button.palette.hover
        : button.palette.fill;
    const strokeWidth = button.selected ? 4 : hovered ? 3 : 2;
    button.background
      .clear()
      .fillStyle(0x51345f, 0.17)
      .fillRoundedRect(3, 5, BUILD_CARD_WIDTH, BUILD_CARD_HEIGHT, 18)
      .fillStyle(fill, 1)
      .fillRoundedRect(0, 0, BUILD_CARD_WIDTH, BUILD_CARD_HEIGHT, 18)
      .fillStyle(button.palette.iconBed, 0.9)
      .fillRoundedRect(7, 7, BUILD_CARD_WIDTH - 14, 70, 13)
      .lineStyle(1, button.palette.stroke, 0.25)
      .lineBetween(12, 82, BUILD_CARD_WIDTH - 12, 82)
      .lineStyle(strokeWidth, button.palette.stroke, button.enabled ? 0.95 : 0.55)
      .strokeRoundedRect(0, 0, BUILD_CARD_WIDTH, BUILD_CARD_HEIGHT, 18);
    if (button.selected) {
      button.background
        .fillStyle(button.palette.stroke, 1)
        .fillCircle(BUILD_CARD_WIDTH - 12, 12, 4)
        .lineStyle(2, 0xfff8e8, 1)
        .strokeCircle(BUILD_CARD_WIDTH - 12, 12, 4);
    }
  }

  private towerTooltip(type: TowerType): Readonly<{
    title: string;
    body: string;
  }> {
    const definition = getTowerDefinition(type);
    switch (type) {
      case 'basic':
        return {
          title: 'Кіт-маг',
          body: `Влучні чари: ${definition.damagePerShot} шкоди · ${definition.shotsPerSecond}/с.`,
        };
      case 'rapid':
        return {
          title: 'Кіт-Іскра',
          body: `Швидкі чари: ${definition.damagePerShot} шкоди · ${definition.shotsPerSecond}/с.`,
        };
      case 'heavy':
        return {
          title: 'Кіт-Мудрець',
          body: `Цілиться в найщільнішу клітинку. ${definition.damagePerShot} прямої + ${definition.splashDamage} по клітинці; ${definition.adjacentSplashDamage} у 4 сусідніх. Раз на ${definition.attackIntervalMs / 1_000} с.`,
        };
      case 'kitten':
        return {
          title: 'Кошенятко',
          body: 'Неймовірно миленьке',
        };
    }
  }

  private towerButtonPalette(type: TowerType): BuildButtonPalette {
    switch (type) {
      case 'basic':
        return {
          fill: 0xeee2f5,
          hover: 0xe5d2f0,
          selected: 0xd6b9e7,
          iconBed: 0xf8effb,
          stroke: 0x8c6499,
        };
      case 'rapid':
        return {
          fill: 0xffebbc,
          hover: 0xffdfa0,
          selected: 0xf6c96f,
          iconBed: 0xfff6db,
          stroke: 0xba8645,
        };
      case 'heavy':
        return {
          fill: 0xdfead8,
          hover: 0xd2e3c8,
          selected: 0xbad5ad,
          iconBed: 0xf1f7ec,
          stroke: 0x668564,
        };
      case 'kitten':
        return {
          fill: 0xffe0e8,
          hover: 0xffd0dd,
          selected: 0xf5afc3,
          iconBed: 0xfff2f5,
          stroke: 0xb96784,
        };
    }
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ): ButtonView {
    const background = this.add
      .graphics()
      .setPosition(x, y)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      })
      .setDepth(UI_DEPTH + 1);
    const text = this.add
      .text(x + width / 2, y + height / 2, label, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '17px',
        color: '#51345f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 2);

    const button: ButtonView = {
      background,
      label: text,
      width,
      height,
      fillColor: 0xffead2,
      hovered: false,
    };
    background.on('pointerover', () => {
      playGameCue(this, AUDIO_KEYS.uiHover);
      button.hovered = true;
      this.drawActionButton(button);
    });
    background.on('pointerout', () => {
      button.hovered = false;
      this.drawActionButton(button);
    });
    background.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        playGameCue(this, AUDIO_KEYS.uiClick);
        onClick();
      },
    );
    this.drawActionButton(button);
    return button;
  }

  private setActionButtonFill(button: ButtonView, fillColor: number): void {
    if (button.fillColor === fillColor) {
      return;
    }
    button.fillColor = fillColor;
    this.drawActionButton(button);
  }

  private clearActionButtonHover(button: ButtonView): void {
    if (!button.hovered) {
      return;
    }
    button.hovered = false;
    this.drawActionButton(button);
  }

  private drawActionButton(button: ButtonView): void {
    const radius = Math.min(15, button.height / 2);
    const stroke = button.hovered ? 0xe9788f : 0x765080;
    button.background
      .clear()
      .fillStyle(0x51345f, 0.13)
      .fillRoundedRect(3, 4, button.width, button.height, radius)
      .fillStyle(button.fillColor, 1)
      .fillRoundedRect(0, 0, button.width, button.height, radius)
      .fillStyle(0xfff8e8, 0.42)
      .fillRoundedRect(8, 5, Math.max(0, button.width - 16), 5, 2)
      .lineStyle(button.hovered ? 3 : 2, stroke, button.hovered ? 0.95 : 0.72)
      .strokeRoundedRect(0, 0, button.width, button.height, radius);
  }

  private createCoinIcon(
    x: number,
    y: number,
    scale = 1,
  ): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon.fillStyle(0xf2bd62, 1);
    icon.fillCircle(0, 0, 10 * scale);
    icon.lineStyle(2 * scale, 0x9f663b, 1);
    icon.strokeCircle(0, 0, 8 * scale);
    icon.fillStyle(0xffe283, 1);
    icon.fillCircle(-2 * scale, -2 * scale, 2.5 * scale);
    return icon;
  }

  private createStatusPhaseIcon(
    x: number,
    y: number,
  ): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon
      .fillStyle(0xfff8e8, 0.85)
      .fillCircle(0, 0, 11)
      .lineStyle(2, 0x765080, 0.92)
      .strokeCircle(0, 0, 9)
      .lineBetween(-4, -2, -1, 1)
      .lineBetween(-1, 1, 4, -5)
      .fillStyle(0xe9788f, 1)
      .fillCircle(5, 5, 2.5);
    return icon;
  }

  private createGuestNoiseIcon(
    x: number,
    y: number,
  ): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon
      .fillStyle(0xfff8e8, 0.96)
      .fillRoundedRect(-12, -9, 23, 17, 7)
      .fillTriangle(-5, 7, 1, 7, -3, 12)
      .lineStyle(2, 0x765080, 0.92)
      .strokeRoundedRect(-12, -9, 23, 17, 7)
      .fillStyle(0x765080, 1)
      .fillCircle(-6, 0, 2)
      .fillCircle(0, 0, 2)
      .fillCircle(6, 0, 2);
    return icon;
  }

  private createTrashIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon.fillStyle(0xe9788f, 1);
    icon.fillRoundedRect(-8, -8, 16, 19, 3);
    icon.fillRoundedRect(-11, -13, 22, 5, 2);
    icon.fillRect(-4, -16, 8, 4);
    icon.lineStyle(2, 0xfff4cf, 0.9);
    icon.lineBetween(-3, -4, -3, 7);
    icon.lineBetween(3, -4, 3, 7);
    return icon;
  }

  private createReturnIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon.lineStyle(3, 0xc87588, 1);
    icon.lineBetween(-7, 0, 8, 0);
    icon.fillStyle(0xc87588, 1);
    icon.fillTriangle(-11, 0, -3, -6, -3, 6);
    return icon;
  }

  private createPlayIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon.fillStyle(0x51345f, 1);
    icon.fillTriangle(-9, -12, 13, 0, -9, 12);
    return icon;
  }

  private createBatteryIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const icon = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH + 3);
    icon.lineStyle(3, 0x765080, 1);
    icon.strokeRoundedRect(-13, -8, 23, 16, 3);
    icon.fillStyle(0x765080, 1);
    icon.fillRect(11, -4, 4, 8);
    icon.fillStyle(0xf2bd62, 1);
    icon.fillTriangle(-2, -6, -7, 2, -1, 2);
    icon.fillTriangle(-1, -2, 5, -2, 0, 6);
    return icon;
  }

  private bindInput(): void {
    this.input.mouse?.disableContextMenu();
    this.#cursorKeys = this.input.keyboard?.createCursorKeys() ?? null;
    const wasd = this.input.keyboard?.addKeys('W,S,A,D') as
      | Record<'W' | 'S' | 'A' | 'D', Phaser.Input.Keyboard.Key>
      | undefined;
    this.#wasdKeys =
      wasd === undefined
        ? null
        : {
            up: wasd.W,
            down: wasd.S,
            left: wasd.A,
            right: wasd.D,
          };
    this.game.canvas.style.cursor = this.cursorForCurrentTool();
    this.input.keyboard?.on(
      'keydown-ESC',
      (event: KeyboardEvent) => {
        if (!event.repeat) {
          this.openPauseMenu();
        }
      },
    );

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.#sellSelectionStart !== null) {
        if (
          pointer.leftButtonDown()
          && this.#buildTool === 'sell'
          && this.#simulation.canBuild
          && !this.isPointerOverHud(pointer.x, pointer.y)
        ) {
          this.updateSellSelection(pointer);
        } else if (!pointer.leftButtonDown()) {
          this.cancelSellSelection();
        }
      }

      if (this.#panningCamera) {
        if (pointer.leftButtonDown() && this.#buildTool !== 'wall') {
          this.panCamera(pointer);
        } else {
          this.stopCameraPan();
        }
      }

      const world = this.pointerWorldPosition(pointer);
      const point = this.worldToCell(world.x, world.y);
      if (this.#paintingWalls) {
        if (pointer.leftButtonDown() && point !== null) {
          this.queuePaintTo(point);
        } else if (!pointer.leftButtonDown()) {
          this.stopWallPainting();
        }
      }
      this.drawBuildHover(world.x, world.y);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (
        pointer.button !== 0 ||
        this.isPointerOverHud(pointer.x, pointer.y)
      ) {
        return;
      }

      if (this.#buildTool === 'sell') {
        this.startSellSelection(pointer);
        return;
      }

      if (this.#buildTool !== 'wall') {
        this.startCameraPan(pointer);
        return;
      }

      if (!this.#simulation.canBuild) {
        return;
      }
      const world = this.pointerWorldPosition(pointer);
      const point = this.worldToCell(world.x, world.y);
      if (point === null) {
        return;
      }
      this.#paintingWalls = true;
      this.#lastPaintCell = point;
      this.queueWallCell(point);
      this.drawBuildHover(world.x, world.y);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        if (this.#sellSelectionStart !== null) {
          this.finishSellSelection(pointer);
        } else if (this.#panningCamera) {
          const activateTool = !this.#panMoved;
          this.stopCameraPan();
          if (activateTool) {
            this.activateSelectedToolAt(pointer);
          }
        }
        this.stopWallPainting();
      }
    });

    this.input.on('gameout', () => {
      this.cancelSellSelection();
      this.stopCameraPan();
      this.stopWallPainting();
    });

    this.input.on(
      'wheel',
      (
        pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        if (
          this.#sellSelectionStart !== null
          || this.isPointerOverHud(pointer.x, pointer.y)
        ) {
          return;
        }
        this.zoomCameraAtPointer(pointer, deltaY);
      },
    );
  }

  private activateSelectedToolAt(pointer: Phaser.Input.Pointer): void {
    const tool = this.#buildTool;
    if (tool === null || tool === 'wall' || !this.#simulation.canBuild) {
      return;
    }

    const world = this.pointerWorldPosition(pointer);
    const point = this.worldToCell(world.x, world.y);
    if (point === null) {
      return;
    }

    if (tool === 'sell') {
      const result = this.#simulation.sellDefense(point);
      if (result.sold) {
        playGameCue(this, AUDIO_KEYS.sellRemove);
      } else if (result.reason === 'no-defense') {
        playGameCue(this, AUDIO_KEYS.invalid);
        this.showToast('На цій клітинці немає захисту');
      }
    } else if (tool === 'sheer-heart-attack') {
      const result = this.#simulation.buildMine(point, tool);
      if (result.built) {
        playGameCue(this, AUDIO_KEYS.buildPlace);
      } else {
        playGameCue(this, AUDIO_KEYS.invalid);
        const message =
          result.reason === 'wall'
            ? 'Міну не можна ставити на книжки'
            : result.reason === 'occupied'
              ? 'На цій клітинці вже є міна'
              : result.reason === 'insufficient-funds'
                ? `Недостатньо монет: міна коштує ${getMineDefinition(tool).cost}`
                : result.reason === 'locked'
                  ? `Міна відкриється на рівні ${this.#simulation.mineUnlockLevel(tool)}`
                  : 'Тут не можна поставити міну';
        this.showToast(message);
      }
    } else {
      const result = this.#simulation.buildTower(point, tool);
      if (result.reason === 'built') {
        playGameCue(this, AUDIO_KEYS.buildPlace);
      } else {
        playGameCue(this, AUDIO_KEYS.invalid);
        this.showToast(this.towerBuildFailureMessage(result.reason, tool));
      }
    }
    this.drawBuildHover(world.x, world.y);
  }

  private syncViews(): void {
    this.syncSpawnViews();
    this.syncDebris();
    this.syncWalls();
    this.syncMines();
    this.syncTowers();
    this.syncEnemies();
    const heroineTexture = heroineTextureKey(
      this.#simulation.isBlanketProtectionActive
        ? 0
        : heroineVisualState(
            this.#simulation.coreHp,
            this.#simulation.coreMaxHp,
          ),
    );
    if (this.#coreView.texture.key !== heroineTexture) {
      this.#coreView.setTexture(heroineTexture).clearTint();
    }
  }

  private syncDebris(): void {
    const liveIds = new Set<string>();
    for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
      for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
        const point = { x, y };
        if (!this.#simulation.grid.hasDebris(point)) {
          continue;
        }

        const id = `${x}:${y}`;
        liveIds.add(id);
        if (this.#debrisViews.has(id)) {
          continue;
        }

        const centerY = this.cellCenterY(y);
        const view = this.add
          .image(
            this.cellCenterX(x),
            centerY,
            debrisTextureKey(debrisVariantIndex(x, y)),
          )
          .setDisplaySize(DEBRIS_DISPLAY_WIDTH, DEBRIS_DISPLAY_HEIGHT)
          .setDepth(this.worldDepth(centerY, -1));
        view.setAngle(((x * 17 + y * 11) % 5) - 2);
        this.#uiCamera.ignore(view);
        this.#debrisViews.set(id, view);
      }
    }

    for (const [id, view] of this.#debrisViews) {
      if (!liveIds.has(id)) {
        view.destroy();
        this.#debrisViews.delete(id);
      }
    }
  }

  private syncSpawnViews(): void {
    const liveIds = new Set<string>();
    for (const spawn of this.#simulation.grid.spawnPoints) {
      const id = `${spawn.x}:${spawn.y}`;
      liveIds.add(id);
      let view = this.#spawnViews.get(id);
      if (view === undefined) {
        const x = this.cellCenterX(spawn.x);
        const y = this.cellCenterY(spawn.y);
        const placement = spawnMarkerPlacement(
          spawn.x,
          spawn.y,
          GRID_WIDTH,
          GRID_HEIGHT,
        );
        const anchor = this.add
          .circle(x, y, 8, 0xe9788f, 0.24)
          .setStrokeStyle(3, 0xfff4cf, 0.92)
          .setDepth(this.worldDepth(y, 11));
        const baseBubbleX = x + placement.bubbleOffsetX;
        const baseBubbleY = y + placement.bubbleOffsetY;
        const bubble = this.createSpawnNoiseBubble(
          baseBubbleX,
          baseBubbleY,
          placement.pointerDirectionX,
          placement.pointerDirectionY,
          y,
        );
        this.#uiCamera.ignore(anchor);
        this.#uiCamera.ignore(bubble);
        view = {
          anchor,
          bubble,
          baseBubbleX,
          baseBubbleY,
          phaseMs: (spawn.x * 197 + spawn.y * 113) % 900,
        };
        this.#spawnViews.set(id, view);
      }

      const frame = spawnMarkerAnimation(this.#ambientTimeMs, view.phaseMs);
      view.anchor
        .setScale(frame.anchorScale)
        .setAlpha(frame.anchorAlpha);
      view.bubble
        .setPosition(view.baseBubbleX, view.baseBubbleY + frame.bubbleOffset)
        .setScale(frame.bubbleScale)
        .setAlpha(frame.bubbleAlpha);
    }

    for (const [id, view] of this.#spawnViews) {
      if (!liveIds.has(id)) {
        view.anchor.destroy();
        view.bubble.destroy();
        this.#spawnViews.delete(id);
      }
    }
  }

  private createSpawnNoiseBubble(
    x: number,
    y: number,
    pointerDirectionX: -1 | 0 | 1,
    pointerDirectionY: -1 | 0 | 1,
    anchorWorldY: number,
  ): Phaser.GameObjects.Container {
    const shape = this.add.graphics();
    const drawPointer = (offsetX: number, offsetY: number): void => {
      if (pointerDirectionY !== 0) {
        const edgeY = pointerDirectionY * 17 + offsetY;
        shape.fillTriangle(
          -7 + offsetX,
          edgeY,
          7 + offsetX,
          edgeY,
          offsetX,
          pointerDirectionY * 28 + offsetY,
        );
      } else {
        const edgeX = pointerDirectionX * 25 + offsetX;
        shape.fillTriangle(
          edgeX,
          -7 + offsetY,
          edgeX,
          7 + offsetY,
          pointerDirectionX * 33 + offsetX,
          offsetY,
        );
      }
    };
    shape.fillStyle(0x51345f, 0.18);
    drawPointer(3, 4);
    shape.fillRoundedRect(-22, -13, 52, 36, 13);
    shape.fillStyle(0xe9788f, 0.95);
    drawPointer(0, 0);
    shape.fillStyle(0xfff8e8, 1);
    shape.fillRoundedRect(-26, -18, 52, 36, 13);
    shape.fillStyle(0xfff8e8, 1);
    if (pointerDirectionY !== 0) {
      shape.fillTriangle(
        -6,
        pointerDirectionY * 15,
        6,
        pointerDirectionY * 15,
        0,
        pointerDirectionY * 25,
      );
    } else {
      shape.fillTriangle(
        pointerDirectionX * 23,
        -6,
        pointerDirectionX * 23,
        6,
        pointerDirectionX * 31,
        0,
      );
    }
    shape
      .lineStyle(3, 0x765080, 0.95)
      .strokeRoundedRect(-26, -18, 52, 36, 13);

    const noise = this.add
      .text(0, -1, '♪  !', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '17px',
        color: '#51345f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const accent = this.add.graphics();
    accent
      .lineStyle(2, 0xe9788f, 0.95)
      .lineBetween(13, -9, 17, -6)
      .lineBetween(15, -2, 20, -1)
      .fillStyle(0xf2bd62, 1)
      .fillCircle(-16, -9, 2.5);

    return this.add
      .container(x, y, [shape, noise, accent])
      .setDepth(this.worldDepth(anchorWorldY, 14));
  }

  private syncWalls(): void {
    const liveIds = new Set<string>();
    for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
      for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
        const point = { x, y };
        const wall = this.#simulation.grid.getWall(point);
        if (wall === null) {
          continue;
        }

        liveIds.add(wall.id);
        const wallMask = wallAutotileMask(
            (neighborX, neighborY) =>
              this.#simulation.grid.hasWall({ x: neighborX, y: neighborY }),
            x,
            y,
          );
        const textureKey = wallAutotileTextureKey(wallMask);
        let view = this.#wallViews.get(wall.id);
        if (view === undefined) {
          view = this.add
            .image(this.cellCenterX(x), this.cellCenterY(y), textureKey)
            .setDisplaySize(CELL_SIZE, CELL_SIZE)
            .setDepth(this.worldDepth(this.cellCenterY(y), 0));
          const targetScaleX = view.scaleX;
          const targetScaleY = view.scaleY;
          view.setScale(targetScaleX * 0.68, targetScaleY * 0.68).setAlpha(0.65);
          this.tweens.add({
            targets: view,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            alpha: 1,
            duration: 170,
            ease: 'Back.easeOut',
          });
          this.#uiCamera.ignore(view);
          this.#wallViews.set(wall.id, view);
        } else if (view.texture.key !== textureKey) {
          view.setTexture(textureKey);
        }

        const healthRatio = wall.hp / wall.maxHp;
        if (healthRatio > 0.66) {
          view.clearTint();
        } else if (healthRatio > 0.33) {
          view.setTint(0xffc36d);
        } else {
          view.setTint(0xf27d8f);
        }
      }
    }

    for (const [id, view] of this.#wallViews) {
      if (!liveIds.has(id)) {
        view.destroy();
        this.#wallViews.delete(id);
      }
    }
  }

  private syncTowers(): void {
    const liveIds = new Set<string>();
    for (const tower of this.#simulation.towers.values()) {
      liveIds.add(tower.id);
      let view = this.#towerViews.get(tower.id);
      if (view === undefined) {
        const centerX = this.cellCenterX(tower.position.x);
        const centerY = this.cellCenterY(tower.position.y);
        const displaySize = tower.type === 'heavy'
          ? 52
          : tower.type === 'rapid'
            ? 43
            : tower.type === 'kitten'
              ? 50
              : 46;
        const shadow = this.add
          .ellipse(centerX + 1, centerY + 8, displaySize * 0.68, 11, 0x51345f, 0.24)
          .setDepth(this.worldDepth(centerY, 1));
        const sprite = this.add
          .image(
            centerX,
            centerY - 8,
            towerTextureKey(tower.type),
          )
          .setDisplaySize(displaySize, displaySize)
          .setDepth(this.worldDepth(centerY, 3));
        const targetScaleX = sprite.scaleX;
        const targetScaleY = sprite.scaleY;
        sprite.setScale(targetScaleX * 0.4, targetScaleY * 0.4).setAlpha(0);
        this.tweens.add({
          targets: sprite,
          scaleX: targetScaleX,
          scaleY: targetScaleY,
          alpha: 1,
          duration: 240,
          ease: 'Back.easeOut',
          onComplete: () => {
            if (!sprite.active) return;
            this.tweens.add({
              targets: sprite,
              y: centerY - 11,
              duration: tower.type === 'rapid'
                ? 520
                : tower.type === 'kitten'
                  ? 940
                  : 760,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            });
          },
        });
        view = {
          sprite,
          shadow,
          baseScaleX: targetScaleX,
          baseScaleY: targetScaleY,
          castTween: null,
        };
        this.#uiCamera.ignore([sprite, shadow]);
        this.#towerViews.set(tower.id, view);
      }
    }

    for (const [id, view] of this.#towerViews) {
      if (!liveIds.has(id)) {
        view.castTween?.stop();
        this.tweens.killTweensOf(view.sprite);
        view.sprite.destroy();
        view.shadow.destroy();
        this.#towerViews.delete(id);
      }
    }
  }

  private syncMines(): void {
    const liveIds = new Set<string>();
    for (const mine of this.#simulation.mines.values()) {
      liveIds.add(mine.id);
      let view = this.#mineViews.get(mine.id);
      if (view === undefined) {
        const centerX = this.cellCenterX(mine.position.x);
        const centerY = this.cellCenterY(mine.position.y);
        const shadow = this.add
          .ellipse(centerX + 1, centerY + 8, 31, 10, 0x31243d, 0.28)
          .setDepth(this.worldDepth(centerY, 1));
        const sprite = this.add
          .image(centerX, centerY - 3, SHEER_HEART_ATTACK_TEXTURE)
          .setDisplaySize(42, 42)
          .setDepth(this.worldDepth(centerY, 2));
        const targetScaleX = sprite.scaleX;
        const targetScaleY = sprite.scaleY;
        sprite.setScale(targetScaleX * 0.25, targetScaleY * 0.25);
        this.tweens.add({
          targets: sprite,
          scaleX: targetScaleX,
          scaleY: targetScaleY,
          duration: 220,
          ease: 'Back.easeOut',
        });
        view = { sprite, shadow, pulsing: false };
        this.#uiCamera.ignore([sprite, shadow]);
        this.#mineViews.set(mine.id, view);
      }
      if (mine.state === 'triggered' && !view.pulsing) {
        view.pulsing = true;
        this.tweens.add({
          targets: view.sprite,
          scaleX: view.sprite.scaleX * 1.18,
          scaleY: view.sprite.scaleY * 1.18,
          tint: 0xff6b91,
          duration: 105,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      }
    }

    for (const [id, view] of this.#mineViews) {
      if (!liveIds.has(id)) {
        this.tweens.killTweensOf(view.sprite);
        view.sprite.destroy();
        view.shadow.destroy();
        this.#mineViews.delete(id);
      }
    }
  }

  private syncEnemies(): void {
    const liveIds = new Set<string>();
    for (const enemy of this.#simulation.activeEnemies.values()) {
      liveIds.add(enemy.id);
      let view = this.#enemyViews.get(enemy.id);
      if (view === undefined) {
        const displaySize = this.enemyDisplaySize(enemy.type);
        const shadow = this.add
          .ellipse(0, 0, displaySize[0] * 0.64, 9, 0x51345f, 0.2)
          .setDepth(0);
        const sprite = this.add
          .image(0, 0, this.enemyTexture(enemy.type))
          .setDisplaySize(...displaySize)
          .setDepth(0);
        const healthBack = this.add
          .rectangle(0, 0, 28, 6, 0x51345f, 0.9)
          .setStrokeStyle(1, 0xfff4cf, 0.9)
          .setDepth(0);
        const healthFill = this.add
          .rectangle(0, 0, 26, 4, 0x6bc5a4, 1)
          .setOrigin(0, 0.5)
          .setDepth(0);
        const targetScaleX = sprite.scaleX;
        const targetScaleY = sprite.scaleY;
        sprite.setScale(targetScaleX * 0.35, targetScaleY * 0.35).setAlpha(0);
        this.tweens.add({
          targets: sprite,
          scaleX: targetScaleX,
          scaleY: targetScaleY,
          alpha: 1,
          duration: 210,
          ease: 'Back.easeOut',
        });
        view = { sprite, shadow, healthBack, healthFill };
        this.#uiCamera.ignore([sprite, shadow, healthBack, healthFill]);
        this.#enemyViews.set(enemy.id, view);
      }

      const position = this.enemyWorldPosition(enemy);
      const displaySize = this.enemyDisplaySize(enemy.type);
      const walkBob =
        enemy.stunRemainingMs > 0
          ? 0
          : enemy.state === 'moving'
          ? Math.sin(enemy.transitionProgress * Math.PI * 2) * 1.8
          : enemy.state === 'attacking-wall'
            ? Math.sin(this.#animationTimeMs / 105) * 1.1
            : 0;
      const spriteY = position.y - displaySize[1] * 0.2 + walkBob;
      const healthY = position.y - displaySize[1] * 0.72 - 5;
      const maxHp = enemy.maxHp;
      const healthRatio = enemy.hp / maxHp;
      const healthVisible = shouldShowHealth(enemy.hp, maxHp);
      view.shadow
        .setPosition(position.x + 1, position.y + 6)
        .setDepth(this.worldDepth(position.y, 4));
      view.sprite
        .setPosition(position.x, spriteY)
        .setDepth(this.worldDepth(position.y, 6));
      view.healthBack
        .setPosition(position.x, healthY)
        .setDepth(this.worldDepth(position.y, 20))
        .setVisible(healthVisible);
      view.healthFill
        .setPosition(position.x - 13, healthY)
        .setDisplaySize(26 * healthRatio, 4)
        .setDepth(this.worldDepth(position.y, 21))
        .setFillStyle(healthRatio > 0.5 ? 0x6bc5a4 : healthRatio > 0.25 ? 0xf2bd62 : 0xe9788f)
        .setVisible(healthVisible);
      const facing = enemy.targetCell ?? enemy.targetWall;
      if (facing !== null) {
        const deltaX = facing.x - enemy.cellX;
        view.sprite.setFlipX(
          enemySpriteFlipX(enemy.type, deltaX, view.sprite.flipX),
        );
        view.sprite.setAngle(deltaX === 0 ? walkBob * 0.8 : deltaX * 3 + walkBob * 0.5);
      }
    }

    for (const [id, view] of this.#enemyViews) {
      if (!liveIds.has(id)) {
        view.sprite.destroy();
        view.shadow.destroy();
        view.healthBack.destroy();
        view.healthFill.destroy();
        this.#enemyViews.delete(id);
      }
    }
  }

  private updateGuestDialogues(deltaMs: number): void {
    if (this.#simulation.status !== 'running') {
      this.clearGuestDialogues();
      this.#nextGuestDialogueInMs = null;
      return;
    }

    for (const [ordinal, dialogue] of this.#guestDialogueViews) {
      const enemyView = this.#enemyViews.get(dialogue.enemyId);
      if (enemyView === undefined) {
        dialogue.container.destroy();
        this.#guestDialogueViews.delete(ordinal);
        continue;
      }

      dialogue.elapsedMs += deltaMs;
      if (dialogue.elapsedMs >= GUEST_DIALOGUE_LIFETIME_MS) {
        dialogue.container.destroy();
        this.#guestDialogueViews.delete(ordinal);
        continue;
      }

      const frame = guestDialogueFrame(dialogue.elapsedMs);
      const bubbleY = enemyView.sprite.y
        - Math.max(40, enemyView.sprite.displayHeight * 0.63)
        - 17;
      dialogue.container
        .setPosition(enemyView.sprite.x, bubbleY + frame.rise)
        .setScale(frame.scale)
        .setAlpha(frame.alpha)
        .setDepth(this.worldDepth(enemyView.sprite.y, 55));
    }

    if (this.#nextGuestDialogueInMs === null) {
      this.#nextGuestDialogueInMs = guestDialogueIntervalMs(Math.random());
      return;
    }
    this.#nextGuestDialogueInMs -= deltaMs;
    if (this.#nextGuestDialogueInMs > 0) {
      return;
    }
    if (this.#guestDialogueViews.size >= MAX_GUEST_DIALOGUES) {
      this.#nextGuestDialogueInMs = guestDialogueIntervalMs(Math.random());
      return;
    }

    const occupiedEnemyIds = new Set(
      [...this.#guestDialogueViews.values()].map((dialogue) => dialogue.enemyId),
    );
    let candidate: RuntimeEnemy | null = null;
    let candidateCount = 0;
    for (const enemy of this.#simulation.activeEnemies.values()) {
      if (occupiedEnemyIds.has(enemy.id) || enemy.stunRemainingMs > 0) {
        continue;
      }
      const position = this.enemyInterpolatedCellPosition(enemy);
      if (
        isWithinGuestDialogueRadius(
          position.x,
          position.y,
          this.#simulation.grid.core.x,
          this.#simulation.grid.core.y,
        )
      ) {
        candidateCount += 1;
        if (Math.floor(Math.random() * candidateCount) === 0) {
          candidate = enemy;
        }
      }
    }

    if (candidate !== null) {
      this.spawnGuestDialogue(candidate);
    }
    this.#nextGuestDialogueInMs = guestDialogueIntervalMs(Math.random());
  }

  private spawnGuestDialogue(enemy: RuntimeEnemy): boolean {
    const enemyView = this.#enemyViews.get(enemy.id);
    if (enemyView === undefined) {
      return false;
    }

    const catalog = getGuestDialogueCatalog(enemy.type);
    const phrase = catalog[Math.floor(Math.random() * catalog.length)];
    if (phrase === undefined) {
      return false;
    }

    const text = this.add
      .text(0, -1, phrase, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '14px',
        color: '#51345f',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 150, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const bubbleWidth = Phaser.Math.Clamp(
      Math.ceil(text.width + 24),
      64,
      174,
    );
    const bubbleHeight = Math.max(34, Math.ceil(text.height + 14));
    const halfWidth = bubbleWidth / 2;
    const halfHeight = bubbleHeight / 2;
    const accentColor = enemy.type === 'fast'
      ? 0xf2bd62
      : enemy.type === 'strong'
        ? 0xe9788f
        : enemy.type === 'roach'
          ? 0x6bc5a4
          : 0xb58ac9;
    const bubble = this.add.graphics();
    bubble
      .fillStyle(0x51345f, 0.18)
      .fillRoundedRect(
        -halfWidth + 3,
        -halfHeight + 3,
        bubbleWidth,
        bubbleHeight,
        12,
      )
      .fillTriangle(-3, halfHeight + 1, 7, halfHeight + 1, 3, halfHeight + 9)
      .fillStyle(0xfff8e8, 0.99)
      .fillRoundedRect(-halfWidth, -halfHeight, bubbleWidth, bubbleHeight, 12)
      .fillTriangle(-6, halfHeight - 2, 6, halfHeight - 2, 0, halfHeight + 7)
      .fillStyle(accentColor, 0.95)
      .fillCircle(-halfWidth + 10, -halfHeight + 9, 3)
      .lineStyle(2, 0x765080, 0.92)
      .strokeRoundedRect(-halfWidth, -halfHeight, bubbleWidth, bubbleHeight, 12);

    const bubbleY = enemyView.sprite.y
      - Math.max(40, enemyView.sprite.displayHeight * 0.63)
      - 17;
    const container = this.add
      .container(enemyView.sprite.x, bubbleY, [bubble, text])
      .setDepth(this.worldDepth(enemyView.sprite.y, 55))
      .setScale(0.82)
      .setAlpha(0);
    this.#uiCamera.ignore(container);
    this.#guestDialogueViews.set(this.#nextGuestDialogueOrdinal, {
      enemyId: enemy.id,
      container,
      elapsedMs: 0,
    });
    this.#nextGuestDialogueOrdinal += 1;
    return true;
  }

  private clearGuestDialogues(): void {
    for (const dialogue of this.#guestDialogueViews.values()) {
      dialogue.container.destroy();
    }
    this.#guestDialogueViews.clear();
  }

  private dismissGuestDialoguesForEnemies(enemyIds: readonly string[]): void {
    const dismissedIds = new Set(enemyIds);
    for (const [ordinal, dialogue] of this.#guestDialogueViews) {
      if (!dismissedIds.has(dialogue.enemyId)) {
        continue;
      }
      dialogue.container.destroy();
      this.#guestDialogueViews.delete(ordinal);
    }
  }

  private enemyInterpolatedCellPosition(enemy: RuntimeEnemy): GridPoint {
    if (enemy.state !== 'moving' || enemy.targetCell === null) {
      return { x: enemy.cellX, y: enemy.cellY };
    }
    return {
      x: Phaser.Math.Linear(enemy.cellX, enemy.targetCell.x, enemy.transitionProgress),
      y: Phaser.Math.Linear(enemy.cellY, enemy.targetCell.y, enemy.transitionProgress),
    };
  }

  private handleSimulationEvents(events: readonly SimulationEvent[]): void {
    const defeatInBatch = events.some((event) => event.type === 'level-defeat');
    const bonusOfferEvent = events.find(
      (event): event is Extract<SimulationEvent, { type: 'bonus-offered' }> =>
        event.type === 'bonus-offered',
    );
    for (const event of events) {
      switch (event.type) {
        case 'tower-shot':
          queueTowerShotCue(this, event.towerType);
          this.spawnTowerProjectile(event);
          break;
        case 'kitten-meowed':
          playKittenMeowCue(this);
          this.animateKittenMeow(event);
          break;
        case 'wall-shot':
          this.spawnProjectile(event);
          break;
        case 'tower-destroyed':
          this.spawnImpact(event.position, 0xb485d5, 0.36);
          break;
        case 'wall-destroyed':
          this.spawnWallGhost(event.position);
          this.spawnImpact(event.position, 0xe9788f, 0.42);
          break;
        case 'wall-sold':
          this.spawnImpact(event.position, 0x7bc8bd, 0.24, 12);
          break;
        case 'mine-triggered':
          this.spawnImpact(event.position, 0xff6f9a, 0.32, 18);
          break;
        case 'mine-detonated':
          playGameCue(this, AUDIO_KEYS.mineExplosion);
          this.animateMineDetonation(event);
          break;
        case 'mine-sold':
          this.spawnImpact(event.position, 0x7bc8bd, 0.28, 14);
          break;
        case 'level-victory':
          this.showEndOverlay('ВЕЧІР УРЯТОВАНО!', 'Соціальні плани чемно скасовано', 0x64b99c);
          break;
        case 'level-defeat':
          playDefeatCue(this);
          this.showEndOverlay(
            'БАТАРЕЙКА РОЗРЯДЖЕНА',
            'Час сховатися під ковдру',
            0xe9788f,
            true,
          );
          break;
        case 'enemy-damaged':
          this.animateEnemyDamage(event);
          break;
        case 'enemy-killed':
          this.spawnEnemyPoof(event.enemyId);
          break;
        case 'enemy-reached-core':
          if (event.damage > 0) {
            if (!defeatInBatch) {
              playGameCue(this, AUDIO_KEYS.coreDamage);
            }
            this.animateCoreHit(event.damage);
          }
          break;
        case 'enemy-healed-core':
          this.animateCoreHeal(event.healing);
          break;
        case 'level-started':
          playGameCue(this, AUDIO_KEYS.levelStart);
          this.showLevelBanner(
            `РІВЕНЬ ${event.levelNumber}`,
            ROACH_LEVEL_NUMBERS.has(event.levelNumber)
              ? 'Плотка вже скаче сюди'
              : 'До дверей ідуть гості',
          );
          break;
        case 'level-completed':
          if (bonusOfferEvent === undefined) {
            this.showLevelBanner('РІВЕНЬ ПРОЙДЕНО!', 'Будуйтеся без поспіху');
          }
          break;
        case 'bonus-offered':
        case 'bonus-selected':
        case 'bonus-skipped':
        case 'enemy-spawned':
        case 'navigation-rebuilt':
          break;
      }
    }

    if (bonusOfferEvent !== undefined) {
      this.openBonusMenu(bonusOfferEvent.offer);
    }
  }

  private animateKittenMeow(
    event: Extract<SimulationEvent, { type: 'kitten-meowed' }>,
  ): void {
    this.dismissGuestDialoguesForEnemies(event.affectedEnemyIds);
    const towerView = this.#towerViews.get(event.towerId);
    if (towerView !== undefined) {
      this.animateTowerCast(towerView, 1.18, 0.88, -5, 120, 'Back.easeOut');
    }

    const centerX = this.cellCenterX(event.from.x);
    const centerY = this.cellCenterY(event.from.y);
    const wave = this.add
      .circle(centerX, centerY, 8, 0xffacc6, 0.12)
      .setStrokeStyle(4, 0xff89ad, 0.86)
      .setDepth(this.worldDepth(centerY, 35));
    this.#uiCamera.ignore(wave);
    const finalScale = event.radiusCells * CELL_SIZE / 8;
    this.tweens.add({
      targets: wave,
      scale: finalScale,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => wave.destroy(),
    });

    const variants = ['♥', '♡', '💕'] as const;
    event.bubbleEnemyIds.forEach((enemyId, index) => {
      this.time.delayedCall(index * 210, () => {
        const enemyView = this.#enemyViews.get(enemyId);
        if (enemyView === undefined) {
          return;
        }
        const x = enemyView.sprite.x + ((index % 5) - 2) * 12;
        const y = enemyView.sprite.y - 38 - Math.floor(index / 5) * 15;
        const bubble = this.add.graphics();
        bubble
          .fillStyle(0xfff8e8, 0.98)
          .fillRoundedRect(-19, -14, 38, 27, 12)
          .fillTriangle(-3, 12, 5, 12, 1, 20)
          .lineStyle(2, 0xd58ca5, 0.95)
          .strokeRoundedRect(-19, -14, 38, 27, 12);
        const heart = this.add
          .text(0, -1, variants[index % variants.length] ?? '♥', {
            fontFamily: 'Trebuchet MS, sans-serif',
            fontSize: '17px',
            color: '#e45e86',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);
        const container = this.add
          .container(x, y, [bubble, heart])
          .setDepth(this.worldDepth(y, 48))
          .setScale(0.55)
          .setAlpha(0);
        this.#uiCamera.ignore(container);
        this.tweens.add({
          targets: container,
          scale: 1,
          alpha: 1,
          y: y - 7,
          duration: 170,
          ease: 'Back.easeOut',
          hold: 620,
          yoyo: true,
          onComplete: () => container.destroy(),
        });
      });
    });
  }

  private animateMineDetonation(
    event: Extract<SimulationEvent, { type: 'mine-detonated' }>,
  ): void {
    const x = this.cellCenterX(event.position.x);
    const y = this.cellCenterY(event.position.y);
    const shockwave = this.add
      .circle(x, y, 12, 0xffd45f, 0.5)
      .setStrokeStyle(6, 0xff4f88, 0.94)
      .setDepth(this.worldDepth(y, 80));
    this.#uiCamera.ignore(shockwave);
    this.tweens.add({
      targets: shockwave,
      scale: 42,
      alpha: 0,
      duration: 720,
      ease: 'Expo.easeOut',
      onComplete: () => shockwave.destroy(),
    });
    const flash = this.add
      .rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT, 0xfff4cf, 0.72)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 70);
    this.cameras.main.ignore(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 460,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    for (const position of event.damagedWallPositions) {
      this.spawnImpact(position, 0xff795f, 0.55, 24);
    }
    this.spawnFloatingText(
      x,
      y - 38,
      `${event.killedEnemyCount} гостей — пуф!`,
      '#d93f70',
    );
  }

  private spawnProjectile(event: Extract<SimulationEvent, { type: 'wall-shot' }>): void {
    const enemyView = this.#enemyViews.get(event.enemyId);
    const startX = enemyView?.sprite.x ?? this.cellCenterX(event.from.x);
    const startY = enemyView?.sprite.y ?? this.cellCenterY(event.from.y);
    const endX = this.cellCenterX(event.to.x);
    const endY = this.cellCenterY(event.to.y);
    const projectile = this.add
      .image(startX, startY, PrototypeTexture.Projectile)
      .setDisplaySize(25, 16)
      .setRotation(
        rotationForRightFacingSprite(endX - startX, endY - startY),
      )
      .setDepth(this.worldDepth(startY, 30));
    this.#uiCamera.ignore(projectile);

    this.tweens.add({
      targets: projectile,
      x: endX,
      y: endY,
      duration: 130,
      ease: 'Linear',
      onUpdate: () => {
        projectile.setDepth(this.worldDepth(projectile.y, 30));
      },
      onComplete: () => {
        projectile.destroy();
        this.spawnImpact(event.to, 0xe9788f, 0.22);
      },
    });
  }

  private spawnTowerProjectile(
    event: Extract<SimulationEvent, { type: 'tower-shot' }>,
  ): void {
    const targetView = this.#enemyViews.get(event.targetEnemyId);
    const startX = this.cellCenterX(event.from.x);
    const startY = this.cellCenterY(event.from.y);
    const endX = targetView?.sprite.x ?? this.cellCenterX(event.to.x);
    const endY = targetView?.sprite.y ?? this.cellCenterY(event.to.y);
    const tint =
      event.towerType === 'basic'
        ? 0x75e6e8
        : event.towerType === 'rapid'
          ? 0xffce54
          : 0xf28ac0;
    const projectileSize: readonly [number, number] =
      event.towerType === 'heavy'
        ? [30, 18]
        : event.towerType === 'rapid'
          ? [18, 11]
          : [22, 14];
    const shotAngle = rotationForRightFacingSprite(
      endX - startX,
      endY - startY,
    );
    const towerView = this.#towerViews.get(event.towerId);
    if (towerView !== undefined) {
      const sprite = towerView.sprite;
      sprite.setFlipX(endX < startX);
      const targetRotation = rotationForUpFacingSprite(endX - startX, endY - startY);
      const castAngle = Phaser.Math.RadToDeg(targetRotation) * 0.08;
      this.animateTowerCast(
        towerView,
        1.1,
        0.9,
        Phaser.Math.Clamp(castAngle, -10, 10),
        75,
        'Quad.easeOut',
      );
      this.spawnCastAura(event.from, tint, targetRotation);
    }
    const projectile = this.add
      .image(startX, startY, CAT_MAGIC_PROJECTILE_TEXTURE)
      .setDisplaySize(...projectileSize)
      .setRotation(shotAngle)
      .setTint(tint)
      .setDepth(this.worldDepth(startY, 31));
    this.#uiCamera.ignore(projectile);

    this.tweens.add({
      targets: projectile,
      x: endX,
      y: endY,
      duration: event.towerType === 'heavy' ? 180 : 95,
      ease: 'Linear',
      onUpdate: () => {
        projectile.setDepth(this.worldDepth(projectile.y, 31));
      },
      onComplete: () => {
        projectile.destroy();
        if (event.towerType === 'heavy') {
          this.spawnSageSplashWave(event.to);
        }
        this.spawnImpact(
          event.to,
          tint,
          event.towerType === 'heavy' ? 0.34 : 0.18,
          event.towerType === 'heavy' ? 26 : 14,
        );
      },
    });
  }

  private animateTowerCast(
    view: TowerView,
    scaleXMultiplier: number,
    scaleYMultiplier: number,
    angle: number,
    duration: number,
    ease: string,
  ): void {
    const { sprite } = view;
    view.castTween?.stop();
    sprite.setScale(view.baseScaleX, view.baseScaleY).setAngle(0);

    const targetScale = towerCastScale(
      view.baseScaleX,
      view.baseScaleY,
      scaleXMultiplier,
      scaleYMultiplier,
    );
    const tween = this.tweens.add({
      targets: sprite,
      scaleX: targetScale.scaleX,
      scaleY: targetScale.scaleY,
      angle,
      duration,
      ease,
      yoyo: true,
      onComplete: () => {
        if (sprite.active) {
          sprite.setScale(view.baseScaleX, view.baseScaleY).setAngle(0);
        }
        if (view.castTween === tween) {
          view.castTween = null;
        }
      },
    });
    view.castTween = tween;
  }

  private spawnSageSplashWave(point: GridPoint): void {
    const cells = [
      { point, color: 0xf28ac0, alpha: 0.42 },
      { point: { x: point.x, y: point.y - 1 }, color: 0xbca4db, alpha: 0.3 },
      { point: { x: point.x + 1, y: point.y }, color: 0xbca4db, alpha: 0.3 },
      { point: { x: point.x, y: point.y + 1 }, color: 0xbca4db, alpha: 0.3 },
      { point: { x: point.x - 1, y: point.y }, color: 0xbca4db, alpha: 0.3 },
    ] as const;

    for (const cell of cells) {
      if (!this.#simulation.grid.isInside(cell.point)) {
        continue;
      }
      const overlapsWall = this.#simulation.grid.hasWall(cell.point);
      const centerY = this.cellCenterY(cell.point.y);
      const wave = this.add
        .rectangle(
          this.cellCenterX(cell.point.x),
          centerY,
          CELL_SIZE * 0.34,
          CELL_SIZE * 0.34,
          cell.color,
          overlapsWall ? 0.04 : cell.alpha,
        )
        .setStrokeStyle(2, cell.color, overlapsWall ? 0.28 : 0.95)
        .setDepth(this.worldDepth(centerY, 33));
      this.#uiCamera.ignore(wave);
      this.tweens.add({
        targets: wave,
        displayWidth: CELL_SIZE * 0.92,
        displayHeight: CELL_SIZE * 0.92,
        alpha: 0,
        angle: cell.point === point ? 8 : -8,
        duration: 520 * this.#gameSpeed,
        ease: 'Cubic.easeOut',
        onComplete: () => wave.destroy(),
      });
    }
  }

  private spawnImpact(
    point: GridPoint,
    color: number,
    durationSeconds: number,
    radius = 17,
  ): void {
    const impact = this.add
      .circle(this.cellCenterX(point.x), this.cellCenterY(point.y), 5, color, 0.9)
      .setStrokeStyle(2, 0xfff4cf, 0.9)
      .setDepth(this.worldDepth(this.cellCenterY(point.y), 32));
    this.#uiCamera.ignore(impact);
    this.tweens.add({
      targets: impact,
      radius,
      alpha: 0,
      duration: durationSeconds * 1_000,
      ease: 'Quad.easeOut',
      onComplete: () => impact.destroy(),
    });
  }

  private spawnWallGhost(point: GridPoint): void {
    const destroyedView = this.#wallViews.get(wallIdAt(point));
    const textureKey = destroyedView?.texture.key ?? wallAutotileTextureKey(0);
    const ghost = this.add
      .image(
        this.cellCenterX(point.x),
        this.cellCenterY(point.y),
        textureKey,
      )
      .setDisplaySize(CELL_SIZE, CELL_SIZE)
      .setTint(0xe9788f)
      .setDepth(this.worldDepth(this.cellCenterY(point.y), 2));
    this.#uiCamera.ignore(ghost);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      angle: 12,
      scaleX: ghost.scaleX * 1.25,
      scaleY: ghost.scaleY * 1.25,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
  }

  private spawnCastAura(point: GridPoint, color: number, rotation: number): void {
    const x = this.cellCenterX(point.x);
    const y = this.cellCenterY(point.y) - 5;
    const aura = this.add
      .ellipse(x, y, 12, 7, color, 0.4)
      .setStrokeStyle(2, 0xfff4cf, 0.95)
      .setRotation(rotation)
      .setDepth(this.worldDepth(y, 28));
    this.#uiCamera.ignore(aura);
    this.tweens.add({
      targets: aura,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      angle: aura.angle + 35,
      duration: 230,
      ease: 'Quad.easeOut',
      onComplete: () => aura.destroy(),
    });
  }

  private animateEnemyDamage(
    event: Extract<SimulationEvent, { type: 'enemy-damaged' }>,
  ): void {
    const view = this.#enemyViews.get(event.enemyId);
    if (view === undefined) {
      return;
    }
    const flashColor = event.damageZone === 'primary'
      ? 0xfff4cf
      : event.damageZone === 'target-cell'
        ? 0xf28ac0
        : 0xbca4db;
    view.sprite
      .setTint(flashColor)
      .setTintMode(Phaser.TintModes.FILL);
    this.tweens.add({
      targets: view.sprite,
      alpha: 0.48,
      duration: (event.damageZone === 'primary' ? 75 : 120) * this.#gameSpeed,
      yoyo: true,
      onComplete: () => {
        if (view.sprite.active) {
          view.sprite
            .clearTint()
            .setTintMode(Phaser.TintModes.MULTIPLY)
            .setAlpha(1);
        }
      },
    });
  }

  private spawnEnemyPoof(enemyId: string): void {
    const view = this.#enemyViews.get(enemyId);
    if (view === undefined) {
      return;
    }
    const colors = [0xfff4cf, 0xf7b6c5, 0xbca4db, 0x7bc8bd] as const;
    for (let index = 0; index < colors.length; index += 1) {
      const angle = (Math.PI * 2 * index) / colors.length;
      const puff = this.add
        .circle(view.sprite.x, view.sprite.y, 4 + (index % 2), colors[index], 0.9)
        .setDepth(view.sprite.depth + 2);
      this.#uiCamera.ignore(puff);
      this.tweens.add({
        targets: puff,
        x: puff.x + Math.cos(angle) * 18,
        y: puff.y + Math.sin(angle) * 18 - 4,
        scale: 1.6,
        alpha: 0,
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  private animateCoreHit(damage: number): void {
    const baseX = this.cellCenterX(this.#simulation.grid.core.x);
    this.#coreView.setAlpha(0.55);
    this.tweens.add({
      targets: this.#coreView,
      x: baseX + 5,
      duration: 45,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        if (this.#coreView.active) {
          this.#coreView.setX(baseX).setAlpha(1);
        }
      },
    });
    this.spawnFloatingText(
      baseX,
      this.cellCenterY(this.#simulation.grid.core.y) - 34,
      `−${damage} соц.`,
      '#e75f7b',
    );
  }

  private animateCoreHeal(healing: number): void {
    if (healing <= 0) {
      return;
    }

    const x = this.cellCenterX(this.#simulation.grid.core.x);
    const y = this.cellCenterY(this.#simulation.grid.core.y) - 8;
    const glow = this.add
      .circle(x, y + 9, 10, 0x9ed8b5, 0.3)
      .setStrokeStyle(2, 0xfff4cf, 0.9)
      .setDepth(this.worldDepth(y, 38));
    const heart = this.add
      .text(x + 18, y - 12, '♥', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '21px',
        color: '#72b991',
        stroke: '#fff8e8',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(this.worldDepth(y, 39));
    this.#uiCamera.ignore([glow, heart]);

    this.tweens.add({
      targets: glow,
      scale: 2.4,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
    this.tweens.add({
      targets: heart,
      y: heart.y - 25,
      angle: 8,
      scale: 1.25,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => heart.destroy(),
    });
    this.spawnFloatingText(
      x,
      y - 26,
      `+${healing} соц.`,
      '#4f9b78',
    );
  }

  private spawnFloatingText(
    x: number,
    y: number,
    message: string,
    color: string,
  ): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '13px',
        color,
        fontStyle: 'bold',
        stroke: '#fff8e8',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(this.worldDepth(y, 40));
    this.#uiCamera.ignore(text);
    this.tweens.add({
      targets: text,
      y: y - 25,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private showLevelBanner(title: string, subtitle: string): void {
    const banner = this.add
      .text(CANVAS_WIDTH / 2, 150, `${title}\n${subtitle}`, {
        align: 'center',
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '20px',
        color: '#51345f',
        fontStyle: 'bold',
        backgroundColor: '#fff4cff2',
        padding: { left: 18, right: 18, top: 8, bottom: 8 },
        stroke: '#f7b6c5',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScale(0.65)
      .setDepth(UI_DEPTH + 40);
    this.cameras.main.ignore(banner);
    this.tweens.add({
      targets: banner,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
      hold: 700,
      yoyo: true,
      onComplete: () => banner.destroy(),
    });
  }

  private updateInterface(): void {
    if (!this.#simulation.canBuild && this.#buildTool !== null) {
      this.#buildTool = null;
      this.updateBuildOverlayVisibility();
    }

    const phase = this.#simulation.levelSystem.phase;
    const speedControlsVisible =
      this.#simulation.status === 'running' &&
      isLevelSpeedControlVisible(phase);
    const statusSpeed = gameSpeedForStatus(
      this.#gameSpeed,
      this.#simulation.status,
    );
    if (statusSpeed !== this.#gameSpeed) {
      this.setGameSpeed(statusSpeed);
    }
    const canStartLevel = this.#simulation.canStartLevel;
    if (this.#speedControlsVisible && !speedControlsVisible) {
      this.clearActionButtonHover(this.#speed2Button);
      this.clearActionButtonHover(this.#speed4Button);
      this.clearActionButtonHover(this.#speed10Button);
    }
    if (this.#startControlVisible && !canStartLevel) {
      this.clearActionButtonHover(this.#startButton);
    }
    this.setSpeedControlsVisible(speedControlsVisible);
    this.setStartControlVisible(canStartLevel);
    this.#actionDock.setVisible(canStartLevel || speedControlsVisible);
    this.updateSpeedControls();
    const totalLevels = this.#simulation.totalLevelCount;
    const nextLevelNumber = this.#simulation.nextLevelNumber;
    const currentLevelNumber = this.#simulation.currentLevelNumber;
    const levelTotalSuffix = totalLevels === null ? '' : `/${totalLevels}`;
    const displayedLevelNumber =
      this.#simulation.status === 'build'
        ? nextLevelNumber ?? currentLevelNumber ?? 1
        : currentLevelNumber ?? nextLevelNumber ?? 1;
    const phaseLabel =
      this.#simulation.status === 'build'
        ? 'Підготовка'
        : this.#simulation.status === 'running'
          ? this.phaseLabel(phase)
          : this.#simulation.status === 'bonus'
            ? 'Невеличка перерва'
            : this.#simulation.status === 'victory'
              ? 'Завершено'
              : 'Батарейка розряджена';
    this.setHudTextWithinWidth(
      this.#statusText,
      `${displayedLevelNumber}${levelTotalSuffix}`,
      43,
    );
    this.setHudTextWithinWidth(this.#phaseText, phaseLabel, 229);
    this.drawPhaseCard(
      this.#simulation.status === 'build'
        ? 0xdde8d0
        : this.#simulation.status === 'running'
          ? 0xf5d7c7
          : this.#simulation.status === 'bonus'
            ? 0xe5d8f2
            : this.#simulation.status === 'defeat'
              ? 0xf4cdd5
              : 0xffe7b7,
    );
    this.setHudTextWithinWidth(this.#coinsText, `${this.#simulation.coins}`, 48);
    this.setHudTextWithinWidth(
      this.#guestTotalText,
      `${this.#simulation.levelEnemyTotal}`,
      52,
    );
    const batteryRatio = Phaser.Math.Clamp(
      this.#simulation.coreHp / this.#simulation.coreMaxHp,
      0,
      1,
    );
    this.#socialBatteryFill
      .setDisplaySize(142 * batteryRatio, 12)
      .setFillStyle(
        batteryRatio > 0.5 ? 0x6bc5a4 : batteryRatio > 0.2 ? 0xf2bd62 : 0xe9788f,
      );
    this.#socialBatteryLabel.setText(
      `${this.#simulation.coreHp}/${this.#simulation.coreMaxHp}`,
    );

    const wallEnabled = this.#simulation.canBuild;
    this.layoutBuildButtons();
    this.updateBuildButton(
      this.#sellButton,
      wallEnabled,
      this.#buildTool === 'sell',
    );
    this.updateBuildButton(
      this.#wallButton,
      wallEnabled,
      this.#buildTool === 'wall',
    );
    this.updateTowerButton(this.#basicTowerButton, 'basic', wallEnabled);
    this.updateTowerButton(this.#rapidTowerButton, 'rapid', wallEnabled);
    this.updateTowerButton(this.#heavyTowerButton, 'heavy', wallEnabled);
    this.updateTowerButton(this.#kittenTowerButton, 'kitten', wallEnabled);
    if (this.#simulation.isMineUnlocked('sheer-heart-attack')) {
      this.updateBuildButton(
        this.#mineButton,
        wallEnabled,
        this.#buildTool === 'sheer-heart-attack',
      );
    }
    if (canStartLevel) {
      this.setActionButtonFill(this.#startButton, 0xc4e6d8);
      this.#startButton.background.setAlpha(1);
      this.#startButton.label.setAlpha(1);
    }

    const helpMessage =
      this.#buildTool === 'wall' && this.#simulation.canBuild
        ? 'ЛКМ: малювати книжки'
        : this.#buildTool === 'sell' && this.#simulation.canBuild
          ? 'ЛКМ: продати / рамка'
          : this.#buildTool === 'sheer-heart-attack' && this.#simulation.canBuild
            ? 'ЛКМ: поставити міну'
          : this.#buildTool !== null && this.#simulation.canBuild
            ? 'ЛКМ: поставити котика'
            : '';
    this.#helpText.setText(helpMessage).setVisible(helpMessage.length > 0);
  }

  private setHudTextWithinWidth(
    textObject: Phaser.GameObjects.Text,
    value: string,
    maximumWidth: number,
  ): void {
    textObject.setScale(1).setText(value);
    if (textObject.width > maximumWidth) {
      textObject.setScale(maximumWidth / textObject.width);
    }
  }

  private updateTowerButton(
    button: TowerButtonView,
    type: TowerType,
    enabled: boolean,
  ): void {
    const unlocked = this.#simulation.isTowerUnlocked(type);
    if (!unlocked) {
      return;
    }

    this.updateBuildButton(button, enabled, this.#buildTool === type);
  }

  private selectGameSpeed(speed: SelectableGameSpeed): void {
    this.setGameSpeed(toggleGameSpeed(this.#gameSpeed, speed));
    this.updateSpeedControls();
  }

  private setGameSpeed(speed: GameSpeed): void {
    this.#gameSpeed = speed;
    this.tweens.setGlobalTimeScale(speed);
  }

  private setStartControlVisible(visible: boolean): void {
    this.#startControlVisible = visible;
    this.#startButton.background.setVisible(visible);
    this.#startButton.label.setVisible(visible);
    this.#startIcon.setVisible(visible);
  }

  private setSpeedControlsVisible(visible: boolean): void {
    this.#speedControlsVisible = visible;
    for (const button of [
      this.#speed2Button,
      this.#speed4Button,
      this.#speed10Button,
    ]) {
      button.background.setVisible(visible);
      button.label.setVisible(visible);
    }
  }

  private updateSpeedControls(): void {
    this.setActionButtonFill(
      this.#speed2Button,
      this.#gameSpeed === 2 ? 0xc4e6d8 : 0xffead2,
    );
    this.setActionButtonFill(
      this.#speed4Button,
      this.#gameSpeed === 4 ? 0xc4e6d8 : 0xffead2,
    );
    this.setActionButtonFill(
      this.#speed10Button,
      this.#gameSpeed === 10 ? 0xc4e6d8 : 0xffead2,
    );
  }

  private selectBuildTool(tool: BuildTool | null): void {
    this.cancelSellSelection();
    this.#buildTool = tool;
    if (tool !== 'wall') {
      this.stopWallPainting();
      this.#queuedWallCells.clear();
    }
    this.updateBuildOverlayVisibility();
  }

  private towerBuildFailureMessage(
    reason: Exclude<TowerBuildResult['reason'], 'built'>,
    type?: TowerType,
  ): string {
    switch (reason) {
      case 'not-build-phase':
        return 'Будівництво доступне між рівнями';
      case 'locked':
        return type === undefined
          ? 'Цей котик ще недоступний'
          : `Цей котик відкриється на рівні ${this.#simulation.towerUnlockLevel(type)}`;
      case 'no-wall':
        return 'Котик чаклує лише зі стопки книг';
      case 'occupied':
        return 'На цій стопці вже сидить котик';
      case 'would-block-route':
        return 'Цей котик зробив би маршрут недоступним';
      case 'insufficient-funds':
        return type === undefined
          ? 'Недостатньо монет'
          : `Недостатньо монет: цей котик коштує ${getTowerDefinition(type).cost} монет`;
    }
  }

  private updateBuildOverlayVisibility(): void {
    const visible = this.#buildTool !== null && this.#simulation.canBuild;
    this.#gridOverlay.setVisible(visible);
    this.#hoverOverlay.setVisible(visible);
    this.#interfacePanel.setVisible(true);
    if (!this.#panningCamera) {
      this.game.canvas.style.cursor = this.cursorForCurrentTool();
    }
    if (!visible) {
      this.cancelSellSelection();
      this.stopWallPainting();
      this.#queuedWallCells.clear();
      this.#hoverOverlay.clear();
    }
  }

  private drawBuildHover(worldX: number, worldY: number): void {
    this.#hoverOverlay.clear();
    if (this.#buildTool === null || !this.#simulation.canBuild) {
      this.#hoverOverlay.setVisible(false);
      return;
    }

    if (
      this.#buildTool === 'sell'
      && this.#sellSelectionStart !== null
      && this.#sellSelectionEnd !== null
    ) {
      this.drawSellSelection();
      return;
    }

    const point = this.worldToCell(worldX, worldY);
    if (point === null) {
      return;
    }
    const canPlace =
      this.#buildTool === 'wall'
        ? this.#simulation.coins >= WALL_COST &&
          this.#simulation.grid.isBuildable(point) &&
          !this.#simulation.mines.has(`mine:${point.x}:${point.y}`)
        : this.#buildTool === 'sell'
          ? this.#simulation.canSellDefense(point)
          : this.#buildTool === 'sheer-heart-attack'
            ? this.#simulation.canBuildMine(point, this.#buildTool)
            : this.#simulation.canBuildTower(point, this.#buildTool);
    this.#hoverOverlay
      .setVisible(true)
      .fillStyle(canPlace ? 0x6bc5a4 : 0xe9788f, 0.3)
      .fillRect(
        point.x * CELL_SIZE + 1,
        point.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2,
      )
      .lineStyle(2, canPlace ? 0x4fa98b : 0xd94e70, 1)
      .strokeRect(
        point.x * CELL_SIZE + 1,
        point.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2,
      );
  }

  private showToast(message: string): void {
    this.#toastTimer?.destroy();
    this.tweens.killTweensOf(this.#toastText);
    this.#toastText.setText(message).setVisible(true).setAlpha(1).setScale(0.72);
    this.tweens.add({
      targets: this.#toastText,
      scale: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });
    this.#toastTimer = this.time.delayedCall(2_000, () => {
      this.tweens.add({
        targets: this.#toastText,
        alpha: 0,
        duration: 220,
        onComplete: () => this.#toastText.setVisible(false),
      });
    });
  }

  private openBonusMenu(offer: BonusSceneData['offer']): void {
    if (
      this.#bonusRequested
      || this.#pauseRequested
      || this.#endOverlay !== null
      || this.scene.isActive('bonus')
    ) {
      return;
    }

    this.#bonusRequested = true;
    this.selectBuildTool(null);
    this.flushQueuedWalls();
    this.stopCameraPan();
    this.stopWallPainting();
    this.#queuedWallCells.clear();
    clearCombatAudioQueue(this);
    this.#hoverOverlay.clear().setVisible(false);
    this.game.canvas.style.cursor = 'default';

    const sceneData: BonusSceneData = {
      offer,
      onResolve: (offerId, selection) =>
        this.#simulation.chooseBonus(offerId, selection),
    };
    this.scene.pause();
    this.scene.run('bonus', sceneData);
  }

  private openPauseMenu(): void {
    if (
      this.#pauseRequested ||
      this.#bonusRequested ||
      this.#endOverlay !== null ||
      this.scene.isActive('pause') ||
      this.scene.isActive('bonus')
    ) {
      return;
    }

    this.#pauseRequested = true;
    this.flushQueuedWalls();
    this.cancelSellSelection();
    this.stopCameraPan();
    this.stopWallPainting();
    this.#queuedWallCells.clear();
    clearCombatAudioQueue(this);
    this.#hoverOverlay.clear().setVisible(false);
    this.game.canvas.style.cursor = 'default';
    playGameCue(this, AUDIO_KEYS.uiClick);
    const sceneData: PauseSceneData = {
      bonusStacks: Object.freeze({ ...this.#simulation.bonusStacks }),
    };
    this.scene.pause();
    this.scene.run('pause', sceneData);
  }

  private handleSceneResume(): void {
    this.#pauseRequested = false;
    this.#bonusRequested = false;
    this.updateBuildOverlayVisibility();
  }

  private showEndOverlay(
    title: string,
    subtitle: string,
    color: number,
    showBlanketIllustration = false,
  ): void {
    if (this.#endOverlay !== null) {
      return;
    }

    const completedLevels = this.#simulation.completedLevelCount;
    const record = this.#developmentRun
      ? null
      : updateHighScore(completedLevels);
    const panelY = showBlanketIllustration ? 208 : 338;
    const panelHeight = showBlanketIllustration ? 662 : 400;
    const headingY = showBlanketIllustration ? 278 : 405;
    const subtitleY = showBlanketIllustration ? 575 : 476;
    const scorePanelY = showBlanketIllustration ? 616 : 526;
    const scoreY = showBlanketIllustration ? 657 : 567;
    const recordY = showBlanketIllustration ? 732 : 640;
    const badgeY = showBlanketIllustration ? 785 : 672;
    const shade = this.add
      .rectangle(540, 540, 1080, 1080, 0x51345f, 0.58)
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
    const panel = this.add.graphics();
    panel
      .fillStyle(0x2f2038, 0.28)
      .fillRoundedRect(174, panelY + 14, 744, panelHeight, 42)
      .fillStyle(0xfff8e8, 0.99)
      .fillRoundedRect(160, panelY, 744, panelHeight, 42)
      .lineStyle(6, color, 0.92)
      .strokeRoundedRect(160, panelY, 744, panelHeight, 42)
      .fillStyle(0xffefd2, 0.96)
      .fillRoundedRect(202, scorePanelY, 660, 82, 24)
      .lineStyle(2, 0xd6ad97, 0.7)
      .strokeRoundedRect(202, scorePanelY, 660, 82, 24);
    const leftStar = this.add
      .star(206, headingY - 15, 5, 6, 13, 0xf2bd62, 0.95)
      .setAngle(-10);
    const rightStar = this.add
      .star(858, headingY - 15, 5, 6, 13, 0xf2bd62, 0.95)
      .setAngle(10);
    const heading = this.add
      .text(532, headingY, title, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '38px',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
        stroke: '#fff4cf',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(532, subtitleY, subtitle, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '21px',
        color: '#765f7d',
      })
      .setOrigin(0.5);
    const scoreText = this.add
      .text(
        532,
        scoreY,
        `Витримано соціальних подій: ${completedLevels}`,
        {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '24px',
          color: '#51345f',
          fontStyle: 'bold',
          align: 'center',
        },
      )
      .setOrigin(0.5);
    const recordText = this.add
      .text(
        532,
        recordY,
        record === null
          ? 'DEV · рекорд не зберігається'
          : `Найкращий результат: ${record.highScore}`,
        {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '18px',
        color: '#765f7d',
        fontStyle: 'bold',
        },
      )
      .setOrigin(0.5);
    const overlayObjects: Phaser.GameObjects.GameObject[] = [
      shade,
      panel,
      leftStar,
      rightStar,
      heading,
      subtitleText,
      scoreText,
      recordText,
    ];
    if (showBlanketIllustration) {
      const illustration = this.add
        .image(
          532,
          430,
          bonusIllustrationTextureKey('hide-under-blanket'),
        )
        .setDisplaySize(244, 244);
      const illustrationFrame = this.add.graphics();
      illustrationFrame
        .lineStyle(5, 0xe9788f, 0.75)
        .strokeRoundedRect(403, 301, 258, 258, 31);
      overlayObjects.push(illustration, illustrationFrame);
    }
    if (record?.isNewRecord === true) {
      const badge = this.add.graphics();
      badge
        .fillStyle(0x51345f, 0.2)
        .fillRoundedRect(446, badgeY + 8, 188, 44, 20)
        .fillStyle(0xf2bd62, 1)
        .fillRoundedRect(438, badgeY, 188, 44, 20)
        .lineStyle(3, 0x9f663b, 0.95)
        .strokeRoundedRect(438, badgeY, 188, 44, 20);
      const badgeText = this.add
        .text(532, badgeY + 22, 'NEW RECORD', {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '18px',
          color: '#51345f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      overlayObjects.push(badge, badgeText);
    }
    this.#endOverlay = this.add
      .container(0, 0, overlayObjects)
      .setDepth(UI_DEPTH + 100)
      .setY(18)
      .setAlpha(0);
    this.cameras.main.ignore(this.#endOverlay);
    this.tweens.add({
      targets: this.#endOverlay,
      y: 0,
      alpha: 1,
      duration: 320,
      ease: 'Back.easeOut',
    });
    if (record?.isNewRecord === true) {
      this.tweens.add({
        targets: [leftStar, rightStar],
        angle: '+=24',
        scale: 1.18,
        duration: 700,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private enemyWorldPosition(enemy: RuntimeEnemy): GridPoint {
    const target = enemy.targetCell;
    const interpolatedX =
      target === null
        ? enemy.cellX
        : Phaser.Math.Linear(enemy.cellX, target.x, enemy.transitionProgress);
    const interpolatedY =
      target === null
        ? enemy.cellY
        : Phaser.Math.Linear(enemy.cellY, target.y, enemy.transitionProgress);
    return {
      x: (interpolatedX + 0.5) * CELL_SIZE + enemy.visualOffsetX,
      y: (interpolatedY + 0.5) * CELL_SIZE + enemy.visualOffsetY,
    };
  }

  private enemyTexture(type: EnemyType): string {
    switch (type) {
      case 'weak':
        return PrototypeTexture.EnemyWeak;
      case 'fast':
        return PrototypeTexture.EnemyFast;
      case 'strong':
        return PrototypeTexture.EnemyStrong;
      case 'roach':
        return PrototypeTexture.EnemyRoach;
    }
  }

  private enemyDisplaySize(type: EnemyType): [number, number] {
    switch (type) {
      case 'weak':
        return [42, 48];
      case 'fast':
        return [42, 48];
      case 'strong':
        return [62, 58];
      case 'roach':
        return [56, 68];
    }
  }

  private phaseLabel(phase: string): string {
    switch (phase) {
      case 'spawning':
        return 'Гості йдуть';
      case 'active':
        return 'Захист';
      case 'completed':
        return 'Завершено';
      default:
        return phase;
    }
  }

  private worldToCell(worldX: number, worldY: number): GridPoint | null {
    const x = Math.floor(worldX / CELL_SIZE);
    const y = Math.floor(worldY / CELL_SIZE);
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
      return null;
    }
    return { x, y };
  }

  private createUiCamera(worldObjects: readonly Phaser.GameObjects.GameObject[]): void {
    const worldSet = new Set(worldObjects);
    const uiObjects = this.children.list.filter((object) => !worldSet.has(object));
    this.#uiCamera = this.cameras.add(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.#uiCamera.ignore([...worldObjects]);
    this.cameras.main.ignore(uiObjects);
  }

  private isPointerOverHud(x: number, y: number): boolean {
    return (
      STATUS_PANEL_BOUNDS.contains(x, y) ||
      (this.#interfacePanel.visible && BUILD_PANEL_BOUNDS.contains(x, y)) ||
      (this.#actionDock.visible && ACTION_DOCK_BOUNDS.contains(x, y))
    );
  }

  private worldDepth(worldY: number, layerOffset = 0): number {
    return WORLD_DEPTH_BASE + worldY + layerOffset;
  }

  private pointerWorldPosition(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private startSellSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.#simulation.canBuild) {
      return;
    }
    const world = this.pointerWorldPosition(pointer);
    const point = this.worldToCell(world.x, world.y);
    if (point === null) {
      return;
    }
    this.#sellSelectionStart = point;
    this.#sellSelectionEnd = point;
    this.drawSellSelection();
  }

  private updateSellSelection(pointer: Phaser.Input.Pointer): void {
    if (this.#sellSelectionStart === null) {
      return;
    }
    const world = this.pointerWorldPosition(pointer);
    this.#sellSelectionEnd = this.clampedWorldToCell(world.x, world.y);
  }

  private finishSellSelection(pointer: Phaser.Input.Pointer): void {
    const start = this.#sellSelectionStart;
    if (
      start === null
      || this.#buildTool !== 'sell'
      || !this.#simulation.canBuild
    ) {
      this.cancelSellSelection();
      return;
    }

    const end = this.#sellSelectionEnd ?? start;
    this.cancelSellSelection();
    const result = this.#simulation.sellDefenses(
      cellsInGridRectangle(start, end),
    );
    if (result.soldCount > 0) {
      playGameCue(this, AUDIO_KEYS.sellRemove);
    } else if (result.reason === 'no-defense') {
      playGameCue(this, AUDIO_KEYS.invalid);
      this.showToast('У вибраній області немає захисту');
    }

    const world = this.pointerWorldPosition(pointer);
    this.drawBuildHover(world.x, world.y);
  }

  private cancelSellSelection(): void {
    if (this.#sellSelectionStart !== null || this.#sellSelectionEnd !== null) {
      this.#hoverOverlay.clear();
    }
    this.#sellSelectionStart = null;
    this.#sellSelectionEnd = null;
  }

  private drawSellSelection(): void {
    const start = this.#sellSelectionStart;
    const end = this.#sellSelectionEnd;
    if (start === null || end === null) {
      return;
    }

    this.#hoverOverlay.clear();
    const bounds = gridRectangleBounds(start, end);
    const x = bounds.minX * CELL_SIZE + 1;
    const y = bounds.minY * CELL_SIZE + 1;
    const width = (bounds.maxX - bounds.minX + 1) * CELL_SIZE - 2;
    const height = (bounds.maxY - bounds.minY + 1) * CELL_SIZE - 2;
    this.#hoverOverlay
      .setVisible(true)
      .fillStyle(0xf4a2b8, 0.2)
      .fillRect(x, y, width, height);

    for (const point of cellsInGridRectangle(start, end)) {
      if (!this.#simulation.canSellDefense(point)) {
        continue;
      }
      this.#hoverOverlay
        .fillStyle(0xd94e70, 0.28)
        .fillRect(
          point.x * CELL_SIZE + 2,
          point.y * CELL_SIZE + 2,
          CELL_SIZE - 4,
          CELL_SIZE - 4,
        );
    }

    this.#hoverOverlay
      .lineStyle(3, 0xc34769, 1)
      .strokeRect(x, y, width, height);
  }

  private clampedWorldToCell(worldX: number, worldY: number): GridPoint {
    return {
      x: Phaser.Math.Clamp(Math.floor(worldX / CELL_SIZE), 0, GRID_WIDTH - 1),
      y: Phaser.Math.Clamp(Math.floor(worldY / CELL_SIZE), 0, GRID_HEIGHT - 1),
    };
  }

  private startCameraPan(pointer: Phaser.Input.Pointer): void {
    const camera = this.cameras.main;
    if (!canPanCamera(camera.zoom, CAMERA_MIN_ZOOM)) {
      this.centerCameraOnArena();
    }
    this.#panningCamera = true;
    this.#panMoved = false;
    this.#panPointerStartX = pointer.x;
    this.#panPointerStartY = pointer.y;
    this.#panScrollStartX = camera.scrollX;
    this.#panScrollStartY = camera.scrollY;
    this.game.canvas.style.cursor = canPanCamera(
      camera.zoom,
      CAMERA_MIN_ZOOM,
    )
      ? 'grabbing'
      : this.cursorForCurrentTool();
  }

  private panCamera(pointer: Phaser.Input.Pointer): void {
    const deltaX = pointer.x - this.#panPointerStartX;
    const deltaY = pointer.y - this.#panPointerStartY;
    if (
      !this.#panMoved &&
      Math.hypot(deltaX, deltaY) < CAMERA_DRAG_THRESHOLD
    ) {
      return;
    }
    this.#panMoved = true;
    const camera = this.cameras.main;
    if (!canPanCamera(camera.zoom, CAMERA_MIN_ZOOM)) {
      this.centerCameraOnArena();
      return;
    }
    camera.setScroll(
      this.#panScrollStartX - deltaX / camera.zoom,
      this.#panScrollStartY - deltaY / camera.zoom,
    );
    this.clampCameraScroll();
  }

  private stopCameraPan(): void {
    this.#panningCamera = false;
    this.#panMoved = false;
    this.game.canvas.style.cursor = this.cursorForCurrentTool();
  }

  private updateKeyboardCamera(deltaMs: number): void {
    if (this.#sellSelectionStart !== null) {
      return;
    }
    const camera = this.cameras.main;
    if (!canPanCamera(camera.zoom, CAMERA_MIN_ZOOM)) {
      this.centerCameraOnArena();
      return;
    }
    const cursors = this.#cursorKeys;
    const wasd = this.#wasdKeys;
    if (cursors === null || wasd === null) {
      return;
    }

    const horizontal =
      (cursors.right.isDown || wasd.right.isDown ? 1 : 0) -
      (cursors.left.isDown || wasd.left.isDown ? 1 : 0);
    const vertical =
      (cursors.down.isDown || wasd.down.isDown ? 1 : 0) -
      (cursors.up.isDown || wasd.up.isDown ? 1 : 0);
    if (horizontal === 0 && vertical === 0) {
      return;
    }

    const movement = keyboardPanDelta(
      horizontal,
      vertical,
      deltaMs,
      camera.zoom,
      CAMERA_KEYBOARD_SPEED,
    );
    camera.setScroll(
      camera.scrollX + movement.x,
      camera.scrollY + movement.y,
    );
    this.clampCameraScroll();
  }

  private cursorForCurrentTool(): string {
    if (this.#buildTool !== null && this.#simulation.canBuild) {
      return 'crosshair';
    }
    return canPanCamera(this.cameras.main.zoom, CAMERA_MIN_ZOOM)
      ? 'grab'
      : 'default';
  }

  private zoomCameraAtPointer(pointer: Phaser.Input.Pointer, deltaY: number): void {
    if (deltaY === 0) {
      return;
    }
    const camera = this.cameras.main;
    const previousZoom = camera.zoom;
    const nextZoom = Phaser.Math.Clamp(
      previousZoom + (deltaY < 0 ? CAMERA_ZOOM_STEP : -CAMERA_ZOOM_STEP),
      CAMERA_MIN_ZOOM,
      CAMERA_MAX_ZOOM,
    );
    if (nextZoom === previousZoom) {
      return;
    }

    camera.setZoom(nextZoom);
    if (!canPanCamera(nextZoom, CAMERA_MIN_ZOOM)) {
      this.stopCameraPan();
      this.centerCameraOnArena();
    } else {
      const nextScroll = scrollForZoomAtPointer(
        { x: camera.scrollX, y: camera.scrollY },
        { x: pointer.x, y: pointer.y },
        previousZoom,
        nextZoom,
        camera.width,
        camera.height,
      );
      camera.setScroll(nextScroll.x, nextScroll.y);
      this.clampCameraScroll();
      this.game.canvas.style.cursor = this.cursorForCurrentTool();
    }

    const world = this.pointerWorldPosition(pointer);
    this.drawBuildHover(world.x, world.y);
  }

  private clampCameraScroll(): void {
    const camera = this.cameras.main;
    const clamped = clampScrollToHalfViewport(
      { x: camera.scrollX, y: camera.scrollY },
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      camera.width,
      camera.height,
    );
    camera.setScroll(clamped.x, clamped.y);
  }

  private centerCameraOnArena(): void {
    const camera = this.cameras.main;
    const centered = centeredCameraScroll(
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      camera.width,
      camera.height,
    );
    camera.setScroll(centered.x, centered.y);
  }

  private queuePaintTo(point: GridPoint): void {
    const start = this.#lastPaintCell ?? point;
    for (const candidate of connectedGridLine(start, point)) {
      this.queueWallCell(candidate);
    }
    this.#lastPaintCell = point;
  }

  private queueWallCell(point: GridPoint): void {
    this.#queuedWallCells.set(`${point.x}:${point.y}`, point);
  }

  private flushQueuedWalls(): void {
    if (this.#queuedWallCells.size === 0) {
      return;
    }
    if (this.#buildTool !== 'wall' || !this.#simulation.canBuild) {
      this.#queuedWallCells.clear();
      return;
    }

    const points = [...this.#queuedWallCells.values()];
    this.#queuedWallCells.clear();
    const results = this.#simulation.buildWalls(points);
    if (results.some((result) => result.built)) {
      playGameCue(this, AUDIO_KEYS.buildPlace);
    }
    if (results.some((result) => result.reason === 'would-block-route')) {
      playGameCue(this, AUDIO_KEYS.invalid);
      this.showToast('Ці книжки перекрили б шлях до дівчини');
    } else if (results.some((result) => result.reason === 'insufficient-funds')) {
      playGameCue(this, AUDIO_KEYS.invalid);
      this.showToast(`Недостатньо монет: книжки коштують ${WALL_COST}`);
    }
  }

  private stopWallPainting(): void {
    this.#paintingWalls = false;
    this.#lastPaintCell = null;
  }

  private cellCenterX(x: number): number {
    return x * CELL_SIZE + CELL_SIZE / 2;
  }

  private cellCenterY(y: number): number {
    return y * CELL_SIZE + CELL_SIZE / 2;
  }
}
