// Геометрія ізометричної квартири й підлоги (крок 16, F3b) — чисті розрахунки без Phaser: де стає кадр речі, де на ній
// точка кріплення з маніфесту, де бабл, чи стіна закриває персонажа (тоді вона згасає) і контур підсвітки. Перевіряє
// `tests/isoworld.test.ts`.

import type { Rect } from "../../sim/home";
import type { Vec } from "../../sim/types";
import { artEntry } from "../art/manifest";
import type { ArtId } from "../art/types";
import type { IsoBox } from "../world/isoorder";
import { isoObjectLook } from "../world/objects";
import type { Point } from "../world/part";
import { ISO, ISO_TILE } from "../world/projection";

/** Пів ширини й пів висоти ромба плитки: на стільки зсувається екран з кожною клітинкою x − y і x + y. */
const HALF_W = ISO_TILE.width / 2;
const HALF_H = ISO_TILE.height / 2;

/** Наскільки над найвищою точкою речі її бабл, одиниці арту (як у старому вигляді — 4 px над верхньою гранню). */
export const ANCHOR_GAP = 6;

/** Точка підлоги під центром сліду речі (контракт pivot меблів: `toScreen(x + w/2, y + h/2)`). */
export function footprintCenter(r: Rect): Vec {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Де на екрані кадр речі квартири: pivot — точка підлоги під центром сліду. */
export function objectScreen(r: Rect): Point {
  return ISO.toScreen(footprintCenter(r));
}

/**
 * Точка кріплення `name` запису `id` (маніфест: «полиця», «екран», «dish») — зсув від pivot, одиниці арту (= px світу);
 * немає такого запису чи точки — null.
 */
export function artOffset(id: ArtId, name: string): Point | null {
  const entry = artEntry(id);
  const point = entry?.points?.[name];
  if (!entry || !point) return null;
  return { x: point.x - entry.pivot.x, y: point.y - entry.pivot.y };
}

/** Точка над річчю квартири для бабла й позначок (§11.4): над найвищою точкою, зі зсувом бабла (`IsoObjectLook.bubble`). */
export function objectAnchorAt(object: Rect & { id: string }): Point {
  const look = isoObjectLook(object.id);
  const p = objectScreen(object);
  return { x: p.x + look.bubble.x, y: p.y - look.tall - ANCHOR_GAP + look.bubble.y };
}

/** Точка над річчю на підлозі заввишки `height` у точці `p` (клітинки). */
export function floorAnchorAt(p: Vec, height: number): Point {
  const s = ISO.toScreen(p);
  return { x: s.x, y: s.y - height - ANCHOR_GAP };
}

/** Фігура, яку може закрити стіна: висота й півширина малюнка на екрані, одиниці арту. */
export interface Figure {
  readonly height: number;
  readonly half: number;
}

/** Персонаж (контракт хвилі 1: ≈ 140 до маківки) з розставленими ліктями. */
export const PERSON_FIGURE: Figure = { height: 140, half: 26 };

/**
 * Чи коробка (стіна чи меблі) заввишки `h` закриває на екрані хоч частину фігури, що стоїть у точці `p` (клітинки) за нею
 * (`isoOrder`: точка перед коробкою, якщо p.x ≥ x1 або p.y ≥ y1). Перед коробкою — ніколи. Лише ті, хто за коробкою й
 * близько: верх стіни на екрані — вище за ноги фігури, низ — нижче за її маківку, і вони на одній горизонталі екрана.
 */
export function boxCovers(box: IsoBox, h: number, p: Vec, figure: Figure): boolean {
  if (p.x >= box.x1 || p.y >= box.y1) return false;
  const u = p.x - p.y;
  const reach = figure.half / HALF_W;
  // Проміжок горизонталі екрана (у клітинках x − y), де і фігура, і коробка.
  const lo = Math.max(u - reach, box.x0 - box.y1);
  const hi = Math.min(u + reach, box.x1 - box.y0);
  if (lo >= hi) return false;
  // Верхній край сліду (найдальший x + y) — V з вершиною в куті (x0, y0), нижній — Λ з вершиною в куті (x1, y1).
  const topCorner = box.x0 - box.y0;
  const bottomCorner = box.x1 - box.y1;
  const nearestTop = Math.min(Math.max(topCorner, lo), hi);
  const nearestBottom = Math.min(Math.max(bottomCorner, lo), hi);
  const back = box.x0 + box.y0 + Math.abs(nearestTop - topCorner);
  const near = box.x1 + box.y1 - Math.abs(nearestBottom - bottomCorner);
  const feet = p.x + p.y;
  // Ноги нижче за верх стіни (на екрані y росте донизу), маківка — вище за її низ.
  return feet * HALF_H > back * HALF_H - h && feet * HALF_H - figure.height < near * HALF_H;
}

/** Кути сліду на підлозі (екран, px світу) — від верхнього за годинниковою стрілкою: верхній, правий, нижній, лівий. */
export function footprintCorners(f: { x0: number; y0: number; x1: number; y1: number }): Point[] {
  return [
    ISO.toScreen({ x: f.x0, y: f.y0 }),
    ISO.toScreen({ x: f.x1, y: f.y0 }),
    ISO.toScreen({ x: f.x1, y: f.y1 }),
    ISO.toScreen({ x: f.x0, y: f.y1 }),
  ];
}
