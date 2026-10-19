// Іконки баблів (§11.4): без тексту, один набір на всю гру. Поки що — прості заглушки,
// намальовані кодом чорнилом; згодом їх замінить ШІ-графіка (крок 16 плану).

import Phaser from "phaser";

import { COLORS } from "./geometry";

export type IconName =
  | "alert"
  | "cross"
  | "camera"
  | "camera-missed"
  | "pot"
  | "meal"
  | "smoke"
  | "empty"
  | "food"
  | "soap"
  | "bell"
  | "box"
  | "moon"
  | "hands"
  | "drop"
  | "zz"
  | "dizzy";

export const ICON_SIZE = 40;
export const BUBBLE_WIDTH = 52;
export const BUBBLE_HEIGHT = 52;

const INK = COLORS.ink;
type Draw = (g: Phaser.GameObjects.Graphics) => void;

const ICONS: Record<IconName, Draw> = {
  alert: (g) => {
    g.fillStyle(COLORS.warning).fillRoundedRect(16, 5, 8, 21, 3).fillCircle(20, 33, 4.5);
  },
  cross: (g) => {
    g.lineStyle(7, COLORS.danger).lineBetween(9, 9, 31, 31).lineBetween(31, 9, 9, 31);
  },
  camera: (g) => {
    g.fillStyle(INK).fillRoundedRect(5, 12, 22, 17, 4).fillTriangle(27, 20, 36, 13, 36, 28);
    g.fillStyle(COLORS.danger).fillCircle(11, 17, 2.5);
  },
  "camera-missed": (g) => {
    ICONS.camera(g);
    g.lineStyle(4, COLORS.danger).lineBetween(5, 34, 35, 6);
  },
  pot: (g) => {
    g.lineStyle(2.5, INK).beginPath().arc(14, 11, 3, Math.PI, 0).strokePath();
    g.beginPath().arc(24, 9, 3, Math.PI, 0).strokePath();
    g.fillStyle(INK).fillRoundedRect(7, 18, 26, 15, 4).fillRect(3, 19, 34, 3);
  },
  meal: (g) => {
    g.fillStyle(0xe0893a).fillEllipse(20, 22, 22, 12);
    g.fillStyle(0xffffff).fillEllipse(20, 27, 32, 10);
    g.lineStyle(2.5, INK).strokeEllipse(20, 27, 32, 10);
    g.lineStyle(2.5, COLORS.good).lineBetween(12, 10, 17, 15).lineBetween(17, 15, 28, 5);
  },
  smoke: (g) => {
    g.fillStyle(0x4a4448).fillCircle(14, 22, 8).fillCircle(24, 17, 9).fillCircle(26, 27, 7).fillCircle(16, 30, 6);
  },
  empty: (g) => {
    g.lineStyle(3, INK).strokeRoundedRect(8, 9, 24, 24, 3);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 35, 34, 7);
  },
  food: (g) => {
    g.fillStyle(0xe0893a).fillEllipse(20, 19, 20, 11);
    g.fillStyle(0xffffff).fillEllipse(20, 24, 30, 10);
    g.lineStyle(2.5, INK).strokeEllipse(20, 24, 30, 10);
  },
  soap: (g) => {
    g.fillStyle(0x8fc3d6).fillRoundedRect(12, 14, 16, 20, 4);
    g.lineStyle(2.5, INK).strokeRoundedRect(12, 14, 16, 20, 4).lineBetween(20, 14, 20, 7).lineBetween(20, 7, 27, 7);
  },
  bell: (g) => {
    g.fillStyle(0xe8b93a).fillTriangle(8, 29, 32, 29, 20, 8).fillCircle(20, 15, 8);
    g.fillStyle(INK).fillCircle(20, 32, 3.5);
    g.lineStyle(2.5, INK).lineBetween(6, 29, 34, 29);
  },
  box: (g) => {
    g.fillStyle(0xb98a57).fillRect(7, 12, 26, 20);
    g.lineStyle(2.5, INK).strokeRect(7, 12, 26, 20);
    g.lineStyle(4, 0xe8d3a6).lineBetween(20, 12, 20, 32);
  },
  moon: (g) => {
    g.fillStyle(0xe8d27a).fillCircle(20, 20, 13);
    g.fillStyle(0xffffff).fillCircle(26, 15, 11);
  },
  hands: (g) => {
    g.fillStyle(0xe8c39e).fillRoundedRect(11, 16, 18, 18, 5);
    for (const x of [11, 16, 21, 26]) g.fillRoundedRect(x, 6, 4.5, 14, 2);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 34, 34, 6);
  },
  drop: (g) => {
    g.fillStyle(0x6fb3d6).fillTriangle(20, 5, 10, 22, 30, 22).fillCircle(20, 25, 10);
  },
  zz: (g) => {
    g.lineStyle(3.5, INK);
    g.strokePoints([new Phaser.Math.Vector2(6, 16), new Phaser.Math.Vector2(18, 16), new Phaser.Math.Vector2(6, 30), new Phaser.Math.Vector2(18, 30)]);
    g.strokePoints([new Phaser.Math.Vector2(22, 8), new Phaser.Math.Vector2(34, 8), new Phaser.Math.Vector2(22, 22), new Phaser.Math.Vector2(34, 22)]);
  },
  dizzy: (g) => {
    g.lineStyle(3, 0x8a5cc0).beginPath();
    for (let i = 0; i <= 40; i++) {
      const angle = i * 0.45;
      const radius = 2 + i * 0.35;
      const x = 20 + Math.cos(angle) * radius;
      const y = 20 + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  },
};

/** Намалювати текстури іконок і тла бабла один раз на старті. */
export function createIconTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("bubble")) return;
  const g = scene.make.graphics({}, false);
  for (const [name, draw] of Object.entries(ICONS)) {
    g.clear();
    draw(g);
    g.generateTexture(`icon-${name}`, ICON_SIZE, ICON_SIZE);
  }
  // Тло бабла з хвостиком донизу.
  g.clear();
  g.fillStyle(0xffffff).fillRoundedRect(2, 2, BUBBLE_WIDTH - 4, BUBBLE_HEIGHT - 12, 12);
  g.fillTriangle(BUBBLE_WIDTH / 2 - 7, BUBBLE_HEIGHT - 11, BUBBLE_WIDTH / 2 + 7, BUBBLE_HEIGHT - 11, BUBBLE_WIDTH / 2, BUBBLE_HEIGHT - 2);
  g.lineStyle(3, COLORS.ink).strokeRoundedRect(2, 2, BUBBLE_WIDTH - 4, BUBBLE_HEIGHT - 12, 12);
  g.generateTexture("bubble", BUBBLE_WIDTH, BUBBLE_HEIGHT);
  g.destroy();
}
