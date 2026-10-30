import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { createRng } from "../src/sim/rng";

import { goToSleep, newGame } from "../src/sim/game";
import { addCat, applyMorningSanity } from "../src/sim/night";
import type { Difficulty, NightStep } from "../src/sim/types";
import { hours } from "./helpers";

// Вік і межа віку — щоночі, для котів, яким минає ще тиждень від дня появи (§9.1, рішення автора 2026-10-27).
const WEEKDAY_NIGHT: NightStep[] = ["sleep", "cat-health", "cat-death", "cat-age", "age-limit", "kitten-check", "morning", "new-day"];
const SUNDAY_NIGHT: NightStep[] = [
  "sleep",
  "cat-health",
  "cat-death",
  "cat-age",
  "age-limit",
  "births",
  "pregnancies",
  "utilities",
  "week-modifier",
  "kitten-check",
  "morning",
  "new-day",
];

const game = (difficulty: Difficulty = "normal") => newGame({ address: "she", difficulty, seed: 1 });

/** Лягти спати у вказаний день зі вказаним здоровим глуздом. */
function sleepOn(day: number, sanity: number, difficulty: Difficulty = "normal") {
  const save = game(difficulty);
  save.current.day = day;
  if (day > 0) save.current.modifiers.day = null;
  save.current.character.stats.sanity = sanity;
  save.current.minute = hours(22);
  const report = goToSleep(save);
  if (report === null) throw new Error("ніч не настала");
  return { save, report };
}

describe("порядок ночі (§4)", () => {
  it("у будні — без щотижневих кроків", () => {
    for (let day = 0; day < 6; day++) {
      const { report } = sleepOn(day, 50);
      expect(report.weekly).toBe(false);
      expect(report.steps).toEqual(WEEKDAY_NIGHT);
    }
  });

  it("з неділі на понеділок — щотижневі кроки між смертю й кошеням", () => {
    const { save, report } = sleepOn(6, 50);
    expect(report.weekly).toBe(true);
    expect(report.steps).toEqual(SUNDAY_NIGHT);
    expect(save.current.day).toBe(7);
  });
});

describe("кошеня з притулку (§6.2)", () => {
  it("здоровий глузд увечері нижче 35% — кошеня й бонус уранці", () => {
    const { save, report } = sleepOn(2, 34);
    expect(report.newCats).toHaveLength(1);
    expect(save.current.cats).toHaveLength(1);
    expect(save.current.cats[0]).toMatchObject({ source: "shelter-forced", ageWeeks: 1, arrivedDay: 3 });
    expect(report.sanityEvening).toBe(34);
    expect(report.sanityMorning).toBe(84);
    expect(save.current.character.stats.sanity).toBe(84);
  });

  it("рівно 35% — кошеня немає", () => {
    const { save, report } = sleepOn(2, 35);
    expect(report.newCats).toHaveLength(0);
    expect(save.current.character.stats.sanity).toBe(35);
  });

  it("бонус залежить від складності: +62 / +50 / +40", () => {
    expect(sleepOn(2, 20, "easy").report.sanityMorning).toBe(82);
    expect(sleepOn(2, 20, "normal").report.sanityMorning).toBe(70);
    expect(sleepOn(2, 20, "hard").report.sanityMorning).toBe(60);
  });

  it("після першого дня з захистом 1% кошеня приходить у вівторок (§8.3)", () => {
    const { save, report } = sleepOn(0, 1);
    expect(report.newCats).toHaveLength(1);
    expect(save.current.character.stats.sanity).toBe(51);
  });

  it("кіт старшає раз на 7 днів від дня появи — у будь-який день тижня, не в ніч на понеділок (§9.1, рішення автора 2026-10-27)", () => {
    const save = game();
    save.current.modifiers.day = null;
    // Кіт з'явився в середу (день 2) з віком 1 тиждень.
    save.current.day = 2;
    const cat = createCat(save.current, createRng(1), { source: "shelter-forced", ageWeeks: 1 });
    save.current.cats.push(cat);
    const ages: number[] = [];
    for (let night = 0; night < 8; night++) {
      save.current.character.stats.sanity = 80;
      save.current.minute = hours(22);
      goToSleep(save);
      ages.push(save.current.cats.find((c) => c.id === cat.id)?.ageWeeks ?? -1);
    }
    // Ранки днів 3…10: у понеділок (день 7) ще 1 тиждень, у наступну середу (день 9) — 2, з новою рисою.
    expect(ages).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
    expect(save.current.cats.find((c) => c.id === cat.id)?.traits).toHaveLength(2);
  });

  it("примусове кошеня — 1 тиждень і 1 риса", () => {
    const { save } = sleepOn(6, 25);
    const kitten = save.current.cats[0];
    expect(kitten?.ageWeeks).toBe(1);
    expect(kitten?.traits).toHaveLength(1);
  });
});

describe("ранкові зміни здорового глузду (§4, §6.2)", () => {
  it("спершу втрати, потім нові коти", () => {
    const { current } = game();
    current.modifiers.day = null;
    current.character.stats.sanity = 25;
    applyMorningSanity(current, 1, 1);
    expect(current.character.stats.sanity).toBe(60);
  });

  it("втрата кота не опускає нижче 10% і не піднімає до 10%", () => {
    const { current } = game("hard");
    current.modifiers.day = null;
    current.character.stats.sanity = 30;
    applyMorningSanity(current, 1, 0);
    expect(current.character.stats.sanity).toBe(10);
    current.character.stats.sanity = 8;
    applyMorningSanity(current, 1, 0);
    expect(current.character.stats.sanity).toBe(8);
    expect(current.end).toBeNull();
  });

  it("новий кіт не піднімає вище 100", () => {
    const { current } = game("easy");
    current.character.stats.sanity = 80;
    applyMorningSanity(current, 0, 1);
    expect(current.character.stats.sanity).toBe(100);
  });

  it("рішення автора 2026-10-29, А3: друга й наступні смерті тієї самої ночі — половина втрати (−25, −12,5, −12,5); одна — як і раніше", () => {
    const { current } = game();
    current.modifiers.day = null;
    current.character.stats.sanity = 90;
    applyMorningSanity(current, 1, 0);
    expect(current.character.stats.sanity).toBe(65);
    current.character.stats.sanity = 90;
    applyMorningSanity(current, 3, 0);
    expect(current.character.stats.sanity).toBe(40);
    // Межа 10% — як і раніше.
    current.character.stats.sanity = 40;
    applyMorningSanity(current, 3, 0);
    expect(current.character.stats.sanity).toBe(10);
  });

  it("рішення автора 2026-10-29, А3: ніч, у якій від старості померло троє котів, — −25, −12,5, −12,5", () => {
    const save = game();
    const state = save.current;
    state.day = 2;
    state.modifiers.day = null;
    state.minute = hours(22);
    const cats = [0, 1, 2].map((i) => {
      // Цієї ночі кожному минає ще тиждень (§9.1), а в 15 тижнів шанс смерті понад межу віку — 100% (§9.2).
      const cat = createCat(state, createRng(10 + i), { source: "born", ageWeeks: 14 });
      cat.arrivedDay = state.day + 1 - 7;
      addCat(state, cat);
      return cat;
    });
    state.character.stats.sanity = 90;
    const report = goToSleep(save);
    expect(report?.lostCats).toEqual(cats.map((c) => c.id));
    expect(report?.sanityMorning).toBe(40);
  });
});
