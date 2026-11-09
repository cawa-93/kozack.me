// Петлі тла (§11.4а, «Тло»): вулиця з вікон за часом доби й погодою дня, гомін фестивалю, вечірка за стіною, холодильник.
// Перелік перебудовується, лише коли змінилося, що звучить: петлі перечитують кожні `SFX.loopMs`.

import { AMBIENT } from "../../config";
import { DAYLIGHT, MODIFIERS } from "../../../sim/config";
import { active, powerOut } from "../../../sim/modifiers";
import type { GameState } from "../../../sim/types";
import type { LoopCue } from "../types";
import type { AmbientSound } from "./sounds";

type Street = Extract<AmbientSound, "birds" | "city" | "evening" | "rain" | "cicadas" | "wind" | "festival">;

/** Що чути з вікон: погода дня — увесь день, фестиваль — увечері, інакше — вулиця за часом доби (`DAYLIGHT`). */
export function streetSound(state: GameState): Street {
  const minute = state.minute;
  if (state.modifiers.day === "festival" && minute >= AMBIENT.festivalFrom && minute < MODIFIERS.festival.minute + MODIFIERS.festival.minutes) return "festival";
  if (active(state, "rain")) return "rain";
  if (active(state, "heat")) return "cicadas";
  if (active(state, "cold")) return "wind";
  if (minute < DAYLIGHT.morningEnd) return "birds";
  return minute < DAYLIGHT.eveningStart ? "city" : "evening";
}

/** Вечірка в сусідів — з `AMBIENT.partyFrom`, поки персонаж не спить (сон і так беззвучний). */
export const partying = (state: GameState): boolean => active(state, "noisy-neighbors") && state.minute >= AMBIENT.partyFrom;

/** Пам'ять петель тла між викликами: група тримає одну на гру. */
export class AmbientLoops {
  private signature = "";
  private cached: readonly LoopCue[] = [];

  /** Петлі зі стану; той самий масив, поки нічого не змінилося. */
  read(state: GameState): readonly LoopCue[] {
    const street = streetSound(state);
    const party = partying(state);
    const fridge = !powerOut(state);
    const signature = `${street}|${party}|${fridge}`;
    if (signature === this.signature) return this.cached;
    this.signature = signature;
    const loops: LoopCue[] = AMBIENT.windows.map((at, i) => ({ key: `street:${i}`, sound: street, at }));
    if (party) loops.push({ key: "party", sound: "party", at: AMBIENT.neighbors });
    if (fridge) loops.push({ key: "fridge", sound: "fridge", at: "fridge" });
    this.cached = loops;
    return loops;
  }
}
