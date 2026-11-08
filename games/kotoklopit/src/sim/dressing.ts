// Пластир і бинт (§6.5) і що робить натискання біля умивальника, де вони лежать разом з ліками для себе.

import { changeStat } from "./character";
import { DRESSING, STAT_MAX } from "./config";
import { useSupply } from "./economy";
import { emit, type Refusal } from "./events";
import { curePerson, isIll, needsHumanMeds, takeHumanMeds, treatable } from "./illness";
import type { Rng } from "./rng";
import type { GameState, Quality } from "./types";

const hurt = (state: GameState): boolean => state.character.stats.health < STAT_MAX;

/**
 * Яку перев'язку взяти (§6.5): з травмою — бинт, він її знімає; без неї — спершу пластир, щоб бинт лишився на травму.
 * null — перев'язуватися не треба чи нічим.
 */
export function dressingFor(state: GameState): Quality | null {
  const supply = state.home.supplies.dressing;
  if (isIll(state, "injury") && supply.premium > 0) return "premium";
  if (!hurt(state)) return null;
  if (supply.cheap > 0) return "cheap";
  return supply.premium > 0 ? "premium" : null;
}

/** Пластир чи бинт: здоров'я одразу, бинт ще й знімає травму. */
export function applyDressing(state: GameState, quality: Quality): boolean {
  if (useSupply(state, "dressing", quality) === null) return false;
  changeStat(state, "health", DRESSING.health[quality]);
  const cured = quality === "premium" && isIll(state, "injury");
  if (cured) curePerson(state, "injury");
  emit(state, { type: "person-dressing", quality, cured });
  return true;
}

/**
 * Натискання біля умивальника (§6.5, «Біля умивальника»): перша можлива дія — бинт від травми, ліки, перев'язка від
 * утраченого здоров'я; не вдалося нічого — причина відмови. Бинт іде перед ліками: він знімає травму одразу, а ліки — за кілька днів.
 */
export function sinkCare(state: GameState, rng: Rng): Refusal | null {
  if (isIll(state, "injury") && state.home.supplies.dressing.premium > 0) {
    applyDressing(state, "premium");
    return null;
  }
  if (takeHumanMeds(state, rng)) return null;
  const quality = dressingFor(state);
  if (quality !== null) {
    applyDressing(state, quality);
    return null;
  }
  if (needsHumanMeds(state)) return { reason: "empty", product: "humanMeds" };
  if (treatable(state)) return { reason: "dose-taken" };
  if (hurt(state)) return { reason: "empty", product: "dressing" };
  return { reason: "healthy" };
}
