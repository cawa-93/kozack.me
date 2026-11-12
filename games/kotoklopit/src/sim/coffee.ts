// Кавомашина (§8.7): стоїть на стільниці кухні й займає її цілком; чашка кави знімає «Недосип» до кінця дня (§8.8).

import { COFFEE } from "./config";
import { emit } from "./events";
import type { GameState } from "./types";

type Homed = Pick<GameState, "home">;

/** Кавомашина вдома є — стоїть чи ще чекає вільної стільниці. */
export const ownsCoffee = (state: Homed): boolean => state.home.coffee !== undefined;

/** Стільниця, на якій стоїть кавомашина; null — машини немає чи вона ще чекає вільної стільниці. */
export const coffeeSurface = (state: Homed): string | null => state.home.coffee?.surface ?? null;

/** На цій стільниці стоїть кавомашина: страву сюди не поставити, кіт сюди не вилазить. */
export const coffeeOn = (state: Homed, surface: string): boolean => coffeeSurface(state) === surface;

/** Машина, що чекає, стає на першу стільницю без страви. */
export function settleCoffee(state: Homed): void {
  const coffee = state.home.coffee;
  if (!coffee || coffee.surface !== null) return;
  coffee.surface = COFFEE.surfaces.find((id) => (state.home.surfaces[id] ?? null) === null) ?? null;
}

/** Нова кавомашина: на вільну стільницю, а вільної немає — чекає. */
export function placeCoffee(state: Homed): void {
  state.home.coffee = { surface: null };
  settleCoffee(state);
}

/** Викинути кавомашину: стільниця знову вільна, комунальні менші, машину можна купити знову. */
export function discardCoffee(state: Homed): boolean {
  if (!ownsCoffee(state)) return false;
  delete state.home.coffee;
  return true;
}

/** Каві є що знімати: персонаж недоспав. Інакше машина не ціль дії. */
export const wantsCoffee = (state: Pick<GameState, "character">): boolean => state.character.sleepSpeed < 0;

/** Чашку випито: «Недосипу» до кінця дня немає; бонус сну, якби він був, лишається. */
export function drinkCoffee(state: GameState): void {
  state.character.sleepSpeed = Math.max(0, state.character.sleepSpeed);
  emit(state, { type: "coffee" });
}
