// Керування на телефоні (§10): плаваючий джойстик під лівий палець, кнопки дії й ривка
// під правий. З'являється після першого дотику.
// Джойстик і кнопки — кадри атласу `ui/touch/*` (крок 16, A13): кнопка дії має стан `held`, ривок — `cooldown`. A13 малює
// їх непрозорими, а прозорість задає код (`TOUCH_ALPHA`): квартиру під пальцем має бути видно.

import Phaser from "phaser";

import type { Vec } from "../sim/types";
import { addArt, setArt } from "./art/atlas";
import { HUD_STATES, TOUCH_ALPHA, TOUCH_ART } from "./iso/hudlook";
import type { Frame } from "./viewport";
import { UI_LAYERS } from "./world/layers";

const JOYSTICK_RADIUS = 70;
const ACTION_R = 66;
const DASH_R = 46;
const DEPTH = UI_LAYERS.touch;

export class TouchControls {
  /** Напрямок руху від джойстика, довжина до 1. */
  move: Vec = { x: 0, y: 0 };
  /** Кнопку дії зараз утримують. */
  holding = false;
  private visible = false;
  private stickPointer: number | null = null;
  private actionPointer: number | null = null;
  private stickOrigin: Vec = { x: 0, y: 0 };
  /** Джойстик — уся ліва половина екрана, будь-де, зокрема поза квартирою. */
  private stickZone = 0;
  private action = { x: 0, y: 0 };
  private dashButton = { x: 0, y: 0 };
  private readonly base: Phaser.GameObjects.Image;
  private readonly knob: Phaser.GameObjects.Image;
  /** Кнопки — кадри атласу й стани, які вони зараз показують. */
  private readonly art: {
    action: Phaser.GameObjects.Image;
    dash: Phaser.GameObjects.Image;
    shown: { action: keyof typeof HUD_STATES.action; dash: keyof typeof HUD_STATES.dash };
  };

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly onAction: () => void,
    private readonly onDash: () => void,
  ) {
    scene.input.addPointer(2);
    const image = (id: (typeof TOUCH_ART)[keyof typeof TOUCH_ART], alpha: number, state?: string): Phaser.GameObjects.Image =>
      addArt(scene, layer, id, state === undefined ? {} : { state }).setDepth(DEPTH).setAlpha(alpha).setVisible(false);
    this.base = image(TOUCH_ART.base, TOUCH_ALPHA.base);
    this.knob = image(TOUCH_ART.knob, TOUCH_ALPHA.knob);
    this.art = {
      action: image(TOUCH_ART.action, TOUCH_ALPHA.action.idle, HUD_STATES.action.idle),
      dash: image(TOUCH_ART.dash, TOUCH_ALPHA.dash.ready, HUD_STATES.dash.ready),
      shown: { action: "idle", dash: "ready" },
    };

    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.down(pointer));
    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.moveStick(pointer));
    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.up(pointer));
    scene.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.up(pointer));
  }

  /** Кнопки — у правому нижньому куті, але не під заокругленим кутом екрана. */
  layout({ width, height, safe }: Frame): void {
    const right = width - safe.right;
    const bottom = height - safe.bottom;
    this.stickZone = width / 2;
    this.action = { x: right - 110, y: bottom - 110 };
    this.dashButton = { x: right - 250, y: bottom - 70 };
    this.art.action.setPosition(this.action.x, this.action.y);
    this.art.dash.setPosition(this.dashButton.x, this.dashButton.y);
  }

  private down(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) return;
    this.visible = true;
    this.art.action.setVisible(true);
    this.art.dash.setVisible(true);
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, this.action.x, this.action.y) <= ACTION_R + 12) {
      this.actionPointer = pointer.id;
      this.holding = true;
      this.onAction();
      return;
    }
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dashButton.x, this.dashButton.y) <= DASH_R + 12) {
      this.onDash();
      return;
    }
    if (pointer.x < this.stickZone && this.stickPointer === null) {
      this.stickPointer = pointer.id;
      this.stickOrigin = { x: pointer.x, y: pointer.y };
      this.base.setPosition(pointer.x, pointer.y).setVisible(true);
      this.knob.setPosition(pointer.x, pointer.y).setVisible(true);
    }
  }

  private moveStick(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.stickPointer) return;
    const dx = pointer.x - this.stickOrigin.x;
    const dy = pointer.y - this.stickOrigin.y;
    const length = Math.hypot(dx, dy);
    const clamped = Math.min(length, JOYSTICK_RADIUS);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    this.knob.setPosition(this.stickOrigin.x + nx * clamped, this.stickOrigin.y + ny * clamped);
    this.move = { x: (nx * clamped) / JOYSTICK_RADIUS, y: (ny * clamped) / JOYSTICK_RADIUS };
  }

  private up(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.stickPointer) {
      this.stickPointer = null;
      this.move = { x: 0, y: 0 };
      this.base.setVisible(false);
      this.knob.setVisible(false);
    }
    if (pointer.id === this.actionPointer) {
      this.actionPointer = null;
      this.holding = false;
    }
  }

  /** Перемалювати кнопки: ривок тьмяніє, поки перезаряджається. */
  draw(canDash: boolean): void {
    if (!this.visible) return;
    // Кадр і прозорість — лише коли стан змінився: кнопки перемальовують щокадру, а змінюються вони рідко.
    const action = this.holding ? "held" : "idle";
    const dash = canDash ? "ready" : "cooldown";
    if (action !== this.art.shown.action) {
      this.art.shown.action = action;
      setArt(this.art.action, TOUCH_ART.action, { state: HUD_STATES.action[action] }).setAlpha(TOUCH_ALPHA.action[action]);
    }
    if (dash !== this.art.shown.dash) {
      this.art.shown.dash = dash;
      setArt(this.art.dash, TOUCH_ART.dash, { state: HUD_STATES.dash[dash] }).setAlpha(TOUCH_ALPHA.dash[dash]);
    }
  }

  reset(): void {
    this.stickPointer = null;
    this.actionPointer = null;
    this.holding = false;
    this.move = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
