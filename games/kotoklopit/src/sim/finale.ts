// Фінал «Вихід на пенсію» за двома осями — котами й кар'єрою (§4.2).

import type { GameState } from "./types";

export type CatsAxis = "happy" | "ordinary" | "suffered";
export type CareerAxis = "low" | "middle" | "high";

/** Посада на момент пенсії: 1–3 — низька, 4–7 — середня, 8–10 — висока (§4.2). */
export function careerAxis(state: GameState): CareerAxis {
  const position = state.job.position + 1;
  if (position >= 8) return "high";
  return position >= 4 ? "middle" : "low";
}

/**
 * Середня якість життя котів: від 60% — щасливі, нижче 40% — страждали (§4.2).
 * Настрій котів додасть крок 6 плану; доти, як і без жодного кота, — «звичайне життя».
 */
export function catsAxis(_state: GameState): CatsAxis {
  return "ordinary";
}
