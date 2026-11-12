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
import { hours, recordEvents, walkTo, withCatCorner } from "./helpers";

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
});