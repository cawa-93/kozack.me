// Кар'єра (§8.6): підвищення на 100 репутації, пониження на 0, звільнення стажера й пошук роботи.

import { describe, expect, it } from "vitest";

import { FIRST_WEEK_PROTECTION, JOB_SEARCH } from "../src/sim/config";
import { advance, interact, newGame } from "../src/sim/game";
import type { Save } from "../src/sim/types";
import { changeReputation, searchProgress } from "../src/sim/work";
import { hours, liveDay, recordEvents, standAt } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 2 });

describe("посади (§8.6)", () => {
  it("на 100 репутації — підвищення, і репутація знову 50", () => {
    const save = game();
    changeReputation(save.current, 60);
    expect(save.current.job.position).toBe(1);
    expect(save.current.job.reputation).toBe(50);
  });

  it("на 0 — пониження, а стажера звільняють (з восьмого дня: до того — захист першого тижня, А2)", () => {
    const save = game();
    save.current.day = FIRST_WEEK_PROTECTION.days;
    save.current.job.position = 2;
    changeReputation(save.current, -60);
    expect(save.current.job.position).toBe(1);
    expect(save.current.job.reputation).toBe(50);
    save.current.job.position = 0;
    changeReputation(save.current, -60);
    expect(save.current.job.unemployed).toBe(true);
  });

  it("безробітний шукає роботу за комп'ютером, без зарплати й без «!»; на середній — 20 годин, −3 здорового глузду за годину", () => {
    const save = game();
    save.current.job.unemployed = true;
    save.current.day = 1;
    save.current.minute = hours(9);
    standAt(save, "computer");
    const money = save.current.character.money;
    const sanity = save.current.character.stats.sanity;
    interact(save);
    advance(save, hours(1));
    expect(save.current.job.searchHours).toBeCloseTo(1);
    expect(save.current.character.stats.sanity).toBeCloseTo(sanity - 3, 0);
    expect(save.current.job.unemployed).toBe(true);
    save.current.job.searchHours = 19.5;
    advance(save, hours(1));
    expect(save.current.job.unemployed).toBe(false);
    expect(save.current.job.position).toBe(0);
    expect(save.current.character.money).toBeLessThanOrEqual(money + 15);
  });
});

describe("захист першого тижня для репутації (§8.3, §8.6; рішення автора 2026-10-29, А2)", () => {
  it("стажера, що весь перший тиждень не підходить до комп'ютера, до восьмого дня не звільняють, а з нього — як завжди", () => {
    const save = game();
    const { events, stop } = recordEvents();
    for (let day = 0; day < FIRST_WEEK_PROTECTION.days; day++) {
      liveDay(save);
      expect(save.current.job.unemployed).toBe(false);
      expect(save.current.job.reputation).toBeGreaterThanOrEqual(FIRST_WEEK_PROTECTION.reputation);
    }
    stop();
    // Штрафи (пропущені летучки, «Х») були, але репутація вперлася в межу: ні звільнення, ні іншої зміни посади.
    expect(events.some((e) => e.type === "standup" && !e.attended)).toBe(true);
    expect(events.some((e) => e.type === "career")).toBe(false);
    expect(save.current.job.reputation).toBe(FIRST_WEEK_PROTECTION.reputation);
    expect(save.current.day).toBe(FIRST_WEEK_PROTECTION.days);
    // Восьмий день — захисту немає: перший же штраф звільняє.
    liveDay(save);
    expect(save.current.job.unemployed).toBe(true);
  });

  it("перші 7 днів і посаду не понижують, хоч би що було з котами; підвищення — як завжди", () => {
    const save = game();
    save.current.day = FIRST_WEEK_PROTECTION.days - 1;
    save.current.stats.raised.shelter = 1;
    save.current.job.position = 2;
    changeReputation(save.current, -60);
    expect(save.current.job.position).toBe(2);
    expect(save.current.job.reputation).toBe(FIRST_WEEK_PROTECTION.reputation);
    changeReputation(save.current, 99);
    expect(save.current.job.position).toBe(3);
    expect(save.current.job.reputation).toBe(50);
  });
});

describe("пошук роботи як процес найму (§8.6, правка 2026-10-23)", () => {
  it("тривалість за складністю: 16 / 20 / 24 години", () => {
    expect(JOB_SEARCH.hours).toEqual({ easy: 16, normal: 20, hard: 24 });
  });

  it("кожна наступна вакансія доходить на етап далі: відмови після 1, 2, 3 етапів, четверта — найм", () => {
    const { current: state } = newGame({ sex: "female", difficulty: "hard", seed: 1 });
    const at = (h: number) => {
      state.job.searchHours = h;
      return searchProgress(state);
    };
    // Етап — 2,4 години на важкій: 24 / (1 + 2 + 3 + 4).
    expect(at(0).vacancy).toBe(1);
    expect(at(0).progress).toBeCloseTo(0);
    expect(at(1.2).progress).toBeCloseTo(0.125);
    expect(at(2.4).vacancy).toBe(2);
    expect(at(2.4).progress).toBeCloseTo(0);
    expect(at(2.4 * 3 - 0.01).progress).toBeCloseTo(0.5, 2);
    expect(at(2.4 * 3).vacancy).toBe(3);
    expect(at(2.4 * 6).vacancy).toBe(4);
    expect(at(24).vacancy).toBe(4);
    expect(at(24).progress).toBeCloseTo(1);
  });

  it("на кожній відмові — подія, на четвертій вакансії — найм", () => {
    const save = game();
    const state = save.current;
    state.job.unemployed = true;
    state.day = 1;
    state.minute = hours(9);
    standAt(save, "computer");
    const { events, stop } = recordEvents();
    interact(save);
    // Середня складність: 20 годин, етап — 2 години; межі вакансій — 2, 6, 12 годин, найм — 20.
    for (const before of [1.9, 5.9, 11.9, 19.9]) {
      state.job.searchHours = before;
      advance(save, 10);
    }
    stop();
    expect(events.filter((e) => e.type === "job-rejected").map((e) => (e as { vacancy: number }).vacancy)).toEqual([1, 2, 3]);
    expect(events.some((e) => e.type === "career" && e.change === "hired")).toBe(true);
    expect(state.job.unemployed).toBe(false);
  });
});
