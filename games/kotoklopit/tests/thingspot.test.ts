// Куди стане сховище з рук (§8.7, «Сховища й переноски»): рахується щокадру, поки його несуть, тож перевірка проходу дешева — а
// місця ті самі, що й клітинка за клітинкою (записано з повної перевірки; тут — стани, де вона відкидає ближчу клітинку, і де
// поставити нікуди).

import { describe, expect, it } from "vitest";

import { addCatCorner } from "../src/dev/scenarios";
import { addSupply } from "../src/sim/economy";
import { newGame } from "../src/sim/game";
import { dropThing, thingSpot } from "../src/sim/moving";
import type { CarryThing, GameState } from "../src/sim/types";

type Layout = "base" | "all" | "crowded";

/** Квартира: з котячим кутком; `all` — ще й усі сховища й переноска; `crowded` — бак і аптечка впритул до шафки. */
function home(layout: Layout, thing: CarryThing): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
  state.modifiers.day = null;
  state.modifiers.week = null;
  addCatCorner(state);
  if (layout !== "base") {
    for (const product of ["catFood", "sterileFood", "pills", "litter"] as const) addSupply(state, product, "cheap", 1);
    state.home.carriers.push({ quality: "cheap", wear: 0 });
  }
  if (layout === "crowded") state.home.displaced = { "sterile-bin": { x: 17, y: 3 }, "cat-kit": { x: 18, y: 2 } };
  state.home.thingCarried = thing;
  state.character.held = { kind: "gameThing", thing };
  return state;
}

function at(state: GameState, x: number, y: number, fx: number, fy: number): void {
  Object.assign(state.character.body, { x, y, facing: { x: fx, y: fy } });
}

/** Що несуть, де стоять і куди дивляться — і куди стане (null — нікуди). */
const SPOTS: [Layout, CarryThing, number, number, number, number, string | null][] = [
  ["base", "cat-cabinet", 2.5, 1.5, -1, 0, "floor-3-1"],
  ["base", "cat-cabinet", 3.5, 6.5, 0, -1, "scratcher-1"],
  ["base", "cat-cabinet", 1.5, 9.5, 0, -1, "floor-2-8"],
  ["all", "cat-cabinet", 13.5, 2.5, 0, 1, null],
  ["all", "cat-cabinet", 16.5, 4.5, -1, 0, "bowl-2"],
  ["all", "sterile-bin", 18.5, 2.5, 1, 0, null],
  ["all", "sterile-bin", 16.5, 4.5, 1, 0, "bowl-2"],
  ["all", "litter-bag", 8.5, 2.5, 1, 0, "litter-2"],
  ["all", "litter-bag", 16.5, 5.5, 1, 0, "floor-16-4"],
  ["all", "cat-kit", 14.5, 2.5, 1, 0, "bowl-3"],
  ["all", "cat-kit", 9.5, 3.5, 0, -1, "floor-8-2"],
  ["all", "cat-kit", 18.5, 4.5, -1, 0, null],
  ["all", "carrier", 3.5, 9.5, 1, 0, "floor-4-9"],
  ["crowded", "cat-cabinet", 17.5, 2.5, -1, 0, "bowl-2"],
  ["crowded", "cat-cabinet", 16.5, 5.5, -1, 0, "floor-15-6"],
  ["crowded", "cat-cabinet", 1.5, 8.5, 0, -1, "floor-2-7"],
  ["crowded", "sterile-bin", 15.5, 2.5, 0, -1, "floor-16-2"],
  ["crowded", "litter-bag", 15.5, 2.5, -1, 0, "bowl-3"],
  ["crowded", "litter-bag", 18.5, 4.5, 1, 0, null],
  ["crowded", "cat-kit", 15.5, 3.5, 0, 1, "bowl-2"],
  ["crowded", "cat-kit", 17.5, 4.5, 0, 1, "floor-18-4"],
  ["crowded", "carrier", 16.5, 4.5, 1, 0, "floor-17-4"],
];

describe("куди стане сховище з рук (§8.7)", () => {
  it.each(SPOTS)("%s: %s, персонаж на %f,%f обличчям %i,%i — місце %s", (layout, thing, x, y, fx, fy, expected) => {
    const state = home(layout, thing);
    at(state, x, y, fx, fy);
    const before = structuredClone(state);
    expect(thingSpot(state)?.id ?? null).toBe(expected);
    // Перевірка ставить річ подумки й вертає все, як було.
    expect(state).toEqual(before);
  });

  it("заснувши зі сховищем у руках, персонаж ставить його туди ж, куди й раніше", () => {
    const drops: [Layout, CarryThing, number, number, { x: number; y: number }][] = [
      ["crowded", "cat-cabinet", 17.5, 4.5, { x: 16, y: 3 }],
      ["all", "litter-bag", 17.5, 4.5, { x: 16, y: 4 }],
      ["base", "cat-kit", 3.5, 9.5, { x: 3, y: 8 }],
      ["crowded", "sterile-bin", 10.5, 9.5, { x: 11, y: 9 }],
    ];
    for (const [layout, thing, x, y, expected] of drops) {
      const state = home(layout, thing);
      at(state, x, y, 1, 0);
      dropThing(state);
      expect(state.home.displaced?.[thing], `${layout} ${thing}`).toEqual(expected);
    }
  });
});
