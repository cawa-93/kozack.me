// Звуки дому (§11.4а, `audio/SOUND.md`, «Хто що озвучує», рядок `home`): кожна подія групи звучить наявними разовими звуками в місці, яке
// знаходить `soundPoint`; петлі техніки й мух з'являються й зникають разом зі станом.

import { describe, expect, it } from "vitest";

import { group } from "../src/audio/sfx/groups/home";
import { soundPoint } from "../src/audio/sfx/place";
import type { Cue } from "../src/audio/sfx/types";
import { HOUSEHOLD, LITTER_CAPACITY, NOISE } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import type { BowlItem, Dish, GameState, LitterItem } from "../src/sim/types";
import { eventBubbles } from "../src/view/symbols";
import { EVENTS as BUBBLE_EVENTS } from "./bubblecases";

const bowl = (id: number, slot: string): BowlItem => ({ id, kind: "bowl", quality: "cheap", slot, food: 0, foodQuality: null, sterile: false });
const litter = (id: number, slot: string, quality: LitterItem["quality"], uses = 0): LitterItem => ({ id, kind: "litter", quality, slot, litter: "cheap", uses });
const meal: Dish = { kind: "meal", quality: "cheap" };

/** Мінімальна квартира з речами, на які посилаються події: миски, лоток, пилосос, робот, уламки. */
function home(): GameState {
  const state = newGame({ seed: 1, address: "she", difficulty: "normal" }).current;
  state.home.items.push(bowl(3, "bowl-1"), bowl(4, "bowl-2"), litter(5, "litter-1", "cheap"));
  state.home.appliances = { fountain: null, robot: "cheap", vacuum: "cheap" };
  state.home.messes.push({ id: 90, kind: "broken", x: 12.5, y: 7.5, cat: null });
  return state;
}

/** Усі події групи `home` з `audio/SOUND.md`. */
const EVENTS: readonly GameEvent[] = [
  { type: "took", object: "fridge", item: { kind: "raw", quality: "cheap" } },
  { type: "took", object: "cat-cabinet", item: { kind: "catfood", quality: "cheap", sterile: false } },
  { type: "took", object: "stove", item: meal },
  { type: "put", object: "fridge", item: { kind: "raw", quality: "cheap" } },
  { type: "put", object: "sterile-bin", item: { kind: "catfood", quality: "cheap", sterile: true } },
  { type: "put", object: "table", item: meal },
  { type: "put", object: "counter-left", item: meal },
  { type: "thing-moved", stage: "taken", item: bowl(3, "bowl-1") },
  { type: "thing-moved", stage: "put", item: bowl(3, "bowl-3") },
  { type: "trashed", item: meal },
  { type: "discarded", item: bowl(7, "bowl-4") },
  { type: "discarded", item: { id: 8, kind: "toy", quality: "cheap", x: 5.5, y: 7.5, uses: 0 } },
  { type: "unpacked", moved: [{ product: "food", amount: 4 }] },
  { type: "received", deliveries: [{ id: 1, quality: "cheap", at: 0, product: "food" }] },
  { type: "supply-landed", product: "food" },
  { type: "supply-landed", product: "detergent" },
  { type: "supply-landed", product: "treats" },
  { type: "doorbell" },
  { type: "doorbell", delivery: { id: 2, quality: "cheap", at: 0, thing: "bowl" } },
  { type: "carrier-opened", cats: 2 },
  { type: "cooked", result: "ready" },
  { type: "cooked", result: "burnt" },
  { type: "laundry", stage: "cat", cat: 1 },
  { type: "laundry", stage: "started" },
  { type: "laundry", stage: "spin" },
  { type: "laundry", stage: "done" },
  { type: "laundry", stage: "hung" },
  { type: "vacuum", stage: "taken" },
  { type: "vacuum", stage: "put" },
  { type: "robot" },
  { type: "broke", what: "bowl" },
  { type: "broke", what: "carrier" },
  { type: "broke", what: "robot" },
  { type: "modifier", kind: "guests", value: -2, guests: { mess: true, hissed: false, delighted: false } },
  { type: "modifier", kind: "inspection", value: 100, paid: 100 },
  { type: "modifier", kind: "home-vet", value: 1 },
  { type: "modifier", kind: "cleaner", value: 3 },
  { type: "modifier", kind: "mom-food", value: 1 },
  { type: "modifier", kind: "fireworks", value: 0 },
];

/** Події дому без звуку (`audio/SOUND.md`, «Без звуку»): звук лише засмічував; дріт звучить, поки його лагодять, а не по завершенні. */
const SILENT: readonly GameEvent[] = [
  { type: "wire-fixed" },
  { type: "vacuumed", by: "person", tufts: [0], dust: [], messes: [] },
  { type: "vacuumed", by: "robot", tufts: [], dust: [1], messes: [] },
  { type: "feeder", bowls: [3, 4] },
  { type: "feeder-emptied", item: 3, products: ["catFood"] },
  { type: "modifier", kind: "mom-food", value: 0 },
];

const cues = (event: GameEvent, state = home()): readonly Cue[] => group.onEvent?.(event, state) ?? [];
const loops = (state: GameState): string[] => (group.loops?.(state) ?? []).map((loop) => loop.sound);

describe("звуки дому (§11.4а)", () => {
  it("кожна подія групи звучить разовими звуками групи, і в кожного є місце в квартирі", () => {
    for (const event of EVENTS) {
      const state = home();
      const list = cues(event, state);
      const where = JSON.stringify(event);
      expect(list.length, where).toBeGreaterThan(0);
      for (const cue of list) {
        const def = group.sounds[cue.sound];
        expect(def, `${where}: ${cue.sound}`).toBeDefined();
        expect(def?.loop, `${where}: ${cue.sound} — петля, а не разовий`).toBeFalsy();
        expect(soundPoint(state, cue.at), `${where}: ${cue.sound} без місця`).not.toBeNull();
      }
    }
  });

  it("без звуку: втягнуте пилососом, автогодівниця, пакет мами під дверима", () => {
    for (const event of SILENT) expect(cues(event), JSON.stringify(event)).toEqual([]);
  });

  it("кожен бабл вголос над річчю з подій дому звучить (§11.4), крім беззвучних", () => {
    // Модифікатори діляться між групами за видом (`meeting-start` — робота).
    const kind = (e: GameEvent): string => (e.type === "modifier" ? `modifier:${e.kind}` : e.type);
    const mine = new Set(EVENTS.map(kind));
    for (const event of SILENT) mine.delete(kind(event));
    for (const event of BUBBLE_EVENTS) {
      if (!mine.has(kind(event)) || !eventBubbles(event).some((b) => b.kind === "say" && b.at !== "person" && !b.at.startsWith("cat:"))) continue;
      expect(cues(event).length, JSON.stringify(event)).toBeGreaterThan(0);
    }
  });

  it("чужі події й модифікатори без звуку дому мовчать", () => {
    const others: GameEvent[] = [
      { type: "meow", cat: 1 },
      { type: "ate", satiety: 10, food: 1 },
      { type: "cleaned", what: "litter", sanity: -1 },
      { type: "modifier", kind: "guests-away", value: 0 },
      { type: "modifier", kind: "meeting-start", value: 0 },
      { type: "modifier", kind: "mom-call", value: 0 },
    ];
    for (const event of others) expect(cues(event), JSON.stringify(event)).toEqual([]);
  });

  it("холодильник — дверцята зачинили, шафка — дверцята, страва — тихо", () => {
    expect(cues(EVENTS[0]!).map((c) => c.sound)).toEqual(["fridge-close"]);
    expect(cues(EVENTS[1]!).map((c) => c.sound)).toEqual(["cabinet"]);
    expect(cues(EVENTS[2]!).map((c) => c.sound)).toEqual(["dish-pick"]);
    expect(cues(EVENTS[5]!).map((c) => c.sound)).toEqual(["dish-put"]);
  });

  it("віник тихий: без пилососа (чи без світла) узяти й поставити — без звуку", () => {
    const state = home();
    state.home.appliances.vacuum = null;
    expect(cues({ type: "vacuum", stage: "taken" }, state)).toEqual([]);
    expect(cues({ type: "vacuum", stage: "put" }, state)).toEqual([]);
    const outage = home();
    outage.modifiers.day = "outage";
    expect(cues({ type: "vacuum", stage: "taken" }, outage)).toEqual([]);
  });

  it("уламки звучать там, де лягли", () => {
    const state = home();
    expect(cues({ type: "broke", what: "litter" }, state)[0]?.at).toEqual({ x: 12.5, y: 7.5 });
  });
});

describe("петлі дому (§11.4а)", () => {
  it("на старті тихо", () => {
    expect(loops(home())).toEqual([]);
  });

  it("плита булькає, поки страва на вогні, і стихає, коли підгоріла чи її зняли", () => {
    const state = home();
    state.home.stove.item = { kind: "raw", quality: "cheap" };
    expect(loops(state)).toEqual(["stove-loop"]);
    state.home.stove.item = meal;
    expect(loops(state)).toEqual(["stove-loop"]);
    state.home.stove.item = { kind: "burnt", quality: "cheap" };
    expect(loops(state)).toEqual([]);
    state.home.stove.item = null;
    expect(loops(state)).toEqual([]);
  });

  it("пральна пере, наприкінці віджимає, без світла й після прання мовчить", () => {
    const state = home();
    state.home.washer = { state: "washing", minutes: HOUSEHOLD.washMinutes, quality: "cheap" };
    expect(loops(state)).toEqual(["wash-loop"]);
    state.home.washer.minutes = NOISE.spinMinutes;
    expect(loops(state)).toEqual(["spin-loop"]);
    state.modifiers.day = "outage";
    expect(loops(state)).toEqual([]);
    state.modifiers.day = null;
    state.home.washer.state = "done";
    expect(loops(state)).toEqual([]);
  });

  it("пилосос гуде, поки в руках; віник — ні", () => {
    const state = home();
    state.character.held = { kind: "vacuum" };
    expect(loops(state)).toEqual(["vacuum-loop"]);
    state.home.appliances.vacuum = null;
    expect(loops(state)).toEqual([]);
    state.character.held = null;
    state.home.appliances.vacuum = "cheap";
    expect(loops(state)).toEqual([]);
  });

  it("робот звучить, поки їде маршрутом, і там, де він є; дорогий — тихіше", () => {
    const state = home();
    state.minute = HOUSEHOLD.robotMinute + 5;
    const [cheap] = group.loops?.(state) ?? [];
    expect(cheap?.sound).toBe("robot-loop");
    expect(soundPoint(state, cheap?.at)).not.toBeNull();
    const cheapGain = cheap?.gain ?? 1;
    state.home.appliances.robot = "premium";
    expect((group.loops?.(state) ?? [])[0]?.gain).toBeLessThan(cheapGain);
    state.minute = HOUSEHOLD.robotMinute - 5;
    expect(loops(state)).toEqual([]);
  });

  it("мухи гудуть над брудним лотком, найближчим до персонажа, і зникають, коли його почистили", () => {
    const state = home();
    const box = state.home.items.find((i): i is LitterItem => i.kind === "litter")!;
    box.uses = LITTER_CAPACITY.cheap;
    const far = litter(6, "litter-5", "cheap", LITTER_CAPACITY.cheap);
    state.home.items.push(far);
    state.character.body.x = 8.5;
    state.character.body.y = 4;
    const [flies] = group.loops?.(state) ?? [];
    expect(flies?.sound).toBe("flies-loop");
    expect(flies?.at).toEqual({ x: 8.5, y: 3.5 });
    box.uses = 0;
    far.uses = 0;
    expect(loops(state)).toEqual([]);
  });

  it("кілька станів звучать разом, кожен своїм ключем", () => {
    const state = home();
    state.home.stove.item = { kind: "raw", quality: "cheap" };
    state.home.washer = { state: "washing", minutes: HOUSEHOLD.washMinutes, quality: "cheap" };
    state.character.held = { kind: "vacuum" };
    const keys = (group.loops?.(state) ?? []).map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["stove", "washer", "vacuum"]);
    for (const sound of loops(state)) expect(group.sounds[sound]?.loop, sound).toBe(true);
  });

  it("дріт звучить, поки його лагодять: стрічка з першої миті, далі смуга за смугою; відпустили — мовчить", () => {
    const state = home();
    group.reset?.();
    state.character.activity = { kind: "use", target: "computer", progress: 0 };
    const heard: string[] = [];
    for (let t = 0; t < 7000; t += 16) {
      for (const cue of group.tick?.(state, 16) ?? []) heard.push(`${t}:${cue.sound}`);
      if (state.character.activity.kind === "use") state.character.activity.progress += 0.034;
    }
    expect(heard[0]).toMatch(/^(0|16):wire$/);
    expect(heard.length).toBeGreaterThanOrEqual(3);
    const paused = heard.length;
    for (let t = 0; t < 5000; t += 16) for (const cue of group.tick?.(state, 16) ?? []) heard.push(cue.sound);
    expect(heard.length).toBe(paused);
    state.character.activity = null;
    expect(group.tick?.(state, 16)).toEqual([]);
  });
});
