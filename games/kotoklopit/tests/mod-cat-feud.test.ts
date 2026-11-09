// «Котячі розбірки ↔ Мир у зграї» (§4.1, DAY_MODIFIERS.md; стосунки — §9.4): розбірки між не-друзями з межею падіння стосунків
// за день, мати з новонародженими поза ними; мир — вилизування, сон купкою, згода на гру, рідше шипіння, сильніше нічне зближення.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, hiss, tickCats } from "../src/sim/catai";
import { feudFightFactor, feudGuardLevel, feudPassLevel, feuding, hissPauseFactor, peaceAccept, peaceGroomFactor, peaceNightlyFactor } from "../src/sim/catfeud";
import { HISS_PAUSE_MINUTES, MODIFIERS, RELATIONS, TERRITORY } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { itemTile } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { changeRelation, nightlyRelations, noteStrife, relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11, day: string | null = null): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.modifiers.day = day;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 15.5, y: 3.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 7.5 }, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 4), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  // Стерилізовані: некастрований самець б'ється частіше, а тут потрібні чисті шанси.
  cat.sterilized = true;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

/** Новонароджене кошеня цієї кішки — тепер вона мати з новонародженими (§9.8). */
function nursing(save: Save, mother: Cat): Cat {
  const kitten = createCat(save.current, createRng(99), { source: "born", ageWeeks: 0, at: { x: 3.5, y: 9.5 } });
  kitten.parents = { mother: mother.id, father: null };
  addCat(save.current, kitten);
  return kitten;
}

const setRelation = (save: Save, a: Cat, b: Cat, value: number): void => {
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = value;
};

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((e) => e.type === type).length;

function live(save: Save, minutes: number): void {
  for (let t = 0; t < minutes; t += 0.25) {
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present: true });
  }
}

/** Кіт щойно шипів `ago` хвилин тому; чи зашипить він тепер на `at`. */
function hissesAgain(save: Save, cat: Cat, at: Cat, ago: number): boolean {
  cat.hissedAt = absoluteMinute(save.current.day, save.current.minute) - ago;
  return hiss(save.current, cat, at);
}

describe("«Котячі розбірки» (§4.1, §9.4)", () => {
  it("діють між котами, що не друзі; кішка з новонародженими й самі малі — поза розбірками; в інший день — нічого", () => {
    const save = game(11, "cat-feud");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    const friend = withCat(save, {}, { x: 5.5, y: 7.5 });
    setRelation(save, a, b, 0);
    setRelation(save, a, friend, 80);
    const s = save.current;
    expect(feuding(s, a, b)).toBe(true);
    expect(feuding(s, a, friend)).toBe(false);
    expect(hissPauseFactor(s, a, b)).toBe(MODIFIERS.catFeud.hissPause);
    expect(hissPauseFactor(s, a, friend)).toBe(1);
    expect(feudFightFactor(s, a, b)).toBe(MODIFIERS.catFeud.fight);
    expect(feudFightFactor(s, a, friend)).toBe(1);
    // Охороняє щонайменше як «Охоронець» +1, сильніший «Охоронець» — як є; на перехожих — щонайбільше як «Конфліктний».
    expect(feudGuardLevel(s, a, b, 0)).toBe(1);
    expect(feudGuardLevel(s, a, b, -1)).toBe(1);
    expect(feudGuardLevel(s, a, b, 2)).toBe(2);
    expect(feudPassLevel(s, a, b, 1)).toBe(-1);
    expect(feudPassLevel(s, a, b, -2)).toBe(-2);
    expect(feudGuardLevel(s, a, friend, 0)).toBe(0);
    const kitten = nursing(save, b);
    expect(feuding(s, a, b)).toBe(false);
    expect(feuding(s, b, a)).toBe(false);
    expect(feuding(s, a, kitten)).toBe(false);
    expect(hissPauseFactor(s, b, a)).toBe(1);
    expect(feudGuardLevel(s, b, a, 0)).toBe(0);
    s.modifiers.day = null;
    expect(feuding(s, a, friend)).toBe(false);
    expect(hissPauseFactor(s, a, b)).toBe(1);
  });

  it("пауза шипіння на не-друга коротша (× `hissPause`), на друга й у матері з новонародженими — звичайна", () => {
    const soon = HISS_PAUSE_MINUTES * MODIFIERS.catFeud.hissPause + 1;
    const save = game(11, "cat-feud");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    const friend = withCat(save, {}, { x: 5.5, y: 7.5 });
    setRelation(save, a, b, 0);
    setRelation(save, a, friend, 80);
    expect(hissesAgain(save, a, b, soon)).toBe(true);
    expect(hissesAgain(save, a, friend, soon)).toBe(false);
    save.current.modifiers.day = null;
    expect(hissesAgain(save, a, b, soon)).toBe(false);
    save.current.modifiers.day = "cat-feud";
    nursing(save, a);
    expect(hissesAgain(save, a, b, soon)).toBe(false);
  });

  it("протистояння ворогів частіше закінчується бійкою: шанс × `fight`", () => {
    const fights = (day: string | null): number => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        const save = game(seed, day);
        const a = withCat(save, { bravery: 2 }, { x: 9.2, y: 8.5 });
        const b = withCat(save, { bravery: -2 }, { x: 9.8, y: 8.5 });
        setRelation(save, a, b, -80);
        a.act = { kind: "standoff", target: `cat:${b.id}`, goal: null, minutes: 0.5, elapsed: 0, paired: true };
        b.act = { kind: "standoff", target: `cat:${a.id}`, goal: null, minutes: 0.5, elapsed: 0, paired: true };
        a.facing = 1;
        b.facing = -1;
        const { events, stop } = recordEvents();
        for (let i = 0; i < 4; i++) tickCats(save.current, 0.25, { present: false });
        stop();
        if (count(events, "cat-fight") > 0) n += 1;
      }
      return n / 200;
    };
    const usual = fights(null);
    const feud = fights("cat-feud");
    expect(usual).toBeGreaterThan(RELATIONS.standoff.fight - 0.1);
    expect(usual).toBeLessThan(RELATIONS.standoff.fight + 0.1);
    expect(feud).toBeGreaterThan(RELATIONS.standoff.fight * MODIFIERS.catFeud.fight - 0.1);
    expect(feud).toBeLessThan(RELATIONS.standoff.fight * MODIFIERS.catFeud.fight + 0.1);
  });

  it("кіт без риси охороняє миску від не-друга, як «Охоронець» +1: шипить, той відходить; прояву риси немає; друга й мати з новонародженими — ні", () => {
    const guarded = (relationValue: number, mother = false): number => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed, "cat-feud");
        const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
        if (!bowl) throw new Error("немає миски");
        Object.assign(bowl, { food: 2, foodQuality: "cheap" });
        const guard = withCat(save);
        const tile = itemTile(bowl);
        Object.assign(guard, { x: tile.x + 0.5, y: tile.y + 0.5 });
        guard.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 10, elapsed: 0.5, nibble: false };
        const hungry = withCat(save, {}, { x: 13.5, y: 4.5 });
        hungry.needs.hunger = 90;
        setRelation(save, guard, hungry, relationValue);
        if (mother) nursing(save, guard);
        decide(save.current, hungry, createRng(seed), { present: true });
        const { events, stop } = recordEvents();
        for (let i = 0; i < 8 && hungry.act.kind === "eat" && hungry.act.goal !== null; i++) {
          save.current.minute += 0.25;
          tickCats(save.current, 0.25, { present: true });
        }
        stop();
        // Охорона — шипіння зі значком миски; без значка — на перехожого, коли охорона не вдалася.
        if (!events.some((e) => e.type === "hissed" && e.cat === guard.id && e.at === hungry.id && e.why === "bowl")) continue;
        n += 1;
        expect(hungry.act.kind).toBe("wander");
        expect(relation(save.current, guard, hungry)).toBe(relationValue + TERRITORY.guardRelation);
        expect(seen(guard, "territorial")).toBe(0);
      }
      return n;
    };
    // З шансом `TERRITORY.guardStep` × 1 — як ворог у звичайний день.
    const neutral = guarded(0);
    expect(neutral).toBeGreaterThan(8);
    expect(neutral).toBeLessThan(32);
    expect(guarded(80)).toBe(0);
    expect(guarded(0, true)).toBe(0);
  });

  it("на перехожого не-друга шипить і кіт без риси, як «Конфліктний»; прояву «Товариськості» немає; у звичайний день — ні", () => {
    const passes = (day: string | null, mother = false): number => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const save = game(seed, day);
        const cat = withCat(save, { sociability: 1 });
        cat.act = idleAct(60);
        const other = withCat(save, {}, { x: 7.5, y: 7.5 });
        setRelation(save, cat, other, 0);
        if (mother) nursing(save, cat);
        other.act = { kind: "wander", target: null, goal: { x: 12, y: 7 }, minutes: 8, elapsed: 0 };
        const { events, stop } = recordEvents();
        live(save, 2);
        stop();
        if (!events.some((e) => e.type === "hissed" && e.cat === cat.id && e.at === other.id)) continue;
        n += 1;
        expect(seen(cat, "sociability")).toBe(0);
      }
      return n;
    };
    expect(passes("cat-feud")).toBeGreaterThan(3);
    expect(passes(null)).toBe(0);
    expect(passes("cat-feud", true)).toBe(0);
  });

  it("стосунки пари за день падають не більше ніж на `maxDrop`; ріст не обмежено; наступного дня — знову; в інший день межі немає", () => {
    const save = game(11, "cat-feud");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    const c = withCat(save, {}, { x: 5.5, y: 7.5 });
    setRelation(save, a, b, 60);
    setRelation(save, a, c, 60);
    const s = save.current;
    const max = MODIFIERS.catFeud.maxDrop;
    for (let i = 0; i < 10; i++) changeRelation(s, a, b, RELATIONS.fight.relation);
    expect(relation(s, a, b)).toBe(60 - max);
    // З однієї сварки друзі ворогами не стають.
    expect(relation(s, a, b)).toBeGreaterThan(RELATIONS.enemy);
    changeRelation(s, a, b, 2);
    expect(relation(s, a, b)).toBe(62 - max);
    changeRelation(s, a, b, -2);
    expect(relation(s, a, b)).toBe(62 - max);
    // Інша пара — своя межа.
    changeRelation(s, a, c, -7);
    expect(relation(s, a, c)).toBe(53);
    s.day += 1;
    changeRelation(s, a, b, -5);
    expect(relation(s, a, b)).toBe(57 - max);
    s.modifiers.day = null;
    for (let i = 0; i < 10; i++) changeRelation(s, a, c, -5);
    expect(relation(s, a, c)).toBe(3);
  });
});

describe("«Мир у зграї» (§4.1, §9.4)", () => {
  it("множники дня: пауза шипіння, вилизування й сон купкою, згода на гру (не вище `max`), нічне зближення; в інший день — 1", () => {
    const save = game(11, "cat-peace");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    const s = save.current;
    expect(hissPauseFactor(s, a, b)).toBe(MODIFIERS.catPeace.hissPause);
    expect(peaceGroomFactor(s)).toBe(MODIFIERS.catPeace.groom);
    expect(peaceNightlyFactor(s)).toBe(MODIFIERS.catPeace.nightly);
    expect(peaceAccept(s, 0.5)).toBeCloseTo(0.5 * MODIFIERS.catPeace.accept);
    expect(peaceAccept(s, 0.9)).toBe(RELATIONS.wrestle.accept.max);
    expect(peaceAccept(s, 0)).toBe(0);
    expect(feuding(s, a, b)).toBe(false);
    s.modifiers.day = null;
    expect(peaceGroomFactor(s)).toBe(1);
    expect(peaceNightlyFactor(s)).toBe(1);
    expect(peaceAccept(s, 0.5)).toBe(0.5);
  });

  it("шипіння рідше: пауза × `hissPause` і для не-друзів", () => {
    const later = HISS_PAUSE_MINUTES + 1;
    const save = game(11, "cat-peace");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    setRelation(save, a, b, -80);
    expect(hissesAgain(save, a, b, later)).toBe(false);
    expect(hissesAgain(save, a, b, HISS_PAUSE_MINUTES * MODIFIERS.catPeace.hissPause + 1)).toBe(true);
    save.current.modifiers.day = null;
    expect(hissesAgain(save, a, b, later)).toBe(true);
  });

  it("вилизують друга частіше", () => {
    const rate = (day: string | null): number => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const save = game(5, day);
        save.current.minute = hours(19);
        const a = withCat(save, {}, { x: 8.5, y: 8.5 });
        const b = withCat(save, {}, { x: 10, y: 8.5 });
        setRelation(save, a, b, 80);
        b.act = idleAct(60);
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) n += 1;
      }
      return n / 400;
    };
    const usual = rate(null);
    const peace = rate("cat-peace");
    expect(usual).toBeGreaterThan(RELATIONS.groom.other - 0.1);
    expect(usual).toBeLessThan(RELATIONS.groom.other + 0.1);
    expect(peace).toBeGreaterThan(RELATIONS.groom.other * MODIFIERS.catPeace.groom - 0.1);
    expect(peace).toBeLessThan(RELATIONS.groom.other * MODIFIERS.catPeace.groom + 0.1);
  });

  it("сон купкою з другом частіше", () => {
    const piles = (day: string | null): number => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const save = game(seed, day);
        const sleeper = withCat(save, {}, { x: 5.5, y: 8.5 });
        sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 30 };
        const cat = withCat(save, {}, { x: 9.5, y: 8.5 });
        setRelation(save, cat, sleeper, 80);
        cat.needs.fatigue = 99;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "sleep" && cat.act.target === `pile:${sleeper.id}`) n += 1;
      }
      return n;
    };
    const usual = piles(null);
    expect(usual).toBeGreaterThan(20);
    expect(piles("cat-peace")).toBeGreaterThan(usual * 1.15);
  });

  it("друг погоджується гратися охочіше: шанс × `accept`", () => {
    const accepted = (day: string | null): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const save = game(seed, day);
        save.current.minute = hours(19);
        const a = withCat(save, {}, { x: 8.5, y: 8.5 });
        const b = withCat(save, {}, { x: 10.5, y: 8.5 });
        setRelation(save, a, b, 70);
        a.needs.play = 90;
        // Шанс згоди — 0,6 (`RELATIONS.wrestle.accept`).
        Object.assign(b.needs, { play: 50, fatigue: 40 });
        a.act = { kind: "wrestle", target: `cat:${b.id}`, goal: { x: Math.floor(b.x), y: Math.floor(b.y) }, minutes: 8, elapsed: 0 };
        b.act = { kind: "wrestle", target: `cat:${a.id}`, goal: null, minutes: 10, elapsed: 0 };
        for (let t = 0; t < 100 && a.act.kind === "wrestle" && a.act.goal !== null; t++) tickCats(save.current, 0.05, { present: false });
        if (a.act.kind === "wrestle" && a.act.paired === true) n += 1;
      }
      return n / 200;
    };
    const usual = accepted(null);
    const peace = accepted("cat-peace");
    expect(usual).toBeGreaterThan(0.5);
    expect(usual).toBeLessThan(0.7);
    expect(peace).toBeGreaterThan(0.6 * MODIFIERS.catPeace.accept - 0.1);
    expect(peace).toBeLessThan(0.6 * MODIFIERS.catPeace.accept + 0.1);
  });

  it("цієї ночі пара без сварок зближується × `nightly`; пара, що сварилася, — як завжди, без зближення", () => {
    const save = game(11, "cat-peace");
    const a = withCat(save);
    const b = withCat(save, {}, { x: 7.5, y: 7.5 });
    const c = withCat(save, {}, { x: 5.5, y: 7.5 });
    setRelation(save, a, b, 10);
    setRelation(save, a, c, 10);
    setRelation(save, b, c, 10);
    noteStrife(save.current, a, c, "quarrel");
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBeCloseTo(10 + RELATIONS.nightly * MODIFIERS.catPeace.nightly);
    expect(relation(save.current, a, c)).toBe(10);
    save.current.modifiers.day = null;
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBeCloseTo(10 + RELATIONS.nightly * (MODIFIERS.catPeace.nightly + 1));
  });
});
