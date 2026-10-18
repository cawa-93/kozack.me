// Дискретний LOS для ШІ (§9.1.1, §13): supercover-обхід усіх тайлів, які перетинає відрізок.
// Зір павука не змішується з полігоном видимості гравця, але правило прозорості в них спільне.

import type { OpaqueFn } from "./visibility";

/**
 * true, якщо відрізок A→B не проходить крізь тайл, для якого blocked(tx, ty) === true.
 * Тайли, у яких лежать самі точки A і B, не перевіряються.
 */
export function lineOfSight(ax: number, ay: number, bx: number, by: number, blocked: OpaqueFn): boolean {
  let tx = Math.floor(ax);
  let ty = Math.floor(ay);
  const endX = Math.floor(bx);
  const endY = Math.floor(by);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tNextX = dx > 0 ? (tx + 1 - ax) * tDeltaX : dx < 0 ? (ax - tx) * tDeltaX : Infinity;
  let tNextY = dy > 0 ? (ty + 1 - ay) * tDeltaY : dy < 0 ? (ay - ty) * tDeltaY : Infinity;

  for (let guard = 0; guard < 4096; guard++) {
    if (tx === endX && ty === endY) return true;
    const t = Math.min(tNextX, tNextY);
    if (t > 1) return true; // відрізок закінчився в поточному тайлі (похибка округлення)
    if (Math.abs(tNextX - tNextY) < 1e-9) {
      // Точно через кут: supercover перевіряє обидва бічні тайли.
      if (blocked(tx + stepX, ty) && !(tx + stepX === endX && ty === endY)) return false;
      if (blocked(tx, ty + stepY) && !(tx === endX && ty + stepY === endY)) return false;
      tx += stepX;
      ty += stepY;
      tNextX += tDeltaX;
      tNextY += tDeltaY;
    } else if (tNextX < tNextY) {
      tx += stepX;
      tNextX += tDeltaX;
    } else {
      ty += stepY;
      tNextY += tDeltaY;
    }
    if (tx === endX && ty === endY) return true;
    if (blocked(tx, ty)) return false;
  }
  return true;
}
