// Коти й речі гри не на своєму місці (§8.7, «Що ставить гра»): кіт іде туди, де річ стоїть зараз (`home.displaced`), а клітинку,
// де він щось робить сам (схованка, дряпання ящиків чи коробки), зайняту річчю гравця, міняє на найближчу вільну поруч.

import { describe, expect, it } from "vitest";

import { BIG_BOX_TARGET, inBigBox } from "../src/sim/bigbox";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, hideSpot, rugTile, startChew, startScratch, tickCats } from "../src/sim/catai";
import { addCarrier, releaseCats, seatCat, tickCaged } from "../src/sim/carriers";
import { addSupply } from "../src/sim/economy";
import { newGame } from "../src/sim/game";
import { BIG_BOX, BIG_BOX_SCRATCH, BOX_SCRATCH, CABINET_PAW, CARRIER_SPOT, CARRIER_TILE, PLACES, STASHES, thingHome } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import type { BowlItem, Cat, GameState, GameThing, Save, ToyItem, TraitLevel, Vec } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at: Vec = { x: 9.5, y: 7.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.health = 100;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const placeAt = (t: Vec): string => {
  const place = PLACES.find((p) => p.x === t.x && p.y === t.y);
  if (!place) throw new Error(`Клітинка ${t.x},${t.y} — не для речей`);
  return place.id;
};

/** Поставити миску гравця на клітинку `t`. */
function bowlAt(state: GameState, t: Vec): BowlItem {
  const bowl: BowlItem = { id: state.nextId++, kind: "bowl", quality: "cheap", slot: placeAt(t), food: 0, foodQuality: null, sterile: false };
  state.home.items.push(bowl);
  return bowl;
}

/** Зсунути річ гри на клітинку `to`. */
function displace(state: GameState, thing: GameThing, to: Vec): void {
  (state.home.displaced ??= {})[thing] = { ...to };
}

/** Точка `p`, прив'язана до речі гри, коли та стоїть на клітинці `to`. */
function moved(thing: GameThing, p: Vec, to: Vec): Vec {
  const home = thingHome(thing);
  return { x: p.x + to.x - home.x, y: p.y + to.y - home.y };
}

/** Зайнята річчю котячого кутка клітинка. */
const taken = (state: GameState, t: Vec): boolean =>
  state.home.items.some((i) => "slot" in i && PLACES.some((p) => p.id === i.slot && p.x === t.x && p.y === t.y));

/** Перший кидок, з яким `act` дає ціль `target`. */
function firstWith(cat: Cat, target: string, act: (seed: number) => void, seeds = 400): boolean {
  for (let seed = 1; seed <= seeds; seed++) {
    act(seed);
    if (cat.act.target === target) return true;
  }
  return false;
}

const BOXES_AT: Vec = { x: 6, y: 9 };
const BIG_BOX_AT: Vec = { x: 3, y: 9 };
const CARRIER_AT: Vec = { x: 3, y: 7 };
const CABINET_AT: Vec = { x: 16, y: 2 };

describe("схованки (§9.12, «Схованки»; §8.7)", () => {
  it("клітинку схованки за диваном зайняла річ — кіт заганяє іграшку з вільної клітинки поруч, а лягає вона туди ж", () => {
    const save = game();
    const state = save.current;
    bowlAt(state, STASHES.sofa.tile);
    const toy = state.home.items.find((i): i is ToyItem => i.kind === "toy");
    if (!toy) throw new Error("немає іграшки");
    Object.assign(toy, { x: 12.5, y: 8.5 });
    const cat = withCat(save, { gifts: 2 }, { x: 12.5, y: 8.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: null, minutes: 0.1, elapsed: 0, carry: "toy", dest: "sofa" };
    tickCats(state, 0.25, { present: true });
    expect(cat.act).toMatchObject({ kind: "carry", picked: true, dest: "sofa" });
    const goal = cat.act.goal;
    expect(goal).not.toBeNull();
    expect(tileOf(goal!)).not.toEqual(STASHES.sofa.tile);
    expect(taken(state, tileOf(goal!))).toBe(false);
    expect(Math.hypot(goal!.x - STASHES.sofa.tile.x, goal!.y - STASHES.sofa.tile.y)).toBeLessThanOrEqual(1.5);
    for (let i = 0; i < 80 && cat.act.kind === "carry"; i++) tickCats(state, 0.25, { present: true });
    expect(toy.hidden).toBe("sofa");
    expect({ x: toy.x, y: toy.y }).toEqual(STASHES.sofa.at);
  });

  it("ніс до ніг, а персонаж пішов — несе в схованку за диваном, на вільну клітинку поруч", () => {
    const save = game();
    const state = save.current;
    bowlAt(state, STASHES.sofa.tile);
    const toy = state.home.items.find((i): i is ToyItem => i.kind === "toy");
    if (!toy) throw new Error("немає іграшки");
    const cat = withCat(save, { playful: 2 }, { x: 12.5, y: 8.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: { x: 4, y: 8 }, minutes: 10, elapsed: 0, carry: "toy", dest: "feet", picked: true };
    tickCats(state, 0.25, { present: false });
    expect(cat.act.dest).toBe("sofa");
    expect(cat.act.goal && tileOf(cat.act.goal)).not.toEqual(STASHES.sofa.tile);
    expect(taken(state, tileOf(cat.act.goal!))).toBe(false);
  });
});

describe("ящики біля входу не на своєму місці (§6.4, §8.7)", () => {
  function boxed(): Save {
    const save = game();
    save.current.home.boxes = { food: { cheap: 2, premium: 0 } };
    displace(save.current, "boxes", BOXES_AT);
    return save;
  }

  it("допитливий спить у ящиках там, де купа стоїть", () => {
    const save = boxed();
    const cat = withCat(save, { curiosity: 2 });
    const found = firstWith(cat, "boxes", (seed) => {
      cat.act = idleAct(1);
      cat.needs.fatigue = 100;
      decide(save.current, cat, createRng(seed), { present: true });
    });
    expect(found).toBe(true);
    expect(cat.act.kind).toBe("sleep");
    expect(cat.act.goal).toEqual(BOXES_AT);
  });

  it("дере ящики збоку від того місця, де купа стоїть; зайнято — з вільної клітинки поруч", () => {
    const save = boxed();
    const cat = withCat(save, { scratching: -2 });
    const scratch = (seed: number): void => startScratch(save.current, cat, createRng(seed));
    expect(firstWith(cat, "boxes", scratch)).toBe(true);
    expect(cat.act.goal).toEqual(moved("boxes", BOX_SCRATCH, BOXES_AT));

    bowlAt(save.current, moved("boxes", BOX_SCRATCH, BOXES_AT));
    expect(firstWith(cat, "boxes", scratch)).toBe(true);
    const goal = tileOf(cat.act.goal!);
    expect(goal).not.toEqual(moved("boxes", BOX_SCRATCH, BOXES_AT));
    expect(goal).not.toEqual(BOXES_AT);
    expect(taken(save.current, goal)).toBe(false);
  });

  it("гризе пакети в ящиках збоку від того місця, де купа стоїть; зайнято — з вільної клітинки поруч", () => {
    const save = boxed();
    save.current.home.wireChewed = true;
    const cat = withCat(save, { chewing: 2 });
    expect(startChew(save.current, cat, createRng(1))).toBe(true);
    expect(cat.act).toMatchObject({ kind: "chew", target: "boxes", goal: moved("boxes", BOX_SCRATCH, BOXES_AT) });

    bowlAt(save.current, moved("boxes", BOX_SCRATCH, BOXES_AT));
    expect(startChew(save.current, cat, createRng(1))).toBe(true);
    const goal = tileOf(cat.act.goal!);
    expect(goal).not.toEqual(moved("boxes", BOX_SCRATCH, BOXES_AT));
    expect(goal).not.toEqual(BOXES_AT);
    expect(taken(save.current, goal)).toBe(false);
  });

  it("дере й гризе ящики обличчям до купи, з якого боку не стояв би", () => {
    for (const kind of ["scratch", "chew"] as const) {
      for (const [dx, facing] of [[1, -1], [-1, 1]] as const) {
        const save = boxed();
        save.current.home.wireChewed = true;
        const cat = withCat(save, { scratching: -2 }, { x: BOXES_AT.x + dx + 0.5, y: BOXES_AT.y + 0.5 });
        cat.act = { kind, target: "boxes", goal: null, minutes: 5, elapsed: 0 };
        tickCats(save.current, 0.25, { present: true });
        expect(cat.facing, `${kind} ${dx}`).toBe(facing);
      }
    }
  });
});

describe("велика коробка не на своєму місці (§4.1, §8.7)", () => {
  function bigBox(): Save {
    const save = game();
    save.current.modifiers.day = "big-box";
    displace(save.current, "big-box", BIG_BOX_AT);
    return save;
  }

  it("кіт у коробці — на її клітинці там, де вона стоїть, а не на її місці", () => {
    const state = bigBox().current;
    expect(inBigBox(state, { x: BIG_BOX_AT.x + 0.5, y: BIG_BOX_AT.y + 0.5 })).toBe(true);
    expect(inBigBox(state, { x: BIG_BOX.x + 0.5, y: BIG_BOX.y + 0.5 })).toBe(false);
  });

  it("ховається й спить у коробці там, де вона стоїть", () => {
    const save = bigBox();
    const cat = withCat(save);
    let found = false;
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const spot = hideSpot(save.current, createRng(seed), cat);
      if (spot.target !== BIG_BOX_TARGET) continue;
      found = true;
      expect(spot.at).toEqual(BIG_BOX_AT);
    }
    expect(found).toBe(true);
    expect(
      firstWith(cat, BIG_BOX_TARGET, (seed) => {
        cat.act = idleAct(1);
        cat.needs.fatigue = 100;
        decide(save.current, cat, createRng(seed), { present: true });
      }),
    ).toBe(true);
    expect(cat.act).toMatchObject({ kind: "sleep", goal: BIG_BOX_AT });
  });

  it("грається в коробці там, де вона стоїть", () => {
    const save = bigBox();
    const cat = withCat(save);
    const found = firstWith(cat, BIG_BOX_TARGET, (seed) => {
      cat.act = idleAct(1);
      cat.needs.play = 100;
      decide(save.current, cat, createRng(seed), { present: false });
    });
    expect(found).toBe(true);
    expect(cat.act).toMatchObject({ kind: "toy", goal: BIG_BOX_AT });
  });

  it("дере коробку збоку від того місця, де вона стоїть; зайнято — з вільної клітинки поруч", () => {
    const save = bigBox();
    const cat = withCat(save);
    const scratch = (seed: number): void => startScratch(save.current, cat, createRng(seed));
    expect(firstWith(cat, BIG_BOX_TARGET, scratch)).toBe(true);
    expect(cat.act.goal).toEqual(moved("big-box", BIG_BOX_SCRATCH, BIG_BOX_AT));

    bowlAt(save.current, moved("big-box", BIG_BOX_SCRATCH, BIG_BOX_AT));
    expect(firstWith(cat, BIG_BOX_TARGET, scratch)).toBe(true);
    const goal = tileOf(cat.act.goal!);
    expect(goal).not.toEqual(moved("big-box", BIG_BOX_SCRATCH, BIG_BOX_AT));
    expect(goal).not.toEqual(BIG_BOX_AT);
    expect(taken(save.current, goal)).toBe(false);
  });

  it("дере коробку обличчям до неї, з якого боку не стояв би", () => {
    for (const [dx, facing] of [[1, -1], [-1, 1]] as const) {
      const save = bigBox();
      const cat = withCat(save, {}, { x: BIG_BOX_AT.x + dx + 0.5, y: BIG_BOX_AT.y + 0.5 });
      cat.act = { kind: "scratch", target: BIG_BOX_TARGET, goal: null, minutes: 5, elapsed: 0 };
      tickCats(save.current, 0.25, { present: true });
      expect(cat.facing, `${dx}`).toBe(facing);
    }
  });

  it("на килимку не потягується там, де стоїть коробка", () => {
    const save = game();
    save.current.modifiers.day = "big-box";
    const onRug: Vec = { x: 10, y: 7 };
    displace(save.current, "big-box", onRug);
    for (let seed = 1; seed <= 200; seed++) expect(rugTile(save.current, createRng(seed)), `seed ${seed}`).not.toEqual(onRug);
  });
});

describe("шафка з кормом не на своєму місці (§9.12, «Кмітливість у бешкеті»; §8.7)", () => {
  it("кіт лапає шафку збоку від того місця, де вона стоїть", () => {
    const save = game();
    addSupply(save.current, "catFood", "cheap", 6);
    displace(save.current, "cat-cabinet", CABINET_AT);
    save.current.home.cabinetOpen = true;
    const cat = withCat(save);
    cat.needs.hunger = 90;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act).toMatchObject({ kind: "raid", target: "cabinet" });
    expect(cat.act.goal).toEqual(moved("cat-cabinet", CABINET_PAW, CABINET_AT));
    expect(cat.act.goal).not.toEqual(CABINET_PAW);
  });
});

describe("переноска не на своєму місці (§8.7)", () => {
  function carried(): Save {
    const save = game();
    addCarrier(save.current.home, "cheap");
    displace(save.current, "carrier", CARRIER_AT);
    return save;
  }

  it("«Пасажир першого класу» спить у переносці там, де вона стоїть", () => {
    const save = carried();
    const cat = withCat(save, { carrier: 2 });
    const found = firstWith(cat, "carrier", (seed) => {
      cat.act = idleAct(1);
      cat.needs.fatigue = 100;
      decide(save.current, cat, createRng(seed), { present: true });
    });
    expect(found).toBe(true);
    expect(cat.act).toMatchObject({ kind: "sleep", goal: moved("carrier", CARRIER_TILE, CARRIER_AT) });
  });

  it("переноска — ціль персонажа там, де вона стоїть", () => {
    const save = carried();
    const state = save.current;
    const cat = withCat(save);
    state.character.held = { kind: "cat", cat: cat.id };
    const at = moved("carrier", CARRIER_SPOT, CARRIER_AT);
    Object.assign(state.character.body, { x: at.x, y: at.y - 1, facing: { x: 0, y: 1 } });
    expect(targetOf(state)?.id).toBe("carrier");
    Object.assign(state.character.body, { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y - 1, facing: { x: 0, y: 1 } });
    expect(targetOf(state)?.id).not.toBe("carrier");
  });

  it("випущений кіт вилазить біля переноски там, де вона стоїть", () => {
    const save = carried();
    const state = save.current;
    const cat = withCat(save);
    state.character.held = { kind: "cat", cat: cat.id };
    expect(seatCat(state, cat)).toBe(true);
    releaseCats(state);
    const at = moved("carrier", CARRIER_SPOT, CARRIER_AT);
    expect(cat.away).toBeNull();
    expect(Math.hypot(cat.x - at.x, cat.y - at.y)).toBeLessThan(1.2);
  });

  it("зламана переноска лишає уламки там, де стояла", () => {
    const save = carried();
    const state = save.current;
    const cat = withCat(save);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
    state.character.held = { kind: "cat", cat: cat.id };
    expect(seatCat(state, cat)).toBe(true);
    const rng = createRng(1);
    for (let i = 0; i < 4000 && cat.away !== null; i++) tickCaged(state, cat, 1, rng, true);
    expect(state.home.carriers).toEqual([]);
    const shards = state.home.messes.find((m) => m.kind === "broken");
    const at = moved("carrier", CARRIER_SPOT, CARRIER_AT);
    expect(shards && { x: shards.x, y: shards.y }).toEqual({ x: at.x, y: expect.closeTo(at.y - 0.4) });
  });
});
