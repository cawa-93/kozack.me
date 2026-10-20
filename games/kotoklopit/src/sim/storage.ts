// Сховища запасів (§6.4): де лежить кожен запас, що видно над сховищем і коли.

import { STORAGE_LIMITS, STORAGE_NEAR } from "./config";
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
  /** Ліміт сховища: його видно зблизька (§6.4). */
  limit?: number;
}

/** Персонаж біля сховища: видно весь вміст. */
export function isNearStorage(state: GameState, storage: Storage): boolean {
  return state.trip === null && distanceToRect(state.character.body, objectById(storage.object)) <= STORAGE_NEAR;
}

/**
 * Що зараз видно над сховищем (§6.4): лише запаси, які вже бували вдома; коли персонаж поруч — усі
 * вони з кількістю й лімітом, інакше — ті, що скінчилися. Порожній список — індикатора немає.
 */
export function storageIndicator(state: GameState, storage: Storage): StorageLine[] {
  const lines = storage.products
    .filter((product) => state.home.acquired.includes(product))
    .map((product) => ({ product, count: supplyCount(state, product) }));
  if (isNearStorage(state, storage)) return lines.map((line) => ({ ...line, limit: STORAGE_LIMITS[line.product] }));
  return lines.filter((line) => line.count === 0);
}
