// Гру й вилизування видно (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3, В1, В2, В3): гра фазами, вилизування
// з другом, що мружиться, коли вилизують і скільки це дає, взаємність.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, groomGain, playAcceptance, tickCats } from "../src/sim/catai";
import { RELATIONS } from "../src/sim/config";
import { fallIll } from "../src/sim/diseases";
import type { GameEvent } from "../src/sim/events";
import { removeCat } from "../src/sim/farewell";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { loudNoise } from "../src/sim/noise";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, PlayPhase, Save, TraitLevel } from "../src/sim/types";
import { isDeclining, isLicked, poseOf, withFriend } from "../src/view/pose";
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

  it("погладили того, кого вилизують, чи того, хто вилизує, — вилизування переривається, як і гра (рішення автора 2026-10-26 після блоку 3)", () => {
    for (const petted of ["groomee", "groomer"] as const) {
      const save = game();
      const a = withCat(save, {}, { x: 8.5, y: 8.5 });
      const b = withCat(save, {}, { x: 10.5, y: 8.5 });
      setRelation(save, a, b, 60);
      b.act = idleAct(60);
      groomFriend(a, b);
      for (let t = 0; t < 100 && !isLicked(b); t++) tickCats(save.current, 0.05, { present: false });
      expect(isLicked(b)).toBe(true);
      const { events, stop } = recordEvents();
      save.current.character.activity = { kind: "pet", cat: (petted === "groomee" ? b : a).id, minutes: 0 };
      tickCats(save.current, 0.05, { present: true });
      tickCats(save.current, 0.05, { present: true });
      stop();
      expect(a.act.kind === "groom" && a.act.target === `cat:${b.id}`).toBe(false);
      expect(isLicked(b)).toBe(false);
      expect(count(events, "groomed")).toBe(0);
      expect(relation(save.current, a, b)).toBe(60);
    }
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

  it("друга чи кошеняти більше немає (помер, віддали) — кіт не вилизує порожнє місце (перевірка блоку 3)", () => {
    for (const kitten of [false, true]) {
      const save = game();
      const a = withCat(save, kitten ? { nurturing: 2 } : {}, { x: 8.5, y: 8.5 });
      const b = withCat(save, {}, { x: 10.5, y: 8.5 }, kitten ? 1 : 3);
      setRelation(save, a, b, 60);
      b.act = idleAct(60);
      const target = `${kitten ? "kitten" : "cat"}:${b.id}`;
      a.act = { kind: "groom", target, goal: { x: 10, y: 8 }, minutes: 5, elapsed: 0 };
      for (let t = 0; t < 200 && b.act.target !== `licked:${a.id}`; t++) tickCats(save.current, 0.05, { present: false });
      expect(b.act.target).toBe(`licked:${a.id}`);
      removeCat(save.current, b, { kind: "old" }, save.current.day);
      tickCats(save.current, 0.05, { present: false });
      expect(a.act.kind === "groom" && a.act.target === target).toBe(false);
    }
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
      comfortOf.get(a)?.();
    }
    return chosen / runs;
  }

  /** Що перевірити після рішення кота (для утіхи після стресу). */
  const comfortOf = new WeakMap<Cat, () => void>();

  const now = (save: Save): number => absoluteMinute(save.current.day, save.current.minute);

  it("в інший час — 30%, коли друг до 3 клітинок (рішення автора 2026-10-26 після блоку 3; було 15% і ближче 2)", () => {
    for (const gap of [1.5, 2.5]) {
      const rate = groomRate(gap);
      expect(rate).toBeGreaterThan(0.2);
      expect(rate).toBeLessThan(0.4);
    }
    expect(groomRate(3.5)).toBe(0);
  });

  it("«Вилизування друзів» множить шанс на 1 + 0,5 × рівень; «−2» не вилизує ніколи", () => {
    const keen = groomRate(1.5, undefined, { grooming: 2 });
    expect(keen).toBeGreaterThan(0.45);
    expect(keen).toBeLessThan(0.75);
    expect(groomRate(1.5, undefined, { grooming: -2 })).toBe(0);
  });

  it("друга до 3 клітинок, що за останню годину пережив стрес не через цього кота, — 30%", () => {
    const upset = (ago: number, by?: (a: Cat) => number) => (save: Save, a: Cat, b: Cat) => {
      b.upset = { at: now(save) - ago, by: by ? by(a) : 999 };
    };
    // Утішити (настрій +2) — 30%; давно (понад годину) чи через самого кота — як в інший час, без утіхи (з 2026-10-26 після блоку 3
    // «в інший час» — теж 30% до 3 клітинок, тож різницю видно лише з утіхи).
    const comfort = (setup: (save: Save, a: Cat, b: Cat) => void): number => {
      let comforted = 0;
      groomRate(2.5, (save, a, b) => {
        setup(save, a, b);
        comfortOf.set(a, () => (a.act.comfort === true ? comforted++ : 0));
      });
      return comforted / 400;
    };
    const rate = comfort(upset(10));
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.4);
    expect(comfort(upset(90))).toBe(0);
    expect(comfort(upset(10, (a) => a.id))).toBe(0);
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

  it("бійка з протистояння (коти вже зчепилися) — теж стрес для обох (перевірка блоку 3)", () => {
    let fights = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const a = withCat(save, {}, { x: 9.2, y: 8.5 });
      const b = withCat(save, {}, { x: 9.8, y: 8.5 });
      a.sterilized = true;
      b.sterilized = true;
      setRelation(save, a, b, -80);
      a.act = { kind: "standoff", target: `cat:${b.id}`, goal: null, minutes: 0.01, elapsed: 4, paired: true };
      b.act = { kind: "standoff", target: `cat:${a.id}`, goal: null, minutes: 0.01, elapsed: 4, paired: true };
      const { events, stop } = recordEvents();
      tickCats(save.current, 0.05, { present: false });
      stop();
      if (count(events, "cat-fight") === 0) continue;
      fights++;
      expect(a.upset?.by).toBe(b.id);
      expect(b.upset?.by).toBe(a.id);
    }
    expect(fights).toBeGreaterThan(5);
  });

  it("після феєрверків друга втішають, коли він вийде зі схованки: година на втіху — від виходу (перевірка блоку 3)", () => {
    const rate = groomRate(2.5, (save, _a, b) => {
      b.act = idleAct(30);
      loudNoise(save.current, "fireworks", null);
      // Ховається годину (кіт без рис) — довше, ніж година від того, як сховався.
      expect(b.act.kind).toBe("hide");
      expect(b.act.minutes).toBeGreaterThanOrEqual(60);
      // Вийшов зі схованки 5 хвилин тому й сидить без справ.
      save.current.minute += Math.ceil(b.act.minutes) + 5;
      b.act = idleAct(60);
    });
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.4);
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
    // Після сну купкою — 50%, а ні — ще 30% «в інший час» (з 2026-10-26 після блоку 3 — до 3 клітинок): разом ~65%; далі 3 клітинок —
    // ні того, ні іншого.
    const pile = rate(0.6);
    expect(pile).toBeGreaterThan(0.5);
    expect(pile).toBeLessThan(0.8);
    expect(rate(3.5)).toBe(0);
  });

  it("після сну вилизує й голодний чи спраглий (поїсть потім), але не той, кому треба в лоток", () => {
    const rate = (needs: Partial<Cat["needs"]>): number => {
      let groomed = 0;
      const runs = 120;
      for (let seed = 0; seed < runs; seed++) {
        const save = game(seed + 1);
        const a = withCat(save, {}, { x: 8.5, y: 8.5 });
        const b = withCat(save, {}, { x: 9.1, y: 8.5 });
        setRelation(save, a, b, 80);
        a.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 60 };
        Object.assign(a.needs, needs);
        b.act = sleeping();
        tickCats(save.current, 0.05, { present: false });
        if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) groomed++;
      }
      return groomed / runs;
    };
    // Голод і спрага, як завжди після довгого сну (заміри блоку 3: з умовою «нічого нагального» — ніколи).
    expect(rate({ hunger: 90, thirst: 80 })).toBeGreaterThan(0.3);
    expect(rate({ toilet: 95 })).toBe(0);
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

describe("взаємність (§9.4, рішення автора 2026-10-26, В3)", () => {
  /** Вилизати друга (`b`, поруч) до кінця й подивитися, чи він відповів тим самим. */
  function groomAndSee(seed: number, friend: CatAct, traits: Record<string, TraitLevel> = {}): { back: boolean; save: Save; a: Cat; b: Cat; events: GameEvent[] } {
    const save = game(seed);
    const a = withCat(save, {}, { x: 9.1, y: 8.5 });
    const b = withCat(save, traits, { x: 9.5, y: 8.5 });
    setRelation(save, a, b, 60);
    b.act = friend;
    a.act = { kind: "groom", target: `cat:${b.id}`, goal: null, minutes: 4, elapsed: 0 };
    const { events, stop } = recordEvents();
    for (let t = 0; t < 100 && a.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
    stop();
    const back = b.act.kind === "groom" && b.act.target === `cat:${a.id}` && b.act.back === true;
    return { back, save, a, b, events };
  }

  it("друг, що не спить, з шансом 40% хвилину вилизує у відповідь — тепер мружиться перший; окремих наслідків немає", () => {
    let back = 0;
    const runs = 120;
    for (let seed = 1; seed <= runs; seed++) {
      const { back: answered, save, a, b, events: before } = groomAndSee(seed, idleAct(60));
      if (!answered) continue;
      back++;
      expect(b.act.minutes).toBeLessThanOrEqual(1);
      expect(a.act).toMatchObject({ kind: "idle", target: `licked:${b.id}` });
      const value = relation(save.current, a, b);
      const mood = a.mood;
      const { events, stop } = recordEvents();
      for (let t = 0; t < 40 && b.act.kind === "groom"; t++) tickCats(save.current, 0.05, { present: false });
      stop();
      // Над тим, кого тепер вилизують у відповідь, — теж сердечко.
      expect([...before, ...events].filter((e) => e.type === "groom-started").map((e) => e.type === "groom-started" && e.friend)).toEqual([b.id, a.id]);
      expect(count(events, "groomed")).toBe(0);
      expect(relation(save.current, a, b)).toBe(value);
      expect(a.mood).toBeCloseTo(mood, 1);
      // Вилизав у відповідь — обидва вільні.
      tickCats(save.current, 0.1, { present: false });
      expect(a.act.target === `licked:${b.id}`).toBe(false);
    }
    expect(back / runs).toBeGreaterThan(0.28);
    expect(back / runs).toBeLessThan(0.52);
  });

  it("сплячий друг і «Не терпить дотиків» (−2) у відповідь не вилизують", () => {
    for (let seed = 1; seed <= 60; seed++) {
      expect(groomAndSee(seed, sleeping()).back).toBe(false);
      expect(groomAndSee(seed, idleAct(60), { grooming: -2 }).back).toBe(false);
    }
  });
});

describe("гра фазами (§9.4, рішення автора 2026-10-26, Г3)", () => {
  /** Двоє друзів: `a` підбігає до `b` гратися (як після `decide`). */
  function friendsPlay(seed: number, at = { x: 8.5, y: 8.5 }, gap = 2): { save: Save; a: Cat; b: Cat } {
    const save = game(seed);
    const a = withCat(save, {}, at);
    const b = withCat(save, {}, { x: at.x + gap, y: at.y });
    setRelation(save, a, b, 70);
    // Друг сам хоче гратися — погоджується з шансом 95% (§9.4 «Згода, охорона й сварки», Г5).
    b.needs.play = 100;
    a.act = { kind: "wrestle", target: `cat:${b.id}`, goal: { x: Math.floor(b.x), y: Math.floor(b.y) }, minutes: 8, elapsed: 0 };
    b.act = { kind: "wrestle", target: `cat:${a.id}`, goal: null, minutes: 10, elapsed: 0 };
    return { save, a, b };
  }

  const DT = 0.05;
  const playing = (a: Cat, b: Cat): boolean => a.act.kind === "wrestle" && b.act.kind === "wrestle";

  it("6–8 хвилин від зустрічі, по колу: засідка (0,5–1) → погоня → боротьба → пауза (0,3–0,5); догралися — подія без бабла", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { save, a, b } = friendsPlay(seed);
      for (let t = 0; t < 100 && a.act.paired !== true; t++) tickCats(save.current, DT, { present: false });
      expect(a.act.lead).toBe(true);
      const phases: { phase: string; minutes: number }[] = [];
      let total = 0;
      const { events, stop } = recordEvents();
      for (let t = 0; t < 400 && playing(a, b); t++) {
        const phase = a.act.game?.phase ?? "";
        // Друг бачить ту саму фазу й того самого мисливця.
        expect(b.act.game?.phase).toBe(phase);
        expect(b.act.game?.chaser).toBe(a.act.game?.chaser);
        const last = phases[phases.length - 1];
        if (last?.phase === phase) last.minutes += DT;
        else phases.push({ phase, minutes: DT });
        tickCats(save.current, DT, { present: false });
        total += DT;
      }
      stop();
      expect(total).toBeGreaterThan(6 - 2 * DT);
      expect(total).toBeLessThan(8 + 2 * DT);
      expect(phases[0]?.phase).toBe("ambush");
      const order = ["ambush", "chase", "tussle", "pause"];
      phases.forEach((p, i) => expect(p.phase).toBe(order[i % 4]));
      for (const p of phases.slice(0, -1)) {
        if (p.phase === "ambush") expect(p.minutes).toBeGreaterThan(0.5 - 2 * DT);
        if (p.phase === "ambush") expect(p.minutes).toBeLessThan(1 + 2 * DT);
        if (p.phase === "pause") expect(p.minutes).toBeLessThan(0.5 + 2 * DT);
      }
      const played = events.filter((e) => e.type === "cats-played");
      expect(played).toHaveLength(1);
      const [event] = played;
      if (event) expect(eventBubbles(event)).toEqual([]);
      expect(a.needs.play).toBe(0);
      expect(relation(save.current, a, b)).toBe(72);
    }
  });

  it("засідка: мисливець на місці обличчям до другого, а той відходить на 1,5–2,5 клітинки", () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { save, a, b } = friendsPlay(seed);
      for (let t = 0; t < 100 && a.act.paired !== true; t++) tickCats(save.current, DT, { present: false });
      const at = { x: a.x, y: a.y };
      for (let t = 0; t < 30 && a.act.game?.phase === "ambush"; t++) {
        expect({ x: a.x, y: a.y }).toEqual(at);
        if (b.act.run === undefined && t > 0) {
          expect(a.facing).toBe(b.x > a.x ? 1 : -1);
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          expect(gap).toBeGreaterThan(1.5 - 1e-6);
          expect(gap).toBeLessThan(2.5 + 1e-6);
          checked++;
          break;
        }
        tickCats(save.current, DT, { present: false });
      }
    }
    expect(checked).toBeGreaterThan(6);
  });

  it("погоня: швидкістю зумі в межах кімнати, мисливець тримається позаду; ролі щохвилини міняються з шансом 50%", () => {
    let swaps = 0;
    let chaseMinutes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { save, a, b } = friendsPlay(seed);
      for (let t = 0; t < 400 && playing(a, b); t++) {
        const game = a.act.game;
        const before = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, chaser: game?.chaser, phase: game?.phase };
        tickCats(save.current, DT, { present: false });
        // Лише поки обидва ще граються (той, хто догрався першим, уже йде у своїх справах).
        if (before.phase !== "chase" || a.act.game?.phase !== "chase" || !playing(a, b)) continue;
        chaseMinutes += DT;
        if (a.act.game.chaser !== before.chaser) swaps++;
        for (const [cat, from] of [[a, before.a], [b, before.b]] as const) {
          expect(Math.hypot(cat.x - from.x, cat.y - from.y)).toBeLessThan(2.5 * 3 * DT + 1e-6);
          expect(cat.y).toBeGreaterThanOrEqual(6);
        }
      }
    }
    // Щохвилини — з шансом 50%.
    expect(swaps / chaseMinutes).toBeGreaterThan(0.3);
    expect(swaps / chaseMinutes).toBeLessThan(0.7);
  });

  it("погоня повз стіл скидає з нього страву, як зумі", () => {
    let knocked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // Кухня: стіл посередині.
      const { save, a, b } = friendsPlay(seed, { x: 13.5, y: 2.5 }, 1);
      save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      const { events, stop } = recordEvents();
      for (let t = 0; t < 400 && playing(a, b); t++) tickCats(save.current, DT, { present: false });
      stop();
      knocked += count(events, "knocked");
    }
    expect(knocked).toBeGreaterThan(0);
  });

  it("уночі (крок — хвилина, утікач за крок пробігає 7,5 клітинки) мисливець не відстає, і гра догравається", () => {
    let played = 0;
    let declined = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { save, a, b } = friendsPlay(seed);
      const { events, stop } = recordEvents();
      for (let t = 0; t < 20 && (a.act.kind === "wrestle" || b.act.kind === "wrestle"); t++) tickCats(save.current, 1, { present: false });
      stop();
      played += count(events, "cats-played");
      declined += count(events, "play-declined");
    }
    // Хто погодився (95%, Г5), той і догрався.
    expect(played + declined).toBe(20);
    expect(declined).toBeLessThanOrEqual(3);
  });

  it("боротьба: мисливець добігає й стає впритул, навіть коли утікач ліг біля самого кута клітинки", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.996, y: 8.996 });
    setRelation(save, a, b, 70);
    const tussle = { phase: "tussle" as const, left: 2, chaser: a.id, swap: 5 };
    a.act = { kind: "wrestle", target: `cat:${b.id}`, goal: null, minutes: 3, elapsed: 0, paired: true, lead: true, game: { ...tussle }, run: { x: 10, y: 8 } };
    b.act = { kind: "wrestle", target: `cat:${a.id}`, goal: null, minutes: 3, elapsed: 0, paired: true, game: { ...tussle } };
    for (let t = 0; t < 20 && a.act.run !== undefined; t++) tickCats(save.current, DT, { present: false });
    expect(a.act.run).toBeUndefined();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(0.4, 5);
  });

  it("погладили одного з котів посеред гри — гри немає нікому", () => {
    const { save, a, b } = friendsPlay(3);
    for (let t = 0; t < 100 && a.act.paired !== true; t++) tickCats(save.current, DT, { present: false });
    tickCats(save.current, 1, { present: true });
    save.current.character.activity = { kind: "pet", cat: b.id, minutes: 0 };
    const { events, stop } = recordEvents();
    tickCats(save.current, DT, { present: true });
    stop();
    expect(playing(a, b)).toBe(false);
    expect(count(events, "cats-played")).toBe(0);
    expect(relation(save.current, a, b)).toBe(70);
  });

  it("стара гра без фаз (збереження до блоку 3) догравається, як раніше", () => {
    const save = game();
    const a = withCat(save, {}, { x: 9.1, y: 8.5 });
    const b = withCat(save, {}, { x: 9.5, y: 8.5 });
    setRelation(save, a, b, 70);
    a.needs.play = 80;
    a.act = { kind: "wrestle", target: `cat:${b.id}`, goal: null, minutes: 2, elapsed: 1, paired: true };
    b.act = { kind: "wrestle", target: `cat:${a.id}`, goal: null, minutes: 2, elapsed: 1, paired: true };
    const { events, stop } = recordEvents();
    for (let t = 0; t < 60 && playing(a, b); t++) tickCats(save.current, DT, { present: false });
    stop();
    expect(count(events, "cats-played")).toBe(1);
    expect(a.needs.play).toBeLessThan(80);
    expect(relation(save.current, a, b)).toBe(72);
  });
});

describe("друг може відмовитися (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г5)", () => {
  /** `a` біжить до `b` гратися (як після `decide`); `b` чекає. */
  function invite(seed: number, needs: { play: number; fatigue: number }, ageWeeks = 3): { save: Save; a: Cat; b: Cat } {
    const save = game(seed);
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 }, ageWeeks);
    setRelation(save, a, b, 70);
    a.needs.play = 90;
    Object.assign(b.needs, needs);
    a.act = { kind: "wrestle", target: `cat:${b.id}`, goal: { x: Math.floor(b.x), y: Math.floor(b.y) }, minutes: 8, elapsed: 0 };
    b.act = { kind: "wrestle", target: `cat:${a.id}`, goal: null, minutes: 10, elapsed: 0 };
    return { save, a, b };
  }

  /** Тікати, доки `a` не добіг до `b`. */
  function arrive(save: Save, a: Cat): void {
    for (let t = 0; t < 100 && a.act.kind === "wrestle" && a.act.goal !== null; t++) tickCats(save.current, 0.05, { present: false });
  }

  it("шанс погодитися: 0,3 + гра/100 − втома/200 + 0,15 × «Ігривість», кошеня +0,3, старий −0,3, у межах 0,1…0,95", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.play = 50;
    cat.needs.fatigue = 40;
    expect(playAcceptance(cat)).toBeCloseTo(0.6);
    cat.traits = [{ group: "playful", level: 1, seen: 0, known: false }];
    expect(playAcceptance(cat)).toBeCloseTo(0.75);
    cat.traits = [];
    cat.needs.play = 0;
    cat.needs.fatigue = 100;
    expect(playAcceptance(cat)).toBeCloseTo(0.1);
    cat.needs.play = 100;
    cat.needs.fatigue = 0;
    expect(playAcceptance(cat)).toBeCloseTo(0.95);
    const kitten = withCat(save, {}, { x: 5.5, y: 8.5 }, 1);
    kitten.needs.play = 20;
    expect(playAcceptance(kitten)).toBeCloseTo(0.8);
    const old = withCat(save, {}, { x: 6.5, y: 8.5 }, 60);
    old.needs.play = 50;
    expect(playAcceptance(old)).toBeCloseTo(0.5);
  });

  it("хворий чи травмований не погоджується зовсім; старість і ожиріння — не хвороба", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.play = 100;
    fallIll(save.current, cat, "obesity");
    fallIll(save.current, cat, "senior");
    expect(playAcceptance(cat)).toBeCloseTo(0.95);
    fallIll(save.current, cat, "injury");
    expect(playAcceptance(cat)).toBe(0);
  });

  it("покликаний погоджується так часто, як каже шанс", () => {
    let accepted = 0;
    let declined = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { save, a } = invite(seed, { play: 50, fatigue: 40 });
      const { events, stop } = recordEvents();
      arrive(save, a);
      stop();
      if (a.act.kind === "wrestle" && a.act.paired === true) accepted += 1;
      declined += count(events, "play-declined");
    }
    expect(accepted + declined).toBe(200);
    expect(accepted / 200).toBeGreaterThan(0.5);
    expect(accepted / 200).toBeLessThan(0.7);
  });

  it("відмовився — лягає обличчям до того, хто кликав, і сіпає хвостом, а той відходить; гри немає нікому", () => {
    let refusals = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { save, a, b } = invite(seed, { play: 0, fatigue: 40 });
      const { events, stop } = recordEvents();
      arrive(save, a);
      if (count(events, "play-declined") === 0) {
        stop();
        continue;
      }
      refusals += 1;
      expect(isDeclining(b)).toBe(true);
      expect(b.act.target).toBe(`declined:${a.id}`);
      expect(poseOf(b, false)).toBe("lie");
      expect(withFriend(b)).toBe(true);
      expect(a.act.kind).toBe("wander");
      expect(a.act.target).toBe(`refused:${b.id}`);
      expect(withFriend(a)).toBe(true);
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      for (let t = 0; t < 10 && a.act.kind === "wander"; t++) tickCats(save.current, 0.1, { present: false });
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(before + 0.5);
      // Лежить обличчям до того, хто кликав, і дивиться йому вслід.
      expect(isDeclining(b)).toBe(true);
      expect(b.facing).toBe(a.x > b.x ? 1 : -1);
      // Здоровий друг не шипить.
      expect(events.some((e) => e.type === "hissed")).toBe(false);
      for (let t = 0; t < 10; t++) tickCats(save.current, 1, { present: false });
      stop();
      expect(count(events, "cats-played")).toBe(0);
      expect(relation(save.current, a, b)).toBe(70);
    }
    // Шанс погодитися тут — 10%.
    expect(refusals).toBeGreaterThan(14);
  });

  it("хворий друг завжди відмовляється й шипить на того, хто кличе", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { save, a, b } = invite(seed, { play: 100, fatigue: 0 });
      fallIll(save.current, b, "cold");
      const { events, stop } = recordEvents();
      arrive(save, a);
      stop();
      expect(events.filter((e) => e.type === "play-declined")).toEqual([{ type: "play-declined", cat: b.id, by: a.id, sick: true }]);
      expect(events.some((e) => e.type === "hissed" && e.cat === b.id && e.at === a.id)).toBe(true);
    }
  });

  it("хворий і сам не кличе гратися (рішення автора 2026-10-26 після блоку 4), а решта забав — як у здорового", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 70);
    /** Що обирає `a`, коли хоче гратися, за 200 рішень; друг `b` поруч вільний чи спить. */
    const choices = (friendFree: boolean, present: boolean): string[] => {
      const out: string[] = [];
      for (let seed = 0; seed < 200; seed++) {
        a.needs.play = 100;
        b.act = friendFree ? idleAct(30) : sleeping();
        decide(save.current, a, createRng(seed), { present });
        out.push(`${a.act.kind}:${a.act.target ?? ""}`);
      }
      return out;
    };
    const calls = (list: string[]): number => list.filter((c) => c === `wrestle:cat:${b.id}`).length;
    for (const present of [false, true]) {
      expect(calls(choices(true, present))).toBeGreaterThan(10);
      // Друг спить — здоровий обирає з решти забав: зумі, іграшка, кігтеточка, бешкет, засідка на персонажа.
      const alone = choices(false, present);
      expect(new Set(alone.map((c) => c.split(":")[0])).size).toBeGreaterThan(3);
      for (const disease of ["cold", "injury"] as const) {
        fallIll(save.current, a, disease);
        // Хворий друга не кличе, хоч той вільний, а решту обирає так само, як здоровий, — рішення в рішення.
        expect(choices(true, present)).toEqual(alone);
        expect(choices(false, present)).toEqual(alone);
        a.diseases = [];
      }
      // Старість і ожиріння — не хвороба (Г5): такий кличе, як і раніше; блохи й глисти — теж (рішення автора 2026-10-27, Х11).
      fallIll(save.current, a, "senior");
      fallIll(save.current, a, "obesity");
      fallIll(save.current, a, "fleas");
      fallIll(save.current, a, "worms");
      expect(calls(choices(true, present))).toBeGreaterThan(10);
      a.diseases = [];
    }
  });

  it("відмовився — пів години його не кличе й інший кіт (перевірка блоку 4: що відмова ставить паузу, не перевіряв жоден тест)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { save, a, b } = invite(seed, { play: 0, fatigue: 40 });
      const { events, stop } = recordEvents();
      arrive(save, a);
      stop();
      if (count(events, "play-declined") === 0) continue;
      const c = withCat(save, {}, { x: 12.5, y: 8.5 });
      setRelation(save, b, c, 70);
      const calls = (): number => {
        let n = 0;
        for (let s = 0; s < 100; s++) {
          c.needs.play = 100;
          b.act = idleAct(30);
          decide(save.current, c, createRng(s), { present: false });
          if (c.act.kind === "wrestle" && c.act.target === `cat:${b.id}`) n += 1;
        }
        return n;
      };
      expect(calls()).toBe(0);
      save.current.minute += RELATIONS.wrestle.decline.pause;
      expect(calls()).toBeGreaterThan(10);
      return;
    }
    throw new Error("друг так і не відмовився");
  });

  it("пів години після відмови цього кота гратися не кличуть", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 70);
    const now = absoluteMinute(save.current.day, save.current.minute);
    const invites = (): number => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        a.needs.play = 100;
        b.act = idleAct(30);
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === "wrestle") n += 1;
      }
      return n;
    };
    b.playDeclinedAt = now - RELATIONS.wrestle.decline.pause + 1;
    expect(invites()).toBe(0);
    b.playDeclinedAt = now - RELATIONS.wrestle.decline.pause;
    expect(invites()).toBeGreaterThan(10);
  });
});

describe("кличуть лише поруч і лише вільного (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г6)", () => {
  /** Скільки з 200 рішень кота, що хоче гратися, — покликати цього друга. */
  function invites(save: Save, a: Cat, b: Cat, act: () => CatAct): number {
    let n = 0;
    for (let seed = 0; seed < 200; seed++) {
      a.needs.play = 100;
      b.act = act();
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "wrestle" && a.act.target === `cat:${b.id}`) n += 1;
    }
    return n;
  }

  it("друга в тій самій кімнаті кличуть і здалеку, з іншої кімнати — лише ближче 4 клітинок", () => {
    const save = game();
    const a = withCat(save, {}, { x: 2.5, y: 8.5 });
    const b = withCat(save, {}, { x: 16.5, y: 8.5 });
    setRelation(save, a, b, 70);
    // Обидва у вітальні, за 14 клітинок.
    expect(invites(save, a, b, () => idleAct(30))).toBeGreaterThan(10);
    // Спальня й кухня — далеко.
    Object.assign(a, { x: 3.5, y: 3.5 });
    Object.assign(b, { x: 15.5, y: 3.5 });
    expect(invites(save, a, b, () => idleAct(30))).toBe(0);
    // Кухня й вітальня — ближче 4 клітинок.
    Object.assign(a, { x: 13.5, y: 3.5 });
    Object.assign(b, { x: 15.5, y: 6.5 });
    expect(invites(save, a, b, () => idleAct(30))).toBeGreaterThan(10);
  });

  it("кличуть лише того, хто стоїть чи бродить без особливої цілі", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    const c = withCat(save, {}, { x: 4.5, y: 9.5 });
    setRelation(save, a, b, 70);
    const goal = { x: 12, y: 8 };
    expect(invites(save, a, b, () => idleAct(30))).toBeGreaterThan(10);
    expect(invites(save, a, b, () => ({ kind: "wander", target: null, goal, minutes: 5, elapsed: 0 }))).toBeGreaterThan(10);
    expect(invites(save, a, b, () => ({ kind: "wander", target: "play", goal, minutes: 5, elapsed: 0 }))).toBeGreaterThan(10);
    const busy: CatAct[] = [
      { kind: "toy", target: "item:1", goal: null, minutes: 5, elapsed: 0 },
      { kind: "idle", target: `cuddle:${c.id}`, goal: null, minutes: 5, elapsed: 0 },
      { kind: "idle", target: "desk", goal: null, minutes: 5, elapsed: 0 },
      { kind: "idle", target: "lured", goal: null, minutes: 2, elapsed: 0 },
      { kind: "idle", target: "sniff:1", goal: null, minutes: 2, elapsed: 0 },
      { kind: "idle", target: "guard:item:1", goal: null, minutes: 10, elapsed: 0 },
      { kind: "idle", target: "won", goal: null, minutes: 3, elapsed: 0 },
      { kind: "idle", target: `licked:${c.id}`, goal: null, minutes: 5, elapsed: 0 },
      { kind: "wander", target: "paper", goal, minutes: 5, elapsed: 0 },
      { kind: "wander", target: "avoid", goal, minutes: 5, elapsed: 0 },
    ];
    for (const act of busy) expect(invites(save, a, b, () => ({ ...act }))).toBe(0);
  });
});

describe("пози гри й вилизування (§9.4, «Пози стосунків», 3–5; заглушки до кроку 16)", () => {
  const act = (fields: Partial<CatAct>): CatAct => ({ kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0, ...fields });

  it("вилизує друга чи кошеня — «вилизує іншого»; той, кого вилизують, сидить і мружиться", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    a.act = act({ kind: "groom", target: `cat:${b.id}` });
    expect(poseOf(a, false)).toBe("lick");
    a.act = act({ kind: "groom", target: `kitten:${b.id}` });
    expect(poseOf(a, false)).toBe("lick");
    // Іде вилизувати — іде; вмивається сам — лапкою.
    a.act = act({ kind: "groom", target: `cat:${b.id}`, goal: { x: 3, y: 8 } });
    expect(poseOf(a, false)).toBe("walk");
    a.act = act({ kind: "groom", target: "nervous" });
    expect(poseOf(a, false)).toBe("groom");
    b.act = act({ target: `licked:${a.id}` });
    expect(poseOf(b, false)).toBe("sit");
    expect(isLicked(b)).toBe(true);
    expect(withFriend(b)).toBe(true);
    b.act = act({});
    expect(isLicked(b)).toBe(false);
    expect(withFriend(b)).toBe(false);
  });

  it("гра: засідка — мисливець припав, той відходить і сідає; погоня — біжать; боротьба — знизу на спині, зверху з лапою; пауза — сидять", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    const play = (cat: Cat, phase: PlayPhase, run = false): CatAct =>
      act({ kind: "wrestle", target: `cat:${cat === a ? b.id : a.id}`, paired: true, game: { phase, left: 1, chaser: a.id, swap: 1 }, ...(run ? { run: { x: 5, y: 8 } } : {}) });
    const pose = (cat: Cat, phase: PlayPhase, run = false): string => {
      cat.act = play(cat, phase, run);
      return poseOf(cat, false);
    };
    expect(pose(a, "ambush")).toBe("crouch");
    expect(pose(b, "ambush", true)).toBe("walk");
    expect(pose(b, "ambush")).toBe("sit");
    expect(pose(a, "chase")).toBe("walk");
    expect(pose(b, "chase", true)).toBe("walk");
    expect(pose(a, "tussle", true)).toBe("walk");
    expect(pose(a, "tussle")).toBe("paw");
    expect(pose(b, "tussle")).toBe("kick");
    expect(pose(a, "pause")).toBe("sit");
    expect(pose(b, "pause")).toBe("sit");
    expect(withFriend(a)).toBe(true);
    // Біжить до друга — іде; друг чекає — сидить.
    a.act = act({ kind: "wrestle", target: `cat:${b.id}`, goal: { x: 3, y: 8 } });
    expect(poseOf(a, false)).toBe("walk");
    b.act = act({ kind: "wrestle", target: `cat:${a.id}` });
    expect(poseOf(b, false)).toBe("sit");
  });
});

describe("сценарій «Згода, охорона й сварки» (`scenarios/cats-agree-guard.json`, блок 4 і рішення 10)", () => {
  it("хворий Тихон відмовляється й шипить, Буся відмовляється, Мурка охороняє миску від ворога, Буркотун шипить на кошеня", () => {
    const scenario = FILE_SCENARIOS["cats-agree-guard"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const id = (name: string): number => save.current.cats.find((c) => c.name === name)!.id;
    const { events, stop } = recordEvents();
    for (let t = 0; t < 5; t += 0.25) advance(save, 0.25);
    stop();
    expect(events).toContainEqual({ type: "play-declined", cat: id("Тихон"), by: id("Мурчик"), sick: true });
    expect(events).toContainEqual({ type: "hissed", cat: id("Тихон"), at: id("Мурчик") });
    expect(events).toContainEqual({ type: "play-declined", cat: id("Буся"), by: id("Рижик"), sick: false });
    expect(events).toContainEqual({ type: "hissed", cat: id("Мурка"), at: id("Барсик"), why: "bowl" });
    expect(events).toContainEqual({ type: "hissed", cat: id("Буркотун"), at: id("Малюк"), why: "kitten" });
  });

  it("застуджений Тихон хоче гратися, але сам не кличе ні друга Ревнивця, ні Малюка — грається сам (рішення автора 2026-10-26 після блоку 4)", () => {
    const scenario = FILE_SCENARIOS["cats-agree-guard"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const tykhon = save.current.cats.find((c) => c.name === "Тихон")!;
    const alone = new Set<string>();
    for (let t = 0; t < 120; t += 0.25) {
      advance(save, 0.25);
      // Хворий не грається в парі ні як той, кого кличуть (Г5), ні як той, хто кличе.
      expect(tykhon.act.kind === "wrestle" && tykhon.act.paired === true).toBe(false);
      if (tykhon.act.kind === "wrestle") expect(tykhon.act.goal).toBeNull();
      if (["toy", "zoomies", "scratch"].includes(tykhon.act.kind) || (tykhon.act.kind === "wander" && tykhon.act.target === "play")) alone.add(tykhon.act.kind);
    }
    expect(alone.size).toBeGreaterThan(0);
  });
});
