// Котячий куточок старого вигляду як частина світу (крок 16, хвиля 0): миски, лотки, будиночки, техніка й безлад на
// підлозі (`catcorner.ts`), якорі баблів над ними й підсвітка.

import Phaser from "phaser";

import type { Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { COLORS } from "../colors";
import type { PartContext } from "../world/context";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import { OBLIQUE } from "../world/projection";
import { drawCatCorner, itemScreen } from "./catcorner";
import type { LegacyPen } from "./pen";

export class LegacyFloorView implements WorldPart {
  /** Усе пласке й лежить на підлозі: один шар під меблями, котами й персонажем. */
  private readonly corner: Phaser.GameObjects.Graphics;
  /** Старий куточок малюється лише косою проєкцією. */
  private readonly proj = OBLIQUE;

  constructor(
    private readonly ctx: PartContext,
    private readonly pen: LegacyPen,
  ) {
    // Миски, лотки й безлад лежать на підлозі: під меблями, котами й персонажем.
    this.corner = ctx.scene.add.graphics().setDepth(0).addToDisplayList(ctx.layer);
  }

  update(state: GameState, frame: WorldFrame): void {
    this.pen.begin(frame);
    drawCatCorner(this.corner, this.proj, state);
  }

  reset(): void {}

  destroy(): void {
    this.corner.destroy();
  }

  /** Над річчю котячого кутка чи безладом. */
  anchor(id: string): Point | null {
    const [kind, raw] = id.split(":");
    const number = Number(raw);
    const home = this.ctx.state().home;
    if (kind === "item") {
      const item = home.items.find((i) => i.id === number);
      if (!item) return null;
      const p = itemScreen(this.proj, item);
      return { x: p.x, y: p.y - 14 };
    }
    if (kind === "mess") {
      const mess = home.messes.find((m) => m.id === number);
      if (!mess) return null;
      const p = this.proj.toScreen(mess);
      return { x: p.x, y: p.y - 12 };
    }
    return null;
  }

  /** Овал довкола речі чи безладу на підлозі. */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "item" && target.type !== "mess") return false;
    const g = this.pen.g.lineStyle(4, COLORS.highlight, alpha);
    if (target.type === "item") {
      const p = itemScreen(this.proj, target.item);
      g.strokeEllipse(p.x, p.y, target.item.kind === "litter" ? 56 : 40, target.item.kind === "litter" ? 40 : 22);
      return true;
    }
    const p = this.proj.toScreen(target.mess);
    g.strokeEllipse(p.x, p.y, 34, 18);
    return true;
  }
}
