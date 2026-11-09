// Страва в руках (§8.7): її ставлять на плиту, стіл і стільниці. Окремо, бо це потрібно і діям, і вибору цілі.

import type { Dish, Item } from "./types";

export function isDish(item: Item | null): item is Dish {
  return item?.kind === "raw" || item?.kind === "meal" || item?.kind === "burnt";
}
