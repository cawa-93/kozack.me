// Етап «Гра й стосунки котів» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): ігривість,
// котяча м'ята, вікно, слухняність і риси між котами — як кіт грається, на що дивиться й як живе з іншими котами.

import { describe, expect, it } from "vitest";

import { playDrain } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { GIFTS, PLAY, PLAYFUL } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { itemTile } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, ToyItem, TraitLevel } from "../src/sim/types";
import { startWork } from "../src/sim/work";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 7.5 }, ageWeeks = 10): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Іграшка-вудочка котячого кутка. */
function toyOf(save: Save): ToyItem {
  const toy = save.current.home.items.find((i) => i.kind === "toy");
  if (toy?.kind !== "toy") throw new Error("немає іграшки");
  return toy;
}

/** Узяти вудку й стати поруч із котом, обличчям до нього. */
function toyInHands(save: Save, cat: Cat): void {
  const toy = toyOf(save);
  save.current.home.items = save.current.home.items.filter((i) => i !== toy);
  save.current.character.held = { kind: "toy", toy };
  Object.assign(save.current.character.body, { x: cat.x - 0.5, y: cat.y, facing: { x: 1, y: 0 } });
}

/** Гратися вудкою, тримаючи кнопку, скільки хвилин; повертає, скільки тривала гра, доки кіт не награвся (0 — не награвся). */
function playFor(save: Save, minutes: number): number {
  const { events, stop } = recordEvents();
  for (let t = 0; t < minutes; t += 0.25) advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
  stop();
  const played = events.find((e) => e.type === "played");
  return played?.type === "played" ? played.minutes : 0;
}

describe("«Ігривість» (§9.12, рішення автора 2026-10-25)", () => {
  it("гра вудкою: «+» грається довше, «−» — коротше", () => {
    const save = game();
    expect(playDrain(withCat(save))).toBeCloseTo(PLAY.needPerMinute);
    expect(playDrain(withCat(save, { playful: 2 }))).toBeCloseTo(PLAY.needPerMinute / (1 + 2 * PLAYFUL.lengthStep));
    expect(playDrain(withCat(save, { playful: -2 }))).toBeCloseTo(PLAY.needPerMinute * (1 + 2 * PLAYFUL.lengthStep));
  });

  it("сеанс «+» довший, ніж із котом без риси, — прояв «+»; «−» награється раніше й іде геть — прояв «−»", () => {
    const lengths: Record<string, number> = {};
    for (const level of [0, 2, -1] as const) {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { playful: level });
      cat.needs.play = 90;
      toyInHands(save, cat);
      lengths[level] = playFor(save, 15);
      expect(lengths[level], `рівень ${level}`).toBeGreaterThan(0);
      if (level === 2) expect(seen(cat, "playful")).toBe(1);
      if (level === -1) {
        expect(seen(cat, "playful")).toBe(1);
        // Награвшись, «−» ліниво йде геть.
        const body = save.current.character.body;
        expect(Math.hypot(cat.x - body.x, cat.y - body.y)).toBeGreaterThan(1.5);
      }
    }
    expect(lengths[2]).toBeGreaterThan(lengths[0]!);
    expect(lengths[-1]).toBeLessThan(lengths[0]!);
  });

  it("«Нудьгар» інколи відвертається від вудки — відмова зі своєю іконкою, раз за утримання", () => {
    let ignored = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const cat = withCat(save, { playful: -2 });
      cat.needs.play = 90;
      toyInHands(save, cat);
      const { events, stop } = recordEvents();
      playFor(save, 3);
      stop();
      const refusals = events.filter((e) => e.type === "refused" && e.reason === "cat-bored");
      expect(refusals.length).toBeLessThanOrEqual(1);
      if (refusals.length === 0) continue;
      ignored += 1;
      expect(refusals[0]).toMatchObject({ object: `cat:${cat.id}` });
      // Потреба гри лишилася: кіт не грався.
      expect(cat.needs.play).toBeGreaterThan(80);
      expect(seen(cat, "playful")).toBe(1);
    }
    expect(ignored).toBeGreaterThan(3);
    expect(ignored).toBeLessThan(20);
  });

  it("«+» кличе гратися: несе іграшку до ніг того, хто вдома й не працює; кіт без риси так не кличе", () => {
    const invites = (traits: Record<string, TraitLevel>, working = false): number => {
      let count = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed);
        if (working) {
          Object.assign(save.current.character.body, { x: 7.5, y: 7.5, facing: { x: 0, y: -1 } });
          startWork(save.current);
        }
        const cat = withCat(save, traits);
        cat.needs.play = 90;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "carry" && cat.act.invite === true) count += 1;
      }
      return count;
    };
    expect(invites({ playful: 2 })).toBeGreaterThan(5);
    expect(invites({})).toBe(0);
    expect(invites({ playful: 2 }, true)).toBe(0);
  });

  it("поклав іграшку до ніг і чекає 10 хвилин — прояв «Ігривості +», а не «Подарунків»", () => {
    const save = game();
    const toy = toyOf(save);
    Object.assign(toy, { x: 6.5, y: 8.5 });
    const cat = withCat(save, { playful: 1, gifts: 1 }, { x: 5.5, y: 8.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: itemTile(toy), minutes: GIFTS.pickMinutes, elapsed: 0, carry: "toy", dest: "feet", invite: true };
    for (let i = 0; i < 80 && cat.act.dropped !== true; i++) tickCats(save.current, 0.25, { present: true });
    expect(cat.act.dropped).toBe(true);
    expect(cat.act.minutes).toBeGreaterThan(PLAYFUL.inviteMinutes - 1);
    expect(seen(cat, "playful")).toBe(1);
    expect(seen(cat, "gifts")).toBe(0);
    expect(cat.gift).toBeDefined();
  });
});
