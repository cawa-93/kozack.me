// Знайомство з новим котом (§9.7): кожен кіт, що вперше прийшов у дім, показує картку, звідки б він не взявся; ім'я можна змінити
// чи лишити згенероване. Портрет — частини скелета в позі «сидить».

import { describe, expect, it } from "vitest";

import { FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat, idleAct, meetCat, nextNewcomer } from "../src/sim/cat";
import { adopt, shelterCats } from "../src/sim/destinations";
import { goHome, goToSleep, newGame } from "../src/sim/game";
import { decideFoundling } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { Cat, Save } from "../src/sim/types";
import { catPortraitParts } from "../src/view/iso/catportrait";
import { driveSafely, hours, standAt, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 3 }));

function homeCat(save: Save, ageWeeks: number, sex: Cat["sex"] = "male"): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, sex, at: { x: 6.5, y: 9.5 } });
  // Здоровий і вже звиклий: ніч не має забрати його раніше, ніж вона дійде до потрібного кроку.
  Object.assign(cat, { arrivedDay: -10, health: 100, act: idleAct(30), needs: { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 } });
  addCat(save.current, cat);
  return cat;
}

function sleepOn(save: Save, day: number, sanity: number): void {
  save.current.day = day;
  save.current.modifiers.day = null;
  save.current.character.stats.sanity = sanity;
  save.current.minute = hours(22);
  goToSleep(save);
}

/** Субота, притулок: перший кіт зі списку забрано. */
function adoptFirst(ageWeeks: number): { save: Save; chosen: Cat } {
  const save = game();
  save.current.day = 5;
  save.current.minute = hours(9);
  save.current.modifiers.day = null;
  save.current.character.money = 10_000;
  standAt(save, "door");
  expect(startTrip(save.current, "shelter")).toBe(true);
  driveSafely(save);
  const chosen = shelterCats(save.current)[0];
  if (!chosen) throw new Error("у притулку нікого");
  chosen.ageWeeks = ageWeeks;
  expect(adopt(save.current, chosen.id)).not.toBeNull();
  return { save, chosen };
}

describe("знайомство з новим котом (§9.7): кого показують", () => {
  it("кошеня від низького глузду", () => {
    const save = game();
    sleepOn(save, 2, 34);
    expect(nextNewcomer(save.current)?.source).toBe("shelter-forced");
  });

  it("усі кошенята виводку, а мати вже знайома", () => {
    const save = game();
    const mother = homeCat(save, 30, "female");
    mother.pregnancy = { father: null, due: 7, known: true };
    sleepOn(save, 6, 80);
    const kittens = save.current.cats.filter((c) => c.source === "born");
    expect(kittens.length).toBeGreaterThan(0);
    for (const kitten of kittens) expect(kitten.newcomer).toBe(true);
    expect(mother.newcomer).toBeUndefined();
  });

  it("знайда", () => {
    const save = game();
    save.current.today.foundling = true;
    const kitten = decideFoundling(save.current, true, createRng(2));
    expect(nextNewcomer(save.current)).toBe(kitten);
  });

  for (const [who, age] of [["кошеня", 1], ["дорослий кіт", 30]] as const) {
    it(`${who} з притулку: коли приїде додому, не раніше`, () => {
      const { save, chosen } = adoptFirst(age);
      expect(chosen.newcomer).toBe(true);
      expect(chosen.away).toBe("trip");
      expect(nextNewcomer(save.current)).toBeUndefined();
      goHome(save);
      expect(chosen.away).toBeNull();
      expect(nextNewcomer(save.current)).toBe(chosen);
    });
  }

  it("кіт, якого додали не грою (сценарій, старе збереження), картки не показує", () => {
    const save = game();
    homeCat(save, 30);
    expect(nextNewcomer(save.current)).toBeUndefined();
  });

  it("є сценарій картки", () => {
    expect(FILE_SCENARIOS["cat-intro"]?.cats?.[0]).toMatchObject({ newcomer: true });
  });
});

describe("знайомство з новим котом (§9.7): ім'я", () => {
  const newcomer = (): Cat => {
    const cat = homeCat(game(), 30);
    cat.newcomer = true;
    return cat;
  };

  it("введене стає ім'ям, без пробілів довкола; другий раз картки не буде", () => {
    const cat = newcomer();
    meetCat(cat, "  Пухнастик ");
    expect(cat.name).toBe("Пухнастик");
    expect(cat.newcomer).toBeUndefined();
  });

  it("згенероване можна лишити: порожнє поле не стирає ім'я", () => {
    const cat = newcomer();
    const generated = cat.name;
    meetCat(cat, "   ");
    expect(cat.name).toBe(generated);
    expect(cat.newcomer).toBeUndefined();
  });
});

describe("портрет кота (§9.7)", () => {
  it("кіт сидить із розплющеними очима, частини дальнього боку затінені", () => {
    const parts = catPortraitParts(homeCat(game(), 30));
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.find((p) => p.id === "cat/eyes")?.state).toBe("open");
    expect(parts.some((p) => p.far === true)).toBe(true);
  });

  it("кошеня теж складається з частин", () => {
    expect(catPortraitParts(homeCat(game(), 1)).length).toBeGreaterThan(5);
  });
});
