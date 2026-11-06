// Робот-пилосос (§8.7): що дістає кожна якість, скільки разів виїжджає, чи минає меблі.

import { describe, expect, it } from "vitest";

import { HOUSEHOLD, ROBOT } from "../src/sim/config";
import { DUST_SPOTS, dustOf } from "../src/sim/dust";
import { newGame } from "../src/sim/game";
import { hiddenTile, isWall, OBJECTS } from "../src/sim/home";
import { robotAt, robotProgress, tickHousehold, topUpTufts, tuftsOf } from "../src/sim/household";
import type { GameState, Mess, MessKind, Quality, Save, Vec } from "../src/sim/types";
import { recordEvents } from "./helpers";

function game(quality: Quality): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.cats = [];
  save.current.home.appliances.robot = quality;
  return save;
}

/** Прожити дім від хвилини `from` до `to` кроками `step`. */
function live(state: GameState, from: number, to: number, step = 1): void {
  for (let minute = from; minute < to; minute += step) {
    tickHousehold(state, minute, step);
    state.minute = minute + step;
  }
}

const trip = (state: GameState, step?: number): void => live(state, HOUSEHOLD.robotMinute, HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes, step);

const allDust = (state: GameState): void => {
  state.home.dust = DUST_SPOTS.map((_, i) => i);
};

const dirtyFloor = (state: GameState): void => {
  state.home.fur = 100;
  topUpTufts(state);
  allDust(state);
};

const dustLeft = (state: GameState): string[] => [...new Set(dustOf(state).map((i) => DUST_SPOTS[i]?.kind ?? ""))].sort();

const on = (o: { x: number; y: number; w: number; h: number }, p: Vec): boolean => p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h;

/** Центри клітинок видної підлоги: туди лягає безлад. */
function floorTiles(): Vec[] {
  const tiles: Vec[] = [];
  for (let y = 1; y < 11; y++) {
    for (let x = 1; x < 19; x++) {
      const at = { x: x + 0.5, y: y + 0.5 };
      if (!isWall(x, y) && !hiddenTile(x, y) && !OBJECTS.some((o) => !o.walkable && on(o, at))) tiles.push(at);
    }
  }
  return tiles;
}

const messes = (kind: MessKind, spots: readonly Vec[]): Mess[] => spots.map((p, id) => ({ id, kind, x: p.x, y: p.y, cat: null }));

describe("робот-пилосос (§8.7)", () => {
  // Великі кроки часу — поїздка чи перемотування: робот не має проскочити сміття.
  for (const step of [0.1, 1, 7]) {
    it(`дешевий бере всі жмути й пил на підлозі, а кути, смужки й павутину лишає (крок ${step} хв)`, () => {
      const { current: state } = game("cheap");
      dirtyFloor(state);
      trip(state, step);
      expect(tuftsOf(state)).toEqual([]);
      expect(dustLeft(state)).toEqual(["cobweb", "corner", "wall"]);
      expect(dustOf(state)).toHaveLength(DUST_SPOTS.filter((s) => s.kind !== "floor").length);
    });

    it(`дорогий лишає лише павутину (крок ${step} хв)`, () => {
      const { current: state } = game("premium");
      dirtyFloor(state);
      trip(state, step);
      expect(tuftsOf(state)).toEqual([]);
      expect(dustLeft(state)).toEqual(["cobweb"]);
      expect(dustOf(state)).toHaveLength(DUST_SPOTS.filter((s) => s.kind === "cobweb").length);
    });
  }

  it("дорогий дістає сухий безлад на кожній клітинці видної підлоги, дешевий його не чіпає", () => {
    const tiles = floorTiles();
    expect(tiles.length).toBeGreaterThan(100);
    const premium = game("premium").current;
    premium.home.messes = messes("litter", tiles);
    trip(premium);
    expect(premium.home.messes).toEqual([]);
    const cheap = game("cheap").current;
    cheap.home.messes = messes("litter", tiles);
    trip(cheap);
    expect(cheap.home.messes).toHaveLength(tiles.length);
  });

  it("мокрого й органічного не бере навіть дорогий", () => {
    const { current: state } = game("premium");
    const spots = [{ x: 9.5, y: 8.5 }];
    for (const kind of ["puddle", "vomit", "surprise", "hairball", "mark"] as const) state.home.messes.push(...messes(kind, spots));
    trip(state);
    expect(state.home.messes).toHaveLength(5);
  });

  it("їде повз меблі, стіни й ящики біля входу, зокрема повз сховища, що з'являються пізніше", () => {
    const { current: state } = game("cheap");
    for (let minute = HOUSEHOLD.robotMinute; minute < HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes; minute += 0.05) {
      state.minute = minute;
      const at = robotAt(state);
      const label = `${at.x.toFixed(2)}, ${at.y.toFixed(2)}`;
      expect(isWall(Math.floor(at.x), Math.floor(at.y)), label).toBe(false);
      expect(OBJECTS.find((o) => on(o, at))?.id, label).toBeUndefined();
    }
  });

  it("дорогий виїжджає двічі на день, дешевий — раз", () => {
    const trips = (quality: Quality): number => {
      const { current: state } = game(quality);
      const { events, stop } = recordEvents();
      live(state, 8 * 60, 23 * 60);
      stop();
      return events.filter((e) => e.type === "robot").length;
    };
    expect(trips("cheap")).toBe(1);
    expect(trips("premium")).toBe(2);
  });

  it("другий виїзд дорогого прибирає те, що лягло після першого", () => {
    const { current: state } = game("premium");
    trip(state);
    expect(robotProgress(state)).toBeNull();
    const evening = ROBOT.premium.starts[1] ?? 0;
    expect(evening).toBeGreaterThanOrEqual(HOUSEHOLD.robotMinute + HOUSEHOLD.robotMinutes);
    state.home.fur = 100;
    topUpTufts(state);
    live(state, evening - 5, evening + HOUSEHOLD.robotMinutes / 2);
    expect(robotProgress(state)).toBeCloseTo(0.5);
    live(state, evening + HOUSEHOLD.robotMinutes / 2, evening + HOUSEHOLD.robotMinutes);
    expect(tuftsOf(state)).toEqual([]);
    expect(robotProgress(state)).toBeNull();
  });

  it("дешевий увечері стоїть на базі", () => {
    const { current: state } = game("cheap");
    state.minute = ROBOT.premium.starts[1] ?? 0;
    expect(robotProgress(state)).toBeNull();
  });
});
