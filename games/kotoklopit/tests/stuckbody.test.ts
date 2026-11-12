// Персонаж не застрягає в твердому (§8.7, «Сховища й переноски», «Що ставить гра»): тверда річ не стає на клітинку, яку зачіпає
// його тіло (квадрат 2 × `BODY_RADIUS` довкола центру, як у зіткненнях), — ні з рук, ні від гри; а той, хто вже опинився в
// твердому (стара гра), може з нього вийти.

import { describe, expect, it } from "vitest";

import { moveBody } from "../src/sim/body";
import { BODY_RADIUS } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, newGame } from "../src/sim/game";
import { placedObject, PLACES, SPAWN, thingHome } from "../src/sim/home";
import { moveThing } from "../src/sim/moving";
import { thingFits } from "../src/sim/settle";
import { HOME_DOOR } from "../src/sim/trips";
import type { CarryThing, GameState, Product, Save, Vec } from "../src/sim/types";

function game(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 5 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
}

/** Тіло персонажа в точці `p` зачіпає клітинку (x, y): квадрати перетинаються. */
function touches(p: Vec, x: number, y: number): boolean {
  const r = BODY_RADIUS;
  return p.x + r > x && p.x - r < x + 1 && p.y + r > y && p.y - r < y + 1;
}

const tileOf = (state: GameState, thing: CarryThing): Vec => {
  const o = placedObject(state, thing);
  return { x: o.x, y: o.y };
};

/** Позиція з гри автора (`stuck.json`): персонажка на (4, 9) біля кута клітинки (3, 8). */
const CORNER: Vec = { x: 4.128883913993467, y: 9.05243911987057 };

describe("персонаж не застрягає в сховищі (§8.7)", () => {
  it("сховище з рук не стає на клітинку, яку зачіпає тіло персонажа, — і по діагоналі теж", () => {
    for (const [thing, product] of [["cat-cabinet", "catFood"], ["litter-bag", "litter"], ["sterile-bin", "sterileFood"], ["cat-kit", "pills"]] as [CarryThing, Product][]) {
      for (const facing of [{ x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }]) {
        const save = game();
        const state = save.current;
        addSupply(state, product, "cheap", 1);
        state.home.thingCarried = thing;
        state.character.held = { kind: "gameThing", thing };
        Object.assign(state.character.body, { x: CORNER.x, y: CORNER.y, facing });
        moveThing(state);
        expect(state.character.held, thing).toBeNull();
        const tile = tileOf(state, thing);
        expect(touches(state.character.body, tile.x, tile.y), `${thing} → ${tile.x},${tile.y}`).toBe(false);
      }
    }
  });

  it("сховище, що з'являється там, де стоїть персонаж, стає поруч, а не на нього", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("cat-cabinet");
    Object.assign(state.character.body, { x: home.x + 0.5, y: home.y + 0.5 });
    addSupply(state, "catFood", "cheap", 1);
    advance(save, 1);
    const tile = tileOf(state, "cat-cabinet");
    expect(touches(state.character.body, tile.x, tile.y), `${tile.x},${tile.y}`).toBe(false);
  });

  it("місце зайняте — сховище стає поруч, але не на клітинку, якої торкається персонаж", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("cat-cabinet");
    const slot = PLACES.find((p) => p.x === home.x && p.y === home.y)?.id ?? "";
    state.home.items.push({ id: state.nextId++, kind: "bowl", quality: "cheap", slot, food: 0, foodQuality: null, sterile: false });
    // Найближча вільна для шафки — (17, 3); персонаж стоїть так, що зачіпає її краєм.
    Object.assign(state.character.body, { x: 16.8, y: 3.5 });
    addSupply(state, "catFood", "cheap", 1);
    advance(save, 1);
    const tile = tileOf(state, "cat-cabinet");
    expect(tile).not.toEqual(home);
    expect(touches(state.character.body, tile.x, tile.y), `${tile.x},${tile.y}`).toBe(false);
  });

  it("тверде не стає й там, де персонаж з'являється: біля ліжка, прокинувшись, і перед вхідними дверима, повернувшись із поїздки", () => {
    const save = game();
    const state = save.current;
    // Персонаж посеред вітальні — його тіло клітинок біля ліжка й дверей не зачіпає.
    Object.assign(state.character.body, { x: 7.5, y: 5.5 });
    for (const thing of ["cat-cabinet", "litter-bag", "sterile-bin", "cat-kit"] as const) {
      const fits = thingFits(state, thing);
      for (const [where, at] of [["ліжко", SPAWN], ["двері", HOME_DOOR]] as const) {
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 30; x++) {
            if (touches(at, x, y)) expect(fits({ x, y }), `${thing} → ${x},${y} (${where})`).toBe(false);
          }
        }
      }
    }
  });

  it("той, хто вже опинився в твердому (стара гра), виходить із нього", () => {
    const save = game();
    const state = save.current;
    addSupply(state, "catFood", "cheap", 1);
    state.home.displaced = { "cat-cabinet": { x: 3, y: 8 } };
    Object.assign(state.character.body, { x: CORNER.x, y: CORNER.y });
    expect(touches(state.character.body, 3, 8)).toBe(true);
    for (let i = 0; i < 20; i++) moveBody(state, { x: 1, y: 0 }, 0.05);
    expect(state.character.body.x).toBeGreaterThan(CORNER.x + 0.3);
    expect(touches(state.character.body, 3, 8)).toBe(false);
  });
});
