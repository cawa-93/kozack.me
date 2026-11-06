// Перестановка речей (§8.7): узяти річ у руки, поставити на вільну клітинку, що їде разом із річчю, як на це зважають коти.

import { describe, expect, it } from "vitest";

import { dropEverything } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { MOVING } from "../src/sim/config";
import { feederAt, freeSlots, ownedItems, place, settleFeeders, utilitiesDue } from "../src/sim/economy";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { itemPoint, itemTile, PLACES, roomAt, SLOTS } from "../src/sim/home";
import { clearPath, tickHousehold } from "../src/sim/household";
import { moveThing, thingSpot } from "../src/sim/moving";
import { addCat, giveStarterPack } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { itemTargetId, movableItem } from "../src/sim/targets";
import type { BowlItem, Cat, CatActKind, CarriedThing, Feeder, GameState, HomeItem, LitterItem, PlacedItem, Save, Vec, WaterItem } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

const item = <K extends HomeItem["kind"]>(state: GameState, kind: K): Extract<HomeItem, { kind: K }> => {
  const found = state.home.items.find((i) => i.kind === kind);
  if (!found) throw new Error(`Немає «${kind}»`);
  return found as Extract<HomeItem, { kind: K }>;
};

/** Стати поруч із річчю й узяти її кнопкою перестановки. */
function lift(save: Save, thing: PlacedItem): CarriedThing {
  standAt(save, itemTargetId(thing));
  expect(movableItem(save.current)?.id).toBe(thing.id);
  moveThing(save.current);
  const held = save.current.character.held;
  if (held?.kind !== "thing") throw new Error("Річ не в руках");
  return held;
}

/** Поставити персонажа в точку обличчям туди, куди треба. */
function stand(state: GameState, at: Vec, facing: Vec = { x: 1, y: 0 }): void {
  const { body } = state.character;
  body.x = at.x;
  body.y = at.y;
  body.facing = facing;
}

/** Кіт поруч із персонажем, що робить `kind` з річчю; `arrived` — уже дійшов. */
function catAt(save: Save, thing: PlacedItem, kind: CatActKind, arrived = true): Cat {
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 9.5, y: 8.5 } });
  addCat(save.current, cat);
  cat.arrivedDay = -10;
  cat.act = { kind, target: itemTargetId(thing), goal: arrived ? null : itemTile(thing), minutes: 30, elapsed: 0 };
  return cat;
}

function feederOver(state: GameState, bowl: BowlItem): Feeder {
  const feeder: Feeder = { slot: bowl.slot, quality: "premium", food: 5, foodQuality: "cheap", sterile: false };
  (state.home.feeders ??= []).push(feeder);
  return feeder;
}

/** Нова миска на вільному місці. */
function secondBowl(state: GameState): BowlItem {
  const bowl: BowlItem = { id: state.nextId++, kind: "bowl", quality: "cheap", slot: "bowl-2", food: 0, foodQuality: null, sterile: false };
  state.home.items.push(bowl);
  return bowl;
}

describe("взяти річ (§8.7)", () => {
  it("кнопка бере річ із квартири в руки", () => {
    const save = game();
    const box = item(save.current, "litter");
    const held = lift(save, box);
    expect(held.item.id).toBe(box.id);
    expect(save.current.home.items.some((i) => i.id === box.id)).toBe(false);
  });

  it("бере й будиночок із кігтеточкою, хоч цілями дії вони не бувають", () => {
    for (const kind of ["house", "scratcher"] as const) {
      const save = game();
      const id = save.current.nextId++;
      const thing: PlacedItem = { id, kind, quality: "cheap", slot: kind === "house" ? "house-3" : "scratcher-3" };
      save.current.home.items.push(thing);
      expect(lift(save, thing).item.kind).toBe(kind);
    }
  });

  it("іграшку й віник кнопка не бере, а далі від речі нічого не робить", () => {
    const save = game();
    const state = save.current;
    state.home.items = [{ id: 1, kind: "toy", quality: "cheap", x: 5.5, y: 8.5, uses: 0 }];
    state.home.vacuumAt = { x: 5.8, y: 8.5 };
    stand(state, { x: 5, y: 8.5 });
    const { events, stop } = recordEvents();
    moveThing(state);
    stop();
    expect(state.character.held).toBeNull();
    expect(events).toEqual([]);
  });

  it("з іншою річчю в руках — відмова «руки зайняті»", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    standAt(save, itemTargetId(bowl));
    state.character.held = { kind: "vacuum", minutes: 0 };
    const { events, stop } = recordEvents();
    moveThing(state);
    stop();
    expect(events).toContainEqual({ type: "refused", object: itemTargetId(bowl), reason: "hands-full" });
    expect(state.home.items).toContain(bowl);
  });

  it("під час тривалої дії й після кінця гри кнопка нічого не робить", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    standAt(save, itemTargetId(bowl));
    state.character.activity = { kind: "use", target: itemTargetId(bowl), progress: 0 };
    moveThing(state);
    expect(state.character.held).toBeNull();
    state.character.activity = null;
    state.character.body.stun = 1;
    moveThing(state);
    expect(state.character.held).toBeNull();
  });
});

describe("поставити річ (§8.7)", () => {
  it("річ стає на підсвічену клітинку, у її центрі", () => {
    const save = game();
    const state = save.current;
    lift(save, item(state, "litter"));
    stand(state, { x: 6.5, y: 8.5 });
    const spot = thingSpot(state);
    expect(spot?.id).toBe("floor-7-8");
    moveThing(state);
    const box = item(state, "litter");
    expect(box.slot).toBe("floor-7-8");
    expect(itemPoint(box)).toEqual({ x: 7.5, y: 8.5 });
    expect(state.character.held).toBeNull();
  });

  it("дія теж ставить річ: окрему кнопку шукати не треба", () => {
    const save = game();
    const state = save.current;
    lift(save, item(state, "water"));
    stand(state, { x: 6.5, y: 8.5 });
    interact(save);
    expect(item(state, "water").slot).toBe("floor-7-8");
  });

  it("корм, вода й стан лотка лишаються в речі", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "premium";
    const water = item(state, "water");
    water.water = 1;
    const box = item(state, "litter");
    box.uses = 3;
    const moved = [bowl, water, box].map((thing) => {
      lift(save, thing);
      stand(state, { x: 6.5, y: 8.5 });
      moveThing(state);
      stand(state, { x: 3.5, y: 7.5 });
      const now = state.home.items.find((i) => i.id === thing.id);
      if (!now) throw new Error("Річ зникла");
      return now;
    });
    expect((moved[0] as BowlItem).food).toBe(2);
    expect((moved[0] as BowlItem).foodQuality).toBe("premium");
    expect((moved[1] as WaterItem).water).toBe(1);
    expect((moved[2] as LitterItem).uses).toBe(3);
  });

  it("переставлена річ не стає новою для котів", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    state.home.fresh = [];
    lift(save, bowl);
    stand(state, { x: 6.5, y: 8.5 });
    moveThing(state);
    expect(state.home.fresh).toEqual([]);
  });

  it("поруч немає вільної клітинки — відмова, а річ лишається в руках", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    lift(save, bowl);
    state.home.messes = PLACES.map((p, id) => ({ id, kind: "litter", x: p.x + 0.5, y: p.y + 0.5, cat: null }));
    expect(thingSpot(state)).toBeNull();
    const { events, stop } = recordEvents();
    moveThing(state);
    stop();
    expect(events).toContainEqual({ type: "refused", object: itemTargetId(bowl), reason: "no-place" });
    expect(state.character.held?.kind).toBe("thing");
  });

  it("клітинка завжди поруч і не за стіною, хоч би де стояв персонаж і куди дивився", () => {
    const save = game();
    const state = save.current;
    state.home.items = [];
    state.home.feeders = [];
    const facings: Vec[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 0.7071, y: 0.7071 },
      { x: -0.7071, y: -0.7071 },
    ];
    for (const place of PLACES) {
      for (const facing of facings) {
        const at = { x: place.x + 0.5, y: place.y + 0.5 };
        stand(state, at, facing);
        const spot = thingSpot(state);
        if (!spot) throw new Error(`З ${place.id} поставити нікуди`);
        const center = { x: spot.x + 0.5, y: spot.y + 0.5 };
        expect(Math.hypot(center.x - at.x, center.y - at.y), place.id).toBeLessThanOrEqual(MOVING.reach);
        expect(clearPath(at, center), place.id).toBe(true);
      }
    }
  });

  it("кожну кімнату можна обставити: річ доходить із вітальні в спальню, ванну й кухню", () => {
    const save = game();
    const state = save.current;
    const box = item(state, "litter");
    const rooms = ["bedroom", "bathroom", "kitchen", "living"] as const;
    for (const room of rooms) {
      const target = PLACES.find((p) => roomAt({ x: p.x + 0.5, y: p.y + 0.5 }) === room && !state.home.items.some((i) => "slot" in i && i.slot === p.id));
      if (!target) throw new Error(`Немає місця: ${room}`);
      lift(save, state.home.items.find((i) => i.id === box.id) as PlacedItem);
      stand(state, { x: target.x - 0.1, y: target.y + 0.5 });
      moveThing(state);
      expect(roomAt(itemPoint(state.home.items.find((i) => i.id === box.id) as HomeItem))).toBe(room);
    }
  });
});

describe("автогодівниця (§8.7, §9.12)", () => {
  it("їде разом із мискою й не переходить до іншої, поки миска в руках", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    const other = secondBowl(state);
    feederOver(state, bowl);
    const held = lift(save, bowl);
    expect(held.feeder?.food).toBe(5);
    settleFeeders(state);
    tickHousehold(state, state.minute, 1);
    expect(feederAt(state, other.slot)).toBeNull();
    stand(state, { x: 6.5, y: 8.5 });
    moveThing(state);
    const moved = state.home.items.find((i) => i.id === bowl.id) as BowlItem;
    expect(feederAt(state, moved.slot)?.food).toBe(5);
    expect(state.home.feeders).toHaveLength(1);
  });

  it("чекає миску на переставленій клітинці, і нова миска стає саме туди", () => {
    const save = game();
    const state = save.current;
    state.home.items = state.home.items.filter((i) => i.kind !== "bowl");
    state.home.feeders = [{ slot: "floor-7-8", quality: "cheap", food: 0, foodQuality: null, sterile: false }];
    const bowl = place(state, "bowl", "cheap");
    expect(bowl).toMatchObject({ slot: "floor-7-8" });
  });
});

describe("коти (§8.7)", () => {
  for (const [name, kind, thing] of [
    ["їсть", "eat", "bowl"],
    ["п'є", "drink", "water"],
    ["у лотку", "toilet", "litter"],
    ["загрібає", "bury", "litter"],
  ] as const) {
    it(`кіт ${name} — річ не взяти`, () => {
      const save = game();
      const state = save.current;
      const target = item(state, thing);
      catAt(save, target, kind);
      standAt(save, itemTargetId(target));
      const { events, stop } = recordEvents();
      moveThing(state);
      stop();
      expect(events).toContainEqual({ type: "refused", object: itemTargetId(target), reason: "thing-busy" });
      expect(state.character.held).toBeNull();
      expect(state.home.items).toContain(target);
    });
  }

  for (const [name, kind, thing] of [
    ["спить у будиночку", "sleep", "house"],
    ["ховається в будиночку", "hide", "house"],
    ["дере кігтеточку", "scratch", "scratcher"],
  ] as const) {
    it(`кіт ${name} — річ не взяти`, () => {
      const save = game();
      const state = save.current;
      const target: PlacedItem = { id: state.nextId++, kind: thing, quality: "cheap", slot: thing === "house" ? "house-3" : "scratcher-3" };
      state.home.items.push(target);
      catAt(save, target, kind);
      standAt(save, itemTargetId(target));
      const { events, stop } = recordEvents();
      moveThing(state);
      stop();
      expect(events).toContainEqual({ type: "refused", object: itemTargetId(target), reason: "thing-busy" });
    });
  }

  it("хто йшов до речі чи просив біля неї, шукає інше, а не приходить на старе місце", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    const walking = catAt(save, bowl, "eat", false);
    const begging = catAt(save, bowl, "beg");
    const sniffing = catAt(save, bowl, "idle", false);
    sniffing.act.target = `sniff:${bowl.id}`;
    lift(save, bowl);
    for (const cat of [walking, begging, sniffing]) expect(cat.act).toEqual(idleAct());
  });

  it("чужих справ узята річ не перериває", () => {
    const save = game();
    const state = save.current;
    const eating = catAt(save, item(state, "bowl"), "eat");
    const act = eating.act;
    lift(save, item(state, "water"));
    expect(eating.act).toBe(act);
  });

  it("голодний кіт знаходить переставлену миску", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    lift(save, bowl);
    stand(state, { x: 6.5, y: 8.5 });
    moveThing(state);
    const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 7.5, y: 8.5 } });
    addCat(state, cat);
    cat.arrivedDay = -10;
    cat.act = idleAct();
    cat.needs.hunger = 90;
    for (let i = 0; i < 40 && item(state, "bowl").food === 2; i++) advance(save, 1);
    expect(item(state, "bowl").food).toBeLessThan(2);
  });
});

describe("річ у руках (§8.7)", () => {
  it("рахується в межі виду й у комунальних", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    feederOver(state, bowl);
    const free = freeSlots(state, "bowl");
    const due = utilitiesDue(state);
    lift(save, bowl);
    expect(freeSlots(state, "bowl")).toBe(free);
    expect(utilitiesDue(state)).toBe(due);
    expect(ownedItems(state).map((i) => i.id)).toContain(bowl.id);
  });

  it("притулок не дає другу, поки єдина миска в руках", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    lift(save, bowl);
    const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 7.5, y: 8.5 } });
    giveStarterPack(state, cat);
    expect(state.home.items.some((i) => i.kind === "bowl")).toBe(false);
  });

  it("лягаючи спати, персонаж ставить річ на вільну клітинку, разом із годівницею", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    feederOver(state, bowl);
    lift(save, bowl);
    stand(state, { x: 2.5, y: 2.5 });
    dropEverything(state);
    expect(state.character.held).toBeNull();
    const moved = state.home.items.find((i) => i.id === bowl.id) as BowlItem;
    expect(moved).toBeDefined();
    expect(roomAt(itemPoint(moved))).toBe("bedroom");
    expect(feederAt(state, moved.slot)?.food).toBe(5);
  });

  it("одне утримання — одна дія: поставивши річ біля кота, пестощі не починають", () => {
    const save = game();
    const state = save.current;
    lift(save, item(state, "water"));
    stand(state, { x: 6.5, y: 8.5 });
    const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 6.5, y: 8.9 } });
    addCat(state, cat);
    cat.arrivedDay = -10;
    cat.act = idleAct(60);
    interact(save);
    expect(state.character.held).toBeNull();
    for (let i = 0; i < 10; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(state.character.activity).toBeNull();
    advance(save, 0.5);
    advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(state.character.activity?.kind).toBe("pet");
  });

  it("зберігається разом із грою, і переставлена річ лишається на своїй клітинці", () => {
    const save = game();
    const state = save.current;
    const bowl = item(state, "bowl");
    feederOver(state, bowl);
    lift(save, bowl);
    const carried = deserialize(serialize(save));
    expect(carried?.current.character.held).toEqual(state.character.held);
    stand(state, { x: 6.5, y: 8.5 });
    moveThing(state);
    const restored = deserialize(serialize(save));
    expect(restored?.current.home.items.find((i) => i.id === bowl.id)).toMatchObject({ slot: "floor-7-8" });
  });

  it("місця магазину не змінюються: стартова річ стоїть там само", () => {
    const state = game().current;
    expect(item(state, "bowl").slot).toBe(SLOTS.find((s) => s.kind === "bowl")?.id);
  });
});
