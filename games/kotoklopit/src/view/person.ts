// Персонаж-заглушка: тінь, тіло, голова, зачіска; дивиться туди, куди йде (§8.4).

import Phaser from "phaser";

import type { Character } from "../sim/types";
import { drawItem } from "./apartment";
import { COLORS, depthOf, toScreen } from "./geometry";

const SKIN = 0xe8c39e;
const LOOK = {
  female: { shirt: 0xc0675a, hair: 0x4a2f27 },
  male: { shirt: 0x5a7fc0, hair: 0x2f2420 },
} as const;

export class PersonView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().addToDisplayList(layer);
  }

  /** Точка над головою для баблів. */
  head = { x: 0, y: 0 };
  /** Де персонаж тримає кота: біля грудей, трохи попереду (§9.12). */
  hands = { x: 0, y: 0, depth: 0 };

  /** Намалювати персонажа; під час руху він трохи підстрибує на кроках. */
  draw(character: Character, moving: boolean, time: number): void {
    const { body, sex, held } = character;
    const feet = toScreen(body);
    const g = this.g.clear().setDepth(depthOf(feet.y));
    const look = LOOK[sex];
    const bob = moving ? -Math.abs(Math.sin(time / 85)) * 3 : 0;
    const x = feet.x;
    const y = feet.y + bob;
    const back = body.facing.y < -0.5;

    g.fillStyle(0x000000, 0.25).fillEllipse(feet.x, feet.y, 30, 10);
    if (body.dash > 0) g.fillStyle(0xffffff, 0.35).fillEllipse(feet.x - body.facing.x * 18, feet.y - body.facing.y * 10, 22, 8);
    // Ноги й тулуб.
    g.fillStyle(0x3a3440).fillRoundedRect(x - 9, y - 16, 7, 16, 3).fillRoundedRect(x + 2, y - 16, 7, 16, 3);
    g.fillStyle(look.shirt).fillRoundedRect(x - 13, y - 42, 26, 30, 9);
    g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(x - 13, y - 42, 26, 30, 9);
    // Голова.
    const hx = x + body.facing.x * 2;
    const hy = y - 54;
    g.fillStyle(SKIN).fillCircle(hx, hy, 12);
    g.lineStyle(2.5, COLORS.ink).strokeCircle(hx, hy, 12);
    g.fillStyle(look.hair);
    if (back) {
      g.fillCircle(hx, hy, 12);
    } else {
      g.fillEllipse(hx, hy - 8, 26, 11);
      // Очі дивляться в бік руху.
      g.fillStyle(COLORS.ink)
        .fillCircle(hx - 4 + body.facing.x * 4, hy + 1 + body.facing.y * 2, 1.8)
        .fillCircle(hx + 4 + body.facing.x * 4, hy + 1 + body.facing.y * 2, 1.8);
    }
    if (sex === "female") g.fillStyle(look.hair).fillRoundedRect(hx - 13, hy - 6, 6, 20, 3).fillRoundedRect(hx + 7, hy - 6, 6, 20, 3);
    if (held) drawItem(g, held, x + body.facing.x * 10, y - 22, 0.9);
    this.head = { x: hx, y: hy - 16 };
    this.hands = { x: x + body.facing.x * 12, y: y - 14, depth: depthOf(feet.y) + (body.facing.y < -0.5 ? -1 : 1) };
  }
}
