// Персонаж-заглушка: тінь, тіло, голова, зачіска; дивиться туди, куди йде (§8.4).

import Phaser from "phaser";

import type { Character } from "../sim/types";
import type { BeardLook } from "../sim/grooming";
import { drawItem } from "./apartment";
import { COLORS, depthOf, toScreen } from "./geometry";

import { PALETTE } from "./palette";

export { BUILDS, FACES, HAIR_STYLES, PALETTE } from "./palette";

/** Колір плями для тканини: на світлій — темний бруд, на темній — світлий пил (§8.7). */
function stainOn(cloth: number): number {
  const r = (cloth >> 16) & 0xff;
  const gr = (cloth >> 8) & 0xff;
  const b = cloth & 0xff;
  const light = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
  return light < 0.45 ? 0xd8c8a0 : 0x5a4a30;
}

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
  /** `dirty` — чистого одягу немає (§8.7): плями на одязі й хвилі запаху над персонажем. */
  draw(character: Character, moving: boolean, time: number, away = false, beard: BeardLook | null = null, dirty = false): void {
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
    if (dirty) {
      // Брудний одяг: плями на сорочці й штанях — контрастні до кольору одягу й з контуром,
      // щоб їх було видно і на білому, і на графітовому.
      const stain = (cloth: number, sx: number, sy: number, w: number, h: number): void => {
        g.fillStyle(stainOn(cloth), 0.9).fillEllipse(sx, sy, w, h);
        g.lineStyle(1, COLORS.ink, 0.45).strokeEllipse(sx, sy, w, h);
      };
      stain(shirt, x - width / 4, y - 30, 7, 5);
      stain(shirt, x + width / 5, y - 22, 6, 4);
      stain(pants, x + 5, y - 8, 4, 4);
    }
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
    if (dirty) {
      // Хвилі запаху підіймаються над персонажем.
      g.lineStyle(2, 0x7a8a3a, 0.8);
      for (const [dx, phase] of [[-10, 0], [0, 1.3], [10, 2.6]] as const) {
        const wy = hy - 26 - ((time / 40 + phase * 12) % 14);
        g.beginPath().arc(hx + dx + Math.sin(time / 200 + phase) * 2, wy, 3, Math.PI * 0.5, Math.PI * 1.5).strokePath();
      }
    }
    this.head = { x: hx, y: hy - 16 };
    this.hands = { x: x + body.facing.x * 12, y: y - 14, depth: depthOf(feet.y) + (body.facing.y < -0.5 ? -1 : 1) };
  }
}
