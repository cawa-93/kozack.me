// Приховані числа над котами (§11.5): настрій, здоров'я й любов. Лише режим розробки: `IsoCatsView` створює цей клас під
// `__DEV_TOOLS__`, тож у продакшн-збірку модуль не потрапляє.

import type Phaser from "phaser";

import type { Cat } from "../../sim/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { IsoCatView } from "./catview";

export class HiddenNumbers {
  /** Підписи за id кота; `IsoCatsView` розводить їх, щоб не налягали. */
  readonly labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private readonly ctx: PartContext) {}

  draw(cat: Cat, view: IsoCatView, shown: boolean): void {
    let label = this.labels.get(cat.id);
    if (!shown || !view.shown) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.ctx.scene.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff", backgroundColor: "#1f1a24", padding: { x: 3, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(WORLD_LAYERS.hidden)
        .addToDisplayList(this.ctx.layer);
      this.labels.set(cat.id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 30).setText(`н${Math.round(cat.mood)} з${Math.round(cat.health)} л${Math.round(cat.love)}`);
  }

  remove(id: number): void {
    this.labels.get(id)?.destroy();
    this.labels.delete(id);
  }

  clear(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }
}
