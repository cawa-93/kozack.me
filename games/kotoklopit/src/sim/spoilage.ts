// Псування страви (§8.7): готова страва поза холодильником за `SPOIL_MINUTES` від готовності стає зіпсованою. Назовні — лише
// готова страва з відліком (`freshMeal`), чи її ще можна з'їсти (`isEdible`) і крок часу (`tickSpoilage`).

import { SPOIL_MINUTES } from "./config";
import { isDish } from "./dish";
import { SURFACE_IDS } from "./home";
import { absoluteMinute } from "./time";
import type { Dish, GameState, Quality } from "./types";

const nowOf = (state: GameState): number => absoluteMinute(state.day, state.minute);

/** Страва, що стала готовою саме зараз: з плити чи з холодильника (мамин судочок) — звідси відлік псування. */
export function freshMeal(state: GameState, quality: Quality, mom = false): Dish {
  return { kind: "meal", quality, ...(mom ? { mom: true as const } : {}), readyAt: nowOf(state) };
}

/** Страву ще можна з'їсти — і персонажу, і котові: сиру порцію чи готову. Підгорілу й зіпсовану лише викидають. */
export function isEdible(dish: Dish): boolean {
  return dish.kind === "raw" || dish.kind === "meal";
}

/**
 * Готова страва на поверхнях кухні й у руках, що лежить довше за `SPOIL_MINUTES`, псується. На плиті вона підгорає раніше, тож
 * плиту не перевіряємо: зіпсованої там не буває. Страва зі збереження без відліку починає його зараз.
 */
export function tickSpoilage(state: GameState): void {
  const now = nowOf(state);
  const { surfaces } = state.home;
  for (const id of SURFACE_IDS) {
    const dish = surfaces[id];
    if (dish) surfaces[id] = aged(dish, now);
  }
  const held = state.character.held;
  if (isDish(held)) state.character.held = aged(held, now);
}

function aged(dish: Dish, now: number): Dish {
  if (dish.kind !== "meal") return dish;
  dish.readyAt ??= now;
  if (now - dish.readyAt < SPOIL_MINUTES) return dish;
  return { kind: "spoiled", quality: dish.quality, ...(dish.mom === true ? { mom: true as const } : {}) };
}
