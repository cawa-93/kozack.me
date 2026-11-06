// Будиночок як гніздо (§9.8): який будиночок стає гніздом, де спить мати, хто ще туди заходить, відмова гравцеві, поломка й кінець тижня.

import { describe, expect, it } from "vitest";

import { pickUpCat, putDownCat } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, hideSpot, tickCats } from "../src/sim/catai";
import { discard } from "../src/sim/economy";
import { deserialize, goToSleep, newGame, serialize } from "../src/sim/game";
import { itemPoint, itemTile } from "../src/sim/home";
import { moveThing } from "../src/sim/moving";
import { addCat } from "../src/sim/night";
import { giveBirth, isNest, motherNest, nestOf } from "../src/sim/reproduction";
import { createRng } from "../src/sim/rng";
import { itemTargetId } from "../src/sim/targets";
import type { Cat, GameState, HouseItem, Quality, Save } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 12 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

function house(state: GameState, quality: Quality, slot: string): HouseItem {
  const item: HouseItem = { id: state.nextId++, kind: "house", quality, slot };
  state.home.items.push(item);
  return item;
}

function adult(save: Save, sex: "female" | "male", at = { x: 9.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 21), { source: "shelter", ageWeeks: 3, sex, at });
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

/** Кішка, що народить цієї ночі. */
function pregnant(save: Save, at?: { x: number; y: number }): Cat {
  const mother = adult(save, "female", at);
  mother.pregnancy = { father: null, due: save.current.day + 1, known: false };
  return mother;
}

/** Пологи без решти ночі: кошенята вже серед котів. */
function birth(save: Save): Cat[] {
  const kittens = giveBirth(save.current, createRng(5));
  for (const kitten of kittens) addCat(save.current, kitten);
  return kittens;
}

const sleepingIn = (cat: Cat, item: HouseItem): void => {
  const at = itemPoint(item);
  cat.x = at.x;
  cat.y = at.y;
  cat.act = { kind: "sleep", target: itemTargetId(item), goal: null, minutes: 300, elapsed: 0 };
};

describe("який будиночок стає гніздом (§9.8)", () => {
  it("вільний будиночок — новонароджені лежать у ньому, і мати теж", () => {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    const mother = pregnant(save);
    const kittens = birth(save);
    expect(kittens.length).toBeGreaterThan(0);
    for (const kitten of kittens) {
      expect(nestOf(save.current, kitten)).toBe(nest);
      expect(kitten.act).toMatchObject({ kind: "sleep", target: itemTargetId(nest), goal: null });
      expect({ x: kitten.x, y: kitten.y }).toEqual(itemPoint(nest));
    }
    expect(mother.act).toMatchObject({ kind: "sleep", target: itemTargetId(nest), goal: null });
    expect({ x: mother.x, y: mother.y }).toEqual(itemPoint(nest));
  });

  it("будиночка немає — усе як раніше: на підлозі біля матері, без гнізда", () => {
    const save = game();
    const mother = pregnant(save);
    const kittens = birth(save);
    expect(kittens.every((k) => k.nest === undefined && k.act.target === null)).toBe(true);
    expect(kittens.every((k) => Math.hypot(k.x - mother.x, k.y - mother.y) < 1)).toBe(true);
    expect(mother.act.kind).not.toBe("sleep");
  });

  it("спершу дорогий, хоч би й далі; серед однакових — найближчий", () => {
    const near = game();
    house(near.current, "cheap", "house-3");
    const premium = house(near.current, "premium", "house-2");
    pregnant(near, { x: 5.5, y: 8.5 });
    expect(birth(near)[0]?.nest).toBe(premium.id);

    const same = game();
    const close = house(same.current, "cheap", "house-3");
    house(same.current, "cheap", "house-2");
    pregnant(same, { x: 5.5, y: 8.5 });
    expect(birth(same)[0]?.nest).toBe(close.id);
  });

  it("будиночок, де спить чи ховається інший кіт, не вільний, а де спить сама мати — вільний", () => {
    const save = game();
    const busy = house(save.current, "premium", "house-2");
    const free = house(save.current, "cheap", "house-3");
    const lodger = adult(save, "male");
    sleepingIn(lodger, busy);
    pregnant(save);
    expect(birth(save)[0]?.nest).toBe(free.id);

    const own = game();
    const only = house(own.current, "cheap", "house-3");
    sleepingIn(pregnant(own), only);
    expect(birth(own)[0]?.nest).toBe(only.id);
  });

  it("усі зайняті — гнізда немає", () => {
    const save = game();
    sleepingIn(adult(save, "male"), house(save.current, "cheap", "house-3"));
    pregnant(save);
    expect(birth(save).every((k) => k.nest === undefined)).toBe(true);
  });

  it("дві матері тієї ж ночі не ділять будиночок; другій без вільного — підлога", () => {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    const first = pregnant(save);
    const second = pregnant(save);
    const kittens = birth(save);
    expect(kittens.filter((k) => k.parents.mother === first.id).every((k) => k.nest === nest.id)).toBe(true);
    expect(kittens.filter((k) => k.parents.mother === second.id).every((k) => k.nest === undefined)).toBe(true);
  });

  it("хто лише йшов у будиночок, шукає інше", () => {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    const walker = adult(save, "male");
    walker.act = { kind: "sleep", target: itemTargetId(nest), goal: itemTile(nest), minutes: 300, elapsed: 0 };
    pregnant(save);
    expect(birth(save)[0]?.nest).toBe(nest.id);
    expect(walker.act.target).toBeNull();
  });

  it("мати в переносці лишається там, а кошенята все одно в гнізді", () => {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    const mother = pregnant(save);
    mother.away = "carrier";
    expect(birth(save)[0]?.nest).toBe(nest.id);
    expect(mother.away).toBe("carrier");
    expect(mother.act.target).not.toBe(itemTargetId(nest));
  });
});

describe("тиждень у гнізді (§9.8)", () => {
  function nested(): { save: Save; nest: HouseItem; mother: Cat; kittens: Cat[] } {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    house(save.current, "cheap", "house-2");
    const mother = pregnant(save);
    return { save, nest, mother, kittens: birth(save) };
  }

  it("мати спить і ховається лише в гнізді", () => {
    const { save, nest, mother } = nested();
    for (let seed = 0; seed < 60; seed++) {
      mother.act = idleAct();
      mother.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 100, attention: 0, play: 0 };
      decide(save.current, mother, createRng(seed), { present: true });
      expect(mother.act).toMatchObject({ kind: "sleep", target: itemTargetId(nest), goal: itemTile(nest) });
      expect(hideSpot(save.current, createRng(seed), mother).target).toBe(itemTargetId(nest));
    }
  });

  it("інші коти не обирають гніздо ні для сну, ні щоб сховатися; вільний будиночок поруч — обирають", () => {
    const { save, nest } = nested();
    const lodger = adult(save, "male");
    const targets = new Set<string | null>();
    for (let seed = 0; seed < 200; seed++) {
      lodger.act = idleAct();
      lodger.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 100, attention: 0, play: 0 };
      decide(save.current, lodger, createRng(seed), { present: true });
      targets.add(lodger.act.target);
      targets.add(hideSpot(save.current, createRng(seed), lodger).target);
      targets.add(hideSpot(save.current, createRng(seed)).target);
    }
    expect(targets.has(itemTargetId(nest))).toBe(false);
    expect([...targets].some((t) => t?.startsWith("item:"))).toBe(true);
  });

  it("мати вийшла — кошенята лишаються всередині й нічого не потребують", () => {
    const { save, nest, mother, kittens } = nested();
    mother.x = 15.5;
    mother.y = 8.5;
    mother.act = idleAct(30);
    tickCats(save.current, 10, { present: true });
    for (const kitten of kittens) {
      expect({ x: kitten.x, y: kitten.y }).toEqual(itemPoint(nest));
      expect(kitten.act.target).toBe(itemTargetId(nest));
      expect(kitten.needs.hunger).toBe(0);
    }
  });

  it("будиночок із кошенятами не взяти, хоч мати й вийшла", () => {
    const { save, nest, mother } = nested();
    mother.x = 15.5;
    mother.y = 8.5;
    mother.act = idleAct(30);
    standAt(save, itemTargetId(nest));
    const { events, stop } = recordEvents();
    moveThing(save.current);
    stop();
    expect(events).toContainEqual({ type: "refused", object: itemTargetId(nest), reason: "thing-busy" });
    expect(save.current.character.held).toBeNull();
  });

  it("кошеня взяли й поставили: лежить на підлозі, доки мати не засне, і повертається в гніздо", () => {
    const { save, nest, mother, kittens } = nested();
    const kitten = kittens[0];
    if (!kitten) throw new Error("немає кошеняти");
    mother.act = idleAct(30);
    pickUpCat(save.current, kitten);
    tickCats(save.current, 1, { present: true });
    putDownCat(save.current, kitten.id);
    tickCats(save.current, 1, { present: true });
    expect(kitten.act).toMatchObject({ kind: "sleep", target: null });
    expect({ x: kitten.x, y: kitten.y }).not.toEqual(itemPoint(nest));
    expect(isNest(save.current, nest)).toBe(true);

    sleepingIn(mother, nest);
    tickCats(save.current, 1, { present: true });
    expect(kitten.act).toMatchObject({ kind: "sleep", target: itemTargetId(nest) });
    expect({ x: kitten.x, y: kitten.y }).toEqual(itemPoint(nest));
  });

  it("будиночок викинули — кошенята біля матері, як без гнізда, а мати спить де хоче", () => {
    const { save, nest, mother, kittens } = nested();
    mother.x = 9.5;
    mother.y = 8.5;
    mother.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    expect(discard(save.current, nest.id)).toBe(true);
    tickCats(save.current, 1, { present: true });
    expect(motherNest(save.current, mother)).toBeNull();
    for (const kitten of kittens) {
      expect(kitten.act).toMatchObject({ kind: "sleep", target: null });
      expect(Math.hypot(kitten.x - mother.x, kitten.y - mother.y)).toBeLessThan(1);
    }
  });

  it("гніздо переживає збереження", () => {
    const { save, nest, kittens } = nested();
    const loaded = deserialize(serialize(save));
    const kitten = loaded?.current.cats.find((c) => c.id === kittens[0]?.id);
    if (!loaded || !kitten) throw new Error("не завантажилось");
    expect(nestOf(loaded.current, kitten)?.id).toBe(nest.id);
  });
});

describe("кінець тижня (§9.8)", () => {
  it("постаршавши, кошенята прокидаються й виходять, будиночок знову для всіх, мати спить де хоче", () => {
    const save = game();
    const nest = house(save.current, "cheap", "house-3");
    const mother = pregnant(save);
    const kittens = birth(save);
    const kitten = kittens[0];
    if (!kitten) throw new Error("немає кошеняти");
    // Сьома ніч від появи — ніч, коли кошеня старшає (`ageDue`).
    for (const k of kittens) k.arrivedDay = save.current.day + 1 - 7;
    save.current.minute = hours(23);
    goToSleep(save);
    expect(kitten.ageWeeks).toBe(1);
    expect(kitten.nest).toBeUndefined();
    expect(kitten.act.kind).toBe("idle");
    expect(isNest(save.current, nest)).toBe(false);
    expect(motherNest(save.current, mother)).toBeNull();
    const seen = new Set<string | null>();
    for (let seed = 0; seed < 200; seed++) seen.add(hideSpot(save.current, createRng(seed)).target);
    expect(seen.has(itemTargetId(nest))).toBe(true);
  });
});
