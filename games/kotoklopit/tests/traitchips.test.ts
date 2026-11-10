// Риси в картках (§9.9): живий кіт, прощання й альбом показують риси однаково — лише те, що гравець знає.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { OBSERVATIONS } from "../src/sim/config";
import { removeCat } from "../src/sim/farewell";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { TRAIT_GROUPS, traitName } from "../src/sim/traits";
import type { Trait } from "../src/sim/types";
import { fill } from "../src/texts";
import { HIDDEN_TRAIT, knownTraitChips } from "../src/ui/traits";

const quiet = TRAIT_GROUPS.find((g) => g.quiet)!;
const [a, b, c] = TRAIT_GROUPS.filter((g) => !g.quiet);

describe("риси в картках: лише відоме (§9.9)", () => {
  const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
  const need = OBSERVATIONS.normal;
  const traits: Trait[] = [
    { group: a!.id, level: 1, seen: 0, known: true },
    { group: b!.id, level: -1, seen: Math.ceil(need / 3), known: false },
    { group: c!.id, level: 2, seen: 0, known: false },
    { group: quiet.id, level: 1, seen: 0, known: false },
  ];

  it("відома — назвою, помічена — «…?», непомічена й тиха невідома — не видно", () => {
    const cat = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, sex: "male" });
    cat.traits = structuredClone(traits);
    expect(knownTraitChips(state, cat).map((chip) => chip.label)).toEqual([fill(traitName(traits[0]!), "male"), HIDDEN_TRAIT]);
  });

  it("прощання не відкриває рис: запис альбому показує те саме, що й живий кіт", () => {
    const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 3, sex: "female" });
    addCat(state, cat);
    cat.traits = structuredClone(traits);
    const alive = knownTraitChips(state, cat).map((chip) => chip.label);
    const entry = removeCat(state, cat, { kind: "old" }, state.day);
    expect(knownTraitChips(state, entry).map((chip) => chip.label)).toEqual(alive);
    expect(alive).not.toContain(fill(traitName(traits[2]!), "female"));
    expect(alive).not.toContain(fill(traitName(traits[3]!), "female"));
  });
});
