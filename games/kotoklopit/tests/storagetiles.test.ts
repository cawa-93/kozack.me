// Місце сховища, якого ще немає (§8.7, «Переставити річ»): поки сховища немає, його клітинка — для речей; щойно воно з'являється,
// річ, база робота, пилосос чи іграшка з цієї клітинки переїжджають на найближчу вільну.

import { describe, expect, it } from "vitest";

import { addSupply } from "../src/sim/economy";
import { advance, newGame } from "../src/sim/game";
import { nearestFreePlace, objectById, robotDockAt } from "../src/sim/home";
import type { BowlItem, Feeder, Save } from "../src/sim/types";
import { withCatCorner } from "./helpers";

const game = (): Save => {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
};

const BIN = objectById("sterile-bin");
const binCenter = { x: BIN.x + 0.5, y: BIN.y + 0.5 };
const onBin = (p: { x: number; y: number }): boolean => Math.floor(p.x) === BIN.x && Math.floor(p.y) === BIN.y;

describe("місце сховища, якого ще немає (§8.7)", () => {
  it("поки бака корму для стерилізованих немає, у його кут ставлять; з баком — ні", () => {
    const save = game();
    expect(nearestFreePlace(save.current, binCenter)?.id).toBe(`floor-${BIN.x}-${BIN.y}`);
    addSupply(save.current, "sterileFood", "cheap", 1);
    const place = nearestFreePlace(save.current, binCenter);
    expect(place && onBin(place)).toBe(false);
  });

  it("бак з'явився — миска з годівницею, база робота й пилосос із його клітинки переїжджають на найближчі вільні", () => {
    const save = game();
    const state = save.current;
    const bowl: BowlItem = { id: state.nextId++, kind: "bowl", quality: "cheap", slot: `floor-${BIN.x}-${BIN.y}`, food: 1, foodQuality: "cheap", sterile: false };
    state.home.items.push(bowl);
    const feeder: Feeder = { slot: bowl.slot, quality: "premium", food: 3, foodQuality: "cheap", sterile: false };
    state.home.feeders = [feeder];
    addSupply(state, "sterileFood", "cheap", 1);
    advance(save, 1);
    expect(bowl.slot).not.toBe(`floor-${BIN.x}-${BIN.y}`);
    expect(feeder.slot).toBe(bowl.slot);
    expect(state.home.items.filter((i) => "slot" in i && i.slot === bowl.slot)).toHaveLength(1);

    // База робота й пилосос — так само (бак уже стоїть: ставимо їх у кут, наче з давніх часів, і бак «з'являється» знову).
    state.home.acquired = state.home.acquired.filter((p) => p !== "sterileFood");
    state.home.appliances.robot = "cheap";
    state.home.robotDock = { ...binCenter };
    state.home.vacuumAt = { ...binCenter };
    state.home.acquired.push("sterileFood");
    advance(save, 1);
    expect(onBin(robotDockAt(state))).toBe(false);
    expect(state.home.vacuumAt && onBin(state.home.vacuumAt)).toBe(false);
  });
});
