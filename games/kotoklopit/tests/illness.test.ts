// Хвороби персонажа (§6.5): виснаження від недосипу, травма, ліки з магазину, лікар і лікарняний.

import { describe, expect, it } from "vitest";

import { canDash } from "../src/sim/body";
import { newGame } from "../src/sim/game";
import { doctorExam, doctorTreat, fallIllPerson, illnessSpeed, isIll, nightlyIllness, takeHumanMeds } from "../src/sim/illness";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { Save } from "../src/sim/types";
import { isWorkday } from "../src/sim/work";
import { driveSafely, standAt } from "./helpers";

const game = (): Save => newGame({ sex: "male", difficulty: "normal", seed: 3 });
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

  it("застуда сповільнює й забирає ривок", () => {
    const save = game();
    fallIllPerson(save.current, "cold");
    expect(illnessSpeed(save.current)).toBeLessThan(1);
    expect(canDash(save.current)).toBe(false);
  });

  it("ліки з магазину: одна доза на день, травма минає за 4 дні", () => {
    const save = game();
    save.current.home.supplies.humanMeds = { cheap: 0, premium: 10 };
    fallIllPerson(save.current, "injury");
    for (let day = 0; day < 4; day++) {
      save.current.day = day;
      takeHumanMeds(save.current, always());
      takeHumanMeds(save.current, always());
    }
    expect(isIll(save.current, "injury")).toBe(false);
    expect(save.current.home.supplies.humanMeds.premium).toBe(2);
  });

  it("ліки п'ють біля умивальника", async () => {
    const { interact } = await import("../src/sim/game");
    const save = game();
    save.current.home.supplies.humanMeds = { cheap: 0, premium: 1 };
    standAt(save, "sink");
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
    expect(doctorExam(save.current)).toBe(true);
    expect(doctorTreat(save.current, "cold", "premium", always())).toBe("cured");
    expect(isIll(save.current, "cold")).toBe(false);
    save.current.day = 2;
    expect(isWorkday(save.current)).toBe(false);
  });
});
