// Джерела світла квартири (§8.9 «День і ніч», §4.1 «Планове відключення»; рішення автора 2026-11-02): удень — нічого; уночі
// — невидимі стельові світильники в усіх кімнатах, бра й індикатор бойлера; у відключення замість них — свічки, дисплей
// зарядної станції й синє газове полум'я; екран комп'ютера — поки на ньому щось є. Мерехтіння свічок — детерміноване.

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { ROOMS, roomAt } from "../src/sim/home";
import type { GameState } from "../src/sim/types";
import { LIGHT_ART } from "../src/view/art/manifest/a21-light";
import type { ArtId } from "../src/view/art/types";
import { BOILER, CANDLES, CEILING_LAMPS, POWER_STATION, SCONCES } from "../src/view/decor";
import { artOffset } from "../src/view/iso/geometry";
import { candlesLit, daylight, lampsOn } from "../src/view/light/daylight";
import { CANDLE_LIGHT } from "../src/view/light/lightlook";
import { candleFlicker, lightSources, litStrength, roomLamps, type LightKind, type LightSource } from "../src/view/light/sources";
import type { Point } from "../src/view/world/part";
import { ISO } from "../src/view/world/projection";

function state(outage = false): GameState {
  const s = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
  s.modifiers.day = outage ? "outage" : null;
  return s;
}

const at = (h: number, m: number, s: GameState): LightSource[] => lightSources(s, daylight(h * 60 + m, s.modifiers.day !== "outage"));
const kinds = (list: readonly LightSource[]): LightKind[] => [...new Set(list.map((source) => source.kind))];
const count = (list: readonly LightSource[], kind: LightKind): number => list.filter((source) => source.kind === kind).length;

describe("джерела світла квартири", () => {
  it("удень світла доби немає — і джерел теж", () => {
    expect(lightSources(state(), daylight(12 * 60, true))).toEqual([]);
    expect(lightSources(state(true), daylight(12 * 60, false))).toEqual([]);
    expect(lightSources(state(), null)).toEqual([]);
  });

  it("уночі зі світлом: стельові світильники в кожній кімнаті, бра й індикатор бойлера; свічок і станції немає", () => {
    const list = at(22, 30, state());
    expect(count(list, "ceiling")).toBe(CEILING_LAMPS.length);
    expect(count(list, "sconce")).toBe(SCONCES.length);
    expect(count(list, "boiler")).toBe(1);
    expect(count(list, "candle")).toBe(0);
    expect(count(list, "station")).toBe(0);
    for (const room of ROOMS) expect(list.some((s) => s.kind === "ceiling" && s.room === room.id), room.id).toBe(true);
    for (const source of list.filter((s) => s.kind === "ceiling" || s.kind === "sconce")) expect(source.strength).toBe(1);
  });

  it("у відключення: ні ламп, ні бра, ні бойлера — свічки на всіх господарях і дисплей станції", () => {
    const list = at(22, 30, state(true));
    expect(count(list, "ceiling")).toBe(0);
    expect(count(list, "sconce")).toBe(0);
    expect(count(list, "boiler")).toBe(0);
    expect(count(list, "candle")).toBe(CANDLES.length);
    expect(count(list, "station")).toBe(1);
    expect(list.filter((s) => s.kind === "candle").map((s) => s.host)).toEqual(CANDLES.map((c) => c.host));
    // Свічки мерехтять, кожна — зі своїм зерном.
    const seeds = list.filter((s) => s.kind === "candle").map((s) => s.flicker);
    expect(new Set(seeds).size).toBe(CANDLES.length);
  });

  it("у відключення вдень станція не світить (світла доби немає), а вранці, коли свічки згасли, — ще світить", () => {
    expect(at(12, 0, state(true))).toEqual([]);
    const morning = at(8, 0, state(true));
    expect(count(morning, "candle")).toBe(0);
    expect(count(morning, "station")).toBe(1);
  });

  it("газове полум'я — лише у відключення й лише поки на плиті страва", () => {
    const cooking = (outage: boolean): GameState => {
      const s = state(outage);
      s.home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: 3 };
      return s;
    };
    expect(count(at(21, 30, cooking(true)), "gas")).toBe(1);
    expect(count(at(21, 30, cooking(false)), "gas")).toBe(0);
    expect(count(at(21, 30, state(true)), "gas")).toBe(0);
    expect(at(21, 30, cooking(true)).find((s) => s.kind === "gas")?.host).toBe("stove");
  });

  it("екран комп'ютера світить, поки персонаж працює (і у відключення — на станції)", () => {
    for (const outage of [false, true]) {
      const s = state(outage);
      expect(count(at(23, 0, s), "screen")).toBe(0);
      s.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
      expect(count(at(23, 0, s), "screen"), String(outage)).toBe(1);
    }
  });

  it("лампи вмикаються близько 20:00 зі зсувом по кімнатах, а не всі разом; о 06:45 уже згасли", () => {
    const d = daylight(20 * 60, true);
    if (!d) throw new Error("о 20:00 світло доби є");
    const levels = ROOMS.map((room) => roomLamps(d, room.id));
    for (const level of levels) {
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(1);
    }
    expect(new Set(levels).size).toBeGreaterThan(1);
    // Зсув кімнати — число гри (`DAYLIGHT.lampShift`, §8.9): лампа кімнати — на пів шляху рівно о `lampsOn` + її зсув.
    for (const room of ROOMS) {
      const shifted = daylight(DAYLIGHT.lampsOn + DAYLIGHT.lampShift[room.id], true);
      if (!shifted) throw new Error("увечері світло доби є");
      expect(roomLamps(shifted, room.id), room.id).toBeCloseTo(0.5, 6);
    }
    expect(kinds(at(19, 30, state()))).not.toContain("ceiling");
    expect(kinds(at(6, 50, state()))).not.toContain("ceiling");
    expect(kinds(at(6, 50, state()))).not.toContain("sconce");
  });

  it("бра й свічки світять, лише поки їхній кадр арту горить (lampsOn, candlesLit), і розгоряються з 0 на цій межі", () => {
    for (const outage of [false, true]) {
      const s = state(outage);
      for (let minute = 0; minute < 1440; minute += 1) {
        const d = daylight(minute, !outage);
        const list = lightSources(s, d);
        const kind: LightKind = outage ? "candle" : "sconce";
        const lit = outage ? candlesLit(d) : lampsOn(d);
        const level = outage ? (d?.candles ?? 0) : (d?.lamps ?? 0);
        const own = list.filter((source) => source.kind === kind);
        expect(own.length, `${kind} о ${minute}`).toBe(lit ? (outage ? CANDLES.length : SCONCES.length) : 0);
        for (const source of own) {
          expect(source.strength, `${source.id} о ${minute}`).toBeCloseTo((level - 0.5) / 0.5, 9);
          expect(source.strength).toBeGreaterThanOrEqual(0);
          expect(source.strength).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(litStrength(0.4)).toBe(0);
    expect(litStrength(0.5)).toBe(0);
    expect(litStrength(0.75)).toBeCloseTo(0.5);
    expect(litStrength(1)).toBe(1);
  });

  it("у сови по півночі (хвилина 1530) — те саме, що о 01:30", () => {
    const s = state();
    expect(lightSources(s, daylight(1530, true))).toEqual(lightSources(s, daylight(90, true)));
  });

  it("стельові світильники й бра — у своїх кімнатах; плями — на підлозі квартири", () => {
    const list = at(23, 0, state());
    for (const source of list.filter((s) => s.kind === "ceiling" || s.kind === "sconce")) {
      expect(roomAt(source.at), source.id).toBe(source.room);
    }
    for (const source of [...list, ...at(23, 0, state(true))]) {
      expect(source.at.x, source.id).toBeGreaterThan(0);
      expect(source.at.y, source.id).toBeGreaterThan(0);
      expect(Number.isFinite(source.screen.x) && Number.isFinite(source.screen.y), source.id).toBe(true);
    }
  });

  it("бра, бойлер, станція й свічки світять з точки свого кадру арту (абажур, індикатор, дисплей, полум'я), а не з лиця стіни", () => {
    const list = [...at(22, 30, state()), ...at(22, 30, state(true))];
    const pivots: Record<string, { id: ArtId; name: string; pivot: Point }> = {
      boiler: { id: "env/boiler", name: "led", pivot: ISO.toScreen(BOILER.at) },
      station: { id: "env/power-station", name: "display", pivot: ISO.toScreen(POWER_STATION.at) },
    };
    SCONCES.forEach((sconce, i) => (pivots[`sconce:${i}`] = { id: sconce.id, name: "lamp", pivot: ISO.toScreen(sconce.at) }));
    // Свічку квартира ставить pivot-ом (дном блюдця) на поверхню господаря: над точкою `at` на висоті `z`.
    CANDLES.forEach((candle, i) => {
      const floor = ISO.toScreen(candle.at);
      pivots[`candle:${i}`] = { id: "env/candle", name: "flame", pivot: { x: floor.x, y: floor.y - candle.z } };
    });
    for (const [id, { id: art, name, pivot }] of Object.entries(pivots)) {
      const source = list.find((s) => s.id === id);
      expect(source, id).toBeDefined();
      const offset = artOffset(art, name);
      expect(offset, `${art}#${name}`).not.toBeNull();
      expect(source?.screen.x, id).toBeCloseTo(pivot.x + (offset?.x ?? NaN), 6);
      expect(source?.screen.y, id).toBeCloseTo(pivot.y + (offset?.y ?? NaN), 6);
    }
    // Полум'я — там, де його намальовано: на `LIGHT_ART.candle.flame` над поверхнею господаря.
    const candle = list.find((s) => s.id === "candle:0");
    const floor = ISO.toScreen(CANDLES[0]!.at);
    expect((floor.y - CANDLES[0]!.z) - (candle?.screen.y ?? NaN)).toBeCloseTo(LIGHT_ART.candle.flame, 6);
  });

  it("мерехтіння свічки — детерміноване, у межах і живе", () => {
    const values: number[] = [];
    for (let t = 0; t < 5000; t += 50) values.push(candleFlicker(2, t));
    expect(values.every((v) => v >= 1 - CANDLE_LIGHT.flicker - 1e-9 && v <= 1)).toBe(true);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(CANDLE_LIGHT.flicker / 3);
    expect(candleFlicker(2, 1234)).toBe(candleFlicker(2, 1234));
    expect(candleFlicker(2, 1234)).not.toBe(candleFlicker(3, 1234));
  });
});
