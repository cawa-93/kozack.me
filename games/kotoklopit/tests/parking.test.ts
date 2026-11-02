// Кадр парковки (§8.5 «На місці — кадр парковки», рішення автора 2026-11-02; `src/view/parking.ts`): кінець гонки з парковкою
// попереду, прибуття без керування, нерухомий кадр на місці, від'їзд у дорогу додому й де парковка стоїть поруч із карткою.
// Без Phaser.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { RACE, TRIPS } from "../src/sim/config";
import { tripCat } from "../src/sim/destinations";
import { goHome } from "../src/sim/game";
import { newRace } from "../src/sim/race";
import { createRng, type Rng } from "../src/sim/rng";
import { gameMinutes } from "../src/sim/time";
import { HOME_DOOR } from "../src/sim/trips";
import type { Race, Save } from "../src/sim/types";
import { asideCardRight } from "../src/ui/cardsize";
import { LOT_AHEAD, RACE_BUILDING, RACE_LOT } from "../src/view/art/manifest/a14-race";
import { carReach, HOME_ROAD, homeRoadFrame } from "../src/view/homeroad";
import {
  arrivalFrame,
  arrivalMs,
  arrivalStart,
  CAR_BODY,
  carsOverlap,
  departureFrame,
  DEPARTURE,
  LOT_BOUNDS,
  lotCars,
  lotInFrame,
  lotScreenY,
  ownSlot,
  parkedFrame,
  PARKING,
  parkingLayout,
  parkingSpot,
  raceBarAlpha,
  ROAD_UNIT,
  type ArrivalStart,
  type CarBox,
  type ParkingAnimationFrame,
  type ParkingCar,
  type ParkingFrame,
  type ParkingSpot,
} from "../src/view/parking";
import { laneX, RACE_PLAYER_Y, racePixelsPerUnit, raceScale, steerTilt, TRAFFIC_COLORS, TRAFFIC_KINDS } from "../src/view/racelook";
import { canvasFit } from "../src/view/zoom";
import { driveSafely } from "./helpers";

/** Висоти кадру: 720 (десктоп і телефон набік) і вищі (вузьке вікно). */
const HEIGHTS = [720, 960, 1440];
/** Швидкості гонки в мить фінішу: від ледь-ледь до найбільшої. */
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 6, 10];
const ROAD = 60;

/** Гонка в мить фінішу. */
function finishedRace(speed: number, lane = 1, targetLane = lane, cars: Race["cars"] = []): Race {
  const race = newRace(ROAD, 7);
  race.done = ROAD;
  race.speed = speed;
  race.lane = lane;
  race.targetLane = targetLane;
  race.cars = cars;
  return race;
}

function startAt(speed: number, options: { lane?: number; targetLane?: number; seed?: number; session?: number; cars?: Race["cars"] } = {}): ArrivalStart {
  return arrivalStart(finishedRace(speed, options.lane ?? 1, options.targetLane ?? options.lane ?? 1, options.cars ?? []), options.seed ?? 3, options.session ?? 1);
}

/** Кадр без `done`: кінець прибуття, кадр на місці й початок від'їзду порівнюються як кадри. */
function still(frame: ParkingAnimationFrame): ParkingFrame {
  const { done: _done, ...rest } = frame;
  return rest;
}

/** Кузов машини кадру в одиницях арту (x від середини дороги, y від верху кадру). */
const own = (frame: ParkingFrame, k: number): CarBox => ({ x: frame.car.x / k, y: frame.car.y / k, rotation: frame.car.rotation, ...CAR_BODY.player });
const other = (car: ParkingCar, k: number): CarBox => ({ x: car.x / k, y: car.y / k, rotation: car.rotation, ...CAR_BODY[car.look.kind] });

/** Кути кузова. */
function corners(box: CarBox): { x: number; y: number }[] {
  const right = { x: Math.cos(box.rotation), y: Math.sin(box.rotation) };
  const ahead = { x: Math.sin(box.rotation), y: -Math.cos(box.rotation) };
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([a = 0, b = 0]) => ({
    x: box.x + (a * box.w * right.x) / 2 + (b * box.h * ahead.x) / 2,
    y: box.y + (a * box.w * right.y) / 2 + (b * box.h * ahead.y) / 2,
  }));
}

/** Своя машина цілком під нижнім краєм кадру. */
const below = (frame: ParkingFrame, height: number): boolean => frame.car.y - carReach(height) >= height;

describe("кінець гонки: парковка попереду", () => {
  it("стоїть за фінішем: з'являється згори ще в гонці й їде донизу разом із дорогою", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      const ppu = racePixelsPerUnit(height);
      expect(lotScreenY(ROAD, ROAD, height)).toBeCloseTo(height * RACE_PLAYER_Y - LOT_AHEAD * k);
      expect(lotInFrame(lotScreenY(ROAD - 3, ROAD, height), height)).toBe(false);
      expect(lotInFrame(lotScreenY(ROAD, ROAD, height), height)).toBe(true);
      // Їде донизу разом із дорогою: на стільки ж px, на скільки зсувається дорога.
      expect(lotScreenY(ROAD - 1, ROAD, height) - lotScreenY(ROAD - 1.5, ROAD, height)).toBeCloseTo(0.5 * ppu);
      // З'являється ще в гонці, а не на фініші.
      let first = ROAD;
      for (let done = ROAD - 3; done <= ROAD; done += 0.01) {
        if (lotInFrame(lotScreenY(done, ROAD, height), height)) {
          first = done;
          break;
        }
      }
      expect(first).toBeLessThan(ROAD - 0.5);
    }
  });

  it("в останньому кадрі гонки видно табличку на даху, а парковку — над своєю машиною", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      const lot = lotScreenY(ROAD, ROAD, height);
      const sign = lot + (RACE_BUILDING.pivotAt.y - RACE_BUILDING.pivot.y + RACE_BUILDING.sign.y) * k;
      expect(sign - (RACE_BUILDING.sign.size / 2) * k).toBeGreaterThan(0);
      expect(lot + LOT_BOUNDS.bottom * k).toBeLessThan(height * RACE_PLAYER_Y - carReach(height));
    }
  });

  it("смуга прогресу згасає, поки парковка в'їжджає в кадр, і до фінішу її вже немає", () => {
    for (const height of HEIGHTS) {
      expect(raceBarAlpha(lotScreenY(ROAD - 3, ROAD, height), height)).toBe(1);
      expect(raceBarAlpha(lotScreenY(ROAD, ROAD, height), height)).toBe(0);
      let previous = 1;
      let seen = false;
      for (let done = ROAD - 3; done <= ROAD; done += 0.01) {
        const lot = lotScreenY(done, ROAD, height);
        const alpha = raceBarAlpha(lot, height);
        expect(alpha).toBeLessThanOrEqual(previous);
        previous = alpha;
        // Поки парковки не видно, смуга ціла.
        if (!seen && lotInFrame(lot, height)) {
          seen = true;
          expect(alpha).toBeGreaterThan(0.99);
        }
        if (!lotInFrame(lot, height)) expect(alpha).toBe(1);
      }
    }
  });
});

describe("прибуття: рух", () => {
  it("триває 1–2,5 с: що швидше машина доїхала, то коротше", () => {
    let previous = Infinity;
    for (const speed of [0, ...SPEEDS]) {
      const ms = arrivalMs(startAt(speed));
      expect(ms).toBeGreaterThanOrEqual(PARKING.arrivalMin);
      expect(ms).toBeLessThanOrEqual(PARKING.arrivalMax);
      expect(ms).toBeLessThan(previous);
      previous = ms;
    }
    expect(arrivalMs(startAt(0))).toBe(PARKING.arrivalMax);
    expect(arrivalMs(startAt(10))).toBeLessThan(1200);
  });

  it("на ms = 0 — кадр гонки в мить фінішу: зсув дороги, своя машина з нахилом перестроювання, потік", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      const ppu = racePixelsPerUnit(height);
      for (const [lane, targetLane] of [
        [1, 1],
        [0.4, 1],
        [2, 2],
        [1.7, 1],
      ] as const) {
        const start = startAt(4, { lane, targetLane, cars: [{ lane: 0, start: ROAD + 1.2 }] });
        const frame = arrivalFrame(0, height, start);
        expect(frame.offset).toBeCloseTo(ROAD * ppu, 6);
        expect(frame.lot).toBeCloseTo(lotScreenY(ROAD, ROAD, height), 6);
        expect(frame.car.x).toBeCloseTo(laneX(0, lane, k), 6);
        expect(frame.car.y).toBeCloseTo(height * RACE_PLAYER_Y, 6);
        expect(frame.car.rotation).toBeCloseTo(steerTilt(lane, targetLane), 6);
        expect(frame.pan).toBe(0);
        expect(frame.dark).toBe(0);
        expect(frame.done).toBe(false);
        expect(frame.traffic).toHaveLength(1);
        expect(frame.traffic[0]?.x).toBeCloseTo(laneX(0, 0, k), 6);
        expect(frame.traffic[0]?.y).toBeCloseTo(height * RACE_PLAYER_Y - 1.2 * ppu, 6);
        expect(frame.traffic[0]?.alpha).toBe(1);
      }
    }
  });

  it("без стрибка швидкості на ms = 0 (×0,1…×10): дорога біжить зі швидкістю гонки, своя машина на екрані стоїть", () => {
    const dt = 0.5;
    for (const height of HEIGHTS) {
      const ppu = racePixelsPerUnit(height);
      for (const session of [1, 3]) {
        for (const speed of SPEEDS) {
          const start = startAt(speed, { lane: 2, session });
          const v0 = speed * ppu * gameMinutes(1) * session;
          const a = arrivalFrame(0, height, start);
          const b = arrivalFrame(dt, height, start);
          const road = ((b.offset - a.offset) / dt) * 1000;
          expect(Math.abs(road - v0), `×${speed}, сесія ×${session}, ${height}`).toBeLessThan(v0 * 0.01 + 0.5);
          // Своя машина в гонці стоїть на екрані — і в першу мить прибуття теж.
          const car = (Math.abs(b.car.y - a.car.y) / dt) * 1000;
          expect(car, `×${speed}, сесія ×${session}, ${height}`).toBeLessThan(v0 * 0.01 + 0.5);
        }
      }
    }
  });

  it("без перельоту: дорога лише біжить донизу, машина лише їде вперед і стає саме на своє місце носом угору", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const speed of SPEEDS) {
        for (const seed of [1, 2, 3, 4, 5]) {
          for (const lane of [0, 1, 2]) {
            const start = startAt(speed, { lane, seed });
            const ms = arrivalMs(start);
            let offset = -Infinity;
            let ahead = Infinity;
            for (let t = 0; t <= ms; t += 5) {
              const frame = arrivalFrame(t, height, start);
              expect(frame.offset).toBeGreaterThanOrEqual(offset - 1e-9);
              offset = frame.offset;
              // Y машини в рамці парковки: лише вперед (угору).
              const y = (frame.car.y - frame.lot) / k;
              expect(y).toBeLessThanOrEqual(ahead + 1e-6);
              ahead = y;
            }
            const end = arrivalFrame(ms, height, start);
            const slot = RACE_LOT.slots[ownSlot(seed)];
            expect(end.car.x).toBeCloseTo((slot?.x ?? 0) * k, 6);
            expect(end.car.y).toBeCloseTo(end.lot + (slot?.y ?? 0) * k, 6);
            expect(end.car.rotation).toBe(0);
          }
        }
      }
    }
  });

  it("машина перестроюється праворуч і звертає на з'їзд: перетинає бордюр лише в межах з'їзду, по проїзду їде праворуч", () => {
    const height = 720;
    for (const seed of [1, 2, 3, 4]) {
      for (const lane of [0, 1, 2]) {
        const start = startAt(2, { lane, seed });
        const ms = arrivalMs(start);
        let turned = false;
        for (let t = 0; t <= ms; t += 2) {
          const frame = arrivalFrame(t, height, start);
          const x = frame.car.x;
          const y = frame.car.y - frame.lot;
          // Середина машини над бордюром — лише навпроти з'їзду.
          if (x > RACE_LOT.driveway.left && x < RACE_LOT.driveway.right) {
            expect(y).toBeGreaterThan(RACE_LOT.driveway.top);
            expect(y).toBeLessThan(RACE_LOT.driveway.bottom);
            turned = true;
          }
          // За бордюром — лише на майданчику.
          if (x >= RACE_LOT.driveway.right) {
            expect(x).toBeLessThan(RACE_LOT.area.right);
            expect(y).toBeGreaterThan(RACE_LOT.area.top);
            expect(y).toBeLessThan(RACE_LOT.area.bottom);
          }
        }
        expect(turned).toBe(true);
      }
    }
  });

  it("кінець прибуття — кадр на місці, і перед ним кадр уже майже такий самий", () => {
    for (const height of HEIGHTS) {
      for (const speed of SPEEDS) {
        const start = startAt(speed, { lane: 0, seed: 11, cars: [{ lane: 1, start: ROAD + 0.8 }] });
        const ms = arrivalMs(start);
        const parked = parkedFrame(height, start);
        expect(arrivalFrame(ms, height, start)).toEqual({ ...parked, done: true });
        expect(arrivalFrame(ms + 1000, height, start)).toEqual({ ...parked, done: true });
        const before = arrivalFrame(ms - 1, height, start);
        expect(before.done).toBe(false);
        expect(before.offset).toBeCloseTo(parked.offset, 0);
        expect(before.lot).toBeCloseTo(parked.lot, 0);
        expect(before.car.x).toBeCloseTo(parked.car.x, 0);
        expect(before.car.y).toBeCloseTo(parked.car.y, 0);
        expect(before.car.rotation).toBeCloseTo(0, 2);
        expect(before.pan).toBeCloseTo(1, 3);
        // Машини потоку на ту мить уже згасли: на місці дорога порожня.
        for (const car of before.traffic) expect(car.alpha).toBeLessThan(0.01);
      }
    }
  });

  it("і на прибутті, і на від'їзді машина з дороги на майданчик — лише через з'їзд, а на майданчику вся на асфальті", () => {
    const height = 960;
    const k = raceScale(height);
    for (let seed = 0; seed < 40; seed++) {
      const start = startAt(SPEEDS[seed % SPEEDS.length] ?? 1, { lane: seed % RACE.lanes, seed });
      const frames: ParkingFrame[] = [];
      for (let t = 0; t <= arrivalMs(start); t += 5) frames.push(arrivalFrame(t, height, start));
      for (let t = 0; t <= DEPARTURE.ms; t += 5) frames.push(departureFrame(t, height, start));
      for (const frame of frames) {
        const box = own(frame, k);
        const x = box.x;
        const y = box.y - frame.lot / k;
        if (x > RACE_LOT.driveway.left && x < RACE_LOT.driveway.right) {
          expect(y, `зерно ${seed}`).toBeGreaterThan(RACE_LOT.driveway.top);
          expect(y, `зерно ${seed}`).toBeLessThan(RACE_LOT.driveway.bottom);
        }
        if (x >= RACE_LOT.area.left) {
          for (const corner of corners(box)) {
            expect(corner.x, `зерно ${seed}`).toBeLessThanOrEqual(RACE_LOT.area.right);
            expect(corner.y - frame.lot / k, `зерно ${seed}`).toBeGreaterThanOrEqual(RACE_LOT.area.top);
            expect(corner.y - frame.lot / k, `зерно ${seed}`).toBeLessThanOrEqual(RACE_LOT.area.bottom);
          }
        }
      }
    }
  });

  it("кадр — функція часу: ті самі миті з різним кроком кадрів, з іншим знімком того самого фінішу — те саме", () => {
    const cars = [
      { lane: 0, start: ROAD + 0.5 },
      { lane: 2, start: ROAD + 1.4 },
      { lane: 2, start: ROAD - 0.6 },
    ];
    const start = startAt(3, { lane: 1, cars });
    const ms = arrivalMs(start);
    const coarse = new Map<number, ParkingAnimationFrame>();
    for (let t = 0; t <= ms; t += 16) coarse.set(t, arrivalFrame(t, 720, start));
    for (let t = 0; t <= ms; t += 7) {
      const frame = arrivalFrame(t, 720, start);
      if (coarse.has(t)) expect(frame).toEqual(coarse.get(t));
    }
    const again = startAt(3, { lane: 1, cars: structuredClone(cars) });
    for (const t of [0, 112, 448, ms - 1, ms]) expect(arrivalFrame(t, 720, again)).toEqual(arrivalFrame(t, 720, start));
    expect(arrivalFrame(-100, 720, start)).toEqual(arrivalFrame(0, 720, start));
  });
});

describe("прибуття: потік", () => {
  it("машини, що не на шляху, їдуть далі своєю швидкістю й згасають лише наприкінці: на місці дорога порожня", () => {
    const height = 720;
    const k = raceScale(height);
    for (const speed of SPEEDS) {
      const start = startAt(speed, { lane: 2, cars: [{ lane: 0, start: ROAD + 1.5 }] });
      const ms = arrivalMs(start);
      const perSecond = RACE.carSpeed * gameMinutes(1) * ROAD_UNIT;
      for (let t = 0; t < ms - PARKING.vanishMs; t += 20) {
        const frame = arrivalFrame(t, height, start);
        const car = frame.traffic[0];
        expect(car, `×${speed}: ${t} мс`).toBeDefined();
        expect(car?.alpha).toBe(1);
        // Своєю швидкістю: відносно парковки — угору на швидкість потоку.
        const y = ((car?.y ?? 0) - frame.lot) / k;
        expect(y).toBeCloseTo(LOT_AHEAD - 1.5 * ROAD_UNIT - (perSecond * t) / 1000, 6);
      }
      expect(arrivalFrame(ms, height, start).traffic).toEqual([]);
    }
  });

  it("машини на шляху своєї чи ті, що наздогнали б її, згасають до зустрічі: кузови не накладаються", () => {
    const rng = createRng(2026);
    let faded = 0;
    let kept = 0;
    for (let n = 0; n < 160; n++) {
      const start = randomStart(rng);
      const ms = arrivalMs(start);
      for (const height of [720, 1440]) {
        const k = raceScale(height);
        for (let t = 0; t <= ms; t += 4) {
          const frame = arrivalFrame(t, height, start);
          for (const car of frame.traffic) {
            if (car.alpha <= 0) continue;
            expect(carsOverlap(own(frame, k), other(car, k)), `спроба ${n}, ${t} мс`).toBe(false);
            if (t > 0 && car.alpha < 1) faded++;
            if (t > ms / 2 && car.alpha === 1) kept++;
          }
        }
        expect(arrivalFrame(ms, height, start).traffic).toEqual([]);
      }
    }
    // Обидва випадки трапляються: одні машини згасають, інші ще їдуть.
    expect(faded).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it("машина позаду в своїй смузі, що наздогнала б свою, згасає ще до кінця прибуття, а машина збоку на її шляху — до зустрічі", () => {
    // Своя ледь котиться, а гра прискорена (×4): потік утричі швидший за неї, і машина позаду наздоганяє.
    const behind = startAt(0.1, { lane: 2, session: 4, cars: [{ lane: 2, start: ROAD - 0.4 }] });
    // Своя з лівої смуги перестроюється праворуч, а поруч у середній — машина.
    const beside = startAt(1, { lane: 0, cars: [{ lane: 1, start: ROAD }] });
    for (const start of [behind, beside]) {
      const ms = arrivalMs(start);
      let gone = -1;
      let previous = 1;
      for (let t = 0; t <= ms; t += 5) {
        const car = arrivalFrame(t, 720, start).traffic[0];
        expect(car?.alpha ?? 0).toBeLessThanOrEqual(previous);
        previous = car?.alpha ?? 0;
        if (gone < 0 && !car) gone = t;
      }
      expect(gone).toBeGreaterThan(0);
      expect(gone).toBeLessThan(ms - PARKING.vanishMs);
    }
  });

  it("машини позаду за нижнім краєм кадру не з'являються", () => {
    const start = startAt(0.25, { lane: 1, cars: [{ lane: 0, start: ROAD - 0.97 }] });
    const ms = arrivalMs(start);
    for (let t = 0; t <= ms; t += 10) expect(arrivalFrame(t, 720, start).traffic).toEqual([]);
  });
});

/** Знімок фінішу з випадковим потоком, як у гонці: машини не накладаються ні на свою, ні одна на одну. */
function randomStart(rng: Rng): ArrivalStart {
  const speed = SPEEDS[rng.int(0, SPEEDS.length - 1)] ?? 1;
  let lane = rng.int(0, RACE.lanes - 1);
  let targetLane = lane;
  if (rng.chance(0.3)) {
    targetLane = Math.max(0, Math.min(RACE.lanes - 1, lane + (rng.chance(0.5) ? 1 : -1)));
    lane += (targetLane - lane) * rng.next();
  }
  const ownBox: CarBox = { x: laneX(0, lane, 1), y: 0, rotation: steerTilt(lane, targetLane), ...CAR_BODY.player };
  const cars: Race["cars"] = [];
  const boxes: CarBox[] = [ownBox];
  for (let i = 0; i < 8; i++) {
    const car = { lane: rng.int(0, RACE.lanes - 1), start: ROAD - 0.9 + rng.next() * 3.3 };
    const box: CarBox = { x: laneX(0, car.lane, 1), y: -(car.start - ROAD) * ROAD_UNIT, rotation: 0, ...CAR_BODY.van };
    if (boxes.some((b) => carsOverlap(b, box, 2))) continue;
    boxes.push(box);
    cars.push(car);
  }
  return startAt(speed, { lane, targetLane, cars, seed: rng.int(0, 1_000_000), session: rng.chance(0.2) ? 4 : 1 });
}

describe("на місці", () => {
  it("своє місце й запарковані — із зерна поїздки: ті самі після перезавантаження, різні в різних поїздках", () => {
    const owns = new Set<number>();
    const counts = new Set<number>();
    const kinds = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const spot: ParkingSpot = { done: ROAD, seed };
      expect(parkedFrame(720, spot)).toEqual(parkedFrame(720, { done: ROAD, seed }));
      const slot = ownSlot(seed);
      owns.add(slot);
      const cars = lotCars(seed);
      counts.add(cars.length);
      // «Кілька запаркованих машин» (§8.5): не менше двох — порожньою чи з однією машиною парковка не буває.
      expect(cars.length).toBeGreaterThanOrEqual(2);
      expect(cars.length).toBeLessThanOrEqual(3);
      const slots = cars.map((car) => car.slot);
      expect(slots).not.toContain(slot);
      expect(new Set(slots).size).toBe(slots.length);
      expect(new Set(cars.map((car) => car.look.color)).size).toBe(cars.length);
      for (const car of cars) {
        expect(car.slot).toBeGreaterThanOrEqual(0);
        expect(car.slot).toBeLessThan(RACE_LOT.slots.length);
        expect(TRAFFIC_KINDS).toContain(car.look.kind);
        expect(car.look.color).toBeLessThan(TRAFFIC_COLORS.length);
        kinds.add(car.look.kind);
      }
    }
    // Своє — будь-яке, крім крайнього правого (задки з нього — за майданчик); поруч 2 чи 3 машини різних видів.
    expect([...owns].sort()).toEqual([0, 1, 2]);
    expect([...counts].sort()).toEqual([2, 3]);
    expect(kinds.size).toBe(TRAFFIC_KINDS.length);
  });

  it("кадр нерухомий: дорога порожня, без темряви, світ зсунутий убік; парковка з будівлею посередині висоти кадру", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const frame = parkedFrame(height, { done: ROAD, seed });
        expect(frame.traffic).toEqual([]);
        expect(frame.dark).toBe(0);
        expect(frame.pan).toBe(1);
        expect(frame.lot + LOT_BOUNDS.top * k).toBeGreaterThan(0);
        expect(frame.lot + LOT_BOUNDS.bottom * k).toBeLessThan(height);
        expect(frame.lot + ((LOT_BOUNDS.top + LOT_BOUNDS.bottom) / 2) * k).toBeCloseTo(height / 2);
        expect(frame.car.rotation).toBe(0);
        for (const car of frame.parked) {
          expect(car.rotation).toBe(0);
          expect(carsOverlap(own(frame, k), other(car, k))).toBe(false);
        }
      }
    }
  });
});

describe("від'їзд", () => {
  it("на ms = 0 — кадр на місці, без затемнення; рушає плавно", () => {
    for (const height of HEIGHTS) {
      for (const seed of [1, 2, 3, 4]) {
        const spot = { done: ROAD, seed };
        const start = departureFrame(0, height, spot);
        expect(still(start)).toEqual(parkedFrame(height, spot));
        expect(start.done).toBe(false);
        const next = departureFrame(16, height, spot);
        expect(Math.hypot(next.car.x - start.car.x, next.car.y - start.car.y)).toBeLessThan(1);
        expect(Math.abs(next.offset - start.offset)).toBeLessThan(0.5);
        expect(next.pan).toBe(1);
      }
    }
  });

  it("задки з місця, проїздом до з'їзду, на дорогу носом донизу в середню смугу — і за нижній край", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const seed of [1, 2, 3, 4, 5]) {
        const spot = { done: ROAD, seed };
        const slot = RACE_LOT.slots[ownSlot(seed)];
        // Спершу — задки: ніс угору, машина відходить донизу.
        const early = departureFrame(DEPARTURE.reverse / 4, height, spot);
        expect(early.car.y - early.lot).toBeGreaterThan((slot?.y ?? 0) * k);
        expect(Math.abs(early.car.rotation)).toBeLessThan(0.3);
        // Виїхала задки — носом до з'їзду (ліворуч).
        const turned = departureFrame(DEPARTURE.reverse, height, spot);
        expect(turned.car.rotation).toBeCloseTo(-Math.PI / 2, 2);
        expect(turned.car.y - turned.lot).toBeCloseTo(((RACE_LOT.aisle.top + RACE_LOT.aisle.bottom) / 2) * k, 4);
        // Зникає за нижнім краєм — у середній смузі, носом донизу.
        let exit = -1;
        for (let ms = 0; ms <= DEPARTURE.ms; ms += 5) {
          const frame = departureFrame(ms, height, spot);
          if (below(frame, height)) {
            exit = ms;
            expect(frame.car.x).toBeCloseTo(laneX(0, HOME_ROAD.lane, k), 4);
            expect(Math.cos(frame.car.rotation)).toBeCloseTo(-1, 4);
            break;
          }
        }
        expect(exit).toBeGreaterThan(0);
        expect(exit).toBeLessThanOrEqual(DEPARTURE.ms - DEPARTURE.fadeOut);
      }
    }
  });

  it("камера рушає вниз, зсув убік повертається до середини, поки парковка ще в кадрі", () => {
    for (const height of HEIGHTS) {
      const spot = { done: ROAD, seed: 4 };
      let offset = Infinity;
      let pan = 1;
      let centered = -1;
      for (let ms = 0; ms <= DEPARTURE.ms; ms += 5) {
        const frame = departureFrame(ms, height, spot);
        // Дорога біжить угору — зсув лише меншає.
        expect(frame.offset).toBeLessThanOrEqual(offset + 1e-9);
        offset = frame.offset;
        expect(frame.pan).toBeLessThanOrEqual(pan);
        pan = frame.pan;
        if (centered < 0 && frame.pan === 0) {
          centered = ms;
          expect(lotInFrame(frame.lot, height)).toBe(true);
        }
      }
      expect(centered).toBeGreaterThan(0);
      // Камера йде вниз зі швидкістю дороги додому.
      const a = departureFrame(DEPARTURE.ms - 100, height, spot);
      const b = departureFrame(DEPARTURE.ms, height, spot);
      expect(((a.offset - b.offset) / 100) * 1000).toBeCloseTo(HOME_ROAD.camera * height, 3);
    }
  });

  it("своя обганяє камеру: у середній смузі вона на екрані лише їде донизу", () => {
    for (const height of HEIGHTS) {
      const spot = { done: ROAD, seed: 3 };
      let onRoad = -1;
      for (let ms = 0; ms <= DEPARTURE.ms; ms += 5) {
        const frame = departureFrame(ms, height, spot);
        if (Math.abs(frame.car.x - laneX(0, HOME_ROAD.lane, raceScale(height))) < 1e-6) {
          onRoad = ms;
          break;
        }
      }
      expect(onRoad).toBeGreaterThan(0);
      let previous = -Infinity;
      for (let ms = onRoad; ms <= DEPARTURE.ms; ms += 5) {
        const { car } = departureFrame(ms, height, spot);
        expect(car.y).toBeGreaterThan(previous);
        previous = car.y;
      }
    }
  });

  it("попутні машини дороги додому з'являються з-за нижнього краю, у крайніх смугах і з тими самими виглядами", () => {
    const homeLooks = new Set<string>();
    for (let ms = 0; ms <= HOME_ROAD.ms; ms += 10) for (const car of homeRoadFrame(ms, 720).traffic) homeLooks.add(`${car.look.kind}/${car.look.color}`);
    for (const height of HEIGHTS) {
      const spot = { done: ROAD, seed: 2 };
      let count = 0;
      let appeared = -1;
      for (let ms = 0; ms <= DEPARTURE.ms; ms += 5) {
        const frame = departureFrame(ms, height, spot);
        // На старті дорога порожня — і в правій смузі біля з'їзду нікого.
        if (ms < DEPARTURE.cameraFrom) expect(frame.traffic).toEqual([]);
        if (frame.traffic.length > count && appeared < 0) appeared = ms;
        if (frame.traffic.length > count) {
          // Нова машина — знизу.
          const newest = frame.traffic.reduce((a, b) => (b.y > a.y ? b : a));
          expect(newest.y).toBeGreaterThan(height * 0.9);
        }
        count = frame.traffic.length;
        for (const car of frame.traffic) {
          expect(car.x).not.toBeCloseTo(laneX(0, HOME_ROAD.lane, raceScale(height)), 3);
          expect(car.rotation).toBe(Math.PI);
          expect(homeLooks.has(`${car.look.kind}/${car.look.color}`)).toBe(true);
        }
      }
      // З'являються ще до темряви, і їх видно в кадрі.
      expect(appeared).toBeGreaterThan(0);
      expect(appeared).toBeLessThan(DEPARTURE.ms - DEPARTURE.fadeOut);
      expect(departureFrame(DEPARTURE.ms - DEPARTURE.fadeOut, height, spot).traffic.length).toBeGreaterThan(0);
    }
  });

  it("темніє лише наприкінці, як дорога додому, і тоді `done`", () => {
    for (const height of HEIGHTS) {
      const spot = { done: ROAD, seed: 5 };
      for (let ms = 0; ms <= DEPARTURE.ms - DEPARTURE.fadeOut; ms += 10) expect(departureFrame(ms, height, spot).dark).toBe(0);
      expect(departureFrame(DEPARTURE.ms - DEPARTURE.fadeOut / 2, height, spot).dark).toBeCloseTo(0.5);
      const end = departureFrame(DEPARTURE.ms, height, spot);
      expect(end.dark).toBe(1);
      expect(end.done).toBe(true);
      expect(departureFrame(DEPARTURE.ms - 1, height, spot).done).toBe(false);
      expect(DEPARTURE.fadeOut).toBe(HOME_ROAD.fadeOut);
    }
  });

  it("кадр — функція часу", () => {
    const spot = { done: ROAD, seed: 9 };
    expect(departureFrame(1234, 720, spot)).toEqual(departureFrame(1234, 720, { ...spot }));
    expect(departureFrame(-50, 720, spot)).toEqual(departureFrame(0, 720, spot));
  });
});

describe("без накладання кузовів", () => {
  it("своя машина не наїжджає на запарковані — ні на прибутті, ні на від'їзді — і на від'їзді не наїжджає на попутні", () => {
    const height = 720;
    const k = raceScale(height);
    for (let seed = 0; seed < 200; seed++) {
      const start = startAt(SPEEDS[seed % SPEEDS.length] ?? 1, { lane: seed % RACE.lanes, seed });
      const ms = arrivalMs(start);
      for (let t = 0; t <= ms; t += 10) {
        const frame = arrivalFrame(t, height, start);
        for (const car of frame.parked) expect(carsOverlap(own(frame, k), other(car, k)), `прибуття, зерно ${seed}, ${t} мс`).toBe(false);
      }
      for (let t = 0; t <= DEPARTURE.ms; t += 10) {
        const frame = departureFrame(t, height, start);
        for (const car of [...frame.parked, ...frame.traffic]) expect(carsOverlap(own(frame, k), other(car, k)), `від'їзд, зерно ${seed}, ${t} мс`).toBe(false);
      }
    }
  });

  it("перевірка накладання: кузови поруч у сусідніх смугах і на сусідніх місцях — окремо, впритул — накладаються", () => {
    const a: CarBox = { x: 0, y: 0, rotation: 0, ...CAR_BODY.van };
    expect(carsOverlap(a, { ...a, x: RACE_LOT.slots[1].x - RACE_LOT.slots[0].x })).toBe(false);
    expect(carsOverlap(a, { ...a, x: laneX(0, 1, 1) - laneX(0, 0, 1) })).toBe(false);
    expect(carsOverlap(a, { ...a, y: CAR_BODY.van.h - 1 })).toBe(true);
    expect(carsOverlap(a, { ...a, y: CAR_BODY.van.h + 1 })).toBe(false);
    // Повернута поперек — довша вбік.
    expect(carsOverlap(a, { ...a, x: CAR_BODY.van.w + 1, rotation: Math.PI / 2 })).toBe(true);
    expect(carsOverlap(a, { ...a, x: (CAR_BODY.van.w + CAR_BODY.van.h) / 2 + 1, rotation: Math.PI / 2 })).toBe(false);
  });

  it("кузови — з арту: обрис кузова кожної машини (art/race/car/*.svg) — у межах `CAR_BODY` навколо pivot", () => {
    const art = (file: string): string => readFileSync(new URL(`../art/race/car/${file}`, import.meta.url), "utf8");
    const bodies: [keyof typeof CAR_BODY, string | undefined][] = [
      ["player", art("player.svg").match(/<clipPath id="race-car-player-in"><path d="([^"]+)"/)?.[1]],
      ...TRAFFIC_KINDS.map((kind): [keyof typeof CAR_BODY, string | undefined] => [kind, art("traffic.svg").match(new RegExp(`id="race-car-traffic-${kind}-body" d="([^"]+)"`))?.[1]]),
    ];
    for (const [kind, d] of bodies) {
      expect(d, kind).toBeDefined();
      const box = outline(d ?? "");
      const body = CAR_BODY[kind];
      expect(box.left, kind).toBeGreaterThanOrEqual(36 - body.w / 2);
      expect(box.right, kind).toBeLessThanOrEqual(36 + body.w / 2);
      expect(box.top, kind).toBeGreaterThanOrEqual(40 - body.h / 2);
      expect(box.bottom, kind).toBeLessThanOrEqual(40 + body.h / 2);
      // Не набагато більші за обрис: запас — дзеркала, колеса й контур.
      expect(body.w - (box.right - box.left), kind).toBeLessThan(12);
      expect(body.h - (box.bottom - box.top), kind).toBeLessThan(6);
    }
  });
});

/** Межі обрису SVG з команд M, Q і Z (абсолютних): квадратичні криві — за точками на них. */
function outline(d: string): { left: number; right: number; top: number; bottom: number } {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  const add = (x: number, y: number): void => {
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  };
  let x = 0;
  let y = 0;
  let command = "";
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i] ?? "";
    if (/[A-Za-z]/.test(token)) {
      command = token;
      i++;
      if (command === "Z") continue;
    }
    const num = (j: number): number => Number(tokens[i + j]);
    if (command === "M") {
      x = num(0);
      y = num(1);
      add(x, y);
      i += 2;
    } else if (command === "Q") {
      const [cx, cy, ex, ey] = [num(0), num(1), num(2), num(3)];
      for (let s = 1; s <= 20; s++) {
        const t = s / 20;
        add((1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * ey);
      }
      x = ex;
      y = ey;
      i += 4;
    } else throw new Error(`команда ${command} обрису не підтримана`);
  }
  return box;
}

describe("де парковка на місці", () => {
  /** Кадр гри в одиницях інтерфейсу для вікна `css` (px CSS), як його розкладає гра (`canvasFit`, `fitUiCamera`). */
  function layoutFor(css: { width: number; height: number }, safe = 0): { view: { width: number; height: number; k: number; safe: { right: number } }; card: number; layout: ReturnType<typeof parkingLayout> } {
    const { unit } = canvasFit(css, 2, false);
    const width = css.width * unit;
    const height = css.height * unit;
    const view = { width, height, k: raceScale(height), safe: { right: safe * unit } };
    const card = asideCardRight(css, safe, safe) * unit;
    return { view, card, layout: parkingLayout(view, card) };
  }

  it("телефон набік (844 × 390, з вирізом і без, 740 × 360) і десктоп (1280 × 720, 1920 × 1080): картка ліворуч, парковка — посередині вільної смуги", () => {
    const cases: [{ width: number; height: number }, number, 1 | -1][] = [
      [{ width: 844, height: 390 }, 47, 1],
      [{ width: 844, height: 390 }, 0, 1],
      [{ width: 740, height: 360 }, 0, 1],
      [{ width: 1280, height: 720 }, 0, -1],
      [{ width: 1920, height: 1080 }, 0, -1],
    ];
    for (const [css, safe, sign] of cases) {
      const name = `${css.width}×${css.height}, виріз ${safe}`;
      const { view, card, layout } = layoutFor(css, safe);
      expect(layout.aside, name).toBe(true);
      // Телефон: парковку зсунуто праворуч від картки; десктоп: вільна смуга широка — дорогу зсунуто трохи ліворуч.
      expect(Math.sign(layout.pan), name).toBe(sign);
      expect(Math.abs(layout.pan), name).toBeLessThan(view.width / 4);
      const cx = view.width / 2 + layout.pan;
      const margin = PARKING.margin * view.k;
      // Уся парковка з будівлею — у вільній смузі між карткою й безпечною зоною, з полями.
      expect(cx + RACE_LOT.reach.left * view.k, name).toBeGreaterThanOrEqual(card + margin - 1e-6);
      expect(cx + RACE_LOT.reach.right * view.k, name).toBeLessThanOrEqual(view.width - view.safe.right - margin + 1e-6);
      // Посередині смуги.
      expect(cx + ((RACE_LOT.reach.left + RACE_LOT.reach.right) / 2) * view.k, name).toBeCloseTo((card + view.width - view.safe.right) / 2, 6);
      expect(layout.strip, name).toEqual({ left: card, right: view.width - view.safe.right });
    }
  });

  it("парковка не вміщається праворуч (667 × 375, 800 × 900) — картка посередині, дорога на своєму місці", () => {
    for (const css of [
      { width: 667, height: 375 },
      { width: 800, height: 900 },
    ]) {
      expect(layoutFor(css).layout).toEqual({ aside: false, pan: 0, strip: null });
    }
  });

  it("бюджет ширини парковки з будівлею — 300 одиниць арту, а вміщається він рівно тоді, коли вміщається з полями", () => {
    expect(RACE_LOT.reach.right - RACE_LOT.reach.left).toBeLessThanOrEqual(300);
    const view = { width: 1280, height: 720, k: 1, safe: { right: 0 } };
    const need = RACE_LOT.reach.right - RACE_LOT.reach.left + 2 * PARKING.margin;
    expect(parkingLayout(view, 1280 - need).aside).toBe(true);
    expect(parkingLayout(view, 1280 - need + 1).aside).toBe(false);
  });
});

describe("сценарії кадру парковки (scenarios/shop-visit, vet-visit, vet-arrival)", () => {
  function scenario(id: string): Save {
    const found = FILE_SCENARIOS[id];
    if (!found) throw new Error(`немає сценарію ${id}`);
    return applyScenario(found);
  }

  /** Додому: поїздки вже немає, персонаж біля дверей, кіт з переноски — удома. */
  function expectHome(save: Save): void {
    const state = save.current;
    expect(state.trip).toBeNull();
    expect(state.end).toBeNull();
    expect(state.character.body.x).toBe(HOME_DOOR.x);
    expect(state.character.body.y).toBe(HOME_DOOR.y);
    for (const cat of state.cats) expect(cat.away).toBeNull();
  }

  it("«У магазині» — на місці, у магазині без кота, грошей на дві оплати; «Додому» доводить додому", () => {
    const save = scenario("shop-visit");
    const trip = save.current.trip;
    expect(trip?.destination).toBe("shop");
    expect(trip?.phase).toBe("visit");
    expect(tripCat(save.current)).toBeNull();
    expect(trip?.race.done).toBe(trip?.race.road);
    expect(trip?.visit).toBe(TRIPS.shop.visit);
    expect(save.current.character.money).toBeGreaterThanOrEqual(2 * 100);
    // Кадр на місці — з цієї поїздки: та сама парковка й після перезавантаження.
    if (trip) expect(parkedFrame(720, parkingSpot(trip))).toEqual(parkedFrame(720, parkingSpot(structuredClone(trip))));
    goHome(save);
    expectHome(save);
  });

  it("«У ветеринара» — на місці з котом у переносці; «Додому» доводить додому разом із котом", () => {
    const save = scenario("vet-visit");
    const trip = save.current.trip;
    expect(trip?.destination).toBe("vet");
    expect(trip?.phase).toBe("visit");
    expect(trip?.cat).toBe(5);
    const cat = tripCat(save.current);
    expect(cat).not.toBeNull();
    expect(cat?.away).toBe("trip");
    expect(save.current.character.held).toBeNull();
    goHome(save);
    expectHome(save);
    expect(save.current.cats.find((c) => c.id === 5)?.away).toBeNull();
  });

  it("«Прибуття до ветеринара» — ще в дорозі за мить до фінішу, машин немає; без газу доїжджає й стає на місці", () => {
    const save = scenario("vet-arrival");
    const trip = save.current.trip;
    expect(trip?.phase).toBe("drive");
    expect(trip?.race.cars).toEqual([]);
    expect(trip?.race.speed).toBeGreaterThan(0);
    expect((trip?.race.road ?? 0) - (trip?.race.done ?? 0)).toBeCloseTo(0.05);
    expect(tripCat(save.current)?.away).toBe("trip");
    driveSafely(save);
    expect(save.current.trip?.phase).toBe("visit");
    expect(save.current.trip?.race.cars).toEqual([]);
    goHome(save);
    expectHome(save);
  });
});
