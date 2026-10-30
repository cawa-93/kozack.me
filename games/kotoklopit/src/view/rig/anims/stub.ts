// Заглушки груп анімацій (крок 16, шов хвилі 2): поки пакети анімації N1–N4b малюють свої групи, кожна назва групи — вихідна
// поза без доріжок, з правильними тривалістю й повтором. Так код (T1, T2) грає анімації за назвами з першого дня, а пакет,
// замінивши файл своєї групи повністю, нічого більше не чіпає. Коли всі групи намальовано, файл видаляють.

import type { AnyRig, AnimOf } from "../types";

/** Тривалість заглушки основної анімації, мс. */
const STUB_MS = 1000;

/**
 * Група заглушок: кожна назва — вихідна поза. Разові (`oneShots`) і за поступом (`byProgress`) — без повтору; разові —
 * рівно своєї тривалості.
 */
export function stubAnims<R extends AnyRig, const N extends string>(
  _rig: R,
  names: readonly N[],
  oneShots: Readonly<Partial<Record<string, number>>>,
  byProgress: ReadonlySet<string> = new Set(),
): Readonly<Record<N, AnimOf<R>>> {
  const anims = {} as Record<N, AnimOf<R>>;
  for (const name of names) {
    const ms = oneShots[name];
    anims[name] = { duration: ms ?? STUB_MS, loop: ms === undefined && !byProgress.has(name) };
  }
  return anims;
}
