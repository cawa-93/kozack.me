import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH, OBSERVATIONS } from "./config";
import type { Difficulty, GameState } from "./types";

/**
 * Змінити складність посеред гри (§5.2). Пороги за складністю тут лічать абсолютне набране (прояви риси, години пошуку, хвилини на
 * плиті): без перерахунку на частку перемикання само відкривало б рису, давало роботу чи палило страву.
 */
export function setDifficulty(state: GameState, difficulty: Difficulty): void {
  const from = state.difficulty;
  if (from === difficulty) return;
  state.job.searchHours = (state.job.searchHours * JOB_SEARCH.hours[difficulty]) / JOB_SEARCH.hours[from];
  const stove = state.home.stove;
  if (stove.item?.kind === "meal") {
    stove.minutes = COOK_MINUTES + ((stove.minutes - COOK_MINUTES) * (BURN_MINUTES[difficulty] - COOK_MINUTES)) / (BURN_MINUTES[from] - COOK_MINUTES);
  }
  for (const cat of state.cats) {
    for (const trait of cat.traits) if (!trait.known) trait.seen = (trait.seen * OBSERVATIONS[difficulty]) / OBSERVATIONS[from];
  }
  state.difficulty = difficulty;
}
