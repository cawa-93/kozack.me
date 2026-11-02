// Пилосос у руках (§8.7, «Пилосос у руках», рішення автора 2026-11-02): узяти й поставити будь-де, з ним у руках інших речей не
// взяти, гул (гучний звук щодесять хвилин) і здоровий глузд −0,2 за хвилину, прибирання сухого сміття в радіусі 1,5 клітинки,
// жмути шерсті на своїх місцях, старі збереження.

import { describe, expect, it } from "vitest";

import { dropEverything } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { VACUUM } from "../src/sim/config";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { CARRIER_TILE, hiddenTile, isSolid, isWall, itemPoint, LAUNDRY_BASKET, objectById, roomAt, slotById, VACUUM_HOME } from "../src/sim/home";
import { FUR_SPOTS, furVisible, putVacuumDown, ROBOT_DOCK, tickHousehold, tuftsOf } from "../src/sim/household";
import { answerCall } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import type { Cat, MessKind, Save, Vec } from "../src/sim/types";
import { PersonSwept } from "../src/view/iso/swept";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

/** Підійти до пилососа й узяти його коротким натисканням. */
function takeVacuum(save: Save): void {
  standAt(save, "vacuum");
  expect(targetOf(save.current)?.id).toBe("vacuum");
  interact(save);
  expect(save.current.character.held?.kind).toBe("vacuum");
}

/** Поставити персонажа в точку обличчям праворуч. */
function place(save: Save, at: Vec): void {
  const body = save.current.character.body;
  body.x = at.x;
  body.y = at.y;
  body.facing = { x: 1, y: 0 };
}

/** Несміливий кіт, що не спить (гучний звук його лякає, §9.12). */
function timidCat(save: Save, at: Vec): Cat {
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 20, at });
  cat.traits = [{ group: "bravery", level: -1, seen: 0, known: false }];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  cat.act = idleAct(30);
  return cat;
}

/**
 * Між точками стіна — як для руки (§10, `targets.ts`) і пилососа (`clearPath`): крок 0,1 клітинки, останній відрізок не
 * рахується (біля самої стіни можна).
 */
function wallBetween(a: Vec, b: Vec): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps;
    if (isWall(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t))) return true;
  }
  return false;
}

let messId = 900;
const mess = (save: Save, kind: MessKind, at: Vec): number => {
  const id = messId++;
  save.current.home.messes.push({ id, kind, x: at.x, y: at.y, cat: null });
  return id;
};

describe("пилосос у руках (§8.7, рішення автора 2026-11-02)", () => {
  it("на старті стоїть на підлозі там, де була шафа з пилососом, і ця клітинка тепер прохідна", () => {
    const state = game().current;
    expect(state.home.vacuumAt).toEqual(VACUUM_HOME);
    expect(state.character.held).toBeNull();
    expect(isSolid(state, 16, 10)).toBe(false);
    expect(() => objectById("vacuum")).toThrow();
  });

  it("коротким натисканням його беруть у руки й ставлять на підлогу будь-де; поставлений лишається там", () => {
    const save = game();
    const { events, stop } = recordEvents();
    takeVacuum(save);
    expect(save.current.home.vacuumAt).toBeNull();
    place(save, { x: 5.5, y: 8.5 });
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.vacuumAt).toEqual({ x: 6, y: 8.5 });
    expect(events.flatMap((e) => (e.type === "vacuum" ? [e.stage] : []))).toEqual(["taken", "put"]);
    // Узяти знову — там, де поставили.
    advance(save, 1);
    expect(save.current.home.vacuumAt).toEqual({ x: 6, y: 8.5 });
    takeVacuum(save);
  });

  it("на лоток чи миску пилосос не ставлять — він стає на вільну підлогу поруч, і його можна взяти знову", () => {
    const save = game();
    const litter = save.current.home.items.find((i) => i.kind === "litter");
    if (!litter || litter.kind !== "litter") throw new Error("немає лотка");
    const tile = slotById(litter.slot);
    takeVacuum(save);
    place(save, { x: tile.x, y: tile.y + 0.5 });
    interact(save);
    const at = save.current.home.vacuumAt;
    expect(at).not.toBeNull();
    expect([Math.floor(at!.x), Math.floor(at!.y)]).not.toEqual([tile.x, tile.y]);
    expect(save.current.home.items.some((i) => i.kind !== "toy" && slotById(i.slot).x === Math.floor(at!.x) && slotById(i.slot).y === Math.floor(at!.y))).toBe(false);
    takeVacuum(save);
  });

  it("з будь-якого місця й обличчям будь-куди стає в тій самій кімнаті, без стіни між ним і персонажем, не під ногами й не на речі (рецензія 2026-11-02)", () => {
    const save = game();
    const state = save.current;
    state.cats = [];
    state.home.carrier = "cheap";
    state.home.appliances.robot = "cheap";
    const tile = (p: Vec): string => `${Math.floor(p.x)},${Math.floor(p.y)}`;
    // Клітинки речей на підлозі: лотки, миски, переноска, база робота, кошик білизни.
    const taken = new Set([...state.home.items.map((i) => tile(itemPoint(i))), tile(CARRIER_TILE), tile(ROBOT_DOCK), tile(LAUNDRY_BASKET)]);
    const walkable = (x: number, y: number): boolean =>
      [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].every(([dx = 0, dy = 0]) => !isSolid(state, Math.floor(x + dx), Math.floor(y + dy)));
    const directions = Array.from({ length: 8 }, (_, a) => ({ x: Math.cos((a * Math.PI) / 4), y: Math.sin((a * Math.PI) / 4) }));
    const wrong: string[] = [];
    let total = 0;
    for (let y = 0.35; y < 12; y += 0.25) {
      for (let x = 0.35; x < 20; x += 0.25) {
        if (!walkable(x, y)) continue;
        for (const facing of directions) {
          total++;
          state.character.body.x = x;
          state.character.body.y = y;
          state.character.body.facing = { ...facing };
          state.character.held = { kind: "vacuum" };
          state.home.vacuumAt = null;
          putVacuumDown(state);
          const at = state.home.vacuumAt!;
          const body = { x, y };
          const rooms = [roomAt(body), roomAt(at)];
          const problems = [
            ...(wallBetween(body, at) ? ["стіна"] : []),
            ...(rooms[0] && rooms[1] && rooms[0] !== rooms[1] ? [`${rooms[0]} → ${rooms[1]}`] : []),
            ...(Math.hypot(at.x - x, at.y - y) < 0.45 ? ["під ногами"] : []),
            ...(isSolid(state, Math.floor(at.x), Math.floor(at.y)) || hiddenTile(Math.floor(at.x), Math.floor(at.y)) || taken.has(tile(at)) ? ["на речі чи за стіною"] : []),
          ];
          if (problems.length > 0) wrong.push(`(${x}, ${y}) → (${at.x.toFixed(2)}, ${at.y.toFixed(2)}): ${problems.join(", ")}`);
        }
      }
    }
    expect(total).toBeGreaterThan(10_000);
    expect(wrong).toEqual([]);
    // Приклади рецензії: ванна біля стіни зі спальнею й кухня біля стіни з вітальнею.
    for (const [x, y, fx, fy, room] of [[8.4, 4.4, -1, 0, "bathroom"], [13.4, 4.4, 0, 1, "kitchen"], [13.4, 4.4, -1, 0, "kitchen"]] as const) {
      state.character.body.x = x;
      state.character.body.y = y;
      state.character.body.facing = { x: fx, y: fy };
      state.character.held = { kind: "vacuum" };
      putVacuumDown(state);
      expect(roomAt(state.home.vacuumAt!)).toBe(room);
    }
  });

  it("з пилососом у руках інших речей не взяти, кота теж: натискання лише ставить пилосос", () => {
    const save = game();
    takeVacuum(save);
    standAt(save, "fridge");
    const food = { ...save.current.home.supplies.food };
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.supplies.food).toEqual(food);
    expect(save.current.home.vacuumAt).not.toBeNull();
    // З котом поруч — так само: кіт лишається на підлозі.
    takeVacuum(save);
    const cat = timidCat(save, { x: save.current.character.body.x + 0.5, y: save.current.character.body.y });
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0 };
    interact(save);
    expect(save.current.character.held).toBeNull();
  });

  it("з річчю в руках пилосос не ціль: його не взяти й він нічого не заступає", () => {
    const save = game();
    standAt(save, "vacuum");
    save.current.character.held = { kind: "raw", quality: "cheap" };
    expect(targetOf(save.current)?.id).not.toBe("vacuum");
  });

  it("з пилососом у руках утримання не прибирає руками; поставивши його, нова дія не почнеться, поки кнопку не відпустили (§10)", () => {
    const save = game();
    takeVacuum(save);
    const body = save.current.character.body;
    // Мокрий безлад пилосос не бере — його прибирають руками.
    mess(save, "vomit", { x: body.x - 0.5, y: body.y });
    body.facing = { x: -1, y: 0 };
    for (let i = 0; i < 10; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity).toBeNull();
    expect(save.current.home.messes).toHaveLength(1);
    // Натискання ставить пилосос; кнопку тримають далі — прибирання руками не починається.
    interact(save);
    expect(save.current.character.held).toBeNull();
    for (let i = 0; i < 10; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity).toBeNull();
    // Відпустили й знову тримають — тепер прибирають.
    advance(save, 0.1);
    advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity).toMatchObject({ kind: "use" });
  });

  it("прибирає сухе сміття в радіусі 1,5 клітинки; мокре й органічне — ні, далі — ні, крізь стіну — ні", () => {
    const save = game();
    takeVacuum(save);
    const at = { x: 9.5, y: 8.5 };
    place(save, at);
    const dry: MessKind[] = ["fur", "litter", "paper", "garbage", "broken"];
    const wet: MessKind[] = ["puddle", "vomit", "surprise", "hairball", "mark"];
    const near = dry.map((kind, i) => mess(save, kind, { x: at.x + 1.3 * Math.cos(i), y: at.y + 1.3 * Math.sin(i) }));
    const kept = [
      ...wet.map((kind, i) => mess(save, kind, { x: at.x + Math.cos(i + 0.5), y: at.y + Math.sin(i + 0.5) })),
      mess(save, "litter", { x: at.x + 1.7, y: at.y }),
    ];
    const { events, stop } = recordEvents();
    advance(save, 0.1);
    stop();
    expect(save.current.home.messes.map((m) => m.id).sort()).toEqual(kept.sort());
    expect(near.every((id) => !save.current.home.messes.some((m) => m.id === id))).toBe(true);
    const swept = events.find((e) => e.type === "vacuumed");
    expect(swept).toMatchObject({ by: "person", tufts: [] });
    expect(swept?.type === "vacuumed" && swept.messes.map((m) => m.kind).sort()).toEqual([...dry].sort());
    expect(swept?.type === "vacuumed" && swept.messes.map((m) => m.id).sort()).toEqual([...near].sort());
    // За стіною ряду 5 (у ванній) — ні, хоч і ближче за 1,5.
    place(save, { x: 8.5, y: 6.35 });
    const behind = mess(save, "paper", { x: 8.5, y: 4.9 });
    advance(save, 0.1);
    expect(save.current.home.messes.some((m) => m.id === behind)).toBe(true);
  });

  it("гуде: гучний звук, щойно взяли, і далі щодесять хвилин, поки в руках", () => {
    const save = game();
    standAt(save, "vacuum");
    const { events, stop } = recordEvents();
    const scared = (): number => events.filter((e) => e.type === "scared").length;
    timidCat(save, { x: 12.5, y: 8.5 });
    interact(save);
    expect(scared()).toBe(1);
    advance(save, 9);
    // Новий кіт, що не спить, — гул чути лише на десятій хвилині.
    timidCat(save, { x: 13.5, y: 8.5 });
    advance(save, 0.9);
    expect(scared()).toBe(1);
    advance(save, 0.2);
    expect(scared()).toBe(2);
    advance(save, 5);
    timidCat(save, { x: 14.5, y: 8.5 });
    advance(save, 4.8);
    expect(scared()).toBe(2);
    advance(save, 0.4);
    expect(scared()).toBe(3);
    // Поставили — більше не гуде.
    interact(save);
    timidCat(save, { x: 11.5, y: 8.5 });
    advance(save, 20);
    stop();
    expect(scared()).toBe(3);
  });

  it("неприємне: здоровий глузд −0,2 за хвилину, поки в руках (§8.1)", () => {
    const run = (vacuum: boolean): number => {
      const save = game();
      standAt(save, "vacuum");
      if (vacuum) interact(save);
      const before = save.current.character.stats.sanity;
      advance(save, 10);
      return save.current.character.stats.sanity - before;
    };
    expect(run(true) - run(false)).toBeCloseTo(VACUUM.sanityPerMinute * 10, 6);
    expect(VACUUM.sanityPerMinute * 10).toBeCloseTo(-2);
  });

  it("час із пилососом у руках — час на котів (§4.2)", () => {
    const save = game();
    takeVacuum(save);
    const cats = save.current.stats.minutes.cats;
    advance(save, 3, { move: { x: -1, y: 0 }, hold: false });
    expect(save.current.stats.minutes.cats - cats).toBeCloseTo(3);
  });

  it("засинаючи й відповідаючи мамі, пилосос ставлять на підлогу", () => {
    const save = game();
    takeVacuum(save);
    dropEverything(save.current);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.vacuumAt).not.toBeNull();
    takeVacuum(save);
    save.current.today.callPending = true;
    expect(answerCall(save.current)).toBe(true);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.vacuumAt).not.toBeNull();
  });
});

describe("жмути шерсті на своїх місцях (§8.7, рішення автора 2026-11-02)", () => {
  it("від 50 шерсті — шість жмутів на перших місцях; прибраний пилососом жмут знімає 1/12 шерсті, решта лежать і нижче 50", () => {
    const save = game();
    const state = save.current;
    state.home.fur = 49;
    tickHousehold(state, state.minute, 0.1);
    expect(tuftsOf(state)).toEqual([]);
    expect(furVisible(state)).toBe(false);
    state.home.fur = 55;
    tickHousehold(state, state.minute, 0.1);
    expect(tuftsOf(state)).toEqual([0, 1, 2, 3, 4, 5]);
    takeVacuum(save);
    // До першого жмута (вітальня, біля лівої стіни) — і лише до нього.
    const spot = FUR_SPOTS[0]!;
    place(save, { x: spot.x + 0.4, y: spot.y + 0.4 });
    const { events, stop } = recordEvents();
    advance(save, 0.1);
    stop();
    expect(tuftsOf(state)).toEqual([1, 2, 3, 4, 5]);
    expect(state.home.fur).toBeCloseTo(55 - 100 / 12, 1);
    expect(events.find((e) => e.type === "vacuumed")).toMatchObject({ by: "person", tufts: [0] });
    // Шерсті вже менше 50, а п'ять жмутів лежать, доки їх не приберуть, — і шкодять.
    expect(furVisible(state)).toBe(true);
    // Шерсть знову дійшла до 50 — жмут з'являється на першому вільному місці.
    interact(save);
    state.home.fur = 50;
    tickHousehold(state, state.minute, 0.1);
    expect(tuftsOf(state)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("у щітку втягується лише прибране пилососом у руках — не те, що о 12:00 прибрав робот (вигляд, PersonSwept; рецензія 2026-11-02)", () => {
    const save = game();
    const state = save.current;
    state.cats = [];
    state.home.appliances.robot = "cheap";
    state.home.fur = 100;
    tickHousehold(state, state.minute, 0.1);
    takeVacuum(save);
    place(save, FUR_SPOTS[0]!);
    state.minute = hours(12) - 1;
    const { events, stop } = recordEvents();
    advance(save, 6);
    stop();
    const swept = new PersonSwept();
    for (const event of events) swept.onEvent(event);
    const robot = events.flatMap((e) => (e.type === "vacuumed" && e.by === "robot" ? e.tufts : []));
    // Робот за ці хвилини прибрав жмут біля бази (вітальня, праворуч), персонаж — лише той, біля якого стоїть.
    expect(robot).toContain(4);
    expect([...swept.tufts]).toEqual([0]);
    expect(robot.some((i) => swept.tufts.has(i))).toBe(false);
    swept.clear();
    expect(swept.tufts.size + swept.dust.size + swept.messes.size).toBe(0);
  });

  it("сто шерсті — усі дванадцять жмутів; прибравши всі, шерсті не лишається", () => {
    const save = game();
    const state = save.current;
    state.home.fur = 100;
    tickHousehold(state, state.minute, 0.1);
    expect(tuftsOf(state)).toHaveLength(FUR_SPOTS.length);
    takeVacuum(save);
    for (const spot of FUR_SPOTS) {
      place(save, spot);
      advance(save, 0.1);
    }
    expect(tuftsOf(state)).toEqual([]);
    expect(state.home.fur).toBeLessThan(1);
  });
});

describe("старі збереження (§8.7, рішення автора 2026-11-02)", () => {
  it("шафи з пилососом немає — пилосос стоїть на її місці, почате «пилососити» скасовано, жмути лягають на місця за шерстю", () => {
    const save = game();
    const home = save.current.home as Partial<typeof save.current.home>;
    delete home.vacuumAt;
    delete home.tufts;
    delete home.dust;
    delete home.dustClock;
    save.current.home.fur = 60;
    save.current.character.activity = { kind: "use", target: "vacuum", progress: 4 };
    const loaded = deserialize(serialize(save)).current;
    expect(loaded.home.vacuumAt).toEqual(VACUUM_HOME);
    expect(loaded.character.activity).toBeNull();
    expect(tuftsOf(loaded)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(loaded.home.fur).toBe(60);
  });

  it("пилосос, якого сценарій дав у руки, — у руках, а не ще й на підлозі", () => {
    const save = game();
    save.current.character.held = { kind: "vacuum" };
    const loaded = deserialize(serialize(save)).current;
    expect(loaded.home.vacuumAt).toBeNull();
  });
});
