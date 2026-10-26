// Гру й вилизування видно (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3, В1, В2, В3): гра фазами, вилизування
// з другом, що мружиться, коли вилизують і скільки це дає, взаємність.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, groomGain, tickCats } from "../src/sim/catai";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { loudNoise } from "../src/sim/noise";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, Save, TraitLevel } from "../src/sim/types";
import { eventBubbles } from "../src/view/symbols";
import { recordEvents, withCatCorner } from "./helpers";

function game(seed = 5): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.minute = 19 * 60;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 8.5 }, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

const setRelation = (save: Save, a: Cat, b: Cat, value: number): void => {
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = value;
};

const sleeping = (minutes = 300): CatAct => ({ kind: "sleep", target: null, goal: null, minutes, elapsed: 0 });

const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((e) => e.type === type).length;

/** Кіт іде вилизати друга (`b`), що стоїть за дві клітинки. */
function groomFriend(a: Cat, b: Cat, minutes = 5): void {
  a.act = { kind: "groom", target: `cat:${b.id}`, goal: { x: Math.floor(b.x), y: Math.floor(b.y) }, minutes, elapsed: 0 };
}

describe("вилизування видно (§9.4, рішення автора 2026-10-26, В1)", () => {
  it("кіт іде вилизувати друга на 4–6 хвилин (було 3)", () => {
    const lengths: number[] = [];
    for (let seed = 0; seed < 400 && lengths.length < 10; seed++) {
      const save = game();
      const a = withCat(save, {}, { x: 9.5, y: 8.5 });
      const b = withCat(save, {}, { x: 10.5, y: 8.5 });
      setRelation(save, a, b, 60);
      b.act = idleAct(60);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) lengths.push(a.act.minutes);
    }
    expect(lengths.length).toBe(10);
    for (const minutes of lengths) {
      expect(minutes).toBeGreaterThanOrEqual(4);
      expect(minutes).toBeLessThanOrEqual(6);
    }
  });

  it("друг, що не спить, сидить на місці обличчям до того, хто вилизує, а над ним — думка-сердечко; потім він вільний", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = idleAct(60);
    groomFriend(a, b);
    const at = { x: b.x, y: b.y };
    const { events, stop } = recordEvents();
    let held = 0;
    for (let t = 0; t < 400 && a.act.kind === "groom"; t++) {
      tickCats(save.current, 0.05, { present: false });
      if (b.act.kind === "idle" && b.act.target === `licked:${a.id}`) {
        held += 0.05;
        expect({ x: b.x, y: b.y }).toEqual(at);
        expect(b.facing).toBe(a.x > b.x ? 1 : -1);
      }
    }
    stop();
    expect(held).toBeGreaterThan(4.8);
    const started = events.find((e) => e.type === "groom-started");
    expect(started).toMatchObject({ cat: a.id, friend: b.id });
    expect(count(events, "groomed")).toBe(1);
    if (started) expect(eventBubbles(started)).toEqual([{ kind: "think", at: `cat:${b.id}`, icon: "heart" }]);
    // Вилизування скінчилося — друг уже не сидить, чекаючи.
    tickCats(save.current, 0.1, { present: false });
    expect(b.act.target === `licked:${a.id}`).toBe(false);
  });

  it("друг, що спить, спить далі", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = sleeping();
    groomFriend(a, b);
    const { events, stop } = recordEvents();
    for (let t = 0; t < 400 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
    stop();
    expect(b.act.kind).toBe("sleep");
    expect(count(events, "groom-started")).toBe(1);
    expect(count(events, "groomed")).toBe(1);
  });

  it("друг пішов на нагальну потребу — вилизування скасовується без наслідків", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = idleAct(60);
    groomFriend(a, b);
    for (let t = 0; t < 200 && b.act.target !== `licked:${a.id}`; t++) tickCats(save.current, 0.05, { present: false });
    expect(b.act.target).toBe(`licked:${a.id}`);
    b.needs.toilet = 100;
    const { events, stop } = recordEvents();
    for (let t = 0; t < 40; t++) tickCats(save.current, 0.05, { present: false });
    stop();
    expect(b.act.kind).toBe("toilet");
    expect(a.act.kind === "groom" && a.act.target === `cat:${b.id}`).toBe(false);
    expect(count(events, "groomed")).toBe(0);
    expect(relation(save.current, a, b)).toBe(60);
  });

  it("«Нянька» вилизує кошеня так само: кошеня сидить і мружиться, над ним сердечко", () => {
    const save = game();
    const adult = withCat(save, { nurturing: 2 }, { x: 8.5, y: 8.5 });
    const kitten = withCat(save, {}, { x: 10.5, y: 8.5 }, 1);
    kitten.act = idleAct(60);
    adult.act = { kind: "groom", target: `kitten:${kitten.id}`, goal: { x: 10, y: 8 }, minutes: 5, elapsed: 0 };
    const { events, stop } = recordEvents();
    let held = 0;
    for (let t = 0; t < 400 && adult.act.kind === "groom"; t++) {
      tickCats(save.current, 0.05, { present: false });
      if (kitten.act.target === `licked:${adult.id}`) held += 0.05;
    }
    stop();
    expect(held).toBeGreaterThan(4.8);
    expect(events.find((e) => e.type === "groom-started")).toMatchObject({ cat: adult.id, friend: kitten.id });
  });
});

describe("коли вилизують (§9.4, рішення автора 2026-10-26, В2)", () => {
  /** Частка рішень вільного кота, за яких він іде вилизати друга `b` на відстані `gap`. */
  function groomRate(gap: number, setup: (save: Save, a: Cat, b: Cat) => void = () => undefined, traits: Record<string, TraitLevel> = {}): number {
    let chosen = 0;
    const runs = 400;
    for (let seed = 0; seed < runs; seed++) {
      const save = game();
      const a = withCat(save, traits, { x: 8.5, y: 8.5 });
      const b = withCat(save, {}, { x: 8.5 + gap, y: 8.5 });
      setRelation(save, a, b, 80);
      b.act = idleAct(60);
      setup(save, a, b);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) chosen++;
    }
    return chosen / runs;
  }

  const now = (save: Save): number => absoluteMinute(save.current.day, save.current.minute);

  it("в інший час — 15% і лише коли друг ближче 2 клітинок (було 30% до 3 клітинок)", () => {
    const near = groomRate(1.5);
    expect(near).toBeGreaterThan(0.08);
    expect(near).toBeLessThan(0.23);
    expect(groomRate(2.5)).toBe(0);
  });

  it("«Вилизування друзів» множить шанс на 1 + 0,5 × рівень; «−2» не вилизує ніколи", () => {
    const keen = groomRate(1.5, undefined, { grooming: 2 });
    expect(keen).toBeGreaterThan(0.2);
    expect(keen).toBeLessThan(0.4);
    expect(groomRate(1.5, undefined, { grooming: -2 })).toBe(0);
  });

  it("друга до 3 клітинок, що за останню годину пережив стрес не через цього кота, — 30%", () => {
    const upset = (ago: number, by?: (a: Cat) => number) => (save: Save, a: Cat, b: Cat) => {
      b.upset = { at: now(save) - ago, by: by ? by(a) : 999 };
    };
    const rate = groomRate(2.5, upset(10));
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.4);
    // Давно (понад годину) чи через самого кота — як завжди: за 2,5 клітинки не вилизують.
    expect(groomRate(2.5, upset(90))).toBe(0);
    expect(groomRate(2.5, upset(10, (a) => a.id))).toBe(0);
  });

  it("вилизаному після стресу настрій +2 замість +1 — раз за стрес", () => {
    const delta = (comfort: boolean): { mood: number; upset: boolean } => {
      const save = game();
      const a = withCat(save, {}, { x: 9.1, y: 8.5 });
      const b = withCat(save, {}, { x: 9.5, y: 8.5 });
      setRelation(save, a, b, 80);
      b.act = idleAct(60);
      b.mood = 50;
      b.upset = { at: now(save) - 5, by: 999 };
      a.act = { kind: "groom", target: `cat:${b.id}`, goal: null, minutes: 4, elapsed: 0, ...(comfort ? { comfort: true as const } : {}) };
      for (let t = 0; t < 100 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
      return { mood: b.mood - 50, upset: b.upset !== undefined };
    };
    const plain = delta(false);
    const comforted = delta(true);
    expect(comforted.mood - plain.mood).toBeCloseTo(1, 5);
    expect(comforted.upset).toBe(false);
    expect(plain.upset).toBe(true);
  });

  it("стрес — бійка (обом, з ким билися) і гучний звук, від якого кіт сховався", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    a.act = { kind: "fight", target: `cat:${b.id}`, goal: { x: 10, y: 8 }, minutes: 3, elapsed: 0 };
    b.act = { kind: "fight", target: `cat:${a.id}`, goal: null, minutes: 3, elapsed: 0 };
    for (let t = 0; t < 40 && a.act.paired !== true; t++) tickCats(save.current, 0.05, { present: false });
    expect(a.upset?.by).toBe(b.id);
    expect(b.upset?.by).toBe(a.id);

    const quiet = game();
    const c = withCat(quiet, {}, { x: 8.5, y: 8.5 });
    c.act = idleAct(30);
    loudNoise(quiet.current, "vacuum", null);
    expect(c.act.kind).toBe("hide");
    expect(c.upset).toBeDefined();
  });

  it("прокинувся після сну купкою — 50% вилизує друга поруч; друг далі (2,5 клітинки) — ні", () => {
    const rate = (gap: number): number => {
      let groomed = 0;
      const runs = 120;
      for (let seed = 0; seed < runs; seed++) {
        const save = game(seed + 1);
        const a = withCat(save, {}, { x: 8.5, y: 8.5 });
        const b = withCat(save, {}, { x: 8.5 + gap, y: 8.5 });
        setRelation(save, a, b, 80);
        a.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 60 };
        b.act = sleeping();
        tickCats(save.current, 0.05, { present: false });
        expect(a.act.kind).not.toBe("sleep");
        if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) groomed++;
      }
      return groomed / runs;
    };
    const pile = rate(0.6);
    expect(pile).toBeGreaterThan(0.38);
    expect(pile).toBeLessThan(0.72);
    expect(rate(2.5)).toBe(0);
  });

  it("прийшов лягти до сплячого друга — 30%: 1–2 хвилини вилизує, потім лягає поруч", () => {
    let groomed = 0;
    const runs = 120;
    for (let seed = 0; seed < runs; seed++) {
      const save = game(seed + 1);
      const a = withCat(save, {}, { x: 7.5, y: 8.5 });
      const b = withCat(save, {}, { x: 9.5, y: 8.5 });
      setRelation(save, a, b, 80);
      b.act = sleeping();
      a.needs.fatigue = 90;
      a.act = { kind: "sleep", target: `pile:${b.id}`, goal: { x: 9, y: 8 }, minutes: 480, elapsed: 0 };
      for (let t = 0; t < 100 && a.act.kind === "sleep" && a.act.goal !== null; t++) tickCats(save.current, 0.05, { present: false });
      if (a.act.kind === "sleep") continue;
      groomed++;
      expect(a.act).toMatchObject({ kind: "groom", target: `cat:${b.id}`, beforeSleep: true });
      expect(a.act.minutes).toBeGreaterThanOrEqual(1 - 0.05);
      expect(a.act.minutes).toBeLessThanOrEqual(2);
      const { events, stop } = recordEvents();
      for (let t = 0; t < 100 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
      stop();
      expect(count(events, "groomed")).toBe(1);
      expect(a.act).toMatchObject({ kind: "sleep", target: `pile:${b.id}`, goal: null });
      expect(Math.abs(a.x - b.x)).toBeCloseTo(0.4, 5);
    }
    expect(groomed / runs).toBeGreaterThan(0.18);
    expect(groomed / runs).toBeLessThan(0.42);
  });

  it("стосунки: +2 нижче 70, +1 від 70 до 90, +0,5 від 90 (було +2 завжди)", () => {
    expect(groomGain(55)).toBe(2);
    expect(groomGain(69.9)).toBe(2);
    expect(groomGain(70)).toBe(1);
    expect(groomGain(89)).toBe(1);
    expect(groomGain(90)).toBe(0.5);
    expect(groomGain(100)).toBe(0.5);
    const save = game();
    const a = withCat(save, {}, { x: 9.1, y: 8.5 });
    const b = withCat(save, {}, { x: 9.5, y: 8.5 });
    setRelation(save, a, b, 80);
    b.act = idleAct(60);
    a.act = { kind: "groom", target: `cat:${b.id}`, goal: null, minutes: 4, elapsed: 0 };
    for (let t = 0; t < 100 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
    expect(relation(save.current, a, b)).toBe(81);
  });
});
