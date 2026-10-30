// Перехідний вигляд кроку 16 (`?gfx=iso`, поки коти й персонаж старі): що старим частинам, які стоять на ізометричній
// підлозі, треба від ізометричного світу. Коли T1 і T2 замінять старих кота й персонажа, файл видаляється. Без Phaser.

import type { WorldQuery } from "../world/part";
import { isoDepth, type IsoPointHandle, type SetDepth } from "./depth";

/**
 * Точка старого персонажа чи кота (`id` — `person`, `cat:<id>`) у реєстрі глибини світу (`iso/depth.ts`): глибину старій
 * частині дає реєстр за порядком `isoOrder`, як і ізометричним, а не екранний y ніг. Реєстр піднімає коробки вище за їхню
 * середину, щоб іти за порядком (мішок наповнювача за стіною ряду 5 — на 32 одиниці), і з глибиною з екранного y персонаж
 * перед мішком опинявся за ним, а за стіною — поверх неї; так само бруд перед стіною — над ногами того, хто на ньому стоїть.
 */
export function legacyDepthPoint(ctx: { readonly world: WorldQuery }, id: string, setDepth: SetDepth): IsoPointHandle {
  return isoDepth(ctx).addPoint(setDepth, { id });
}
