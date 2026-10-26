// Етап «Тіло й завершення» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): заздрісність між котами, теплолюбність
// (тепло, прохолодна плитка, спека й холод) і схильність до повноти (вага й ожиріння).

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { giveTreat } from "../src/sim/care";
import { createCat, idleAct, weightOf } from "../src/sim/cat";
import { climbWeight, decide, envy, sunSpot, tickCats } from "../src/sim/catai";
import { CLIMBING, ENVY, MINUTES_PER_DAY, NEED_PER_HOUR, PLAY_RELIEF, WARMTH, WEIGHT } from "../src/sim/config";
import { fallIll, hasDisease, nightlyDiseases, walkFactor } from "../src/sim/diseases";
import { advance, newGame } from "../src/sim/game";
import { COOL_TILE, hiddenTile, isFixedSolid, MAP, objectById, OBJECTS, ROLL_TILE, ROOMS, roomAt, SLOTS, WINDOWS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { exercise, gainWeight, girthOf, settleWeight } from "../src/sim/weight";
import { recordEvents, withCatCorner, hours } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
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

/** Прожити стільки хвилин котячого життя чвертями хвилини (персонаж удома). */
function live(save: Save, minutes: number): void {
  for (let t = 0; t < minutes; t += 0.25) {
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present: true });
  }
}

describe("«Заздрісність»: видимі реакції (§9.12, рішення автора 2026-10-25)", () => {
  it("заздрісник поруч шипить на того, кому перепало, — прояв «+»", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const envious = withCat(save, { envy: 1 }, { x: 10.5, y: 7.5 });
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === envious.id && e.at === lucky.id)).toBe(true);
    expect(seen(envious, "envy")).toBe(1);
  });

  it("заздрісник здалеку підходить і шипить зблизька; не встиг зашипіти — заздрить мовчки, без прояву", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const envious = withCat(save, { envy: 2 }, { x: 5.5, y: 7.5 });
    const before = relation(save.current, envious, lucky);
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    expect(envious.act.kind).toBe("jealous");
    expect(events.some((e) => e.type === "hissed")).toBe(false);
    expect(relation(save.current, envious, lucky)).toBe(before + 2 * ENVY.relation);
    for (let i = 0; i < 80 && envious.act.kind === "jealous"; i++) live(save, 0.25);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === envious.id && e.at === lucky.id)).toBe(true);
    expect(seen(envious, "envy")).toBe(1);
    expect(seen(envious, "jealousy")).toBe(0);
    // Щойно шипів — удруге за хвилину не шипить (спільна пауза), і прояву немає.
    envy(save.current, lucky, "collar");
    live(save, 4);
    expect(seen(envious, "envy")).toBe(1);
  });

  it("щиросердий підходить, сідає поруч із тим, кого пригостили, і муркоче — прояв «−», а не «Ревнивості»", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const kind = withCat(save, { envy: -2, jealousy: -2 }, { x: 5.5, y: 7.5 });
    const before = relation(save.current, kind, lucky);
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    expect(kind.act.target).toBe(`cuddle:${lucky.id}`);
    live(save, 4);
    stop();
    expect(events.some((e) => e.type === "cat-cuddled" && e.cat === kind.id && e.with === lucky.id)).toBe(true);
    expect(relation(save.current, kind, lucky)).toBe(before + ENVY.cuddleRelation);
    expect(seen(kind, "envy")).toBe(1);
    expect(seen(kind, "jealousy")).toBe(0);
  });

  it("«Заздрісник» (+2) поруч з вами інколи вихоплює ласощі в кота на руках і з'їдає сам — прояв «+»", () => {
    let snatched = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const save = game(seed);
      const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
      const thief = withCat(save, { envy: 2 }, { x: 10.5, y: 8.5 });
      save.current.home.supplies.treats.cheap = 5;
      save.current.character.held = { kind: "cat", cat: lucky.id };
      const love = lucky.love;
      const { events, stop } = recordEvents();
      expect(giveTreat(save.current, "cheap", createRng(seed))).toBe(true);
      stop();
      expect(save.current.home.supplies.treats.cheap).toBe(4);
      if (!events.some((e) => e.type === "treat-snatched" && e.cat === thief.id && e.from === lucky.id)) {
        expect(lucky.love).toBeGreaterThan(love);
        continue;
      }
      snatched += 1;
      // Ласощі дісталися заздрісникові, а кіт на руках лишився ні з чим.
      expect(lucky.love).toBe(love);
      expect(lucky.treatAt).toBeUndefined();
      expect(thief.treatAt).toBeDefined();
      expect(seen(thief, "envy")).toBe(1);
    }
    expect(snatched).toBeGreaterThan(3);
    expect(snatched).toBeLessThan(20);
  });

  it("до кота у вас на руках заздрісник здалеку не йде — шипить звідти, прояв «+»", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const envious = withCat(save, { envy: 1 }, { x: 5.5, y: 8.5 });
    save.current.character.held = { kind: "cat", cat: lucky.id };
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    stop();
    expect(envious.act.kind).not.toBe("jealous");
    expect(events.some((e) => e.type === "hissed" && e.cat === envious.id && e.at === lucky.id)).toBe(true);
    expect(seen(envious, "envy")).toBe(1);
  });

  it("«Заздрісний» (+1) і далекий «Заздрісник» ласощів не вихоплюють", () => {
    for (const [level, x] of [[1, 10.5], [2, 13.5]] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const save = game(seed);
        const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
        withCat(save, { envy: level }, { x, y: 8.5 });
        save.current.home.supplies.treats.cheap = 5;
        save.current.character.held = { kind: "cat", cat: lucky.id };
        const { events, stop } = recordEvents();
        giveTreat(save.current, "cheap", createRng(seed));
        stop();
        expect(events.some((e) => e.type === "treat-snatched")).toBe(false);
      }
    }
  });
});

/** Куди кіт ляже спати: сонячна пляма, плитка, підвіконня над батареєю, комп'ютер чи ліжко — за 300 рішень. */
function sleepSpots(traits: Record<string, TraitLevel>, day: string | null = null, minute = hours(12)): Record<string, number> {
  const counts: Record<string, number> = { sun: 0, tile: 0, sill: 0, computer: 0, bed: 0 };
  const computer = objectById("computer");
  const bed = objectById("bed");
  for (let seed = 0; seed < 300; seed++) {
    const save = game();
    save.current.modifiers.day = day;
    save.current.minute = minute;
    const cat = withCat(save, traits);
    cat.needs.fatigue = 100;
    decide(save.current, cat, createRng(seed), { present: true });
    const goal = cat.act.goal;
    const sun = sunSpot(save.current.minute);
    if (cat.act.target === "tile") counts["tile"]! += 1;
    else if (WINDOWS.some((w) => w.sill === cat.act.target)) counts["sill"]! += 1;
    else if (goal && sun && goal.x === sun.x && goal.y === sun.y) counts["sun"]! += 1;
    else if (goal && goal.y === computer.y && goal.x >= computer.x && goal.x < computer.x + computer.w) counts["computer"]! += 1;
    else if (goal && goal.x >= bed.x && goal.x < bed.x + bed.w && goal.y >= bed.y && goal.y < bed.y + bed.h) counts["bed"]! += 1;
  }
  return counts;
}

/** Кіт дійшов до місця сну й заснув: прожити, поки він іде. */
function arrive(save: Save, cat: Cat): void {
  for (let i = 0; i < 400 && cat.act.goal !== null; i++) live(save, 0.25);
}

describe("«Теплолюбність» (§9.12, рішення автора 2026-10-25)", () => {
  it("сонячна пляма: «+» лягає туди частіше, «Холодостійкий» — ніколи; «−» спить на комп'ютері рідше, −2 — ніколи", () => {
    const plain = sleepSpots({});
    const warm = sleepSpots({ warmth: 2 });
    const cool = sleepSpots({ warmth: -1 });
    const cold = sleepSpots({ warmth: -2 });
    expect(warm["sun"]).toBeGreaterThan(plain["sun"]!);
    expect(warm["computer"]).toBeGreaterThan(plain["computer"]!);
    expect(cool["sun"]).toBeLessThan(plain["sun"]!);
    // Хіба що випадкове місце на підлозі збіглося з плямою.
    expect(cold["sun"]).toBeLessThan(plain["sun"]! / 5);
    expect(cold["computer"]).toBe(0);
    expect(cool["computer"]).toBeGreaterThan(0);
  });

  it("прохолодна плитка у ванній: «−» лягає туди й без спеки, у «Спеку» — і кіт без риси; без спеки кіт без риси — ніколи", () => {
    expect(sleepSpots({})["tile"]).toBe(0);
    expect(sleepSpots({ warmth: 2 })["tile"]).toBe(0);
    expect(sleepSpots({ warmth: -2 })["tile"]).toBeGreaterThan(30);
    expect(sleepSpots({}, "heat")["tile"]).toBeGreaterThan(10);
    expect(sleepSpots({ warmth: 2 }, "heat")["tile"]).toBeGreaterThan(10);
  });

  it("плитка — вільна клітинка ванної: не перед душем, пральною машиною чи умивальником, не на лотку, не під рулоном і не в проході (рішення автора 2026-10-26)", () => {
    const tile = COOL_TILE;
    expect(roomAt({ x: tile.x + 0.5, y: tile.y + 0.5 })).toBe("bathroom");
    expect(isFixedSolid(tile.x, tile.y)).toBe(false);
    // Її не закриває передня стіна: кота на ній видно.
    expect(hiddenTile(tile.x, tile.y)).toBe(false);
    // Місце дії персонажа — клітинка просто перед річчю, з якою він щось робить.
    for (const o of OBJECTS.filter((o) => o.interactive)) {
      const front = tile.y === o.y + o.h && tile.x >= o.x && tile.x < o.x + o.w;
      expect(front, o.id).toBe(false);
    }
    expect(SLOTS.some((s) => s.x === tile.x && s.y === tile.y)).toBe(false);
    expect(tile).not.toEqual(ROLL_TILE);
    // Прохід від дверей ванної — стовпчики, де в нижній стіні кімнати отвір.
    const bath = ROOMS.find((r) => r.id === "bathroom")!;
    const doorway = [...(MAP[bath.y + bath.h] ?? "")].flatMap((cell, x) => (cell === "." && x >= bath.x && x < bath.x + bath.w ? [x] : []));
    expect(doorway.length).toBeGreaterThan(0);
    expect(doorway).not.toContain(tile.x);
  });

  it("плитка одна: поки на ній спить кіт чи вже йде туди, інший її не обирає навіть у «Спеку» (перевірка етапу 2026-10-26)", () => {
    for (const goal of [null, { ...COOL_TILE }]) {
      let tile = 0;
      for (let seed = 0; seed < 100; seed++) {
        const save = game();
        save.current.modifiers.day = "heat";
        const first = withCat(save, {}, goal ? { x: 9.5, y: 7.5 } : { x: COOL_TILE.x + 0.5, y: COOL_TILE.y + 0.5 });
        first.act = { kind: "sleep", target: "tile", goal, minutes: 480, elapsed: 0 };
        const cat = withCat(save, { warmth: -2 }, { x: 10.5, y: 7.5 });
        cat.needs.fatigue = 100;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.target === "tile") tile += 1;
      }
      expect(tile).toBe(0);
    }
  });

  it("у «Холод» теплі місця (ліжко, комп'ютер, підвіконня над батареєю) тягнуть теплолюба сильніше, а «Холодостійкого» — як у звичайний день", () => {
    const night = hours(23.5);
    const warmPlaces = (spots: Record<string, number>): number => spots["bed"]! + spots["computer"]! + spots["sill"]!;
    const plain = warmPlaces(sleepSpots({}, null, night));
    const warm = warmPlaces(sleepSpots({ warmth: 2 }, "cold", night));
    const usual = warmPlaces(sleepSpots({}, "cold", night));
    const hardy = warmPlaces(sleepSpots({ warmth: -2 }, "cold", night));
    expect(usual).toBeGreaterThan(plain);
    expect(warm).toBeGreaterThan(usual);
    expect(hardy).toBeLessThan(usual);
  });

  it("теплолюб у «Холод» залазить під ковдру — прояв «+»; кіт без риси спить на ковдрі", () => {
    for (const [traits, under] of [[{ warmth: 1 }, true], [{}, false]] as const) {
      const save = game();
      save.current.modifiers.day = "cold";
      Object.assign(save.current.character.body, { x: 3.5, y: 3.5 });
      const cat = withCat(save, traits, { x: 2.5, y: 3.5 });
      cat.needs.fatigue = 100;
      cat.act = { kind: "sleep", target: null, goal: { x: 1, y: 2 }, minutes: 480, elapsed: 0 };
      // Що мерзне дорогою до ліжка, видно й так (нижче); тут — лише ковдра.
      cat.weatherAt = save.current.day * MINUTES_PER_DAY + save.current.minute;
      arrive(save, cat);
      expect(cat.act.blanket === true, JSON.stringify(traits)).toBe(under);
      if (under) expect(seen(cat, "warmth")).toBe(1);
    }
    // «Живе на батареї» (+2) — і без холоду.
    const save = game();
    const cat = withCat(save, { warmth: 2 }, { x: 2.5, y: 3.5 });
    cat.act = { kind: "sleep", target: null, goal: { x: 1, y: 2 }, minutes: 480, elapsed: 0 };
    arrive(save, cat);
    expect(cat.act.blanket).toBe(true);
  });

  it("підвіконня над батареєю (фінальна перевірка рис 2026-10-26): «+» лягає туди, у «Холод» — частіше; кіт без риси й «−» — ніколи", () => {
    expect(sleepSpots({})["sill"]).toBe(0);
    expect(sleepSpots({ warmth: -2 }, "cold")["sill"]).toBe(0);
    const warm = sleepSpots({ warmth: 1 })["sill"]!;
    expect(warm).toBeGreaterThan(0);
    expect(sleepSpots({ warmth: 1 }, "cold")["sill"]).toBeGreaterThan(warm);
    expect(sleepSpots({ warmth: 2 })["sill"]).toBeGreaterThan(warm);
  });

  it("на одному підвіконні — один кіт: туди, де сидить, спить чи вже йде інший кіт, теплолюб не лягає", () => {
    const [bedroom, living] = WINDOWS.map((w) => objectById(w.sill));
    for (let seed = 0; seed < 100; seed++) {
      const save = game();
      const watcher = withCat(save, {}, { x: bedroom!.x + 0.5, y: bedroom!.y + 0.5 });
      watcher.act = { kind: "window", target: bedroom!.id, goal: null, minutes: 30, elapsed: 0 };
      const sleeper = withCat(save, {}, { x: 9.5, y: 7.5 });
      sleeper.act = { kind: "sleep", target: living!.id, goal: { x: living!.x, y: living!.y }, minutes: 480, elapsed: 0 };
      const cat = withCat(save, { warmth: 2 }, { x: 10.5, y: 7.5 });
      cat.needs.fatigue = 100;
      decide(save.current, cat, createRng(seed), { present: true });
      expect(WINDOWS.some((w) => w.sill === cat.act.target)).toBe(false);
    }
  });

  it("теплолюб спить клубочком на дошці над батареєю — прояв «+»; у «Холод» там не мерзне", () => {
    const pane = WINDOWS.find((w) => w.sill === "sill-living")!;
    const sill = objectById(pane.sill);
    const save = game();
    save.current.modifiers.day = "cold";
    Object.assign(save.current.character.body, { x: 3.5, y: 8.5 });
    const cat = withCat(save, { warmth: 1 }, { x: 3.5, y: 9.5 });
    cat.needs.fatigue = 100;
    cat.mood = 60;
    cat.act = { kind: "sleep", target: sill.id, goal: { x: sill.x, y: sill.y }, minutes: 480, elapsed: 0 };
    // Що мерзне дорогою, видно й так; тут — лише підвіконня.
    cat.weatherAt = save.current.day * MINUTES_PER_DAY + save.current.minute;
    arrive(save, cat);
    expect(cat.act).toMatchObject({ kind: "sleep", target: sill.id, goal: null });
    expect({ x: cat.x, y: cat.y }).toEqual(pane.seat);
    expect(seen(cat, "warmth")).toBe(1);
    const mood = cat.mood;
    live(save, 120);
    expect(cat.act.kind).toBe("sleep");
    expect(cat.mood).toBeGreaterThanOrEqual(mood);
    // Вікно цього підвіконня тепер зайняте: інший кіт туди дивитися не сяде.
    const other = withCat(save, {}, { x: 3.5, y: 7.5 });
    other.act = { kind: "window", target: sill.id, goal: null, minutes: 30, elapsed: 0 };
    live(save, 1);
    expect(other.act.kind).not.toBe("window");
  });

  it("поки теплолюб ішов, підвіконня зайняв інший кіт — спить на підлозі поруч", () => {
    const sill = objectById("sill-living");
    const save = game();
    const watcher = withCat(save, {}, { x: sill.x + 0.5, y: sill.y + 0.5 });
    watcher.act = { kind: "window", target: sill.id, goal: null, minutes: 60, elapsed: 0 };
    const cat = withCat(save, { warmth: 2 }, { x: 3.5, y: 8.5 });
    cat.needs.fatigue = 100;
    cat.act = { kind: "sleep", target: sill.id, goal: { x: sill.x, y: sill.y }, minutes: 480, elapsed: 0 };
    arrive(save, cat);
    arrive(save, cat);
    expect(cat.act.kind).toBe("sleep");
    expect(cat.act.target).toBeNull();
    expect(Math.floor(cat.x) === sill.x && Math.floor(cat.y) === sill.y).toBe(false);
  });

  it("«−» розпластався на плитці — прояв «−», але не в «Спеку» (там лежать усі)", () => {
    for (const [day, expected] of [[null, 1], ["heat", 0]] as const) {
      const save = game();
      save.current.modifiers.day = day;
      const cat = withCat(save, { warmth: -1 }, { x: 10.5, y: 3.5 });
      Object.assign(save.current.character.body, { x: 10.5, y: 4.3 });
      cat.act = { kind: "sleep", target: "tile", goal: { ...COOL_TILE }, minutes: 480, elapsed: 0 };
      // Що знемагає від спеки, видно й так (нижче); тут — лише сон на плитці.
      cat.weatherAt = save.current.day * MINUTES_PER_DAY + save.current.minute;
      arrive(save, cat);
      expect(Math.floor(cat.x)).toBe(COOL_TILE.x);
      // Прийшов справа, але лягає, як завжди, головою праворуч (перевірка етапу 2026-10-26).
      expect(cat.facing).toBe(1);
      expect(seen(cat, "warmth")).toBe(expected);
    }
  });

  it("теплолюб у «Холод» мерзне — думка-сніжинка, настрій падає, прояв «+»; під ковдрою — ні; кіт без риси — ні", () => {
    const run = (traits: Record<string, TraitLevel>, blanket = false): { mood: number; felt: number; seen: number } => {
      const save = game();
      save.current.modifiers.day = "cold";
      const cat = withCat(save, traits, { x: 9.5, y: 7.5 });
      cat.mood = 60;
      cat.act = blanket ? { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0, blanket: true } : idleAct(600);
      if (blanket) Object.assign(cat, { x: 1.5, y: 1.5 });
      cat.needs.fatigue = blanket ? 100 : 0;
      const { events, stop } = recordEvents();
      live(save, 6 * 60);
      stop();
      return { mood: cat.mood, felt: events.filter((e) => e.type === "weather-felt" && e.cat === cat.id).length, seen: seen(cat, "warmth") };
    };
    const warm = run({ warmth: 2 });
    // Раз на 3 години — і щоразу це видно.
    expect(warm.felt).toBe(2);
    expect(warm.seen).toBe(2);
    expect(warm.mood).toBeLessThan(60);
    const plain = run({});
    expect(plain.felt).toBe(0);
    const covered = run({ warmth: 2 }, true);
    expect(covered.felt).toBe(0);
    expect(covered.mood).toBeGreaterThanOrEqual(60);
    // −1 за одиницю на добу: за 6 годин без тепла «+2» втрачає на пів одиниці настрою більше, ніж кіт без риси.
    expect(plain.mood - warm.mood).toBeCloseTo((-WARMTH.weatherMood * 2 * (6 * 60)) / MINUTES_PER_DAY, 1);
  });

  it("«Не мерзне» у «Спеку» знемагає й п'є більше", () => {
    const thirst = (traits: Record<string, TraitLevel>, day: string | null): number => {
      const save = game();
      save.current.modifiers.day = day;
      const cat = withCat(save, traits, { x: 9.5, y: 7.5 });
      cat.act = idleAct(600);
      cat.needs.thirst = 0;
      live(save, 60);
      return cat.needs.thirst;
    };
    expect(thirst({ warmth: -2 }, null)).toBeCloseTo(NEED_PER_HOUR.thirst, 0);
    expect(thirst({ warmth: -2 }, "heat")).toBeCloseTo(thirst({}, "heat") * (1 + 2 * WARMTH.heatThirstStep), 0);
    const save = game();
    save.current.modifiers.day = "heat";
    const cat = withCat(save, { warmth: -1 }, { x: 9.5, y: 7.5 });
    cat.act = idleAct(600);
    const { events, stop } = recordEvents();
    live(save, 30);
    stop();
    expect(events.some((e) => e.type === "weather-felt" && e.feel === "hot")).toBe(true);
    expect(seen(cat, "warmth")).toBe(1);
  });
});

describe("«Схильність до повноти» (§9.12, рішення автора 2026-10-25)", () => {
  it("набір ваги: «+» гладшає швидше, «Не товстіє» — ніколи, стерилізований — на 30% швидше", () => {
    const save = game();
    const gained = (traits: Record<string, TraitLevel>, sterilized = false): number => {
      const cat = withCat(save, traits);
      cat.sterilized = sterilized;
      gainWeight(save.current, cat, 2);
      return weightOf(cat) - WEIGHT.norm;
    };
    expect(gained({})).toBe(2);
    expect(gained({ chubby: 2 })).toBe(4);
    expect(gained({ chubby: -1 })).toBe(1);
    expect(gained({ chubby: -2 })).toBe(0);
    expect(gained({}, true)).toBeCloseTo(2.6);
  });

  it("стерилізованому ×1,3 — лише за звичайного корму, порція корму для стерилізованих — ×1 (рішення автора 2026-10-26)", () => {
    const meal = (sterilized: boolean, sterileFood: boolean): number => {
      const save = game();
      const cat = withCat(save, {}, { x: 17.5, y: 4.5 });
      cat.sterilized = sterilized;
      const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
      bowl.food = 2;
      bowl.foodQuality = "cheap";
      bowl.sterile = sterileFood;
      cat.needs.hunger = 30;
      cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.25, elapsed: 0, nibble: false, second: true };
      live(save, 0.25);
      expect(bowl.food).toBe(1);
      return weightOf(cat) - WEIGHT.norm;
    };
    expect(meal(true, false)).toBeCloseTo(WEIGHT.portion * WEIGHT.sterilized);
    expect(meal(true, true)).toBeCloseTo(WEIGHT.portion);
    expect(meal(false, true)).toBeCloseTo(WEIGHT.portion);
  });

  it("британська короткошерста (схильність «ожиріння») гладшає ×1,25, напівкровка — ×1,125, інші породи — як безпородні (рішення автора 2026-10-26)", () => {
    const save = game();
    const gained = (breed: [string, string], traits: Record<string, TraitLevel> = {}): number => {
      const cat = withCat(save, traits);
      cat.breed = breed;
      gainWeight(save.current, cat, 2);
      return weightOf(cat) - WEIGHT.norm;
    };
    const british = "brytanska-korotkoshersta";
    expect(gained([british, british])).toBeCloseTo(2.5);
    expect(gained([british, "siamska"])).toBeCloseTo(2.25);
    expect(gained(["siamska", "siamska"])).toBeCloseTo(2);
    expect(gained(["mixed", "mixed"])).toBeCloseTo(2);
    // «Не товстіє» не гладшає й британцем.
    expect(gained([british, british], { chubby: -2 })).toBe(0);
  });

  it("порція не з голоду, ласощі й крадена їжа — гладшає; порція з голоду — ні", () => {
    const meal = (hunger: number): number => {
      const save = game();
      const cat = withCat(save, {}, { x: 17.5, y: 4.5 });
      const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
      bowl.food = 2;
      bowl.foodQuality = "cheap";
      cat.needs.hunger = hunger;
      cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.25, elapsed: 0, nibble: false, second: true };
      live(save, 0.25);
      expect(bowl.food).toBe(1);
      return weightOf(cat) - WEIGHT.norm;
    };
    expect(meal(90)).toBe(0);
    expect(meal(30)).toBeCloseTo(WEIGHT.portion);
    // Ласощі.
    const save = game();
    const cat = withCat(save, {}, { x: 9.5, y: 8.5 });
    save.current.home.supplies.treats.cheap = 5;
    save.current.character.held = { kind: "cat", cat: cat.id };
    giveTreat(save.current, "cheap", createRng(1));
    expect(weightOf(cat)).toBe(WEIGHT.norm + WEIGHT.treat);
    // Крадена страва зі столу.
    save.current.character.held = null;
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" } as never;
    cat.act = { kind: "steal", target: "table", goal: null, minutes: 0.25, elapsed: 0 };
    live(save, 0.25);
    expect(weightOf(cat)).toBeCloseTo(WEIGHT.norm + WEIGHT.treat + WEIGHT.stolen, 2);
  });

  it("прогризений пакет у ящиках біля входу — теж крадене: корм +2, ласощі +1 (перевірка етапу 2026-10-26)", () => {
    for (const [product, gain] of [["catFood", WEIGHT.stolen], ["treats", WEIGHT.treat]] as const) {
      const save = game();
      save.current.home.boxes = { [product]: { cheap: 1, premium: 0 } };
      const cat = withCat(save, {}, { x: 12.5, y: 8.5 });
      cat.act = { kind: "chew", target: "boxes", goal: null, minutes: 0.25, elapsed: 0 };
      live(save, 0.25);
      expect(save.current.home.boxes[product]?.cheap, product).toBe(0);
      expect(weightOf(cat), product).toBeCloseTo(WEIGHT.norm + gain);
    }
  });

  it("стерилізований прогриз пакет корму для стерилізованих — без ×1,3, пакет звичайного — ×1,3 (рішення автора 2026-10-26, перевірка правок)", () => {
    for (const [product, factor] of [["sterileFood", 1], ["catFood", WEIGHT.sterilized]] as const) {
      const save = game();
      save.current.home.boxes = { [product]: { cheap: 1, premium: 0 } };
      const cat = withCat(save, {}, { x: 12.5, y: 8.5 });
      cat.sterilized = true;
      cat.act = { kind: "chew", target: "boxes", goal: null, minutes: 0.25, elapsed: 0 };
      live(save, 0.25);
      expect(save.current.home.boxes[product]?.cheap, product).toBe(0);
      expect(weightOf(cat), product).toBeCloseTo(WEIGHT.norm + WEIGHT.stolen * factor);
    }
  });

  it("«−» «переїв» лише помітно: трапеза трохи раніше звичайного — ні, порція при голоді 60 і нижче — так (перевірка етапу 2026-10-26)", () => {
    const meal = (hunger: number): number => {
      const save = game();
      Object.assign(save.current.character.body, { x: 15.5, y: 3.5 });
      const cat = withCat(save, { chubby: -1 }, { x: 17.5, y: 4.5 });
      const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
      bowl.food = 2;
      bowl.foodQuality = "cheap";
      cat.needs.hunger = hunger;
      cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.25, elapsed: 0, nibble: false, second: true };
      live(save, 0.25);
      expect(bowl.food).toBe(1);
      return seen(cat, "chubby");
    };
    expect(meal(70)).toBe(0);
    expect(meal(55)).toBe(1);
    expect(meal(30)).toBe(1);
  });

  it("гра, зумі й боротьба та час повертають вагу до норми, але не нижче", () => {
    const save = game();
    const cat = withCat(save);
    cat.weight = 53;
    exercise(cat);
    expect(weightOf(cat)).toBe(53 - WEIGHT.playLoss);
    settleWeight(cat, 20 * 60);
    expect(weightOf(cat)).toBeCloseTo(52 - 20 * WEIGHT.perHour);
    exercise(cat, 5);
    expect(weightOf(cat)).toBe(WEIGHT.norm);
    expect(cat.weight).toBeUndefined();
    // Зумі — теж рух.
    cat.weight = 60;
    cat.act = { kind: "zoomies", target: null, goal: null, minutes: 0.25, elapsed: 0 };
    live(save, 0.25);
    expect(weightOf(cat)).toBeLessThanOrEqual(60 - WEIGHT.playLoss);
    // Гра вудкою знімає вагу за часткою потреби гри.
    expect(PLAY_RELIEF).toBeGreaterThan(0);
  });

  it("від 75 — ожиріння: менше грається, ходить повільніше, нагору не лізе; нижче 65 — минає", () => {
    const save = game();
    const cat = withCat(save, { climbing: 1 });
    cat.weight = 74;
    nightlyDiseases(save.current, createRng(1));
    expect(hasDisease(cat, "obesity")).toBe(false);
    cat.weight = WEIGHT.obese;
    nightlyDiseases(save.current, createRng(1));
    expect(hasDisease(cat, "obesity")).toBe(true);
    expect(climbWeight(cat)).toBe(0);
    expect(walkFactor(cat)).toBeCloseTo(WEIGHT.obeseWalk);
    // Потреба гри росте повільніше.
    const play = (obese: boolean): number => {
      const s = game();
      const c = withCat(s, {}, { x: 9.5, y: 7.5 });
      if (obese) fallIll(s.current, c, "obesity");
      c.weight = obese ? 80 : 50;
      c.act = idleAct(600);
      c.needs.play = 0;
      s.current.minute = hours(19);
      live(s, 60);
      return c.needs.play;
    };
    expect(play(true)).toBeCloseTo(play(false) * WEIGHT.obesePlay, 1);
    cat.weight = WEIGHT.cured;
    nightlyDiseases(save.current, createRng(1));
    expect(hasDisease(cat, "obesity")).toBe(true);
    cat.weight = WEIGHT.cured - 1;
    nightlyDiseases(save.current, createRng(1));
    expect(hasDisease(cat, "obesity")).toBe(false);
    expect(climbWeight(cat)).toBe(CLIMBING.step);
  });

  it("повний кіт на малюнку ширшає поступово", () => {
    const save = game();
    const cat = withCat(save);
    expect(girthOf(cat)).toBe(1);
    cat.weight = 60;
    const plump = girthOf(cat);
    cat.weight = 80;
    expect(plump).toBeGreaterThan(1);
    expect(girthOf(cat)).toBeGreaterThan(plump);
  });

  it("«+» помітно гладшає — вага від 60 на очах персонажа, прояв раз на день; «−» переїв, а вага нижче 55 — прояв «−»", () => {
    const save = game();
    const plump = withCat(save, { chubby: 1 }, { x: 9.5, y: 7.5 });
    plump.act = idleAct(600);
    plump.weight = 59;
    live(save, 1);
    expect(seen(plump, "chubby")).toBe(0);
    plump.weight = 61;
    live(save, 30);
    expect(seen(plump, "chubby")).toBe(1);
    const slim = withCat(save, { chubby: -2 }, { x: 10.5, y: 7.5 });
    gainWeight(save.current, slim, WEIGHT.portion);
    expect(weightOf(slim)).toBe(WEIGHT.norm);
    expect(seen(slim, "chubby")).toBe(1);
    gainWeight(save.current, slim, WEIGHT.portion);
    expect(seen(slim, "chubby")).toBe(1);
  });
});

describe("сценарій «Тіло й тепло» (`scenarios/body-warmth.json`)", () => {
  it("«Мерзлячка» мерзне, «Ковдрочка» під ковдрою, «Холодостійкий» на плитці, «Батарейка» над батареєю, «Кухлик» п'є з кухля, «Пухкенький» ширший і нагору не лізе", () => {
    const scenario = FILE_SCENARIOS["body-warmth"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const byName = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const { events, stop } = recordEvents();
    advance(save, 20);
    stop();
    expect(events.some((e) => e.type === "weather-felt" && e.cat === byName("Мерзлячка").id && e.feel === "cold")).toBe(true);
    expect(byName("Ковдрочка").act.blanket).toBe(true);
    const hardy = byName("Холодостійкий");
    expect(hardy.act.target).toBe("tile");
    expect(Math.floor(hardy.x)).toBe(COOL_TILE.x);
    expect(hardy.facing).toBe(1);
    // Фінальна перевірка рис (2026-10-26): «Батарейка» спить над батареєю, «Кухлик» напився з кухля.
    const radiator = byName("Батарейка");
    expect(radiator.act).toMatchObject({ kind: "sleep", target: "sill-living", goal: null });
    expect({ x: radiator.x, y: radiator.y }).toEqual(WINDOWS.find((w) => w.sill === "sill-living")!.seat);
    expect(byName("Кухлик").needs.thirst).toBeLessThan(10);
    expect(events.some((e) => e.type === "cat-mood" && e.cat === byName("Кухлик").id && e.reason === "п'є з кухля")).toBe(true);
    const plump = byName("Пухкенький");
    expect(hasDisease(plump, "obesity")).toBe(true);
    expect(girthOf(plump)).toBeGreaterThan(1.3);
    expect(climbWeight(plump)).toBe(0);
  });
});
