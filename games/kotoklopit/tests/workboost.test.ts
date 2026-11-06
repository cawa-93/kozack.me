// Прискорення роботи (§8, рішення автора 2026-11-02): поки персонаж працює за комп'ютером, час розганяється від ×1 до ×10 за
// 60 секунд реального часу; робота зупинилася — миттєво ×1.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { WORK_BOOST } from "../src/sim/config";
import { FILE_SCENARIOS, applyScenario } from "../src/dev/scenarios";
import { advance, interact, newGame } from "../src/sim/game";
import { answerCall } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { collapseMinute } from "../src/sim/sleep";
import { clockFrame, gameMinutes, workBoost, type ClockFrame } from "../src/sim/time";
import type { Save } from "../src/sim/types";
import { isWorking, workGoesOn } from "../src/sim/work";
import { hours, recordEvents, standAt, waitUntil } from "./helpers";

const STILL = { move: { x: 0, y: 0 }, hold: false };
const WALK = { move: { x: 0, y: 1 }, hold: false };
/** Кадр, коли гра йде й робота йде, на звичайній швидкості. */
const WORKING: ClockFrame = { seconds: 0.05, running: true, working: true, speed: 1 };

function game(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
  save.current.modifiers.day = null;
  return save;
}

/** Секунди розгону після стількох секунд роботи кадрами по 0,05 с. */
function workFor(seconds: number, from = 0): number {
  let boost = from;
  for (let i = 0; i < Math.round(seconds / WORKING.seconds); i++) boost = clockFrame(boost, WORKING).boostSeconds;
  return boost;
}

describe("прискорення роботи (§8)", () => {
  it("числа — з дизайн-документа: до ×10 за 40 секунд", () => {
    expect(WORK_BOOST).toEqual({ max: 10, rampSeconds: 40 });
  });

  it("рівномірно від ×1 до ×10 за 40 секунд, далі ×10", () => {
    expect(workBoost(0)).toBe(1);
    expect(workBoost(20)).toBeCloseTo(5.5);
    expect(workBoost(40)).toBe(10);
    expect(workBoost(60)).toBe(10);
    // На старті роботи кадр іде з ×1, а за 20 і 40 секунд кадрів — з ×5,5 і ×10.
    expect(clockFrame(0, WORKING).minutes).toBeCloseTo(gameMinutes(0.05));
    expect(workBoost(workFor(20))).toBeCloseTo(5.5);
    expect(clockFrame(workFor(20), WORKING).minutes).toBeCloseTo(gameMinutes(0.05) * 5.5);
    expect(workBoost(workFor(40))).toBeCloseTo(10);
    expect(clockFrame(workFor(60), WORKING).minutes).toBeCloseTo(gameMinutes(0.05) * 10);
  });

  it("робота зупинилася — миттєво ×1, і наступна розганяється з нуля", () => {
    const stopped = clockFrame(workFor(45), { ...WORKING, working: false });
    expect(stopped).toEqual({ minutes: gameMinutes(0.05), boostSeconds: 0 });
    expect(clockFrame(stopped.boostSeconds, WORKING).minutes).toBeCloseTo(gameMinutes(0.05));
  });

  it("секунди, коли гра стоїть, розгін не додають і не скидають; зупинка роботи за карткою — скидає", () => {
    const boost = workFor(20);
    // Картка, телефон, пауза чи засинання: годинник стоїть, розгін той самий.
    expect(clockFrame(boost, { ...WORKING, seconds: 0.1, running: false })).toEqual({ minutes: 0, boostSeconds: boost });
    expect(workBoost(workFor(10, clockFrame(boost, { ...WORKING, running: false }).boostSeconds))).toBeCloseTo(workBoost(30));
    // Поки картка відкрита, роботу зупинили (відповіли мамі, поїхали): розгін з нуля.
    expect(clockFrame(boost, { ...WORKING, running: false, working: false })).toEqual({ minutes: 0, boostSeconds: 0 });
  });

  it("швидкість режиму розробки множиться на розгін", () => {
    expect(clockFrame(0, { ...WORKING, speed: 5 }).minutes).toBeCloseTo(gameMinutes(0.05) * 5);
    expect(clockFrame(workFor(40), { ...WORKING, speed: 5 }).minutes).toBeCloseTo(gameMinutes(0.05) * 5 * 10);
    expect(clockFrame(workFor(40), { ...WORKING, speed: 5, working: false }).minutes).toBeCloseTo(gameMinutes(0.05) * 5);
    // Розгін — за реальними секундами: і на ×60 до ×10 — ті самі 40 секунд.
    let boost = 0;
    for (let i = 0; i < 400; i++) boost = clockFrame(boost, { ...WORKING, seconds: 0.05, speed: 60 }).boostSeconds;
    expect(workBoost(boost)).toBeCloseTo(5.5);
  });
});

describe("чи йде робота (§8)", () => {
  it("за комп'ютером — так; кадр, у якому персонаж устає, — уже ні", () => {
    const save = game();
    standAt(save, "computer");
    expect(workGoesOn(save.current)).toBe(false);
    interact(save);
    expect(workGoesOn(save.current)).toBe(true);
    expect(workGoesOn(save.current, STILL)).toBe(true);
    // Рух знімає з-за комп'ютера на першому ж кроці кадру: увесь кадр — з ×1.
    expect(workGoesOn(save.current, WALK)).toBe(false);
    advance(save, 0.2, WALK);
    expect(workGoesOn(save.current)).toBe(false);
    // Натискання дії теж підводить з-за комп'ютера.
    standAt(save, "computer");
    interact(save);
    interact(save);
    expect(workGoesOn(save.current)).toBe(false);
  });

  it("пошук роботи — теж робота за комп'ютером: розганяється", () => {
    const scenario = FILE_SCENARIOS["job-search"];
    if (!scenario) throw new Error("немає сценарію job-search");
    const save = applyScenario(scenario);
    expect(save.current.job.unemployed).toBe(true);
    interact(save);
    expect(isWorking(save.current)).toBe(true);
    let boost = 0;
    for (let i = 0; i < 400; i++) {
      const working = workGoesOn(save.current, STILL);
      const clock = clockFrame(boost, { ...WORKING, working });
      boost = clock.boostSeconds;
      advance(save, clock.minutes, STILL);
    }
    expect(workGoesOn(save.current)).toBe(true);
    expect(workBoost(boost)).toBeCloseTo(5.5);
  });

  it("кіт сів на клавіатуру — робота стоїть: ×1, розгін з нуля", () => {
    const save = game();
    save.current.minute = hours(19);
    standAt(save, "computer");
    interact(save);
    const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at: { x: 7.5, y: 6.5 } });
    cat.arrivedDay = -10;
    addCat(save.current, cat);
    cat.act = { kind: "keyboard", target: "computer", goal: null, minutes: 15, elapsed: 0 };
    const boost = workFor(45);
    const { events, stop } = recordEvents();
    advance(save, 0.1, STILL);
    stop();
    expect(events.some((e) => e.type === "keyboard")).toBe(true);
    expect(workGoesOn(save.current, STILL)).toBe(false);
    const clock = clockFrame(boost, { ...WORKING, working: workGoesOn(save.current, STILL) });
    expect(clock).toEqual({ minutes: gameMinutes(0.05), boostSeconds: 0 });
  });

  it("відповіли мамі — робота зупинилася", () => {
    const save = game();
    standAt(save, "computer");
    interact(save);
    save.current.today.callPending = true;
    expect(answerCall(save.current)).toBe(true);
    expect(workGoesOn(save.current)).toBe(false);
  });
});

describe("великі кроки часу не ламають симуляцію (§8)", () => {
  /**
   * Прожити кадрами так, як сцена (DayScene.update): хвилини — з годинника кадру, а перед межею падіння без сил — зупинитися.
   * `boost` — секунди розгону на початку. Повертає, чи дійшли до межі.
   */
  const frames = (save: Save, until: number, frame: Omit<ClockFrame, "working" | "running">, boost = 0): boolean => {
    while (save.current.minute < until) {
      const clock = clockFrame(boost, { ...frame, running: true, working: workGoesOn(save.current, STILL) });
      boost = clock.boostSeconds;
      const untilCollapse = collapseMinute(save.current) - save.current.minute - 0.01;
      if (clock.minutes >= untilCollapse) {
        expect(advance(save, Math.max(0, untilCollapse), STILL)).toBeNull();
        return true;
      }
      expect(advance(save, clock.minutes, STILL)).toBeNull();
    }
    return false;
  };

  const workday = (frame: Omit<ClockFrame, "working" | "running">, boost = 0) => {
    const save = game();
    waitUntil(save, hours(8.5));
    standAt(save, "computer");
    interact(save);
    const { events, stop } = recordEvents();
    const money = save.current.character.money;
    frames(save, hours(12), frame, boost);
    stop();
    const standup = events.find((e) => e.type === "standup");
    return {
      save,
      money: save.current.character.money - money,
      standup: standup?.type === "standup" ? standup.attended : null,
      started: events.filter((e) => e.type === "standup-started").length,
    };
  };

  it("ранок роботи на ×10 і ×60 кадрами по 0,1 с (120 ігрових хвилин за кадр) — як із розгону з ×1 кадрами по 1/60 с: зарплата, летучка, терпіння", () => {
    const slow = workday({ seconds: 1 / 60, speed: 1 });
    const fast = workday({ seconds: 0.1, speed: 60 }, WORK_BOOST.rampSeconds);
    expect(clockFrame(WORK_BOOST.rampSeconds, { seconds: 0.1, speed: 60, running: true, working: true }).minutes).toBeCloseTo(120);
    for (const run of [slow, fast]) {
      expect(isWorking(run.save.current)).toBe(true);
      expect(run.standup).toBe(true);
      expect(run.started).toBe(1);
      expect(run.save.current.job.patience).toBe(100);
    }
    // Кадр не перетинає хвилину за раз: межі (летучка, кінець кадру) — точно; гроші — ті самі за ту саму кількість ігрових годин.
    const hoursWorked = (run: typeof slow): number => (run.save.current.minute - hours(8.5)) / 60;
    expect(fast.money / hoursWorked(fast)).toBeCloseTo(slow.money / hoursWorked(slow), 6);
  });

  it("падіння без сил: великий кадр зупиняється перед межею, і ніч не настає посеред кадру", () => {
    const save = game();
    save.current.character.stats.sanity = 100;
    standAt(save, "computer");
    save.current.minute = collapseMinute(save.current) - 30;
    interact(save);
    expect(frames(save, Infinity, { seconds: 0.1, speed: 60 }, WORK_BOOST.rampSeconds)).toBe(true);
    expect(save.current.minute).toBeLessThan(collapseMinute(save.current));
    expect(collapseMinute(save.current) - save.current.minute).toBeCloseTo(0.01);
  });
});
