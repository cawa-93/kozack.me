// Перестановка бази робота-пилососа (§8.7, «Переставити річ», «Робот-пилосос»): базу з роботом беруть кнопкою перестановки й
// ставлять на вільну видиму клітинку; звідти робот прибирає всю квартиру й вертається на неї.

import { describe, expect, it } from "vitest";

import { dropEverything } from "../src/sim/actions";
import { HOUSEHOLD } from "../src/sim/config";
import { deserialize, newGame, serialize } from "../src/sim/game";
import { hiddenTile, isWall, nearestFreePlace, ROBOT_DOCK, roomAt, robotDockAt } from "../src/sim/home";
import { robotAt, robotProgress } from "../src/sim/household";
import { moveThing } from "../src/sim/moving";
import type { GameState, Save, Vec } from "../src/sim/types";
import { carryIcon, THING_ICONS } from "../src/view/symbols";
import { withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.home.appliances.robot = "cheap";
  save.current.minute = HOUSEHOLD.robotMinute - 60;
  return save;
}

function stand(state: GameState, at: Vec, facing: Vec = { x: 1, y: 0 }): void {
  const { body } = state.character;
  body.x = at.x;
  body.y = at.y;
  body.facing = facing;
}

/** Стати біля бази обличчям до неї й натиснути кнопку перестановки. */
function liftRobot(state: GameState): void {
  const dock = robotDockAt(state);
  stand(state, { x: dock.x - 0.8, y: dock.y });
  moveThing(state);
}

/** Перенести базу у вітальню під ліве вікно: персонаж стоїть там обличчям праворуч і ставить. */
const LEFT_OF_LIVING: Vec = { x: 3.5, y: 9.5 };
function moveRobot(state: GameState, to: Vec = LEFT_OF_LIVING): Vec {
  liftRobot(state);
  stand(state, to);
  moveThing(state);
  const dock = robotDockAt(state);
  expect(Math.hypot(dock.x - ROBOT_DOCK.x, dock.y - ROBOT_DOCK.y), "базу переставлено").toBeGreaterThan(1);
  return dock;
}

const near = (a: Vec, b: Vec): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

describe("перестановка бази робота-пилососа (§8.7)", () => {
  it("базу з роботом беруть кнопкою перестановки, на кнопці — робот; ставлять на іншу видиму клітинку — робот стоїть на ній", () => {
    const save = game();
    const state = save.current;
    expect(robotDockAt(state)).toEqual(ROBOT_DOCK);
    liftRobot(state);
    expect(state.character.held?.kind).toBe("robot");
    expect(carryIcon(state)).toBe(THING_ICONS.robot);
    stand(state, LEFT_OF_LIVING);
    moveThing(state);
    expect(state.character.held).toBeNull();
    const dock = robotDockAt(state);
    expect(near(dock, ROBOT_DOCK)).toBe(false);
    expect(hiddenTile(Math.floor(dock.x), Math.floor(dock.y))).toBe(false);
    expect(Math.hypot(dock.x - LEFT_OF_LIVING.x, dock.y - LEFT_OF_LIVING.y)).toBeLessThan(2);
    expect(near(robotAt(state), dock)).toBe(true);
  });

  it("у дорозі робота кнопка базу не бере", () => {
    const save = game();
    const state = save.current;
    state.minute = HOUSEHOLD.robotMinute + 5;
    expect(robotProgress(state)).not.toBeNull();
    liftRobot(state);
    expect(state.character.held).toBeNull();
  });

  it("з нової бази робот прибирає всю квартиру, не крізь стіни, і вертається на неї", () => {
    const save = game();
    const state = save.current;
    const dock = moveRobot(state);
    const rooms = new Set<string>();
    for (let minute = HOUSEHOLD.robotMinute; minute < HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes; minute += 0.5) {
      state.minute = minute;
      const at = robotAt(state);
      expect(isWall(Math.floor(at.x), Math.floor(at.y)), `${minute}: ${at.x},${at.y}`).toBe(false);
      rooms.add(roomAt(at) ?? "прохід");
    }
    state.minute = HOUSEHOLD.robotMinute;
    expect(Math.hypot(robotAt(state).x - dock.x, robotAt(state).y - dock.y)).toBeLessThan(0.1);
    expect([...rooms]).toEqual(expect.arrayContaining(["bedroom", "bathroom", "kitchen", "living"]));
    state.minute = HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes + 1;
    expect(near(robotAt(state), dock)).toBe(true);
  });

  it("речі котячого кутка на базу не стають", () => {
    const save = game();
    const state = save.current;
    const dock = moveRobot(state);
    const place = nearestFreePlace(state, dock);
    expect(place && place.x === Math.floor(dock.x) && place.y === Math.floor(dock.y)).toBe(false);
    // Стара база звільнилася: туди вже можна.
    const old = nearestFreePlace(state, ROBOT_DOCK);
    expect(old?.x === Math.floor(ROBOT_DOCK.x) && old?.y === Math.floor(ROBOT_DOCK.y)).toBe(true);
  });

  it("поки робот у руках, він не виїжджає; лягаючи з ним у руках, персонаж ставить базу", () => {
    const save = game();
    const state = save.current;
    liftRobot(state);
    state.minute = HOUSEHOLD.robotMinute + 5;
    expect(robotProgress(state)).toBeNull();
    dropEverything(state);
    expect(state.character.held).toBeNull();
    const dock = robotDockAt(state);
    expect(hiddenTile(Math.floor(dock.x), Math.floor(dock.y))).toBe(false);
  });

  it("переставлена база зберігається; у збереженні без неї — на старому місці", () => {
    const save = game();
    const dock = moveRobot(save.current);
    expect(robotDockAt(deserialize(serialize(save)).current)).toEqual(dock);
    expect(robotDockAt(game().current)).toEqual(ROBOT_DOCK);
  });
});
