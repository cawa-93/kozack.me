// Кавомашина (§8.7): стоїть на стільниці кухні й займає її цілком; варить сама, як плита, а випита чашка знімає «Недосип» до
// кінця дня (§8.8).

import { COFFEE } from "./config";
import { emit } from "./events";
import type { GameState } from "./types";

type Homed = Pick<GameState, "home">;

/** Що з кавою: машина вільна, варить чи готова чашка чекає під носиком. */
export type CoffeeStage = "idle" | "brewing" | "ready";

/** Кавомашина вдома є — стоїть чи ще чекає вільної стільниці. */
export const ownsCoffee = (state: Homed): boolean => state.home.coffee !== undefined;

/** Стільниця, на якій стоїть кавомашина; null — машини немає чи вона ще чекає вільної стільниці. */
export const coffeeSurface = (state: Homed): string | null => state.home.coffee?.surface ?? null;

/** На цій стільниці стоїть кавомашина: страву сюди не поставити, кіт сюди не вилазить. */
export const coffeeOn = (state: Homed, surface: string): boolean => coffeeSurface(state) === surface;

/** Що з кавою; null — машини немає чи вона ще не стоїть. */
export function coffeeStage(state: Homed): CoffeeStage | null {
  const coffee = state.home.coffee;
  if (!coffee || coffee.surface === null) return null;
  return coffee.ready === true ? "ready" : coffee.brewing !== undefined ? "brewing" : "idle";
}

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

/** Запустити вільну машину: далі вона варить сама (`tickCoffee`). */
export function startCoffee(state: GameState): void {
  const coffee = state.home.coffee;
  if (!coffee || coffee.surface === null || coffeeStage(state) !== "idle") return;
  coffee.brewing = 0;
  emit(state, { type: "coffee", stage: "started", object: coffee.surface });
}

/** Кава вариться своїм часом, як страва на плиті; без світла (`power` — false) стоїть. Готова чашка чекає скільки завгодно. */
export function tickCoffee(state: GameState, minutes: number, power: boolean): void {
  const coffee = state.home.coffee;
  if (!coffee || coffee.surface === null || coffee.brewing === undefined || !power) return;
  coffee.brewing += minutes;
  if (coffee.brewing < COFFEE.brewMinutes) return;
  delete coffee.brewing;
  coffee.ready = true;
  emit(state, { type: "coffee", stage: "ready", object: coffee.surface });
}

/** Випити готову чашку: «Недосипу» до кінця дня немає; бонус сну, якби він був, лишається. Машина знову вільна. */
export function drinkCoffee(state: GameState): void {
  const coffee = state.home.coffee;
  if (!coffee || coffee.surface === null || coffee.ready !== true) return;
  delete coffee.ready;
  state.character.sleepSpeed = Math.max(0, state.character.sleepSpeed);
  emit(state, { type: "coffee", stage: "drunk", object: coffee.surface });
}
