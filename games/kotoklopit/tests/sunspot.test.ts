// Сонячна пляма для сну й намальовані смуги сонця (§8.9). Сим не знає вигляду, тож збіг перевіряє цей тест: бере обидві сторони.
// Упав після зміни вікон, `SUN` чи `DAYLIGHT` — перепиши `SUN_SPOTS`: кіт має лежати у видимій смузі.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { decide, sunSpot, tickCats } from "../src/sim/catai";
import { tileOf } from "../src/sim/catmove";
import { MINUTES_PER_DAY, SUN_SPOTS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { hiddenTile, isFixedSolid, isWall, OBJECTS, roomAt } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Vec } from "../src/sim/types";
import { PANES } from "../src/view/decor";
import { daylight } from "../src/view/light/daylight";
import { sunStrips, type SunStrip } from "../src/view/light/sunstrips";
import { hours } from "./helpers";

/** Смуга тьмяніша за це — лише відблиск: кота на ній не видно на сонці. */
const VISIBLE_STRENGTH = 0.5;
/** Найбільший y точки в спальні, за якого кіт ще не під передньою стіною. */
const BEDROOM_FRONT = 3.6;

/**
 * Клубок сплячого кота на підлозі, клітинки від його точки: малюється вгору від неї на ≈ 14 одиниць арту (−0,22 по обох осях) і
 * завширшки ±28 уздовж горизонталі екрана (±0,22 у різні боки). Точка лише на краю смуги лишала сам клубок поруч із нею.
 */
const BALL: readonly Vec[] = [
  { x: -0.22, y: -0.22 },
  { x: 0, y: -0.44 },
  { x: -0.44, y: 0 },
];

const stripsAt = (minute: number, power = true): SunStrip[] => {
  const sun = daylight(minute, power)?.sun ?? null;
  return PANES.flatMap((pane) => sunStrips(pane, sun));
};

/** Точка всередині опуклого многокутника: з одного боку від усіх його країв. */
function inside(points: readonly Vec[], p: Vec): boolean {
  let side = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    if (side !== 0 && Math.sign(cross) !== side) return false;
    side = Math.sign(cross);
  }
  return true;
}

/** Опукла оболонка: уся пляма разом із тінями рами між шибками. */
function hull(points: readonly Vec[]): Vec[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (from: readonly Vec[]): Vec[] => {
    const out: Vec[] = [];
    for (const p of from) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Кожні пів хвилини доби. */
const MINUTES = Array.from({ length: MINUTES_PER_DAY * 2 }, (_, i) => i / 2);

describe("сонячна пляма лежить у смугах сонця (§8.9)", () => {
  it("у всі години, коли пляма є, її точка — у смузі цієї години", () => {
    for (const minute of MINUTES) {
      const spot = sunSpot(minute);
      if (spot) expect(stripsAt(minute).some((s) => inside(s.points, spot)), `хвилина ${minute}`).toBe(true);
    }
  });

  it("і весь клубок кота на екрані лежить у плямі, а не поруч із нею", () => {
    for (const minute of MINUTES) {
      const spot = sunSpot(minute);
      if (!spot) continue;
      const room = roomAt(spot);
      const patch = hull(
        PANES.filter((pane) => pane.room === room)
          .flatMap((pane) => sunStrips(pane, daylight(minute, true)?.sun ?? null))
          .flatMap((s) => [...s.points]),
      );
      for (const part of BALL) expect(inside(patch, { x: spot.x + part.x, y: spot.y + part.y }), `хвилина ${minute}`).toBe(true);
    }
  });

  it("смуг немає — плями теж: удень, уночі й на межах ранку й вечора", () => {
    let dark = 0;
    for (const minute of MINUTES) {
      if (stripsAt(minute).length > 0) continue;
      dark++;
      expect(sunSpot(minute), `хвилина ${minute}`).toBeNull();
    }
    expect(dark).toBeGreaterThan(MINUTES_PER_DAY);
    for (const hour of [0, 3, 10, 12, 15, 17, 21, 23]) expect(sunSpot(hours(hour))).toBeNull();
  });

  it("смуга яскрава: кіт лежить на видному сонці, а не в останньому відблиску", () => {
    for (const minute of MINUTES) {
      if (!sunSpot(minute)) continue;
      expect(daylight(minute, true)?.sun?.strength, `хвилина ${minute}`).toBeGreaterThanOrEqual(VISIBLE_STRENGTH);
    }
  });

  it("пляма є і вранці, і ввечері: вранці в спальні, увечері у вітальні", () => {
    const rooms = (from: number, to: number): Set<string | null> =>
      new Set(
        MINUTES.filter((m) => m >= from && m < to).flatMap((m) => {
          const spot = sunSpot(m);
          return spot ? [roomAt(spot)] : [];
        }),
      );
    expect(rooms(hours(5), hours(10))).toEqual(new Set(["bedroom"]));
    expect(rooms(hours(17), hours(21))).toEqual(new Set(["living"]));
  });

  it("точка — на відкритій підлозі: не стіна, не меблі, не сховане за передньою стіною", () => {
    for (const spot of SUN_SPOTS) {
      const { x, y } = tileOf(spot);
      expect(isWall(x, y), `${x},${y}`).toBe(false);
      expect(isFixedSolid(x, y), `${x},${y}`).toBe(false);
      expect(hiddenTile(x, y), `${x},${y}`).toBe(false);
      expect(OBJECTS.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h), `${x},${y}`).toBe(false);
      // Ближче кіт уже за передньою стіною спальні: вона стає напівпрозорою, а смугу там закриває.
      if (roomAt(spot) === "bedroom") expect(spot.y, `${x},${y}`).toBeLessThanOrEqual(BEDROOM_FRONT);
    }
  });

  it("сова після півночі: хвилина більша за добу дає те саме", () => {
    for (const minute of [hours(6.5), hours(8.2), hours(19)]) expect(sunSpot(minute + MINUTES_PER_DAY)).toEqual(sunSpot(minute));
  });

  it("смуги не залежать від електрики: у день відключення пляма на тому самому сонці", () => {
    for (const minute of MINUTES) expect(stripsAt(minute, false)).toEqual(stripsAt(minute, true));
  });

  for (const [name, minute, start] of [
    ["вранці", hours(7.5), { x: 2.5, y: 3.5 }],
    ["увечері", hours(19), { x: 6.5, y: 8.5 }],
  ] as const) {
    it(`кіт ${name} доходить і лягає саме в смугу`, () => {
      const spot = sunSpot(minute);
      if (!spot) throw new Error("немає плями");
      for (let seed = 0; seed < 300; seed++) {
        const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
        const state = save.current;
        state.modifiers.day = null;
        state.minute = minute;
        const cat = createCat(state, createRng(1), { source: "shelter", ageWeeks: 20, at: start });
        cat.arrivedDay = -10;
        addCat(state, cat);
        cat.needs.fatigue = 100;
        decide(state, cat, createRng(seed), { present: true });
        const tile = tileOf(spot);
        if (cat.act.goal?.x !== tile.x || cat.act.goal.y !== tile.y) continue;
        for (let i = 0; i < 40 && cat.act.goal !== null; i++) tickCats(state, 0.1, { present: true });
        expect(cat.act).toMatchObject({ kind: "sleep", goal: null });
        expect({ x: cat.x, y: cat.y }).toEqual(sunSpot(state.minute));
        expect(stripsAt(state.minute).some((s) => inside(s.points, cat))).toBe(true);
        return;
      }
      throw new Error("кіт жодного разу не обрав сонячну пляму");
    });
  }
});
