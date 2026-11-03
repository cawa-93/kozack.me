// Вигляд декору квартири (`src/view/iso/decorlook.ts`; §8.9 «День і ніч», §4.1 «Планове відключення», рішення автора
// 2026-11-02 і 2026-11-03): бра й настільна лампа горять із лампами, бойлер гріє, поки є електрика, а зарядна станція й
// полички зі свічками є лише в день відключення — свічки горять у темний час замість ламп. Де висять полички й стоїть лампа і
// що коти їх не закривають — `candleshelves.test.ts`.

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import type { GameState } from "../src/sim/types";
import { decorLook, decorLookInit } from "../src/view/iso/decorlook";
import { candlesLit, daylight, lampsOn } from "../src/view/light/daylight";

const state = (outage: boolean): GameState => {
  const save = newGame({ address: "she", difficulty: "normal", seed: 14 });
  save.current.modifiers.day = outage ? "outage" : null;
  return save.current;
};
const at = (h: number, m = 0): number => h * 60 + m;

describe("вигляд декору (decorlook.ts)", () => {
  it("звичайний день: бойлер горить, станції й поличок немає; бра й настільна лампа — лише в темний час, разом із лампами", () => {
    const s = state(false);
    for (const minute of [at(12), at(9, 30), at(17, 59)]) {
      expect(decorLook(s, minute), `${minute}`).toEqual({ sconce: "off", deskLamp: "off", boiler: "on", station: false, candles: null });
    }
    for (const minute of [at(22, 30), at(1, 30), at(5, 30)]) {
      expect(decorLook(s, minute).sconce, `${minute}`).toBe("on");
      expect(decorLook(s, minute).deskLamp, `${minute}`).toBe("on");
    }
    // Бра й лампа — та сама межа, що й лампи квартири (`lampsOn`): кожна хвилина доби.
    for (let minute = 0; minute < 1440; minute += 5) {
      const look = decorLook(s, minute);
      expect(look.sconce === "on", `${minute}`).toBe(lampsOn(daylight(minute, true)));
      expect(look.deskLamp, `${minute}`).toBe(look.sconce);
      expect(look.candles, `${minute}`).toBeNull();
    }
    // Вмикаються близько 20:00, гаснуть близько 06:30.
    expect(decorLook(s, DAYLIGHT.lampsOn - 20).deskLamp).toBe("off");
    expect(decorLook(s, DAYLIGHT.lampsOn + 20).deskLamp).toBe("on");
    expect(decorLook(s, DAYLIGHT.lampsOff - 20).deskLamp).toBe("on");
    expect(decorLook(s, DAYLIGHT.lampsOff + 20).deskLamp).toBe("off");
  });

  it("день відключення: бра й настільна лампа не вмикаються, бойлер згаслий, станція й полички є весь день, свічки горять у темний час", () => {
    const s = state(true);
    expect(decorLook(s, at(12))).toEqual({ sconce: "off", deskLamp: "off", boiler: "off", station: true, candles: "out" });
    expect(decorLook(s, at(22, 30))).toEqual({ sconce: "off", deskLamp: "off", boiler: "off", station: true, candles: "lit" });
    for (let minute = 0; minute < 1440; minute += 5) {
      const look = decorLook(s, minute);
      expect(look.sconce, `${minute}`).toBe("off");
      expect(look.deskLamp, `${minute}`).toBe("off");
      expect(look.candles, `${minute}`).toBe(candlesLit(daylight(minute, false)) ? "lit" : "out");
    }
  });

  it("сова після півночі (хвилина понад 1440) — те саме, що та сама година доби", () => {
    for (const outage of [false, true]) {
      const s = state(outage);
      expect(decorLook(s, 1530)).toEqual(decorLook(s, at(1, 30)));
    }
  });

  it("світло доби вимкнене (lightMinute null, `?light=off`): як удень — бра й лампа не горять, свічки погашені; бойлер, станція й полички — за електрикою", () => {
    expect(decorLook(state(false), null)).toEqual({ sconce: "off", deskLamp: "off", boiler: "on", station: false, candles: null });
    expect(decorLook(state(true), null)).toEqual({ sconce: "off", deskLamp: "off", boiler: "off", station: true, candles: "out" });
  });

  it("пише в переданий об'єкт (квартира не виділяє його щокадру)", () => {
    const out = decorLookInit();
    expect(out).toEqual({ sconce: "off", deskLamp: "off", boiler: "on", station: false, candles: null });
    expect(decorLook(state(true), at(23), out)).toBe(out);
    expect(out).toEqual({ sconce: "off", deskLamp: "off", boiler: "off", station: true, candles: "lit" });
    expect(decorLook(state(false), at(23), out)).toBe(out);
    expect(out).toEqual({ sconce: "on", deskLamp: "on", boiler: "on", station: false, candles: null });
  });
});
