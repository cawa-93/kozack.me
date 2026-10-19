// Керування на телефоні (§10): плаваючий джойстик під лівий палець, кнопки дії й ривка
// під правий. З'являється після першого дотику.

import Phaser from "phaser";

import type { Vec } from "../sim/types";
import { COLORS, SCREEN_HEIGHT, SCREEN_WIDTH } from "./geometry";

const JOYSTICK_RADIUS = 70;
const ACTION = { x: SCREEN_WIDTH - 110, y: SCREEN_HEIGHT - 110, r: 66 };
const DASH = { x: SCREEN_WIDTH - 250, y: SCREEN_HEIGHT - 70, r: 46 };
const DEPTH = 30_000;
/** Верхня смуга з інтерфейсом не належить джойстику. */
const TOP_BAND = 80;

export class TouchControls {
  /** Напрямок руху від джойстика, довжина до 1. */
  move: Vec = { x: 0, y: 0 };
  /** Кнопку дії зараз утримують. */
  holding = false;
  private visible = false;
  private stickPointer: number | null = null;
  private actionPointer: number | null = null;
  private stickOrigin: Vec = { x: 0, y: 0 };
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly buttons: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly onAction: () => void,
    private readonly onDash: () => void,
  ) {
    scene.input.addPointer(2);
    this.base = scene.add.circle(0, 0, JOYSTICK_RADIUS, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35).setDepth(DEPTH).setVisible(false);
    this.knob = scene.add.circle(0, 0, 30, 0xffffff, 0.35).setDepth(DEPTH).setVisible(false);
    this.buttons = scene.add.graphics().setDepth(DEPTH).setVisible(false);

    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.down(pointer));
    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.moveStick(pointer));
    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.up(pointer));
    scene.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.up(pointer));
  }

  private down(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) return;
    this.visible = true;
    this.buttons.setVisible(true);
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, ACTION.x, ACTION.y) <= ACTION.r + 12) {
      this.actionPointer = pointer.id;
      this.holding = true;
      this.onAction();
      return;
    }
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, DASH.x, DASH.y) <= DASH.r + 12) {
      this.onDash();
      return;
    }
    if (pointer.x < SCREEN_WIDTH / 2 && pointer.y > TOP_BAND && this.stickPointer === null) {
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
    const g = this.buttons.clear();
    g.fillStyle(0xffffff, this.holding ? 0.4 : 0.22).fillCircle(ACTION.x, ACTION.y, ACTION.r);
    g.lineStyle(3, 0xffffff, 0.5).strokeCircle(ACTION.x, ACTION.y, ACTION.r);
    // Рука — «взяти, покласти, увімкнути».
    g.fillStyle(COLORS.paper, 0.9).fillRoundedRect(ACTION.x - 14, ACTION.y - 6, 28, 26, 8);
    for (const dx of [-14, -6, 2, 10]) g.fillRoundedRect(ACTION.x + dx, ACTION.y - 24, 6, 22, 3);
    g.fillStyle(0xffffff, canDash ? 0.22 : 0.08).fillCircle(DASH.x, DASH.y, DASH.r);
    g.lineStyle(3, 0xffffff, canDash ? 0.5 : 0.2).strokeCircle(DASH.x, DASH.y, DASH.r);
    // Подвійна стрілка — ривок.
    g.lineStyle(5, COLORS.paper, canDash ? 0.9 : 0.35);
    for (const dx of [-10, 6]) {
      g.lineBetween(DASH.x + dx - 8, DASH.y - 12, DASH.x + dx + 4, DASH.y);
      g.lineBetween(DASH.x + dx + 4, DASH.y, DASH.x + dx - 8, DASH.y + 12);
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
