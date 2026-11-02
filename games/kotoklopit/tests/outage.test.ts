// «Планове відключення» — день без світла (§4.1, рішення автора 2026-11-02; скасовує частину А14 від 2026-10-29, коли
// відключали лише інтернет з 11:00 до 15:00): світла немає весь день, від пробудження до пробудження. Робота доступна, але
// повільніша, терпіння не спадає, летучки немає; про відсутній інтернет персонаж думає.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { tickStove } from "../src/sim/actions";
import { BURN_MINUTES, COOK_MINUTES, MODIFIERS, PATIENCE_MAX, POSITIONS, STANDUP_MINUTE, THOUGHTS } from "../src/sim/config";
import { advance, interact, newGame } from "../src/sim/game";
import { powerOut } from "../src/sim/modifiers";
import type { Save, StatName } from "../src/sim/types";
import { isWorking, patienceLevel, standupToday, startWork, tickWork } from "../src/sim/work";
import { inMeeting } from "../src/view/anim/personanim";
import { scheduleOf } from "../src/view/schedule";
import { personThought } from "../src/view/thoughts";
import { recordEvents } from "./helpers";

const STATS: StatName[] = ["health", "satiety", "hygiene", "sanity"];

/** Вівторок другого тижня (робочий день), без модифікатора тижня; `day` — модифікатор дня. */
function game(day: string | null): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 14 });
  save.current.day = 8;
  save.current.modifiers.day = day;
  save.current.modifiers.week = null;
  return save;
}

/** Прожити хвилини від `from` п'ятихвилинними кроками робочого часу (без решти дня — лише робота й летучка). */
function workMinutes(save: Save, from: number, minutes: number): void {
  for (let m = from; m < from + minutes; m += 5) {
    save.current.minute = m;
    tickWork(save.current, m, 5);
  }
  save.current.minute = from + minutes;
}

describe("«Планове відключення» — день без світла: робота (§4.1, §8.6, рішення автора 2026-11-02)", () => {
  it("світла немає весь день — від ранку до ночі, як і будь-який модифікатор дня", () => {
    const save = game("outage");
    for (const minute of [7 * 60, 11 * 60, 15 * 60 + 30, 23 * 60, 25 * 60]) {
      save.current.minute = minute;
      expect(powerOut(save.current), String(minute)).toBe(true);
    }
    expect(powerOut(game(null).current)).toBe(false);
    expect(powerOut(game("fast-internet").current)).toBe(false);
  });

  it("за комп'ютер сідають, як завжди: відмови немає, а година роботи дає ×0,75 грошей і репутації", () => {
    expect(MODIFIERS.pay["outage"]).toBe(0.75);
    expect(MODIFIERS.outage.reputation).toBe(0.75);
    const hour = (day: string | null): { money: number; reputation: number } => {
      const save = game(day);
      save.current.minute = 11 * 60;
      const money = save.current.character.money;
      const reputation = save.current.job.reputation;
      startWork(save.current);
      workMinutes(save, 11 * 60, 60);
      return { money: save.current.character.money - money, reputation: save.current.job.reputation - reputation };
    };
    const normal = hour(null);
    const outage = hour("outage");
    expect(normal.money).toBeGreaterThan(0);
    expect(normal.reputation).toBeGreaterThan(0);
    expect(outage.money).toBeCloseTo(normal.money * 0.75, 6);
    expect(outage.reputation).toBeCloseTo(normal.reputation * 0.75, 6);
  });

  it("терпіння керівництва не спадає весь робочий день: ні «!», ні «Х», репутація не падає; поїздка в робочий час не штрафується", () => {
    const save = game("outage");
    const reputation = save.current.job.reputation;
    workMinutes(save, 9 * 60, 9 * 60);
    expect(save.current.job.patience).toBe(PATIENCE_MAX);
    expect(patienceLevel(save.current)).toBe("ok");
    expect(save.current.job.reputation).toBe(reputation);

    // Поїздка посеред робочого дня — без штрафу й не до лічильника поїздок (§8.6): керівництво нічого не чекає.
    const trip = game("outage");
    trip.current.trip = { destination: "shop", phase: "visit", cat: null } as unknown as NonNullable<Save["current"]["trip"]>;
    const before = trip.current.job.reputation;
    workMinutes(trip, 11 * 60, 2 * 60);
    expect(trip.current.job.reputation).toBe(before);
    expect(trip.current.job.tripDays).toEqual([]);

    // Звичайного дня за ці години терпіння дійшло б до «Х».
    const normal = game(null);
    workMinutes(normal, 9 * 60, 9 * 60);
    expect(patienceLevel(normal.current)).toBe("out");
  });

  it("пошук роботи без світла йде ×0,75", () => {
    expect(MODIFIERS.outage.search).toBe(0.75);
    const searched = (day: string | null): number => {
      const save = game(day);
      save.current.job.unemployed = true;
      save.current.job.searchHours = 0;
      startWork(save.current);
      workMinutes(save, 11 * 60, 2 * 60);
      return save.current.job.searchHours;
    };
    expect(searched(null)).toBeCloseTo(2, 6);
    expect(searched("outage")).toBeCloseTo(2 * 0.75, 6);
  });

  it("летучку о 10:00 скасовано: ні події, ні штрафу за пропуск, ні бонусу; у розкладі її немає, персонаж за комп'ютером не на дзвінку", () => {
    const run = (day: string | null, work: boolean): { events: string[]; reputation: number } => {
      const save = game(day);
      save.current.minute = STANDUP_MINUTE - 5;
      if (work) startWork(save.current);
      const before = save.current.job.reputation;
      const { events, stop } = recordEvents();
      workMinutes(save, STANDUP_MINUTE - 5, 30);
      stop();
      return { events: events.map((e) => e.type).filter((t) => t.startsWith("standup")), reputation: save.current.job.reputation - before };
    };
    // Звичайного дня — летучка є: пропуск штрафує.
    expect(run(null, false).events).toEqual(["standup-started", "standup"]);
    expect(run(null, false).reputation).toBeLessThan(0);
    // Без світла — нічого: пропуск не штрафує, присутність дає лише саму роботу.
    expect(run("outage", false)).toEqual({ events: [], reputation: 0 });
    const worked = run("outage", true);
    expect(worked.events).toEqual([]);
    expect(worked.reputation).toBeCloseTo(0.5 * (POSITIONS[0]?.reputation ?? 0) * MODIFIERS.outage.reputation, 6);

    const save = game("outage");
    expect(standupToday(save.current)).toBe(false);
    expect(standupToday(game(null).current)).toBe(true);
    save.current.minute = 8 * 60;
    expect(scheduleOf(save.current).some((line) => line.includes("летучка"))).toBe(false);
    expect(scheduleOf(save.current).some((line) => line.includes("інтернет"))).toBe(false);
    expect(scheduleOf(game(null).current).some((line) => line.includes("летучка"))).toBe(true);
    save.current.minute = STANDUP_MINUTE + 5;
    startWork(save.current);
    expect(inMeeting(save.current)).toBe(false);
  });

  it("за роботою без світла персонаж думає «немає інтернету» — і коли шукає роботу; низькі показники важливіші", () => {
    const save = game("outage");
    for (const stat of STATS) save.current.character.stats[stat] = 100;
    save.current.minute = 11 * 60;
    expect(personThought(save.current)).toBeNull();
    startWork(save.current);
    expect(personThought(save.current)).toBe("no-internet");
    save.current.job.unemployed = true;
    expect(personThought(save.current)).toBe("no-internet");
    // Спершу показники (рішення виконавця за планом 2026-11-02): брудний персонаж думає про душ.
    save.current.character.stats.hygiene = THOUGHTS.personLow - 10;
    expect(personThought(save.current)).toBe("soap");
    // Звичайного дня — ні про що.
    const normal = game(null);
    for (const stat of STATS) normal.current.character.stats[stat] = 100;
    startWork(normal.current);
    expect(personThought(normal.current)).toBeNull();
  });

  it("плита без світла — газовий пальник: страва готова за 25 хвилин замість 20 і підгорає ×1,25 пізніше (§8.7)", () => {
    expect(MODIFIERS.outage.cook).toBe(1.25);
    const cook = (day: string | null): { ready: number; burnt: number } => {
      const save = game(day);
      save.current.home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: 0 };
      let minute = 0;
      let ready = -1;
      while (save.current.home.stove.item?.kind !== "burnt" && minute < 600) {
        tickStove(save.current, 1);
        minute += 1;
        if (ready < 0 && save.current.home.stove.item?.kind === "meal") ready = minute;
      }
      return { ready, burnt: minute };
    };
    expect(cook(null)).toEqual({ ready: COOK_MINUTES, burnt: BURN_MINUTES.normal });
    expect(COOK_MINUTES * 1.25).toBe(25);
    expect(cook("outage")).toEqual({ ready: COOK_MINUTES * 1.25, burnt: Math.ceil(BURN_MINUTES.normal * 1.25) });
  });

  it("сценарій «Без світла» (`scenarios/power-outage.json`): біля комп'ютера — натискання саджає працювати, і робота йде годину без перерви", () => {
    const scenario = FILE_SCENARIOS["power-outage"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(save.current.modifiers.day).toBe("outage");
    const money = save.current.character.money;
    const { events, stop } = recordEvents();
    interact(save);
    expect(events.some((e) => e.type === "refused")).toBe(false);
    expect(events.some((e) => e.type === "work-started")).toBe(true);
    for (let i = 0; i < 60; i++) advance(save, 1);
    stop();
    expect(isWorking(save.current)).toBe(true);
    expect(save.current.character.money).toBeGreaterThan(money);
  });
});
