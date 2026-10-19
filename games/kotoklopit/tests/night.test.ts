import { describe, expect, it } from "vitest";

import { goToSleep, newGame } from "../src/sim/game";
import { applyMorningSanity } from "../src/sim/night";
import type { Difficulty, NightStep } from "../src/sim/types";
import { hours } from "./helpers";

const WEEKDAY_NIGHT: NightStep[] = ["sleep", "cat-health", "cat-death", "kitten-check", "morning", "new-day"];
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

const game = (difficulty: Difficulty = "normal") => newGame({ sex: "female", difficulty, seed: 1 });

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
  it("здоровий глузд увечері нижче 30% — кошеня й бонус уранці", () => {
    const { save, report } = sleepOn(2, 29);
    expect(report.newCats).toHaveLength(1);
    expect(save.current.cats).toHaveLength(1);
    expect(save.current.cats[0]).toMatchObject({ source: "shelter-forced", ageWeeks: 1, arrivedDay: 3 });
    expect(report.sanityEvening).toBe(29);
    expect(report.sanityMorning).toBe(79);
    expect(save.current.character.stats.sanity).toBe(79);
  });

  it("рівно 30% — кошеня немає", () => {
    const { save, report } = sleepOn(2, 30);
    expect(report.newCats).toHaveLength(0);
    expect(save.current.character.stats.sanity).toBe(30);
  });

  it("бонус залежить від складності: +62 / +50 / +40", () => {
    expect(sleepOn(2, 20, "easy").report.sanityMorning).toBe(82);
    expect(sleepOn(2, 20, "normal").report.sanityMorning).toBe(70);
    expect(sleepOn(2, 20, "hard").report.sanityMorning).toBe(60);
  });

  it("після першого дня з захистом 10% кошеня приходить у вівторок (§8.3)", () => {
    const { save, report } = sleepOn(0, 10);
    expect(report.newCats).toHaveLength(1);
    expect(save.current.character.stats.sanity).toBe(60);
  });

  it("кошеня в ніч на понеділок має вік 1 тиждень, а старші коти дорослішають", () => {
    const save = game();
    save.current.day = 6;
    save.current.cats.push({ id: 99, name: "Мурка", sex: "female", source: "shelter-forced", ageWeeks: 1, arrivedDay: 0 });
    save.current.character.stats.sanity = 25;
    save.current.minute = hours(22);
    goToSleep(save);
    const ages = Object.fromEntries(save.current.cats.map((cat) => [cat.id, cat.ageWeeks]));
    expect(ages).toEqual({ 99: 2, 1: 1 });
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
});
