// Бійки ворогів (§9.4, рішення автора 2026-10-26, `RELATIONS_REVIEW.md` Б1, Б2, Б4): протистояння, торкання, бійка чи відступ.

import { describe, expect, it } from "vitest";

import { pickUpCat, tap } from "../src/sim/actions";
import { giveCatnip } from "../src/sim/care";
import { createCat } from "../src/sim/cat";
import { decide, tickCats } from "../src/sim/catai";
import { addSupply } from "../src/sim/economy";
import { onEvent, type GameEvent } from "../src/sim/events";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, Save, TraitLevel } from "../src/sim/types";
import { poseOf, showsFightBubble } from "../src/view/pose";
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
  for (let i = 0; i < 40_000 && !met(a); i++) {
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

  it("вороги поруч сходяться в середньому раз на ~100 хвилин (1% за хвилину), а не щодесять хвилин", () => {
    // Заміри 2026-10-26: з 10% за хвилину вороги сходилися 14–75 разів на день і билися 2–10 разів замість 3–5 і ~1 (§9.4).
    let total = 0;
    const runs = 40;
    for (let seed = 0; seed < runs; seed++) {
      const { save, a, b } = enemies(seed);
      let minutes = 0;
      for (let i = 0; i < 40_000 && a.act.kind !== "standoff"; i++) {
        calm(a);
        calm(b);
        Object.assign(a, A_AT);
        Object.assign(b, B_AT);
        a.act = idle();
        b.act = idle();
        tickCats(save.current, 0.25, { present: false });
        minutes += 0.25;
      }
      total += minutes;
    }
    expect(total / runs).toBeGreaterThan(60);
    expect(total / runs).toBeLessThan(160);
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
      expect(a.act.target).toBe("won");
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

/** Довести протистояння до кінця; якщо почалася бійка — дочекатися й її кінця без втручання. */
function fightToEnd(save: Save, a: Cat, b: Cat): { loser: Cat; winner: Cat } | null {
  untilStandoff(save, a, b);
  untilSettled(save, a, b);
  if (a.act.kind !== "fight") return null;
  const loser = a.act.lost === true ? a : b;
  const winner = loser === a ? b : a;
  for (let i = 0; i < 100 && (a.act.kind === "fight" || b.act.kind === "fight"); i++) {
    calm(a);
    calm(b);
    tickCats(save.current, 0.1, { present: false });
  }
  return { loser, winner };
}

const injured = (cat: Cat): boolean => cat.diseases.some((d) => d.id === "injury");

describe("після бійки (§9.4, рішення автора 2026-10-26)", () => {
  it("нерозборонена бійка: той, хто програв, ховається 15–30 хвилин, переможець сидить; травма — лише тому, хто програв (10%, некастрованому самцю ×2)", () => {
    const fights = { plain: 0, intact: 0 };
    const injuries = { plain: 0, intact: 0 };
    for (const kind of ["plain", "intact"] as const) {
      for (let seed = 0; seed < 150; seed++) {
        // «Територіальність» обох +2: бійка з шансом 80% (некастрованим — завжди).
        const { save, a, b } = enemies(seed, { territorial: 2 }, { territorial: 2 });
        if (kind === "intact") {
          for (const cat of [a, b]) Object.assign(cat, { sterilized: false, sex: "male" });
        }
        const end = fightToEnd(save, a, b);
        if (!end) continue;
        fights[kind]++;
        expect(end.loser.act.lost, "у того, хто програв, бійка вже скінчилася").toBeUndefined();
        expect(injured(end.winner)).toBe(false);
        expect(end.winner.act.kind).toBe("idle");
        expect(end.winner.act.target).toBe("won");
        expect(end.loser.act.kind).toBe("hide");
        expect(end.loser.act.minutes).toBeGreaterThanOrEqual(14);
        expect(end.loser.act.minutes).toBeLessThanOrEqual(30);
        if (injured(end.loser)) injuries[kind]++;
      }
    }
    expect(fights.plain).toBeGreaterThan(90);
    expect(fights.intact).toBe(150);
    expect(injuries.plain).toBeGreaterThanOrEqual(3);
    expect(injuries.plain).toBeLessThanOrEqual(25);
    expect(injuries.intact).toBeGreaterThanOrEqual(15);
    expect(injuries.intact).toBeLessThanOrEqual(50);
    expect(injuries.intact).toBeGreaterThan(injuries.plain);
  });

  it("після бійки пара 90–120 хвилин не б'ється: протистояння закінчується відступом", () => {
    let checked = false;
    for (let seed = 0; seed < 20 && !checked; seed++) {
      const { save, a, b } = enemies(seed, { territorial: 2 }, { territorial: 2 });
      const s = save.current;
      if (!fightToEnd(save, a, b)) continue;
      checked = true;
      const now = absoluteMinute(s.day, s.minute);
      const until = a.truce?.[b.id] ?? 0;
      expect(until - now).toBeGreaterThanOrEqual(90);
      expect(until - now).toBeLessThanOrEqual(120);
      expect(b.truce?.[a.id]).toBe(until);
      let fights = 0;
      let retreats = 0;
      const stop = onEvent((e) => {
        if (e.type === "cat-fight") fights++;
        if (e.type === "cat-retreated") retreats++;
      });
      // Час у `tickCats` стоїть: усі ці протистояння — під час паузи.
      for (let i = 0; i < 10; i++) {
        untilStandoff(save, a, b);
        untilSettled(save, a, b);
      }
      expect(fights).toBe(0);
      expect(retreats).toBe(10);
      // Пауза минула — знову б'ються.
      s.minute += 121;
      for (let i = 0; i < 10; i++) {
        untilStandoff(save, a, b);
        untilSettled(save, a, b);
      }
      stop();
      expect(fights).toBeGreaterThan(0);
    }
    expect(checked).toBe(true);
  });

  it("вільний кіт, до якого ворог ближче 2 клітинок, відходить від нього на 3 клітинки; від нейтрального — ні", () => {
    for (const relation of [-80, 0]) {
      const { save, a, b } = enemies();
      const s = save.current;
      s.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = relation;
      Object.assign(a, { x: 9.3, y: 8.5 });
      Object.assign(b, { x: 10.7, y: 8.5 });
      a.act = idle();
      // Другий грається сам: зайнятий, тож не відходить і сам.
      b.act = { kind: "toy", target: null, goal: null, minutes: 30, elapsed: 0 };
      tickCats(s, FRAME, { present: false });
      if (relation === 0) {
        expect(a.act.kind).toBe("idle");
        continue;
      }
      expect(a.act.kind).toBe("wander");
      expect(a.act.target).toBe("avoid");
      const goal = a.act.goal;
      if (!goal) throw new Error("відходить без цілі");
      expect(Math.hypot(goal.x + 0.5 - b.x, goal.y + 0.5 - b.y)).toBeGreaterThanOrEqual(3);
      expect(b.act.kind).toBe("toy");
    }
  });

  it("кіт не йде по увагу до персонажа, біля якого вже стоїть його ворог", () => {
    const { save, a, b } = enemies();
    const s = save.current;
    Object.assign(s.character.body, { x: 12.5, y: 8.5 });
    Object.assign(b, { x: 12.5, y: 9.2 });
    b.act = idle();
    Object.assign(a, { x: 5.5, y: 8.5 });
    a.needs.attention = 100;
    decide(s, a, createRng(1), { present: true });
    expect(a.act.kind).not.toBe("attention");
    // Ворог відійшов від персонажа — іде.
    Object.assign(b, { x: 17.5, y: 7.5 });
    decide(s, a, createRng(1), { present: true });
    expect(a.act.kind).toBe("attention");
  });
});

describe("бійку видно й чути (§9.4, рішення автора 2026-10-26, Б4)", () => {
  it("бійка не з протистояння (котяча м'ята) — нападник підбігає, і обидва стають за 0,6 клітинки обличчям одне до одного", () => {
    const save = game();
    const s = save.current;
    const cat = withCat(save, { catnip: -2 }, { x: 9.5, y: 7.5 });
    addSupply(s, "catnip", "cheap", 5);
    pickUpCat(s, cat);
    const other = withCat(save, {}, { x: 11.5, y: 8.5 });
    other.act = idle(60);
    giveCatnip(s, "cheap", createRng(1));
    expect(cat.act.kind).toBe("zoomies");
    // Догасав за 1,9 клітинки від іншого кота.
    Object.assign(cat, { x: 9.6, y: 8.4 });
    cat.act.minutes = 0.1;
    for (let i = 0; i < 20 && cat.act.kind !== "fight"; i++) tickCats(s, 0.05, { present: false });
    expect(cat.act.kind).toBe("fight");
    expect(cat.act.goal).not.toBeNull();
    expect(other.act.kind).toBe("fight");
    for (let i = 0; i < 100 && cat.act.paired !== true; i++) tickCats(s, 0.05, { present: false });
    expect(cat.act.paired).toBe(true);
    expect(other.act.paired).toBe(true);
    expect(Math.abs(cat.x - other.x)).toBeCloseTo(0.6, 5);
    expect(cat.y).toBe(other.y);
    const [left, right] = cat.x < other.x ? [cat, other] : [other, cat];
    expect(left.facing).toBe(1);
    expect(right.facing).toBe(-1);
  });

  it("бійка — гучний звук для котів: сплячий кіт у тій самій кімнаті може прокинутися, в іншій кімнаті — ні", () => {
    const woke = { living: 0, bedroom: 0 };
    let fights = 0;
    for (const room of ["living", "bedroom"] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const { save, a, b } = enemies(seed, { territorial: 2 }, { territorial: 2 });
        const sleeper = withCat(save, {}, room === "living" ? { x: 9.5, y: 10.3 } : { x: 3.5, y: 3.5 });
        sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 0 };
        let fought = false;
        const stop = onEvent((e) => {
          if (e.type === "cat-fight") fought = true;
          if (e.type === "cat-woke" && e.cat === sleeper.id && fought) woke[room]++;
        });
        untilStandoff(save, a, b);
        sleeper.needs.fatigue = 100;
        untilSettled(save, a, b);
        stop();
        if (fought) fights++;
      }
    }
    expect(fights).toBeGreaterThan(30);
    expect(woke.living).toBeGreaterThan(3);
    expect(woke.bedroom).toBe(0);
  });

  it("бійка біля столу з шансом 15% скидає з нього страву чи дрібничку", () => {
    let fights = 0;
    let knocked = 0;
    for (let seed = 0; seed < 80; seed++) {
      const save = game(seed);
      const s = save.current;
      // На кухні під столом: за 2,4 клітинки одне від одного.
      const a = withCat(save, { territorial: 2 }, { x: 13.3, y: 4.5 });
      const b = withCat(save, { territorial: 2 }, { x: 15.7, y: 4.5 });
      s.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = -80;
      s.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      let fought = false;
      const stop = onEvent((e) => {
        if (e.type === "cat-fight") {
          fought = true;
          fights++;
        }
        if ((e.type === "knocked" || e.type === "trinket-fell") && fought) knocked++;
      });
      for (let i = 0; i < 40_000 && !fought; i++) {
        calm(a);
        calm(b);
        if (a.act.kind !== "standoff" && b.act.kind !== "standoff" && a.act.kind !== "fight") {
          Object.assign(a, { x: 13.3, y: 4.5 });
          Object.assign(b, { x: 15.7, y: 4.5 });
          a.act = idle();
          b.act = idle();
        }
        tickCats(s, 0.25, { present: false });
      }
      stop();
    }
    expect(fights).toBe(80);
    expect(knocked).toBeGreaterThanOrEqual(4);
    expect(knocked).toBeLessThanOrEqual(24);
  });
});

describe("пози протистояння й бійки (§9.4, «Пози стосунків»)", () => {
  it("хто підходить до ворога — іде, хто чекає й хто вже зійшовся — «спина дугою»", () => {
    const { save, a, b } = enemies();
    const s = save.current;
    // Протистояння почалося, але коти ще не зійшлися: сміливіший іде, другий чекає.
    for (let i = 0; i < 40_000 && a.act.kind !== "standoff"; i++) {
      calm(a);
      calm(b);
      Object.assign(a, A_AT);
      Object.assign(b, B_AT);
      a.act = idle();
      b.act = idle();
      tickCats(s, 0.25, { present: false });
    }
    const [mover, waiter] = a.act.goal !== null ? [a, b] : [b, a];
    expect(mover.act.goal).not.toBeNull();
    expect(poseOf(mover, false)).toBe("walk");
    expect(poseOf(waiter, false)).toBe("arch");
    untilStandoff(save, a, b);
    expect(poseOf(a, false)).toBe("arch");
    expect(poseOf(b, false)).toBe("arch");
  });

  it("бійка: нападник біжить, другий чекає дугою; зійшлися — обидва «клубок бійки», і бабл «бійка» один на двох", () => {
    const save = game();
    const s = save.current;
    const cat = withCat(save, { catnip: -2 }, { x: 9.5, y: 7.5 });
    addSupply(s, "catnip", "cheap", 5);
    pickUpCat(s, cat);
    const other = withCat(save, {}, { x: 11.5, y: 8.5 });
    other.act = idle(60);
    giveCatnip(s, "cheap", createRng(1));
    Object.assign(cat, { x: 9.6, y: 8.4 });
    cat.act.minutes = 0.1;
    for (let i = 0; i < 20 && cat.act.kind !== "fight"; i++) tickCats(s, 0.05, { present: false });
    expect(cat.act.kind).toBe("fight");
    expect(poseOf(cat, false)).toBe("walk");
    expect(poseOf(other, false)).toBe("arch");
    // Поки нападник біжить, бабл «бійка» — над кожним.
    expect(showsFightBubble(s, cat)).toBe(true);
    expect(showsFightBubble(s, other)).toBe(true);
    for (let i = 0; i < 100 && cat.act.paired !== true; i++) tickCats(s, 0.05, { present: false });
    expect(poseOf(cat, false)).toBe("brawl");
    expect(poseOf(other, false)).toBe("brawl");
    expect([cat, other].filter((c) => showsFightBubble(s, c))).toHaveLength(1);
  });
});
