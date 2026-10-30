import { describe, expect, it } from "vitest";

import { POSITIONS } from "../src/sim/config";
import { advance, interact, newGame } from "../src/sim/game";
import { unpleasantTask } from "../src/sim/character";
import type { Address, Chronotype, Difficulty, Save } from "../src/sim/types";
import { callImpression, patienceLevel, startWork, stopWork } from "../src/sim/work";
import { hours, recordEvents, standAt, waitUntil } from "./helpers";

const game = (address: Address = "she", difficulty: Difficulty = "normal"): Save => {
  const save = newGame({ address, difficulty, seed: 1 });
  // Без захисту першого дня, щоб бачити повні втрати здорового глузду.
  save.current.modifiers.day = null;
  return save;
};

/** Попрацювати стільки хвилин, починаючи з хвилини дня. */
const work = (save: Save, from: number, minutes: number): void => {
  waitUntil(save, from);
  startWork(save.current);
  advance(save, minutes);
  stopWork(save.current);
};

describe("робота за комп'ютером (§8.6)", () => {
  it("сісти за комп'ютер і встати: дія, повторна дія чи рух", () => {
    const save = game();
    standAt(save, "computer");
    interact(save);
    expect(save.current.character.activity?.kind).toBe("work");
    interact(save);
    expect(save.current.character.activity).toBeNull();
    interact(save);
    const { events, stop } = recordEvents();
    advance(save, hours(1));
    advance(save, 0.1, { move: { x: 0, y: 1 }, hold: false });
    stop();
    expect(save.current.character.activity).toBeNull();
    const stopped = events.find((e) => e.type === "work-stopped");
    expect(stopped?.type === "work-stopped" && stopped.minutes).toBeCloseTo(60);
  });

  it("стажер заробляє 10 за годину на середній складності, 12,5 на легкій і 8 на важкій", () => {
    for (const [difficulty, pay] of [["easy", 12.5], ["normal", 10], ["hard", 8]] as const) {
      const save = game("she", difficulty);
      const money = save.current.character.money;
      work(save, hours(12), hours(2));
      expect(save.current.character.money - money).toBeCloseTo(2 * pay);
    }
  });

  it("година роботи: +3,09 репутації і −6 здорового глузду", () => {
    const save = game();
    save.current.minute = hours(12);
    work(save, hours(12), hours(1));
    expect(save.current.job.reputation).toBeCloseTo(50 + 3.09);
    expect(save.current.character.stats.sanity).toBeCloseTo(34);
  });

  it("що вища посада, то більше робота забирає здорового глузду: директору −10,5 за годину", () => {
    const save = game();
    save.current.job.position = POSITIONS.length - 1;
    save.current.minute = hours(12);
    work(save, hours(12), hours(1));
    expect(save.current.character.stats.sanity).toBeCloseTo(40 - 10.5);
  });

  it("хронотип не змінює втрат здорового глузду: година роботи будь-коли забирає 6 і жайворонку, і сові (рішення автора 2026-10-29, А4)", () => {
    const loss = (chronotype: Chronotype, from: number): number => {
      const save = newGame({ address: "she", difficulty: "normal", seed: 1, chronotype });
      save.current.modifiers.day = null;
      waitUntil(save, from);
      const before = save.current.character.stats.sanity;
      work(save, from, hours(1));
      return before - save.current.character.stats.sanity;
    };
    for (const chronotype of ["lark", "owl"] as const) {
      for (const from of [hours(8), hours(9), hours(11), hours(16), hours(18), hours(19)]) expect(loss(chronotype, from)).toBeCloseTo(6);
    }
  });

  it("і будь-яке неприємне завдання — однаково в будь-яку годину для обох хронотипів (рішення автора 2026-10-29, А4)", () => {
    for (const chronotype of ["lark", "owl"] as const) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 1, chronotype });
      const state = save.current;
      state.modifiers.day = null;
      for (const hour of [7, 8, 10, 13, 15, 18, 19, 21]) {
        state.minute = hours(hour);
        state.character.stats.sanity = 50;
        expect(unpleasantTask(state, -10)).toBeCloseTo(-10);
      }
    }
  });

  it("у перший тиждень без котів здоровий глузд не падає нижче 1% (§8.3)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
    work(save, hours(9), hours(9));
    expect(save.current.character.stats.sanity).toBe(1);
  });
});

describe("терпіння керівництва (§8.6)", () => {
  it("без роботи «!» з'являється через 2 години, «Х» — через 4, далі репутація падає", () => {
    const save = game();
    waitUntil(save, hours(9));
    const { events, stop } = recordEvents();
    advance(save, hours(2) - 1);
    expect(patienceLevel(save.current)).toBe("ok");
    advance(save, 1);
    expect(patienceLevel(save.current)).toBe("warning");
    advance(save, hours(2) - 1);
    expect(patienceLevel(save.current)).toBe("warning");
    advance(save, 1);
    expect(patienceLevel(save.current)).toBe("out");
    // Пропущена летучка: −3,09.
    const reputation = save.current.job.reputation;
    expect(reputation).toBeCloseTo(50 - 3.09);
    advance(save, hours(1));
    expect(save.current.job.reputation).toBeCloseTo(reputation - 3 * 3.09);
    stop();
    const levels = events.flatMap((e) => (e.type === "patience" ? [e.level] : []));
    expect(levels).toEqual(["warning", "out"]);
  });

  it("30% присутності утримує терпіння від нуля", () => {
    const save = game();
    for (let hour = 9; hour < 18; hour++) {
      work(save, hours(hour), 18);
      advance(save, 42);
      expect(patienceLevel(save.current)).not.toBe("out");
    }
    // Терпіння не вище 100, тож запас після кожної відсутності — близько 82.
    expect(save.current.job.patience).toBeGreaterThan(80);
  });

  it("поза робочим часом і у вихідні терпіння не спадає", () => {
    const save = game();
    save.current.minute = hours(18);
    advance(save, hours(3));
    expect(save.current.job.patience).toBe(100);
    save.current.day = 5;
    save.current.minute = hours(9);
    advance(save, hours(6));
    expect(save.current.job.patience).toBe(100);
  });

  it("щоранку терпіння знову повне", () => {
    const save = game();
    waitUntil(save, hours(15));
    expect(patienceLevel(save.current)).toBe("out");
    save.current.minute = hours(22);
    standAt(save, "bed");
    interact(save);
    expect(save.current.job.patience).toBe(100);
    expect(save.current.job.standupMinutes).toBe(0);
  });
});

describe("щоденна летучка о 10:00 (§8.6)", () => {
  const standup = (setup: (save: Save) => void): { reputation: number; attended: boolean } => {
    const save = game();
    const { events, stop } = recordEvents();
    setup(save);
    waitUntil(save, hours(10.5));
    stop();
    const result = events.find((e) => e.type === "standup");
    if (result?.type !== "standup") throw new Error("летучки не було");
    expect(events.some((e) => e.type === "standup-started")).toBe(true);
    return { reputation: result.reputation, attended: result.attended };
  };

  it("пропуск — −1 × репутація за годину", () => {
    expect(standup(() => {})).toEqual({ attended: false, reputation: -3.09 });
  });

  it("присутність із гігієною 75+ дає дзеркальний бонус, із низькою — штраф", () => {
    const present = (hygiene: number) =>
      standup((save) => {
        save.current.character.stats.hygiene = hygiene;
        waitUntil(save, hours(10) - 1);
        startWork(save.current);
      });
    expect(present(100)).toEqual({ attended: true, reputation: 0.5 * 3.09 });
    expect(present(60)).toEqual({ attended: true, reputation: 0 });
    expect(present(26)).toEqual({ attended: true, reputation: -0.5 * 3.09 });
  });

  it("зараховано, якщо персонаж пробув щонайменше половину летучки", () => {
    const late = (minutes: number) =>
      standup((save) => {
        save.current.character.stats.hygiene = 60;
        waitUntil(save, hours(10) + 15 - minutes);
        startWork(save.current);
      });
    expect(late(8).attended).toBe(true);
    expect(late(7).attended).toBe(false);
  });

  it("у вихідні летучки немає", () => {
    const save = game();
    save.current.day = 5;
    const { events, stop } = recordEvents();
    waitUntil(save, hours(11));
    stop();
    expect(events.some((e) => e.type === "standup" || e.type === "standup-started")).toBe(false);
  });

  it("гігієна на відеодзвінку: нижче 25 — штраф, від 75 — бонус", () => {
    const save = game();
    const stats = save.current.character.stats;
    for (const [hygiene, impression] of [[24, -0.5], [25, 0], [74, 0], [75, 0.5]] as const) {
      stats.hygiene = hygiene;
      expect(callImpression(save.current)).toBe(impression);
    }
  });

  it("брудний одяг на відеодзвінку — штраф, і колеги це помічають", () => {
    const save = game();
    const state = save.current;
    state.character.stats.hygiene = 50;
    const clean = callImpression(state);
    state.home.clothes = 0;
    expect(callImpression(state)).toBe(clean - 0.5);
    const { events, stop } = recordEvents();
    work(save, hours(9.9), 20);
    stop();
    expect(events).toContainEqual({ type: "call-remark", issue: "clothes" });
  });
});

describe("справедливість роботи (ревізія 2026-10-22)", () => {
  it("прийти на летучку неохайним — не гірше, ніж пропустити", () => {
    const run = (attend: boolean): number => {
      const save = game();
      save.current.day = 1;
      save.current.minute = hours(9.8);
      save.current.home.clothes = 0;
      save.current.character.stats.hygiene = 20;
      const before = save.current.job.reputation;
      if (attend) work(save, hours(9.9), hours(0.5));
      else waitUntil(save, hours(10.5));
      // Репутація від самої роботи за пів години — окремо.
      return save.current.job.reputation - before - (attend ? 0.5 * 3.09 : 0);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it("«Х» не штрафує в обідню перерву", () => {
    const save = game();
    save.current.day = 1;
    save.current.modifiers.day = "lunch";
    waitUntil(save, hours(12));
    save.current.job.patience = 0;
    const before = save.current.job.reputation;
    advance(save, hours(1));
    expect(save.current.job.reputation).toBe(before);
  });

  it("на лікарняному працювати можна: година оплачується, як у вихідні, — зарплата й репутація посади; керівництво нічого не чекає (§6.5; рішення автора 2026-10-29, А7)", () => {
    const hour = (setup: (save: Save) => void): { money: number; reputation: number } => {
      const save = game();
      save.current.job.position = 3;
      save.current.modifiers.week = null;
      setup(save);
      const money = save.current.character.money;
      const reputation = save.current.job.reputation;
      work(save, hours(12), hours(1));
      return { money: save.current.character.money - money, reputation: save.current.job.reputation - reputation };
    };
    const sickLeave = (save: Save): void => {
      save.current.day = 1;
      save.current.job.sickLeaveFrom = 1;
      save.current.job.sickLeaveUntil = 1;
    };
    const saturday = hour((save) => (save.current.day = 5));
    const sick = hour(sickLeave);
    // Старший спеціаліст: 16 ₴ і +1,37 репутації за годину — як у суботу (драбина з 15 посад, рішення автора 2026-10-29, А10).
    expect(sick.money).toBeCloseTo(16);
    expect(sick.money).toBeCloseTo(saturday.money);
    expect(sick.reputation).toBeCloseTo(1.37);
    expect(sick.reputation).toBeCloseTo(saturday.reputation);
    // Без роботи цілий будень лікарняного — ні летучки, ні «!» і «Х», репутація не падає.
    const save = game();
    sickLeave(save);
    const before = save.current.job.reputation;
    const { events, stop } = recordEvents();
    waitUntil(save, hours(18));
    stop();
    expect(events.some((e) => e.type === "standup" || e.type === "patience")).toBe(false);
    expect(save.current.job.patience).toBe(100);
    expect(save.current.job.reputation).toBe(before);
  });

  it("нарада на лікарняному не штрафує", () => {
    const save = game();
    save.current.day = 1;
    save.current.modifiers.day = "meeting";
    save.current.job.sickLeaveUntil = 1;
    const before = save.current.job.reputation;
    waitUntil(save, hours(16));
    expect(save.current.job.reputation).toBe(before);
  });
});
