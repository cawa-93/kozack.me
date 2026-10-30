// Перехідний вигляд кроку 16 (`?gfx=iso`, поки коти й персонаж старі): що старим частинам, які стоять на ізометричній
// підлозі, треба від ізометричного світу. Коли T1 і T2 замінять старих кота й персонажа, файл видаляється. Без Phaser.

import type { WorldQuery } from "../world/part";
import { isoDepth } from "./depth";

/**
 * Глибина коробки речі квартири за її id з реєстру глибини світу (`iso/depth.ts`); ще не розв'язано чи такої немає — NaN.
 * Старий кіт, що виліз на річ, стає одразу над її коробкою: лише так він над нею, хоч би як реєстр її підняв.
 */
export function boxDepthLookup(ctx: { readonly world: WorldQuery }): (id: string) => number {
  const registry = isoDepth(ctx);
  return (id) => registry.box(id)?.depth ?? Number.NaN;
}
