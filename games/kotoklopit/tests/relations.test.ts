// Стосунки між котами (§9.4): початок, ночі, ігри друзів, бійки ворогів, ресурси, ревнощі.

import { describe, expect, it } from "vitest";

import { pickUpCat, tickActivity } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, enoughFor, jealousy, tickCats } from "../src/sim/catai";
import { goToSleep, newGame } from "../src/sim/game";
import { itemTile, objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { isNewcomer, nightlyRelations, noteStrife, relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, LitterItem, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

function game(seed = 5): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.minute = 19 * 60;
  return save;
}

// Дорослий, не старий (старший за 5 тижнів кличе гратися вдвічі рідше, Г7).
function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 8.5 }, ageWeeks = 3): Cat {
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

/** Шанси: скільки разів так проти скількох інакше. */
const odds = (count: number, of: number): number => count / Math.max(1, of - count);

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

  it("щоночі життя разом додає 3 (рішення автора 2026-10-26 після блоку 2; спершу, Г1, — 1, а ще раніше 0,5)", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBe(3);
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

  it("приятелі (від +20) граються удвічі рідше, ніж друзі, але не вилизують одне одного й не сплять купкою (рішення автора 2026-10-26, Г1)", () => {
    const chosen = (value: number, kind: "wrestle" | "groom" | "pile"): number => {
      let count = 0;
      for (let seed = 0; seed < 400; seed++) {
        const save = game();
        const a = withCat(save, {}, { x: 8.5, y: 8.5 });
        // Ближче 2 клітинок: в інший час вилизують лише такого друга (§9.4, рішення автора 2026-10-26, В2).
        const b = withCat(save, {}, { x: 10.3, y: 8.5 });
        setRelation(save, a, b, value);
        b.act = kind === "pile" ? { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 } : idleAct(30);
        if (kind === "wrestle") a.needs.play = 100;
        if (kind === "pile") a.needs.fatigue = 100;
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === (kind === "pile" ? "sleep" : kind) && (a.act.target === `cat:${b.id}` || a.act.target === `pile:${b.id}`)) count++;
      }
      return count;
    };
    const friends = chosen(80, "wrestle");
    const pals = chosen(30, "wrestle");
    expect(chosen(15, "wrestle")).toBe(0);
    expect(pals).toBeGreaterThan(friends * 0.3);
    expect(pals).toBeLessThan(friends * 0.75);
    expect(chosen(80, "groom")).toBeGreaterThan(0);
    expect(chosen(30, "groom")).toBe(0);
    expect(chosen(80, "pile")).toBeGreaterThan(0);
    expect(chosen(30, "pile")).toBe(0);
  });

  it("кошеня кличе гратися будь-кого, хто не ворог, — і з вагою 1,5 замість 0,6 (рішення автора 2026-10-26, Г2)", () => {
    const chosen = (value: number, kittenAge: number, mateAge = 3): number => {
      let count = 0;
      for (let seed = 0; seed < 400; seed++) {
        const save = game();
        const a = withCat(save, {}, { x: 8.5, y: 8.5 }, kittenAge);
        const b = withCat(save, {}, { x: 10.5, y: 8.5 }, mateAge);
        setRelation(save, a, b, value);
        b.act = idleAct(30);
        a.needs.play = 100;
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === "wrestle" && a.act.target === `cat:${b.id}`) count++;
      }
      return count;
    };
    // Нейтральний дорослий, нейтральне кошеня — кличе; ворога — ні.
    expect(chosen(0, 1)).toBeGreaterThan(0);
    expect(chosen(0, 1, 1)).toBeGreaterThan(0);
    expect(chosen(-60, 1)).toBe(0);
    // Дорослий нейтрального не кличе, а друга кличе рідше, ніж кошеня: вага × 2,5 — і шанси (гра проти решти забав) ~ ×2,5.
    expect(chosen(0, 3)).toBe(0);
    expect(odds(chosen(80, 1), 400)).toBeGreaterThan(odds(chosen(80, 3), 400) * 1.8);
  });

  it("«Сам ще кошеня» й кошеня, що не друзі, разом не граються: він таких кошенят відганяє (перевірка блоку 2)", () => {
    const chosen = (value: number, nurturing: TraitLevel, kittenCalls: boolean): number => {
      let count = 0;
      for (let seed = 0; seed < 300; seed++) {
        const save = game();
        const kitten = withCat(save, {}, { x: 8.5, y: 8.5 }, 1);
        const adult = withCat(save, { nurturing }, { x: 10.5, y: 8.5 });
        setRelation(save, kitten, adult, value);
        const [caller, mate] = kittenCalls ? [kitten, adult] : [adult, kitten];
        mate.act = idleAct(30);
        caller.needs.play = 100;
        decide(save.current, caller, createRng(seed), { present: false });
        if (caller.act.kind === "wrestle" && caller.act.target === `cat:${mate.id}`) count++;
      }
      return count;
    };
    // Нейтральний і приятель — ні кошеня його не кличе, ні він кошеня; «Байдужий до малечі» — так само.
    expect(chosen(0, -2, true)).toBe(0);
    expect(chosen(30, -2, true)).toBe(0);
    expect(chosen(30, -2, false)).toBe(0);
    expect(chosen(0, -1, true)).toBe(0);
    // Друзі граються, як і завжди; «Нянька» — і нейтральна.
    expect(chosen(60, -2, true)).toBeGreaterThan(0);
    expect(chosen(60, -2, false)).toBeGreaterThan(0);
    expect(chosen(0, 2, true)).toBeGreaterThan(0);
  });

  it("з вільним другом поруч кіт, що хоче гратися, найчастіше кличе гратися його: вага 3 (рішення автора 2026-10-26 після блоку 2, заміри блоку 4; було 0,6)", () => {
    let count = 0;
    for (let seed = 0; seed < 400; seed++) {
      const save = game();
      const a = withCat(save, {}, { x: 8.5, y: 8.5 });
      const b = withCat(save, {}, { x: 10.5, y: 8.5 });
      setRelation(save, a, b, 80);
      b.act = idleAct(30);
      a.needs.play = 100;
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "wrestle" && a.act.target === `cat:${b.id}`) count++;
    }
    // З вагою 0,6 — близько 20% рішень, з 3 — понад половину.
    expect(count / 400).toBeGreaterThan(0.45);
  });

  it("старий кличе друга гратися вдвічі рідше, «Ігривість» — ±50% за одиницю, «Нудьгар» не кличе (рішення автора 2026-10-26, Г7)", () => {
    const chosen = (traits: Record<string, TraitLevel>, ageWeeks = 3): number => {
      let count = 0;
      for (let seed = 0; seed < 600; seed++) {
        const save = game();
        const a = withCat(save, traits, { x: 8.5, y: 8.5 }, ageWeeks);
        const b = withCat(save, {}, { x: 10.5, y: 8.5 });
        setRelation(save, a, b, 80);
        b.act = idleAct(30);
        a.needs.play = 100;
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === "wrestle" && a.act.target === `cat:${b.id}`) count++;
      }
      return count;
    };
    // Вага множиться — і шанси гри проти решти забав множаться так само (з вагою 3 імовірність уже насичується, блок 4).
    const plain = odds(chosen({}), 600);
    expect(odds(chosen({}, 6), 600)).toBeLessThan(plain * 0.7);
    expect(odds(chosen({}, 6), 600)).toBeGreaterThan(plain * 0.3);
    expect(odds(chosen({ playful: 2 }), 600)).toBeGreaterThan(plain * 1.5);
    expect(odds(chosen({ playful: -1 }), 600)).toBeLessThan(plain * 0.7);
    expect(chosen({ playful: -2 })).toBe(0);
  });

  it("брати й сестри починають з +50 — одразу друзі (рішення автора 2026-10-26, Г2: було +30)", () => {
    const save = game();
    const mother = withCat(save, {}, { x: 8.5, y: 8.5 });
    const born = (): Cat => {
      const kitten = createCat(save.current, createRng(save.current.cats.length + 7), { source: "born", ageWeeks: 1, at: { x: 9.5, y: 8.5 } });
      kitten.traits = [];
      kitten.parents = { mother: mother.id, father: null };
      addCat(save.current, kitten);
      return kitten;
    };
    const a = born();
    const b = born();
    expect(relation(save.current, a, b)).toBe(50);
    expect(relation(save.current, mother, a)).toBe(70);
  });

  it("друг із сусідньої кімнати дочікується: хвилини гри йдуть обом від зустрічі (перевірка стосунків 2026-10-26)", () => {
    let sessions = 0;
    for (let seed = 0; seed < 60 && sessions < 5; seed++) {
      const save = game();
      // Кухня — вітальня, ближче 4 клітинок (Г6): шлях крізь двері довший за відстань по прямій.
      const a = withCat(save, {}, { x: 13.5, y: 3.5 });
      const b = withCat(save, {}, { x: 15.5, y: 6.5 });
      setRelation(save, a, b, 80);
      a.needs.play = 100;
      b.needs.play = 100;
      b.act = idleAct(30);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind !== "wrestle") continue;
      sessions++;
      let together = 0;
      for (let t = 0; t < 300 && (a.act.kind === "wrestle" || b.act.kind === "wrestle"); t++) {
        if (a.act.kind === "wrestle" && a.act.goal === null && b.act.kind === "wrestle") together += 0.1;
        tickCats(save.current, 0.1, { present: false });
      }
      expect(together).toBeGreaterThan(2.5);
      expect(a.needs.play).toBeLessThan(70);
      expect(b.needs.play).toBeLessThan(70);
    }
    expect(sessions).toBe(5);
  });

  it("підійшовши гратися чи вилизати, кіт стає впритул збоку й обличчям до друга, а не на нього (перевірка стосунків 2026-10-26)", () => {
    for (const kind of ["wrestle", "groom"] as const) {
      let arrived = 0;
      for (let seed = 0; seed < 300 && arrived < 5; seed++) {
        const save = game();
        // Ближче 2 клітинок — вилизують і в звичайний час (§9.4, В2).
        const a = withCat(save, {}, { x: 8.7, y: 8.5 });
        // Друг — у центрі клітинки: туди веде шлях.
        const b = withCat(save, {}, { x: 10.5, y: 8.5 });
        setRelation(save, a, b, 80);
        b.act = idleAct(30);
        a.needs.play = kind === "wrestle" ? 100 : 0;
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind !== kind || a.act.target !== `cat:${b.id}`) continue;
        for (let t = 0; t < 40 && a.act.goal !== null; t++) tickCats(save.current, 0.05, { present: false });
        expect(a.act.kind, kind).toBe(kind);
        arrived++;
        // У грі друг, на якого чатують, одразу відходить (засідка, §9.4, рішення автора 2026-10-26, Г3): міряємо від того, де він
        // чекав; той, хто прибіг, чатує на нього обличчям до нього.
        const at = kind === "wrestle" ? { x: 10.5, y: 8.5 } : b;
        const gap = Math.hypot(a.x - at.x, a.y - at.y);
        expect(gap, kind).toBeGreaterThan(0.3);
        expect(gap, kind).toBeLessThan(0.6);
        expect(a.facing, kind).toBe(b.x > a.x ? 1 : -1);
      }
      expect(arrived, kind).toBe(5);
    }
  });

  it("друг пішов посеред гри — гри немає нікому", () => {
    const save = game();
    const a = withCat(save, {}, { x: 8.5, y: 8.5 });
    const b = withCat(save, {}, { x: 9.5, y: 8.5 });
    setRelation(save, a, b, 80);
    let seed = 0;
    for (; seed < 300; seed++) {
      a.needs.play = 100;
      b.needs.play = 100;
      b.act = idleAct(30);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "wrestle") break;
    }
    expect(a.act.kind).toBe("wrestle");
    for (let t = 0; t < 20 && a.act.goal !== null; t++) tickCats(save.current, 0.1, { present: false });
    tickCats(save.current, 0.5, { present: false });
    expect(b.act.kind).toBe("wrestle");
    // Друга покликали (корм, руки персонажа) — він пішов.
    b.act = idleAct(30);
    for (let t = 0; t < 10; t++) tickCats(save.current, 0.5, { present: false });
    expect(a.needs.play).toBeGreaterThan(90);
    expect(relation(save.current, a, b)).toBe(80);
  });

  it("за другом нагору не лізуть ні гратися, ні вилизувати (перевірка стосунків 2026-10-26: кошеня застрягало на шафі)", () => {
    const wardrobe = objectById("wardrobe");
    let chosen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const save = game();
      const b = withCat(save, {}, { x: wardrobe.x + 0.5, y: wardrobe.y + 0.5 });
      const kitten = withCat(save, {}, { x: wardrobe.x + 0.5, y: wardrobe.y + 2.5 }, 1);
      setRelation(save, kitten, b, 80);
      b.act = seed % 2 === 0 ? idleAct(30) : { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
      kitten.needs.play = seed % 4 < 2 ? 100 : 0;
      decide(save.current, kitten, createRng(seed), { present: false });
      if (kitten.act.target === `cat:${b.id}`) chosen++;
    }
    expect(chosen).toBe(0);
  });

  it("вилизують лише друга, що відпочиває, — найближчого; друг відійшов — вилизування скасовується (перевірка стосунків 2026-10-26)", () => {
    const groomChoices = (setFriend: (b: Cat, save: Save) => void): number => {
      let chosen = 0;
      for (let seed = 0; seed < 200; seed++) {
        const save = game();
        const a = withCat(save, {}, { x: 9.5, y: 8.5 });
        const b = withCat(save, {}, { x: 11.3, y: 8.5 });
        setRelation(save, a, b, 80);
        setFriend(b, save);
        decide(save.current, a, createRng(seed), { present: false });
        if (a.act.kind === "groom" && a.act.target === `cat:${b.id}`) chosen++;
      }
      return chosen;
    };
    expect(groomChoices((b) => (b.act = idleAct(30)))).toBeGreaterThan(0);
    expect(groomChoices((b) => (b.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 }))).toBeGreaterThan(0);
    // Іде геть, у лотку, б'ється — не вилизують.
    expect(groomChoices((b) => (b.act = { kind: "wander", target: null, goal: { x: 17, y: 9 }, minutes: 5, elapsed: 0 }))).toBe(0);
    expect(
      groomChoices((b, save) => {
        const box = save.current.home.items.find((it) => it.kind === "litter");
        b.act = { kind: "toilet", target: `item:${box?.id ?? 0}`, goal: null, minutes: 2, elapsed: 0 };
      }),
    ).toBe(0);
    expect(groomChoices((b) => (b.act = { kind: "fight", target: "cat:999", goal: null, minutes: 2, elapsed: 0 }))).toBe(0);

    // Найближчого: дальній друг — перший у списку котів.
    const save = game();
    const a = withCat(save, {}, { x: 9.5, y: 8.5 });
    const far = withCat(save, {}, { x: 11.2, y: 8.5 });
    const near = withCat(save, {}, { x: 10.5, y: 8.5 });
    setRelation(save, a, far, 80);
    setRelation(save, a, near, 80);
    const targets = new Set<string | null>();
    for (let seed = 0; seed < 100; seed++) {
      for (const c of [a, far, near]) c.act = idleAct(30);
      decide(save.current, a, createRng(seed), { present: false });
      if (a.act.kind === "groom") targets.add(a.act.target);
    }
    expect([...targets]).toEqual([`cat:${near.id}`]);

    // Дійшов, а друг відійшов — не сидить сам 3 хвилини.
    a.act = { kind: "groom", target: `cat:${near.id}`, goal: null, minutes: 3, elapsed: 0 };
    near.act = { kind: "wander", target: null, goal: null, minutes: 30, elapsed: 0 };
    Object.assign(near, { x: 13.5, y: 8.5 });
    tickCats(save.current, 0.5, { present: false });
    expect(a.act.kind === "groom" && a.act.target === `cat:${near.id}`).toBe(false);
  });

  it("кота, якого гладять, боротися не забирають", () => {
    let chosen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const save = game();
      Object.assign(save.current.character.body, { x: 9.5, y: 9.5 });
      const b = withCat(save, {}, { x: 9.5, y: 8.5 });
      const a = withCat(save, {}, { x: 6.5, y: 8.5 });
      setRelation(save, a, b, 80);
      b.act = idleAct(30);
      save.current.character.activity = { kind: "pet", cat: b.id, minutes: 0.5 };
      a.needs.play = 100;
      decide(save.current, a, createRng(seed), { present: true });
      if (a.act.kind === "wrestle") chosen++;
    }
    expect(chosen).toBe(0);
  });
});

describe("новий дорослий кіт (§9.4, рішення автора 2026-10-26, Б5 а)", () => {
  /** Кіт щойно прийшов у дім: день появи — сьогодні. */
  function newcomer(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 7.5, y: 7.5 }, ageWeeks = 3): Cat {
    const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks, at });
    cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
    cat.arrivedDay = save.current.day;
    calm(cat);
    addCat(save.current, cat);
    return cat;
  }

  it("починає з −10…−30: −20 і ±2,5 за одиницю «Товариськості» обох; з кошеням — ще +20, як і завжди", () => {
    const save = game();
    const plain = withCat(save, {}, { x: 5.5, y: 8.5 });
    const social = withCat(save, { sociability: 2 }, { x: 6.5, y: 8.5 });
    const grumpy = withCat(save, { sociability: -2 }, { x: 7.5, y: 8.5 });
    const kitten = withCat(save, {}, { x: 8.5, y: 8.5 }, 1);
    const fresh = newcomer(save);
    expect(relation(save.current, fresh, plain)).toBe(-20);
    expect(relation(save.current, fresh, social)).toBe(-15);
    expect(relation(save.current, fresh, grumpy)).toBe(-25);
    expect(relation(save.current, fresh, kitten)).toBe(0);
    expect(relation(save.current, newcomer(save, { sociability: 2 }), social)).toBe(-10);
    expect(relation(save.current, newcomer(save, { sociability: -2 }), grumpy)).toBe(-30);
    // Кошеня з притулку — як і раніше: +20 з дорослим.
    expect(relation(save.current, newcomer(save, {}, { x: 9.5, y: 9.5 }, 1), plain)).toBe(20);
  });

  it("перші 2 дні на нього шиплять, коли проходить ближче 2 клітинок: 30% × (1 − 0,25 × «Товариськість»), стосунки −1, без бійок", () => {
    const hisses = (traits: Record<string, TraitLevel>, opts: { daysAgo?: number; kitten?: boolean } = {}): number => {
      let count = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const save = game(seed);
        const resident = withCat(save, traits, { x: 9.5, y: 8.5 }, opts.kitten === true ? 1 : 3);
        resident.act = idleAct(60);
        const fresh = newcomer(save);
        fresh.arrivedDay = save.current.day - (opts.daysAgo ?? 0);
        const start = relation(save.current, resident, fresh);
        // Новий кіт іде повз — через клітинку від того, хто живе тут давно.
        fresh.act = { kind: "wander", target: null, goal: { x: 12, y: 7 }, minutes: 8, elapsed: 0 };
        const { events, stop } = recordEvents();
        for (let t = 0; t < 2; t += 0.25) {
          save.current.minute += 0.25;
          tickCats(save.current, 0.25, { present: false });
        }
        stop();
        const hissed = events.filter((e) => e.type === "hissed" && e.cat === resident.id && e.at === fresh.id).length;
        expect(hissed, "раз за зустріч").toBeLessThanOrEqual(1);
        expect(events.some((e) => e.type === "standoff" || e.type === "cat-fight")).toBe(false);
        expect(relation(save.current, resident, fresh)).toBe(start - hissed);
        count += hissed;
      }
      return count;
    };
    const plain = hisses({});
    expect(plain).toBeGreaterThan(20);
    expect(plain).toBeLessThan(55);
    expect(hisses({ sociability: 2 })).toBeLessThan(plain);
    expect(hisses({ sociability: -2 })).toBeGreaterThan(plain);
    // Минуло 2 дні — уже не новий; кошеня на новенького не шипить.
    expect(hisses({}, { daysAgo: 2 })).toBe(0);
    expect(hisses({}, { kitten: true })).toBe(0);
  });

  it("за перші 2 дні кіт не старшає: кошеня, взяте в неділю, у понеділок — ще кошеня, а не новий дорослий кіт (§9.1, рішення автора 2026-10-27)", () => {
    // До 2026-10-27 вік ріс у ніч на понеділок, і кошеня від заводчика, взяте в неділю, з понеділка вважалося новим дорослим.
    for (const arrivedAge of [2, 3]) {
      const save = game(1);
      save.current.day = 13;
      save.current.modifiers.day = null;
      const fresh = newcomer(save, {}, { x: 7.5, y: 7.5 }, arrivedAge);
      save.current.minute = 22 * 60;
      goToSleep(save);
      const cat = save.current.cats.find((c) => c.id === fresh.id);
      expect(save.current.day).toBe(14);
      expect(cat?.ageWeeks).toBe(arrivedAge);
      expect(cat && isNewcomer(save.current, cat)).toBe(arrivedAge > 2);
    }
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

  /**
   * До бійки — протистояння (§9.4, рішення автора 2026-10-26): поки його немає, обидва знову стоять поруч без справ, а
   * протистояння добігає кінця — бійкою чи відступом.
   */
  function untilFight(save: Save, a: Cat, b: Cat): void {
    for (let i = 0; i < 2000 && a.act.kind !== "fight"; i++) {
      calm(a);
      calm(b);
      if (a.act.kind !== "standoff" && b.act.kind !== "standoff") {
        // За 2,4 клітинки: ближче 2 вільні вороги розходяться (§9.4).
        Object.assign(a, { x: 8.3, y: 8.5 });
        Object.assign(b, { x: 10.7, y: 8.5 });
        a.act = { kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0 };
        b.act = { kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0 };
      }
      tickCats(save.current, 0.25, { present: false });
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
      untilFight(save, a, b);
      expect(a.act.kind).toBe("fight");
      // Бійка — там, де коти зійшлися в протистояння (§9.4): персонаж поруч.
      Object.assign(s.character.body, { x: a.x, y: a.y + 0.6 });
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
    const { events, stop } = recordEvents();
    for (let i = 0; i < 40; i++) {
      // Другий кіт сидить біля лотка (сварка — лише з котом поруч, §9.4), а не на підвіконні чи деінде.
      Object.assign(b, { x: itemTile(litter).x + 1.5, y: itemTile(litter).y + 0.5, act: idleAct(30) });
      a.needs.toilet = 100;
      decide(save.current, a, createRng(i), { present: false });
      for (let t = 0; t < 20 && a.act.kind === "toilet"; t++) tickCats(save.current, 1, { present: false });
      const box = save.current.home.items.find((it) => it.kind === "litter");
      if (box?.kind === "litter") box.uses = 0;
    }
    stop();
    expect(relation(save.current, a, b)).toBeLessThan(0);
    // Причину видно: значок лотка поруч зі злістю (§9.4, Р2).
    const hisses = events.filter((e) => e.type === "hissed" && e.cat === a.id);
    expect(hisses.length).toBeGreaterThan(0);
    for (const e of hisses) expect(e).toMatchObject({ why: "litter" });
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

  it("сварка за миску — не крізь стіну: на кота у вітальні за 3 клітинки від миски на кухні не шипить (загальна ревізія 2026-10-29)", () => {
    const hisses = (other: { x: number; y: number }): number => {
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
        const b = withCat(save, {}, { x: tile.x + other.x, y: tile.y + other.y });
        a.needs.hunger = 80;
        a.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.01, elapsed: 0 };
        b.act = idleAct(300);
        const { events, stop } = recordEvents();
        tickCats(save.current, 0.05, { present: false });
        stop();
        if (events.some((e) => e.type === "hissed" && e.cat === a.id && e.at === b.id)) count++;
      }
      return count;
    };
    // Миска на кухні (17;3): за стіною у вітальні (17;6) — 3 клітинки, на кухні (14;3) — теж 3.
    expect(hisses({ x: 0, y: 3 })).toBe(0);
    expect(hisses({ x: -3, y: 0 })).toBeGreaterThan(0);
  });

  it("сварка за миску — стосунки −5, і того дня пара сварилася (§9.4, Б6 (3): було −3)", () => {
    let quarrels = 0;
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
      b.act = idleAct(300);
      const { events, stop } = recordEvents();
      tickCats(save.current, 0.05, { present: false });
      stop();
      if (!events.some((e) => e.type === "hissed" && e.cat === a.id && e.at === b.id)) continue;
      quarrels += 1;
      // Причину видно: значок миски поруч зі злістю (§9.4, Р2).
      expect(events.find((e) => e.type === "hissed")).toMatchObject({ why: "bowl" });
      expect(relation(save.current, a, b)).toBe(-5);
      expect(save.current.strife?.[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`]).toEqual({ quarrel: true });
    }
    expect(quarrels).toBeGreaterThan(5);
  });

  it("пара, що того дня сварилася, уночі не зближується (+3), а «Товариськість» діє; день сварок — заново (§9.4, Б6 (3))", () => {
    const save = game();
    const a = withCat(save, { sociability: 1 });
    const b = withCat(save, { sociability: 1 });
    const c = withCat(save);
    setRelation(save, a, b, 30);
    setRelation(save, a, c, 10);
    setRelation(save, b, c, 10);
    noteStrife(save.current, a, b, "quarrel");
    noteStrife(save.current, b, c, "fight");
    nightlyRelations(save.current);
    // a і b посварилися: лише «Товариськість» (+1,5 × 2); b і c лише билися — життя разом діє.
    expect(relation(save.current, a, b)).toBe(33);
    expect(relation(save.current, b, c)).toBeCloseTo(14.5);
    expect(relation(save.current, a, c)).toBeCloseTo(14.5);
    expect(save.current.strife).toBeUndefined();
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBe(39);
  });

  it("вороги, що за день ані билися, ані сварилися, уночі зближуються ще на 2 (§9.4, Б6 (1))", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    const c = withCat(save);
    const d = withCat(save);
    for (const [x, y] of [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]] as const) setRelation(save, x, y, 0);
    setRelation(save, a, b, -80);
    setRelation(save, c, d, -80);
    setRelation(save, b, c, -80);
    noteStrife(save.current, c, d, "fight");
    noteStrife(save.current, b, c, "quarrel");
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBe(-75);
    expect(relation(save.current, c, d)).toBe(-77);
    expect(relation(save.current, b, c)).toBe(-80);
    // Не вороги — без надбавки.
    expect(relation(save.current, a, c)).toBe(3);
  });

  it("охорона миски — теж сварка за ресурс (§9.4, Б6)", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save);
    noteStrife(save.current, a, b, "quarrel");
    expect(Object.keys(save.current.strife ?? {})).toHaveLength(1);
  });

  it("нестачу рахують чесно: коти вдома без новонароджених, брудний лоток не лоток, від 6 котів — 6 лотків (§9.4, Р3, Р4)", () => {
    const save = game();
    const s = save.current;
    s.home.items = s.home.items.filter((it) => it.kind !== "litter" && it.kind !== "bowl");
    const litters = (n: number): LitterItem[] => {
      s.home.items = s.home.items.filter((it) => it.kind !== "litter");
      const boxes = Array.from({ length: n }, (_, i): LitterItem => ({ id: 900 + i, kind: "litter", quality: "cheap", slot: `litter-${i + 1}`, litter: "cheap", uses: 0 }));
      s.home.items.push(...boxes);
      return boxes;
    };
    const bowls = (n: number): void => {
      s.home.items = s.home.items.filter((it) => it.kind !== "bowl");
      for (let i = 0; i < n; i++) s.home.items.push({ id: 950 + i, kind: "bowl", quality: "cheap", slot: `bowl-${i + 1}`, food: 0, foodQuality: null, sterile: false });
    };
    const cats = [withCat(save), withCat(save), withCat(save)];
    // Троє котів: лотків треба 4, мисок 3.
    litters(4);
    bowls(3);
    expect(enoughFor(s, "litter")).toBe(true);
    expect(enoughFor(s, "bowl")).toBe(true);
    // Брудний лоток не рахується (Р3).
    const boxes = litters(4);
    boxes[0]!.uses = 99;
    expect(enoughFor(s, "litter")).toBe(false);
    // Кіт у поїздці й новонароджений не рахуються (Р4): удома двоє — трьох лотків досить, двох мисок теж.
    litters(3);
    bowls(2);
    expect(enoughFor(s, "litter")).toBe(false);
    cats[2]!.away = "trip";
    expect(enoughFor(s, "litter")).toBe(true);
    expect(enoughFor(s, "bowl")).toBe(true);
    const newborn = withCat(save, {}, { x: 5.5, y: 8.5 }, 0);
    newborn.source = "born";
    expect(enoughFor(s, "litter")).toBe(true);
    cats[2]!.away = null;
    // Шестеро котів: шести чистих лотків і шести мисок досить — місць більше немає.
    while (s.cats.filter((c) => c.ageWeeks > 0).length < 6) withCat(save);
    litters(6);
    bowls(6);
    expect(enoughFor(s, "litter")).toBe(true);
    expect(enoughFor(s, "bowl")).toBe(true);
    withCat(save);
    expect(enoughFor(s, "bowl")).toBe(true);
    litters(5);
    expect(enoughFor(s, "litter")).toBe(false);
  });

  it("ревнивий кіт сердиться, коли персонаж гладить іншого", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save, { jealousy: 2 });
    jealousy(save.current, a);
    expect(relation(save.current, a, b)).toBe(-2);
  });
});
