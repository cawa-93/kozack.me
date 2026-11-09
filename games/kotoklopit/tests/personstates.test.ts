// Стани персонажа (§8.4): панель показує їх іконками, профіль телефона — іконкою, назвою й описом; ліки біля хвороб — і в персонажа
// (§6.5), і в картці кота (§9.5).

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { diseaseMedicine, dosedToday, fallIll } from "../src/sim/diseases";
import { newGame } from "../src/sim/game";
import { fallIllPerson } from "../src/sim/illness";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import { hourlyRate, positionOf } from "../src/sim/work";
import { DIFFICULTY } from "../src/sim/config";
import { PERSON_STATE_ABOUT, personStateTitle } from "../src/texts";
import { catFacts } from "../src/ui/cards";
import { personStates, type PersonStateId } from "../src/view/personstates";
import { PERSON_STATE_ICONS } from "../src/view/symbols";

const game = () => newGame({ address: "she", difficulty: "normal", seed: 4 }).current;

describe("стани персонажа (§8.4)", () => {
  it("безробіття й хвороби — стани; без них — порожньо", () => {
    const state = game();
    expect(personStates(state)).toEqual([]);
    state.job.unemployed = true;
    fallIllPerson(state, "cold");
    fallIllPerson(state, "injury");
    expect(personStates(state)).toEqual(["jobSearch", "cold", "injury"]);
  });

  it("недосип і «виспався» — за швидкістю після сну; «добре виспався» — та сама подушка з ✓", () => {
    const state = game();
    state.character.sleepSpeed = -0.1;
    expect(personStates(state)).toContain("sleepDebt");
    state.character.sleepSpeed = 0.01;
    expect(personStates(state)).toContain("rested");
    state.character.sleepSpeed = 1;
    expect(personStates(state)).toContain("wellRested");
    expect(PERSON_STATE_ICONS.wellRested).toEqual({ icon: PERSON_STATE_ICONS.rested.icon, mark: "ok" });
  });

  it("кожен стан має іконку, назву й опис без чисел; форми — за звертанням", () => {
    for (const id of Object.keys(PERSON_STATE_ICONS) as PersonStateId[]) {
      for (const address of ["he", "she"] as const) {
        expect(personStateTitle(id, address), id).toMatch(/^\S/);
        expect(personStateTitle(id, address), id).not.toMatch(/[[\]|]/);
      }
      expect(PERSON_STATE_ABOUT[id], id).not.toMatch(/\d/);
    }
    expect(personStateTitle("rested", "he")).toBe("Виспався");
    expect(personStateTitle("cold", "she")).toBe("Застуда");
  });

  it("ставка за годину — посада × заробіток складності, без поправок дня", () => {
    const state = game();
    expect(hourlyRate(state)).toBe(positionOf(state).pay * DIFFICULTY.normal.earnings);
  });
});

describe("ліки котові біля хвороби в картці (§9.5)", () => {
  it("на що діють ліки: курс таблеток чи крапель, щоденна таблетка хронічної; дієту й ветеринара — ні", () => {
    expect(diseaseMedicine("cold")).toBe("pills");
    expect(diseaseMedicine("fleas")).toBe("drops");
    expect(diseaseMedicine("heart")).toBe("pills");
    expect(diseaseMedicine("stomach")).toBeNull();
    expect(diseaseMedicine("injury")).toBeNull();
  });

  it("«таблетку сьогодні дано» — лише біля відомої хвороби, на яку вона діє, і лише сьогоднішня доза", () => {
    const state = game();
    const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 30, at: { x: 9.5, y: 8.5 } });
    addCat(state, cat);
    fallIll(state, cat, "cold");
    fallIll(state, cat, "fleas");
    for (const d of cat.diseases) d.known = true;
    const line = (): string => catFacts(state, cat).lines.find((l) => l.startsWith("Хвороби")) ?? "";
    expect(line()).not.toContain("сьогодні дано");
    // Учора — не сьогодні.
    cat.lastDose = { pills: absoluteMinute(state.day - 1, 20 * 60) };
    expect(dosedToday(state, cat, "pills")).toBe(false);
    expect(line()).not.toContain("сьогодні дано");
    cat.lastDose = { pills: absoluteMinute(state.day, state.minute) };
    expect(dosedToday(state, cat, "pills")).toBe(true);
    expect(line()).toContain("(таблетку сьогодні дано)");
    // Краплі від бліх не давали — біля бліх нічого.
    expect(line().match(/сьогодні дано/g)).toHaveLength(1);
    // Невідома хвороба — без позначки.
    for (const d of cat.diseases) d.known = false;
    expect(line()).toBe("");
  });
});
