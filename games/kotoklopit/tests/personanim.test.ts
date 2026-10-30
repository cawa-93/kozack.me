// Що грає персонаж нового вигляду (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): `personAnim` і разові анімації від подій
// `personEventAnim` (`src/view/anim/personanim.ts`), назви за групами N4a–N4b (`anim/ids.ts`).

import { describe, expect, it } from "vitest";

import { tap } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { STANDUP_MINUTE } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import type { GameEvent } from "../src/sim/events";
import { advance, newGame } from "../src/sim/game";
import { fallIllPerson } from "../src/sim/illness";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { collapseMinute } from "../src/sim/sleep";
import type { Save } from "../src/sim/types";
import { heldThing, inMeeting, personAnim, personEventAnim, type PersonLocal } from "../src/view/anim/personanim";
import { PERSON_ANIM_GROUPS, PERSON_ANIM_IDS, PERSON_BY_PROGRESS, PERSON_ONE_SHOT_MS, PERSON_OVERLAYS } from "../src/view/anim/ids";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

/** Понеділок першого тижня — робочий день. */
function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 9 }));
  save.current.minute = hours(11);
  save.current.character.body = { ...save.current.character.body, x: 9.5, y: 8.5, facing: { x: 1, y: 0 } };
  return save;
}

const still: PersonLocal = { moving: false, sleepiness: 0 };
const walking: PersonLocal = { moving: true, sleepiness: 0 };

describe("назви анімацій персонажа (`anim/ids.ts`)", () => {
  it("кожна назва — рівно в одній групі N4a–N4b; разові, накладки й за поступом — з цих назв", () => {
    const all = Object.values(PERSON_ANIM_GROUPS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(PERSON_ANIM_IDS).toEqual(all);
    for (const id of Object.keys(PERSON_ONE_SHOT_MS)) expect(all).toContain(id);
    for (const id of [...PERSON_OVERLAYS, ...PERSON_BY_PROGRESS]) expect(all).toContain(id);
  });
});

describe("основна анімація персонажа (`personAnim`)", () => {
  it("стоїть, іде, ривок; з травмою кульгає, виснажений плететься й стоїть зсутулившись, застуджений — хворий", () => {
    const save = game();
    const state = save.current;
    expect(personAnim(state, still)).toMatchObject({ anim: "idle", overlay: null, loop: true, view: "front", flip: false });
    expect(personAnim(state, walking).anim).toBe("walk");
    state.character.body.dash = 0.5;
    expect(personAnim(state, walking).anim).toBe("dash");
    state.character.body.dash = 0;
    fallIllPerson(state, "cold");
    expect(personAnim(state, still).anim).toBe("sick");
    expect(personAnim(state, walking).anim).toBe("walk");
    fallIllPerson(state, "injury");
    expect(personAnim(state, walking).anim).toBe("limp");
    fallIllPerson(state, "exhaustion");
    expect(personAnim(state, still).anim).toBe("exhausted");
    expect(personAnim(state, still).params.eyes).toBeGreaterThan(0);
  });

  it("оглушений — паморочиться; збій керування — паморочиться на ходу", () => {
    const save = game();
    const state = save.current;
    state.character.body.stun = 1;
    expect(personAnim(state, still).anim).toBe("dizzy");
    state.character.body.stun = 0;
    state.character.body.glitch = 1;
    expect(personAnim(state, walking).anim).toBe("dizzy");
    expect(personAnim(state, still).anim).toBe("idle");
  });

  it("за комп'ютером працює сидячи; на летучці о 10:00 і на важливій нараді — нарада", () => {
    const save = game();
    const state = save.current;
    state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
    expect(personAnim(state, still).anim).toBe("work");
    state.minute = STANDUP_MINUTE + 5;
    expect(inMeeting(state)).toBe(true);
    expect(personAnim(state, still).anim).toBe("meeting");
    state.minute = hours(14.5);
    expect(personAnim(state, still).anim).toBe("work");
    state.modifiers.day = "meeting";
    expect(personAnim(state, still).anim).toBe("meeting");
  });

  it("тривалі дії: їсть за столом, чистить лоток, прибирає, пилососить, лагодить дріт; у душі не видно; купає кота без накладки рук", () => {
    const save = game();
    const state = save.current;
    const use = (target: string, extra: { inside?: true; bath?: true } = {}): string => {
      state.character.activity = { kind: "use", target, progress: 0, ...extra };
      return personAnim(state, still).anim;
    };
    expect(use("table")).toBe("eat");
    expect(use("item:3")).toBe("litter");
    expect(use("mess:7")).toBe("clean");
    expect(use("vacuum")).toBe("vacuum");
    expect(use("computer")).toBe("fix");
    expect(personAnim(state, still).params.target).toBe("computer");
    use("shower", { inside: true });
    expect(personAnim(state, still).params.hidden).toBe(true);
    const cat = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(state, cat);
    state.character.held = { kind: "cat", cat: cat.id };
    expect(use("shower", { inside: true, bath: true })).toBe("bath");
    expect(personAnim(state, still)).toMatchObject({ overlay: null, params: { hidden: false, held: "cat" } });
  });

  it("гладить кота, грається вудочкою; кіт укусив — пестощів уже немає", () => {
    const save = game();
    const state = save.current;
    state.character.activity = { kind: "pet", cat: 5, minutes: 1 };
    expect(personAnim(state, still)).toMatchObject({ anim: "pet", params: { target: "cat:5" } });
    state.character.activity = { kind: "pet", cat: 5, minutes: 1, bitten: true };
    expect(personAnim(state, still).anim).toBe("idle");
    state.character.activity = { kind: "play", cat: 5, minutes: 1 };
    expect(personAnim(state, still).anim).toBe("rod");
    state.character.activity = { kind: "play", cat: 5, minutes: 1, done: true };
    expect(personAnim(state, still).anim).toBe("idle");
  });

  it("що в руках — накладка рук і гніздо: кіт, страва, судочок, совок, вудочка", () => {
    expect(heldThing(null)).toBeNull();
    expect(heldThing({ kind: "raw", quality: "cheap" })).toBe("raw");
    expect(heldThing({ kind: "meal", quality: "cheap" })).toBe("meal");
    expect(heldThing({ kind: "meal", quality: "cheap", mom: true })).toBe("mom-meal");
    expect(heldThing({ kind: "burnt", quality: "premium" })).toBe("burnt");
    expect(heldThing({ kind: "catfood", quality: "cheap", sterile: false })).toBe("scoop");
    expect(heldThing({ kind: "catfood", quality: "cheap", sterile: true })).toBe("sterile-scoop");
    expect(heldThing({ kind: "cat", cat: 1 })).toBe("cat");
    expect(heldThing({ kind: "toy", toy: { id: 1, kind: "toy", quality: "cheap", x: 0, y: 0, uses: 0 } })).toBe("rod");
    const save = game();
    const state = save.current;
    state.character.held = { kind: "meal", quality: "cheap" };
    expect(personAnim(state, walking)).toMatchObject({ anim: "walk", overlay: "carry", params: { held: "meal" } });
    state.character.held = { kind: "cat", cat: 1 };
    expect(personAnim(state, still)).toMatchObject({ anim: "idle", overlay: "holdCat", params: { held: "cat" } });
    state.character.body.dash = 0.5;
    expect(personAnim(state, walking)).toMatchObject({ anim: "dash", overlay: "holdCat" });
  });

  it("засинає в ліжку чи падає без сил — за поступом засинання, без повтору", () => {
    const save = game();
    const state = save.current;
    expect(personAnim(state, { moving: false, sleepiness: 0.4 })).toMatchObject({ anim: "fallAsleep", loop: false, params: { progress: 0.4, eyes: 0.4 } });
    expect(personAnim(state, { moving: false, sleepiness: 0.4, collapsed: true }).anim).toBe("collapse");
    state.minute = collapseMinute(state) - 0.01;
    expect(personAnim(state, { moving: false, sleepiness: 0.2 }).anim).toBe("collapse");
    expect(personAnim(state, still).params.progress).toBeNull();
  });

  it("дзвонить мама — телефон; у поїздці персонажа не видно", () => {
    const save = game();
    const state = save.current;
    state.today.callPending = true;
    expect(personAnim(state, still).anim).toBe("phone");
    delete state.today.callPending;
    state.trip = { destination: "vet" } as unknown as typeof state.trip;
    expect(personAnim(state, still).params.hidden).toBe(true);
  });

  it("ракурс за `body.facing` у 4 ізометричних напрямах і з гістерезисом на діагоналі", () => {
    const save = game();
    const body = save.current.character.body;
    const facing = (x: number, y: number, prev: PersonLocal["prev"] = null): unknown => {
      body.facing = { x, y };
      const { view, flip } = personAnim(save.current, { ...still, prev });
      return { view, flip };
    };
    expect(facing(1, 0)).toEqual({ view: "front", flip: false });
    expect(facing(0, 1)).toEqual({ view: "front", flip: true });
    expect(facing(-1, 0)).toEqual({ view: "back", flip: true });
    expect(facing(0, -1)).toEqual({ view: "back", flip: false });
    const d = Math.SQRT1_2;
    expect(facing(d, -d, { view: "back", flip: false })).toEqual({ view: "back", flip: false });
    expect(facing(d, -d, { view: "front", flip: false })).toEqual({ view: "front", flip: false });
  });

  it("брудний одяг — плями й запах", () => {
    const save = game();
    save.current.home.clothes = 0;
    expect(personAnim(save.current, still).params.dirty).toBe(true);
  });
});

describe("разові анімації персонажа (`personEventAnim`)", () => {
  it("кожна подія — своя разова анімація з тривалістю з `PERSON_ONE_SHOT_MS`; подія не про рух — нічого", () => {
    const cases: [GameEvent, string | null][] = [
      [{ type: "took", object: "fridge", item: { kind: "raw", quality: "cheap" } }, "take"],
      [{ type: "put", object: "stove", item: { kind: "raw", quality: "cheap" } }, "put"],
      [{ type: "trashed", item: { kind: "burnt", quality: "cheap" } }, "trash"],
      [{ type: "fed", item: 1, food: 2 }, "bowl"],
      [{ type: "watered", item: 1 }, "bowl"],
      [{ type: "tap-opened", cat: 1 }, "tap"],
      [{ type: "person-meds", quality: "cheap" }, "meds"],
      [{ type: "medicine", cat: 1, medicine: "pills", quality: "cheap" }, "meds"],
      [{ type: "laundry", stage: "started" }, "washer"],
      [{ type: "laundry", stage: "spin" }, null],
      [{ type: "unpacked", moved: [] }, "unpack"],
      [{ type: "received", deliveries: [] }, "door"],
      [{ type: "cat-returned", cat: 1, caught: true }, "door"],
      [{ type: "picked-up", cat: 1, offended: false }, "pickUp"],
      [{ type: "put-down", cat: 1 }, "putDown"],
      [{ type: "bite", cat: 1 }, "bitten"],
      [{ type: "tripped", cat: 1 }, "trip"],
      [{ type: "ambushed", cat: 1 }, "trip"],
      [{ type: "slipped", mess: 1 }, "slip"],
      [{ type: "refused", object: "fridge", reason: "hands-full" }, "refuse"],
      [{ type: "cooked", result: "ready" }, null],
      [{ type: "dash" }, null],
    ];
    for (const [event, anim] of cases) {
      const shot = personEventAnim(event);
      if (anim === null) expect(shot, event.type).toBeNull();
      else expect(shot, event.type).toEqual({ anim, ms: PERSON_ONE_SHOT_MS[anim as keyof typeof PERSON_ONE_SHOT_MS] });
    }
  });

  it("готування: поклав сире на плиту, плита готує сама, узяв готове — лише «поклав» і «взяв»", () => {
    const save = game();
    addSupply(save.current, "food", "cheap", 2);
    const { events, stop } = recordEvents();
    standAt(save, "fridge");
    tap(save.current);
    standAt(save, "stove");
    tap(save.current);
    advance(save, 40);
    standAt(save, "stove");
    tap(save.current);
    stop();
    const shots = events.map((e) => personEventAnim(e)).filter((s) => s !== null);
    expect(shots.map((s) => s.anim)).toEqual(["take", "put", "take"]);
  });

  it("разом з котом: узяв на руки й опустив", () => {
    const save = game();
    const cat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 3, at: { x: 10.2, y: 8.5 } });
    cat.act = idleAct(30);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
    addCat(save.current, cat);
    const { events, stop } = recordEvents();
    tap(save.current);
    tap(save.current);
    stop();
    expect(events.map((e) => personEventAnim(e)?.anim).filter((a) => a !== undefined)).toEqual(["pickUp", "putDown"]);
  });
});
