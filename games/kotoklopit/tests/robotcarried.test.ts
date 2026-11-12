// Базу робота-пилососа несуть у руках (§8.7, «Переставити річ»): робот не виїжджає — не прибирає й не шумить, поки базу не
// поставили (сценарій `scenarios/robot-carry.json`).

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { HOUSEHOLD } from "../src/sim/config";
import { addDust, dustOf } from "../src/sim/dust";
import type { GameEvent } from "../src/sim/events";
import { advance } from "../src/sim/game";
import { robotProgress } from "../src/sim/household";
import { moveThing } from "../src/sim/moving";
import type { Save } from "../src/sim/types";
import { recordEvents } from "./helpers";

/** Сценарій: персонажка о 10:00 несе базу дорогого робота; пил у вітальні. */
function carrying(): Save {
  const scenario = FILE_SCENARIOS["robot-carry"];
  if (!scenario) throw new Error("Немає сценарію robot-carry");
  const save = applyScenario(scenario);
  for (let i = 0; i < 20; i++) addDust(save.current, "living");
  return save;
}

/** Від 10:00 до кінця виїзду робота й ще трохи — з тим, що в руках. */
function pastRobotRun(save: Save): GameEvent[] {
  const { events, stop } = recordEvents();
  advance(save, HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes + 10 - save.current.minute);
  stop();
  return events;
}

const robotEvents = (events: GameEvent[]): GameEvent[] => events.filter((e) => (e.type === "vacuumed" && e.by === "robot") || e.type === "robot");

describe("база робота в руках (§8.7)", () => {
  it("поки базу несуть, робот не виїжджає: пил лежить, прибирання й шуму немає", () => {
    const save = carrying();
    const state = save.current;
    expect(state.character.held?.kind).toBe("robot");
    const dust = [...dustOf(state)];
    const events = pastRobotRun(save);
    expect(state.character.held?.kind).toBe("robot");
    expect(robotProgress(state)).toBeNull();
    expect(robotEvents(events)).toEqual([]);
    expect(state.home.robotHeard).toBeUndefined();
    // Пил тільки додавався: нічого з того, що лежало, не прибрано.
    const after = dustOf(state);
    dust.forEach((amount, i) => expect(after[i] ?? 0).toBeGreaterThanOrEqual(amount));
  });

  it("поставили базу до виїзду — робот виїжджає з неї й прибирає", () => {
    const save = carrying();
    moveThing(save.current);
    expect(save.current.character.held).toBeNull();
    const events = pastRobotRun(save);
    expect(events.some((e) => e.type === "vacuumed" && e.by === "robot")).toBe(true);
    expect(events.some((e) => e.type === "robot")).toBe(true);
  });
});
