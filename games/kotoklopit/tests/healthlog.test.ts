// Журнал втрат здоров'я кота (§9.7): за ним обирається причина смерті; втрати того самого дня з того самого джерела — один запис,
// інакше кіт у переносці (§8.7) дописував би рядок щокадру, і збереження росло б на мегабайти.

import { describe, expect, it } from "vitest";

import { addCarrier, seatCat } from "../src/sim/carriers";
import { changeHealth, createCat, idleAct } from "../src/sim/cat";
import { changeStat } from "../src/sim/character";
import { CARRIER } from "../src/sim/config";
import { zeroHealthCause } from "../src/sim/farewell";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 3 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(9);
  return save;
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 20, at: { x: 8.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  return cat;
}

describe("журнал здоров'я кота (§9.7)", () => {
  it("кіт у переносці зі спрагою на межі годину при 60 кадрах/с: записів не більшає з кадрами, втрата та сама", () => {
    const save = game();
    const cat = withCat(save);
    addCarrier(save.current.home, "cheap");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(seatCat(save.current, cat)).toBe(true);
    cat.needs.thirst = 100;
    const frame = 2 / 60;
    const live = (minutes: number): void => {
      for (let t = 0; t < minutes - 1e-9; t += frame) {
        changeStat(save.current, "satiety", 100);
        advance(save, frame);
      }
    };
    live(1);
    expect(cat.healthLog).toHaveLength(1);
    live(59);
    expect(cat.away).toBe("carrier");
    expect(cat.healthLog).toHaveLength(1);
    const [entry] = cat.healthLog;
    expect(entry?.source).toBe("переноска");
    expect(entry?.day).toBe(save.current.day);
    expect(entry?.amount).toBeCloseTo(CARRIER.healthPerHour, 6);
    expect(100 - cat.health).toBeCloseTo(CARRIER.healthPerHour, 6);
  });

  it("втрата додається до запису того самого дня й джерела, хоч між ними було інше; новий день чи джерело — новий запис", () => {
    const save = game();
    const cat = withCat(save);
    const state = save.current;
    changeHealth(state, cat, -2, "disease:cold");
    changeHealth(state, cat, -1, "mood");
    changeHealth(state, cat, -3, "disease:cold");
    // Зростання здоров'я в журнал не йде.
    changeHealth(state, cat, 5, "mood");
    expect(cat.healthLog).toEqual([
      { day: state.day, source: "disease:cold", amount: 5 },
      { day: state.day, source: "mood", amount: 1 },
    ]);
    state.day += 1;
    changeHealth(state, cat, -4, "mood");
    expect(cat.healthLog).toEqual([
      { day: state.day - 1, source: "disease:cold", amount: 5 },
      { day: state.day - 1, source: "mood", amount: 1 },
      { day: state.day, source: "mood", amount: 4 },
    ]);
    // Причина смерті — та сама сума за джерелом, що й з окремими записами.
    expect(zeroHealthCause(cat)).toEqual({ kind: "disease", disease: "cold" });
  });

  it("записи старші за тиждень, як і раніше, зникають", () => {
    const save = game();
    const cat = withCat(save);
    const state = save.current;
    changeHealth(state, cat, -2, "mood");
    state.day += 7;
    changeHealth(state, cat, -1, "mood");
    expect(cat.healthLog).toEqual([{ day: state.day, source: "mood", amount: 1 }]);
  });
});
