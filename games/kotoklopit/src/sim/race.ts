// Гонка дорогою (§8.5): три смуги, інші машини їдуть ×0,5; машина стартує не з місця (з тією швидкістю, з якою доїхала до
// старту на від'їзді від дому); газ розганяє до ×10, без газу машина поступово зупиняється, гальмо — швидше; перестроювання.
// Відстані — у хвилинах дороги за звичайної швидкості, час — в ігрових хвилинах. Зчеплення (`grip`, «Ожеледиця» / «Новий
// асфальт», §4.1) множить лише гальмо й перестроювання, а накат без газу — ні: своя смуга на старті вільна, як завжди.

import { RACE } from "./config";
import { createRng } from "./rng";
import { raceMinutes } from "./time";
import type { Difficulty, Race, RaceCar } from "./types";

/** Керування в гонці: перестроїтися (−1 ліворуч, 1 праворуч) і газ чи гальмо (1 чи −1; 0 — котитися). */
export interface RaceInput {
  steer: -1 | 0 | 1;
  throttle: number;
}

export const NO_RACE_INPUT: RaceInput = { steer: 0, throttle: 0 };

/** Смуга старту — середня. */
const START_LANE = 1;

export function newRace(road: number, seed: number): Race {
  // Перша машина — трохи попереду: на старті є час роззирнутися. Машина вже котиться (`startSpeed`, §8.5 «Виїзд із дому»).
  return { road, done: 0, minutes: 0, lane: START_LANE, targetLane: START_LANE, speed: RACE.startSpeed, cars: [], spawned: 1, rng: seed >>> 0 };
}

/** Де зараз машина на дорозі. */
export const carAt = (race: Race, car: RaceCar): number => car.start + RACE.carSpeed * race.minutes;

/** Машина в смузі персонажа: ближче за пів смуги. */
const SAME_LANE = 0.6;

/**
 * Машина позаду пригальмувала за персонажем (§8.5): у його смузі впритул ззаду — `step` тримає її рівно на `RACE.carLength`
 * позаду. Для звуку: вона сигналить.
 */
export function heldBehind(race: Race, car: RaceCar): boolean {
  return Math.abs(car.lane - race.lane) < SAME_LANE && Math.abs(carAt(race, car) - race.done + RACE.carLength) < 1e-6;
}

/**
 * Наскільки вільні сусідні смуги на старті (§8.5 «Виїзд із дому»): `RACE.startSide` розраховано на секунду реакції й гальмо за
 * звичайного зчеплення. Гірше зчеплення (`grip` < 1) подовжує гальмівний шлях — на стільки ж далі вільні й смуги, інакше на
 * льоду секунди на реакцію вже не було б; з кращим секунда й так лишається.
 */
export function startSide(grip: number): number {
  if (grip >= 1) return RACE.startSide;
  const react = RACE.startSpeed - RACE.coasting * raceMinutes(RACE.startReaction);
  const brake = (react - RACE.carSpeed) ** 2 / (2 * RACE.braking);
  return RACE.startSide + brake * (1 / grip - 1);
}

/** Додати машини попереду, щоб дорога в полі зору була заповнена. */
function spawn(race: Race, difficulty: Difficulty, traffic: number, grip: number): void {
  const ahead = race.done + RACE.view;
  // Машини рухаються, тож нова з'являється на дорозі там, де була б зараз.
  if (race.spawned + RACE.carSpeed * race.minutes < ahead) {
    const rng = createRng(race.rng);
    const gap = RACE.gap / (RACE.traffic[difficulty] * traffic);
    const side = startSide(grip);
    while (race.spawned + RACE.carSpeed * race.minutes < ahead) {
      race.spawned += gap * (0.4 + rng.next() * 1.2);
      const lane = rng.int(0, RACE.lanes - 1);
      // Своя смуга на старті вільна (`RACE.startClear`): без газу машина зі `startSpeed` не наздоганяє потоку. Сусідні — ближче
      // (`startSide`): перестроїлися туди першою дією — є секунда, щоб загальмувати. Решта машин — ті самі, що й без цього
      // правила (той самий ряд випадкових чисел).
      if (race.spawned >= (lane === START_LANE ? RACE.startClear : side)) race.cars.push({ lane, start: race.spawned });
    }
    race.rng = Math.floor(rng.next() * 4294967296) >>> 0;
  }
  // Машини позаду вже не потрібні.
  race.cars = race.cars.filter((c) => carAt(race, c) > race.done - 1);
}

/**
 * Проїхати хвилини гонки. Повертає "crash", якщо персонаж у щось врізався, "arrived" — якщо доїхав. `traffic` — густота потоку
 * дня (`trafficFactor`), `grip` — зчеплення тижня (`gripFactor`).
 */
export function driveRace(race: Race, minutes: number, input: RaceInput, difficulty: Difficulty, traffic = 1, grip = 1): "crash" | "arrived" | null {
  if (input.steer !== 0) race.targetLane = Math.min(RACE.lanes - 1, Math.max(0, Math.round(race.targetLane) + input.steer));
  // Дрібними кроками: на великій швидкості машини не проскакують одна крізь одну.
  for (let left = minutes; left > 0; left -= RACE.step) {
    const result = step(race, Math.min(left, RACE.step), input.throttle, difficulty, traffic, grip);
    if (result !== null) return result;
  }
  return null;
}

function step(race: Race, minutes: number, throttle: number, difficulty: Difficulty, traffic: number, grip: number): "crash" | "arrived" | null {
  const rate = throttle > 0 ? throttle * RACE.acceleration : throttle < 0 ? throttle * RACE.braking * grip : -RACE.coasting;
  race.speed = Math.min(RACE.maxSpeed, Math.max(RACE.minSpeed, race.speed + rate * minutes));
  const shift = RACE.laneSpeed * grip * minutes;
  race.lane = race.lane < race.targetLane ? Math.min(race.targetLane, race.lane + shift) : Math.max(race.targetLane, race.lane - shift);
  race.minutes += minutes;
  race.done = Math.min(race.road, race.done + race.speed * minutes);
  spawn(race, difficulty, traffic, grip);
  for (const car of race.cars) {
    if (Math.abs(car.lane - race.lane) >= SAME_LANE) continue;
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
