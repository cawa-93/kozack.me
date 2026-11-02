// Вигляд декору квартири (`src/view/iso/decorlook.ts`; §8.9 «День і ніч», §4.1 «Планове відключення», рішення автора
// 2026-11-02): бра горять із лампами, бойлер гріє, поки є електрика, а зарядна станція й свічки стоять лише в день
// відключення — свічки горять у темний час замість ламп; свічки на підвіконнях — не там, де сидить кіт.

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { WINDOWS } from "../src/sim/home";
import type { GameState, Vec } from "../src/sim/types";
import { CANDLES } from "../src/view/decor";
import { decorLook, type DecorLook } from "../src/view/iso/decorlook";
import { candlesLit, daylight, lampsOn } from "../src/view/light/daylight";
import { isoCatPerch } from "../src/view/world/objects";

const state = (outage: boolean): GameState => {
  const save = newGame({ address: "she", difficulty: "normal", seed: 14 });
  save.current.modifiers.day = outage ? "outage" : null;
  return save.current;
};
const at = (h: number, m = 0): number => h * 60 + m;

describe("вигляд декору (decorlook.ts)", () => {
  it("звичайний день: бойлер горить, станції й свічок немає; бра — лише в темний час, разом із лампами", () => {
    const s = state(false);
    for (const minute of [at(12), at(9, 30), at(17, 59)]) {
      expect(decorLook(s, minute), `${minute}`).toEqual({ sconce: "off", boiler: "on", station: false, candles: null });
    }
    for (const minute of [at(22, 30), at(1, 30), at(5, 30)]) expect(decorLook(s, minute).sconce, `${minute}`).toBe("on");
    // Бра — та сама межа, що й лампи (`lampsOn`): кожна хвилина доби.
    for (let minute = 0; minute < 1440; minute += 5) {
      expect(decorLook(s, minute).sconce === "on", `${minute}`).toBe(lampsOn(daylight(minute, true)));
    }
    // Вмикаються близько 20:00, гаснуть близько 06:30.
    expect(decorLook(s, DAYLIGHT.lampsOn - 20).sconce).toBe("off");
    expect(decorLook(s, DAYLIGHT.lampsOn + 20).sconce).toBe("on");
    expect(decorLook(s, DAYLIGHT.lampsOff - 20).sconce).toBe("on");
    expect(decorLook(s, DAYLIGHT.lampsOff + 20).sconce).toBe("off");
  });

  it("день відключення: бра не вмикаються, бойлер згаслий, станція й свічки стоять увесь день, горять — у темний час", () => {
    const s = state(true);
    expect(decorLook(s, at(12))).toEqual({ sconce: "off", boiler: "off", station: true, candles: "out" });
    expect(decorLook(s, at(22, 30))).toEqual({ sconce: "off", boiler: "off", station: true, candles: "lit" });
    for (let minute = 0; minute < 1440; minute += 5) {
      const look = decorLook(s, minute);
      expect(look.sconce, `${minute}`).toBe("off");
      expect(look.candles, `${minute}`).toBe(candlesLit(daylight(minute, false)) ? "lit" : "out");
    }
  });

  it("сова після півночі (хвилина понад 1440) — те саме, що та сама година доби", () => {
    for (const outage of [false, true]) {
      const s = state(outage);
      expect(decorLook(s, 1530)).toEqual(decorLook(s, at(1, 30)));
    }
  });

  it("світло доби вимкнене (lightMinute null, `?light=off`): як удень — бра не горять, свічки погашені; бойлер і станція — за електрикою", () => {
    expect(decorLook(state(false), null)).toEqual({ sconce: "off", boiler: "on", station: false, candles: null });
    expect(decorLook(state(true), null)).toEqual({ sconce: "off", boiler: "off", station: true, candles: "out" });
  });

  it("пише в переданий об'єкт (квартира не виділяє його щокадру)", () => {
    const out: DecorLook = { sconce: "off", boiler: "on", station: false, candles: null };
    expect(decorLook(state(true), at(23), out)).toBe(out);
    expect(out).toEqual({ sconce: "off", boiler: "off", station: true, candles: "lit" });
  });
});

describe("свічки дня відключення (decor.ts, §4.1)", () => {
  /** Не ближче за це (клітинки) до місця, де сидить кіт: інакше кіт сидить на свічці. */
  const AWAY = 0.35;

  it("на підвіконнях — на кінцях дошок, не там, де сидить кіт (WINDOWS[].seat і місце кота на дошці, isoCatPerch)", () => {
    const sills = CANDLES.filter((candle) => WINDOWS.some((w) => w.sill === candle.host));
    expect(sills.map((c) => c.host).sort()).toEqual(WINDOWS.map((w) => w.sill).sort());
    for (const candle of CANDLES) {
      const seats: Vec[] = WINDOWS.filter((w) => w.sill === candle.host).map((w) => w.seat);
      // Де кота на цій речі малює ізометричний вигляд (на підвіконні — посередині дошки біля вікна, не в точці сима).
      for (const seat of [...seats]) seats.push(isoCatPerch(candle.host, seat, false).at);
      for (const seat of seats) {
        expect(Math.hypot(candle.at.x - seat.x, candle.at.y - seat.y), `${candle.host}: свічка біля (${seat.x}; ${seat.y})`).toBeGreaterThanOrEqual(AWAY);
      }
    }
  });
});

