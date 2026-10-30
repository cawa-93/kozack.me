// Персонаж старого вигляду як частина світу (крок 16, хвиля 0): фігура (`person.ts`) і рука, що гладить кота, чи вудочка
// з пір'їнкою над ним (§8.2).

import Phaser from "phaser";

import { petOver } from "../../sim/actions";
import type { GameState } from "../../sim/types";
import { COLORS } from "../colors";
import { legacyDepthPoint } from "../iso/transition";
import { PALETTE } from "../palette";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Hands, PersonPart, Point, WorldFrame } from "../world/part";
import { PersonView } from "./person";

export class LegacyPersonView implements PersonPart {
  private readonly figure: PersonView;
  /** Рука, що гладить, і вудочка: над котом і персонажем. */
  private readonly interaction: Phaser.GameObjects.Graphics;

  constructor(private readonly ctx: PartContext) {
    this.figure = new PersonView(ctx.scene, ctx.layer, ctx.projection, ctx.projection.kind === "iso" ? (set) => legacyDepthPoint(ctx, "person", set) : null);
    this.interaction = ctx.scene.add.graphics().setDepth(WORLD_LAYERS.interaction).addToDisplayList(ctx.layer);
  }

  get head(): Point {
    return this.figure.head;
  }

  get hands(): Hands {
    return this.figure.hands;
  }

  update(state: GameState, frame: WorldFrame): void {
    // У поїздці й у душовій кабіні персонажа не видно (§8.5, §8.7).
    const activity = state.character.activity;
    // У душі персонажа не видно; купаючи кота, він стоїть біля душу з котом на руках (рішення автора 2026-10-28).
    const inside = activity?.kind === "use" && activity.inside === true && activity.bath !== true;
    this.figure.draw(state.character, frame.moving, frame.time, state.trip !== null || inside, state.home.clothes <= 0, frame.sleepiness);
  }

  /**
   * Пестощі й гра (§8.2): рука персонажа гладить кота; у грі від руки тягнеться волосінь вудки, а
   * пір'їнка кружляє над котом. Після котів: рука лягає туди, де кота намальовано цього кадру.
   */
  lateUpdate(state: GameState, frame: WorldFrame): void {
    const time = frame.time;
    const g = this.interaction.clear();
    const activity = state.character.activity;
    if ((activity?.kind !== "pet" || petOver(activity)) && (activity?.kind !== "play" || activity.done)) return;
    const cat = this.ctx.world.cat(activity.cat);
    if (!cat) return;
    const hand = this.figure.hands;
    if (activity.kind === "play") {
      const fx = cat.head.x + Math.cos(time / 220) * 16;
      const fy = cat.head.y - 14 + Math.sin(time / 160) * 8;
      const tip = { x: hand.x + (fx - hand.x) * 0.45, y: hand.y - 34 };
      g.lineStyle(3, 0x8b5e3c).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.lineStyle(1.2, COLORS.ink, 0.8).lineBetween(tip.x, tip.y, fx, fy);
      g.fillStyle(0xd9455f).fillEllipse(fx, fy + 4, 6, 12).fillStyle(0x5fa8d3).fillEllipse(fx - 4, fy + 6, 5, 10).fillStyle(0xe8b93a).fillEllipse(fx + 4, fy + 6, 5, 10);
      return;
    }
    // Рука ходить по спинці кота туди-сюди, не закриваючи морди.
    const skins = PALETTE.skin;
    const skin = skins[((state.character.look.skin % skins.length) + skins.length) % skins.length] ?? skins[0];
    const px = cat.back.x + Math.sin(time / 260) * 5;
    const py = cat.back.y;
    g.lineStyle(6, skin).lineBetween(hand.x, hand.y, px, py);
    g.fillStyle(skin).fillEllipse(px, py, 11, 8);
    g.lineStyle(1.5, COLORS.ink).strokeEllipse(px, py, 11, 8);
  }

  reset(): void {}

  destroy(): void {
    this.figure.destroy();
    this.interaction.destroy();
  }

  /** Над головою: бабли подій летять за персонажем. */
  anchor(id: string): Point | null {
    return id === "person" ? { x: this.figure.head.x, y: this.figure.head.y } : null;
  }

  highlight(): boolean {
    return false;
  }
}
