// Фінал «Вихід на пенсію» за двома осями — котами й кар'єрою (§4.2).

import { lifeMood } from "./cat";
import { CAREER_AXIS, HAPPY_LIFE, SUFFERED_LIFE } from "./config";
import type { GameState } from "./types";

export type CatsAxis = "happy" | "ordinary" | "suffered";
export type CareerAxis = "low" | "middle" | "high";

/** Посада на момент пенсії: 1–5 — низька, 6–9 — середня, 10 (директор) — висока; безробітний — низька (§4.2, Ц1). */
export function careerAxis(state: GameState): CareerAxis {
  if (state.job.unemployed) return "low";
  const position = state.job.position + 1;
  if (position >= CAREER_AXIS.high) return "high";
  return position >= CAREER_AXIS.middle ? "middle" : "low";
}

/** Середній настрій за життя кожного кота, що жив із персонажем: і з альбому, і живих (§4.2, §9.7). */
export function allLives(state: GameState): number[] {
  return [...state.album.map((e) => e.lifeMood), ...state.cats.map(lifeMood)];
}

/** Середня якість життя котів: від 85% — щасливі, нижче 70% — страждали; без котів — «звичайне життя» (§4.2, Ц2). */
export function catsAxis(state: GameState): CatsAxis {
  const lives = allLives(state);
  if (lives.length === 0) return "ordinary";
  const average = lives.reduce((a, b) => a + b, 0) / lives.length;
  if (average >= HAPPY_LIFE) return "happy";
  return average < SUFFERED_LIFE ? "suffered" : "ordinary";
}
