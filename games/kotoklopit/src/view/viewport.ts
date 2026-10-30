// Що видно на екрані (§8.4). Квартира й інтерфейс — у різних шарах під різними камерами:
// на малому екрані камера квартири збільшує її й плавно їде за персонажем, а інтерфейс
// стоїть на місці поверх неї.

import Phaser from "phaser";

import { safeArea, type Insets } from "../screen";
import type { Vec } from "../sim/types";
import type { Projection } from "./world/projection";

/** Полотно для екрана 16:9; на екрані іншої форми воно ширшає чи вищає (Phaser.Scale.EXPAND). */
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

/** Висота смуги інтерфейсу вгорі, без безпечної зони. */
export const HUD_HEIGHT = 76;
/** Найменша клітинка підлоги в пікселях CSS (§8.4, чернетка): дрібніше на телефоні не розгледіти. */
const MIN_TILE_CSS = 44;
/** Як щільно камера йде за персонажем: що більше, то менше відстає. */
const FOLLOW_RATE = 6;

/** Екран у пікселях полотна й безпечна зона, у якій лежить інтерфейс. */
export interface Frame {
  width: number;
  height: number;
  safe: Insets;
}

export class Viewport {
  /** Шар квартири: її показує камера, що їде за персонажем. */
  readonly world: Phaser.GameObjects.Layer;
  /** Шар інтерфейсу: його показує нерухома камера. */
  readonly ui: Phaser.GameObjects.Layer;
  frame: Frame = { width: BASE_WIDTH, height: BASE_HEIGHT, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly uiCamera: Phaser.Cameras.Scene2D.Camera;
  private readonly listeners: ((frame: Frame) => void)[] = [];
  private center: Vec;
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

  /** Камера йде за персонажем, але не заглядає за межі квартири; якщо та вміщується — стоїть посередині. */
  follow(target: Vec, seconds: number): void {
    const camera = this.camera;
    const bounds = this.projection.world;
    const x = centerOn(target.x, camera.width / camera.zoom, bounds.width);
    const y = centerOn(target.y, camera.height / camera.zoom, bounds.height);
    const k = this.snap ? 1 : 1 - Math.exp(-FOLLOW_RATE * seconds);
    this.snap = false;
    this.center = { x: this.center.x + (x - this.center.x) * k, y: this.center.y + (y - this.center.y) * k };
    camera.centerOn(this.center.x, this.center.y);
  }

  private layout(): void {
    const scale = this.scene.scale;
    const { width, height } = scale.gameSize;
    // Безпечна зона — у пікселях CSS, а полотно масштабоване під екран.
    const css = safeArea();
    const k = scale.displayScale;
    const safe = { top: css.top * k.y, right: css.right * k.x, bottom: css.bottom * k.y, left: css.left * k.x };
    this.frame = { width, height, safe };

    // Квартира — під смугою інтерфейсу; під вирізом камери її видно, там лише стіни й підлога.
    const top = safe.top + HUD_HEIGHT;
    this.uiCamera.setSize(width, height);
    this.camera.setViewport(0, top, width, height - top);
    const bounds = this.projection.world;
    const fit = Math.min(width / bounds.width, (height - top) / bounds.height);
    const readable = (MIN_TILE_CSS * k.y) / this.projection.tile.height;
    this.zoomBase = Math.max(fit, readable);
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
