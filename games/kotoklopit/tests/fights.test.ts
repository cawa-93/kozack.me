// Бійки ворогів (§9.4, рішення автора 2026-10-26, `RELATIONS_REVIEW.md` Б1, Б2, Б4): протистояння, торкання, бійка чи відступ.

import { describe, expect, it } from "vitest";

import { tap } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { onEvent, type GameEvent } from "../src/sim/events";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import type { Cat, CatAct, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

function game(seed = 5): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.minute = 19 * 60;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  // Стерилізовані: некастрований самець б'ється частіше (×1,5), а тут потрібні чисті 40%.
  cat.sterilized = true;
  calm(cat);
  addCat(save.current, cat);
  return cat;
}

function calm(cat: Cat): void {
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
}

const idle = (minutes = 30): CatAct => ({ kind: "idle", target: null, goal: null, minutes, elapsed: 0 });

const A_AT = { x: 8.3, y: 8.5 };
const B_AT = { x: 10.7, y: 8.5 };

/** Двоє ворогів за 2,4 клітинки одне від одного у вітальні. */
function enemies(seed = 5, aTraits: Record<string, TraitLevel> = {}, bTraits: Record<string, TraitLevel> = {}): { save: Save; a: Cat; b: Cat } {
  const save = game(seed);
  const a = withCat(save, aTraits, A_AT);
  const b = withCat(save, bTraits, B_AT);
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = -80;
  return { save, a, b };
}

const met = (cat: Cat): boolean => cat.act.kind === "standoff" && cat.act.paired === true;

/** Вороги без справ стоять неподалік, доки не зійдуться в протистояння (кожна спроба — знову на своїх місцях). */
function untilStandoff(save: Save, a: Cat, b: Cat): void {
  for (let i = 0; i < 2000 && !met(a); i++) {
    calm(a);
    calm(b);
    if (a.act.kind !== "standoff" && b.act.kind !== "standoff") {
      Object.assign(a, A_AT);
      Object.assign(b, B_AT);
      a.act = idle();
      b.act = idle();
    }
    tickCats(save.current, 0.25, { present: false });
  }
  if (!met(a)) throw new Error("протистояння так і не почалося");
}

/** Дочекатися, доки протистояння скінчиться само. */
function untilSettled(save: Save, a: Cat, b: Cat): void {
  for (let i = 0; i < 100 && (a.act.kind === "standoff" || b.act.kind === "standoff"); i++) {
    calm(a);
    calm(b);
    tickCats(save.current, 0.1, { present: false });
  }
}

/** Персонаж стоїть під котом і дивиться на нього: натискання — на цього кота. */
function faceCat(save: Save, cat: Cat): void {
  const body = save.current.character.body;
  body.x = cat.x;
  body.y = cat.y + 0.65;
  body.facing = { x: 0, y: -1 };
}

const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((e) => e.type === type).length;

/** Один кадр гри (1/60 с): так часто кнопку опитують на телефоні. */
const FRAME = 0.02;

describe("протистояння ворогів (§9.4, рішення автора 2026-10-26)", () => {
  it("вороги поруч не б'ються одразу, а сходяться: за 0,6 клітинки обличчям одне до одного, 2–4 хвилини, щохвилини шиплять", () => {
    const { save, a, b } = enemies();
    const s = save.current;
    const hisses = new Map<number, number[]>();
    let fights = 0;
    const stop = onEvent((e) => {
      if (e.type === "cat-fight") fights++;
      // Коли шипить — за хвилинами самого протистояння.
      const elapsed = s.cats.find((c) => c.id === (e.type === "hissed" ? e.cat : -1))?.act.elapsed ?? 0;
      if (e.type === "hissed") hisses.set(e.cat, [...(hisses.get(e.cat) ?? []), elapsed]);
    });
    untilStandoff(save, a, b);
    expect(b.act.kind).toBe("standoff");
    expect(b.act.paired).toBe(true);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(0.6, 5);
    expect(a.y).toBe(b.y);
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    expect(left.facing).toBe(1);
    expect(right.facing).toBe(-1);
    expect(fights).toBe(0);
    const total = a.act.elapsed + a.act.minutes;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
    // Шиплять обидва: при зустрічі й далі щохвилини, доки протистояння не скінчилося.
    for (let i = 0; i < 200 && (a.act.kind === "standoff" || b.act.kind === "standoff"); i++) tickCats(s, 0.05, { present: false });
    stop();
    for (const cat of [a, b]) {
      const at = hisses.get(cat.id) ?? [];
      expect(at.length).toBeGreaterThanOrEqual(2);
      expect(at.length).toBeLessThanOrEqual(1 + Math.floor(total));
      for (let i = 1; i < at.length; i++) expect((at[i] ?? 0) - (at[i - 1] ?? 0)).toBeCloseTo(1, 0);
    }
  });

  it("без втручання — бійка з шансом 40%, інакше той, хто програв би, відступає й ховається 15–30 хвилин, а другий сидить", () => {
    let fights = 0;
    let retreats = 0;
    for (let seed = 0; seed < 60; seed++) {
      // Сміливий проти полохливого: відступає завжди полохливий (−2 + 0…2 < 2).
      const { save, a, b } = enemies(seed, { bravery: 2 }, { bravery: -2 });
      untilStandoff(save, a, b);
      const { events, stop } = recordEvents();
      untilSettled(save, a, b);
      stop();
      if (count(events, "cat-fight") > 0) {
        fights++;
        continue;
      }
      retreats++;
      expect(events.some((e) => e.type === "cat-retreated" && e.cat === b.id && e.from === a.id)).toBe(true);
      expect(b.act.kind).toBe("hide");
      expect(b.act.minutes).toBeGreaterThanOrEqual(15);
      expect(b.act.minutes).toBeLessThanOrEqual(30);
      expect(a.act.kind).toBe("idle");
    }
    expect(fights).toBeGreaterThanOrEqual(12);
    expect(fights).toBeLessThanOrEqual(36);
    expect(retreats).toBe(60 - fights);
  });

  it("натиснути на кота в протистоянні — коти розходяться, здоровий глузд −1; на руки його не беруть і, поки тримають кнопку, не гладять", () => {
    const { save, a, b } = enemies();
    const s = save.current;
    untilStandoff(save, a, b);
    faceCat(save, a);
    const target = targetOf(s);
    expect(target?.id).toBe(`cat:${a.id}`);
    const sanity = s.character.stats.sanity;
    const { events, stop } = recordEvents();
    tap(s);
    expect(s.character.held).toBeNull();
    expect(s.character.stats.sanity).toBeLessThan(sanity);
    expect(s.character.stats.sanity).toBeGreaterThanOrEqual(sanity - 1.5);
    for (const cat of [a, b]) {
      expect(cat.act.kind).toBe("wander");
      expect(cat.act.target).toBe("part");
    }
    // Розходяться в різні боки: кожен на 2 клітинки від іншого.
    const goals = [a.act.goal, b.act.goal];
    if (!goals[0] || !goals[1]) throw new Error("розходяться без цілі");
    expect(Math.abs(goals[0].x - goals[1].x)).toBeGreaterThanOrEqual(3);
    // Кнопку ще тримають: пестощі не починаються.
    for (let i = 0; i < 20; i++) advance(save, FRAME, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(s.character.activity).toBeNull();
    expect(count(events, "standoff-parted")).toBe(1);
    expect(count(events, "purr")).toBe(0);
  });

  it("утримання кнопки біля кота в протистоянні — одне торкання: коти розходяться раз, а пестощі не починаються, доки кнопку не відпустили", () => {
    const { save, a, b } = enemies();
    const s = save.current;
    untilStandoff(save, a, b);
    faceCat(save, a);
    const sanity = s.character.stats.sanity;
    const { events, stop } = recordEvents();
    // 3 хвилини гри кадрами: довше, ніж коти розходяться.
    for (let i = 0; i < 150; i++) advance(save, FRAME, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(count(events, "standoff-parted")).toBe(1);
    expect(count(events, "purr")).toBe(0);
    expect(s.character.activity).toBeNull();
    expect(s.character.stats.sanity).toBeLessThan(sanity);
    expect(a.act.kind).not.toBe("standoff");
    expect(b.act.kind).not.toBe("standoff");
  });

  it("одного з двох узяли на руки — протистояння скінчилося й для другого, без бійки", () => {
    const { save, a, b } = enemies();
    untilStandoff(save, a, b);
    save.current.character.held = { kind: "cat", cat: a.id };
    const { events, stop } = recordEvents();
    tickCats(save.current, 0.1, { present: false });
    untilSettled(save, a, b);
    stop();
    expect(b.act.kind).not.toBe("standoff");
    expect(count(events, "cat-fight")).toBe(0);
    expect(count(events, "cat-retreated")).toBe(0);
  });
});
