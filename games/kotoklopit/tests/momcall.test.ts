// Розмова з мамою (§4.1, «Мама дзвонить»): почата тривала дія лише чекає, поки говорять, — і душ теж: персонаж не домивається
// за пів години розмови, а після неї домивається стільки, скільки лишалося.

import { describe, expect, it } from "vitest";

import { useProgress } from "../src/sim/actions";
import { MODIFIERS, SHOWER_MINUTES } from "../src/sim/config";
import { advance, interact, newGame } from "../src/sim/game";
import { answerCall } from "../src/sim/modifiers";
import type { Save } from "../src/sim/types";
import { bodyMinutes, hours, recordEvents, standAt } from "./helpers";

/** День «Мама дзвонить»: персонажка о 11:00 заходить у душ, мама подзвонить за хвилину. */
function showering(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 5 });
  const state = save.current;
  state.modifiers.day = "mom-call";
  state.modifiers.week = null;
  state.minute = hours(11);
  state.today.callAt = state.minute + 1;
  state.character.stats.hygiene = 20;
  standAt(save, "shower");
  interact(save);
  expect(state.character.activity).toMatchObject({ kind: "use", inside: true });
  return save;
}

describe("розмова з мамою під час душу (§4.1)", () => {
  it("душ на час розмови стоїть, а після неї йде далі й закінчується раз", () => {
    const save = showering();
    const state = save.current;
    advance(save, 2);
    expect(state.today.callPending).toBe(true);
    const progress = useProgress(state);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(0.5);
    const { events, stop } = recordEvents();
    // Як сцена: відповісти — і пів години розмови без керування.
    expect(answerCall(state)).toBe(true);
    advance(save, MODIFIERS.call.minutes);
    expect(events.some((e) => e.type === "showered")).toBe(false);
    expect(state.character.activity).toMatchObject({ kind: "use", inside: true });
    expect(useProgress(state)).toBeCloseTo(progress ?? 0);
    // Розмову закінчено: домивається решту душу.
    advance(save, bodyMinutes(SHOWER_MINUTES) * (1 - (progress ?? 0)) + 0.5);
    stop();
    expect(state.character.activity).toBeNull();
    expect(events.filter((e) => e.type === "showered")).toHaveLength(1);
  });
});
