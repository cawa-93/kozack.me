// Особливості персонажів (§5.1, §4.1): борода й цикл.

import { describe, expect, it } from "vitest";

import { BEARD } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { interact, newGame } from "../src/sim/game";
import { beardImpression, beardLook, cycleDay, cycleHygiene, cycleMove, cyclePhase, groomBeard } from "../src/sim/grooming";
import { fallIllPerson } from "../src/sim/illness";
import type { Save } from "../src/sim/types";
import { callImpression } from "../src/sim/work";
import { sinkCard } from "../src/ui/cards";
import { recordEvents, standAt } from "./helpers";

/** Що відповів умивальник на дію: причина відмови чи undefined. */
function sinkRefusal(save: Save): unknown {
  standAt(save, "sink");
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  const event = events.find((e) => e.type === "refused");
  return event?.type === "refused" ? event.reason : undefined;
}

const labels = (save: Save): string[] => sinkCard(save.current, () => undefined, () => undefined).actions.map((a) => a.label);

describe("борода (§5.1)", () => {
  it("після гоління охайно 2 дні, далі щетина; через 4 дні — неохайна борода, яку можна підрівняти", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.character.stats.hygiene = 50;
    expect(beardLook(state)).toBe("clean");
    expect(callImpression(state)).toBe(0.5);
    state.day = 2;
    expect(beardLook(state)).toBe("stubble");
    expect(groomBeard(state, "trim")).toBeNull();
    state.day = 4;
    expect(beardLook(state)).toBe("unkempt");
    expect(beardImpression(state)).toBe(-0.5);
    expect(groomBeard(state, "trim")).toBe(5);
    expect(beardLook(state)).toBe("neat");
    state.day = 7;
    expect(beardLook(state)).toBe("unkempt");
    expect(groomBeard(state, "shave")).toBe(10);
    expect(beardLook(state)).toBe("clean");
  });

  it("поголитися чи підрівняти вдруге того самого дня не можна: вигляд не зміниться, а час ішов би даремно (загальна ревізія 2026-10-29)", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.day = 3;
    const { events, stop } = recordEvents();
    expect(groomBeard(state, "shave")).toBe(BEARD.shaveMinutes);
    expect(groomBeard(state, "shave")).toBeNull();
    // Наступного дня обличчя ще гладеньке, але поголитися наперед можна (§5.1).
    state.day = 4;
    expect(beardLook(state)).toBe("clean");
    expect(groomBeard(state, "shave")).toBe(BEARD.shaveMinutes);
    state.day = 9;
    expect(groomBeard(state, "trim")).toBe(BEARD.trimMinutes);
    expect(groomBeard(state, "trim")).toBeNull();
    stop();
    expect(events.filter((e) => e.type === "beard")).toHaveLength(3);
  });

  it("умивальник чоловіка: ліки першою й головною дією, без повторного гоління; хвилини — з config (загальна ревізія 2026-10-29)", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.day = 2;
    expect(labels(save)).toEqual([`Поголитися · 🕐 ${BEARD.shaveMinutes} хв`]);
    state.day = 6;
    expect(labels(save)).toEqual([`Підрівняти бороду · 🕐 ${BEARD.trimMinutes} хв`, `Поголитися · 🕐 ${BEARD.shaveMinutes} хв`]);
    fallIllPerson(state, "cold");
    addSupply(state, "humanMeds", "cheap", 5);
    const card = sinkCard(state, () => undefined, () => undefined);
    expect(card.actions[0]?.label).toBe("Ліки для себе ×5");
    expect(card.actions.filter((a) => a.primary).map((a) => a.label)).toEqual(["Ліки для себе ×5"]);
    // Поголився сьогодні — «Поголитися» зникає, головна дія — та, що лишилася.
    groomBeard(state, "shave");
    expect(labels(save)).toEqual(["Ліки для себе ×5"]);
  });

  it("робити біля умивальника нічого — картки немає, а відмова та сама, що й у жінки (загальна ревізія 2026-10-29)", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    save.current.modifiers.day = null;
    // Щойно поголений (день 0) і здоровий: ні бороди, ні ліків.
    expect(labels(save)).toEqual([]);
    expect(sinkRefusal(save)).toBe("healthy");
    // Хворий, а ліків немає — «ліки скінчилися».
    fallIllPerson(save.current, "cold");
    expect(labels(save)).toEqual([]);
    expect(sinkRefusal(save)).toBe("empty");
  });

  it("у жіночого персонажа бороди немає", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    expect(beardImpression(save.current)).toBe(0);
    expect(groomBeard(save.current, "shave")).toBeNull();
  });
});

describe("цикл (§4.1)", () => {
  it("28 днів: менструація 1–5 — повільніше й гігієна швидше, приплив 10–14 — швидше", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    const state = save.current;
    state.character.cycleStart = 0;
    state.day = 0;
    expect(cycleDay(state)).toBe(1);
    expect(cyclePhase(state)).toBe("period");
    expect(cycleMove(state)).toBeLessThan(1);
    expect(cycleHygiene(state)).toBeGreaterThan(1);
    state.day = 10;
    expect(cyclePhase(state)).toBe("energy");
    expect(cycleMove(state)).toBeGreaterThan(1);
    state.day = 20;
    expect(cyclePhase(state)).toBeNull();
    state.day = 28;
    expect(cycleDay(state)).toBe(1);
  });

  it("у чоловічого персонажа циклу немає", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    expect(cyclePhase(save.current)).toBeNull();
  });
});
