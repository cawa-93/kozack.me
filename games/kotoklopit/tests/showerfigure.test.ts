// Силует персонажа в душовій кабіні (§8.7): кадр миття за часом, пара над ним, а без пари — решта тіла.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { SHOWER_WASH, showerFigure } from "../src/view/iso/looks";

function state(activity: GameState["character"]["activity"], outage = false): GameState {
  const current = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  current.character.activity = activity;
  if (outage) current.modifiers.day = "outage";
  return current;
}

const washing = { kind: "use", target: "shower", progress: 2, inside: true } as const;

describe("силует у кабіні (§8.7)", () => {
  it("видно лише під час душу: не коли кабіна порожня й не коли купають кота", () => {
    expect(showerFigure(state(null), 0)).toBeNull();
    expect(showerFigure(state({ ...washing, bath: true }), 0)).toBeNull();
    expect(showerFigure(state({ kind: "use", target: "table", progress: 1 }), 0)).toBeNull();
    expect(showerFigure(state(washing), 0)).not.toBeNull();
  });

  it("кадри миття йдуть по колу за часом", () => {
    const { frames, ms } = SHOWER_WASH;
    const shown = frames.map((_, i) => showerFigure(state(washing), i * ms)?.wash.state);
    expect(shown).toEqual([...frames]);
    expect(showerFigure(state(washing), frames.length * ms)?.wash.state).toBe(frames[0]);
  });

  it("над силуетом пара, а в холодному душі пари немає: видно решту тіла", () => {
    expect(showerFigure(state(washing), 0)?.over.state).toBe("steam");
    expect(showerFigure(state(washing, true), 0)?.over.state).toBe("legs");
  });

  it("усі кадри є в записі арту", () => {
    const states = artEntry("env/shower/figure")?.states ?? [];
    for (const name of [...SHOWER_WASH.frames, "steam", "legs"]) expect(states).toContain(name);
  });
});
