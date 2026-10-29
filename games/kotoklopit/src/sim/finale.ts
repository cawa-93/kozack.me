// Фінал «Вихід на пенсію» за двома осями — котами й кар'єрою (§4.2).

import { lifeMood } from "./cat";
import { CAREER_AXIS, HAPPY_LIFE, SUFFERED_LIFE } from "./config";
import type { GameState } from "./types";

export type CatsAxis = "happy" | "ordinary" | "suffered";
export type CareerAxis = "low" | "middle" | "high";

/** Посада на момент пенсії: 1–8 — низька, 9–14 — середня, 15 (директор) — висока; безробітний — низька (§4.2, Ц1, А10). */
export function careerAxis(state: GameState): CareerAxis {
  if (state.job.unemployed) return "low";
  const position = state.job.position + 1;
  if (position >= CAREER_AXIS.high) return "high";
  return position >= CAREER_AXIS.middle ? "middle" : "low";
}

/** Життя кота: середній настрій і скільки днів він прожив удома (§9.7). */
export interface Life {
  mood: number;
  days: number;
}

/** Життя кожного кота, що жив із персонажем: і з альбому, і живих (§4.2, §9.7). */
export function allLives(state: GameState): Life[] {
  return [...state.album.map((e) => ({ mood: e.lifeMood, days: e.days })), ...state.cats.map((c) => ({ mood: lifeMood(c), days: c.moodHistory.length }))];
}

/**
 * Середня якість життя котів для фіналу — середній настрій «котячого дня»: настрій кожного кота зважено днями, які він прожив
 * удома (§4.2; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А11; раніше — просте середнє по котах, і кіт, що прожив кілька
 * днів, важив як десятитижневий). Кіт, що не прожив і повного дня, важить як один день; без котів — null.
 */
export function catsMood(state: GameState): number | null {
  let sum = 0;
  let days = 0;
  for (const life of allLives(state)) {
    const weight = Math.max(1, life.days);
    sum += life.mood * weight;
    days += weight;
  }
  return days > 0 ? sum / days : null;
}

/** Вісь котів: від 85% — щасливі, нижче 70% — страждали; без котів — «звичайне життя» (§4.2, Ц2). Кількість котів не важить. */
export function catsAxis(state: GameState): CatsAxis {
  const mood = catsMood(state);
  if (mood === null) return "ordinary";
  if (mood >= HAPPY_LIFE) return "happy";
  return mood < SUFFERED_LIFE ? "suffered" : "ordinary";
}
