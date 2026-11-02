// «Планове відключення» — день без світла (§4.1, рішення автора 2026-11-02; скасовує частину А14 від 2026-10-29, коли
// відключали лише інтернет з 11:00 до 15:00): світла немає весь день, від пробудження до пробудження. Робота доступна, але
// повільніша, терпіння не спадає, летучки немає; про відсутній інтернет персонаж думає.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { tickStove } from "../src/sim/actions";
import { BURN_MINUTES, COOK_MINUTES, MODIFIERS, PATIENCE_MAX, POSITIONS, SHOWER_HYGIENE, SHOWER_MINUTES, STANDUP_MINUTE, THOUGHTS } from "../src/sim/config";
import { createCat } from "../src/sim/cat";
import { supplyCount } from "../src/sim/economy";
import type { GameEvent } from "../src/sim/events";
import { advance, interact, newGame } from "../src/sim/game";
import { tapWasher, tickHousehold } from "../src/sim/household";
import { powerOut } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Save, StatName } from "../src/sim/types";
import { isWorking, patienceLevel, standupToday, startWork, tickWork } from "../src/sim/work";
import { inMeeting } from "../src/view/anim/personanim";
import { scheduleOf } from "../src/view/schedule";
import { showerIcon } from "../src/view/symbols";
import { personThought } from "../src/view/thoughts";
import { recordEvents, standAt } from "./helpers";

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

  it("душ без світла холодний: 5 хвилин замість 10, гігієна ×0,8 (§8.7)", () => {
    expect(MODIFIERS.outage.showerMinutes).toBe(0.5);
    expect(MODIFIERS.outage.showerHygiene).toBe(0.8);
    const shower = (day: string | null, hygiene = 20): { minutes: number; event: GameEvent | undefined; used: number } => {
      const save = game(day);
      save.current.minute = 11 * 60;
      save.current.character.stats.hygiene = hygiene;
      save.current.home.supplies.hygiene = { cheap: 2, premium: 0 };
      standAt(save, "shower");
      const { events, stop } = recordEvents();
      interact(save);
      expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true });
      let minutes = 0;
      while (save.current.character.activity !== null && minutes < 30) {
        advance(save, 0.5);
        minutes += 0.5;
      }
      stop();
      return { minutes, event: events.find((e) => e.type === "showered"), used: 2 - supplyCount(save.current, "hygiene") };
    };
    const normal = shower(null);
    expect(normal.minutes).toBe(SHOWER_MINUTES);
    expect(normal.event).toEqual({ type: "showered", hygiene: SHOWER_HYGIENE.cheap, quality: "cheap", left: 1 });
    const cold = shower("outage");
    expect(cold.minutes).toBe(SHOWER_MINUTES * 0.5);
    expect(cold.minutes).toBe(5);
    expect(cold.event).toEqual({ type: "showered", hygiene: SHOWER_HYGIENE.cheap * 0.8, quality: "cheap", left: 1, cold: true });
    // Засіб не витрачається, коли й без нього гігієна дійде до межі — з тим самим множником: 93 + 8 — уже 100, а 93 + 8 × 0,8 — ще ні.
    expect(shower(null, 93).used).toBe(0);
    expect(shower("outage", 93).used).toBe(1);
    expect(shower("outage", 95).used).toBe(0);
  });

  it("над кабіною без світла — «холодна вода» замість «тече вода», вголос (стан речі); купання кота — як завжди", () => {
    const inside = { kind: "use", target: "shower", progress: 0, inside: true } as const;
    expect(showerIcon(inside, true)).toBe("drop");
    expect(showerIcon(inside, false)).toBe("cold-water");
    expect(showerIcon({ ...inside, bath: true }, false)).toBe("drop");
    expect(showerIcon(null, false)).toBeNull();
    expect(showerIcon({ kind: "use", target: "shower", progress: 0 }, false)).toBeNull();
    // Персонажа в кабіні не видно, і думки там немає — навіть без світла за роботою не думають (у кабіні не працюють).
    const save = game("outage");
    save.current.character.activity = { ...inside };
    expect(personThought(save.current)).toBeNull();
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

describe("«Планове відключення» — день без світла: техніка (§4.1, §8.7, рішення автора 2026-11-02)", () => {
  /** Відмова біля речі: що каже персонаж. */
  const refusalAt = (save: Save, id: string): GameEvent | undefined => {
    standAt(save, id);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    return events.find((e) => e.type === "refused");
  };

  it("пральна машина не працює — своя відмова «немає світла»: засіб лишається, машина не запускається", () => {
    const save = game("outage");
    save.current.home.clothes = 0;
    save.current.home.supplies.detergent = { cheap: 2, premium: 0 };
    expect(refusalAt(save, "washer")).toMatchObject({ object: "washer", reason: "no-power" });
    expect(save.current.home.washer.state).toBe("idle");
    expect(supplyCount(save.current, "detergent")).toBe(2);
    expect(tapWasher(save.current)).toBe("no-power");
    // Звичайного дня — пере.
    const normal = game(null);
    normal.current.home.clothes = 0;
    normal.current.home.supplies.detergent = { cheap: 2, premium: 0 };
    expect(tapWasher(normal.current)).toBe("started");
  });

  it("без струму можна розвісити випране й вигнати кота з барабана; «немає світла» — лише замість запуску прання", () => {
    const save = game("outage");
    save.current.home.clothes = 0;
    save.current.home.washer = { state: "done", minutes: 0, quality: "cheap" };
    expect(tapWasher(save.current)).toBe("hung");
    expect(save.current.home.clothes).toBeGreaterThan(0);
    save.current.home.clothes = 0;
    save.current.home.supplies.detergent = { cheap: 1, premium: 0 };
    const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 3, at: { x: 10.5, y: 1.5 } });
    cat.arrivedDay = -10;
    addCat(save.current, cat);
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    expect(tapWasher(save.current)).toBe("cat");
    expect(tapWasher(save.current)).toBe("no-power");
    // Чистого одягу досить — без світла відмова та сама: машина однаково не працює.
    save.current.home.clothes = 30;
    expect(tapWasher(save.current)).toBe("no-power");
  });

  it("прання, запущене до відключення, стоїть на паузі й допирається, щойно світло є (рішення виконавця 2026-11-02); біля неї — «немає світла», а не «ще пере»", () => {
    const save = game("outage");
    save.current.home.washer = { state: "washing", minutes: 30, quality: "cheap" };
    const { events, stop } = recordEvents();
    for (let m = 11 * 60; m < 13 * 60; m++) tickHousehold(save.current, m, 1);
    stop();
    expect(save.current.home.washer).toEqual({ state: "washing", minutes: 30, quality: "cheap" });
    // Без струму й віджиму немає — машина не гуркоче й не лякає котів.
    expect(events.some((e) => e.type === "laundry")).toBe(false);
    expect(refusalAt(save, "washer")).toMatchObject({ reason: "no-power" });
    save.current.modifiers.day = null;
    expect(refusalAt(save, "washer")).toMatchObject({ reason: "washing" });
    for (let m = 13 * 60; m < 13 * 60 + 31; m++) tickHousehold(save.current, m, 1);
    expect(save.current.home.washer.state).toBe("done");
  });
});
