// Гонка (§8.5): машина стартує не з місця (з тією швидкістю, з якою доїхала до старту на від'їзді від дому), газ поступово
// розганяє до ×10, без газу машина поступово зупиняється, гальмо — швидше; машини позаду не врізаються, а на великій швидкості
// не проскакують крізь персонажа.

import { describe, expect, it } from "vitest";

import { MODIFIERS, RACE, TRIPS } from "../src/sim/config";
import { driveRace, newRace } from "../src/sim/race";
import type { Difficulty, RaceCar } from "../src/sim/types";

const GAS = { steer: 0 as const, throttle: 1 };
const COAST = { steer: 0 as const, throttle: 0 };
const BRAKE = { steer: 0 as const, throttle: -1 };

/** Порожня дорога: машин немає й нові не з'являються. */
function emptyRace() {
  const race = newRace(1000, 1);
  race.spawned = Infinity;
  return race;
}

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
/** Множник потоку дня: звичайний, «Пробки» (найгустіший) і «Порожні дороги». */
const TRAFFIC = [1, MODIFIERS.traffic["traffic"] ?? 1, MODIFIERS.traffic["empty-roads"] ?? 1];

describe("швидкість у гонці (§8.5)", () => {
  it("на старті машина вже котиться (×2, як доїхала до старту на від'їзді від дому); газ розганяє поступово аж до ×10", () => {
    const race = emptyRace();
    expect(RACE.startSpeed).toBe(2);
    expect(race.speed).toBe(RACE.startSpeed);
    driveRace(race, 1, GAS, "normal");
    expect(race.speed).toBeCloseTo(RACE.startSpeed + RACE.acceleration);
    driveRace(race, 60, GAS, "normal");
    expect(race.speed).toBe(RACE.maxSpeed);
    expect(RACE.maxSpeed).toBe(10);
  });

  it("без жодного натискання від старту машина поступово зупиняється: з ×2 — за 8 ігрових хвилин, проїхавши 8 одиниць дороги", () => {
    const race = emptyRace();
    driveRace(race, 1, COAST, "normal");
    expect(race.speed).toBeCloseTo(RACE.startSpeed - RACE.coasting);
    let prev = race.speed;
    for (let minute = 1; minute < 8; minute++) {
      driveRace(race, 1, COAST, "normal");
      expect(race.speed).toBeLessThan(prev);
      prev = race.speed;
    }
    expect(race.speed).toBeCloseTo(0, 6);
    driveRace(race, 1, COAST, "normal");
    expect(race.speed).toBe(0);
    expect(race.done).toBeCloseTo(RACE.startSpeed ** 2 / (2 * RACE.coasting), 1);
    const done = race.done;
    driveRace(race, 5, COAST, "normal");
    expect(race.done).toBe(done);
  });

  it("без газу швидкість поступово падає до нуля, гальмо — швидше", () => {
    const race = emptyRace();
    race.speed = 8;
    driveRace(race, 1, COAST, "normal");
    expect(race.speed).toBeCloseTo(8 - RACE.coasting);
    driveRace(race, 1, BRAKE, "normal");
    expect(race.speed).toBeCloseTo(8 - RACE.coasting - RACE.braking);
    expect(RACE.braking).toBeGreaterThan(RACE.coasting);
    driveRace(race, 60, COAST, "normal");
    expect(race.speed).toBe(0);
    const done = race.done;
    driveRace(race, 5, COAST, "normal");
    expect(race.done).toBe(done);
  });
});

describe("старт гонки: своя смуга вільна (§8.5 «Виїзд із дому»)", () => {
  it("вільної смуги вистачає: без газу машина гасить різницю з потоком раніше, ніж наздожене машину на межі", () => {
    // Скільки машина без газу зі старту проїде понад машину потоку, поки не стане повільнішою за неї, — плюс довжина машини.
    const closing = (RACE.startSpeed - RACE.carSpeed) ** 2 / (2 * RACE.coasting);
    expect(RACE.startClear).toBeGreaterThanOrEqual(closing + RACE.carLength);
  });

  it("ближче за `startClear` у смузі старту машин потоку немає; у сусідніх — є, і за межею своя смуга — як завжди", () => {
    const startLane = newRace(0, 0).lane;
    let side = 0;
    let beyond = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        for (let seed = 1; seed <= 40; seed++) {
          const race = newRace(1000, seed);
          const seen = new Set<RaceCar>();
          // Котиться без газу 8 одиниць дороги: сим ставить машини й далеко за межею вільної смуги.
          for (let minute = 0; minute < 10; minute++) {
            driveRace(race, 1, COAST, difficulty, traffic);
            for (const car of race.cars) seen.add(car);
          }
          for (const car of seen) {
            if (car.start < RACE.startClear) {
              expect(car.lane, `зерно ${seed}, ${difficulty}, ×${traffic}`).not.toBe(startLane);
              side++;
            } else if (car.lane === startLane) beyond++;
          }
        }
      }
    }
    expect(side).toBeGreaterThan(300);
    expect(beyond).toBeGreaterThan(300);
  });

  it("без жодного натискання — без аварії: машина котиться, зупиняється, а потік їде далі (усі складності й дні)", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        for (let seed = 1; seed <= 60; seed++) {
          const race = newRace(TRIPS.breeder.road, seed);
          for (let minute = 0; minute < 15; minute++) {
            expect(driveRace(race, 1, COAST, difficulty, traffic), `зерно ${seed}, ${difficulty}, ×${traffic}, ${minute} хв`).toBeNull();
          }
          expect(race.speed).toBe(0);
          expect(race.cars.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("інші машини (§8.5)", () => {
  it("їдуть ×0,5; машина позаду пригальмовує, а не врізається", () => {
    expect(RACE.carSpeed).toBe(0.5);
    const race = emptyRace();
    race.done = 5;
    // Своя машина стоїть — машина позаду її наздоганяє.
    race.speed = 0;
    race.cars.push({ lane: 1, start: 4.8 });
    expect(driveRace(race, 3, COAST, "normal")).toBeNull();
    expect(race.cars[0]?.start).toBeLessThan(4.8);
  });

  it("на ×10 машина попереду не проскакує крізь персонажа навіть за довгий кадр", () => {
    const race = emptyRace();
    race.speed = RACE.maxSpeed;
    race.cars.push({ lane: 1, start: 2 });
    expect(driveRace(race, 1, GAS, "normal")).toBe("crash");
  });
});
