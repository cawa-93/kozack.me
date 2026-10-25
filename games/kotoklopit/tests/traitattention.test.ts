// Етап «Увага й ласка» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як риси уваги видно з поведінки —
// «Ласкавість», «Терпимість до гладження», «Балакучість», «Тертя об ноги», «Робочий помічник», «Коліна»,
// «Відданість», «Образливість», «Мстивість».

import { describe, expect, it } from "vitest";

import { catFeeling, petTolerance } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { AFFECTION, PET, PETTING, TALKATIVE } from "../src/sim/config";
import { tickCats } from "../src/sim/catai";
import { startWork } from "../src/sim/work";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { catLook } from "../src/view/thoughts";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 4.5, y: 7.6 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

/** Персонаж стоїть під котом на (4,5; 7,6) і дивиться на нього. */
function faceCat(save: Save): void {
  Object.assign(save.current.character.body, { x: 4.5, y: 8.2, facing: { x: 0, y: -1 } });
}

const HOLD = { move: { x: 0, y: 0 }, hold: true };
const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

describe("«Ласкавість» (рішення автора 2026-10-25)", () => {
  it("«Відлюдник», що уваги не хоче, одразу йде з-під руки — без укусу, і утримання не гладить знову", () => {
    const save = game();
    const cat = withCat(save, { affection: -2 });
    faceCat(save);
    const { events, stop } = recordEvents();
    for (let i = 0; i < 20; i++) advance(save, 0.25, HOLD);
    stop();
    expect(events.filter((e) => e.type === "cat-left")).toHaveLength(1);
    expect(events.some((e) => e.type === "bite")).toBe(false);
    expect(cat.act.kind).toBe("wander");
    expect(seen(cat, "affection")).toBe(1);
  });

  it("«Незалежний» терпить хвилину небажаних пестощів, а той, хто уваги хоче, — не йде", () => {
    const save = game();
    const cat = withCat(save, { affection: -1 });
    faceCat(save);
    advance(save, AFFECTION.leaveAfter - 1 - 0.1, HOLD);
    expect(save.current.character.activity).toMatchObject({ kind: "pet" });
    expect(catFeeling(save.current, cat)).toBe("reluctant");
    advance(save, 0.3, HOLD);
    expect(save.current.character.activity).toMatchObject({ kind: "pet", left: true });

    const fond = game();
    const wants = withCat(fond, { affection: -2 });
    wants.needs.attention = 90;
    faceCat(fond);
    advance(fond, 2, HOLD);
    expect(fond.current.character.activity).toMatchObject({ kind: "pet" });
    expect(fond.current.character.activity).not.toHaveProperty("left");
    expect(seen(wants, "affection")).toBe(0);
  });

  it("ласкавий, що прийшов по увагу, бодається головою; кіт без риси — ні", () => {
    const save = game();
    const fond = withCat(save, { affection: 1 }, { x: 4.5, y: 7.5 });
    const plain = withCat(save, {}, { x: 5.2, y: 7.5 });
    for (const cat of [fond, plain]) cat.act = { kind: "attention", target: "character", goal: null, minutes: 10, elapsed: 2, seen: true };
    faceCat(save);
    expect(catLook(save.current, fond)).toBe("nudge");
    expect(catLook(save.current, plain)).toBeNull();
  });
});

describe("«Терпимість до гладження» (рішення автора 2026-10-25)", () => {
  it("за хвилину до кінця терпіння кіт попереджає: невдоволений, хоч уваги ще хоче", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.attention = 100;
    faceCat(save);
    const tolerance = petTolerance(cat);
    advance(save, tolerance - PETTING.warnMinutes - 0.2, HOLD);
    expect(catFeeling(save.current, cat)).toBe("content");
    advance(save, 0.4, HOLD);
    expect(catFeeling(save.current, cat)).toBe("reluctant");
  });

  it("«Терплячий» муркоче довше, ніж витерпів би кіт без риси, — прояв «+», раз за пестощі", () => {
    const save = game();
    const cat = withCat(save, { petting: 1 });
    cat.needs.attention = 100;
    faceCat(save);
    const plain = petTolerance(cat, 0);
    expect(petTolerance(cat)).toBeGreaterThan(plain + 1);
    advance(save, plain - 0.2, HOLD);
    expect(seen(cat, "petting")).toBe(0);
    advance(save, 1, HOLD);
    expect(seen(cat, "petting")).toBe(1);
    advance(save, 1, HOLD);
    expect(seen(cat, "petting")).toBe(1);
    expect(save.current.character.activity).toMatchObject({ kind: "pet" });
    expect(PET.wantsAttention).toBeLessThan(cat.needs.attention);
  });

  it("«Пастка на животику» перевертається животом догори, коли персонаж поруч; «Кусючий» — ні", () => {
    const save = game();
    const trap = withCat(save, { petting: -2 }, { x: 4.5, y: 7.5 });
    const biter = withCat(save, { petting: -1 }, { x: 5.3, y: 7.5 });
    Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
    expect(catLook(save.current, trap)).toBeNull();
    faceCat(save);
    expect(catLook(save.current, trap)).toBe("belly");
    expect(catLook(save.current, biter)).toBeNull();
  });
});

describe("«Балакучість» (рішення автора 2026-10-25)", () => {
  /** Кіт просить уваги поруч із персонажем стільки хвилин; повертає, скільки разів зараховано прояв. */
  const asking = (traits: Record<string, TraitLevel>, minutes: number): { cat: Cat; save: Save } => {
    const save = game();
    faceCat(save);
    const cat = withCat(save, traits, { x: 4.5, y: 7.5 });
    cat.needs.attention = 100;
    cat.act = { kind: "attention", target: "character", goal: null, minutes: 30, elapsed: 0, seen: true };
    for (let i = 0; i < minutes * 4; i++) tickCats(save.current, 0.25, { present: true });
    return { cat, save };
  };

  it("балакучий нявкає помітно більше за кота без риси — прояв «+», раз за прохання", () => {
    expect(seen(asking({ talkative: 1 }, 15).cat, "talkative")).toBe(1);
    expect(seen(asking({ talkative: 2 }, 15).cat, "talkative")).toBe(1);
  });

  it("мовчазний за 10 хвилин прохання нявкає на два рази менше — прояв «−»; тихоня — лише беззвучно", () => {
    expect(seen(asking({ talkative: -1 }, 12).cat, "talkative")).toBe(1);
    expect(seen(asking({ talkative: -2 }, 12).cat, "talkative")).toBe(1);
    // Мовчить, бо «Невибагливий», а не «Мовчазний», — не прояв.
    expect(seen(asking({ talkative: -1, demanding: -2 }, 12).cat, "talkative")).toBe(0);
  });

  it("балакучий вітається вголос, коли персонаж заходить у кімнату; прояв — не частіше ніж раз на годину", () => {
    const save = game();
    const cat = withCat(save, { talkative: 2 }, { x: 15.5, y: 2.5 });
    const enter = (): number => {
      const { events, stop } = recordEvents();
      save.current.character.room = "living";
      Object.assign(save.current.character.body, { x: 16.5, y: 3.5 });
      tickCats(save.current, 0.01, { present: true });
      stop();
      return events.filter((e) => e.type === "meow" && e.cat === cat.id).length;
    };
    let greeted = 0;
    for (let i = 0; i < 10; i++) greeted += enter();
    expect(greeted).toBeGreaterThan(1);
    expect(seen(cat, "talkative")).toBe(1);
    save.current.minute += TALKATIVE.observeEvery;
    for (let i = 0; i < 10; i++) enter();
    expect(seen(cat, "talkative")).toBe(2);
  });

  it("нявкання поруч із тим, хто працює, забирає здоровий глузд — не більше 2 за годину", () => {
    const sanityLost = (talkative: TraitLevel | 0): number => {
      const save = game();
      save.current.minute = hours(10);
      Object.assign(save.current.character.body, { x: 6.5, y: 7.5 });
      startWork(save.current);
      save.current.character.stats.sanity = 50;
      const traits: Record<string, TraitLevel> = { lap: -2, helper: -2 };
      if (talkative !== 0) traits.talkative = talkative;
      const cat = withCat(save, traits, { x: 7.5, y: 7.5 });
      cat.needs.attention = 100;
      cat.act = { kind: "attention", target: "character", goal: null, minutes: 60, elapsed: 0 };
      for (let i = 0; i < 59; i++) tickCats(save.current, 1, { present: true });
      return 50 - save.current.character.stats.sanity;
    };
    const plain = sanityLost(0);
    expect(sanityLost(1) - plain).toBeGreaterThan(1);
    expect(sanityLost(2) - plain).toBeCloseTo(TALKATIVE.workMaxPerHour);
  });
});
