// Портрет персонажа в картках створення (§5.1): та сама фігура, що й у грі, на весь зріст, лише більша. Canvas 2D, без
// Phaser.
//
// Фігура — частини скелета, запечені компонувальником тим самим рецептом, що в грі (`composePortrait`,
// `iso/personportrait.ts`; крок 16, T2). Поки атлас вантажиться, полотно лишається як було, а коли атлас готовий, портрет
// перемальовується сам.

import type { Cat, Look } from "../sim/types";
import { composeFigure, composePortrait } from "../view/art/compose";
import { catRecipeOf } from "../view/art/recipes";
import { catPortraitParts } from "../view/iso/catportrait";
import { personPortraitParts } from "../view/iso/personportrait";

/** Полотно портрета заданого розміру в CSS-пікселях; малюнок — `drawPortrait`. */
export function portraitCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.className = "portrait";
  return canvas;
}

/** Поле довкола фігури, частка меншої сторони полотна. */
const PADDING = 0.04;

/** Намалювати кота (§9.7); атлас ще вантажиться — перемалює, щойно він готовий. */
export function drawCatPortrait(canvas: HTMLCanvasElement, cat: Cat): void {
  composeFigure(canvas, catPortraitParts(cat), catRecipeOf(cat), { padding: PADDING, onReady: () => drawCatPortrait(canvas, cat) });
}

/**
 * Намалювати персонажа анфас на весь зріст частинами скелета з гри (`composePortrait`). Атлас ще вантажиться — портрет
 * перемальовується, щойно він готовий (той самий `look`: картка змінює його на місці); атласу немає зовсім — полотно порожнє.
 */
export function drawPortrait(canvas: HTMLCanvasElement, look: Look): void {
  composePortrait(canvas, look, {
    parts: personPortraitParts(look),
    align: "bottom",
    padding: PADDING,
    onReady: () => drawPortrait(canvas, look),
  });
}
