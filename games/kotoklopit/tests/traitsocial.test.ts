// Етап «Гра й стосунки котів» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): ігривість,
// котяча м'ята, вікно, слухняність і риси між котами — як кіт грається, на що дивиться й як живе з іншими котами.

import { describe, expect, it } from "vitest";

import { pickUpCat, playDrain } from "../src/sim/actions";
import { giveCatnip } from "../src/sim/care";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { CATNIP, GIFTS, PET, PLAY, PLAYFUL, PRODUCTS } from "../src/sim/config";
import { addSupply, supplyCount } from "../src/sim/economy";
import { advance, deserialize, newGame, serialize } from "../src/sim/game";
import { itemTile } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import { GOODS } from "../src/sim/shop";
import type { Cat, Save, ToyItem, TraitLevel } from "../src/sim/types";
import { startWork } from "../src/sim/work";
import { careCard } from "../src/ui/cards";
import { traitAbout, traitHint } from "../src/ui/traits";
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

/** Кіт на руках біля аптечки з м'ятою в запасі. */
function catnipCat(save: Save, traits: Record<string, TraitLevel> = {}, ageWeeks = 10): Cat {
  const cat = withCat(save, traits, { x: 9.5, y: 7.5 }, ageWeeks);
  addSupply(save.current, "catnip", "cheap", 5);
  addSupply(save.current, "catnip", "premium", 5);
  pickUpCat(save.current, cat);
  return cat;
}

/** Хвилини життя котів (персонаж удома й бачить). */
function live(save: Save, minutes: number): void {
  for (let t = 0; t < minutes; t += 0.25) tickCats(save.current, 0.25, { present: true });
}

describe("«Котяча м'ята» (§9.12, рішення автора 2026-10-25)", () => {
  it("м'ята й мататабі — у магазині по 5 разів; у картці догляду — коли є в аптечці", () => {
    expect(GOODS.some((g) => "product" in g && g.product === "catnip")).toBe(true);
    expect(PRODUCTS.catnip.units).toEqual({ cheap: 5, premium: 5 });
    const save = game();
    const cat = catnipCat(save);
    const labels = careCard(save.current, cat, () => {}, () => {}).actions.map((a) => a.label);
    expect(labels).toContain("Мататабі ×5");
    expect(labels).toContain("Сушена м'ята ×5");
  });

  it("кіт без риси катається 5 хвилин і тішиться; «+» — довше, а тоді засинає: прояв «+»", () => {
    for (const level of [0, 2] as const) {
      const save = game();
      const cat = catnipCat(save, level === 0 ? {} : { catnip: level });
      cat.mood = 40;
      const { events, stop } = recordEvents();
      expect(giveCatnip(save.current, "cheap", createRng(1))).toBe(true);
      stop();
      expect(save.current.character.held).toBeNull();
      expect(supplyCount(save.current, "catnip")).toBe(9);
      expect(events.some((e) => e.type === "catnip" && e.reaction === "roll")).toBe(true);
      expect(cat.act.kind).toBe("catnip");
      expect(cat.act.minutes).toBe(CATNIP.rollMinutes[level]);
      expect(cat.mood).toBeGreaterThan(40);
      live(save, (CATNIP.rollMinutes[level] ?? 0) + 0.5);
      if (level > 0) expect(cat.act.kind).toBe("sleep");
      else expect(["catnip", "sleep"]).not.toContain(cat.act.kind);
      expect(seen(cat, "catnip")).toBe(level > 0 ? 1 : 0);
    }
  });

  it("«Байдужий» понюхає м'яту й іде — прояв «−»; мататабі діє на нього, як на кота без риси", () => {
    const save = game();
    const cat = catnipCat(save, { catnip: -1 });
    giveCatnip(save.current, "cheap", createRng(1));
    expect(cat.act.kind).toBe("idle");
    expect(cat.act.target).toBe("catnip");
    expect(seen(cat, "catnip")).toBe(1);
    live(save, 1);
    expect(cat.act.kind).toBe("wander");
    const other = game();
    const indifferent = catnipCat(other, { catnip: -1 });
    giveCatnip(other.current, "premium", createRng(1));
    expect(indifferent.act.kind).toBe("catnip");
    expect(indifferent.act.minutes).toBe(CATNIP.rollMinutes[0]);
  });

  it("«Шаленіє від м'яти» кусає руку, гасає, а тоді задирає кота поруч — прояв «−»", () => {
    const save = game();
    const cat = catnipCat(save, { catnip: -2 });
    const other = withCat(save, {}, { x: 10.5, y: 7.5 });
    other.act = idleAct(60);
    const health = save.current.character.stats.health;
    const { events, stop } = recordEvents();
    giveCatnip(save.current, "cheap", createRng(1));
    expect(save.current.character.stats.health).toBe(health + PET.biteHealth);
    expect(events.some((e) => e.type === "bite" && e.cat === cat.id)).toBe(true);
    expect(cat.act.kind).toBe("zoomies");
    expect(seen(cat, "catnip")).toBe(1);
    // Догасав поруч з іншим котом.
    Object.assign(cat, { x: 9.6, y: 8.4 });
    cat.act.minutes = 0.1;
    live(save, 0.5);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === cat.id)).toBe(true);
    expect(cat.act.kind).toBe("fight");
    expect(relation(save.current, cat, other)).toBeLessThan(0);
  });

  it("кошеня не реагує; після реакції 2 години м'ята не діє — це не прояви", () => {
    const save = game();
    const kitten = catnipCat(save, { catnip: 2 }, 1);
    giveCatnip(save.current, "cheap", createRng(1));
    expect(kitten.act.target).toBe("catnip");
    expect(seen(kitten, "catnip")).toBe(0);
    const other = game();
    const cat = catnipCat(other, { catnip: -1 });
    giveCatnip(other.current, "premium", createRng(1));
    expect(cat.act.kind).toBe("catnip");
    other.current.minute += 60;
    pickUpCat(other.current, cat);
    giveCatnip(other.current, "cheap", createRng(1));
    expect(cat.act.target).toBe("catnip");
    expect(seen(cat, "catnip")).toBe(0);
  });

  it("підказки й описи — за рівнем: «Байдужий» і «Шаленіє від м'яти» різні", () => {
    const cat = { name: "Мурка", sex: "female" as const };
    expect(traitHint(cat, { group: "catnip", level: -1 })).not.toBe(traitHint(cat, { group: "catnip", level: -2 }));
    expect(traitAbout({ group: "catnip", level: -1 }, "female")).not.toBe(traitAbout({ group: "catnip", level: -2 }, "female"));
    expect(traitHint(cat, { group: "catnip", level: -1 })).toContain("байдужа");
  });

  it("старе збереження без м'яти в запасах завантажується", () => {
    const save = game();
    const data = JSON.parse(serialize(save)) as { current: { home: { supplies: Record<string, unknown> } } };
    delete data.current.home.supplies.catnip;
    const loaded = deserialize(JSON.stringify(data));
    expect(loaded.current.home.supplies.catnip).toEqual({ cheap: 0, premium: 0 });
  });
});
