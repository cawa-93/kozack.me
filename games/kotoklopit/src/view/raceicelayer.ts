// Шар льоду «Ожеледиці» в сцені дороги (вигляд і розрахунки — `raceice.ts`): одна TileSprite над асфальтом. Текстуру плівки з
// блисками малює код (як градієнти ночі, `racenight.ts`): Canvas2D, один раз на гру, спільна для всіх показів сцени, — це
// дешевше за ще один файл в атласі. Прозорість — у самій текстурі, без tint: діє і в запасному Canvas. Щокадру — лише зсув,
// коли дорога зрушила.

import Phaser from "phaser";

import { iceRect, iceScroll, RACE_ICE } from "./raceice";

const KEY = "race-ice:glaze";

/** `#rrggbb` палітри з непрозорістю — рядком CSS для Canvas2D. */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function glazeCanvas(): HTMLCanvasElement {
  const { width, height, film, glint, slant, glints } = RACE_ICE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = rgba(film.color, film.alpha);
  context.fillRect(0, 0, width, height);
  context.fillStyle = rgba(glint.color, glint.alpha);
  for (const g of glints) {
    const dx = g.length * slant;
    context.beginPath();
    context.moveTo(g.x, g.y);
    context.lineTo(g.x + g.width, g.y);
    context.lineTo(g.x + g.width + dx, g.y - g.length);
    context.lineTo(g.x + dx, g.y - g.length);
    context.closePath();
    context.fill();
  }
  return canvas;
}

export class RaceIceLayer {
  private readonly sprite: Phaser.GameObjects.TileSprite;
  /** Що вже стоїть на шарі: середина дороги, масштаб, висота кадру й зсув текстури. */
  private at = { cx: NaN, k: NaN, height: NaN, scroll: NaN };

  constructor(scene: Phaser.Scene, depth: number) {
    if (!scene.textures.exists(KEY)) scene.textures.addCanvas(KEY, glazeCanvas());
    this.sprite = scene.add.tileSprite(0, 0, RACE_ICE.width, RACE_ICE.height, KEY).setOrigin(0).setDepth(depth);
  }

  /** Лід кадру з серединою дороги `cx`, масштабом `k` і висотою `height`, коли проїхано `distance` px (як у `drawRoad`). */
  draw(cx: number, k: number, height: number, distance: number): void {
    const at = this.at;
    if (at.cx !== cx || at.k !== k || at.height !== height) {
      // Розмір — в одиницях арту, масштаб — `k`: зсув текстури тоді теж в одиницях арту (`iceScroll`).
      const rect = iceRect(cx, k, height);
      this.sprite.setPosition(rect.x, rect.y).setSize(RACE_ICE.width, rect.height / k).setScale(k);
      at.cx = cx;
      at.k = k;
      at.height = height;
    }
    const scroll = iceScroll(distance, k);
    if (at.scroll !== scroll) {
      this.sprite.tilePositionY = scroll;
      at.scroll = scroll;
    }
  }
}
