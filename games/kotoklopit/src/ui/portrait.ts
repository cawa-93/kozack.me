// Портрет персонажа в картках створення (§5.1): ті самі фігура й палітри, що й у грі, на весь зріст,
// лише більші. Canvas 2D, без Phaser.

import type { Look, Sex } from "../sim/types";
import { PALETTE } from "../view/palette";

const INK = "#1f1a24";
const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length] as T;
const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

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

/** Намалювати персонажа анфас: фігура з гри (`view/person.ts`), збільшена під полотно. */
export function drawPortrait(canvas: HTMLCanvasElement, look: Look, sex: Sex): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Фігура в грі — близько 90 пікселів заввишки від п'ят до маківки.
  const k = Math.min(canvas.height / 96, canvas.width / 44);
  ctx.translate(canvas.width / 2, canvas.height - 6 * k);
  ctx.scale(k, k);
  ctx.lineJoin = "round";

  const skin = css(pick(PALETTE.skin, look.skin));
  const hair = css(pick(PALETTE.hairColor, look.hairColor));
  const shirt = css(pick(PALETTE.clothes, look.top));
  const pants = css(pick(PALETTE.clothes, look.bottom + 5));
  const shoes = css(pick(PALETTE.clothes, look.shoes + 5));
  const width = [22, 26, 32][((look.build % 3) + 3) % 3] ?? 26;
  const face = [{ w: 24, h: 24 }, { w: 22, h: 27 }, { w: 27, h: 23 }][((look.face % 3) + 3) % 3] ?? { w: 24, h: 24 };
  const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke = false): void => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  };
  const ellipse = (x: number, y: number, w: number, h: number, fill: string, stroke = false): void => {
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  };

  ellipse(0, 0, 30, 10, "rgba(0,0,0,0.2)");
  // Ноги, взуття, тулуб.
  rect(-9, -16, 7, 16, 3, pants);
  rect(2, -16, 7, 16, 3, pants);
  rect(-10, -4, 9, 5, 2, shoes);
  rect(1, -4, 9, 5, 2, shoes);
  rect(-width / 2, -42, width, 30, 9, shirt, true);
  // Голова й зачіска.
  const hy = -54;
  const style = ((look.hair % 4) + 4) % 4;
  ellipse(0, hy, face.w, face.h, skin, true);
  ellipse(0, hy - 8, face.w + 2, 11, hair);
  if (style === 3) for (const dx of [-10, -4, 4, 10]) ellipse(dx, hy - 11, 10, 10, hair);
  if (style === 2) ellipse(-10, hy - 12, 12, 12, hair);
  if (style === 1) {
    rect(-face.w / 2 - 1, hy - 6, 6, 20, 3, hair);
    rect(face.w / 2 - 5, hy - 6, 6, 20, 3, hair);
  }
  const eyes = css(pick(PALETTE.eyes, look.eyes));
  ellipse(-4, hy + 1, 3.6, 3.6, eyes);
  ellipse(4, hy + 1, 3.6, 3.6, eyes);
  // Усмішка; чоловік — з легкою щетиною: борода відросте в грі (§5.1).
  ctx.beginPath();
  ctx.arc(0, hy + 5, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (sex === "male") {
    ctx.globalAlpha = 0.6;
    for (const [dx, dy] of [[-6, 5], [-3, 8], [0, 9.5], [3, 8], [6, 5]] as const) ellipse(dx, hy + dy, 2, 2, hair);
    ctx.globalAlpha = 1;
  }
}
