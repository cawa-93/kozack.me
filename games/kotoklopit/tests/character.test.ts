import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { changeStat, closeLedger, earn, spend } from "../src/sim/character";
import { FIRST_WEEK_PROTECTION, START_MONEY, START_STATS } from "../src/sim/config";
import { advance, goToSleep, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Address, StatName } from "../src/sim/types";
import { hours } from "./helpers";

const game = (address: Address = "she") => newGame({ address, difficulty: "normal", seed: 1 });

describe("показники персонажа (§6, §6.3)", () => {
  it("стартові значення однакові для обох персонажів", () => {
    for (const address of ["she", "he"] as const) {
      const { character } = game(address).current;
      expect(character.stats).toEqual(START_STATS);
      expect(character.stats.sanity).toBe(40);
      expect(character.money).toBe(START_MONEY);
    }
  });

  it("за годину неспання ситість −4, гігієна −3", () => {
    const save = game("she");
    advance(save, hours(1));
    const { stats } = save.current.character;
    expect(stats.satiety).toBeCloseTo(START_STATS.satiety - 4);
    expect(stats.hygiene).toBeCloseTo(START_STATS.hygiene - 3);
    expect(stats.health).toBe(START_STATS.health);
    expect(save.current.minute).toBe(hours(7));
  });

  it("обидва персонажі голоднішають однаково: чоловічого обміну немає (рішення автора 2026-10-29, А4)", () => {
    for (const address of ["she", "he"] as const) {
      const save = game(address);
      advance(save, hours(1));
      expect(save.current.character.stats.satiety).toBeCloseTo(START_STATS.satiety - 4);
    }
  });

  it("коли ситість нижче 25, здоров'я падає на 2 за годину", () => {
    const save = game();
    const { stats } = save.current.character;
    stats.satiety = 24;
    advance(save, hours(1));
    expect(stats.health).toBeCloseTo(98);
  });

  it("показник не виходить за 100", () => {
    const { current } = game();
    changeStat(current, "health", 50);
    expect(current.character.stats.health).toBe(100);
  });
});

describe("кінець гри (§6.1)", () => {
  for (const stat of ["health", "satiety", "hygiene", "sanity"] as const satisfies readonly StatName[]) {
    it(`показник «${stat}» на нулі закінчує гру`, () => {
      const { current } = game();
      current.day = FIRST_WEEK_PROTECTION.days;
      current.modifiers.day = null;
      changeStat(current, stat, -200);
      expect(current.character.stats[stat]).toBe(0);
      expect(current.end).toBe(stat);
    });
  }

  it("без їжі персонаж падає з голоду о потрібній хвилині, і час зупиняється", () => {
    const save = game("she");
    save.current.character.stats.satiety = 2;
    advance(save, hours(5));
    expect(save.current.end).toBe("satiety");
    expect(Math.abs(save.current.minute - hours(6.5))).toBeLessThanOrEqual(1);
    const minute = save.current.minute;
    advance(save, hours(1));
    expect(save.current.minute).toBe(minute);
    save.current.minute = hours(22);
    expect(() => goToSleep(save)).toThrow();
  });

  it("гру закінчує перший показник, що дійшов до нуля", () => {
    const { current } = game();
    changeStat(current, "hygiene", -200);
    changeStat(current, "satiety", -200);
    expect(current.end).toBe("hygiene");
    expect(current.character.stats.satiety).toBe(START_STATS.satiety);
  });
});

describe("захист першого тижня (§8.3)", () => {
  it("поки котів не було, здоровий глузд не нижче 1% увесь перший тиждень", () => {
    for (const day of [0, FIRST_WEEK_PROTECTION.days - 1]) {
      const { current } = game();
      current.day = day;
      changeStat(current, "sanity", -200);
      expect(current.character.stats.sanity).toBe(1);
      expect(current.end).toBeNull();
    }
  });

  it("межа не піднімає показник, що вже нижчий за неї", () => {
    const { current } = game();
    current.character.stats.sanity = 0.5;
    changeStat(current, "sanity", -3);
    expect(current.character.stats.sanity).toBe(0.5);
  });

  it("з восьмого дня захисту немає", () => {
    const { current } = game();
    current.day = FIRST_WEEK_PROTECTION.days;
    changeStat(current, "sanity", -200);
    expect(current.end).toBe("sanity");
  });

  it("перший кіт знімає захист назавжди, навіть коли його вже немає", () => {
    const { current } = game();
    current.day = 2;
    addCat(current, createCat(current, createRng(4), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } }));
    current.cats = [];
    changeStat(current, "sanity", -200);
    expect(current.end).toBe("sanity");
  });

  it("захисту ніде не видно: він не змінює модифікатор дня", () => {
    const save = game();
    save.current.minute = hours(22);
    goToSleep(save);
    expect(save.current.modifiers.day).not.toBe("first-day");
    changeStat(save.current, "sanity", -200);
    expect(save.current.character.stats.sanity).toBe(1);
  });
});

describe("гроші (§6.4)", () => {
  it("піти в мінус не можна", () => {
    const { current } = game();
    expect(spend(current, START_MONEY + 1, "other")).toBe(false);
    expect(current.character.money).toBe(START_MONEY);
    expect(spend(current, 40, "supplies")).toBe(true);
    expect(current.character.money).toBe(START_MONEY - 40);
    earn(current, 10);
    expect(current.character.money).toBe(START_MONEY - 30);
  });

  it("гроші тижня: заробіток і витрати за категоріями, у ніч на понеділок — у звіт і з нуля (рішення автора 2026-10-27, Е4)", () => {
    const { current } = game();
    earn(current, 25);
    spend(current, 40, "supplies");
    spend(current, 12, "delivery");
    spend(current, 8, "supplies");
    expect(current.ledger).toEqual({ earned: 25, spent: { supplies: 48, delivery: 12 } });
    expect(closeLedger(current)).toEqual({ earned: 25, spent: { supplies: 48, delivery: 12 } });
    expect(current.ledger).toEqual({ earned: 0, spent: {} });
  });

  it("нуль грошей не закінчує гру", () => {
    const { current } = game();
    expect(spend(current, START_MONEY, "other")).toBe(true);
    expect(current.character.money).toBe(0);
    expect(current.end).toBeNull();
  });
});
