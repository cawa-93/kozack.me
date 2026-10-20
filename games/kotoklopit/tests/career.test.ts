// Кар'єра (§8.6): підвищення на 100 репутації, пониження на 0, звільнення стажера й пошук роботи.

import { describe, expect, it } from "vitest";

import { advance, interact, newGame } from "../src/sim/game";
import type { Save } from "../src/sim/types";
import { changeReputation } from "../src/sim/work";
import { hours, standAt } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 2 });

describe("посади (§8.6)", () => {
  it("на 100 репутації — підвищення, і репутація знову 50", () => {
    const save = game();
    changeReputation(save.current, 60);
    expect(save.current.job.position).toBe(1);
    expect(save.current.job.reputation).toBe(50);
  });

  it("на 0 — пониження, а стажера звільняють", () => {
    const save = game();
    save.current.job.position = 2;
    changeReputation(save.current, -60);
    expect(save.current.job.position).toBe(1);
    expect(save.current.job.reputation).toBe(50);
    save.current.job.position = 0;
    changeReputation(save.current, -60);
    expect(save.current.job.unemployed).toBe(true);
  });

  it("безробітний шукає роботу 24 години за комп'ютером, без зарплати й без «!»", () => {
    const save = game();
    save.current.job.unemployed = true;
    save.current.day = 1;
    save.current.minute = hours(9);
    standAt(save, "computer");
    const money = save.current.character.money;
    interact(save);
    advance(save, hours(1));
    expect(save.current.job.searchHours).toBeCloseTo(1);
    expect(save.current.job.unemployed).toBe(true);
    save.current.job.searchHours = 23.5;
    advance(save, hours(1));
    expect(save.current.job.unemployed).toBe(false);
    expect(save.current.job.position).toBe(0);
    expect(save.current.character.money).toBeLessThanOrEqual(money + 15);
  });
});
