// Сховища запасів (§6.4): де лежить кожен запас, що видно над сховищем і коли.

import { FILL_STAGES, STORAGE_LIMITS } from "./config";
import { supplyCount } from "./economy";
import { targetOf } from "./targets";
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

/**
 * Сховище в фокусі (§6.4): саме воно ціль дії персонажа, а персонаж не в поїздці й не всередині
 * (душова кабіна). Лише тоді видно весь вміст.
 */
export function isFocusedStorage(state: GameState, storage: Storage): boolean {
  const activity = state.character.activity;
  if (state.trip !== null || (activity?.kind === "use" && activity.inside)) return false;
  return targetOf(state)?.id === storage.object;
}

/**
 * Що зараз видно над сховищем (§6.4): лише в фокусі й лише запаси, які вже бували вдома, — з
 * кількістю й лімітом. Поза фокусом — нічого: скільки лишилося, видно з самого сховища.
 */
export function storageIndicator(state: GameState, storage: Storage): StorageLine[] {
  if (!isFocusedStorage(state, storage)) return [];
  return storage.products
    .filter((product) => state.home.acquired.includes(product))
    .map((product) => ({ product, count: supplyCount(state, product), limit: STORAGE_LIMITS[product] }));
}

/** Стан наповнення (§6.4): 0 — порожньо, 1 — мало, 2 — половина, 3 — багато, 4 — ущерть. */
export type FillStage = 0 | 1 | 2 | 3 | 4;

export function fillStage(count: number, limit: number): FillStage {
  if (count <= 0) return 0;
  const share = count / limit;
  if (share >= 1) return 4;
  return share < FILL_STAGES[0] ? 1 : share < FILL_STAGES[1] ? 2 : 3;
}

/** Наповнення сховища для малюнка: стан кожного запасу, null — його ще не бувало вдома. */
export function storageStages(state: GameState, storage: Storage): (FillStage | null)[] {
  return storage.products.map((product) =>
    state.home.acquired.includes(product) ? fillStage(supplyCount(state, product), STORAGE_LIMITS[product]) : null,
  );
}
