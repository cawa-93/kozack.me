// Місце сховища, якого ще немає (§8.7, «Переставити річ», «Що ставить гра»): поки сховища немає, його клітинка — для речей; щойно
// воно з'являється, річ, база робота й пилосос лишаються, де стояли, а сховище стає поруч.

import { describe, expect, it } from "vitest";

import { addSupply } from "../src/sim/economy";
import { advance, newGame } from "../src/sim/game";
import { nearestFreePlace, objectById, placedObject, robotDockAt } from "../src/sim/home";
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

  it("бак з'явився — миска з годівницею, база робота й пилосос на його клітинці лишаються, а бак стає поруч", () => {
    const save = game();
    const state = save.current;
    const bowl: BowlItem = { id: state.nextId++, kind: "bowl", quality: "cheap", slot: `floor-${BIN.x}-${BIN.y}`, food: 1, foodQuality: "cheap", sterile: false };
    state.home.items.push(bowl);
    const feeder: Feeder = { slot: bowl.slot, quality: "premium", food: 3, foodQuality: "cheap", sterile: false };
    state.home.feeders = [feeder];
    addSupply(state, "sterileFood", "cheap", 1);
    advance(save, 1);
    expect(bowl.slot).toBe(`floor-${BIN.x}-${BIN.y}`);
    expect(feeder.slot).toBe(bowl.slot);
    expect(onBin(placedObject(state, "sterile-bin"))).toBe(false);

    // База робота й пилосос — так само (бака ще немає: ставимо їх у кут, і бак з'являється).
    const other = game();
    const s = other.current;
    s.home.appliances.robot = "cheap";
    s.home.robotDock = { ...binCenter };
    s.home.vacuumAt = { ...binCenter };
    addSupply(s, "sterileFood", "cheap", 1);
    advance(other, 1);
    expect(onBin(robotDockAt(s))).toBe(true);
    expect(s.home.vacuumAt && onBin(s.home.vacuumAt)).toBe(true);
    expect(onBin(placedObject(s, "sterile-bin"))).toBe(false);
  });
});
