// Етап «Увага й ласка» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як риси уваги видно з поведінки —
// «Ласкавість», «Терпимість до гладження», «Балакучість», «Тертя об ноги», «Робочий помічник», «Коліна»,
// «Відданість», «Образливість», «Мстивість».

import { describe, expect, it } from "vitest";

import { catFeeling, petTolerance, pickUpCat } from "../src/sim/actions";
import { giveTreat } from "../src/sim/care";
import { rubbingCat } from "../src/sim/body";
import { changeLove, createCat, idleAct, offend } from "../src/sim/cat";
import { catOnComputer, decide, greetAtDoor, slowBlinks, tickCats } from "../src/sim/catai";
import { AFFECTION, CARRY, LEGS, MINUTES_PER_HOUR, PET, PETTING, TALKATIVE, TOUCHY } from "../src/sim/config";
import { advance, interact, newGame, returnHome } from "../src/sim/game";
import { LAUNDRY_BASKET, objectById } from "../src/sim/home";
import { endTrip, HOME_DOOR } from "../src/sim/trips";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { startWork } from "../src/sim/work";
import { catLook } from "../src/view/thoughts";
import { hours, recordEvents, walkTo, withCatCorner } from "./helpers";

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

  it("«Відлюдник», якого пестять раз у раз, відкривається не частіше ніж раз на годину (перевірка етапу)", () => {
    const save = game();
    const cat = withCat(save, { affection: -2 });
    const petAgain = (): void => {
      Object.assign(save.current.character.body, { x: cat.x, y: cat.y + 0.6, facing: { x: 0, y: -1 } });
      cat.act = idleAct(30);
      for (let i = 0; i < 4; i++) advance(save, 0.05, HOLD);
      advance(save, 0.05);
    };
    const { events, stop } = recordEvents();
    for (let i = 0; i < 6; i++) petAgain();
    stop();
    expect(events.filter((e) => e.type === "cat-left")).toHaveLength(6);
    expect(seen(cat, "affection")).toBe(1);
    save.current.minute += AFFECTION.observeEvery;
    petAgain();
    expect(seen(cat, "affection")).toBe(2);
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
      const traits: Record<string, TraitLevel> = {};
      if (talkative !== 0) traits.talkative = talkative;
      const cat = withCat(save, traits, { x: 7.5, y: 7.5 });
      cat.needs.attention = 100;
      // Уже прийшов і сидить поруч, нявкаючи: не на клавіатурі й не на колінах.
      cat.act = { kind: "attention", target: "asked", goal: null, minutes: 60, elapsed: 0 };
      for (let i = 0; i < 59; i++) tickCats(save.current, 1, { present: true });
      return 50 - save.current.character.stats.sanity;
    };
    const plain = sanityLost(0);
    expect(sanityLost(1) - plain).toBeGreaterThan(1);
    expect(sanityLost(2) - plain).toBeCloseTo(TALKATIVE.workMaxPerHour);
  });
});

describe("«Тертя об ноги» (рішення автора 2026-10-25)", () => {
  it("голодний «Заплітайло» крутиться «вісімкою» під ногами того, хто несе корм, — прояв «+»; кіт без риси — ні", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 16.5, y: 2.5 });
    save.current.character.held = { kind: "catfood", quality: "cheap", sterile: false };
    const legs = withCat(save, { legs: 1 }, { x: 14.5, y: 3.5 });
    const plain = withCat(save, {}, { x: 13.5, y: 2.5 });
    for (const cat of [legs, plain]) cat.needs.hunger = 70;
    for (let i = 0; i < 12; i++) tickCats(save.current, 0.25, { present: true });
    expect(legs.act).toMatchObject({ kind: "follow", target: "food" });
    expect(plain.act.kind).not.toBe("follow");
    expect(rubbingCat(save.current)?.id).toBe(legs.id);
    expect(seen(legs, "legs")).toBe(1);
    // Корм насипали — «вісімці» кінець.
    save.current.character.held = null;
    tickCats(save.current, 0.25, { present: true });
    expect(legs.act.kind).not.toBe("follow");
  });

  it("«Тримає дистанцію» сідає за клітинку, «Обходить стороною» — за півтори й раз відступає", () => {
    const sitting = (level: TraitLevel): { gap: number; cat: Cat; save: Save } => {
      const save = game();
      Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
      const cat = withCat(save, { legs: level }, { x: 3.5, y: 8.5 });
      cat.needs.attention = 100;
      cat.act = { kind: "attention", target: "asked", goal: null, minutes: 30, elapsed: 0 };
      for (let i = 0; i < 20; i++) tickCats(save.current, 0.25, { present: true });
      const body = save.current.character.body;
      return { gap: Math.hypot(cat.x - body.x, cat.y - body.y), cat, save };
    };
    const near = sitting(-1);
    expect(near.gap).toBeGreaterThan(LEGS.distance);
    expect(near.gap).toBeLessThan(2);
    expect(rubbingCat(near.save.current)).toBeNull();
    const far = sitting(-2);
    expect(far.gap).toBeGreaterThan(1);
    // Персонаж підійшов упритул — кіт відступає, але лише раз за похід.
    const body = far.save.current.character.body;
    Object.assign(body, { x: far.cat.x + 0.3, y: far.cat.y });
    tickCats(far.save.current, 0.01, { present: true });
    expect(far.cat.act.goal).not.toBeNull();
    for (let i = 0; i < 8; i++) tickCats(far.save.current, 0.25, { present: true });
    Object.assign(body, { x: far.cat.x + 0.3, y: far.cat.y });
    tickCats(far.save.current, 0.01, { present: true });
    expect(far.cat.act.goal).toBeNull();
  });

  it("персонаж проходить повз, а кіт по увагу під ноги не лізе — прояв «−», раз на день", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 6.5, y: 8.5 });
    const cat = withCat(save, { legs: -1 }, { x: 8.5, y: 8.5 });
    cat.needs.attention = 100;
    cat.act = { kind: "attention", target: "asked", goal: null, minutes: 30, elapsed: 5, seen: true };
    for (let i = 0; i < 6; i++) advance(save, 0.1, { move: { x: 1, y: 0 }, hold: false });
    expect(seen(cat, "legs")).toBe(1);
    for (let i = 0; i < 6; i++) advance(save, 0.1, { move: { x: -1, y: 0 }, hold: false });
    expect(seen(cat, "legs")).toBe(1);
  });
});

describe("«Робочий помічник» (рішення автора 2026-10-25)", () => {
  /** Кіт по увагу приходить до персонажа, що працює; повертає, що він зробив. */
  const atWork = (seed: number, traits: Record<string, TraitLevel>): { cat: Cat; save: Save; keyboard: boolean } => {
    const save = game(seed);
    // Потік поведінки засівається на початку дня; нова гра в тесті починає його з нуля — тож різний для кожного seed.
    save.current.rng.behavior = 1000 + seed;
    save.current.minute = hours(10);
    walkTo(save, "computer");
    interact(save);
    const body = save.current.character.body;
    const cat = withCat(save, { lap: -1, ...traits }, { x: body.x + 1, y: body.y + 1 });
    cat.needs.attention = 90;
    decide(save.current, cat, createRng(seed), { present: true });
    const { events, stop } = recordEvents();
    for (let i = 0; i < 40 && cat.act.kind === "attention"; i++) advance(save, 0.25);
    stop();
    return { cat, save, keyboard: cat.act.kind === "keyboard" || events.some((e) => e.type === "keyboard") };
  };

  it("на клавіатуру пробує й кіт без риси; «Поважає роботу» — ніколи, а лягає поруч зі столом — прояв «−»", () => {
    let plain = 0;
    let respectful = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (atWork(seed, {}).keyboard) plain += 1;
      const quiet = atWork(seed, { helper: -1 });
      if (quiet.keyboard) respectful += 1;
      if (seed === 0) {
        expect(quiet.cat.act).toMatchObject({ kind: "idle", target: "desk" });
        expect(seen(quiet.cat, "helper")).toBe(1);
        expect(quiet.save.current.character.activity?.kind).toBe("work");
      }
    }
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(15);
    expect(respectful).toBe(0);
  });

  it("«Байдужий до техніки» на комп'ютері не спить, «Поважає роботу» — рідше", () => {
    const onComputer = (helper: TraitLevel | 0): number => {
      let count = 0;
      const computer = objectById("computer");
      for (let seed = 0; seed < 300; seed++) {
        const save = game(seed % 7);
        const cat = withCat(save, helper === 0 ? {} : { helper }, { x: 9.5, y: 8.5 });
        cat.needs.fatigue = 95;
        decide(save.current, cat, createRng(seed), { present: true });
        const goal = cat.act.goal;
        if (cat.act.kind === "sleep" && goal && goal.y === computer.y && goal.x >= computer.x && goal.x < computer.x + computer.w) count += 1;
      }
      return count;
    };
    const plain = onComputer(0);
    expect(plain).toBeGreaterThan(5);
    expect(onComputer(-1)).toBeLessThan(plain);
    expect(onComputer(-2)).toBe(0);
    expect(catOnComputer).toBeTypeOf("function");
  });
});

describe("«Коліна» на руках (рішення автора 2026-10-25)", () => {
  const held = (traits: Record<string, TraitLevel>, setup: (cat: Cat) => void, minutes: number): { cat: Cat; purrs: number } => {
    const save = game();
    faceCat(save);
    const cat = withCat(save, traits);
    cat.needs.attention = 90;
    setup(cat);
    pickUpCat(save.current, cat);
    const { events, stop } = recordEvents();
    advance(save, minutes);
    stop();
    return { cat, purrs: events.filter((e) => e.type === "purr" && e.cat === cat.id).length };
  };

  it("«Любить на руки» хвилину муркоче й топчеться на руках — прояв «+», раз за взяття", () => {
    expect(held({ lap: 1 }, () => undefined, CARRY.seenContent - 0.2).cat.traits[0]?.seen).toBe(0);
    const fond = held({ lap: 1 }, () => undefined, CARRY.seenContent * 3);
    expect(fond.purrs).toBe(1);
    expect(seen(fond.cat, "lap")).toBe(1);
  });

  it("кота, якого беруть на руки раз у раз, «Коліна» відкривають не частіше ніж раз на годину (перевірка етапу)", () => {
    const save = game();
    faceCat(save);
    const cat = withCat(save, { lap: -1 });
    cat.needs.attention = 90;
    for (let i = 0; i < 5; i++) {
      save.current.character.held = null;
      Object.assign(cat, { x: 4.5, y: 7.6 });
      cat.act = idleAct(30);
      pickUpCat(save.current, cat);
      advance(save, CARRY.seenStruggle + 0.1);
    }
    expect(seen(cat, "lap")).toBe(1);
    save.current.character.held = null;
    save.current.minute += CARRY.observeEvery;
    cat.act = idleAct(30);
    pickUpCat(save.current, cat);
    advance(save, CARRY.seenStruggle + 0.1);
    expect(seen(cat, "lap")).toBe(2);
  });

  it("«Не на руки» пручається через рису — прояв «−»; узятий проти волі чи нелюбий — ні", () => {
    expect(seen(held({ lap: -1 }, () => undefined, CARRY.seenStruggle + 0.1).cat, "lap")).toBe(1);
    const asleep = held({ lap: -1 }, (cat) => (cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 }), 1);
    expect(seen(asleep.cat, "lap")).toBe(0);
    const cold = held({ lap: -1 }, (cat) => (cat.love = 10), 1);
    expect(seen(cold.cat, "lap")).toBe(0);
  });
});

describe("«Образливість» (рішення автора 2026-10-25)", () => {
  /** Кіт хоче уваги, персонаж поруч; повертає, чи пішов кіт по ласку. */
  const comes = (save: Save, cat: Cat): boolean => {
    cat.act = idleAct(0);
    cat.needs.attention = 90;
    decide(save.current, cat, createRng(1), { present: true });
    return cat.act.kind === "attention";
  };

  it("після неприємного кіт без риси чверть години сам не приходить, «Образливий» дметься довше", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
    const plain = withCat(save, {}, { x: 5.5, y: 8.5 });
    const touchy = withCat(save, { touchy: 1 }, { x: 4.5, y: 8.5 });
    for (const cat of [plain, touchy]) offend(save.current, cat, -2, "купання");
    expect(comes(save, plain)).toBe(false);
    expect(comes(save, touchy)).toBe(false);
    save.current.minute += TOUCHY.baseMinutes;
    expect(comes(save, plain)).toBe(true);
    expect(comes(save, touchy)).toBe(false);
    save.current.minute += TOUCHY.sulkMinutes - TOUCHY.baseMinutes;
    expect(comes(save, touchy)).toBe(true);
  });

  it("«Образливий» відходить від персонажа й сідає спиною — прояв «+», раз за образу", () => {
    const save = game();
    const cat = withCat(save, { touchy: 2 }, { x: 8.5, y: 8.5 });
    offend(save.current, cat, -2, "прогнали з місця");
    Object.assign(save.current.character.body, { x: 7.6, y: 8.5, facing: { x: 1, y: 0 } });
    const { events, stop } = recordEvents();
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("wander");
    expect(seen(cat, "touchy")).toBe(1);
    for (let i = 0; i < 20; i++) tickCats(save.current, 0.25, { present: true });
    expect(catLook(save.current, cat)).toBe("sulk");
    // Згодом підійшов знову — знову відходить, але прояв той самий.
    save.current.minute += TOUCHY.againMinutes;
    const before = events.filter((e) => e.type === "sulked").length;
    Object.assign(save.current.character.body, { x: cat.x + 0.5, y: cat.y });
    cat.act = idleAct(10);
    tickCats(save.current, 0.1, { present: true });
    stop();
    expect(events.filter((e) => e.type === "sulked")).toHaveLength(before + 1);
    expect(seen(cat, "touchy")).toBe(1);
  });

  it("«Образливий» відходить раз, а не щокадру — і коли персонаж стоїть, і коли йде слідом (перевірка етапу)", () => {
    const frame = 1 / 45;
    const save = game();
    const cat = withCat(save, { touchy: 2 }, { x: 8.5, y: 8.5 });
    offend(save.current, cat, -2, "прогнали з місця");
    Object.assign(save.current.character.body, { x: 7.6, y: 8.5, facing: { x: 1, y: 0 } });
    const { events, stop } = recordEvents();
    for (let i = 0; i < 60; i++) advance(save, frame);
    expect(events.filter((e) => e.type === "sulked")).toHaveLength(1);
    // Іде слідом півтори хвилини — кіт не «відходить» знову щокадру.
    for (let i = 0; i < 60; i++) {
      const body = save.current.character.body;
      const dx = cat.x - body.x;
      const dy = cat.y - body.y;
      const gap = Math.hypot(dx, dy) || 1;
      advance(save, frame, { move: gap > 0.8 ? { x: dx / gap, y: dy / gap } : { x: 0, y: 0 }, hold: false });
    }
    stop();
    expect(events.filter((e) => e.type === "sulked").length).toBeLessThanOrEqual(2);
    expect(seen(cat, "touchy")).toBe(1);
    expect(TOUCHY.againMinutes).toBeGreaterThan(60 * frame);
  });

  it("«Образливий», що дметься, гладити себе не дає — іде з-під руки; утримання не гладить знову (перевірка етапу)", () => {
    const save = game();
    const cat = withCat(save, { touchy: 2 });
    cat.needs.attention = 80;
    offend(save.current, cat, -2, "купання");
    faceCat(save);
    const love = cat.love;
    const { events, stop } = recordEvents();
    advance(save, 0.05, HOLD);
    expect(save.current.character.activity).toMatchObject({ kind: "pet", left: true });
    for (let i = 0; i < 40; i++) advance(save, 0.1, HOLD);
    stop();
    expect(cat.act.kind).not.toBe("idle");
    expect(events.filter((e) => e.type === "sulked")).toHaveLength(1);
    expect(events.some((e) => e.type === "purr")).toBe(false);
    expect(cat.love).toBe(love);
    expect(seen(cat, "touchy")).toBe(1);
    // Образа минула — гладити можна.
    advance(save, 0.1);
    save.current.minute += TOUCHY.sulkMinutes * 2;
    Object.assign(save.current.character.body, { x: cat.x, y: cat.y + 0.6, facing: { x: 0, y: -1 } });
    cat.act = idleAct(30);
    advance(save, 0.5, HOLD);
    expect(save.current.character.activity).toMatchObject({ kind: "pet" });
    expect(save.current.character.activity).not.toHaveProperty("left");
  });

  it("«Відхідливий» одразу приходить по ласку — прояв «−»; на руках через образу не пручається", () => {
    const save = game();
    faceCat(save);
    const cat = withCat(save, { touchy: -1 }, { x: 6.5, y: 7.5 });
    offend(save.current, cat, -2, "дали ліки");
    expect(comes(save, cat)).toBe(true);
    for (let i = 0; i < 20 && cat.act.seen !== true; i++) tickCats(save.current, 0.25, { present: true });
    expect(seen(cat, "touchy")).toBe(1);
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 100, elapsed: 0 };
    pickUpCat(save.current, cat);
    expect(catFeeling(save.current, cat)).not.toBe("struggling");
    const plain = withCat(save, {}, { x: 4.5, y: 7.5 });
    plain.act = { kind: "sleep", target: null, goal: null, minutes: 100, elapsed: 0 };
    save.current.character.held = null;
    pickUpCat(save.current, plain);
    expect(catFeeling(save.current, plain)).toBe("struggling");
  });

  it("неприємне в поїздці — відлік з повернення додому; брудний лоток і день без уваги — не образа", () => {
    const save = game();
    const cat = withCat(save, { touchy: 1 });
    cat.away = "trip";
    save.current.trip = { destination: "vet", cat: cat.id } as unknown as NonNullable<Save["current"]["trip"]>;
    offend(save.current, cat, -3, "ветеринар");
    expect(cat.offense?.away).toBe(true);
    save.current.minute += 120;
    endTrip(save.current);
    expect(cat.offense).toEqual({ at: (save.current.day * 24 + 0) * 60 + save.current.minute });
    const other = withCat(save, { touchy: 1 }, { x: 6.5, y: 8.5 });
    changeLove(save.current, other, -1, "брудний лоток");
    expect(other.offense).toBeUndefined();
  });
});

describe("«Мстивість» (рішення автора 2026-10-25)", () => {
  /** Мстивий кіт удома й без справ; скільки хвилин чекати помсти. */
  const avenger = (save: Save, level: TraitLevel = 2): Cat => {
    const cat = withCat(save, { vengeful: level }, { x: 9.5, y: 8.5 });
    cat.act = idleAct(600);
    return cat;
  };
  const wait = (save: Save, cat: Cat, minutes: number): void => {
    for (let i = 0; i < minutes && cat.act.kind !== "revenge"; i++) {
      cat.act = idleAct(600);
      tickCats(save.current, 1, { present: false });
    }
  };

  it("день без уваги чи брудний лоток — не привід; бійка й переноска — привід", () => {
    const save = game();
    const calm = avenger(save);
    changeLove(save.current, calm, -3, "брудний лоток");
    wait(save, calm, 240);
    expect(calm.act.kind).not.toBe("revenge");
    let avenged = 0;
    for (let seed = 0; seed < 20; seed++) {
      const fight = game(seed);
      fight.current.rng.behavior = 500 + seed;
      const cat = avenger(fight);
      cat.stressedAt = (fight.current.day * 24 * 60) + fight.current.minute;
      wait(fight, cat, 240);
      if (cat.act.kind === "revenge") avenged += 1;
    }
    expect(avenged).toBeGreaterThan(5);
  });

  it("мститься й біля кошика з брудною білизною; прояв «+» — коли персонаж бачить, як кіт іде мститися", () => {
    let laundry = 0;
    for (let seed = 0; seed < 12; seed++) {
      const save = game(seed);
      save.current.rng.behavior = 900 + seed;
      save.current.home.clothes = 2;
      Object.assign(save.current.character.body, { x: 9.5, y: 7.5 });
      const cat = avenger(save);
      offend(save.current, cat, -2, "купання");
      wait(save, cat, 240);
      if (cat.act.kind !== "revenge") continue;
      if (cat.act.target === "laundry") {
        laundry += 1;
        expect(cat.act.goal).toEqual({ x: Math.floor(LAUNDRY_BASKET.x), y: Math.floor(LAUNDRY_BASKET.y) });
      }
      tickCats(save.current, 0.01, { present: true });
      expect(seen(cat, "vengeful")).toBe(1);
    }
    expect(laundry).toBeGreaterThan(0);
  });

  it("«Поступливий» після бійки від ласощів одразу відтає й муркоче — прояв «−»", () => {
    const save = game();
    save.current.home.supplies.treats.cheap = 3;
    const cat = withCat(save, { vengeful: -1 }, { x: 9.5, y: 8.5 });
    cat.stressedAt = save.current.day * 24 * 60 + save.current.minute;
    save.current.character.held = { kind: "cat", cat: cat.id };
    const { events, stop } = recordEvents();
    giveTreat(save.current, "cheap", createRng(1));
    stop();
    expect(events.some((e) => e.type === "purr" && e.cat === cat.id)).toBe(true);
    expect(seen(cat, "vengeful")).toBe(1);
    expect(cat.stressedAt).toBeUndefined();
  });
});

describe("«Відданість» (рішення автора 2026-10-25)", () => {
  /** Персонаж повертається з магазину; скільки котів пішли зустрічати. */
  const greeters = (seed: number, setup: (save: Save) => Cat[]): { save: Save; cats: Cat[] } => {
    const save = game(seed);
    save.current.rng.behavior = 300 + seed;
    const cats = setup(save);
    save.current.trip = { destination: "shop", phase: "visit", cat: null } as unknown as NonNullable<Save["current"]["trip"]>;
    returnHome(save, 0.01, 0.01);
    return { save, cats };
  };

  it("відданий кіт виходить зустрічати до дверей частіше за холодного й вітається — прояв «+»", () => {
    let devoted = 0;
    let cold = 0;
    let arrived = 0;
    for (let seed = 0; seed < 30; seed++) {
      const { save, cats } = greeters(seed, (s) => {
        const a = withCat(s, { devotion: 2 }, { x: 5.5, y: 8.5 });
        const b = withCat(s, { devotion: -2 }, { x: 6.5, y: 8.5 });
        a.love = 70;
        b.love = 70;
        return [a, b];
      });
      const [a, b] = cats as [Cat, Cat];
      if (a.act.kind === "follow" && a.act.target === "door") devoted += 1;
      if (b.act.kind === "follow" && b.act.target === "door") cold += 1;
      if (seed === 0 || a.act.target === "door") {
        const { events, stop } = recordEvents();
        for (let i = 0; i < 30 && a.act.kind === "follow"; i++) tickCats(save.current, 0.25, { present: true });
        stop();
        if (seen(a, "devotion") > 0) {
          arrived += 1;
          expect(events.some((e) => e.type === "meow" && e.cat === a.id)).toBe(true);
          expect(Math.hypot(a.x - HOME_DOOR.x, a.y - HOME_DOOR.y)).toBeLessThan(2.5);
        }
      }
    }
    expect(devoted).toBeGreaterThan(cold + 10);
    expect(arrived).toBeGreaterThan(0);
  });

  it("сплячий, ображений і той, хто їздив разом, — не зустрічають", () => {
    const save = game();
    const sleeper = withCat(save, { devotion: 2 }, { x: 5.5, y: 8.5 });
    sleeper.love = 100;
    sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    const hurt = withCat(save, { devotion: 2 }, { x: 6.5, y: 8.5 });
    hurt.love = 100;
    offend(save.current, hurt, -1, "прогнали з місця");
    const rider = withCat(save, { devotion: 2 }, { x: 7.5, y: 8.5 });
    rider.love = 100;
    Object.assign(save.current.character.body, HOME_DOOR);
    for (let i = 0; i < 10; i++) greetAtDoor(save.current, rider.id);
    for (const cat of [sleeper, hurt, rider]) expect(cat.act.target).not.toBe("door");
  });

  it("«Відданий» повільно моргає з нижчої любові — прояв «+», раз на день; кіт без риси — ні", () => {
    const save = game();
    faceCat(save);
    const devoted = withCat(save, { devotion: 1 }, { x: 4.5, y: 7.5 });
    const plain = withCat(save, {}, { x: 5.5, y: 7.5 });
    for (const cat of [devoted, plain]) {
      cat.love = 68;
      cat.mood = 85;
    }
    expect(slowBlinks(save.current, devoted)).toBe(true);
    expect(slowBlinks(save.current, plain)).toBe(false);
    expect(catLook(save.current, devoted)).toBe("blink");
    for (let i = 0; i < 4; i++) {
      devoted.act = idleAct(30);
      tickCats(save.current, 0.25, { present: true });
    }
    expect(seen(devoted, "devotion")).toBe(1);
  });

  it("кіт, що бодається головою чи лежить животом догори, не моргає — і «Відданість» так не відкривається (перевірка етапу)", () => {
    const save = game();
    faceCat(save);
    const fond = withCat(save, { devotion: 1, affection: 1 }, { x: 4.5, y: 7.5 });
    const trap = withCat(save, { devotion: 1, petting: -2 }, { x: 5.1, y: 7.5 });
    for (const cat of [fond, trap]) {
      cat.love = 68;
      cat.mood = 85;
    }
    fond.needs.attention = 100;
    fond.act = { kind: "attention", target: "character", goal: null, minutes: 30, elapsed: 2, seen: true };
    expect(catLook(save.current, fond)).toBe("nudge");
    expect(catLook(save.current, trap)).toBe("belly");
    expect(slowBlinks(save.current, fond)).toBe(false);
    expect(slowBlinks(save.current, trap)).toBe(false);
    tickCats(save.current, 0.01, { present: true });
    expect(seen(fond, "devotion")).toBe(0);
    expect(seen(trap, "devotion")).toBe(0);
    expect(MINUTES_PER_HOUR).toBe(60);
  });
});
