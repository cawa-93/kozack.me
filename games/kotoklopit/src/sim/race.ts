// Гонка дорогою (§8.5): три смуги, інші машини їдуть ×0,5; газ розганяє до ×10, без газу машина
// поступово зупиняється, гальмо — швидше; перестроювання.
// Відстані — у хвилинах дороги за звичайної швидкості, час — в ігрових хвилинах.

import { RACE } from "./config";
import { createRng } from "./rng";
import type { Difficulty, Race, RaceCar } from "./types";

/** Керування в гонці: перестроїтися (−1 ліворуч, 1 праворуч) і газ чи гальмо (1 чи −1; 0 — котитися). */
export interface RaceInput {
  steer: -1 | 0 | 1;
  throttle: number;
}

export const NO_RACE_INPUT: RaceInput = { steer: 0, throttle: 0 };

export function newRace(road: number, seed: number): Race {
  // Перша машина — трохи попереду: на старті є час роззирнутися.
  return { road, done: 0, minutes: 0, lane: 1, targetLane: 1, speed: RACE.startSpeed, cars: [], spawned: 1, rng: seed >>> 0 };
}

/** Де зараз машина на дорозі. */
export const carAt = (race: Race, car: RaceCar): number => car.start + RACE.carSpeed * race.minutes;

/** Додати машини попереду, щоб дорога в полі зору була заповнена. */
function spawn(race: Race, difficulty: Difficulty, traffic: number): void {
  const ahead = race.done + RACE.view;
  // Машини рухаються, тож нова з'являється на дорозі там, де була б зараз.
  if (race.spawned + RACE.carSpeed * race.minutes < ahead) {
    const rng = createRng(race.rng);
    const gap = RACE.gap / (RACE.traffic[difficulty] * traffic);
    while (race.spawned + RACE.carSpeed * race.minutes < ahead) {
      race.spawned += gap * (0.4 + rng.next() * 1.2);
      race.cars.push({ lane: rng.int(0, RACE.lanes - 1), start: race.spawned });
    }
    race.rng = Math.floor(rng.next() * 4294967296) >>> 0;
  }
  // Машини позаду вже не потрібні.
  race.cars = race.cars.filter((c) => carAt(race, c) > race.done - 1);
}

/**
 * Проїхати хвилини гонки. Повертає "crash", якщо персонаж у щось врізався, "arrived" — якщо доїхав.
 */
export function driveRace(race: Race, minutes: number, input: RaceInput, difficulty: Difficulty, traffic = 1): "crash" | "arrived" | null {
  if (input.steer !== 0) race.targetLane = Math.min(RACE.lanes - 1, Math.max(0, Math.round(race.targetLane) + input.steer));
  // Дрібними кроками: на великій швидкості машини не проскакують одна крізь одну.
  for (let left = minutes; left > 0; left -= RACE.step) {
    const result = step(race, Math.min(left, RACE.step), input.throttle, difficulty, traffic);
    if (result !== null) return result;
  }
  return null;
}

function step(race: Race, minutes: number, throttle: number, difficulty: Difficulty, traffic: number): "crash" | "arrived" | null {
  const rate = throttle > 0 ? throttle * RACE.acceleration : throttle < 0 ? throttle * RACE.braking : -RACE.coasting;
  race.speed = Math.min(RACE.maxSpeed, Math.max(RACE.minSpeed, race.speed + rate * minutes));
  const shift = RACE.laneSpeed * minutes;
  race.lane = race.lane < race.targetLane ? Math.min(race.targetLane, race.lane + shift) : Math.max(race.targetLane, race.lane - shift);
  race.minutes += minutes;
  race.done = Math.min(race.road, race.done + race.speed * minutes);
  spawn(race, difficulty, traffic);
  for (const car of race.cars) {
    if (Math.abs(car.lane - race.lane) >= 0.6) continue;
    const gap = carAt(race, car) - race.done;
    if (gap >= RACE.carLength) continue;
    // Машина позаду не врізається, а пригальмовує за персонажем.
    if (gap < 0) {
      if (gap > -RACE.carLength) car.start -= RACE.carLength + gap;
      continue;
    }
    return "crash";
  }
  return race.done >= race.road ? "arrived" : null;
}
