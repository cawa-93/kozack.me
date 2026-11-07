// Контур клітинки, куди стане річ із рук (§8.7): ромб плитки на підлозі, під речами й котами. Малюється один раз, далі лише
// переїжджає. Колір — токен `highlight`, облямівка — `ink`, як у запасного контуру підсвітки цілі (`highlight.ts`).

import type Phaser from "phaser";

import { PALETTE } from "../../../art/palette";
import type { Vec } from "../../sim/types";
import { ISO, ISO_TILE } from "../world/projection";
import type { IsoDepth, IsoPointHandle } from "./depth";

const HIGHLIGHT = Number.parseInt(PALETTE.highlight.slice(1), 16);
const INK = Number.parseInt(PALETTE.ink.slice(1), 16);
/** Смуга контуру й чорнильна облямівка під нею (одиниці арту). */
const LINE = { band: 4, ink: 7 } as const;
/** Контур трохи всередині плитки: сусідні клітинки не зливаються. */
const INSET = 0.9;

export class PlaceMark {
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly point: IsoPointHandle;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, depth: IsoDepth) {
    const w = (ISO_TILE.width / 2) * INSET;
    const h = (ISO_TILE.height / 2) * INSET;
    this.shape = scene.add.graphics();
    for (const [width, color] of [
      [LINE.ink, INK],
      [LINE.band, HIGHLIGHT],
    ] as const) {
      this.shape.lineStyle(width, color, 1).beginPath().moveTo(0, -h).lineTo(w, 0).lineTo(0, h).lineTo(-w, 0).closePath().strokePath();
    }
    layer.add(this.shape);
    this.shape.setVisible(false);
    this.point = depth.addPoint((d) => this.shape.setDepth(d), { flat: true, half: ISO_TILE.width / 2 });
  }

  /** Показати контур на клітинці з центром `at`. */
  show(at: Vec): void {
    const s = ISO.toScreen(at);
    this.shape.setPosition(s.x, s.y).setVisible(true);
    this.point.place(at.x, at.y);
  }

  hide(): void {
    this.shape.setVisible(false);
    this.point.hide();
  }
}
