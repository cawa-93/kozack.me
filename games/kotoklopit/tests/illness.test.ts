// Хвороби персонажа (§6.5): виснаження від недосипу, травма, ліки з магазину, лікар і лікарняний.

import { describe, expect, it } from "vitest";

import { canDash } from "../src/sim/body";
import { DOCTOR_TREAT } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { doctorTreat, fallIllPerson, illnessSpeed, isIll, nightlyIllness, takeHumanMeds } from "../src/sim/illness";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { Save } from "../src/sim/types";
import { isWorkday } from "../src/sim/work";
import { driveSafely, standAt } from "./helpers";

const game = (): Save => newGame({ address: "he", difficulty: "normal", seed: 3 });
const always = () => ({ ...createRng(1), chance: () => true });

describe("хвороби персонажа (§6.5)", () => {
  it("три ночі поспіль недосипу — виснаження; дві ночі доброго сну — минає", () => {
    const save = game();
    for (let i = 0; i < 3; i++) nightlyIllness(save.current, 5);
    expect(isIll(save.current, "exhaustion")).toBe(true);
    const health = save.current.character.stats.health;
    nightlyIllness(save.current, 9);
    expect(save.current.character.stats.health).toBeLessThan(health);
    nightlyIllness(save.current, 9);
    expect(isIll(save.current, "exhaustion")).toBe(false);
  });

  it("коротка ніч — сну менше 6 годин: три ночі по 6 чи 6,5 годин — не виснаження, по 5,9 — виснаження (рішення автора 2026-10-29, дрібні питання)", () => {
    for (const [hours, ill] of [[6.5, false], [6, false], [5.9, true]] as const) {
      const save = game();
      for (let night = 0; night < 3; night++) nightlyIllness(save.current, hours);
      expect(isIll(save.current, "exhaustion"), `${hours} год`).toBe(ill);
    }
  });

  it("уві сні хвороба не опускає здоров'я нижче 5 і не закінчує гру (§8.8)", () => {
    const save = game();
    fallIllPerson(save.current, "cold");
    save.current.day += 10;
    save.current.character.stats.health = 6;
    nightlyIllness(save.current, 8);
    expect(save.current.character.stats.health).toBe(5);
    nightlyIllness(save.current, 8);
    expect(save.current.character.stats.health).toBe(5);
    expect(save.current.end).toBeNull();
  });

  it("застуда сповільнює й забирає ривок", () => {
    const save = game();
    fallIllPerson(save.current, "cold");
    expect(illnessSpeed(save.current)).toBeLessThan(1);
    expect(canDash(save.current)).toBe(false);
  });

  it("ліки з магазину: одна доза на день, друга того ж дня не витрачається; травма минає за 4 дні", () => {
    const save = game();
    save.current.home.supplies.humanMeds = { cheap: 0, premium: 10 };
    fallIllPerson(save.current, "injury");
    for (let day = 0; day < 4; day++) {
      save.current.day = day;
      takeHumanMeds(save.current, always());
      takeHumanMeds(save.current, always());
    }
    expect(isIll(save.current, "injury")).toBe(false);
    expect(save.current.home.supplies.humanMeds.premium).toBe(6);
  });

  it("ліки п'ють біля умивальника — лише коли є що лікувати", async () => {
    const { interact } = await import("../src/sim/game");
    const save = game();
    save.current.home.supplies.humanMeds = { cheap: 0, premium: 1 };
    standAt(save, "sink");
    interact(save);
    expect(save.current.home.supplies.humanMeds.premium).toBe(1);
    fallIllPerson(save.current, "injury");
    interact(save);
    expect(save.current.home.supplies.humanMeds.premium).toBe(0);
  });

  it("лікар лікує й дає лікарняний: завтра керівництво нічого не чекає", () => {
    const save = game();
    save.current.day = 1;
    save.current.minute = 19 * 60;
    save.current.character.money = 500;
    fallIllPerson(save.current, "cold");
    standAt(save, "door");
    expect(startTrip(save.current, "doctor")).toBe(true);
    driveSafely(save);
    expect(doctorTreat(save.current, "cold", "premium", always())).toBe("cured");
    expect(isIll(save.current, "cold")).toBe(false);
    // Сьогодні ще робочий день: лікарняний — від завтра (перевірка поїздок 2026-10-28).
    expect(isWorkday(save.current)).toBe(true);
    save.current.day = 2;
    expect(isWorkday(save.current)).toBe(false);
  });

  it("хвороба шкодить з першої ночі: застуда −4, травма −3, виснаження −5", () => {
    for (const [id, damage] of [["cold", 4], ["injury", 3], ["exhaustion", 5]] as const) {
      const save = game();
      save.current.character.stats.health = 50;
      fallIllPerson(save.current, id);
      nightlyIllness(save.current, 8);
      expect(save.current.character.stats.health).toBe(50 - damage);
    }
  });

  it("застуда минає сама за 7 днів, травма — за 10; остання ніч ще шкодить", () => {
    for (const [id, days, damage] of [["cold", 7, 4], ["injury", 10, 3]] as const) {
      const save = game();
      const state = save.current;
      state.character.stats.health = 100;
      fallIllPerson(state, id);
      for (let night = 0; night < days; night++) {
        expect(isIll(state, id)).toBe(true);
        nightlyIllness(state, 8);
        state.day += 1;
      }
      expect(isIll(state, id)).toBe(false);
      expect(state.character.stats.health).toBe(100 - days * damage);
    }
  });

  it("виснаження само не минає: лише добрий сон", () => {
    const save = game();
    fallIllPerson(save.current, "exhaustion");
    for (let night = 0; night < 20; night++) {
      nightlyIllness(save.current, 7.5);
      save.current.day += 1;
    }
    expect(isIll(save.current, "exhaustion")).toBe(true);
  });

  it("лікар знімає виснаження разом із накопиченим недосипом: рахунок трьох ночей починається заново", () => {
    const save = game();
    const state = save.current;
    state.day = 1;
    state.minute = 19 * 60;
    state.character.money = 500;
    for (let night = 0; night < 3; night++) nightlyIllness(state, 5.5);
    expect(isIll(state, "exhaustion")).toBe(true);
    standAt(save, "door");
    expect(startTrip(state, "doctor")).toBe(true);
    driveSafely(save);
    expect(doctorTreat(state, "exhaustion", "premium", always())).toBe("cured");
    // Одна коротка ніч після лікаря — ще не виснаження.
    nightlyIllness(state, 5.5);
    expect(isIll(state, "exhaustion")).toBe(false);
    nightlyIllness(state, 5.5);
    expect(isIll(state, "exhaustion")).toBe(false);
    // Третя коротка ніч поспіль — знову хворий.
    nightlyIllness(state, 5.5);
    expect(isIll(state, "exhaustion")).toBe(true);
  });

  it("огляду в лікаря немає: лікує одразу, а платять лише за лікування (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6)", () => {
    const save = game();
    save.current.day = 1;
    save.current.minute = 19 * 60;
    save.current.character.money = 500;
    fallIllPerson(save.current, "injury");
    standAt(save, "door");
    expect(startTrip(save.current, "doctor")).toBe(true);
    driveSafely(save);
    const money = save.current.character.money;
    expect(doctorTreat(save.current, "injury", "cheap", always())).toBe("cured");
    expect(save.current.character.money).toBe(money - DOCTOR_TREAT.cheap);
    // Здоровому лікувати нічого — і грошей не беруть.
    expect(doctorTreat(save.current, "injury", "premium", always())).toBeNull();
    expect(save.current.character.money).toBe(money - DOCTOR_TREAT.cheap);
  });
});
