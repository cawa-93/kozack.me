// Одне утримання — одна дія (§10, `CLAUDE.md` гри, «Код»): натискання, що змінило вміст рук, ще триває — і утримання тієї самої
// кнопки нову дію не починає, поки кнопку не відпустили. Виняток — вудка біля кота: утримання тут же починає гру (§10), хоч би
// вудку щойно взяли, хоч би натискання її не кинуло.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { advance, interact, newGame } from "../src/sim/game";
import { itemPoint } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { freshMeal } from "../src/sim/spoilage";
import { targetOf } from "../src/sim/targets";
import type { GameEvent } from "../src/sim/events";
import type { BowlItem, Cat, Item, Save, Vec } from "../src/sim/types";
import { hours, recordEvents, standAt, walkTo, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

/** Дорослий кіт без рис, що хоче уваги: пестощі з ним почалися б одразу. */
function catAt(save: Save, at: Vec): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.needs.attention = 80;
  addCat(save.current, cat);
  return cat;
}

/** Кіт просто перед персонажем: з порожніми руками він — ціль. */
function catAhead(save: Save): Cat {
  const { x, y, facing } = save.current.character.body;
  const cat = catAt(save, { x: x + facing.x * 0.45, y: y + facing.y * 0.45 });
  cat.act = idleAct(60);
  return cat;
}

const HOLD = { move: { x: 0, y: 0 }, hold: true };
/** Кадр при 60 кадрах на секунду, ігрові хвилини (2 хв/с). */
const FRAME = 2 / 60;

/** Тримати кнопку дії `minutes` ігрових хвилин кадрами; події за цей час. */
function keepHolding(save: Save, minutes: number): GameEvent[] {
  const { events, stop } = recordEvents();
  for (let t = 0; t < minutes; t += FRAME) advance(save, FRAME, HOLD);
  stop();
  return events;
}

/** Натиснути дію й тримати кнопку довше, ніж триває натискання. */
function tapAndHold(save: Save, minutes = 2): GameEvent[] {
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  return [...events, ...keepHolding(save, minutes)];
}

function holding(save: Save, item: Item): void {
  save.current.character.held = item;
}

describe("одне утримання — одна дія (§10)", () => {
  it("насипав корм — кіт, що просив, їсть, а утримання, що триває, його не гладить і від миски не відриває", () => {
    const save = game();
    const state = save.current;
    state.home.acquired.push("catFood");
    state.home.supplies.catFood.cheap = 5;
    const bowl = state.home.items.find((i) => i.kind === "bowl") as BowlItem;
    holding(save, { kind: "catfood", quality: "cheap", sterile: false });
    walkTo(save, `item:${bowl.id}`);
    const p = itemPoint(bowl);
    const cat = catAt(save, { x: p.x - 0.9, y: p.y + 0.3 });
    cat.needs.hunger = 70;
    cat.act = { kind: "beg", target: `item:${bowl.id}`, goal: null, minutes: 30, elapsed: 0 };
    expect(targetOf(state)?.id).toBe(`item:${bowl.id}`);
    const events = tapAndHold(save, 4);
    expect(bowl.food).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === "fed")).toHaveLength(1);
    expect(state.character.activity).toBeNull();
    expect(events.some((e) => e.type === "purr")).toBe(false);
    expect(cat.act.kind).toBe("eat");
  });

  const PUT: [string, () => Item, string][] = [
    ["корм — у шафку", () => ({ kind: "catfood", quality: "cheap", sterile: false }), "cat-cabinet"],
    ["підгорілу страву — у смітник", () => ({ kind: "burnt", quality: "cheap" }), "trash"],
    ["готову страву — на стіл", () => freshMeal(game().current, "cheap"), "table"],
    ["сиру порцію — на стільницю", () => ({ kind: "raw", quality: "cheap" }), "counter-right"],
  ];

  it.each(PUT)("поклав %s — утримання поруч із котом нічого не починає, а нове натискання — так", (_name, item, target) => {
    const save = game();
    const state = save.current;
    state.home.acquired.push("catFood");
    state.home.supplies.catFood.cheap = 5;
    holding(save, item());
    walkTo(save, target);
    interact(save);
    expect(state.character.held).toBeNull();
    catAhead(save);
    expect(targetOf(state)?.type).toBe("cat");
    const events = keepHolding(save, 2);
    expect(state.character.activity).toBeNull();
    expect(events.some((e) => e.type === "purr")).toBe(false);
    // Відпустили й натиснули знову — нова дія починається.
    advance(save, FRAME);
    advance(save, FRAME, HOLD);
    expect(state.character.activity).not.toBeNull();
  });

  it("узяв вудку біля кота — утримання, що триває, тут же починає гру; з вудкою в руках натискання біля кота її не кидає (§10)", () => {
    const save = game();
    const state = save.current;
    const toy = state.home.items.find((i) => i.kind === "toy");
    if (toy?.kind !== "toy") throw new Error("Немає іграшки");
    walkTo(save, `item:${toy.id}`);
    interact(save);
    expect(state.character.held?.kind).toBe("toy");
    const cat = catAhead(save);
    cat.needs.play = 80;
    expect(targetOf(state)?.type).toBe("cat");
    keepHolding(save, 1);
    expect(state.character.activity).toMatchObject({ kind: "play", cat: cat.id });
    // Відпустили — гра скінчилася; нове натискання біля кота вудку не кидає, і утримання знову грається.
    advance(save, FRAME);
    expect(state.character.activity).toBeNull();
    tapAndHold(save, 1);
    expect(state.character.held?.kind).toBe("toy");
    expect(state.character.activity).toMatchObject({ kind: "play", cat: cat.id });
  });

  it("кнопку відпустили на ходу — нове натискання й утримання біля страви на столі їсть", () => {
    const save = game();
    const state = save.current;
    state.home.surfaces["table"] = freshMeal(state, "cheap");
    const cat = catAhead(save);
    holding(save, { kind: "cat", cat: cat.id });
    interact(save);
    expect(state.character.held).toBeNull();
    // Відпустив кнопку й пішов до столу; дію натиснув ще на ходу, тоді зупинився.
    walkTo(save, "table");
    interact(save);
    keepHolding(save, 1);
    expect(state.character.activity).toMatchObject({ kind: "use", target: "table" });
  });
});

/** Утримання, що триває після натискання, біля кота нічого не починає; відпустили й натиснули знову — пестощі починаються. */
function holdStaysSpent(save: Save): void {
  const state = save.current;
  catAhead(save);
  expect(targetOf(state)?.type).toBe("cat");
  const events = keepHolding(save, 2);
  expect(state.character.activity).toBeNull();
  expect(events.some((e) => e.type === "purr")).toBe(false);
  advance(save, FRAME);
  advance(save, FRAME, HOLD);
  expect(state.character.activity).not.toBeNull();
}

describe("натискання, що щось зробило, не змінивши вмісту рук, — теж дія (§10)", () => {
  const DONE: [string, (save: Save) => void, GameEvent["type"]][] = [
    [
      "долив воду в поїлку",
      (save) => {
        const water = save.current.home.items.find((i) => i.kind === "water");
        if (water?.kind !== "water") throw new Error("Немає поїлки");
        water.water = 0;
        walkTo(save, `item:${water.id}`);
      },
      "watered",
    ],
    [
      "спорожнив годівницю",
      (save) => {
        const bowl = save.current.home.items.find((i) => i.kind === "bowl") as BowlItem;
        save.current.home.feeders = [{ slot: bowl.slot, quality: "cheap", food: 5, foodQuality: "cheap", sterile: false }];
        walkTo(save, `item:${bowl.id}`);
      },
      "feeder-emptied",
    ],
    [
      "відкрив кран котові на умивальнику",
      (save) => {
        standAt(save, "sink");
        const cat = catAt(save, { x: 11.5, y: 1.5 });
        cat.needs.thirst = 80;
        cat.act = { kind: "beg", target: "sink", goal: null, minutes: 30, elapsed: 0 };
      },
      "tap-opened",
    ],
    [
      "розвісив випране",
      (save) => {
        save.current.home.washer = { state: "done", minutes: 0, quality: "cheap" };
        standAt(save, "washer");
      },
      "laundry",
    ],
    [
      "упіймав кота на сходах",
      (save) => {
        catAt(save, { x: 10.5, y: 10.3 }).away = "stairs";
        standAt(save, "door");
      },
      "cat-returned",
    ],
    [
      "забрав пакунки під дверима",
      (save) => {
        save.current.home.porch.push({ id: 500, product: "food", quality: "cheap", at: 0 });
        standAt(save, "door");
      },
      "received",
    ],
    [
      "розклав покупки з ящиків",
      (save) => {
        save.current.home.boxes = { food: { cheap: 1, premium: 0 } };
        standAt(save, "boxes");
      },
      "unpacked",
    ],
    [
      "устав з-за комп'ютера натисканням",
      (save) => {
        standAt(save, "computer");
        interact(save);
        advance(save, 5);
        expect(save.current.character.activity?.kind).toBe("work");
      },
      "work-stopped",
    ],
    [
      "кіт-чистюля ухилився від брудного одягу",
      (save) => {
        save.current.home.clothes = 0;
        const cat = catAhead(save);
        cat.traits = [{ group: "litterPicky", level: 2, seen: 0, known: false }];
      },
      "cat-dodged",
    ],
  ];

  it.each(DONE)("%s — утримання, що триває, біля кота нічого не починає, а нове натискання — так", (_name, setup, done) => {
    const save = game();
    setup(save);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.map((e) => e.type)).toContain(done);
    expect(events.some((e) => e.type === "refused")).toBe(false);
    holdStaysSpent(save);
  });

  it("сів за комп'ютер, не відпускаючи кнопки, і встав рухом — утримання, що триває, біля кота нічого не починає", () => {
    const save = game();
    const state = save.current;
    standAt(save, "computer");
    interact(save);
    keepHolding(save, 5);
    expect(state.character.activity?.kind).toBe("work");
    const away = { x: -state.character.body.facing.x, y: -state.character.body.facing.y };
    for (let i = 0; i < 10; i++) advance(save, FRAME, { move: away, hold: true });
    expect(state.character.activity).toBeNull();
    holdStaysSpent(save);
  });

  // Ланцюжки «натиснув — і тримай»: натискання тут нічого не робить чи відмовляє, а утримання тієї самої кнопки починає дію.
  const CHAINS: [string, (save: Save) => void, string][] = [
    ["страва на столі — їсти", (save) => {
      save.current.home.surfaces["table"] = freshMeal(save.current, "cheap");
      standAt(save, "table");
    }, "table"],
    ["брудний лоток — чистити", (save) => {
      const litter = save.current.home.items.find((i) => i.kind === "litter");
      if (litter?.kind !== "litter") throw new Error("Немає лотка");
      litter.uses = 3;
      walkTo(save, `item:${litter.id}`);
    }, "item:"],
    ["перегризений дріт — лагодити", (save) => {
      save.current.home.wireChewed = true;
      standAt(save, "computer");
    }, "computer"],
  ];

  it.each(CHAINS)("%s: утримання, що триває після натискання, починає дію", (_name, setup, target) => {
    const save = game();
    setup(save);
    interact(save);
    keepHolding(save, 0.5);
    const activity = save.current.character.activity;
    expect(activity?.kind).toBe("use");
    expect(activity?.kind === "use" && activity.target.startsWith(target)).toBe(true);
  });
});
