// Персонаж-заглушка: тінь, тіло, голова, зачіска; дивиться туди, куди йде (§8.4).

import Phaser from "phaser";

import type { Character } from "../sim/types";
import type { BeardLook } from "../sim/grooming";
import { drawItem } from "./apartment";
import { COLORS, depthOf, toScreen } from "./geometry";

/** Палітри конструктора персонажа (§5.1): номери у `Look` — індекси тут. */
export const PALETTE = {
  skin: [0xf2d4b6, 0xe8c39e, 0xc99a6e, 0x9a6b45, 0x6b4630],
  hairColor: [0x2f2420, 0x4a2f27, 0x8a5a33, 0xd9b45a, 0xb8462f, 0x9aa3ab],
  eyes: [0x1f1a24, 0x4f7fb3, 0x5a8a3a, 0x7a5230],
  clothes: [0xc0675a, 0x5a7fc0, 0x6fae6a, 0xe8b93a, 0x8e4a6a, 0x3a3440, 0xe9e6df],
} as const;
/** Зачіски: коротка, довга, хвостик, кучері. Обличчя: кругле, овальне, широке. Статура: струнка, звичайна, кремезна. */
export const HAIR_STYLES = ["коротка", "довга", "хвостик", "кучері"] as const;
export const FACES = ["кругле", "овальне", "широке"] as const;
export const BUILDS = ["струнка", "звичайна", "кремезна"] as const;

const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length] as T;

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
  draw(character: Character, moving: boolean, time: number, away = false, beard: BeardLook | null = null): void {
    // У поїздці персонажа вдома не видно (§8.5).
    this.g.setVisible(!away);
    if (away) return;
    const { body, held } = character;
    const feet = toScreen(body);
    const g = this.g.clear().setDepth(depthOf(feet.y));
    const look = character.look;
    const skin = pick(PALETTE.skin, look.skin);
    const hair = pick(PALETTE.hairColor, look.hairColor);
    const shirt = pick(PALETTE.clothes, look.top);
    const pants = pick(PALETTE.clothes, look.bottom + 5);
    const shoes = pick(PALETTE.clothes, look.shoes + 5);
    const width = [22, 26, 32][((look.build % 3) + 3) % 3] ?? 26;
    const face = [{ w: 24, h: 24 }, { w: 22, h: 27 }, { w: 27, h: 23 }][((look.face % 3) + 3) % 3] ?? { w: 24, h: 24 };
    const bob = moving ? -Math.abs(Math.sin(time / 85)) * 3 : 0;
    const x = feet.x;
    const y = feet.y + bob;
    const back = body.facing.y < -0.5;

    g.fillStyle(0x000000, 0.25).fillEllipse(feet.x, feet.y, 30, 10);
    if (body.dash > 0) g.fillStyle(0xffffff, 0.35).fillEllipse(feet.x - body.facing.x * 18, feet.y - body.facing.y * 10, 22, 8);
    // Ноги й тулуб.
    g.fillStyle(pants).fillRoundedRect(x - 9, y - 16, 7, 16, 3).fillRoundedRect(x + 2, y - 16, 7, 16, 3);
    g.fillStyle(shoes).fillRoundedRect(x - 10, y - 4, 9, 5, 2).fillRoundedRect(x + 1, y - 4, 9, 5, 2);
    g.fillStyle(shirt).fillRoundedRect(x - width / 2, y - 42, width, 30, 9);
    g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(x - width / 2, y - 42, width, 30, 9);
    // Голова.
    const hx = x + body.facing.x * 2;
    const hy = y - 54;
    g.fillStyle(skin).fillEllipse(hx, hy, face.w, face.h);
    g.lineStyle(2.5, COLORS.ink).strokeEllipse(hx, hy, face.w, face.h);
    g.fillStyle(hair);
    const style = ((look.hair % 4) + 4) % 4;
    if (back) {
      g.fillEllipse(hx, hy, face.w, face.h);
      if (style === 2) g.fillCircle(hx, hy - 12, 6);
    } else {
      g.fillEllipse(hx, hy - 8, face.w + 2, 11);
      if (style === 3) for (const dx of [-10, -4, 4, 10]) g.fillCircle(hx + dx, hy - 11, 5);
      if (style === 2) g.fillCircle(hx - body.facing.x * 10, hy - 12, 6);
      // Очі дивляться в бік руху.
      g.fillStyle(pick(PALETTE.eyes, look.eyes))
        .fillCircle(hx - 4 + body.facing.x * 4, hy + 1 + body.facing.y * 2, 1.8)
        .fillCircle(hx + 4 + body.facing.x * 4, hy + 1 + body.facing.y * 2, 1.8);
    }
    if (style === 1) g.fillStyle(hair).fillRoundedRect(hx - face.w / 2 - 1, hy - 6, 6, 20, 3).fillRoundedRect(hx + face.w / 2 - 5, hy - 6, 6, 20, 3);
    // Борода (§5.1): щетина — крапки, охайна — акуратна, неохайна — кошлата.
    if (!back && beard === "stubble") {
      g.fillStyle(hair, 0.7);
      for (const [dx, dy] of [[-6, 5], [-3, 8], [0, 9], [3, 8], [6, 5], [-1, 6], [2, 6]] as const) g.fillCircle(hx + dx, hy + dy, 1);
    }
    if (!back && beard === "neat") g.fillStyle(hair).fillEllipse(hx, hy + 7, 16, 9);
    if (!back && beard === "unkempt") g.fillStyle(hair).fillEllipse(hx, hy + 9, 22, 15).fillTriangle(hx - 9, hy + 10, hx - 13, hy + 18, hx - 5, hy + 14).fillTriangle(hx + 9, hy + 10, hx + 13, hy + 19, hx + 4, hy + 14);
    if (held) drawItem(g, held, x + body.facing.x * 10, y - 22, 0.9);
    this.head = { x: hx, y: hy - 16 };
    this.hands = { x: x + body.facing.x * 12, y: y - 14, depth: depthOf(feet.y) + (body.facing.y < -0.5 ? -1 : 1) };
  }
}
