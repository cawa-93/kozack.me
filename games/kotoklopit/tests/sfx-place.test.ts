import { describe, expect, it } from "vitest";

import { SFX } from "../src/audio/config";
import { distanceGain, panOf, placement, soundPoint } from "../src/audio/sfx/place";
import { itemPoint, objectById } from "../src/sim/home";
import { newGame } from "../src/sim/game";

describe("де звучить звук (§11.4а)", () => {
  it("поруч — на повну, далеко — тихо, але чути, і гучність не зростає з відстанню", () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(SFX.near)).toBe(1);
    expect(distanceGain(SFX.far)).toBe(SFX.floor);
    expect(distanceGain(100)).toBe(SFX.floor);
    let previous = 1;
    for (let d = 0; d <= SFX.far + 1; d += 0.25) {
      const gain = distanceGain(d);
      expect(gain).toBeLessThanOrEqual(previous + 1e-9);
      previous = gain;
    }
  });

  it("праворуч на екрані (більше x − y) — праворуч у навушниках, у межах SFX.pan", () => {
    const at = { x: 5, y: 5 };
    expect(panOf(at, { x: 8, y: 5 })).toBeGreaterThan(0);
    expect(panOf(at, { x: 5, y: 8 })).toBeLessThan(0);
    expect(panOf(at, { x: 7, y: 7 })).toBeCloseTo(0);
    expect(Math.abs(panOf(at, { x: 100, y: 0 }))).toBeCloseTo(SFX.pan);
  });

  it("без місця — посередині й на повну", () => {
    expect(placement(null, { x: 1, y: 1 })).toEqual({ gain: 1, pan: 0 });
    expect(placement({ x: 1, y: 1 }, null)).toEqual({ gain: 1, pan: 0 });
  });

  it("точки: персонаж, кіт удома, річ квартири; кота поза домом і невідомого немає", () => {
    const state = newGame({ seed: 1, address: "she", difficulty: "normal" }).current;
    expect(soundPoint(state, "person")).toBe(state.character.body);
    expect(soundPoint(state, null)).toBeNull();
    expect(soundPoint(state, undefined)).toBeNull();
    expect(soundPoint(state, { x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
    const stove = objectById("stove");
    expect(soundPoint(state, "stove")).toEqual({ x: stove.x + stove.w / 2, y: stove.y + stove.h / 2 });
    expect(soundPoint(state, "немає-такої-речі")).toBeNull();
    const cat = state.cats[0];
    if (cat) {
      expect(soundPoint(state, `cat:${cat.id}`)).toBe(cat);
      cat.away = "trip";
      expect(soundPoint(state, `cat:${cat.id}`)).toBeNull();
    }
    expect(soundPoint(state, "cat:9999")).toBeNull();
    const item = state.home.items[0];
    if (item) expect(soundPoint(state, `item:${item.id}`)).toEqual(itemPoint(item));
    expect(soundPoint(state, "item:9999")).toBeNull();
    state.home.messes.push({ id: 777, kind: "broken", x: 3.5, y: 4.5, cat: null });
    expect(soundPoint(state, "mess:777")).toMatchObject({ x: 3.5, y: 4.5 });
    expect(soundPoint(state, "mess:9999")).toBeNull();
  });
});
