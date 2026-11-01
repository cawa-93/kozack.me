// Що видно на екрані (§8.4). Квартира й інтерфейс — у різних шарах під різними камерами:
// на малому екрані камера квартири збільшує її й плавно їде за персонажем, а інтерфейс
// стоїть на місці поверх неї.
//
// Полотно — у пікселях пристрою (`canvasFit`, `fitCanvas`): браузер його не розтягує, тож контури й текст чіткі. Інтерфейс
// розкладено в одиницях 1280 × 720, що ширшають чи вищають під форму екрана (`Frame`), — камера інтерфейсу масштабує їх
// у пікселі полотна (`CanvasFit.ui`); камера квартири рахує зум уже в пікселях полотна (`cameraZoom`).

import Phaser from "phaser";

import { safeArea, type Insets } from "../screen";
import type { Vec } from "../sim/types";
import type { Projection } from "./world/projection";
import { BASE_HEIGHT, BASE_WIDTH, cameraZoom, canvasFit, followTarget, HUD_HEIGHT, type CanvasFit } from "./zoom";

// Полотно й панель — у чистій частині камери (`zoom.ts`): від них залежить зум.
export { BASE_HEIGHT, BASE_WIDTH, HUD_HEIGHT };

/** Як щільно камера йде за персонажем: що більше, то менше відстає. */
const FOLLOW_RATE = 6;

/** Екран в одиницях інтерфейсу (`BASE_WIDTH × BASE_HEIGHT`, що ширшає чи вищає) і безпечна зона, у якій лежить інтерфейс. */
export interface Frame {
  width: number;
  height: number;
  safe: Insets;
  /** Скільки пікселів полотна в одиниці інтерфейсу (`CanvasFit.ui`): точку дотику (`pointer.x`) — ділити на нього. */
  ui: number;
}

/** Полотно гри зараз (`fitCanvas`); до старту гри — як вікно 1280 × 720. */
let fit: CanvasFit = canvasFit({ width: BASE_WIDTH, height: BASE_HEIGHT }, 1, true);

/** Полотно гри зараз: щільність і масштаб інтерфейсу (сцени ставлять його камерам інтерфейсу). */
export function canvasNow(): Readonly<CanvasFit> {
  return fit;
}

/** Скільки пікселів CSS має тека гри (`#game`, на все вікно — style.css); тека ще без розміру — нулі. */
function parentCss(parent: HTMLElement | null): { width: number; height: number } {
  const rect = parent?.getBoundingClientRect();
  return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
}

/**
 * Розмір гри, з яким її створити (`new Phaser.Game`): полотно за теку гри й DPR (`canvasFit`). Далі розмір веде `fitCanvas`.
 */
export function startCanvas(parent: HTMLElement | null, software: boolean): CanvasFit {
  fit = canvasFit(parentCss(parent), globalThis.devicePixelRatio || 1, software);
  return fit;
}

/**
 * Тримати полотно в пікселях пристрою (гра — у `Phaser.Scale.NONE`, CSS-розмір полотна — уся тека гри, style.css): коли
 * тека змінила розмір (поворот, повний екран, вікно) чи DPR (масштаб браузера, інший монітор) — новий розмір гри. Phaser
 * сам помічає зміну теки й шле RESIZE; тоді й міняється розмір, а з ним — новий RESIZE, за яким сцени розкладаються заново.
 */
export function fitCanvas(game: Phaser.Game, software: boolean): void {
  const scale = game.scale;
  let dpr = globalThis.devicePixelRatio || 1;
  const apply = (): void => {
    const parent = scale.parentSize;
    if (!(parent.width > 0 && parent.height > 0)) return;
    fit = canvasFit({ width: parent.width, height: parent.height }, dpr, software);
    if (scale.gameSize.width === fit.width && scale.gameSize.height === fit.height) return;
    scale.resize(fit.width, fit.height);
  };
  scale.on(Phaser.Scale.Events.RESIZE, apply);
  // DPR міняється й без зміни розміру теки (масштаб сторінки, вікно на інший монітор): перевірка — одне порівняння на кадр.
  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    const now = globalThis.devicePixelRatio || 1;
    if (now === dpr) return;
    dpr = now;
    apply();
  });
}

/**
 * Камера інтерфейсу: одиниці інтерфейсу (0, 0) — у кутку полотна, у пікселях полотна — `CanvasFit.ui`. Повертає розмір
 * екрана в одиницях інтерфейсу.
 */
export function fitUiCamera(camera: Phaser.Cameras.Scene2D.Camera, gameSize: { width: number; height: number }): { width: number; height: number } {
  const ui = fit.ui;
  camera.setSize(gameSize.width, gameSize.height);
  camera.setOrigin(0, 0).setScroll(0, 0).setZoom(ui);
  return { width: gameSize.width / ui, height: gameSize.height / ui };
}

export class Viewport {
  /** Шар квартири: її показує камера, що їде за персонажем. */
  readonly world: Phaser.GameObjects.Layer;
  /** Шар інтерфейсу: його показує нерухома камера. */
  readonly ui: Phaser.GameObjects.Layer;
  frame: Frame = { width: BASE_WIDTH, height: BASE_HEIGHT, safe: { top: 0, right: 0, bottom: 0, left: 0 }, ui: 1 };
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly uiCamera: Phaser.Cameras.Scene2D.Camera;
  private readonly listeners: ((frame: Frame) => void)[] = [];
  private readonly center: Vec;
  /** Куди камера хоче стати (`followTarget`): той самий об'єкт щокадру. */
  private readonly target: Vec = { x: 0, y: 0 };
  /** Наступного кадру камера стає на місце одразу, без наїзду. */
  private snap = true;
  /** Масштаб, за якого квартира вміщується й читається, і наїзд поверх нього. */
  private zoomBase = 1;
  private zoomFocus = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly projection: Projection,
  ) {
    const bounds = projection.world;
    this.center = { x: bounds.width / 2, y: bounds.height / 2 };
    this.world = scene.add.layer();
    this.ui = scene.add.layer();
    this.camera = scene.cameras.main;
    this.uiCamera = scene.cameras.add(0, 0, undefined, undefined, false, "ui");
    this.camera.ignore(this.ui);
    this.uiCamera.ignore(this.world);
    // У квартирі пальцем нічого не натискають: дотики ловить джойстик. Інакше камера квартири
    // ще й шукала б кнопки інтерфейсу там, куди вони лягли б на квартиру.
    this.camera.inputEnabled = false;
    const resize = Phaser.Scale.Events.RESIZE;
    scene.scale.on(resize, this.layout, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(resize, this.layout, this));
    this.layout();
  }

  /** Верхній край видимої квартири (під панеллю) у координатах світу: вище бабли не видно. */
  get worldTop(): number {
    return this.camera.worldView.y;
  }

  /** Підписатися на зміну розміру екрана; слухача викликано й одразу. */
  onLayout(listener: (frame: Frame) => void): void {
    this.listeners.push(listener);
    listener(this.frame);
  }

  /** Наїзд камери: множник до звичайного масштабу (засинання, §8.8). 1 — без наїзду. */
  focus(k: number): void {
    this.zoomFocus = k;
    this.camera.setZoom(this.zoomBase * k);
  }

  /** Поставити камеру на місце без наїзду: наприклад, на початку дня. */
  jump(): void {
    this.snap = true;
  }

  /**
   * Камера йде за персонажем — за його ногами за симуляцією (`body`, клітинки), трохи вище (`followTarget`), — але не
   * заглядає за межі квартири; якщо та вміщується — стоїть посередині.
   */
  follow(body: Vec, seconds: number): void {
    const camera = this.camera;
    const bounds = this.projection.world;
    const target = followTarget(this.projection, body, this.target);
    const x = centerOn(target.x, camera.width / camera.zoom, bounds.width);
    const y = centerOn(target.y, camera.height / camera.zoom, bounds.height);
    const k = this.snap ? 1 : 1 - Math.exp(-FOLLOW_RATE * seconds);
    this.snap = false;
    this.center.x += (x - this.center.x) * k;
    this.center.y += (y - this.center.y) * k;
    camera.centerOn(this.center.x, this.center.y);
  }

  private layout(): void {
    const game = this.scene.scale.gameSize;
    // Інтерфейс — в одиницях інтерфейсу; камера інтерфейсу масштабує їх у пікселі полотна.
    const { width, height } = fitUiCamera(this.uiCamera, game);
    const ui = fit.ui;
    // Безпечна зона — у пікселях CSS.
    const css = safeArea();
    const unit = fit.unit;
    const safe = { top: css.top * unit, right: css.right * unit, bottom: css.bottom * unit, left: css.left * unit };
    this.frame = { width, height, safe, ui };

    // Квартира — під смугою інтерфейсу; під вирізом камери її видно, там лише стіни й підлога. Камера квартири — у
    // пікселях полотна.
    const top = (safe.top + HUD_HEIGHT) * ui;
    this.camera.setViewport(0, top, game.width, game.height - top);
    // Зум — більший із «видно всю квартиру» й «клітинка не дрібніша за мінімум» (§8.4, `zoom.ts`).
    this.zoomBase = cameraZoom({ width: game.width, height: game.height - top, cssScale: fit.density }, this.projection);
    this.camera.setZoom(this.zoomBase * this.zoomFocus);
    this.snap = true;
    for (const listener of this.listeners) listener(this.frame);
  }
}

/** Центр огляду вздовж однієї осі. */
function centerOn(target: number, view: number, size: number): number {
  if (view >= size) return size / 2;
  return Phaser.Math.Clamp(target, view / 2, size - view / 2);
}
