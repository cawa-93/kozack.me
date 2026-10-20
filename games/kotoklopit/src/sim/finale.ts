// Фінал «Вихід на пенсію» за двома осями — котами й кар'єрою (§4.2).

import { lifeMood } from "./cat";
import { HAPPY_LIFE, SUFFERED_LIFE } from "./config";
import type { GameState } from "./types";

export type CatsAxis = "happy" | "ordinary" | "suffered";
export type CareerAxis = "low" | "middle" | "high";

/** Посада на момент пенсії: 1–3 — низька, 4–7 — середня, 8–10 — висока; безробітний — низька (§4.2). */
export function careerAxis(state: GameState): CareerAxis {
  if (state.job.unemployed) return "low";
  const position = state.job.position + 1;
  if (position >= 8) return "high";
  return position >= 4 ? "middle" : "low";
}

/** Середній настрій за життя кожного кота, що жив із персонажем: і з альбому, і живих (§4.2, §9.7). */
export function allLives(state: GameState): number[] {
  return [...state.album.map((e) => e.lifeMood), ...state.cats.map(lifeMood)];
}

/** Середня якість життя котів: від 60% — щасливі, нижче 40% — страждали; без котів — «звичайне життя» (§4.2). */
export function catsAxis(state: GameState): CatsAxis {
  const lives = allLives(state);
  if (lives.length === 0) return "ordinary";
  const average = lives.reduce((a, b) => a + b, 0) / lives.length;
  if (average >= HAPPY_LIFE) return "happy";
  return average < SUFFERED_LIFE ? "suffered" : "ordinary";
}
