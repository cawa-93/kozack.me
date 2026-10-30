// Гонка (§8.5): газ поступово розганяє до ×10, без газу машина поступово зупиняється, гальмо —
// швидше; машини позаду не врізаються, а на великій швидкості не проскакують крізь персонажа.

import { describe, expect, it } from "vitest";

import { RACE } from "../src/sim/config";
import { driveRace, newRace } from "../src/sim/race";

const GAS = { steer: 0 as const, throttle: 1 };
const COAST = { steer: 0 as const, throttle: 0 };
const BRAKE = { steer: 0 as const, throttle: -1 };

/** Порожня дорога: машин немає й нові не з'являються. */
function emptyRace() {
  const race = newRace(1000, 1);
  race.spawned = Infinity;
  return race;
}

describe("швидкість у гонці (§8.5)", () => {
  it("на старті машина стоїть; газ розганяє поступово аж до ×10", () => {
    const race = emptyRace();
    expect(race.speed).toBe(0);
    driveRace(race, 1, GAS, "normal");
    expect(race.speed).toBeCloseTo(RACE.acceleration);
    driveRace(race, 60, GAS, "normal");
    expect(race.speed).toBe(RACE.maxSpeed);
    expect(RACE.maxSpeed).toBe(10);
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

describe("інші машини (§8.5)", () => {
  it("їдуть ×0,5; машина позаду пригальмовує, а не врізається", () => {
    expect(RACE.carSpeed).toBe(0.5);
    const race = emptyRace();
    race.done = 5;
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
