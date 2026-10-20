// Сховища запасів (§6.4): де лежить кожен запас, що видно над сховищем і коли.

import { STORAGE_NEAR } from "./config";
import { supplyCount } from "./economy";
import { distanceToRect, objectById } from "./home";
import type { GameState, Product } from "./types";

export interface Storage {
  /** Річ квартири, у якій лежать запаси. */
  object: string;
  products: readonly Product[];
}

/**
 * Запаси, які треба дістати й донести, мають власне сховище; запаси, що застосовуються одразу,
 * ділять сховище з іншими.
 */
export const STORAGES: readonly Storage[] = [
  { object: "fridge", products: ["food"] },
  { object: "cat-cabinet", products: ["catFood"] },
  { object: "sterile-bin", products: ["sterileFood"] },
  { object: "litter-bag", products: ["litter"] },
  { object: "shower", products: ["hygiene", "shampoo"] },
  { object: "washer", products: ["detergent"] },
  { object: "sink", products: ["humanMeds"] },
  { object: "cat-kit", products: ["pills", "drops", "treats", "collar", "bell"] },
];

export interface StorageLine {
  product: Product;
  count: number;
}

/** Нуль цього запасу видно над сховищем завжди: без нього не обійтися (§6.4). */
export function isNeeded(state: GameState, product: Product): boolean {
  switch (product) {
    case "food":
    case "hygiene":
    case "detergent":
      return true;
    case "catFood":
    case "litter":
      return state.cats.length > 0;
    case "sterileFood":
      return state.cats.some((c) => c.sterilized);
    default:
      return false;
  }
}

/** Персонаж біля сховища: видно весь вміст. */
export function isNearStorage(state: GameState, storage: Storage): boolean {
  return state.trip === null && distanceToRect(state.character.body, objectById(storage.object)) <= STORAGE_NEAR;
}

/**
 * Що зараз видно над сховищем: увесь вміст, коли персонаж поруч, інакше — лише потрібні запаси,
 * які скінчилися. Порожній список — індикатора немає.
 */
export function storageIndicator(state: GameState, storage: Storage): StorageLine[] {
  const lines = storage.products.map((product) => ({ product, count: supplyCount(state, product) }));
  if (isNearStorage(state, storage)) return lines;
  return lines.filter((line) => line.count === 0 && isNeeded(state, line.product));
}
