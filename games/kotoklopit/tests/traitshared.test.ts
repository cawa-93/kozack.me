// Спільні механіки рис (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): пауза між оглушеннями,
// пауза шипіння, не більше двох нічних побудок, гучний звук і кроки.

import { describe, expect, it } from "vitest";

import { stun } from "../src/sim/body";
import { createCat, idleAct, isAdapting } from "../src/sim/cat";
import { jealousy, tickCats } from "../src/sim/catai";
import { HISS_PAUSE_MINUTES, HOUSEHOLD, MODIFIERS, NOISE, STUN_PAUSE_MINUTES, WAKE_UP } from "../src/sim/config";
import { advance, goToSleep, newGame } from "../src/sim/game";
import { robotAt, tapWasher, tickHousehold } from "../src/sim/household";
import { tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { hearSteps, loudNoise } from "../src/sim/noise";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  save.current.character.body.x = 9.5;
  save.current.character.body.y = 8.5;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

/** Кіт не спить і нічим не зайнятий ще пів години; потреби низькі — нікуди не поспішає. */
function awake(cat: Cat): Cat {
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  return cat;
}

function asleep(cat: Cat): Cat {
  awake(cat);
  cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
  cat.needs.fatigue = 60;
  return cat;
}

describe("спільні паузи (§9.12, рішення автора 2026-10-25)", () => {
  it("персонажа оглушує не частіше ніж раз на 5 хвилин", () => {
    const save = game();
    const state = save.current;
    expect(stun(state)).toBe(true);
    expect(state.character.body.stun).toBeGreaterThan(0);
    state.character.body.stun = 0;
    state.minute += STUN_PAUSE_MINUTES - 1;
    expect(stun(state)).toBe(false);
    expect(state.character.body.stun).toBe(0);
    state.minute += 1;
    expect(stun(state)).toBe(true);
  });

  it("кіт шипить не частіше ніж раз на 20 хвилин, і без шипіння немає сварки", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const jealous = withCat(save, { jealousy: 2 }, { x: 7.5, y: 8.5 });
    const { events, stop } = recordEvents();
    jealousy(save.current, lucky);
    jealousy(save.current, lucky);
    const hissed = (): number => events.filter((e) => e.type === "hissed").length;
    expect(hissed()).toBe(1);
    expect(jealous.traits[0]?.seen).toBe(1);
    save.current.minute += HISS_PAUSE_MINUTES;
    jealousy(save.current, lucky);
    stop();
    expect(hissed()).toBe(2);
  });

  it("за ніч будять не більше двох котів", () => {
    let capped = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game(seed);
      for (let i = 0; i < 6; i++) withCat(save, { nocturnal: 2 }, { x: 3.5 + i, y: 8.5 });
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 2;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      const wakes = report?.wakeUps.length ?? 0;
      expect(wakes).toBeLessThanOrEqual(WAKE_UP.maxPerNight);
      if (wakes === WAKE_UP.maxPerNight) capped += 1;
    }
    expect(capped).toBeGreaterThan(0);
  });
});

describe("гучний звук (§9.12, рішення автора 2026-10-25)", () => {
  it("пилосос загудів: несміливий ховається, сміливий іде подивитися — обидва прояви видно", () => {
    const save = game();
    standAt(save, "vacuum");
    const plain = awake(withCat(save, {}, { x: 14.5, y: 8.5 }));
    const brave = awake(withCat(save, { bravery: 1 }, { x: 12.5, y: 8.5 }));
    const timid = awake(withCat(save, { bravery: -1 }, { x: 10.5, y: 8.5 }));
    const { events, stop } = recordEvents();
    advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(save.current.character.activity?.kind).toBe("use");
    expect(plain.act.kind).toBe("hide");
    expect(timid.act.kind).toBe("hide");
    expect(timid.traits[0]?.seen).toBe(1);
    expect(brave.act).toMatchObject({ kind: "wander", target: "watch" });
    expect(brave.traits[0]?.seen).toBe(1);
    expect(events.flatMap((e) => (e.type === "scared" ? [e.cat] : []))).toEqual([plain.id, timid.id]);
  });

  it("соня спить далі, а чуйний прокидається й втрачає 1 настрою — прояви «Тривалості сну»", () => {
    const save = game();
    const sound = asleep(withCat(save, { sleep: 2 }, { x: 7.5, y: 8.5 }));
    const light = asleep(withCat(save, { sleep: -2, bravery: 1 }, { x: 8.5, y: 8.5 }));
    light.mood = 50;
    const { events, stop } = recordEvents();
    loudNoise(save.current, "vacuum", null);
    stop();
    expect(sound.act.kind).toBe("sleep");
    expect(sound.traits[0]?.seen).toBe(1);
    expect(light.act.kind).not.toBe("sleep");
    expect(light.mood).toBeCloseTo(50 + NOISE.wokenMood);
    expect(light.traits[0]?.seen).toBe(1);
    expect(events.some((e) => e.type === "cat-woke" && e.cat === light.id)).toBe(true);
  });

  it("дрібний звук чути лише в тій самій кімнаті, і ховається від нього лише полохливий", () => {
    const save = game();
    const timid = awake(withCat(save, { bravery: -2 }, { x: 7.5, y: 8.5 }));
    const plain = awake(withCat(save, {}, { x: 8.5, y: 8.5 }));
    const away = awake(withCat(save, { bravery: -2 }, { x: 16.5, y: 2.5 }));
    loudNoise(save.current, "broken", { x: 9.5, y: 9.5 });
    expect(timid.act.kind).toBe("hide");
    expect(timid.act.minutes).toBeCloseTo(NOISE.smallMinutes * 2);
    expect(plain.act.kind).toBe("idle");
    expect(away.act.kind).toBe("idle");
  });

  it("як довго ховатися — «Стресостійкість»", () => {
    const save = game();
    const nervous = awake(withCat(save, { stress: -2 }, { x: 7.5, y: 8.5 }));
    const calm = awake(withCat(save, { stress: 2 }, { x: 8.5, y: 8.5 }));
    loudNoise(save.current, "robot", null);
    expect(nervous.act.minutes).toBeCloseTo(NOISE.big.robot * 1.5);
    expect(calm.act.minutes).toBeCloseTo(NOISE.big.robot * 0.5);
  });

  it("персонаж упав, віджим — дрібні гучні звуки", () => {
    const save = game();
    const timid = awake(withCat(save, { bravery: -2 }, { x: 8.5, y: 8.5 }));
    expect(stun(save.current)).toBe(true);
    expect(timid.act.kind).toBe("hide");
    const bath = awake(withCat(save, { bravery: -2 }, { x: 9.5, y: 2.5 }));
    save.current.home.supplies.detergent.cheap = 2;
    expect(tapWasher(save.current)).toBe("started");
    const { events, stop } = recordEvents();
    tickHousehold(save.current, hours(12), HOUSEHOLD.washMinutes - NOISE.spinMinutes - 1);
    expect(bath.act.kind).toBe("idle");
    tickHousehold(save.current, hours(13), 2);
    stop();
    expect(events.some((e) => e.type === "laundry" && e.stage === "spin")).toBe(true);
    expect(bath.act.kind).toBe("hide");
  });

  it("феєрверки: несміливі ховаються й засмучуються, сміливі — ні", () => {
    const save = game();
    save.current.modifiers.day = "festival";
    const plain = awake(withCat(save, {}, { x: 7.5, y: 8.5 }));
    const brave = awake(withCat(save, { bravery: 2 }, { x: 8.5, y: 8.5 }));
    plain.mood = 50;
    brave.mood = 50;
    tickModifiers(save.current, MODIFIERS.festival.minute - 1, 2, false);
    expect(plain.act.kind).toBe("hide");
    expect(plain.mood).toBeCloseTo(50 + MODIFIERS.festival.mood);
    expect(brave.act.kind).toBe("idle");
    expect(brave.mood).toBe(50);
  });

  it("«Безстрашний» катається на роботі-пилососі, «Сміливий» — ні", () => {
    const save = game();
    save.current.home.appliances.robot = "cheap";
    const fearless = Array.from({ length: 8 }, (_, i) => awake(withCat(save, { bravery: 2 }, { x: 2.5 + i, y: 8.5 })));
    const brave = Array.from({ length: 8 }, (_, i) => awake(withCat(save, { bravery: 1 }, { x: 2.5 + i, y: 9.5 })));
    tickHousehold(save.current, HOUSEHOLD.robotMinute - 1, 2);
    const riders = fearless.filter((c) => c.act.target === "robot");
    expect(riders.length).toBeGreaterThan(0);
    expect(brave.some((c) => c.act.target === "robot")).toBe(false);
    save.current.minute = HOUSEHOLD.robotMinute + 20;
    tickCats(save.current, 0.1, { present: true });
    const at = robotAt(save.current);
    expect(riders[0]?.x).toBeCloseTo(at.x);
    expect(riders[0]?.y).toBeCloseTo(at.y);
  });

  it("кроки будять лише чуйного кота, раз за прохід", () => {
    const wakes = (level: TraitLevel | 0): number => {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { sleep: level }, { x: 6.5, y: 8.5 });
      let woken = 0;
      for (let pass = 0; pass < 40; pass++) {
        asleep(cat);
        save.current.character.body.x = 7.5;
        hearSteps(save.current, { x: 9.5, y: 8.5 });
        // Персонаж уже поруч: це той самий прохід, кроки вже не будять.
        hearSteps(save.current, { x: 7.6, y: 8.5 });
        if (cat.act.kind !== "sleep") woken += 1;
      }
      return woken;
    };
    expect(wakes(0)).toBe(0);
    expect(wakes(1)).toBe(0);
    expect(wakes(-2)).toBeGreaterThan(0);
    expect(wakes(-2)).toBeLessThan(40);
  });

  it("сміливий звикає до нового дому за день, полохливий — за три (§9.6)", () => {
    const save = game();
    const days = (level: TraitLevel | 0): number => {
      const cat = withCat(save, level === 0 ? {} : { bravery: level });
      cat.arrivedDay = 5;
      let day = 0;
      for (; day < 5; day++) {
        save.current.day = cat.arrivedDay + day;
        save.current.minute = hours(23.9);
        if (!isAdapting(save.current, cat)) break;
      }
      return day;
    };
    expect(days(2)).toBe(1);
    expect(days(0)).toBe(2);
    expect(days(-2)).toBe(3);
  });
});
