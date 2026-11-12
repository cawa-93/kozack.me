// Базу робота-пилососа несуть у руках (§8.7, «Переставити річ»): робот не виїжджає — не прибирає й не шумить; виїзд, на початку
// якого базу несли, пропускається цілком, хоч би її й поставили до його кінця (сценарій `scenarios/robot-carry.json`).

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { HOUSEHOLD, ROBOT } from "../src/sim/config";
import { addDust, dustOf } from "../src/sim/dust";
import type { GameEvent } from "../src/sim/events";
import { advance } from "../src/sim/game";
import { robotAt, robotProgress } from "../src/sim/household";
import { robotDockAt } from "../src/sim/home";
import { movableThing, moveThing } from "../src/sim/moving";
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

  it("поставили базу посеред часу виїзду — цей виїзд пропущено: робот стоїть на базі, не прибирає й не шумить", () => {
    const save = carrying();
    const state = save.current;
    advance(save, HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes / 3 - state.minute);
    expect(state.character.held?.kind).toBe("robot");
    const { events, stop } = recordEvents();
    moveThing(state);
    expect(state.character.held).toBeNull();
    const dust = [...dustOf(state)];
    const dock = robotDockAt(state);
    for (let i = 0; i < 20; i++) {
      advance(save, HOUSEHOLD.robotMinutes / 30);
      expect(robotProgress(state), `хвилина ${state.minute}`).toBeNull();
      expect(robotAt(state)).toEqual(dock);
    }
    // Робот на базі, тож її знову можна взяти.
    expect(movableThing(state)).toBe("robot");
    advance(save, HOUSEHOLD.robotMinutes / 3 + 10);
    stop();
    expect(state.minute).toBeGreaterThan(HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes);
    expect(robotEvents(events)).toEqual([]);
    expect(state.home.robotHeard).toBeUndefined();
    const after = dustOf(state);
    dust.forEach((amount, i) => expect(after[i] ?? 0).toBeGreaterThanOrEqual(amount));
  });

  it("після пропущеного виїзду наступний — за розкладом", () => {
    const save = carrying();
    const state = save.current;
    const next = ROBOT.premium.starts.find((start) => start > HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes);
    expect(state.home.appliances.robot).toBe("premium");
    expect(next).toBeDefined();
    advance(save, HOUSEHOLD.robotMinute + 5 - state.minute);
    moveThing(state);
    expect(state.character.held).toBeNull();
    expect(robotProgress(state)).toBeNull();
    advance(save, next! - 1 - state.minute);
    expect(robotProgress(state)).toBeNull();
    const { events, stop } = recordEvents();
    advance(save, 1 + HOUSEHOLD.robotMinutes / 2);
    expect(robotProgress(state)).toBeCloseTo(0.5, 1);
    advance(save, HOUSEHOLD.robotMinutes / 2 + 5);
    stop();
    expect(events.some((e) => e.type === "vacuumed" && e.by === "robot")).toBe(true);
    expect(events.some((e) => e.type === "robot")).toBe(true);
  });
});
