// Графіка позначок старого вигляду (§8.2): екран комп'ютера, підсвітка цілі й смуги прогресу — одним шаром над усією
// квартирою, саме в такому порядку. Підсвітку малює частина, якій належить ціль (квартира, куточок, коти), а екран і смуги
// — частина позначок; стирає намальоване перша з них, що звернулася до пензля в цьому кадрі.

import Phaser from "phaser";

import { WORLD_LAYERS } from "../world/layers";
import type { WorldFrame } from "../world/part";

export class LegacyPen {
  readonly g: Phaser.GameObjects.Graphics;
  /** Кадр, у якому пензель уже стерто. */
  private frame: WorldFrame | null = null;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(WORLD_LAYERS.marks).addToDisplayList(layer);
  }

  /** Кадр почався: перше звернення за кадр стирає намальоване в минулому. */
  begin(frame: WorldFrame): Phaser.GameObjects.Graphics {
    if (frame !== this.frame) {
      this.frame = frame;
      this.g.clear();
    }
    return this.g;
  }

  destroy(): void {
    this.g.destroy();
  }
}
