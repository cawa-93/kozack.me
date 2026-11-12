// Кіт пішов (§9.7): інші коти не пам'ятають за ним перемир'я після бійки (§9.4) і паузи шипіння на перехожого (§9.12) — інакше
// ці записи лишалися б у збереженні назавжди.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { removeCat } from "../src/sim/farewell";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";
import { withCatCorner } from "./helpers";

function withCat(save: Save, seed: number): Cat {
  const cat = createCat(save.current, createRng(seed), { source: "shelter", ageWeeks: 20 });
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("кіт пішов (§9.7)", () => {
  it("його номер зникає з перемир'їв і пауз шипіння інших котів, решта записів лишається", () => {
    const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 }));
    const [a, b, c] = [withCat(save, 1), withCat(save, 2), withCat(save, 3)];
    if (!a || !b || !c) throw new Error("немає котів");
    a.truce = { [b.id]: 900, [c.id]: 950 };
    b.truce = { [a.id]: 900 };
    c.truce = { [b.id]: 800 };
    a.snubAt = { [b.id]: 700, [c.id]: 710 };
    c.snubAt = { [b.id]: 720 };
    removeCat(save.current, b, { kind: "given" }, save.current.day);
    expect(a.truce).toEqual({ [c.id]: 950 });
    expect(a.snubAt).toEqual({ [c.id]: 710 });
    // Порожнє поле — як його й не було.
    expect(c.truce).toBeUndefined();
    expect(c.snubAt).toBeUndefined();
  });
});
