// Напрями в ізометрії 2:1 (крок 16, GRAPHICS_PLAN.md, «Проєкція і глибина»): вектор у клітинках ↔ вектор на екрані. Лише
// напрями й зсуви, без початку координат: самі точки на екрані дає проєкція (`world/projection.ts`). Без Phaser.
//
// Формула контракту: (x, y) → ((x − y)·TW/2, (x + y)·TH/2), плитка TW 128 × TH 64 в одиницях арту.

import type { Vec } from "../../sim/types";

/** Плитка ізометрії в одиницях арту (контракт хвилі 0): ширина й висота ромба. */
export const ISO_TILE = { w: 128, h: 64 } as const;

/** Вектор у клітинках → вектор на екрані ізометрії, одиниці арту (= px світу). */
export function isoScreenDir(v: Vec): Vec {
  return { x: ((v.x - v.y) * ISO_TILE.w) / 2, y: ((v.x + v.y) * ISO_TILE.h) / 2 };
}

/** Вектор на екрані ізометрії → вектор у клітинках (обернене до `isoScreenDir`). */
export function isoTileDir(v: Vec): Vec {
  const a = (2 * v.x) / ISO_TILE.w;
  const b = (2 * v.y) / ISO_TILE.h;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
