// «Випадково» на кроці «Ім'я» нової гри (§5.1): ім'я з переліку за звертанням, щоразу інше, ніж у полі.

import { createRng, deriveSeed, type Rng } from "../sim/rng";
import type { Address } from "../sim/types";
import { CHARACTER_NAMES } from "../texts";

/** Сіль генератора імен: окремо від потоків гри й від зовнішностей редактора, що теж ростуть із seed (§6.1). */
const NAME_SALT = 0x4e414d45;

/** Генератор імен для нової гри: із її seed, тож `Math.random` лишається тільки для seed (§6.1). */
export function nameRng(seed: number): Rng {
  return createRng(deriveSeed(seed, NAME_SALT));
}

/** Випадкове ім'я за звертанням, не те, що вже в полі. */
export function randomName(address: Address, current: string, rng: Rng): string {
  const all = CHARACTER_NAMES[address];
  const others = all.filter((name) => name !== current.trim());
  return others[rng.int(0, others.length - 1)] ?? all[0] ?? "";
}
