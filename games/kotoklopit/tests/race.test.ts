// Гонка (§8.5): машина стартує не з місця (з тією швидкістю, з якою доїхала до старту на від'їзді від дому), газ поступово
// розганяє до ×10, без газу машина поступово зупиняється, гальмо — швидше; машини позаду не врізаються, а на великій швидкості
// не проскакують крізь персонажа.

import { describe, expect, it } from "vitest";

import { MODIFIERS, RACE, TRIPS } from "../src/sim/config";
import { driveRace, heldBehind, newRace } from "../src/sim/race";
import { raceMinutes } from "../src/sim/time";
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
/** Множник потоку дня: звичайний, «Затори» (найгустіший) і «Порожні дороги». */
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

describe("старт гонки: своя смуга вільна, сусідні — ближче (§8.5 «Виїзд із дому»)", () => {
  it("вільної смуги вистачає: без газу машина гасить різницю з потоком раніше, ніж наздожене машину на межі", () => {
    // Скільки машина без газу зі старту проїде понад машину потоку, поки не стане повільнішою за неї, — плюс довжина машини.
    const closing = (RACE.startSpeed - RACE.carSpeed) ** 2 / (2 * RACE.coasting);
    expect(RACE.startClear).toBeGreaterThanOrEqual(closing + RACE.carLength);
  });

  it("сусідніх смуг вистачає на секунду реакції: перестроїлися першою дією, котилися секунду — ще встигаєш загальмувати", () => {
    // За секунду реакції (`startReaction`) без газу машина наздоганяє потік на стільки; швидкість тоді — `react`.
    const t = raceMinutes(RACE.startReaction);
    const coast = (RACE.startSpeed - RACE.carSpeed) * t - (RACE.coasting * t * t) / 2;
    const react = RACE.startSpeed - RACE.coasting * t;
    // Гальмо з `react` до швидкості потоку наздоганяє ще на стільки.
    const brake = (react - RACE.carSpeed) ** 2 / (2 * RACE.braking);
    expect(RACE.startReaction).toBe(1);
    expect(RACE.startSide).toBeGreaterThanOrEqual(coast + brake + RACE.carLength);
    // Своя смуга — вільна далі: без жодного натискання машина гасить різницю з потоком без гальма.
    expect(RACE.startSide).toBeLessThan(RACE.startClear);
  });

  it("ближче за `startClear` у смузі старту машин потоку немає, ближче за `startSide` — і в сусідніх; далі — як завжди", () => {
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
            expect(car.start, `зерно ${seed}, ${difficulty}, ×${traffic}`).toBeGreaterThanOrEqual(RACE.startSide);
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

  it("перестроїлися першою дією в сусідню смугу (рецензія 2026-11-03): за секунду реакції без аварії, і гальмо чи повернення рятують", () => {
    // Кадрами, як у сцені (60 кадрів за секунду): перестроювання — у першому кадрі, далі газ, гальмо чи смуга — за планом.
    const frame = raceMinutes(1 / 60);
    const react = raceMinutes(RACE.startReaction);
    const drive = (
      steer: -1 | 1,
      after: { throttle: number; back: boolean },
      difficulty: Difficulty,
      traffic: number,
      seed: number,
      limit: number,
    ): number | null => {
      const race = newRace(1000, seed);
      let back = false;
      for (let t = 0; t < limit; t += frame) {
        const reacted = t >= react;
        const turn: -1 | 0 | 1 = t === 0 ? steer : reacted && after.back && !back ? (steer === 1 ? -1 : 1) : 0;
        if (turn !== 0 && t > 0) back = true;
        if (driveRace(race, frame, { steer: turn, throttle: reacted ? after.throttle : 0 }, difficulty, traffic) === "crash") return t;
      }
      return null;
    };
    let crashed = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const traffic of TRAFFIC) {
        for (let seed = 1; seed <= 60; seed++) {
          for (const steer of [-1, 1] as const) {
            const label = `зерно ${seed}, ${difficulty}, ×${traffic}, смуга ${steer}`;
            // Котиться далі без гальма — аварія можлива, але не раніше, ніж мине секунда реакції.
            const coast = drive(steer, { throttle: 0, back: false }, difficulty, traffic, seed, 15);
            if (coast !== null) {
              crashed++;
              expect(coast, label).toBeGreaterThan(react);
            }
            // Через секунду загальмували — без аварії; повернулися у свою смугу — теж.
            expect(drive(steer, { throttle: -1, back: false }, difficulty, traffic, seed, 15), label).toBeNull();
            expect(drive(steer, { throttle: 0, back: true }, difficulty, traffic, seed, 15), label).toBeNull();
          }
        }
      }
    }
    // Машини в сусідніх смугах на старті є: хто котиться в них без гальма, той часто врізається.
    expect(crashed).toBeGreaterThan(200);
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
    // Пригальмувала впритул — сигналить; персонаж поїхав геть, швидше за потік, — вже ні.
    const behind = race.cars[0]!;
    expect(heldBehind(race, behind)).toBe(true);
    race.speed = RACE.startSpeed;
    driveRace(race, 1, GAS, "normal");
    expect(heldBehind(race, behind)).toBe(false);
  });

  it("на ×10 машина попереду не проскакує крізь персонажа навіть за довгий кадр", () => {
    const race = emptyRace();
    race.speed = RACE.maxSpeed;
    race.cars.push({ lane: 1, start: 2 });
    expect(driveRace(race, 1, GAS, "normal")).toBe("crash");
  });
});
