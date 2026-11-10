// Страва в руках (§8.7): її ставлять на плиту, стіл і стільниці. Окремо, бо це потрібно і діям, і вибору цілі.

import type { Dish, Item, Quality } from "./types";

export function isDish(item: Item | null): item is Dish {
  return item?.kind === "raw" || item?.kind === "meal" || item?.kind === "burnt";
}

/** Що річ у руках повертає в холодильник (§6.4): сира порція — продукт, мамин судочок — судочок; решту туди не кладуть. */
export function fridgeSupply(item: Item | null): { product: "food" | "momMeal"; quality: Quality } | null {
  if (item?.kind === "raw") return { product: "food", quality: item.quality };
  return item?.kind === "meal" && item.mom === true ? { product: "momMeal", quality: item.quality } : null;
}
