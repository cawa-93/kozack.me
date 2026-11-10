// Перестановка сховищ котячих запасів і переносок (§8.7, «Переставити річ», «Сховища й переноски»): їх беруть кнопкою
// перестановки, як базу робота, і ставлять туди, де їх видно, не перекривши проходу; гра їх на місце не повертає.

import { describe, expect, it } from "vitest";

import { dropEverything } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { addSupply } from "../src/sim/economy";
import { onEvent, type GameEvent } from "../src/sim/events";
import { advance, deserialize, goToSleep, newGame, serialize } from "../src/sim/game";
import {
  blocksPerson,
  CARRIER_SPOT,
  hiddenTile,
  isPresent,
  isSolid,
  isWall,
  MAP_HEIGHT,
  MAP_WIDTH,
  nearestFreePlace,
  objectById,
  objectsOf,
  PLACES,
  placedObject,
  robotDockAt,
  SPAWN,
  thingHome,
  thingPresent,
  withThing,
} from "../src/sim/home";
import { moveThing } from "../src/sim/moving";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import { WALL_HEIGHT, WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { wallsToFade } from "../src/view/iso/geometry";
import type { CarryThing, GameState, Product, Save, Vec } from "../src/sim/types";
import { carryIcon, STORAGE_ICONS, THING_ICONS } from "../src/view/symbols";
import { placedObjectLook } from "../src/view/world/objects";
import { hours } from "./helpers";

function game(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
}

const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const placeId = (t: Vec): string => {
  const place = PLACES.find((p) => p.x === t.x && p.y === t.y);
  if (!place) throw new Error(`Клітинка ${t.x},${t.y} — не для речей`);
  return place.id;
};

function stand(state: GameState, at: Vec, facing: Vec = { x: 1, y: 0 }): void {
  const { body } = state.character;
  body.x = at.x;
  body.y = at.y;
  body.facing = facing;
}

function bowlAt(state: GameState, t: Vec): void {
  state.home.items.push({ id: state.nextId++, kind: "bowl", quality: "cheap", slot: placeId(t), food: 0, foodQuality: null, sterile: false });
}

/** Сховища й запас, з яким кожне з'являється (§6.4). */
const STORAGES: readonly [Exclude<CarryThing, "carrier">, Product][] = [
  ["cat-cabinet", "catFood"],
  ["litter-bag", "litter"],
  ["sterile-bin", "sterileFood"],
  ["cat-kit", "pills"],
];

/** Де річ гри стоїть зараз: клітинка. */
function tileNow(state: GameState, thing: CarryThing): Vec {
  return thing === "carrier" ? tileOf(withThing(state, "carrier", CARRIER_SPOT)) : { x: placedObject(state, thing).x, y: placedObject(state, thing).y };
}

/** Стати на прохідну клітинку поруч із річчю обличчям до неї й натиснути кнопку перестановки. */
function lift(state: GameState, thing: CarryThing): void {
  const t = tileNow(state, thing);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) {
    const x = t.x + dx;
    const y = t.y + dy;
    if (isWall(x, y) || blocksPerson(state, x, y)) continue;
    stand(state, { x: x + 0.5 - dx * 0.2, y: y + 0.5 - dy * 0.2 }, { x: -dx, y: -dy });
    moveThing(state);
    return;
  }
  throw new Error(`Біля ${thing} ніде стати`);
}

/** Внутрішні стіни, що можуть закривати речі під собою (`wallsToFade`). */
const INNER = WALL_SEGMENTS.filter((w) => w.kind === "inner").map(({ rect: { x, y, w, h } }) => ({ x0: x, y0: y, x1: x + w, y1: y + h }));

/** Куди переставляємо: вітальня під лівим вікном, обличчям праворуч. */
const LEFT_OF_LIVING: Vec = { x: 3.5, y: 9.5 };

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

function events(run: () => void): GameEvent[] {
  const seen: GameEvent[] = [];
  const stop = onEvent((e) => seen.push(e));
  try {
    run();
  } finally {
    stop();
  }
  return seen;
}

describe("перестановка сховищ (§8.7, «Сховища й переноски»)", () => {
  it("сховище беруть кнопкою перестановки, на кнопці — його іконка, у квартирі його немає; ставлять — стоїть там, де стало", () => {
    for (const [id, product] of STORAGES) {
      const save = game();
      const state = save.current;
      addSupply(state, product, "cheap", 1);
      const home = thingHome(id);
      lift(state, id);
      expect(state.character.held, id).toEqual({ kind: "gameThing", thing: id });
      expect(carryIcon(state), id).toBe(STORAGE_ICONS[id]);
      expect(thingPresent(state, id), id).toBe(false);
      expect(isPresent(state, objectById(id)), id).toBe(false);
      expect(isSolid(state, home.x, home.y), id).toBe(false);
      expect(objectsOf(state).some((o) => o.id === id), id).toBe(false);

      stand(state, LEFT_OF_LIVING);
      moveThing(state);
      expect(state.character.held, id).toBeNull();
      expect(thingPresent(state, id), id).toBe(true);
      const tile = tileNow(state, id);
      expect(Math.hypot(tile.x + 0.5 - LEFT_OF_LIVING.x, tile.y + 0.5 - LEFT_OF_LIVING.y), id).toBeLessThan(2);
      expect(hiddenTile(tile.x, tile.y), id).toBe(false);
      expect(isSolid(state, tile.x, tile.y), id).toBe(true);
      expect(nearestFreePlace(state, { x: tile.x + 0.5, y: tile.y + 0.5 })?.id, id).not.toBe(placeId(tile));
      // Перед сховищем можна стати: місце персонажа — разом зі сховищем, туди він дійде.
      const use = placedObjectLook(state, id).use;
      const stand2 = use ? tileOf(use.at) : null;
      expect(stand2 !== null && reachable(state).has(`${stand2.x},${stand2.y}`), id).toBe(true);
    }
  });

  it("переставлене сховище вночі не повертається, і збереження його пам'ятає", () => {
    const save = game();
    const state = save.current;
    addSupply(state, "catFood", "cheap", 1);
    lift(state, "cat-cabinet");
    stand(state, LEFT_OF_LIVING);
    moveThing(state);
    const tile = tileNow(state, "cat-cabinet");
    expect(tile).not.toEqual(thingHome("cat-cabinet"));
    expect(tileNow(deserialize(serialize(save)).current, "cat-cabinet")).toEqual(tile);
    state.minute = hours(23);
    goToSleep(save);
    expect(tileNow(save.current, "cat-cabinet")).toEqual(tile);
  });

  it("сховище ставлять і під ближню стіну: у вітальні під плінтусом і в спальні під внутрішньою стіною — стіна згасає, а персонаж стає збоку", () => {
    for (const [id, product] of [["litter-bag", "litter"], ["cat-kit", "pills"], ["cat-cabinet", "catFood"]] as const) {
      for (const [at, facing, tile] of [
        [{ x: 5.5, y: 9.5 }, { x: 0, y: 1 }, { x: 5, y: 10 }],
        [{ x: 2.5, y: 3.4 }, { x: 0, y: 1 }, { x: 2, y: 4 }],
      ] as const) {
        const save = game();
        const state = save.current;
        addSupply(state, product, "cheap", 1);
        lift(state, id);
        stand(state, at, facing);
        moveThing(state);
        expect(state.character.held, id).toBeNull();
        expect(tileNow(state, id), `${id} → ${tile.x},${tile.y}`).toEqual(tile);
        // Місце персонажа — на сусідній прохідній клітинці, куди він дійде, обличчям до сховища.
        const use = placedObjectLook(state, id).use;
        expect(use, id).not.toBeNull();
        if (!use) continue;
        const stand2 = tileOf(use.at);
        expect(Math.abs(stand2.x - tile.x) + Math.abs(stand2.y - tile.y), `${id} ${tile.x},${tile.y}`).toBe(1);
        expect(reachable(state).has(`${stand2.x},${stand2.y}`), `${id} ${tile.x},${tile.y}`).toBe(true);
        expect(use.facing.x * (tile.x + 0.5 - use.at.x) + use.facing.y * (tile.y + 0.5 - use.at.y), id).toBeGreaterThan(0);
        // Внутрішня стіна перед сховищем згасає (персонаж відійшов, щоб не він її гасив).
        stand(state, { x: 9.5, y: 8.5 });
        const out: boolean[] = [];
        wallsToFade(state, INNER, WALL_HEIGHT.inner, out);
        expect(out.some(Boolean), `${id} ${tile.x},${tile.y}`).toBe(hiddenTile(tile.x, tile.y));
      }
    }
  });

  it("сховище не стає туди, звідки до сусіднього сховища вже не підійти", () => {
    const save = game();
    const state = save.current;
    for (const product of ["catFood", "sterileFood", "pills", "litter"] as const) addSupply(state, product, "cheap", 1);
    // Шафка на своєму місці (18, 3): праворуч стіна, ліворуч і ззаду — бак і аптечка; лишається лише клітинка перед нею.
    state.home.displaced = { "sterile-bin": { x: 17, y: 3 }, "cat-kit": { x: 18, y: 2 } };
    lift(state, "litter-bag");
    stand(state, { x: 17.5, y: 4.5 });
    moveThing(state);
    expect(state.character.held).toBeNull();
    expect(tileNow(state, "litter-bag")).not.toEqual({ x: 18, y: 4 });
  });

  it("сховище не стає так, що збоку від шафки — стіна, чи персонажу під ноги", () => {
    // Біля лівої стіни вітальні: ліворуч від шафки, звідки кіт її лапає, — стіна.
    const side = game();
    addSupply(side.current, "catFood", "cheap", 1);
    lift(side.current, "cat-cabinet");
    stand(side.current, { x: 2.5, y: 7.5 }, { x: -1, y: 0 });
    moveThing(side.current);
    const b = tileOf(withThing(side.current, "cat-cabinet", { x: 17, y: 3 }));
    expect(isWall(b.x, b.y) || isSolid(side.current, b.x, b.y), `${b.x},${b.y}`).toBe(false);

    // Попереду зайнято: найближча вільна — клітинка самого персонажа; туди сховище не стає.
    const feet = game();
    const s = feet.current;
    addSupply(s, "litter", "cheap", 1);
    lift(s, "litter-bag");
    bowlAt(s, { x: 4, y: 8 });
    stand(s, { x: 3.5, y: 8.5 });
    moveThing(s);
    expect(s.character.held).toBeNull();
    expect(tileNow(s, "litter-bag")).not.toEqual({ x: 3, y: 8 });
  });

  it("кіт на сховищі — не взяти, відмова; хто лапав шафку, шукає інше", () => {
    const save = game();
    const state = save.current;
    addSupply(state, "catFood", "cheap", 1);
    const home = thingHome("cat-cabinet");
    const cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: home.x + 0.5, y: home.y + 0.5 } });
    cat.arrivedDay = -10;
    cat.act = idleAct(30);
    addCat(state, cat);
    const seen = events(() => lift(state, "cat-cabinet"));
    expect(state.character.held).toBeNull();
    expect(seen.some((e) => e.type === "refused" && e.reason === "thing-busy")).toBe(true);

    cat.x = 15.5;
    cat.y = 3.5;
    cat.act = { kind: "raid", target: "cabinet", goal: { x: 17, y: 3 }, minutes: 5, elapsed: 0 };
    lift(state, "cat-cabinet");
    expect(state.character.held?.kind).toBe("gameThing");
    expect(cat.act.target).not.toBe("cabinet");
  });

  it("поки шафка в руках, корму з неї не взяти: біля її місця вона не ціль", () => {
    const save = game();
    const state = save.current;
    addSupply(state, "catFood", "cheap", 1);
    lift(state, "cat-cabinet");
    const home = thingHome("cat-cabinet");
    stand(state, { x: home.x + 0.5, y: home.y + 1.3 }, { x: 0, y: -1 });
    expect(targetOf(state)?.id).not.toBe("cat-cabinet");
  });

  it("лягаючи зі сховищем у руках, персонаж ставить його", () => {
    const save = game();
    const state = save.current;
    addSupply(state, "sterileFood", "cheap", 1);
    lift(state, "sterile-bin");
    expect(state.character.held?.kind).toBe("gameThing");
    stand(state, LEFT_OF_LIVING);
    dropEverything(state);
    expect(state.character.held).toBeNull();
    expect(thingPresent(state, "sterile-bin")).toBe(true);
    const tile = tileNow(state, "sterile-bin");
    expect(hiddenTile(tile.x, tile.y)).toBe(false);
    expect(Math.hypot(tile.x + 0.5 - LEFT_OF_LIVING.x, tile.y + 0.5 - LEFT_OF_LIVING.y)).toBeLessThan(2);
  });
});

describe("перестановка переносок (§8.7, «Сховища й переноски»)", () => {
  function withCarriers(count: number): Save {
    const save = game();
    for (let i = 0; i < count; i++) save.current.home.carriers.push({ quality: i === 0 ? "premium" : "cheap", wear: 0 });
    return save;
  }

  it("переноски беруть усі разом, на кнопці — переноска; ставлять — усі там", () => {
    const save = withCarriers(2);
    const state = save.current;
    lift(state, "carrier");
    expect(state.character.held).toEqual({ kind: "gameThing", thing: "carrier" });
    expect(carryIcon(state)).toBe(THING_ICONS.carrier);
    expect(thingPresent(state, "carrier")).toBe(false);
    expect(state.home.carriers).toHaveLength(2);
    stand(state, LEFT_OF_LIVING);
    moveThing(state);
    expect(state.character.held).toBeNull();
    expect(thingPresent(state, "carrier")).toBe(true);
    const tile = tileNow(state, "carrier");
    expect(tile).not.toEqual(thingHome("carrier"));
    expect(Math.hypot(tile.x + 0.5 - LEFT_OF_LIVING.x, tile.y + 0.5 - LEFT_OF_LIVING.y)).toBeLessThan(2);
    // Ціль переноски — там, де вона стоїть.
    expect(tileOf(withThing(state, "carrier", CARRIER_SPOT))).toEqual(tile);
  });

  it("переноски й базу робота ставлять і під ближню внутрішню стіну — стіна перед ними згасає", () => {
    const save = withCarriers(1);
    const state = save.current;
    state.home.appliances.robot = "cheap";
    lift(state, "carrier");
    stand(state, { x: 2.5, y: 3.4 }, { x: 0, y: 1 });
    moveThing(state);
    expect(tileNow(state, "carrier")).toEqual({ x: 2, y: 4 });
    stand(state, { x: 9.5, y: 8.5 });
    const out: boolean[] = [];
    wallsToFade(state, INNER, WALL_HEIGHT.inner, out);
    expect(out.some(Boolean)).toBe(true);

    const robot = withCarriers(0).current;
    robot.home.appliances.robot = "cheap";
    robot.minute = hours(9);
    const dock = robotDockAt(robot);
    stand(robot, { x: dock.x - 0.8, y: dock.y });
    moveThing(robot);
    expect(robot.character.held?.kind).toBe("robot");
    stand(robot, { x: 2.5, y: 3.4 }, { x: 0, y: 1 });
    moveThing(robot);
    expect(tileOf(robotDockAt(robot))).toEqual({ x: 2, y: 4 });
    stand(robot, { x: 9.5, y: 8.5 });
    wallsToFade(robot, INNER, WALL_HEIGHT.inner, out);
    expect(out.some(Boolean)).toBe(true);
  });

  it("кіт спить у переносці — не взяти, відмова", () => {
    const save = withCarriers(1);
    const state = save.current;
    const cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y - 0.4 } });
    cat.arrivedDay = -10;
    cat.act = { kind: "sleep", target: "carrier", goal: null, minutes: 300, elapsed: 0 };
    addCat(state, cat);
    const seen = events(() => lift(state, "carrier"));
    expect(state.character.held).toBeNull();
    expect(seen.some((e) => e.type === "refused" && e.reason === "thing-busy")).toBe(true);
  });

  it("переноски, яких не лишилося, з'являються знову там, де стояли; там річ — поруч", () => {
    const save = withCarriers(1);
    const state = save.current;
    lift(state, "carrier");
    stand(state, LEFT_OF_LIVING);
    moveThing(state);
    const tile = tileNow(state, "carrier");
    expect(tile).not.toEqual(thingHome("carrier"));
    state.home.carriers = [];
    advance(save, 1);
    state.home.carriers.push({ quality: "cheap", wear: 0 });
    advance(save, 1);
    expect(tileNow(state, "carrier")).toEqual(tile);
    // Уночі вона теж не вертається на своє старе місце біля дверей.
    state.minute = hours(23);
    goToSleep(save);
    expect(tileNow(save.current, "carrier")).toEqual(tile);

    const again = save.current;
    again.home.carriers = [];
    advance(save, 1);
    bowlAt(again, tile);
    again.home.carriers.push({ quality: "cheap", wear: 0 });
    advance(save, 1);
    const now = tileNow(again, "carrier");
    expect(now).not.toEqual(tile);
    expect(Math.hypot(now.x - tile.x, now.y - tile.y)).toBeLessThan(2);
  });
});
