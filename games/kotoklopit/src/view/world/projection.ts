// Як квартира лягає на екран (§2.1, §8.4): точки підлоги в клітинках — у точки світу на екрані (px до масштабу камери).
// Усе, що переводить клітинки в екран і напрям на екрані в клітинки (сцена, камера, частини світу), бере це з об'єкта
// проєкції, а не з чисел, — тож нова графіка кроку 16 лише додає свою проєкцію. Без Phaser.
//
// Реалізації: стара коса «три чверті» (OBLIQUE) — підлога трохи стиснута по вертикалі, стіни й речі мають видиму
// висоту; ізометрія 2:1 (ISO, крок 16, `GRAPHICS_PLAN.md`) — клітинка стає ромбом 128 × 64 одиниці арту.

import { MAP_HEIGHT, MAP_WIDTH, type Rect } from "../../sim/home";
import type { Vec } from "../../sim/types";

/** Прямокутник на екрані, px світу. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projection {
  /** «oblique» — коса «три чверті» старого вигляду, «iso» — ізометрія 2:1 (крок 16). */
  readonly kind: "oblique" | "iso";
  /** Точка підлоги в клітинках → точка на екрані. */
  toScreen(p: Vec): Vec;
  /** Прямокутник клітинок → прямокутник на екрані, що його вміщує (у косій — він сам). */
  rectToScreen(r: Rect): ScreenRect;
  /** Порядок малювання точки за її висотою на екрані: що нижче, те ближче до камери. */
  depthOf(screenY: number): number;
  /** Порядок малювання точки підлоги в клітинках. */
  depthAt(p: Vec): number;
  /** Квартира з полем довкола на екрані: у цих межах ходить камера (§8.4). */
  readonly world: { readonly width: number; readonly height: number };
  /**
   * Клітинка підлоги на екрані: у косій — прямокутник, в ізометрії — ромб (його ширина й висота). З висоти камера
   * рахує найменший масштаб, за якого підлогу ще видно на телефоні (§8.4).
   */
  readonly tile: { readonly width: number; readonly height: number };
  /** Висота задньої стіни на екрані. */
  readonly wallRise: number;
  /**
   * Верхній край лицьової грані задньої стіни на екрані над точкою `screenX` (px світу): вище — уже не кімната. Сцена не
   * пускає вище за нього індикатори сховищ (§6.4). У косій він сталий для всієї ширини, в ізометрії йде вздовж стін.
   */
  backWallTop(screenX: number): number;
  /**
   * Напрям на екрані (джойстик, WASD чи стрілки; «вгору» — `y < 0`) → напрям у клітинках, який отримує симуляція (§10):
   * «вгору» на екрані — вгору для гравця. Довжина та сама: це сила відхилення джойстика. У косій вектор не змінюється.
   */
  screenToTileDir(v: Vec): Vec;
}

/** Коса проєкція старого вигляду: її малюнки квартири й котячого кутка (`legacy/*`) інших не вміють. */
export interface ObliqueProjection extends Projection {
  readonly kind: "oblique";
}

/** Коса «три чверті»: клітинка 60 × 50, стіна заввишки 30. */
const TILE_W = 60;
const TILE_H = 50;
const WALL_RISE = 30;
/** Поле довкола квартири, щоб стіни не впиралися в край екрана. */
const MARGIN = 14;
/** Де на екрані верхній лівий кут клітинки (0, 0): над нею ще видно верх задньої стіни. */
const ORIGIN: Vec = { x: MARGIN, y: MARGIN + WALL_RISE };

function obliqueToScreen(p: Vec): Vec {
  return { x: ORIGIN.x + p.x * TILE_W, y: ORIGIN.y + p.y * TILE_H };
}

function screenDepth(screenY: number): number {
  return screenY;
}

export const OBLIQUE: ObliqueProjection = {
  kind: "oblique",
  toScreen: obliqueToScreen,
  rectToScreen(r) {
    const { x, y } = obliqueToScreen(r);
    return { x, y, w: r.w * TILE_W, h: r.h * TILE_H };
  },
  depthOf: screenDepth,
  depthAt: (p) => screenDepth(obliqueToScreen(p).y),
  world: {
    width: MAP_WIDTH * TILE_W + MARGIN * 2,
    height: WALL_RISE + MAP_HEIGHT * TILE_H + MARGIN * 2,
  },
  tile: { width: TILE_W, height: TILE_H },
  wallRise: WALL_RISE,
  // Задня стіна — верхній ряд клітинок: її лицьова грань починається на висоту стіни вище ряду 1.
  backWallTop: () => ORIGIN.y + TILE_H - WALL_RISE,
  // Клітинки лежать на екрані без повороту: осі ті самі.
  screenToTileDir: (v) => ({ x: v.x, y: v.y }),
};

// --- Ізометрія 2:1 ----------------------------------------------------------------------------------

/**
 * Ізометрія 2:1 нової графіки (крок 16): квартиру повернуто на 45°, клітинка — ромб. Одиниця арту = 1 px світу (зум камери
 * масштабує все).
 */
export interface IsoProjection extends Projection {
  readonly kind: "iso";
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
 * далі з кожною клітинкою x. Набагато менше за зсуви, якими старі частини кладуть свої шматки одне над одним (0,5–2).
 */
export const ISO_DEPTH_TIE = 1e-4;

function isoToScreen(p: Vec): Vec {
  return { x: ISO_ORIGIN.x + (p.x - p.y) * HALF_W, y: ISO_ORIGIN.y + (p.x + p.y) * HALF_H };
}

/** Де по горизонталі екрана (x − y) лицьові грані задніх стін: стовпця x=0 — від −11 (його низ) до 0 (кут), ряду y=0 — до 19. */
const BACK_FACE_MIN = -(MAP_HEIGHT - 1);
const BACK_FACE_MAX = MAP_WIDTH - 1;

export const ISO: IsoProjection = {
  kind: "iso",
  toScreen: isoToScreen,
  // Прямокутник клітинок на екрані — ромб (паралелограм): ліва вершина — кут (x, y + h), права — (x + w, y), верхня —
  // (x, y), нижня — (x + w, y + h).
  rectToScreen(r) {
    return {
      x: ISO_ORIGIN.x + (r.x - r.y - r.h) * HALF_W,
      y: ISO_ORIGIN.y + (r.x + r.y) * HALF_H,
      w: (r.w + r.h) * HALF_W,
      h: (r.w + r.h) * HALF_H,
    };
  },
  // Для старих частин на ізометричній підлозі (кіт і персонаж старого вигляду в `?gfx=iso`): що нижче на екрані, те ближче.
  // Між точками це й є порядок `isoOrder` (x + y), а реєстр глибини (`iso/depth.ts`) роздає ізометричним частинам глибини
  // в тих самих одиницях — екранний y їхньої середини, — тож старі частини стають між ними приблизно правильно.
  depthOf: screenDepth,
  depthAt: (p) => screenDepth(isoToScreen(p).y) + p.x * ISO_DEPTH_TIE,
  world: {
    width: (MAP_WIDTH + MAP_HEIGHT) * HALF_W + ISO_MARGIN * 2,
    height: ISO_WALLS.back + (MAP_WIDTH + MAP_HEIGHT) * HALF_H + ISO_MARGIN * 2,
  },
  tile: ISO_TILE,
  wallRise: ISO_WALLS.back,
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
