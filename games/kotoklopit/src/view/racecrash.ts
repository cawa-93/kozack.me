// Аварія в гонці (§8.5, рішення автора 2026-11-02): «аварію показано, як засинання (§8.8): камера наїжджає на машину й екран
// темніє — а тоді картка аварії». Чисті розрахунки без Phaser і DOM (`tests/racecrash.test.ts`); малює `RaceScene`, картку
// показує `DayScene`. Сим аварію вже застосував (поїздка — у фазі `accident`): анімація лише показує її й нічого не змінює.

import type { Vec } from "../sim/types";

/**
 * Анімація аварії, мс: за `zoomMs` камера плавно наїжджає на свою машину — масштаб більшає в `1 + zoom` раз, а машина пливе до
 * середини кадру, — з `darkFrom` до `total` екран темніє до чорного; тоді картка аварії. Як засинання (`FALL_ASLEEP` у
 * `DayScene`: наїзд, потім темрява), але коротше: машина — не кінець дня. На початку — короткий поштовх камери (`shakeMs`,
 * сила `shake` — частка розміру кадру), щоб було видно, що машина врізалася.
 */
export const CRASH_FX = { zoomMs: 1400, darkFrom: 600, total: 1800, zoom: 1, shakeMs: 220, shake: 0.008 } as const;

/** Кадр анімації аварії. */
export interface CrashView {
  /** Множник масштабу камери поверх звичайного (1 — без наїзду). */
  zoom: number;
  /**
   * Прокрутка камери в одиницях кадру (origin камери — лівий верхній кут): точка `p` кадру стає на екрані в
   * `(p − scroll) × zoom`.
   */
  scroll: Vec;
  /** Темрява поверх гонки: 0 — немає, 1 — чорний екран. */
  dark: number;
  /** Анімація скінчилася: пора картки аварії. */
  done: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Повіки й наїзд засинання — так само: повільно на початку й наприкінці. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Кадр анімації аварії через `ms` мс після зіткнення: своя машина — у точці `focus` кадру `size` (одиниці інтерфейсу). Камера
 * не заглядає за край кадру — там дорогу не намальовано, — тож біля краю машина доходить до середини не до кінця.
 */
export function crashView(ms: number, focus: Vec, size: { width: number; height: number }): CrashView {
  const time = Math.max(0, ms);
  const ease = smooth(clamp(time / CRASH_FX.zoomMs, 0, 1));
  const zoom = 1 + CRASH_FX.zoom * ease;
  // Де на екрані стоїть машина: від свого місця — до середини кадру.
  const anchor = { x: focus.x + (size.width / 2 - focus.x) * ease, y: focus.y + (size.height / 2 - focus.y) * ease };
  const scroll = {
    x: clamp(focus.x - anchor.x / zoom, 0, size.width - size.width / zoom),
    y: clamp(focus.y - anchor.y / zoom, 0, size.height - size.height / zoom),
  };
  const dark = clamp((time - CRASH_FX.darkFrom) / (CRASH_FX.total - CRASH_FX.darkFrom), 0, 1);
  return { zoom, scroll, dark, done: time >= CRASH_FX.total };
}
