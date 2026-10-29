// Кар'єра (§8.6): підвищення на 100 репутації, пониження на 0, звільнення стажера й пошук роботи.

import { describe, expect, it } from "vitest";

import { FIRST_WEEK_PROTECTION, JOB_SEARCH, POSITIONS, REPUTATION_MAX, START_REPUTATION, WORKDAYS_PER_WEEK } from "../src/sim/config";
import { advance, interact, newGame } from "../src/sim/game";
import { weekdayOf } from "../src/sim/time";
import type { Save } from "../src/sim/types";
import { changeReputation, searchProgress } from "../src/sim/work";
import { POSITION_TITLES } from "../src/texts";
import { playerLine } from "../src/ui/cards";
import { hours, liveDay, recordEvents, standAt } from "./helpers";

const game = (): Save => newGame({ address: "she", difficulty: "normal", seed: 2 });

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

describe("драбина з 15 посад (§8.6; рішення автора 2026-10-29, GENERAL_REVIEW.md, А10)", () => {
  type Position = (typeof POSITIONS)[number];
  /** Частка присутності: спад / (відновлення + спад) (§8.6). */
  const share = (p: Position): number => p.patienceDecay / (p.patienceDecay + p.patienceRecovery);
  /** Робочих днів до підвищення, якщо щодня працювати частку присутності × 9 годин, ще й помножену на `effort` (§8.6). */
  const daysToPromotion = (p: Position, effort = 1): number => (REPUTATION_MAX - START_REPUTATION) / (p.reputation * share(p) * 9 * effort);
  const daysToDirector = (effort: number): number => POSITIONS.slice(0, -1).reduce((sum, p) => sum + daysToPromotion(p, effort), 0);
  const first = POSITIONS[0];
  const director = POSITIONS[POSITIONS.length - 1];

  it("15 посад і стільки ж назв; стажер той самий: 10 ₴ і +3,09 репутації за годину, 30% присутності, −6 здорового глузду, підвищення за 6 днів", () => {
    expect(POSITIONS).toHaveLength(15);
    expect(POSITION_TITLES).toHaveLength(POSITIONS.length);
    expect(first).toEqual({ pay: 10, patienceDecay: 25, patienceRecovery: 58, reputation: 3.09, sanity: -6 });
    expect(Math.round(daysToPromotion(first!))).toBe(6);
    expect(director).toMatchObject({ pay: 45, patienceDecay: 52, patienceRecovery: 17, sanity: -10.5 });
  });

  it("що вища посада, то більше грошей, присутності й утрати здорового глузду й то менше репутації за годину — і кожне підвищення довше за попереднє", () => {
    for (let i = 1; i < POSITIONS.length; i++) {
      const [lower, higher] = [POSITIONS[i - 1]!, POSITIONS[i]!];
      expect(higher.pay, `посада ${i + 1}`).toBeGreaterThan(lower.pay);
      expect(share(higher), `посада ${i + 1}`).toBeGreaterThan(share(lower));
      expect(higher.sanity, `посада ${i + 1}`).toBeLessThan(lower.sanity);
      expect(higher.reputation, `посада ${i + 1}`).toBeLessThan(lower.reputation);
      if (i < POSITIONS.length - 1) expect(daysToPromotion(higher), `посада ${i + 1}`).toBeGreaterThan(daysToPromotion(lower));
    }
    // Плавно між стажером і директором: частка присутності — щоразу на ~3% (2,5–4%, бо швидкості терпіння цілі), здоровий
    // глузд — на ~0,3 (0,2–0,4).
    for (let i = 1; i < POSITIONS.length; i++) {
      expect(share(POSITIONS[i]!) - share(POSITIONS[i - 1]!)).toBeGreaterThan(0.025);
      expect(share(POSITIONS[i]!) - share(POSITIONS[i - 1]!)).toBeLessThan(0.04);
      expect(POSITIONS[i - 1]!.sanity - POSITIONS[i]!.sanity).toBeGreaterThanOrEqual(0.2);
      expect(POSITIONS[i - 1]!.sanity - POSITIONS[i]!.sanity).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it("кожна посада — менша сходинка: після першого підвищення зарплата росте щонайбільше на 20%, а в першій половині драбини — повільніше, ніж у другій", () => {
    for (let i = 2; i < POSITIONS.length; i++) expect(POSITIONS[i]!.pay / POSITIONS[i - 1]!.pay, `посада ${i + 1}`).toBeLessThanOrEqual(1.2);
    const middle = POSITIONS[7]!;
    expect(middle.pay - first!.pay).toBeLessThan(director!.pay - middle.pay);
  });

  it("сумлінний гравець (на 30% більше за вимогу посади) стає директором ближче до кінця гри, а хто працює рівно за вимогою, за 50 тижнів директором не стає", () => {
    const weeks = (effort: number): number => daysToDirector(effort) / WORKDAYS_PER_WEEK;
    expect(weeks(1.3)).toBeGreaterThan(40);
    expect(weeks(1.3)).toBeLessThan(47);
    expect(weeks(1)).toBeGreaterThan(50);
  });

  it("гроші обмежують довше: за мінімальної старанності директор заробляє за тиждень у ~11 разів більше за стажера (було майже в 19)", () => {
    const weekly = (p: Position): number => p.pay * share(p) * 9 * WORKDAYS_PER_WEEK;
    expect(weekly(director!) / weekly(first!)).toBeLessThan(12);
    expect(weekly(director!) / weekly(first!)).toBeGreaterThan(10);
  });
});

describe("пониження на вершині повільне — дзеркало підвищення (§8.6, [Наслідок]; рішення автора 2026-10-29, А7)", () => {
  it("робочий день повного нехтування коштує стажеру −49 репутації, а директору −3,6: його понижують лише на 15-й такий день (драбина з 15 посад, А10)", () => {
    /** Скільки репутації забирає будень без жодної години за комп'ютером: «Х» до 18:00 і пропущена летучка. */
    const neglectedDay = (position: number): number => {
      const save = game();
      const state = save.current;
      state.day = FIRST_WEEK_PROTECTION.days;
      state.minute = hours(8);
      state.modifiers.day = null;
      state.modifiers.week = null;
      state.job.position = position;
      expect(weekdayOf(state.day)).toBeLessThan(5);
      advance(save, hours(10.5));
      expect(state.job.position).toBe(position);
      return START_REPUTATION - state.job.reputation;
    };
    const daysToDemotion = (position: number): number => Math.ceil(START_REPUTATION / neglectedDay(position));
    const director = POSITIONS.length - 1;
    expect(neglectedDay(0)).toBeCloseTo(49.4, 1);
    expect(daysToDemotion(0)).toBe(2);
    // Експерт — 7-ма посада (індекс 6).
    expect(daysToDemotion(6)).toBe(4);
    expect(neglectedDay(director)).toBeCloseTo(3.6, 1);
    expect(daysToDemotion(director)).toBe(15);
    // Падіння з вершини до стажера за повного нехтування — ~90 робочих днів, як і з драбиною з 10 посад (87): посад більше,
    // але кожне пониження — на меншу сходинку (А10).
    let fall = 0;
    for (let position = director; position > 0; position--) fall += daysToDemotion(position);
    expect(fall).toBeGreaterThanOrEqual(85);
    expect(fall).toBeLessThanOrEqual(95);
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
    const { current: state } = newGame({ address: "she", difficulty: "hard", seed: 1 });
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

describe("посада у вкладці «Гра» телефона (§8.6; рішення автора 2026-10-29, А7)", () => {
  it("рядок «ім'я · посада · складність» іде за посадою й звертанням; безробітному — «шукає роботу»; репутації в ньому немає", () => {
    const save = newGame({ address: "she", difficulty: "hard", seed: 2 });
    const state = save.current;
    const { name } = state.character;
    expect(playerLine(state)).toBe(`${name} · Стажерка · Реалістичний`);
    // Підвищення — рядок одразу з новою посадою, хоч би картка про нього й загубилася.
    changeReputation(state, 60);
    expect(playerLine(state)).toBe(`${name} · Молодша спеціалістка · Реалістичний`);
    state.job.position = POSITIONS.length - 1;
    state.character.address = "he";
    expect(playerLine(state)).toBe(`${name} · Директор · Реалістичний`);
    state.job.unemployed = true;
    expect(playerLine(state)).toBe(`${name} · шукає роботу · Реалістичний`);
    // Репутація невидима: рядок той самий за будь-якої.
    state.job.unemployed = false;
    state.job.position = 3;
    state.job.reputation = 5;
    const low = playerLine(state);
    state.job.reputation = 95;
    expect(playerLine(state)).toBe(low);
    expect(low).not.toMatch(/\d/);
  });
});
