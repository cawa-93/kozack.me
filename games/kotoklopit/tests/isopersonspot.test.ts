// Де видно персонажа нового вигляду й куди він дивиться (крок 16, T2, `src/view/iso/personspot.ts`): за справою біля речі —
// на її місці з `world/objects.ts` (`IsoObjectLook.use`), з котом, лотком чи безладом — лицем до них, інакше — точка тіла.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { isSolid, itemPoint, WIRE_TILE } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Save } from "../src/sim/types";
import { facingFromTiles } from "../src/view/anim/catfacing";
import { EYES, eyesFrame } from "../src/view/iso/personlook";
import { artOffset } from "../src/view/iso/geometry";
import {
  BATH_FACE,
  FIX_AT_WIRE,
  GLIDE_JUMP,
  glideOffset,
  personSpot,
  shotFace,
  shotPlace,
  showFace,
  SLEEP_TURN,
  TOUCH_FACE,
  touchFacing,
  wireFixSpot,
} from "../src/view/iso/personspot";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import { Rig } from "../src/view/rig/rigcore";
import { isoObjectLook } from "../src/view/world/objects";
import { ISO } from "../src/view/world/projection";
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

  it("працює й шукає роботу — сидить за комп'ютером спиною до нас", () => {
    const state = game().current;
    const use = isoObjectLook("computer").use;
    state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
    expect(personSpot(state, "work")).toEqual({ at: use?.at, face: use?.facing, pose: "sit" });
    expect(facingFromTiles(use?.facing ?? { x: 0, y: 0 }, null)?.view).toBe("back");
  });

  it("лагодить дріт — на підлозі біля обриву (точка `cut` дроту), спиною до нас, лицем до нього; не в столі й не в стіні", () => {
    const state = game().current;
    state.character.activity = { kind: "use", target: "computer", progress: 0 };
    const spot = personSpot(state, "fix");
    expect(spot).toBe(wireFixSpot());
    // Обрив — там, звідки сиплються іскри (`iso/fx.ts`): кадр дроту в центрі `WIRE_TILE`, зсув точки `cut`.
    const wire = ISO.toScreen({ x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 });
    const cut = artOffset("env/wire", "cut")!;
    const feet = ISO.toScreen(spot.at);
    // Від ніг до обриву на екрані — точка підлоги під кистями анімації `fix` (`FIX_AT_WIRE.hands`).
    expect(wire.x + cut.x - feet.x).toBeCloseTo(FIX_AT_WIRE.hands.x, 6);
    expect(wire.y + cut.y - feet.y).toBeCloseTo(FIX_AT_WIRE.hands.y, 6);
    // Лицем до дроту, спиною до камери, праворуч угору.
    expect(facingFromTiles(spot.face ?? { x: 0, y: 0 }, null)).toEqual({ view: "back", flip: false });
    // Не посередині стола, як раніше, а праворуч від нього: перед його коробкою, на вільній підлозі.
    const desk = isoObjectLook("computer");
    expect(Math.hypot(spot.at.x - desk.use!.at.x, spot.at.y - desk.use!.at.y)).toBeGreaterThan(1);
    expect(spot.at.x >= desk.footprint.x1 || spot.at.y >= desk.footprint.y1).toBe(true);
    expect(isSolid(state, Math.floor(spot.at.x), Math.floor(spot.at.y))).toBe(false);
    // Кулаки анімації `fix` у ракурсі `back` — над цією точкою підлоги (тягнуть дріт до себе й убік — до 24 убік, на 8–36 вище), увесь цикл.
    const rig = new Rig(PERSON_RIG, { facing: { view: "back", flip: false } });
    rig.play(PERSON_ANIMS.fix, 0, { blend: 0 });
    for (let t = 0; t < PERSON_ANIMS.fix.duration; t += 100) {
      rig.evaluate(t);
      const hands = rig.anchor("hands")!;
      expect(Math.abs(hands.x - FIX_AT_WIRE.hands.x), `@${t}`).toBeLessThan(24);
      expect(FIX_AT_WIRE.hands.y - hands.y, `@${t}`).toBeGreaterThan(8);
      expect(FIX_AT_WIRE.hands.y - hands.y, `@${t}`).toBeLessThan(36);
    }
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
    expect(personSpot(state, "fallAsleep", 1)).toMatchObject({ at: isoObjectLook("bed").use?.at, face: isoObjectLook("bed").use?.facing });
    // Падає без сил — там, де стоїть.
    expect(personSpot(state, "collapse").at).toEqual({ x: 9.5, y: 8.5 });
  });

  it("купаючи кота — боком до душу, у ракурсі `front`: кота на руках видно перед персонажем", () => {
    const state = game().current;
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true, bath: true };
    const bath = personSpot(state, "bath");
    expect(bath.face).toEqual(BATH_FACE);
    expect(facingFromTiles(bath.face ?? { x: 0, y: 0 }, null)?.view).toBe("front");
    // Душ — у тому боці, куди персонаж не дивиться: збоку.
    const shower = isoObjectLook("shower").use?.facing ?? { x: 0, y: 0 };
    expect(shower.x * BATH_FACE.x + shower.y * BATH_FACE.y).toBe(0);
  });

  it("засинаючи (§8.8), заплющені очі видно: лицем до кімнати, поки не обернеться до ліжка, падаючи без сил — теж", () => {
    const state = game().current;
    const bed = isoObjectLook("bed").use;
    // Лицем до ліжка — завжди спиною до камери (ліжко в куті).
    expect(facingFromTiles(bed?.facing ?? { x: 0, y: 0 }, null)?.view).toBe("back");
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const spot = personSpot(state, "fallAsleep", p);
      expect(spot.at).toEqual(bed?.at);
      const view = facingFromTiles(spot.face ?? { x: 0, y: 0 }, null)?.view;
      expect(view).toBe(p < SLEEP_TURN ? "front" : "back");
      // Очі заплющуються зовсім ще лицем до кімнати.
      if (p >= EYES.closed && p < SLEEP_TURN) expect(eyesFrame(p)).toBe("closed");
    }
    expect(EYES.closed).toBeLessThan(SLEEP_TURN - 0.05);
    // Падає без сил спиною до камери — обертається обличчям, той самий бік.
    expect(showFace("collapse", { view: "back", flip: true })).toEqual({ view: "front", flip: true });
    expect(showFace("collapse", { view: "front", flip: false })).toEqual({ view: "front", flip: false });
    // Ракурс засинання в ліжку веде `personSpot`; решту — не чіпає.
    expect(showFace("fallAsleep", { view: "back", flip: true })).toEqual({ view: "back", flip: true });
    expect(showFace("work", { view: "back", flip: false })).toEqual({ view: "back", flip: false });
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

describe("touchFacing: гладить чи грається — лицем до кота, якого намальовано", () => {
  const feet = { x: 100, y: 200 };

  it("кіт обабіч (юрба) — дзеркалом до нього, ракурсом `front`, хоч би куди персонаж дивився перед тим", () => {
    // Юрба ставить кота на `CROWD.beside` × розмір від персонажа й на `front` ближче до камери.
    for (const prev of [null, { view: "front", flip: false }, { view: "front", flip: true }, { view: "back", flip: false }, { view: "back", flip: true }] as const) {
      expect(touchFacing(feet, { x: feet.x - 56, y: feet.y + 3 }, prev)).toEqual({ view: "front", flip: true });
      expect(touchFacing(feet, { x: feet.x + 56, y: feet.y + 3 }, prev)).toEqual({ view: "front", flip: false });
      // Кошеня (розмір ≈ 0,5) — ближче, той самий бік.
      expect(touchFacing(feet, { x: feet.x - 28, y: feet.y + 1.5 }, prev)).toEqual({ view: "front", flip: true });
    }
  });

  it("кіт під самими ногами — ліво й право як були; помітно позаду (ліжко, підвіконня) — ракурс `back` з гістерезисом", () => {
    const prev = { view: "front", flip: true } as const;
    expect(touchFacing(feet, { x: feet.x + TOUCH_FACE.side / 2, y: feet.y + 30 }, prev)).toEqual({ view: "front", flip: true });
    expect(touchFacing(feet, { x: feet.x + TOUCH_FACE.side / 2, y: feet.y + 30 }, null).flip).toBe(false);
    const behind = touchFacing(feet, { x: feet.x + 30, y: feet.y - TOUCH_FACE.behind - 1 }, prev);
    expect(behind).toEqual({ view: "back", flip: false });
    // Трохи нижче за межу — ще `back` (гістерезис), нижче за межу мінус гістерезис — `front`.
    expect(touchFacing(feet, { x: feet.x + 30, y: feet.y - TOUCH_FACE.behind + 1 }, behind).view).toBe("back");
    expect(touchFacing(feet, { x: feet.x + 30, y: feet.y - TOUCH_FACE.behind + TOUCH_FACE.hysteresis + 1 }, behind).view).toBe("front");
    // Кіт на дивані перед персонажем: корінь піднято на сидіння (≈ 34), а підлога під ним ≈ 22 нижче за ноги — `front`.
    expect(touchFacing(feet, { x: feet.x - 30, y: feet.y + 22 - 34 }, null)).toEqual({ view: "front", flip: true });
  });
});

describe("разові справи біля речі — лицем до неї", () => {
  it("події справ кажуть, біля чого вони: річ квартири чи миска; події без речі — ні", () => {
    const meal = { kind: "meal", quality: "cheap" } as const;
    expect(shotPlace({ type: "took", object: "fridge", item: meal })).toEqual({ object: "fridge" });
    expect(shotPlace({ type: "put", object: "table", item: meal })).toEqual({ object: "table" });
    expect(shotPlace({ type: "trashed", item: meal })).toEqual({ object: "trash" });
    expect(shotPlace({ type: "fed", item: 4, food: 1 })).toEqual({ item: 4 });
    expect(shotPlace({ type: "watered", item: 5 })).toEqual({ item: 5 });
    expect(shotPlace({ type: "tap-opened", cat: 1 })).toEqual({ object: "sink" });
    expect(shotPlace({ type: "laundry", stage: "started" })).toEqual({ object: "washer" });
    expect(shotPlace({ type: "laundry", stage: "spin" })).toBeNull();
    expect(shotPlace({ type: "unpacked", moved: [] })).toEqual({ object: "boxes" });
    expect(shotPlace({ type: "received", deliveries: [] })).toEqual({ object: "door" });
    expect(shotPlace({ type: "cat-returned", cat: 1, caught: true })).toEqual({ object: "door" });
    expect(shotPlace({ type: "picked-up", cat: 1, offended: false })).toBeNull();
    expect(shotPlace({ type: "bite", cat: 1 } as never)).toBeNull();
  });

  it("до речі під стіною — за `use.facing` (спиною до нас); обійшов стіл — до середини сліду; до миски — до неї", () => {
    const state = game().current;
    for (const id of ["fridge", "stove", "washer", "sink", "trash", "counter-left", "cat-cabinet"]) {
      const use = isoObjectLook(id).use!;
      state.character.body = { ...state.character.body, x: use.at.x + 0.3, y: use.at.y + 0.2 };
      expect(shotFace(state, { object: id }), id).toEqual(use.facing);
    }
    // Двері — у передній стіні: лицем до них — до камери.
    const door = isoObjectLook("door").use!;
    state.character.body = { ...state.character.body, x: door.at.x, y: door.at.y };
    expect(shotFace(state, { object: "door" })).toEqual(door.facing);
    expect(facingFromTiles(door.facing, null)?.view).toBe("front");
    // Стіл: з боку стільця — як `use.facing`, з протилежного боку — до столу, а не спиною до нього.
    const table = isoObjectLook("table");
    state.character.body = { ...state.character.body, x: 14, y: 2.4 };
    const face = shotFace(state, { object: "table" })!;
    expect(face.y).toBeGreaterThan(0);
    expect(table.use?.facing.y).toBeLessThan(0);
    // Миска: до неї.
    const bowl = state.home.items.find((i) => i.kind === "bowl")!;
    const at = itemPoint(bowl);
    state.character.body = { ...state.character.body, x: at.x + 1, y: at.y };
    expect(shotFace(state, { item: bowl.id })).toEqual({ x: -1, y: 0 });
    expect(shotFace(state, { item: 9999 })).toBeNull();
    expect(shotFace(state, { object: "nothing" })).toBeNull();
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
    // Пише в той самий об'єкт.
    const same = { x: 0, y: 0 };
    expect(glideOffset(same, target, 1 / 60, same)).toBe(same);
    expect(same.x).toBeGreaterThan(0);
  });
});
