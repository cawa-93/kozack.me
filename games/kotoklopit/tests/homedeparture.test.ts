// Виїзд із дому (§8.5 «Виїзд із дому — від'їзд від свого будинку», рішення автора 2026-11-03; `src/view/parking.ts`,
// `homeDepartureFrame`): з чорного — парковка біля свого будинку, машина задкує з місця, звертає на дорогу носом угору в середню
// смугу й без гальмування доїжджає до старту гонки — і без розриву, з тією самою швидкістю, гонка (рішення автора 2026-11-03).
// Вогні вночі (`src/view/racelight.ts`), позначка «щойно вирушили від дверей» (`src/view/departing.ts`), підказка старту
// (`src/view/starthint.ts`) і сценарій `scenarios/home-departure.json` (поле `leave`). Без Phaser.

import { describe, expect, it } from "vitest";

import { PALETTE } from "../art/palette";
import { applyScenario, FILE_SCENARIOS, leaveHome, type Scenario } from "../src/dev/scenarios";
import { MODIFIERS, RACE } from "../src/sim/config";
import { deserialize, serialize } from "../src/sim/game";
import { carAt, driveRace, newRace } from "../src/sim/race";
import { raceMinutes } from "../src/sim/time";
import { canLeave } from "../src/sim/trips";
import type { Difficulty, Race, RaceCar, Trip } from "../src/sim/types";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";
import { RACE_LOT, RACE_TILES } from "../src/view/art/manifest/a14-race";
import { artEntry } from "../src/view/art/manifest";
import { markDeparture, takeDeparture } from "../src/view/departing";
import { carReach } from "../src/view/homeroad";
import { iconArt } from "../src/view/iconnames";
import {
  CAR_BODY,
  carsOverlap,
  HOME_DEPARTURE,
  HOME_LOT,
  homeDepartureFrame,
  homeDepartureHud,
  homeDepartureStart,
  homeLotSeed,
  LOT_BOUNDS,
  lotCars,
  lotFitPan,
  lotInFrame,
  lotScreenY,
  ownSlot,
  parkedFrame,
  parkingLayout,
  type CarBox,
  type HomeDepartureStart,
  type ParkingAnimationFrame,
  type ParkingCar,
} from "../src/view/parking";
import {
  DRIVING_LIGHTS,
  homeDepartureLights,
  lotLights,
  PARKED_LIGHTS,
  streetPools,
  tripLightMinute,
} from "../src/view/racelight";
import { DESTINATION_ROOFS, laneX, RACE_PLAYER_Y, racePixelsPerUnit, raceScale, steerTilt, tileRows, trafficLook, vergeColumns } from "../src/view/racelook";
import { startHintShown } from "../src/view/starthint";
import { DESTINATION_ICONS } from "../src/view/symbols";

/** Висоти кадру: 720 (десктоп і телефон набік) і вищі (вузьке вікно). */
const HEIGHTS = [720, 960, 1440];
/** Ширини кадру при висоті 720 (у вищого кадру — пропорційно). */
const WIDTHS = [1280, 1556, 2000];
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const TRAFFIC = [1, MODIFIERS.traffic["traffic"] ?? 1, MODIFIERS.traffic["empty-roads"] ?? 1];

/** Свіжа гонка, як після `startTrip`. */
const fresh = (seed: number, road = 40): Race => newRace(road, seed);

function startOf(seed: number, difficulty: Difficulty = "normal", traffic = 1, gameSeed = seed): HomeDepartureStart {
  return homeDepartureStart(fresh(seed), gameSeed, difficulty, traffic);
}

/** Кузов машини кадру в одиницях арту (x від середини дороги, y від верху кадру). */
const own = (frame: ParkingAnimationFrame, k: number): CarBox => ({ x: frame.car.x / k, y: frame.car.y / k, rotation: frame.car.rotation, ...CAR_BODY.player });
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

/** Кадр гонки (x — від середини дороги). */
interface RaceFrame {
  car: { x: number; y: number; rotation: number };
  cars: { x: number; y: number; kind: string; color: number }[];
  offset: number;
}

/**
 * Кадр гонки `race`, як його малює `RaceArt.draw`, з машинами потоку `cars` (у мить старту сим їх ще не поставив — їх ставить
 * перший крок, тож їх беруть з копії після нього): своя машина, зсув дороги й машини потоку в кадрі.
 */
function raceFrame(race: Race, cars: readonly RaceCar[], height: number): RaceFrame {
  const k = raceScale(height);
  const ppu = racePixelsPerUnit(height);
  const playerY = height * RACE_PLAYER_Y;
  const reach = 84 * k;
  const shown = cars
    .map((car) => ({ x: laneX(0, car.lane, k), y: playerY - (carAt(race, car) - race.done) * ppu, ...trafficLook(car) }))
    .filter((car) => car.y >= -reach && car.y <= height + reach)
    .map(({ kind, color, x, y }) => ({ x, y, kind, color }));
  return { car: { x: laneX(0, race.lane, k), y: playerY, rotation: steerTilt(race.lane, race.targetLane) }, cars: shown, offset: race.done * ppu };
}

/** Перший крок гонки на копії (`RACE.step`, без керування): машини потоку, які він поставить. */
function firstStep(race: Race, difficulty: Difficulty, traffic: number): Race {
  const after = structuredClone(race);
  driveRace(after, RACE.step, { steer: 0, throttle: 0 }, difficulty, traffic);
  return after;
}

/**
 * Гонка в мить старту (кадр кінця від'їзду): та сама гонка, ще без кроку, — машина вже котиться (`RACE.startSpeed`), тож перший
 * крок — уже рух від цього кадру; машини потоку — ті, що поставить перший крок, там, де вони в мить старту.
 */
function raceStart(race: Race, height: number, difficulty: Difficulty, traffic: number): RaceFrame {
  return raceFrame(race, firstStep(race, difficulty, traffic).cars, height);
}

/** Швидкість старту гонки на ×1 на екрані, px за секунду на кадрі заввишки `height`: так біжить дорога в першу мить гонки. */
const startScroll = (height: number): number => RACE.startSpeed * raceMinutes(1) * racePixelsPerUnit(height);

describe("виїзд із дому: свій будинок", () => {
  it("дах — свого кольору з палітри, не такий, як у жодного пункту; табличка — гліф дому 🏠, не іконка пункту", () => {
    expect(HOME_LOT.roof).toBe(Number.parseInt(PALETTE.wood.slice(1), 16));
    expect(Object.values(DESTINATION_ROOFS)).not.toContain(HOME_LOT.roof);
    // Дах — не трава й не асфальт (`art/STYLE.md` §11 race).
    for (const hex of [PALETTE.green, PALETTE.grey, PALETTE.greyLo]) expect(HOME_LOT.roof).not.toBe(Number.parseInt(hex.slice(1), 16));
    expect(HOME_LOT.sign).toBe(`ui/glyph/${GLYPH_ART["🏠"]}`);
    expect(artEntry(HOME_LOT.sign)).toBeDefined();
    for (const icon of Object.values(DESTINATION_ICONS)) expect(iconArt(icon)).not.toBe(HOME_LOT.sign);
  });

  it("своє місце й машини сусідів — із зерна гри: ті самі в кожній поїздці, не залежать від зерна поїздки", () => {
    const a = startOf(3, "normal", 1, 77);
    const b = startOf(9, "hard", 1.5, 77);
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(homeLotSeed(77));
    expect(ownSlot(a.seed)).toBe(ownSlot(b.seed));
    expect(lotCars(a.seed)).toEqual(lotCars(b.seed));
    // Інша гра — інший двір (бодай в одній із кількох).
    const layouts = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify([ownSlot(homeLotSeed(seed)), lotCars(homeLotSeed(seed))])));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it("знімок старту не змінює гонку: машини потоку — ті самі, що поставить перший крок гонки, там, де вони в мить старту", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        for (let seed = 1; seed <= 12; seed++) {
          const race = fresh(seed);
          const before = structuredClone(race);
          const start = homeDepartureStart(race, seed, difficulty, traffic);
          expect(race).toEqual(before);
          expect(start.done).toBe(0);
          const after = firstStep(race, difficulty, traffic);
          expect(start.cars.map((car) => [car.lane, car.look])).toEqual(after.cars.map((car) => [car.lane, trafficLook(car)]));
          // У мить старту (`race.minutes`), а не після кроку: машина стартує не з місця, і крок — уже рух.
          for (const [i, car] of start.cars.entries()) expect(car.ahead).toBeCloseTo(carAt(race, after.cars[i] ?? { lane: 0, start: 0 }) - race.done, 9);
          // Усі машини старту — попереду своєї за межею вільних смуг: у сусідніх — `RACE.startSide`, у смузі старту — далі,
          // `RACE.startClear`.
          for (const car of start.cars) {
            expect(car.ahead).toBeGreaterThanOrEqual(RACE.startSide);
            if (car.lane === race.lane) expect(car.ahead).toBeGreaterThanOrEqual(RACE.startClear);
          }
        }
      }
    }
  });

  it("потік не зник (рецензія 2026-11-03): сусідні смуги вільні ближче, ніж видно дорогу, і машини потоку на старті бувають у кадрі", () => {
    // Скільки дороги видно попереду своєї машини: від неї до верхнього краю кадру.
    // Машина на межі `startSide` (її середина) видна цілою: до верхнього краю кадру — ще пів її довжини.
    for (const height of HEIGHTS) expect((height * RACE_PLAYER_Y) / racePixelsPerUnit(height)).toBeGreaterThan(RACE.startSide + RACE.carLength / 2);
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        let shown = 0;
        for (let seed = 1; seed <= 100; seed++) {
          if (homeDepartureFrame(HOME_DEPARTURE.ms, 720, startOf(seed, difficulty, traffic)).traffic.length > 0) shown++;
        }
        // Виміряно: 12–35 % стартів, залежно від складності й дня.
        expect(shown, `${difficulty}, ×${traffic}`).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

describe("виїзд із дому: рух", () => {
  it("на ms = 0 — кадр парковки, як на місці біля пункту (той самий двір — те саме місце й сусіди), але чорний; машина стоїть", () => {
    for (const height of HEIGHTS) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const start = startOf(seed);
        const frame = homeDepartureFrame(0, height, start);
        const parked = parkedFrame(height, { done: 30, seed: start.seed });
        expect(frame.lot).toBeCloseTo(parked.lot, 9);
        expect(frame.car).toEqual(parked.car);
        expect(frame.parked).toEqual(parked.parked);
        expect(frame.traffic).toEqual([]);
        expect(frame.pan).toBe(1);
        expect(frame.dark).toBe(1);
        expect(frame.done).toBe(false);
        expect(lotInFrame(frame.lot, height)).toBe(true);
        // Проступає з чорного, поки машина ще стоїть на місці.
        expect(homeDepartureFrame(HOME_DEPARTURE.fadeIn, height, start).dark).toBe(0);
        expect(homeDepartureFrame(HOME_DEPARTURE.fadeIn / 2, height, start).dark).toBeCloseTo(0.5);
        for (let ms = 0; ms <= HOME_DEPARTURE.reverseFrom; ms += 10) {
          const still = homeDepartureFrame(ms, height, start);
          expect(still.car).toEqual(parked.car);
          expect(still.lot).toBeCloseTo(parked.lot, 9);
        }
      }
    }
  });

  it("наприкінці — кадр гонки в мить старту: своя машина в смузі старту носом угору, зсув дороги, машини потоку, парковки в кадрі немає", () => {
    for (const height of HEIGHTS) {
      for (const difficulty of DIFFICULTIES) {
        for (const traffic of TRAFFIC) {
          for (let seed = 1; seed <= 8; seed++) {
            const race = fresh(seed);
            const start = homeDepartureStart(race, seed, difficulty, traffic);
            const end = homeDepartureFrame(HOME_DEPARTURE.ms, height, start);
            const expected = raceStart(race, height, difficulty, traffic);
            expect(end.done).toBe(true);
            expect(end.dark).toBe(0);
            expect(end.pan).toBe(0);
            expect(end.offset).toBeCloseTo(expected.offset, 9);
            expect(end.car.x).toBeCloseTo(expected.car.x, 9);
            expect(end.car.y).toBeCloseTo(expected.car.y, 9);
            expect(end.car.rotation).toBeCloseTo(expected.car.rotation, 9);
            expect(lotInFrame(end.lot, height)).toBe(false);
            expect(end.lot + LOT_BOUNDS.top * raceScale(height)).toBeGreaterThan(height);
            // Машини потоку — там само, де їх покаже гонка (поза кадром за верхнім краєм — не видно ні там, ні тут).
            const visible = (y: number): boolean => y > -carReach(height) && y < height + carReach(height);
            const shown = end.traffic.map((car) => [car.x, car.y, car.look.kind, car.look.color]);
            const race0 = expected.cars.filter((car) => visible(car.y)).map((car) => [car.x, car.y, car.kind, car.color]);
            expect(shown.length).toBe(race0.length);
            shown.forEach((car, i) => {
              expect(car[0]).toBeCloseTo(Number(race0[i]?.[0]), 6);
              expect(car[1]).toBeCloseTo(Number(race0[i]?.[1]), 6);
              expect(car.slice(2)).toEqual(race0[i]?.slice(2));
            });
            // Після кінця — той самий кадр (пропуск — одразу він).
            expect(homeDepartureFrame(HOME_DEPARTURE.ms + 500, height, start)).toEqual(end);
          }
        }
      }
    }
  });

  it("без гальмування (рішення автора 2026-11-03): наприкінці машина на екрані стоїть на старті, а дорога біжить зі швидкістю старту гонки", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const start = startOf(seed);
        const end = homeDepartureFrame(HOME_DEPARTURE.ms, height, start);
        // Похідна зсуву дороги в останню мить — швидкість, з якою дорога біжить у гонці на старті (`RACE.startSpeed` на ×1).
        const h = 1;
        const just = homeDepartureFrame(HOME_DEPARTURE.ms - h, height, start);
        expect(((end.offset - just.offset) * 1000) / h / startScroll(height)).toBeCloseTo(1, 2);
        // Своя машина на екрані вже стоїть на своєму місці в гонці: за останній кадр (16 мс) — менше за піксель.
        const before = homeDepartureFrame(HOME_DEPARTURE.ms - 16, height, start);
        expect(Math.hypot(end.car.x - before.car.x, end.car.y - before.car.y)).toBeLessThan(0.5 * k);
        expect(Math.abs(end.car.rotation - before.car.rotation)).toBeLessThan(1e-3);
        // Дорогою до старту машина не гальмує: останні 0,9 с дорога біжить майже зі швидкістю старту гонки (не повільніше за 0,85
        // від неї) — не спиняється й не сповільнюється помітно.
        for (let ms = HOME_DEPARTURE.ms - 900 + 20; ms <= HOME_DEPARTURE.ms; ms += 20) {
          const frame = homeDepartureFrame(ms, height, start);
          const prior = homeDepartureFrame(ms - 20, height, start);
          expect(((frame.offset - prior.offset) * 50) / startScroll(height), `${ms} мс`).toBeGreaterThan(0.85);
        }
        // Кадр за кадром — без стрибків (найшвидше — ≈ 1100 одиниць арту за секунду, ×3,8 гонки).
        let prev = homeDepartureFrame(0, height, start);
        for (let ms = 5; ms <= HOME_DEPARTURE.ms; ms += 5) {
          const frame = homeDepartureFrame(ms, height, start);
          expect(Math.hypot(frame.car.x - prev.car.x, frame.car.y - prev.car.y) / k, `${ms} мс`).toBeLessThan(6.5);
          expect(Math.abs(frame.car.rotation - prev.car.rotation)).toBeLessThan(0.12);
          expect(Math.abs(frame.offset - prev.offset) / k).toBeLessThan(6.5);
          prev = frame;
        }
      }
    }
  });

  it("від'їзд і гонка — без шва: останні кадри від'їзду й перші кадри гонки зсувають дорогу й машини потоку однаково, своя машина стоїть", () => {
    // Як у сцені (`RaceScene.updateLeave`): кадри по 16,7 мс; від'їзд скінчився посеред кадру — гонці дістається лише решта кадру.
    const dt = 1000 / 60;
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= 6; seed++) {
          const race = fresh(seed);
          const start = homeDepartureStart(race, seed, difficulty, 1);
          const frames: RaceFrame[] = [];
          // Кадри від'їзду: …, T − 2,3 dt, T − 1,3 dt, T − 0,3 dt.
          for (const n of [3, 2, 1]) {
            const frame = homeDepartureFrame(HOME_DEPARTURE.ms - (n - 0.7) * dt, height, start);
            frames.push({ car: frame.car, offset: frame.offset, cars: frame.traffic.map((car) => ({ x: car.x, y: car.y, kind: car.look.kind, color: car.look.color })) });
          }
          // Кадри гонки: перший — лише 0,7 dt (решта кадру за кінцем від'їзду), далі — по dt.
          const live = structuredClone(race);
          for (const ms of [0.7 * dt, dt, dt]) {
            expect(driveRace(live, raceMinutes(ms / 1000), { steer: 0, throttle: 0 }, difficulty, 1)).toBeNull();
            frames.push(raceFrame(live, live.cars, height));
          }
          // Зсув дороги за кадр — той самий (з точністю до 2 %: швидкість ледь змінюється — без газу машина в гонці поступово
          // сповільнюється); ривок — крок за весь кадр після кінця від'їзду — дав би ×1,3, а гальмування до нуля — ×0.
          const steps = frames.slice(1).map((frame, i) => frame.offset - (frames[i]?.offset ?? 0));
          for (const step of steps) expect(Math.abs(step / (startScroll(height) * (dt / 1000)) - 1)).toBeLessThan(0.02);
          for (const [i, frame] of frames.entries()) {
            expect(frame.car.x, `кадр ${i}`).toBeCloseTo(laneX(0, race.lane, k), 6);
            expect(Math.abs(frame.car.y - height * RACE_PLAYER_Y), `кадр ${i}`).toBeLessThan(0.05 * k);
            expect(frame.car.rotation).toBeCloseTo(0, 6);
          }
          // Машини потоку: кожна, що є в сусідніх кадрах, за кадр зсувається однаково — і через межу від'їзду й гонки.
          const moves: number[] = [];
          for (let i = 1; i < frames.length; i++) {
            for (const car of frames[i]?.cars ?? []) {
              const same = frames[i - 1]?.cars.find((c) => c.x === car.x && c.kind === car.kind && c.color === car.color);
              if (same) moves.push(car.y - same.y);
            }
          }
          const expected = (startScroll(height) - RACE.carSpeed * raceMinutes(1) * racePixelsPerUnit(height)) * (dt / 1000);
          for (const move of moves) expect(move / expected).toBeCloseTo(1, 1);
        }
      }
    }
  });

  it("задки з місця (ніс угору), проїздом до з'їзду, праворуч на дорогу носом угору в середню смугу — і лише вперед", () => {
    const aisle = (RACE_LOT.aisle.top + RACE_LOT.aisle.bottom) / 2;
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const seed of [1, 2, 3, 4, 5]) {
        const start = startOf(seed);
        const slot = RACE_LOT.slots[ownSlot(start.seed)];
        const reverseEnd = HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse;
        // Спершу задки: ніс угору, машина відходить донизу.
        const early = homeDepartureFrame(HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse / 4, height, start);
        expect(early.car.y - early.lot).toBeGreaterThan((slot?.y ?? 0) * k);
        expect(Math.abs(early.car.rotation)).toBeLessThan(0.3);
        // Виїхала задки — носом до з'їзду (ліворуч), посеред проїзду.
        const turned = homeDepartureFrame(reverseEnd, height, start);
        expect(turned.car.rotation).toBeCloseTo(-Math.PI / 2, 2);
        expect(turned.car.y - turned.lot).toBeCloseTo(aisle * k, 4);
        // Далі — лише вперед: x не більшає (проїздом ліворуч і в середню смугу), а в рамці парковки y не більшає; ніс — між
        // «ліворуч» і «угору» (праворуч не заносить), а на дорозі (за поворотом) — майже вгору: у середню смугу без різкого нахилу.
        let prev = turned;
        let onRoad = false;
        const rightLane = laneX(0, RACE.lanes - 1, k);
        for (let ms = reverseEnd + 5; ms <= HOME_DEPARTURE.ms; ms += 5) {
          const frame = homeDepartureFrame(ms, height, start);
          expect(frame.car.x).toBeLessThanOrEqual(prev.car.x + 1e-9);
          expect(frame.car.y - frame.lot).toBeLessThanOrEqual(prev.car.y - prev.lot + 1e-9);
          expect(frame.car.rotation).toBeGreaterThanOrEqual(-Math.PI / 2 - 1e-9);
          expect(frame.car.rotation).toBeLessThanOrEqual(1e-9);
          if (frame.car.x <= rightLane + 1e-9) expect(frame.car.rotation).toBeGreaterThan(-0.45);
          if (Math.abs(frame.car.rotation) < 1e-9 && Math.abs(frame.car.x - laneX(0, 1, k)) < 1e-9) onRoad = true;
          prev = frame;
        }
        expect(onRoad).toBe(true);
      }
    }
  });

  it("з дороги на майданчик і назад — лише через з'їзд, а на майданчику машина вся на асфальті; не наїжджає ні на сусідів, ні на потік", () => {
    // Усе в одиницях арту, тож висота кадру нічого не змінює (720).
    const height = 720;
    const k = raceScale(height);
    const problems: string[] = [];
    // Різні двори (своє місце й сусіди) і різний потік старту: складність і «Затори» / «Порожні дороги».
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        for (let seed = 0; seed < 16; seed++) {
          const start = startOf(seed, difficulty, traffic);
          for (let ms = 0; ms <= HOME_DEPARTURE.ms; ms += 10) {
            const frame = homeDepartureFrame(ms, height, start);
            const box = own(frame, k);
            const y = box.y - frame.lot / k;
            const at = `зерно ${seed}, ${difficulty}, ×${traffic}, ${ms} мс`;
            if (box.x > RACE_LOT.driveway.left && box.x < RACE_LOT.driveway.right && !(y > RACE_LOT.driveway.top && y < RACE_LOT.driveway.bottom)) problems.push(`${at}: над бордюром не біля з'їзду`);
            if (box.x >= RACE_LOT.area.left) {
              for (const corner of corners(box)) {
                const cy = corner.y - frame.lot / k;
                if (corner.x > RACE_LOT.area.right || cy < RACE_LOT.area.top || cy > RACE_LOT.area.bottom) problems.push(`${at}: кут поза майданчиком`);
              }
            }
            for (const car of frame.parked) if (carsOverlap(box, other(car, k))) problems.push(`${at}: на сусіда`);
            for (const car of frame.traffic) if (carsOverlap(box, other(car, k), 8)) problems.push(`${at}: на потік`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("своя машина весь від'їзд у кадрі; камера лише вгору — парковка з будинком відпливає вниз за край кадру", () => {
    for (const height of HEIGHTS) {
      const reach = carReach(height);
      for (const seed of [1, 2, 3, 4]) {
        const start = startOf(seed);
        let lot = -Infinity;
        let offset = -Infinity;
        let gone = -1;
        for (let ms = 0; ms <= HOME_DEPARTURE.ms; ms += 5) {
          const frame = homeDepartureFrame(ms, height, start);
          expect(frame.car.y - reach).toBeGreaterThan(0);
          expect(frame.car.y + reach).toBeLessThan(height);
          expect(frame.lot).toBeGreaterThanOrEqual(lot - 1e-9);
          expect(frame.offset).toBeGreaterThanOrEqual(offset - 1e-9);
          lot = frame.lot;
          offset = frame.offset;
          if (gone < 0 && !lotInFrame(frame.lot, height)) gone = ms;
        }
        // Будинок зникає за нижнім краєм ще до кінця, а не в останню мить.
        expect(gone).toBeGreaterThan(0);
        expect(gone).toBeLessThan(HOME_DEPARTURE.ms - 150);
      }
    }
  });

  it("машини потоку їдуть угору зі швидкістю гонки на ×1, з'являються згори й на старті дорога порожня", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (let seed = 1; seed <= 10; seed++) {
        const start = startOf(seed, "hard", MODIFIERS.traffic["traffic"] ?? 1);
        let count = 0;
        for (let ms = 0; ms <= HOME_DEPARTURE.ms; ms += 5) {
          const frame = homeDepartureFrame(ms, height, start);
          if (ms <= HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse) expect(frame.traffic).toEqual([]);
          if (frame.traffic.length > count) {
            const newest = frame.traffic.reduce((a, b) => (b.y < a.y ? b : a));
            expect(newest.y).toBeLessThan(height * 0.1);
          }
          count = frame.traffic.length;
          for (const car of frame.traffic) {
            expect(car.rotation).toBe(0);
            expect(car.alpha).toBe(1);
          }
        }
        // Швидкість на екрані відносно дороги: машина потоку обганяє дорогу на швидкість потоку гонки на ×1.
        const a = homeDepartureFrame(HOME_DEPARTURE.ms - 400, height, start);
        const b = homeDepartureFrame(HOME_DEPARTURE.ms - 300, height, start);
        const car = b.traffic[0];
        const same = a.traffic.find((c) => c.x === car?.x && c.look === car?.look);
        if (car && same) expect(((same.y - car.y + (b.offset - a.offset)) / k / 100) * 1000).toBeCloseTo(RACE.carSpeed * (60 / 45) * 216, 3);
      }
    }
  });

  it("зсув убік (вузьке високе вікно) — лише щоб парковка вмістилася, і до кінця повертається до середини дороги", () => {
    const view = (width: number, height: number) => ({ width, height, k: raceScale(height), safe: { right: 0 } });
    // Широке — не зсунуто; вузьке високе — зсунуто ліворуч рівно як під карткою посередині.
    expect(lotFitPan(view(1556, 720))).toBe(0);
    expect(lotFitPan(view(1280, 720))).toBe(0);
    const narrow = view(1280, 1440);
    expect(lotFitPan(narrow)).toBeLessThan(0);
    expect(lotFitPan(narrow)).toBe(parkingLayout(narrow, narrow.width).pan);
    const start = startOf(4);
    let pan = 1;
    for (let ms = 0; ms <= HOME_DEPARTURE.ms; ms += 10) {
      const frame = homeDepartureFrame(ms, 1440, start);
      expect(frame.pan).toBeLessThanOrEqual(pan);
      pan = frame.pan;
    }
    expect(homeDepartureFrame(HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse, 1440, start).pan).toBe(1);
    expect(pan).toBe(0);
  });

  it("напис і смуга прогресу гонки проступають лише наприкінці", () => {
    expect(homeDepartureHud(0)).toBe(0);
    expect(homeDepartureHud(HOME_DEPARTURE.ms - HOME_DEPARTURE.hud)).toBe(0);
    expect(homeDepartureHud(HOME_DEPARTURE.ms - HOME_DEPARTURE.hud / 2)).toBeCloseTo(0.5);
    expect(homeDepartureHud(HOME_DEPARTURE.ms)).toBe(1);
  });

  it("кадр — функція часу: ті самі миті з різним кроком кадрів — те саме; ≈ 2–3 с", () => {
    const start = startOf(6);
    expect(homeDepartureFrame(1234, 720, start)).toEqual(homeDepartureFrame(1234, 720, startOf(6)));
    expect(homeDepartureFrame(-50, 720, start)).toEqual(homeDepartureFrame(0, 720, start));
    expect(HOME_DEPARTURE.ms).toBeGreaterThanOrEqual(2000);
    expect(HOME_DEPARTURE.ms).toBeLessThanOrEqual(3000);
  });
});

describe("виїзд із дому: світло вночі", () => {
  it("фари вмикаються, поки машина стоїть; білі вогні заднього ходу — поки задкує; наприкінці — як у гонці", () => {
    expect(homeDepartureLights(0)).toEqual(PARKED_LIGHTS);
    const moving = homeDepartureLights(HOME_DEPARTURE.reverseFrom);
    expect(moving.head).toBe(1);
    expect(moving.reverse).toBe(1);
    expect(homeDepartureLights(HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse / 2).reverse).toBe(1);
    const forward = homeDepartureLights(HOME_DEPARTURE.reverseFrom + HOME_DEPARTURE.reverse + 300);
    expect(forward.reverse).toBe(0);
    expect(forward).toEqual(DRIVING_LIGHTS);
    expect(homeDepartureLights(HOME_DEPARTURE.ms)).toEqual(DRIVING_LIGHTS);
  });

  it("ліхтарі парковки й табличка світять, поки будинок поруч; наприкінці світло кадру — як на старті гонки", () => {
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      for (const base of WIDTHS) {
        const width = (base * height) / 720;
        const cx = width / 2;
        const view = { height, k, cx };
        const start = startOf(5);
        const first = homeDepartureFrame(HOME_DEPARTURE.fadeIn, height, start);
        const lit = lotLights(first.lot, view);
        expect(lit.pools.length).toBeGreaterThan(0);
        expect(lit.sign).not.toBeNull();
        const end = homeDepartureFrame(HOME_DEPARTURE.ms, height, start);
        // Гонка на старті: парковка пункту далеко попереду.
        const raceLot = lotScreenY(0, 40, height);
        expect(streetPools(end.offset, view, end.lot)).toEqual(streetPools(0, view, raceLot));
        expect(lotLights(end.lot, view)).toEqual({ pools: [], sign: null });
        expect(lotLights(raceLot, view)).toEqual({ pools: [], sign: null });
      }
    }
  });
});

describe("виїзд із дому: кадр старту гонки без будинку", () => {
  it("узбіччя наприкінці — з деревами, як у гонці: плитки під будинком (без дерев) уже всі під нижнім краєм", () => {
    // Те саме правило, що в `RaceScene.drawRoad`: плитка без дерев — коли її вміст заходить у межі парковки з будинком.
    for (const height of HEIGHTS) {
      const k = raceScale(height);
      const start = startOf(2);
      const end = homeDepartureFrame(HOME_DEPARTURE.ms, height, start);
      for (const base of WIDTHS) {
        const width = (base * height) / 720;
        const cx = width / 2;
        const period = RACE_TILES.verge.period * k;
        const size = (RACE_TILES.verge.bottom - RACE_TILES.verge.top) * k;
        const lot = { left: cx + LOT_BOUNDS.left * k, right: cx + LOT_BOUNDS.right * k, top: end.lot + LOT_BOUNDS.top * k, bottom: end.lot + LOT_BOUNDS.bottom * k };
        for (const column of vergeColumns(width, cx, k)) {
          const under = column.x - size / 2 < lot.right && column.x + size / 2 > lot.left;
          for (const row of tileRows(end.offset + column.phase * period, period, height)) {
            const plain = under && row.y < lot.bottom && row.y + size > lot.top;
            expect(plain, `${width} × ${height}, стовпець ${column.x}, ряд ${row.y}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("підказка старту гонки (§8.5): машина вже котиться", () => {
  it("від самого старту — є, поки гравець нічого не натиснув, хоч машина й котиться; після першого натискання — ні", () => {
    const race = fresh(3);
    expect(race.speed).toBeGreaterThan(0);
    expect(startHintShown(race, true, false)).toBe(true);
    expect(startHintShown(race, true, true)).toBe(false);
    // Без натискання машина зупинилася — підказка лишається.
    driveRace(race, 20, { steer: 0, throttle: 0 }, "normal");
    expect(race.speed).toBe(0);
    expect(startHintShown(race, true, false)).toBe(true);
  });

  it("гонка після перезавантаження (не від старту): поки машина котиться — немає, спинилася — є", () => {
    const race = fresh(3);
    driveRace(race, 1, { steer: 0, throttle: 1 }, "normal");
    expect(race.speed).toBeGreaterThan(0);
    expect(startHintShown(race, false, false)).toBe(false);
    race.speed = 0;
    expect(startHintShown(race, false, false)).toBe(true);
    expect(startHintShown(race, false, true)).toBe(false);
  });
});

describe("виїзд із дому: лише від дверей", () => {
  it("позначку «щойно вирушили» забирають раз, і лише з тієї самої поїздки: копія з JSON (перезавантаження) — без неї", () => {
    const trip: Trip = { destination: "shop", phase: "drive", cat: null, race: fresh(5), losses: [], visit: 30, seed: 41 };
    markDeparture(trip);
    expect(takeDeparture(structuredClone(trip))).toBe(false);
    expect(takeDeparture(trip)).toBe(true);
    expect(takeDeparture(trip)).toBe(false);
  });
});

describe("сценарій «Виїзд із дому» (scenarios/home-departure)", () => {
  function scenario(): Scenario {
    const found = FILE_SCENARIOS["home-departure"];
    if (!found) throw new Error("немає сценарію home-departure");
    return found;
  }

  it("персонажка біля дверей вирушає в магазин, як з «Куди поїхати?»: свіжа гонка, годинник не зрушив; без `leave` — нічого", () => {
    const found = scenario();
    expect(found.leave).toBe("shop");
    const save = applyScenario(found);
    const minute = save.current.minute;
    expect(canLeave(save.current)).toBe(true);
    const trip = leaveHome(save, found);
    expect(trip).toBe(save.current.trip);
    expect(trip?.destination).toBe("shop");
    expect(trip?.phase).toBe("drive");
    expect(trip?.race.minutes).toBe(0);
    expect(trip?.race.done).toBe(0);
    expect(trip?.race.cars).toEqual([]);
    expect(save.current.minute).toBe(minute);
    // Світло від'їзду — за годинником гри (`drive`), як у гонці: час не йде.
    expect(tripLightMinute(save.current, "drive")).toBe(minute);
    const { leave: _leave, ...without } = found;
    const other = applyScenario(without);
    expect(leaveHome(other, without)).toBeNull();
    expect(other.current.trip).toBeNull();
  });

  it("на старті гонки видно машини потоку — у сусідніх смугах, своя вільна (`RACE.startClear`): на від'їзді вони в'їжджають у кадр згори", () => {
    const save = applyScenario(scenario());
    const trip = leaveHome(save, scenario());
    if (!trip) throw new Error("сценарій не вирушив");
    // Машина в сусідній смузі на найближчому дозволеному місці (`RACE.startSide`) — щоб тест не залежав від того, чи випала
    // вона так близько в зерні сценарію.
    trip.race.cars.push({ lane: trip.race.lane + 1, start: RACE.startSide });
    const start = homeDepartureStart(trip.race, save.current.seed, save.current.difficulty, 1);
    const end = homeDepartureFrame(HOME_DEPARTURE.ms, 720, start);
    expect(end.traffic.length).toBeGreaterThanOrEqual(1);
    for (const car of end.traffic) expect(car.x).not.toBeCloseTo(laneX(0, trip.race.lane, 1), 6);
    expect(homeDepartureFrame(HOME_DEPARTURE.reverseFrom, 720, start).traffic).toEqual([]);
  });

  it("перезавантаження посеред від'їзду — одразу гонка вже з тією самою швидкістю: швидкість старту — у симі", () => {
    const save = applyScenario(scenario());
    const trip = leaveHome(save, scenario());
    if (!trip) throw new Error("сценарій не вирушив");
    const reloaded = deserialize(serialize(save)).current.trip;
    expect(reloaded?.race.speed).toBe(RACE.startSpeed);
    expect(reloaded?.race.minutes).toBe(0);
  });

  it("перезавантаження посеред від'їзду: поїздка з JSON — без позначки, тож одразу гонка", () => {
    const save = applyScenario(scenario());
    const trip = leaveHome(save, scenario());
    if (!trip) throw new Error("сценарій не вирушив");
    markDeparture(trip);
    const reloaded = deserialize(serialize(save));
    expect(reloaded.current.trip).toEqual(trip);
    if (reloaded.current.trip) expect(takeDeparture(reloaded.current.trip)).toBe(false);
    expect(takeDeparture(trip)).toBe(true);
  });
});
