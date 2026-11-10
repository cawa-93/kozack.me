// Речі, які ставить гра (§8.7, «Що ставить гра»): сховище, ящики біля входу, переноска, велика коробка й база нового робота стають
// на своє місце, а зайняте — на найближчу вільну клітинку, яку видно; річ гравця лишається. Зсунуте, крім бази робота, вночі
// вертається, якщо місце звільнилося; зникле забуває зсув. Кіт, чия клітинка зайнята, бере найближчу вільну поруч.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, startAmbush } from "../src/sim/catai";
import { addSupply } from "../src/sim/economy";
import { advance, goToSleep, newGame } from "../src/sim/game";
import {
  blocksPerson,
  BIG_BOX_SCRATCH,
  CARRIER_SPOT,
  catSpotNear,
  COOL_TILE,
  distanceToRect,
  hiddenTile,
  isPresent,
  isSolid,
  MAP_HEIGHT,
  MAP_WIDTH,
  nearestFreePlace,
  objectAt,
  objectById,
  objectsOf,
  OBJECTS,
  PLACES,
  placedObject,
  ROBOT_DOCK,
  robotDockAt,
  SPAWN,
  thingHome,
  thingPresent,
  thingShift,
  withThing,
} from "../src/sim/home";
import { createRng } from "../src/sim/rng";
import { restoreThings } from "../src/sim/settle";
import { addCat } from "../src/sim/night";
import type { BowlItem, Cat, GameState, GameThing, Product, Save, Vec } from "../src/sim/types";
import { hours } from "./helpers";
import { isoObjectLook, placedObjectLook } from "../src/view/world/objects";

function game(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
}

const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const center = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });
const placeAt = (t: Vec): string => {
  const place = PLACES.find((p) => p.x === t.x && p.y === t.y);
  if (!place) throw new Error(`Клітинка ${t.x},${t.y} — не для речей`);
  return place.id;
};
const isPlace = (t: Vec): boolean => PLACES.some((p) => p.x === t.x && p.y === t.y);

/** Поставити миску гравця на клітинку `t`. */
function bowlAt(state: GameState, t: Vec): BowlItem {
  const bowl: BowlItem = { id: state.nextId++, kind: "bowl", quality: "cheap", slot: placeAt(t), food: 0, foodQuality: null, sterile: false };
  state.home.items.push(bowl);
  return bowl;
}

/** Де річ гри стоїть зараз: своє місце плюс зсув. */
const tileNow = (state: GameState, thing: GameThing): Vec => {
  const home = thingHome(thing);
  const shift = thingShift(state, thing);
  return { x: home.x + shift.x, y: home.y + shift.y };
};

/** Клітинки, куди персонаж дійде від ліжка. */
function reachable(state: GameState): Set<string> {
  const key = (t: Vec): string => `${t.x},${t.y}`;
  const start = tileOf(SPAWN);
  const seen = new Set([key(start)]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: t.x + dx, y: t.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= MAP_WIDTH || next.y >= MAP_HEIGHT || seen.has(key(next)) || blocksPerson(state, next.x, next.y)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** Сховища й запас, з яким кожне з'являється (§6.4). */
const STORAGES: readonly [GameThing, Product][] = [
  ["cat-cabinet", "catFood"],
  ["litter-bag", "litter"],
  ["sterile-bin", "sterileFood"],
  ["cat-kit", "pills"],
];

/** Сусіди клітинки, які теж зайняти, щоб найближча вільна була там, де стояти не можна (біля меблів, під стіною). */
const CROWD: Record<string, readonly Vec[]> = {
  "cat-cabinet": [{ x: 17, y: 3 }],
  "litter-bag": [{ x: 4, y: 6 }, { x: 5, y: 7 }],
  "sterile-bin": [{ x: 17, y: 6 }, { x: 18, y: 7 }],
  "cat-kit": [{ x: 12, y: 6 }, { x: 14, y: 6 }, { x: 13, y: 7 }],
};

describe("що ставить гра: сховища (§8.7, «Що ставить гра»)", () => {
  it("своє місце вільне — сховище там, без зсуву", () => {
    for (const [id, product] of STORAGES) {
      const save = game();
      const state = save.current;
      expect(thingPresent(state, id), id).toBe(false);
      addSupply(state, product, "cheap", 1);
      advance(save, 1);
      expect(thingPresent(state, id), id).toBe(true);
      expect(thingShift(state, id), id).toEqual({ x: 0, y: 0 });
      expect(placedObject(state, id), id).toEqual(objectById(id));
      const home = thingHome(id);
      expect(isSolid(state, home.x, home.y), id).toBe(true);
    }
  });

  for (const crowded of [false, true]) {
    it(`своє місце зайняте річчю гравця${crowded ? " (і сусідні теж)" : ""} — сховище на найближчій вільній клітинці, яку видно; річ лишається`, () => {
      for (const [id, product] of STORAGES) {
        const save = game();
        const state = save.current;
        const home = thingHome(id);
        const bowl = bowlAt(state, home);
        if (crowded) for (const t of CROWD[id] ?? []) bowlAt(state, t);
        const before = reachable(state);
        addSupply(state, product, "cheap", 1);
        advance(save, 1);

        expect(bowl.slot, id).toBe(placeAt(home));
        const tile = tileNow(state, id);
        expect(tile, id).not.toEqual(home);
        expect(isPlace(tile), `${id}: ${tile.x},${tile.y}`).toBe(true);
        expect(hiddenTile(tile.x, tile.y), id).toBe(false);
        expect(state.home.items.some((i) => "slot" in i && i.slot === placeAt(tile)), id).toBe(false);

        // Там тепер сховище: тверде, ціль і перешкода, а на своєму місці його немає.
        expect(isSolid(state, tile.x, tile.y), id).toBe(true);
        expect(isSolid(state, home.x, home.y), id).toBe(false);
        expect(placedObject(state, id), id).toMatchObject({ id, x: tile.x, y: tile.y });
        expect(objectsOf(state).find((o) => o.id === id), id).toMatchObject({ x: tile.x, y: tile.y });
        expect(objectAt(state, tile.x, tile.y)?.id, id).toBe(id);
        expect(objectAt(state, home.x, home.y), id).toBeNull();
        expect(nearestFreePlace(state, center(tile))?.id, id).not.toBe(placeAt(tile));

        // Прохід і підступ до меблів не перекрито: куди персонаж доходив, туди й доходить, крім самої клітинки сховища.
        const after = reachable(state);
        for (const t of before) if (t !== `${tile.x},${tile.y}`) expect(after.has(t), `${id}: ${t}`).toBe(true);
        for (const o of OBJECTS.filter((o) => o.interactive && o.id !== id && isPresent(state, o))) {
          expect(distanceToRect(center(tile), placedObject(state, o.id)), `${id} біля ${o.id}`).toBeGreaterThan(0.5);
        }
        // Перед ним можна стати: місце персонажа — разом зі сховищем, на прохідній клітинці, куди він дійде.
        const use = placedObjectLook(state, id).use;
        const own = isoObjectLook(id).use;
        expect(use && own && { x: use.at.x - own.at.x, y: use.at.y - own.at.y }, id).toEqual({ x: tile.x - home.x, y: tile.y - home.y });
        const stand = use ? tileOf(use.at) : null;
        expect(stand !== null && !blocksPerson(state, stand.x, stand.y) && after.has(`${stand.x},${stand.y}`), id).toBe(true);
      }
    });
  }

  it("слід сховища для порядку малювання — там, де воно стоїть", () => {
    const save = game();
    const state = save.current;
    bowlAt(state, thingHome("cat-cabinet"));
    addSupply(state, "catFood", "cheap", 1);
    advance(save, 1);
    const shift = thingShift(state, "cat-cabinet");
    expect(shift).not.toEqual({ x: 0, y: 0 });
    const own = isoObjectLook("cat-cabinet").footprint;
    expect(placedObjectLook(state, "cat-cabinet").footprint).toEqual({ x0: own.x0 + shift.x, y0: own.y0 + shift.y, x1: own.x1 + shift.x, y1: own.y1 + shift.y });
    // Меблі не зсуваються.
    expect(placedObjectLook(state, "fridge")).toEqual(isoObjectLook("fridge"));
  });

  it("уранці зсунуте вертається, якщо місце звільнилося, а ні — лишається", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("cat-cabinet");
    const bowl = bowlAt(state, home);
    addSupply(state, "catFood", "cheap", 1);
    advance(save, 1);
    const moved = tileNow(state, "cat-cabinet");
    expect(moved).not.toEqual(home);
    restoreThings(state);
    expect(tileNow(state, "cat-cabinet")).toEqual(moved);

    state.home.items = state.home.items.filter((i) => i !== bowl);
    state.minute = hours(23);
    goToSleep(save);
    expect(save.current.home.displaced?.["cat-cabinet"]).toBeUndefined();
    expect(tileNow(save.current, "cat-cabinet")).toEqual(home);
    expect(objectAt(save.current, home.x, home.y)?.id).toBe("cat-cabinet");
  });
});

describe("що ставить гра: ящики, переноска, велика коробка, база робота (§8.7)", () => {
  it("ящики біля входу: з'явилися на зайнятому місці — поруч; зникли — забули зсув; з'явилися знову — на своєму місці", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("boxes");
    const bowl = bowlAt(state, home);
    state.home.boxes = { catFood: { cheap: 1, premium: 0 } };
    advance(save, 1);
    const tile = tileNow(state, "boxes");
    expect(tile).not.toEqual(home);
    expect(blocksPerson(state, tile.x, tile.y)).toBe(true);
    expect(blocksPerson(state, home.x, home.y)).toBe(false);
    expect(placedObject(state, "boxes")).toMatchObject({ x: tile.x, y: tile.y });

    state.home.boxes = {};
    advance(save, 1);
    expect(state.home.displaced?.boxes).toBeUndefined();
    state.home.items = state.home.items.filter((i) => i !== bowl);
    state.home.boxes = { catFood: { cheap: 1, premium: 0 } };
    advance(save, 1);
    expect(tileNow(state, "boxes")).toEqual(home);
  });

  it("переноска: місце зайняте — поруч, на вільній клітинці, яку видно; персонажу не заступає дорогу", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("carrier");
    expect(home).toEqual(tileOf(CARRIER_SPOT));
    bowlAt(state, home);
    state.home.carriers.push({ quality: "cheap", wear: 0 });
    advance(save, 1);
    const at = withThing(state, "carrier", CARRIER_SPOT);
    const tile = tileOf(at);
    expect(tile).not.toEqual(home);
    expect(isPlace(tile)).toBe(true);
    expect(hiddenTile(tile.x, tile.y)).toBe(false);
    expect(isSolid(state, tile.x, tile.y)).toBe(false);
    // Та сама точка на новій клітинці, і на неї речей не ставлять.
    expect({ x: at.x - tile.x, y: at.y - tile.y }).toEqual({ x: CARRIER_SPOT.x - home.x, y: CARRIER_SPOT.y - home.y });
    expect(nearestFreePlace(state, center(tile))?.id).not.toBe(placeAt(tile));
  });

  it("велика коробка: місце зайняте — поруч; тверда там, де стоїть", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("big-box");
    bowlAt(state, home);
    state.modifiers.day = "big-box";
    advance(save, 1);
    expect(thingPresent(state, "big-box")).toBe(true);
    const tile = tileNow(state, "big-box");
    expect(tile).not.toEqual(home);
    expect(isPlace(tile)).toBe(true);
    expect(isSolid(state, tile.x, tile.y)).toBe(true);
    expect(isSolid(state, home.x, home.y)).toBe(false);
  });

  it("база нового робота-пилососа: місце зайняте — на найближчій вільній клітинці, яку видно; річ лишається", () => {
    const save = game();
    const state = save.current;
    const home = tileOf(ROBOT_DOCK);
    const bowl = bowlAt(state, home);
    state.home.appliances.robot = "cheap";
    advance(save, 1);
    const dock = tileOf(robotDockAt(state));
    expect(dock).not.toEqual(home);
    expect(isPlace(dock)).toBe(true);
    expect(hiddenTile(dock.x, dock.y)).toBe(false);
    expect(bowl.slot).toBe(placeAt(home));
  });
});

describe("речі гри поруч зі своїм місцем і коти (§8.7, «Що ставить гра»)", () => {
  /** Зайняти річчю гравця всі клітинки ближче за `radius` до `home`, крім `except`. */
  function crowd(state: GameState, home: Vec, radius: number, except: Vec): void {
    for (const p of PLACES) {
      const near = Math.hypot(p.x - home.x, p.y - home.y) < radius;
      if (near && (p.x !== except.x || p.y !== except.y)) bowlAt(state, p);
    }
  }

  it("звідки кіт дере велику коробку, — прохідна підлога: коробка не стає так, що збоку диван чи стіна", () => {
    const save = game();
    const state = save.current;
    const home = thingHome("big-box");
    // Лишаємо вільною лише клітинку біля дивана: праворуч від неї — диван.
    crowd(state, home, 2.3, { x: 12, y: 10 });
    state.modifiers.day = "big-box";
    advance(save, 1);
    const tile = tileNow(state, "big-box");
    expect(tile).not.toEqual(home);
    const side = tileOf(withThing(state, "big-box", BIG_BOX_SCRATCH));
    expect(isSolid(state, side.x, side.y), `${side.x},${side.y}`).toBe(false);
  });

  it("кіт, що спить у ящиках чи переносці, уранці переїжджає разом із ними на їхнє місце", () => {
    for (const thing of ["boxes", "carrier"] as const) {
      const save = game();
      const state = save.current;
      const home = thingHome(thing);
      const bowl = bowlAt(state, home);
      if (thing === "boxes") state.home.boxes = { catFood: { cheap: 1, premium: 0 } };
      else state.home.carriers.push({ quality: "cheap", wear: 0 });
      advance(save, 1);
      const moved = tileNow(state, thing);
      expect(moved, thing).not.toEqual(home);
      const cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: moved.x + 0.4, y: moved.y + 0.6 } });
      cat.arrivedDay = -10;
      cat.act = { kind: "sleep", target: thing, goal: null, minutes: 600, elapsed: 0 };
      addCat(state, cat);
      state.home.items = state.home.items.filter((i) => i !== bowl);
      restoreThings(state);
      expect(tileNow(state, thing), thing).toEqual(home);
      expect({ x: cat.x, y: cat.y }, thing).toEqual({ x: expect.closeTo(home.x + 0.4), y: expect.closeTo(home.y + 0.6) });
    }
  });
});

describe("коти й зайняті клітинки (§8.7, «Що ставить гра»)", () => {
  it("вільна клітинка — та сама точка; зайнята річчю — та сама точка на найближчій вільній клітинці, яку видно", () => {
    const state = game().current;
    const p = { x: 15, y: 9 };
    expect(catSpotNear(state, p)).toEqual(p);
    bowlAt(state, p);
    const q = catSpotNear(state, p);
    const tile = tileOf(q);
    expect(tile).not.toEqual(p);
    expect({ x: q.x - tile.x, y: q.y - tile.y }).toEqual({ x: 0, y: 0 });
    expect(isPlace(tile)).toBe(true);
    expect(hiddenTile(tile.x, tile.y)).toBe(false);
    expect(Math.hypot(tile.x - p.x, tile.y - p.y)).toBeLessThanOrEqual(1.5);
    // Дробова частина точки лишається: кіт стає так само, лише на іншій клітинці.
    const r = catSpotNear(state, { x: 15.3, y: 9.7 });
    expect({ x: r.x - Math.floor(r.x), y: r.y - Math.floor(r.y) }).toEqual({ x: expect.closeTo(0.3), y: expect.closeTo(0.7) });
    // База робота теж займає клітинку.
    state.home.appliances.robot = "cheap";
    expect(tileOf(catSpotNear(state, ROBOT_DOCK))).not.toEqual(tileOf(ROBOT_DOCK));
  });

  it("засідка на клітинці з річчю — поруч, а не на речі", () => {
    const save = game();
    const state = save.current;
    const spot = { x: 15, y: 9 };
    bowlAt(state, spot);
    const cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: 15.5, y: 8.5 } });
    cat.arrivedDay = -10;
    addCat(state, cat);
    for (let seed = 0; seed < 20; seed++) {
      startAmbush(state, cat, createRng(seed));
      expect(cat.act.kind).toBe("ambush");
      const goal = cat.act.goal;
      expect(goal && tileOf(goal), `seed ${seed}`).not.toEqual(spot);
    }
  });

  it("прохолодна плитка з річчю — кіт лягає поруч, а не на річ", () => {
    let tile = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      const state = save.current;
      state.modifiers.day = "heat";
      bowlAt(state, COOL_TILE);
      const cat: Cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: 9.5, y: 7.5 } });
      cat.arrivedDay = -10;
      cat.act = idleAct(30);
      cat.traits = [{ group: "warmth", level: -2, seen: 0, known: false }];
      cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 100, attention: 10, play: 10 };
      addCat(state, cat);
      decide(state, cat, createRng(seed), { present: true });
      if (cat.act.target !== "tile") continue;
      tile += 1;
      expect(cat.act.goal && tileOf(cat.act.goal), `seed ${seed}`).not.toEqual(COOL_TILE);
    }
    expect(tile).toBeGreaterThan(0);
  });
});

