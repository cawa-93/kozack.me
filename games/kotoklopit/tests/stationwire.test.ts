// Дріт комп'ютера й зарядна станція в день відключення (§4.1 «Біля комп'ютера» [Уточнено], рішення автора 2026-11-03: «При
// відключенні світла кабель іде від комп'ютера в розетку. А зарядна станція просто стоїть поруч. Потрібно трошки змістити
// зарядну станцію до розетки. І кабель повинен вставлятись в неї, а не в розетку»): який стан дроту показує квартира, де шнур
// вилки станції сходиться з дротом на екрані, що станція закриває розетку, хто кого закриває (дріт — пласкою річчю під
// станцією) і що обрив, іскри, місце персонажа й смуга лагодження в день відключення ті самі, що звичайного дня. Де стоїть
// станція відносно стола й того, хто лагодить дріт, — `isoworld.test.ts`.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { OBJECTS, WIRE_TILE } from "../src/sim/home";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { LIGHT_ART } from "../src/view/art/manifest/a21-light";
import { WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { POWER_STATION, POWER_STATION_BOX, POWER_STATION_POINT } from "../src/view/decor";
import { decorLook } from "../src/view/iso/decorlook";
import { IsoDepth } from "../src/view/iso/depth";
import { sparking } from "../src/view/iso/fxlook";
import { artOffset } from "../src/view/iso/geometry";
import { wireState } from "../src/view/iso/looks";
import { actionBar, actionBarPoint, wireBarAnchor } from "../src/view/iso/markslayout";
import { wireFixSpot } from "../src/view/iso/personspot";
import { isoObjectLook } from "../src/view/world/objects";
import { ISO } from "../src/view/world/projection";

const scenario = (name: string): GameState => {
  const file = FILE_SCENARIOS[name];
  if (!file) throw new Error(`немає сценарію ${name}`);
  return applyScenario(file).current;
};

/** Центр клітинки `WIRE_TILE`: pivot кадру `env/wire` і його точка в реєстрі глибини. */
const WIRE_AT = { x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 };

/** Точка кадру на екрані світу: pivot у `at` (клітинки підлоги) плюс зсув точки `name` запису `id`. */
function screenPoint(id: Parameters<typeof artOffset>[0], name: string, at: { x: number; y: number }): { x: number; y: number } {
  const offset = artOffset(id, name);
  if (!offset) throw new Error(`${id}: немає точки ${name}`);
  const pivot = ISO.toScreen(at);
  return { x: pivot.x + offset.x, y: pivot.y + offset.y };
}

describe("дріт комп'ютера в день відключення — у гнізді зарядної станції (§4.1)", () => {
  it("звичайного дня дріт у розетці (цілий і перегризений), у день відключення — у гнізді станції; станція є саме тоді", () => {
    const states = artEntry("env/wire")?.states ?? [];
    const expected = { "day:whole": "whole", "day:chewed": "chewed", "outage:whole": "station", "outage:chewed": "station-chewed" } as const;
    for (const outage of [false, true]) {
      for (const chewed of [false, true]) {
        const state = scenario("power-outage");
        state.modifiers.day = outage ? "outage" : null;
        if (chewed) state.home.wireChewed = true;
        else delete state.home.wireChewed;
        const wire = wireState(state);
        expect(wire).toBe(expected[`${outage ? "outage" : "day"}:${chewed ? "chewed" : "whole"}`]);
        expect(states, wire).toContain(wire);
        // Станція й дріт у її гнізді — разом: о будь-якій годині дня відключення.
        for (const minute of [state.minute, 21 * 60 + 30, 3 * 60]) expect(decorLook(state, minute).station, `${wire} о ${minute}`).toBe(wire.startsWith("station"));
      }
    }
  });

  it("шнур вилки станції сходиться з дротом: точка `cord` станції й точка `station` дроту — те саме місце на підлозі перед станцією", () => {
    const fromWire = screenPoint("env/wire", "station", WIRE_AT);
    const fromStation = screenPoint("env/power-station", "cord", POWER_STATION.at);
    expect(Math.hypot(fromWire.x - fromStation.x, fromWire.y - fromStation.y)).toBeLessThanOrEqual(0.5);
    // Pivot станції — на цілих одиницях екрана від pivot дроту: обидва SVG малюють стик тими самими числами, і він безшовний.
    const wirePivot = ISO.toScreen(WIRE_AT);
    const stationPivot = ISO.toScreen(POWER_STATION.at);
    expect(Number.isInteger(stationPivot.x - wirePivot.x), "x").toBe(true);
    expect(Number.isInteger(stationPivot.y - wirePivot.y), "y").toBe(true);
    // Стик — на підлозі перед лицьовою гранню станції (y ≥ y1), ліворуч від її середини, під лівим гніздом.
    const dx = (fromStation.x - stationPivot.x) / 64;
    const dy = (fromStation.y - stationPivot.y) / 32;
    const cell = { x: POWER_STATION.at.x + (dx + dy) / 2, y: POWER_STATION.at.y + (dy - dx) / 2 };
    expect(cell.y).toBeGreaterThan(POWER_STATION_BOX.y1);
    expect(cell.x).toBeGreaterThan(POWER_STATION_BOX.x0);
    expect(cell.x).toBeLessThan(POWER_STATION.at.x);
  });

  it("станція закриває розетку на стіні ряду 5: верх корпусу на екрані вищий за накладку розетки, і вона між краями корпусу", () => {
    /** Накладка розетки (`art/env/wall/inner/row5-x5.svg`): на лиці y = 6, x 8,66–8,84, z 17–31, контур 2,5. */
    const SOCKET = { x0: 8.66, x1: 8.84, top: 31, ink: 1.25 };
    /** Пів зовнішнього контуру станції (`LINE_SMALL.outer` 4,5). */
    const INK = 2.25;
    const { x0, y0, x1 } = POWER_STATION_BOX;
    for (const x of [SOCKET.x0, (SOCKET.x0 + SOCKET.x1) / 2, SOCKET.x1]) {
      const plate = ISO.toScreen({ x, y: 6 });
      // Точка верхнього заднього ребра корпусу (y = y0) на тій самій вертикалі екрана.
      const back = x - 6 + y0;
      expect(back > x0 && back < x1, `${x}: ребро над розеткою`).toBe(true);
      const top = ISO.toScreen({ x: back, y: y0 }).y - LIGHT_ART.station.tall - INK;
      expect(top, `${x}: верх корпусу над розеткою`).toBeLessThan(plate.y - SOCKET.top - SOCKET.ink);
    }
    // Ліворуч і праворуч — у межах силуету корпусу: лівий край — ребро (x0, y1), правий — (x1, y0).
    expect(ISO.toScreen({ x: x0, y: POWER_STATION_BOX.y1 }).x).toBeLessThan(ISO.toScreen({ x: SOCKET.x0, y: 6 }).x - SOCKET.ink);
    expect(ISO.toScreen({ x: x1, y: y0 }).x).toBeGreaterThan(ISO.toScreen({ x: SOCKET.x1, y: 6 }).x + SOCKET.ink);
  });

  it("глибина: дріт — пласкою річчю одразу під станцією, обоє перед столом і стіною; коти й персонаж перед станцією — перед ними", () => {
    const registry = new IsoDepth();
    const depths = new Map<string, number>();
    for (const object of OBJECTS) registry.addBox({ ...isoObjectLook(object.id).footprint, id: object.id }, (d) => depths.set(object.id, d));
    for (const segment of WALL_SEGMENTS) {
      const r = segment.rect;
      registry.addBox({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, (d) => depths.set(segment.id, d));
    }
    // Як у квартирі (`iso/apartment.ts`): станція — коробка свого сліду, дріт у її гнізді — під нею.
    registry.addBox({ ...POWER_STATION_BOX, id: POWER_STATION_POINT }, (d) => depths.set("station", d));
    registry.addPoint((d) => depths.set("wire", d), { flat: true }).placeUnder(WIRE_AT.x, WIRE_AT.y, POWER_STATION_POINT);
    // Кіт гризе дріт (центр `WIRE_TILE`), кіт іде рядом 6 перед лівим краєм станції, кіт праворуч від неї біля стіни, персонаж
    // лагодить дріт біля обриву; кіт ліворуч від станції біля стіни — за нею.
    const front = { chew: WIRE_AT, walk: { x: 8.3, y: 6.5 }, right: { x: 9.2, y: 6.2 }, fix: wireFixSpot().at };
    for (const [name, at] of Object.entries(front)) registry.addPoint((d) => depths.set(name, d)).place(at.x, at.y);
    registry.addPoint((d) => depths.set("beside", d)).place(8.3, 6.2);
    registry.solve();
    const depth = (id: string): number => {
      const d = depths.get(id);
      if (d === undefined) throw new Error(`${id}: глибини немає`);
      return d;
    };
    expect(depth("wire"), "дріт перед столом").toBeGreaterThan(depth("computer"));
    expect(depth("wire"), "дріт перед стіною ряду 5").toBeGreaterThan(depth("env/wall/inner/row5-x5"));
    expect(depth("station"), "станція над дротом").toBeGreaterThan(depth("wire"));
    for (const name of Object.keys(front)) expect(depth(name), name).toBeGreaterThan(depth("station"));
    expect(depth("beside"), "кіт ліворуч від станції").toBeLessThan(depth("station"));
  });

  it("звичайного дня станції немає: дріт — пласка річ на підлозі перед столом і стіною, під котом, що його гризе", () => {
    const registry = new IsoDepth();
    const depths = new Map<string, number>();
    registry.addBox({ ...isoObjectLook("computer").footprint, id: "computer" }, (d) => depths.set("computer", d));
    const station = registry.addBox({ ...POWER_STATION_BOX, id: POWER_STATION_POINT }, (d) => depths.set("station", d));
    station.setActive(false);
    registry.addPoint((d) => depths.set("wire", d), { flat: true }).place(WIRE_AT.x, WIRE_AT.y);
    registry.addPoint((d) => depths.set("cat", d)).place(WIRE_AT.x, WIRE_AT.y);
    registry.solve();
    expect(depths.get("station")).toBeUndefined();
    expect(depths.get("wire")!).toBeGreaterThan(depths.get("computer")!);
    expect(depths.get("cat")!).toBeGreaterThan(depths.get("wire")!);
  });

  it("обрив один на всі стани: між вилкою в системному блоці й стиком зі станцією, ліворуч від станції — іскри на неї не падають", () => {
    const wire = artEntry("env/wire");
    const points = wire?.points;
    if (!points?.cut || !points.desk || !points.station) throw new Error("env/wire: точки");
    expect(points.cut.x).toBeGreaterThan(points.desk.x);
    expect(points.cut.x).toBeLessThan(points.station.x);
    expect(points.cut.y).toBeGreaterThan(points.desk.y);
    // Іскра (`fx/spark`, 42 × 42 по центру точки `cut`) — лівіше за вилку станції, що виступає за лівий кут корпусу.
    const cut = screenPoint("env/wire", "cut", WIRE_AT);
    expect(cut.x + 21).toBeLessThan(ISO.toScreen(POWER_STATION.at).x - 28);
  });

  it("сценарій «Без світла, перегризений дріт» (`outage-wire`): дріт у гнізді станції перегризено, іскрить, смуга лагодження — над обривом, як звичайного дня", () => {
    const state = scenario("outage-wire");
    expect(decorLook(state, state.minute).station).toBe(true);
    expect(wireState(state)).toBe("station-chewed");
    expect(sparking(state)).toBe(true);
    expect(actionBar(state)?.target).toBe("computer");
    const day = scenario("wire-fix");
    expect(wireState(day)).toBe("chewed");
    expect(actionBar(day)?.target).toBe("computer");
    // Смуга лагодження й місце персонажа не залежать від дня: обрив той самий (`cut`).
    expect(actionBarPoint("computer", { anchor: () => null })).toEqual(wireBarAnchor());
    const cut = screenPoint("env/wire", "cut", WIRE_AT);
    expect(Math.abs(wireBarAnchor().x - cut.x)).toBeLessThan(0.5);
  });
});
