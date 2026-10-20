// Гонка дорогою (§8.5): три смуги, інші машини їдуть повільніше; газ, гальмо й перестроювання.
// Відстані — у хвилинах дороги за звичайної швидкості, час — в ігрових хвилинах.

import { RACE } from "./config";
import { createRng } from "./rng";
import type { Difficulty, Race, RaceCar } from "./types";

/** Керування в гонці: перестроїтися (−1 ліворуч, 1 праворуч) і газ чи гальмо (1 чи −1). */
export interface RaceInput {
  steer: -1 | 0 | 1;
  throttle: number;
}

export const NO_RACE_INPUT: RaceInput = { steer: 0, throttle: 0 };

export function newRace(road: number, seed: number): Race {
  // Перша машина — трохи попереду: на старті є час роззирнутися.
  return { road, done: 0, minutes: 0, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 1, rng: seed >>> 0 };
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
  race.speed = Math.min(RACE.maxSpeed, Math.max(RACE.minSpeed, race.speed + input.throttle * RACE.acceleration * minutes));
  const shift = RACE.laneSpeed * minutes;
  race.lane = race.lane < race.targetLane ? Math.min(race.targetLane, race.lane + shift) : Math.max(race.targetLane, race.lane - shift);
  race.minutes += minutes;
  race.done = Math.min(race.road, race.done + race.speed * minutes);
  spawn(race, difficulty, traffic);
  for (const car of race.cars) {
    if (Math.abs(car.lane - race.lane) < 0.6 && Math.abs(carAt(race, car) - race.done) < RACE.carLength) return "crash";
  }
  return race.done >= race.road ? "arrived" : null;
}
