// Як квартира лягає на екран (§2.1, §8.4): точки підлоги в клітинках — у точки світу на екрані (px до масштабу камери).
// Ізометрія 2:1 (крок 16, `GRAPHICS_PLAN.md`): квартиру повернуто на 45°, клітинка — ромб 128 × 64 одиниці арту. Сцена,
// камера й частини світу беруть проєкцію як об'єкт (`Projection`), а не числа. Без Phaser.

import { MAP_HEIGHT, MAP_WIDTH } from "../../sim/home";
import type { Vec } from "../../sim/types";

export interface Projection {
  /** Точка підлоги в клітинках → точка на екрані. */
  toScreen(p: Vec): Vec;
  /** Квартира з полем довкола на екрані: у цих межах ходить камера (§8.4). */
  readonly world: { readonly width: number; readonly height: number };
  /** Клітинка підлоги на екрані — ромб (його ширина й висота). З висоти камера рахує найменший масштаб (§8.4). */
  readonly tile: { readonly width: number; readonly height: number };
  /**
   * Верхній край лицьової грані задньої стіни на екрані над точкою `screenX` (px світу): вище — уже не кімната. Сцена не
   * пускає вище за нього індикатори сховищ (§6.4). Іде вздовж стін.
   */
  backWallTop(screenX: number): number;
  /**
   * Напрям на екрані (джойстик, WASD чи стрілки; «вгору» — `y < 0`) → напрям у клітинках, який отримує симуляція (§10):
   * «вгору» на екрані — вгору для гравця. Довжина та сама: це сила відхилення джойстика.
   */
  screenToTileDir(v: Vec): Vec;
}

/** Плитка підлоги в одиницях арту (`GRAPHICS_PLAN.md`, «Контракти»): ромб 128 × 64. */
export const ISO_TILE = { width: 128, height: 64 } as const;

/**
 * Висоти стін в одиницях арту (спільна геометрія хвилі 1): задні (ряд y=0 і стовпець x=0) — на повну висоту, внутрішні
 * (між кімнатами) — приблизно третина з верхньою кришкою, передні (ряд y=11 і стовпець x=19) — лише плінтус.
 */
export const ISO_WALLS = { back: 200, inner: 66, plinth: 14 } as const;

/** Поле довкола квартири, одиниці арту: щоб стіни й ноги біля плінтуса не впиралися в край екрана. */
export const ISO_MARGIN = 16;

const HALF_W = ISO_TILE.width / 2;
const HALF_H = ISO_TILE.height / 2;

/**
 * Де на екрані верхня вершина ромба клітинки (0, 0) — кут задніх стін на підлозі. Ліворуч від неї лягає стовпець x=0 (на
 * 12 клітинок — до x = −12·64), праворуч — ряд y=0 (до 20·64), над нею — задня стіна заввишки 200.
 */
export const ISO_ORIGIN: Readonly<Vec> = { x: MAP_HEIGHT * HALF_W + ISO_MARGIN, y: ISO_WALLS.back + ISO_MARGIN };

/**
 * Глибина точки підлоги між точками з тим самим x + y (на тій самій висоті екрана) — за x, як в `isoOrder`: на стільки
 * далі з кожною клітинкою x (реєстр глибини, `iso/depth.ts`).
 */
export const ISO_DEPTH_TIE = 1e-4;

function isoToScreen(p: Vec): Vec {
  return { x: ISO_ORIGIN.x + (p.x - p.y) * HALF_W, y: ISO_ORIGIN.y + (p.x + p.y) * HALF_H };
}

/** Де по горизонталі екрана (x − y) лицьові грані задніх стін: стовпця x=0 — від −11 (його низ) до 0 (кут), ряду y=0 — до 19. */
const BACK_FACE_MIN = -(MAP_HEIGHT - 1);
const BACK_FACE_MAX = MAP_WIDTH - 1;

/** Ізометрія 2:1: одиниця арту = 1 px світу (зум камери масштабує все). */
export const ISO: Projection = {
  toScreen: isoToScreen,
  world: {
    width: (MAP_WIDTH + MAP_HEIGHT) * HALF_W + ISO_MARGIN * 2,
    height: ISO_WALLS.back + (MAP_WIDTH + MAP_HEIGHT) * HALF_H + ISO_MARGIN * 2,
  },
  tile: ISO_TILE,
  // Лицьові грані задніх стін — площини x = 1 (стовпець x=0) і y = 1 (ряд y=0), що сходяться в куті (1, 1); верхній край —
  // на висоту стіни над їхнім низом. Ламана: найвища над кутом, донизу в обидва боки, за краями стін — як на краю.
  backWallTop(screenX) {
    const u = Math.min(BACK_FACE_MAX, Math.max(BACK_FACE_MIN, (screenX - ISO_ORIGIN.x) / HALF_W));
    return ISO_ORIGIN.y - ISO_WALLS.back + (2 + Math.abs(u)) * HALF_H;
  },
  // Обернення лінійної частини проєкції: екран (sx, sy) = ((x − y)·64, (x + y)·32), тож x − y ∝ sx / 2, x + y ∝ sy. «Вгору»
  // на екрані — до клітинки (−1, −1), «праворуч» — до (1, −1). Довжина — як у вектора на екрані (сила відхилення джойстика).
  screenToTileDir(v) {
    const length = Math.hypot(v.x, v.y);
    if (length === 0) return { x: 0, y: 0 };
    const x = v.y + v.x / 2;
    const y = v.y - v.x / 2;
    const k = length / Math.hypot(x, y);
    return { x: x * k, y: y * k };
  },
};
