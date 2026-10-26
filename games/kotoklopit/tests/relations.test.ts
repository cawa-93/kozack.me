// Стосунки між котами (§9.4): початок, ночі, ігри друзів, бійки ворогів, ресурси, ревнощі.

import { describe, expect, it } from "vitest";

import { pickUpCat, tickActivity } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, jealousy, tickCats } from "../src/sim/catai";
import { newGame } from "../src/sim/game";
import { itemTile } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { nightlyRelations, relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 5 }));
  save.current.minute = 19 * 60;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 8.5 }, ageWeeks = 30): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, cat);
  return cat;
}

const calm = (cat: Cat): void => {
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
};

const setRelation = (save: Save, a: Cat, b: Cat, value: number): void => {
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = value;
};

describe("початок стосунків (§9.4)", () => {
  it("«Товариськість» обох котів — по 10 за одиницю, з кошеням — ще +20", () => {
    const save = game();
    const a = withCat(save, { sociability: 1 });
    const b = withCat(save, { sociability: 2 });
    expect(relation(save.current, a, b)).toBe(30);
    const kitten = withCat(save, {}, { x: 5.5, y: 8.5 }, 1);
    expect(relation(save.current, a, kitten)).toBe(30);
  });

  it("щоночі життя разом додає 0,5", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBe(0.5);
  });
});

describe("друзі (§9.4)", () => {
  it("кіт, що хоче гратися, кличе друга, і гра зближує обох", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, b, 60);
    let seed = 0;
    for (; seed < 300; seed++) {
      a.needs.play = 100;
      b.act = { kind: "idle", target: null, goal: null, minutes: 30, elapsed: 0 };
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "wrestle") break;
    }
    expect(a.act.kind).toBe("wrestle");
    expect(b.act.kind).toBe("wrestle");
    for (let i = 0; i < 10; i++) tickCats(save.current, 1, { present: false });
    expect(relation(save.current, a, b)).toBeGreaterThan(60);
    expect(a.needs.play).toBeLessThan(100);
  });
});

describe("вороги (§9.4)", () => {
  function enemies(): { save: Save; a: Cat; b: Cat } {
    const save = game();
    const a = withCat(save, {}, { x: 9.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.3, y: 8.5 });
    setRelation(save, a, b, -80);
    return { save, a, b };
  }

  function untilFight(save: Save, a: Cat, b: Cat): void {
    for (let i = 0; i < 300 && a.act.kind !== "fight"; i++) {
      calm(a);
      calm(b);
      a.act = { kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0 };
      b.act = { kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0 };
      tickCats(save.current, 1, { present: false });
    }
  }

  it("поруч б'ються: шерсть на підлозі, стосунки й настрій падають", () => {
    const { save, a, b } = enemies();
    const mood = a.mood;
    untilFight(save, a, b);
    expect(a.act.kind).toBe("fight");
    expect(b.act.kind).toBe("fight");
    expect(save.current.home.messes.some((m) => m.kind === "fur")).toBe(true);
    expect(relation(save.current, a, b)).toBe(-85);
    expect(a.mood).toBeLessThan(mood);
  });

  it("узяти кота на руки — розборонити: друга бійка закінчується, а здоровий глузд падає", () => {
    const { save, a, b } = enemies();
    untilFight(save, a, b);
    const sanity = save.current.character.stats.sanity;
    pickUpCat(save.current, a);
    expect(b.act.kind).not.toBe("fight");
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
  });

  it("погладити чи погратися вудкою з котом, що б'ється, — так само розборонити обох (перевірка стосунків 2026-10-26)", () => {
    for (const kind of ["pet", "play"] as const) {
      const { save, a, b } = enemies();
      const s = save.current;
      Object.assign(s.character.body, { x: 9.5, y: 9.5 });
      untilFight(save, a, b);
      expect(a.act.kind).toBe("fight");
      a.needs.attention = 90;
      a.needs.play = 90;
      if (kind === "play") {
        const toy = s.home.items.find((i) => i.kind === "toy");
        if (toy?.kind !== "toy") throw new Error("немає іграшки");
        s.home.items = s.home.items.filter((i) => i !== toy);
        s.character.held = { kind: "toy", toy };
      }
      s.character.activity = { kind, cat: a.id, minutes: 0 };
      const sanity = s.character.stats.sanity;
      const { events, stop } = recordEvents();
      tickActivity(s, { move: { x: 0, y: 0 }, hold: true }, 0.1);
      stop();
      expect(a.act.kind, kind).not.toBe("fight");
      expect(b.act.kind, kind).not.toBe("fight");
      expect(events.some((e) => e.type === "fight-stopped"), kind).toBe(true);
      expect(s.character.stats.sanity, kind).toBeLessThan(sanity);
    }
  });
});

describe("ресурси й ревнощі (§9.4)", () => {
  it("один лоток на двох котів сварить їх", () => {
    const save = game();
    const a = withCat(save, { territorial: 2 });
    const b = withCat(save, {}, { x: 5.5, y: 8.5 });
    const litter = save.current.home.items.find((it) => it.kind === "litter");
    if (!litter) throw new Error("немає лотка");
    for (let i = 0; i < 40; i++) {
      // Другий кіт сидить біля лотка (сварка — лише з котом поруч, §9.4), а не на підвіконні чи деінде.
      Object.assign(b, { x: itemTile(litter).x + 1.5, y: itemTile(litter).y + 0.5, act: idleAct(30) });
      a.needs.toilet = 100;
      decide(save.current, a, createRng(i), { present: false });
      for (let t = 0; t < 20 && a.act.kind === "toilet"; t++) tickCats(save.current, 1, { present: false });
      const box = save.current.home.items.find((it) => it.kind === "litter");
      if (box?.kind === "litter") box.uses = 0;
    }
    expect(relation(save.current, a, b)).toBeLessThan(0);
  });

  it("сварка за миску — лише з котом, що не спить: на сплячого сусіда не шипить (перевірка стосунків 2026-10-26)", () => {
    const hisses = (sleeping: boolean): number => {
      let count = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
        save.current.minute = 12 * 60;
        const bowls = save.current.home.items.filter((it) => it.kind === "bowl");
        save.current.home.items = save.current.home.items.filter((it) => it.kind !== "bowl" || it === bowls[0]);
        const bowl = bowls[0];
        if (bowl?.kind !== "bowl") throw new Error("немає миски");
        Object.assign(bowl, { food: 3, foodQuality: "cheap" });
        const tile = itemTile(bowl);
        const a = withCat(save, {}, tile);
        const b = withCat(save, {}, { x: tile.x + 1, y: tile.y });
        a.needs.hunger = 80;
        a.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.01, elapsed: 0 };
        b.act = sleeping ? { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 } : idleAct(300);
        const { events, stop } = recordEvents();
        tickCats(save.current, 0.05, { present: false });
        stop();
        if (events.some((e) => e.type === "hissed" && e.cat === a.id && e.at === b.id)) count++;
      }
      return count;
    };
    expect(hisses(false)).toBeGreaterThan(0);
    expect(hisses(true)).toBe(0);
  });

  it("ревнивий кіт сердиться, коли персонаж гладить іншого", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save, { jealousy: 2 });
    jealousy(save.current, a);
    expect(relation(save.current, a, b)).toBe(-2);
  });
});
