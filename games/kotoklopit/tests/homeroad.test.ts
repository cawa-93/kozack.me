// Дорога додому (§8.5, рішення автора 2026-11-02; `src/view/homeroad.ts`): коротка катсцена без керування — камера рухається
// вниз, машина персонажа, швидша за камеру, в'їжджає в кадр згори, обганяє камеру й виїжджає за нижній край; тривалість,
// пропуск натисканням і попутні машини. Без Phaser.

import { describe, expect, it } from "vitest";

import { RACE } from "../src/sim/config";
import { artEntry } from "../src/view/art/manifest";
import { CAR_REACH, canSkipHomeRoad, carReach, HOME_ROAD, homeRoadFrame } from "../src/view/homeroad";
import { raceScale, TRAFFIC_COLORS, TRAFFIC_KINDS } from "../src/view/racelook";

/** Висоти кадру: 720 (десктоп 16:9 і телефон набік — ширший кадр тієї самої висоти) і вищий кадр (вузьке вікно). */
const HEIGHTS = [720, 960, 1920];

/** Своя машина цілком над верхнім краєм, цілком під нижнім чи хоч частиною в кадрі. */
function where(y: number, height: number): "above" | "below" | "in" {
  const reach = carReach(height);
  if (y + reach <= 0) return "above";
  if (y - reach >= height) return "below";
  return "in";
}

describe("дорога додому: тривалість і пропуск", () => {
  it("коротка — близько 3 секунд (§8.5) — і скінчилася рівно тоді, не раніше", () => {
    expect(HOME_ROAD.ms).toBeGreaterThanOrEqual(2500);
    expect(HOME_ROAD.ms).toBeLessThanOrEqual(3500);
    for (const height of HEIGHTS) {
      expect(homeRoadFrame(0, height).done).toBe(false);
      expect(homeRoadFrame(HOME_ROAD.ms - 1, height).done).toBe(false);
      expect(homeRoadFrame(HOME_ROAD.ms, height).done).toBe(true);
      expect(homeRoadFrame(HOME_ROAD.ms + 1000, height).done).toBe(true);
    }
  });

  it("натискання пропускає катсцену, але не те, що закрило картку візиту (перші миті)", () => {
    expect(canSkipHomeRoad(0)).toBe(false);
    expect(canSkipHomeRoad(HOME_ROAD.skipAfter - 1)).toBe(false);
    expect(canSkipHomeRoad(HOME_ROAD.skipAfter)).toBe(true);
    expect(canSkipHomeRoad(HOME_ROAD.ms / 2)).toBe(true);
    // Пропустити можна задовго до кінця: інакше пропуск нічого не дає.
    expect(HOME_ROAD.skipAfter).toBeLessThan(HOME_ROAD.ms / 4);
  });
});

describe("дорога додому: камера й своя машина", () => {
  it("розмір машини — з арту: від pivot до найдальшого краю кадру, і на вищому полотні машина більшає разом із дорогою", () => {
    for (const id of ["race/car/player", "race/car/traffic"] as const) {
      const entry = artEntry(id);
      expect(entry, id).toBeDefined();
      expect(Math.max(entry!.pivot.y, entry!.size.h - entry!.pivot.y), id).toBe(CAR_REACH);
    }
    for (const height of HEIGHTS) expect(carReach(height)).toBeCloseTo(CAR_REACH * raceScale(height));
  });

  it("камера рухається вниз рівно, з самого початку: дорога біжить угору", () => {
    for (const height of HEIGHTS) {
      expect(homeRoadFrame(0, height).camera).toBe(0);
      let previous = -1;
      for (let ms = 0; ms <= HOME_ROAD.ms; ms += 100) {
        const { camera } = homeRoadFrame(ms, height);
        expect(camera).toBeGreaterThan(previous);
        previous = camera;
      }
      expect(homeRoadFrame(1000, height).camera).toBeCloseTo(HOME_ROAD.camera * height);
    }
  });

  it("машина в'їжджає в кадр згори, проходить його донизу й виїжджає за нижній край", () => {
    for (const height of HEIGHTS) {
      const seen: string[] = [];
      let previous = -Infinity;
      for (let ms = 0; ms <= HOME_ROAD.ms; ms += 10) {
        const { car } = homeRoadFrame(ms, height);
        // На екрані — лише донизу.
        expect(car).toBeGreaterThan(previous);
        previous = car;
        const at = where(car, height);
        if (seen.at(-1) !== at) seen.push(at);
      }
      expect(seen).toEqual(["above", "in", "below"]);
      // Торкається верхнього краю в `enter`, зникає за нижнім у `exit`.
      expect(homeRoadFrame(HOME_ROAD.enter, height).car + carReach(height)).toBeCloseTo(0);
      expect(homeRoadFrame(HOME_ROAD.exit, height).car - carReach(height)).toBeCloseTo(height);
    }
  });

  it("машина швидша за камеру — обганяє її: проїхане машиною на дорозі більшає швидше, ніж камерою", () => {
    for (const height of HEIGHTS) {
      const road = (ms: number): number => {
        const frame = homeRoadFrame(ms, height);
        return frame.camera + frame.car;
      };
      for (let ms = 0; ms < HOME_ROAD.ms; ms += 100) {
        const car = road(ms + 100) - road(ms);
        const camera = homeRoadFrame(ms + 100, height).camera - homeRoadFrame(ms, height).camera;
        expect(car).toBeGreaterThan(camera);
      }
    }
  });

  it("усе відбувається в межах катсцени: машина з'являється після того, як кадр проступив, і зникає до того, як він потемнів", () => {
    expect(HOME_ROAD.enter).toBeGreaterThanOrEqual(HOME_ROAD.fadeIn);
    expect(HOME_ROAD.exit).toBeLessThanOrEqual(HOME_ROAD.ms - HOME_ROAD.fadeOut);
    // Машину видно більшу частину катсцени.
    expect(HOME_ROAD.exit - HOME_ROAD.enter).toBeGreaterThan(HOME_ROAD.ms / 2);
  });

  it("кадр — функція часу: та сама мить за будь-якого кроку кадрів дає те саме", () => {
    const height = 720;
    const a = homeRoadFrame(1234, height);
    const b = homeRoadFrame(1234, height);
    expect(a).toEqual(b);
    expect(homeRoadFrame(-100, height)).toEqual(homeRoadFrame(0, height));
  });
});

describe("дорога додому: темрява", () => {
  it("кадр проступає з чорного на початку й темніє до чорного наприкінці; посередині — без темряви", () => {
    for (const height of HEIGHTS) {
      expect(homeRoadFrame(0, height).dark).toBe(1);
      expect(homeRoadFrame(HOME_ROAD.fadeIn, height).dark).toBe(0);
      expect(homeRoadFrame(HOME_ROAD.ms / 2, height).dark).toBe(0);
      expect(homeRoadFrame(HOME_ROAD.ms - HOME_ROAD.fadeOut, height).dark).toBe(0);
      expect(homeRoadFrame(HOME_ROAD.ms, height).dark).toBe(1);
      // Поки машина в кадрі, темряви немає.
      for (let ms = HOME_ROAD.enter; ms <= HOME_ROAD.exit; ms += 50) expect(homeRoadFrame(ms, height).dark).toBe(0);
    }
  });
});

describe("дорога додому: попутні машини", () => {
  it("кадр не порожній усю катсцену, і машини — лише в кадрі (з запасом на довжину)", () => {
    for (const height of HEIGHTS) {
      const reach = carReach(height);
      for (let ms = 0; ms <= HOME_ROAD.ms; ms += 50) {
        const { traffic } = homeRoadFrame(ms, height);
        expect(traffic.length, `${height}: ${ms} мс`).toBeGreaterThanOrEqual(2);
        for (const car of traffic) {
          expect(car.y).toBeGreaterThan(-reach);
          expect(car.y).toBeLessThan(height + reach);
        }
      }
    }
  });

  it("повільніші за камеру й за свою машину: на екрані пливуть угору", () => {
    expect(HOME_ROAD.traffic).toBeGreaterThan(0);
    expect(HOME_ROAD.traffic).toBeLessThan(HOME_ROAD.camera);
    const height = 720;
    const first = homeRoadFrame(500, height).traffic[0]!;
    const later = homeRoadFrame(600, height).traffic.find((car) => car.lane === first.lane && Math.abs(car.y - first.y) < 100)!;
    expect(later.y).toBeLessThan(first.y);
  });

  it("у крайніх смугах дороги, а своя машина — у середній: ні в кого не впирається", () => {
    expect(HOME_ROAD.lane).toBeGreaterThanOrEqual(0);
    expect(HOME_ROAD.lane).toBeLessThan(RACE.lanes);
    for (let ms = 0; ms <= HOME_ROAD.ms; ms += 50) {
      for (const car of homeRoadFrame(ms, 720).traffic) {
        expect(car.lane).toBeGreaterThanOrEqual(0);
        expect(car.lane).toBeLessThan(RACE.lanes);
        expect(car.lane).not.toBe(HOME_ROAD.lane);
      }
    }
  });

  it("вигляд машин — з видів і кольорів потоку гонки, різний, і в тієї самої машини не змінюється", () => {
    const looks = new Map<string, string>();
    const kinds = new Set<string>();
    const colors = new Set<number>();
    for (let ms = 0; ms <= HOME_ROAD.ms; ms += 50) {
      for (const car of homeRoadFrame(ms, 720).traffic) {
        expect(TRAFFIC_KINDS).toContain(car.look.kind);
        expect(car.look.color).toBeGreaterThanOrEqual(0);
        expect(car.look.color).toBeLessThan(TRAFFIC_COLORS.length);
        kinds.add(car.look.kind);
        colors.add(car.look.color);
        // Та сама машина (смуга й місце на дорозі) — той самий вигляд.
        const key = `${car.lane}:${Math.round(car.y + (HOME_ROAD.camera - HOME_ROAD.traffic) * 720 * (ms / 1000))}`;
        const look = `${car.look.kind}/${car.look.color}`;
        expect(looks.get(key) ?? look).toBe(look);
        looks.set(key, look);
      }
    }
    expect(kinds.size).toBeGreaterThan(1);
    expect(colors.size).toBeGreaterThan(2);
  });
});
