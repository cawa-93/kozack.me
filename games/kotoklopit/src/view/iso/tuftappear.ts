// Поява жмута шерсті на підлозі (§8.7, «Жмути шерсті» [Змінено пізніше], рішення автора 2026-11-03: «котяча шерсть на підлозі
// з'являється посеред дня миттєво, що псує враження»). Новий жмут не вискакує, а викочується з-під кота на своє місце й наростає;
// кота поруч не видно — проступає на місці й наростає. Жмути, що вже лежали, коли гравець їх уперше побачив (завантаження гри чи
// сценарію, новий день, повернення з поїздки), — одразу на місці.
//
// Чисті функції без Phaser: їх перевіряє `tests/tufts.test.ts`, малює `floor.ts`.

import { absoluteMinute } from "../../sim/time";
import type { GameState, Vec } from "../../sim/types";
import type { Point } from "../world/part";

/**
 * Поява жмута: `ms` — скільки триває; `grow` — з якої частки свого розміру він наростає; `fade` — за яку частку появи
 * проступає зовсім (далі непрозорий); `reach` — від кота, далі за стільки клітинок від місця, жмут не котиться, а проступає на
 * місці; `wobble` — на скільки радіан його похитує, поки котиться (згасає до нуля), і `turns` — скільки разів;
 * `freshMinutes` — жмут, що ліг давніше за стільки ігрових хвилин (поки гравця не було вдома), з'являється без появи.
 */
export const TUFT_APPEAR = { ms: 800, grow: 0.35, fade: 0.3, reach: 4, wobble: 0.35, turns: 2, freshMinutes: 2 } as const;

/** Жмут посеред появи на екрані: де (px світу), масштаб від свого, прозорість і поворот, радіани. */
export interface TuftLook {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  angle: number;
}

/**
 * Котрий жмут показати з появою (§8.7): лише найновіший (`home.tuftAt` — коли він ліг) і лише якщо він ліг щойно — не давніше
 * `TUFT_APPEAR.freshMinutes`; інакше null — жмути вже лежать. По одному жмуту за раз симуляція й кладе (`shedTuft`).
 */
export function freshTuft(state: GameState): number | null {
  const at = state.home.tuftAt;
  const newest = state.home.tufts?.at(-1);
  if (at === undefined || newest === undefined) return null;
  const ago = absoluteMinute(state.day, state.minute) - at;
  return ago >= 0 && ago <= TUFT_APPEAR.freshMinutes ? newest : null;
}

/**
 * Звідки котиться новий жмут (px світу): з-під кота (`root` — корінь кота на екрані, `cat` — де він у симуляції), якщо кота видно
 * й він не далі `TUFT_APPEAR.reach` клітинок від місця жмута `spot`; інакше null — жмут проступає на місці.
 */
export function tuftRollFrom(cat: Vec | null, root: Point | null, spot: Vec): Point | null {
  if (!cat || !root || Math.hypot(spot.x - cat.x, spot.y - cat.y) > TUFT_APPEAR.reach) return null;
  return { x: root.x, y: root.y };
}

/**
 * Жмут за часткою появи `t` (0–1): котиться від `from` (null — на місці) до `to`, сповільнюючись, як клубок, що зупиняється;
 * наростає від `TUFT_APPEAR.grow` до свого розміру й проступає за першу `fade` появи; поки котиться — похитується, і хитання
 * згасає. Наприкінці — на місці, свого розміру, непрозорий і рівно.
 */
export function tuftAppearLook(t: number, from: Point | null, to: Point): TuftLook {
  const k = Math.min(1, Math.max(0, t));
  const ease = 1 - (1 - k) ** 3;
  const start = from ?? to;
  const rolls = from !== null && (from.x !== to.x || from.y !== to.y);
  const side = rolls && to.x < start.x ? -1 : 1;
  return {
    x: start.x + (to.x - start.x) * ease,
    y: start.y + (to.y - start.y) * ease,
    scale: TUFT_APPEAR.grow + (1 - TUFT_APPEAR.grow) * (1 - (1 - k) ** 2),
    alpha: Math.min(1, k / TUFT_APPEAR.fade),
    angle: rolls && k < 1 ? side * TUFT_APPEAR.wobble * Math.sin(k * Math.PI * TUFT_APPEAR.turns) * (1 - k) : 0,
  };
}
