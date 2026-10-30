// Де видно персонажа нового вигляду й куди він дивиться (крок 16, T2, `src/view/iso/personspot.ts`): за справою біля речі —
// на її місці з `world/objects.ts` (`IsoObjectLook.use`), з котом, лотком чи безладом — лицем до них, інакше — точка тіла.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { itemPoint } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Save } from "../src/sim/types";
import { facingFromTiles } from "../src/view/anim/catfacing";
import { GLIDE_JUMP, glideOffset, personSpot } from "../src/view/iso/personspot";
import { isoObjectLook } from "../src/view/world/objects";
import { withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 4 }));
  save.current.character.body = { ...save.current.character.body, x: 9.5, y: 8.5, facing: { x: 1, y: 0 } };
  return save;
}

describe("personSpot: де видно персонажа", () => {
  it("без справи — точка тіла, напрям — за рухом", () => {
    const state = game().current;
    expect(personSpot(state, "idle")).toEqual({ at: { x: 9.5, y: 8.5 }, face: null, pose: null });
    expect(personSpot(state, "walk")).toEqual({ at: { x: 9.5, y: 8.5 }, face: null, pose: null });
  });

  it("працює й шукає роботу — сидить за комп'ютером спиною до нас; лагодить дріт — там само", () => {
    const state = game().current;
    const use = isoObjectLook("computer").use;
    state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
    expect(personSpot(state, "work")).toEqual({ at: use?.at, face: use?.facing, pose: "sit" });
    expect(facingFromTiles(use?.facing ?? { x: 0, y: 0 }, null)?.view).toBe("back");
    state.character.activity = { kind: "use", target: "computer", progress: 0 };
    expect(personSpot(state, "fix").at).toEqual(use?.at);
  });

  it("їсть за столом сидячи, купає кота перед душем, пилососить біля шафи; засинає — біля ліжка", () => {
    const state = game().current;
    state.character.activity = { kind: "use", target: "table", progress: 0 };
    expect(personSpot(state, "eat")).toMatchObject({ at: isoObjectLook("table").use?.at, pose: "sit" });
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true, bath: true };
    expect(personSpot(state, "bath")).toMatchObject({ at: isoObjectLook("shower").use?.at, pose: "stand" });
    state.character.activity = { kind: "use", target: "vacuum", progress: 0 };
    expect(personSpot(state, "vacuum").at).toEqual(isoObjectLook("vacuum").use?.at);
    state.character.activity = null;
    expect(personSpot(state, "fallAsleep")).toMatchObject({ at: isoObjectLook("bed").use?.at, face: isoObjectLook("bed").use?.facing });
    // Падає без сил — там, де стоїть.
    expect(personSpot(state, "collapse").at).toEqual({ x: 9.5, y: 8.5 });
  });

  it("гладить чи грається — лицем до кота; чистить лоток чи прибирає — лицем до них, там, де стоїть", () => {
    const state = game().current;
    const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 8.5, y: 9.2 } });
    addCat(state, cat);
    state.character.activity = { kind: "pet", cat: cat.id, minutes: 0 };
    const pet = personSpot(state, "pet");
    expect(pet.at).toEqual({ x: 9.5, y: 8.5 });
    expect(pet.face?.x).toBeCloseTo(cat.x - 9.5);
    expect(pet.face?.y).toBeCloseTo(cat.y - 8.5);
    // Ліворуч на екрані: ракурс дзеркальний.
    expect(facingFromTiles(pet.face ?? { x: 0, y: 0 }, null)?.flip).toBe(true);
    state.character.activity = { kind: "play", cat: cat.id, minutes: 0 };
    expect(personSpot(state, "rod").face).toEqual(pet.face);

    const litter = state.home.items.find((i) => i.kind === "litter");
    expect(litter).toBeDefined();
    if (!litter) return;
    state.character.activity = { kind: "use", target: `item:${litter.id}`, progress: 0 };
    const at = itemPoint(litter);
    expect(personSpot(state, "litter")).toEqual({ at: { x: 9.5, y: 8.5 }, face: { x: at.x - 9.5, y: at.y - 8.5 }, pose: null });
    state.home.messes.push({ id: 77, kind: "vomit", x: 9.5, y: 9.5, cat: null });
    state.character.activity = { kind: "use", target: "mess:77", progress: 0 };
    expect(personSpot(state, "clean").face).toEqual({ x: 0, y: 1 });
  });
});

describe("glideOffset: перехід до місця справи", () => {
  it("плавно наближається до цілі й доходить до неї; далекий стрибок — одразу", () => {
    let offset = { x: 0, y: 0 };
    const target = { x: 0.5, y: -0.4 };
    offset = glideOffset(offset, target, 1 / 60);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.x).toBeLessThan(0.5);
    for (let i = 0; i < 60; i++) offset = glideOffset(offset, target, 1 / 60);
    expect(offset).toEqual(target);
    expect(glideOffset({ x: 0, y: 0 }, { x: GLIDE_JUMP + 1, y: 0 }, 1 / 60)).toEqual({ x: GLIDE_JUMP + 1, y: 0 });
    // Гра стоїть — нічого не рухається.
    expect(glideOffset({ x: 0.2, y: 0 }, { x: 0, y: 0 }, 0)).toEqual({ x: 0.2, y: 0 });
  });
});
