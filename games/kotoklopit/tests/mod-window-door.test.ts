// Модифікатори дня за вікном і в під'їзді (§4.1, `DAY_MODIFIERS.md`, «Коти»): «Чужий кіт під вікном» ↔ «Голуби на карнизі» —
// як коти сидять на підвіконні (§9.12 «Вікно»), «Валер'янка в під'їзді» ↔ «Пес на сходах» — як тягнуться до дверей («Втечі»).

import { describe, expect, it } from "vitest";

import { streetSound } from "../src/audio/sfx/ambient/loops";
import { catFeeling } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { markTriggered, startWindow, tickCats, windowWeight } from "../src/sim/catai";
import { DAYLIGHT, MODIFIERS, WINDOW } from "../src/sim/config";
import { openDoor } from "../src/sim/door";
import { newGame } from "../src/sim/game";
import { objectById, WINDOWS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { angryAtWindow, valerianPull } from "../src/sim/windowdoor";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(day: string | null, seed = 11): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.modifiers.day = day;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 7.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.sterilized = true;
  cat.love = 50;
  cat.mood = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Кіт уже на підвіконні й дивиться у вікно. */
function atWindow(cat: Cat, sill = WINDOWS[1]!.sill, minutes = 60): void {
  const o = objectById(sill);
  Object.assign(cat, { x: o.x + 0.5, y: o.y + 0.5 });
  cat.act = { kind: "window", target: sill, goal: null, minutes, elapsed: 0 };
}

function live(save: Save, minutes: number, step = 0.25, each?: () => void): void {
  for (let t = 0; t < minutes; t += step) {
    save.current.minute += step;
    tickCats(save.current, step, { present: true });
    each?.();
  }
}

describe("«Чужий кіт під вікном» (§4.1)", () => {
  it("удень на підвіконні кіт без риси й «+» злиться: настрій падає, за `WINDOW.angerMinutes` шипить на кота поруч — не прояв риси", () => {
    for (const traits of [{}, { window: 2 }] as Record<string, TraitLevel>[]) {
      const save = game("stray-cat");
      Object.assign(save.current.character.body, { x: 2.5, y: 8.5 });
      const cat = withCat(save, traits);
      const other = withCat(save, {}, { x: 2.5, y: 7.5 });
      other.act = idleAct(60);
      atWindow(cat);
      // Кіт іде на підвіконня, як завжди: злість — там, а не дорогою.
      expect(windowWeight(save.current, cat)).toBeGreaterThan(0);
      live(save, 1);
      expect(catFeeling(save.current, cat)).toBe("reluctant");
      const calm = game(null);
      const control = withCat(calm, traits);
      atWindow(control);
      live(calm, WINDOW.angerMinutes - 0.5);
      live(save, WINDOW.angerMinutes - 1.5);
      expect(cat.mood).toBeLessThan(50);
      expect(cat.mood).toBeLessThan(control.mood);
      const { events, stop } = recordEvents();
      live(save, 1);
      stop();
      expect(events.some((e) => e.type === "window-angry" && e.cat === cat.id)).toBe(true);
      expect(events.some((e) => e.type === "chatter")).toBe(false);
      expect(events.some((e) => e.type === "hissed" && e.cat === cat.id && e.at === other.id)).toBe(true);
      expect(relation(save.current, cat, other)).toBeLessThan(0);
      expect(seen(cat, "window")).toBe(0);
    }
  });

  it("«Злиться на вікно» лишається собою, «Не дивиться у вікно» не йде; увечері чужого кота вже немає; день — тригер міток", () => {
    const save = game("stray-cat");
    const angry = withCat(save, { window: -2 });
    atWindow(angry);
    live(save, WINDOW.angerMinutes + 0.5);
    expect(seen(angry, "window")).toBe(1);
    expect(windowWeight(save.current, withCat(save, { window: -1 }))).toBe(0);
    const plain = withCat(save, {});
    expect(angryAtWindow(save.current, plain)).toBe(true);
    save.current.minute = hours(WINDOW.to);
    expect(angryAtWindow(save.current, plain)).toBe(false);
    plain.mood = 80;
    expect(markTriggered(save.current, plain)).toBe(true);
    const calm = game(null);
    const happy = withCat(calm, {});
    happy.mood = 80;
    expect(markTriggered(calm.current, happy)).toBe(false);
    expect(angryAtWindow(calm.current, happy)).toBe(false);
  });
});

describe("«Голуби на карнизі» (§4.1)", () => {
  it("коти з «Вікном» від 0 частіше й довше на підвіконні; «Злиться на вікно» — як завжди", () => {
    const pigeons = game("pigeons");
    const calm = game(null);
    for (const traits of [{}, { window: 1 }, { window: 2 }] as Record<string, TraitLevel>[]) {
      expect(windowWeight(pigeons.current, withCat(pigeons, traits))).toBeCloseTo(windowWeight(calm.current, withCat(calm, traits)) * MODIFIERS.pigeons.weight);
    }
    expect(windowWeight(pigeons.current, withCat(pigeons, { window: -2 }))).toBeCloseTo(WINDOW.weight);
    expect(windowWeight(pigeons.current, withCat(pigeons, { window: -1 }))).toBe(0);
    const sitting = (save: Save, traits: Record<string, TraitLevel>): number => {
      const cat = withCat(save, traits);
      expect(startWindow(save.current, cat, createRng(3))).toBe(true);
      const minutes = cat.act.minutes;
      save.current.cats = save.current.cats.filter((c) => c !== cat);
      return minutes;
    };
    expect(sitting(game("pigeons"), {})).toBeCloseTo(sitting(game(null), {}) * MODIFIERS.pigeons.minutes);
    expect(sitting(game("pigeons"), { window: -2 })).toBeCloseTo(sitting(game(null), { window: -2 }));
  });

  it("на підвіконні гра знімається й настрій росте більше, кекає й кіт без риси (не прояв); з вікон чути пташок до вечора", () => {
    const watch = (day: string | null): { cat: Cat; chatter: number } => {
      const save = game(day);
      Object.assign(save.current.character.body, { x: 2.5, y: 8.5 });
      const cat = withCat(save);
      cat.needs.play = 60;
      atWindow(cat, WINDOWS[1]!.sill, 300);
      const { events, stop } = recordEvents();
      live(save, 120, 1);
      stop();
      return { cat, chatter: events.filter((e) => e.type === "chatter" && e.cat === cat.id).length };
    };
    const calm = watch(null);
    const pigeons = watch("pigeons");
    expect(pigeons.cat.needs.play).toBeLessThan(calm.cat.needs.play);
    expect(pigeons.cat.mood).toBeGreaterThan(calm.cat.mood);
    expect(calm.chatter).toBe(0);
    expect(pigeons.chatter).toBeGreaterThan(0);
    expect(seen(pigeons.cat, "window")).toBe(0);
    const at = (minute: number, day: string | null): Save => {
      const save = game(day);
      save.current.minute = minute;
      return save;
    };
    expect(streetSound(at(hours(12), "pigeons").current)).toBe("birds");
    expect(streetSound(at(hours(12), null).current)).toBe("city");
    expect(streetSound(at(DAYLIGHT.eveningStart, "pigeons").current)).toBe("evening");
  });
});

/** Скільки котів за `runs` зерен хоч раз сіли під двері нявчати за 5 годин дня. */
function doorCallers(day: string | null, traits: Record<string, TraitLevel>, runs = 30): number {
  let callers = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const save = game(day, seed);
    save.current.minute = hours(10);
    const cat = withCat(save, traits);
    cat.act = idleAct(600);
    let called = false;
    live(save, 5 * 60, 1, () => {
      if (cat.act.kind === "beg" && cat.act.target === "door") called = true;
    });
    if (called) callers += 1;
  }
  return callers;
}

/** Скільки котів біля дверей за `runs` зерен вибігли на сходи, коли двері відчинили. */
function escapes(day: string | null, traits: Record<string, TraitLevel>, runs = 200): number {
  let out = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const save = game(day, seed);
    const cat = withCat(save, traits, { x: 10.5, y: 9.5 });
    openDoor(save.current);
    if (cat.away === "stairs") out += 1;
  }
  return out;
}

describe("«Валер'янка в під'їзді» (§4.1)", () => {
  it("тяга до дверей — за «Котячою м'ятою»; «Боїться дверей» і інші дні — без неї", () => {
    const save = game("valerian");
    expect(valerianPull(save.current, withCat(save))).toBe(1);
    expect(valerianPull(save.current, withCat(save, { catnip: 2 }))).toBeCloseTo(1 + 2 * MODIFIERS.valerian.catnipStep);
    expect(valerianPull(save.current, withCat(save, { catnip: -2 }))).toBe(0);
    expect(valerianPull(save.current, withCat(save, { escape: -2 }))).toBe(0);
    const calm = game(null);
    expect(valerianPull(calm.current, withCat(calm))).toBe(0);
  });

  it("удень під двері нявчати йде будь-хто, «Фанат м'яти» — частіше; «Боїться дверей» — ні", () => {
    expect(doorCallers(null, {})).toBe(0);
    const plain = doorCallers("valerian", {});
    expect(plain).toBeGreaterThan(10);
    expect(doorCallers("valerian", { catnip: 2 })).toBeGreaterThan(plain);
    expect(doorCallers("valerian", { escape: -2 })).toBe(0);
  });

  it("відчинені двері — утекти легше, «Домосід» не відходить; «Боїться дверей» тікає углиб квартири", () => {
    const calm = escapes(null, {});
    expect(escapes("valerian", {})).toBeGreaterThan(calm * 1.5);
    const save = game("valerian");
    const homebody = withCat(save, { escape: -1 }, { x: 10.5, y: 9.5 });
    const scared = withCat(save, { escape: -2 }, { x: 10.5, y: 8.5 });
    openDoor(save.current);
    expect(homebody.act.kind).toBe("idle");
    expect(homebody.away).toBeNull();
    expect(scared.away).toBeNull();
    expect(scared.act).toMatchObject({ kind: "wander", target: "flee" });
  });
});

describe("«Пес на сходах» (§4.1)", () => {
  it("втеч немає, «Втікач» під дверима не кричить", () => {
    expect(escapes(null, { escape: 2 }, 50)).toBeGreaterThan(0);
    expect(escapes("stair-dog", { escape: 2 }, 50)).toBe(0);
    expect(doorCallers(null, { escape: 2 })).toBeGreaterThan(0);
    expect(doorCallers("stair-dog", { escape: 2 })).toBe(0);
  });
});
