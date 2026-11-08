// «Куди поїхати?» — паперова мапа міста (GAME_DESIGN §8.5 «Оформлення поїздок»): шпильки не налазять одна на одну, на дім і на
// чужі дороги, усе в межах мапи, і що довша дорога, то далі шпилька від дому (`src/ui/tripmap.ts`).

import { describe, expect, it } from "vitest";

import { MODIFIERS, TRIPS } from "../src/sim/config";
import type { Destination } from "../src/sim/types";
import { homeBox, pinWidth, TRIP_MAP, tripMapLayout, type MapBox, type MapPin } from "../src/ui/tripmap";
import { DESTINATION_TITLES } from "../src/ui/titles";

const destinations = Object.keys(TRIPS) as Destination[];
/** Дороги так, як їх рахує `roadMinutes`: звичайний день, «Затори» й «Порожні дороги». */
const days = [1, ...Object.values(MODIFIERS.road)].map((factor) => ({
  factor,
  roads: Object.fromEntries(destinations.map((d) => [d, Math.round(TRIPS[d].road * factor)])) as Record<Destination, number>,
}));

/** Зазор між прямокутниками; від'ємний — перекриваються. */
function boxGap(a: MapBox, b: MapBox): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy);
}

/** Від точки до прямокутника; усередині — 0. */
function pointGap(x: number, y: number, b: MapBox): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
}

/** Від відрізка до прямокутника (з кроком у соту частку відрізка); перетинає — 0. */
function segmentGap(from: { x: number; y: number }, to: { x: number; y: number }, b: MapBox): number {
  let gap = Infinity;
  for (let i = 0; i <= 100; i++) gap = Math.min(gap, pointGap(from.x + ((to.x - from.x) * i) / 100, from.y + ((to.y - from.y) * i) / 100, b));
  return gap;
}

/** Табличка з назвою — шпилька без голівки: дорога підходить до голівки з боку дому й під табличку не заходить. */
function labelBox(pin: MapPin): MapBox {
  const { inset, head, tuck } = TRIP_MAP.pin;
  const off = inset + head - tuck;
  return pin.side === "east" ? { ...pin.box, x0: pin.box.x0 + off } : { ...pin.box, x1: pin.box.x1 - off };
}

const home = { x: TRIP_MAP.home.x, y: TRIP_MAP.home.y };

describe("мапа «Куди поїхати?» (§8.5 «Оформлення поїздок»)", () => {
  it("усі вісім шпильок — у межах мапи, не налазять одна на одну й на дім", () => {
    for (const { factor, roads } of days) {
      const layout = tripMapLayout(roads);
      expect(Object.keys(layout).sort(), `×${factor}`).toEqual([...destinations].sort());
      for (const d of destinations) {
        const { box } = layout[d];
        expect(box.x0, `${d} ×${factor}`).toBeGreaterThanOrEqual(TRIP_MAP.edge);
        expect(box.y0, `${d} ×${factor}`).toBeGreaterThanOrEqual(TRIP_MAP.edge);
        expect(box.x1, `${d} ×${factor}`).toBeLessThanOrEqual(100 - TRIP_MAP.edge);
        expect(box.y1, `${d} ×${factor}`).toBeLessThanOrEqual(TRIP_MAP.height - TRIP_MAP.edge);
        expect(boxGap(box, homeBox()), `${d} і дім ×${factor}`).toBeGreaterThanOrEqual(TRIP_MAP.gap);
        for (const other of destinations) {
          if (other <= d) continue;
          expect(boxGap(box, layout[other].box), `${d} і ${other} ×${factor}`).toBeGreaterThanOrEqual(TRIP_MAP.gap);
        }
      }
    }
  });

  it("що довша дорога, то далі шпилька від дому; однакові дороги — однаково далеко", () => {
    for (const { factor, roads } of days) {
      const layout = tripMapLayout(roads);
      for (const a of destinations) {
        const far = Math.hypot(layout[a].x - home.x, layout[a].y - home.y);
        expect(far, `${a} ×${factor}`).toBeCloseTo(layout[a].road.length, 9);
        expect(far, a).toBeGreaterThanOrEqual(TRIP_MAP.near - 1e-9);
        expect(far, a).toBeLessThanOrEqual(TRIP_MAP.far + 1e-9);
        for (const b of destinations) {
          if (roads[a] < roads[b]) expect(layout[a].road.length, `${a} ближче за ${b} ×${factor}`).toBeLessThan(layout[b].road.length);
          if (roads[a] === roads[b]) expect(layout[a].road.length, `${a} і ${b} ×${factor}`).toBeCloseTo(layout[b].road.length, 9);
        }
      }
    }
  });

  it("подія дня змінює всі дороги однаково — мапа та сама", () => {
    const [plain, ...others] = days.map(({ roads }) => tripMapLayout(roads));
    for (const layout of others)
      for (const d of destinations) {
        expect(layout[d].x, d).toBeCloseTo(plain?.[d].x ?? NaN, 0);
        expect(layout[d].y, d).toBeCloseTo(plain?.[d].y ?? NaN, 0);
      }
  });

  it("дорога від дому не йде ні під чужою шпилькою, ні під своєю табличкою, і дороги не зливаються", () => {
    const layout = tripMapLayout(days[0]?.roads ?? ({} as Record<Destination, number>));
    for (const d of destinations) {
      const pin = layout[d];
      expect(segmentGap(home, pin, labelBox(pin)), `${d}: своя табличка`).toBeGreaterThanOrEqual(0.5);
      for (const other of destinations) if (other !== d) expect(segmentGap(home, pin, layout[other].box), `${d} під ${other}`).toBeGreaterThanOrEqual(0.8);
      // Табличка — від дому: дорога з того боку, де голівка.
      expect(pin.side === "east" ? pin.x >= home.x - 1e-9 : pin.x <= home.x + 1e-9, `${d}: табличка від дому`).toBe(true);
    }
    const angles = destinations.map((d) => (layout[d].road.angle + 360) % 360).sort((a, b) => a - b);
    angles.forEach((angle, i) => {
      const next = angles[(i + 1) % angles.length] ?? angle;
      expect((next - angle + 360) % 360, `кут між дорогами біля ${angle}°`).toBeGreaterThanOrEqual(25);
    });
  });

  it("ширина шпильки — з запасом на найдовшу назву й найдовший рядок часу", () => {
    for (const d of destinations) {
      const { name, time, chrome } = TRIP_MAP.pin;
      expect(pinWidth(d) - chrome, d).toBeGreaterThanOrEqual(DESTINATION_TITLES[d].length * 0.5 * name);
      expect(pinWidth(d) - chrome, d).toBeGreaterThanOrEqual(7.1 * time);
    }
  });
});
