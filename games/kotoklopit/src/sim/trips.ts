// Поїздки (§8.5): вирушити з дому, гонка, подія на місці, повернення без гонки; аварія —
// втрати й перемотування дня до сну. Події на місці — `destinations.ts`.

import { changeMood, stress, traitLevel } from "./cat";
import { changeStat, spend } from "./character";
import { ACCIDENT, CARRIER_MOOD, MINUTES_PER_DAY, MINUTES_PER_HOUR, SLEEP_NEED_HOURS, TRIPS } from "./config";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { trafficFactor } from "./modifiers";
import { observe } from "./knowledge";
import { driveRace, newRace, type RaceInput } from "./race";
import { deriveSeed, type Rng } from "./rng";
import { wakeMinute } from "./sleep";
import { targetOf } from "./targets";
import type { AccidentLoss, Cat, Destination, GameState, Trip } from "./types";
import { stopWork } from "./work";
import { catOnStairs, openDoor } from "./door";

/** Де персонаж з'являється вдома після поїздки: біля дверей. */
export const HOME_DOOR = { x: 10.5, y: 10.2 } as const;

/** Кіт на руках, якого можна взяти в поїздку. */
function heldCat(state: GameState): Cat | null {
  const held = state.character.held;
  return held?.kind === "cat" ? (state.cats.find((c) => c.id === held.cat) ?? null) : null;
}

/**
 * Чи можна вирушити від дверей (§8.5): персонаж біля дверей, під ними немає пакунків, жоден кіт
 * не втік, у руках нічого або кіт.
 */
export function canLeave(state: GameState): boolean {
  if (state.trip !== null || state.end !== null) return false;
  if (targetOf(state)?.id !== "door") return false;
  if (state.home.porch.length > 0 || state.cats.some((c) => c.away === "stairs")) return false;
  const held = state.character.held;
  return held === null || held.kind === "cat";
}

/** Чому сюди зараз не поїхати; null — можна. */
export function tripBlocker(state: GameState, destination: Destination): "cat" | "carrier" | "no-cat" | "office" | "show" | null {
  const cat = heldCat(state);
  // Виставка — лише в її день (§4.1).
  if (destination === "show" && state.modifiers.day !== "show") return "show";
  if (TRIPS[destination].cat) {
    if (!cat) return "cat";
    if (state.home.carrier === null) return "carrier";
    return null;
  }
  // До притулку кота можна взяти, щоб віддати (§9.8).
  if (cat && destination === "shelter") return state.home.carrier === null ? "carrier" : null;
  if (cat) return "no-cat";
  if (destination === "office" && state.modifiers.day !== "office") return "office";
  return null;
}

/** Вирушити (§8.5): кота з рук — у переноску, гонка починається. */
export function startTrip(state: GameState, destination: Destination): boolean {
  if (!canLeave(state) || tripBlocker(state, destination) !== null) return false;
  const cat = heldCat(state);
  // Персонаж відчиняє двері (§9.12 «Двері й гості»): кіт біля них може вибігти на сходи — тоді поїздка не починається,
  // доки його не впіймали.
  openDoor(state);
  if (catOnStairs(state)) return false;
  stopWork(state);
  state.character.activity = null;
  if (cat) {
    const trait = traitLevel(cat, "carrier");
    // Як кіт опирається переносці, персонаж бачить: кіт у нього в руках (§9.9).
    if (trait < 0) observe(state, cat, "carrier", -1);
    state.character.held = null;
    cat.away = "trip";
    const carrier = state.home.carrier ?? "cheap";
    // «Переноска» дзеркальна (§9.12, рішення автора 2026-10-25): «+» втрачає менше, «Сам лізе в переноску» — нічого.
    changeMood(state, cat, Math.min(0, CARRIER_MOOD[carrier] + CARRIER_MOOD.traitStep * trait), "переноска");
    stress(state, cat);
  }
  // Поїздка в робочий час (§8.6) зараховується, щойно настає робочий час: і на старті, і в дорозі (`tickWork`).
  const seed = deriveSeed(state.seed, state.day, Math.floor(state.minute), state.replays);
  state.trip = { destination, phase: "drive", cat: cat?.id ?? null, race: newRace(TRIPS[destination].road, seed), losses: [], visit: TRIPS[destination].visit, seed };
  emit(state, { type: "trip-started", destination });
  return true;
}

export interface TripClock {
  /** Прокрутити ігровий час, поки персонаж поза домом; повертає, чи настала ніч. */
  advance(minutes: number): boolean;
  rng: Rng;
}

/**
 * Хвилини гонки (§8.5): дорога й годинник. Повертає "arrived" чи "crash", якщо гонка закінчилася.
 */
export function driveTrip(state: GameState, clock: TripClock, minutes: number, input: RaceInput): "arrived" | "crash" | null {
  const trip = state.trip;
  if (trip?.phase !== "drive") return null;
  const result = driveRace(trip.race, minutes, input, state.difficulty, trafficFactor(state));
  if (clock.advance(minutes)) return null;
  if (result === "arrived") {
    trip.phase = "visit";
    emit(state, { type: "trip-arrived", destination: trip.destination });
  }
  if (result === "crash") crash(state, clock.rng);
  return result;
}

/**
 * Аварія (§8.5): кожна втрата — з шансом за складністю, найбільше 2/3/4; зайві відкидаються навмання.
 */
function crash(state: GameState, rng: Rng): void {
  const trip = state.trip;
  if (!trip) return;
  const candidates: AccidentLoss[] = ["repair", "health", "sanity"];
  if (trip.cat !== null) candidates.push("cat");
  let losses = candidates.filter(() => rng.chance(ACCIDENT.chance[state.difficulty]));
  while (losses.length > ACCIDENT.max[state.difficulty]) losses.splice(rng.int(0, losses.length - 1), 1);
  for (const loss of losses) {
    if (loss === "repair") spend(state, Math.min(ACCIDENT.repair, state.character.money));
    if (loss === "health") {
      changeStat(state, "health", ACCIDENT.health, ACCIDENT.floor);
      fallIllPerson(state, "injury");
    }
    if (loss === "sanity") changeStat(state, "sanity", ACCIDENT.sanity, ACCIDENT.floor);
    if (loss === "cat") {
      const cat = state.cats.find((c) => c.id === trip.cat);
      if (cat) changeMood(state, cat, ACCIDENT.catMood, "аварія");
    }
  }
  trip.phase = "accident";
  trip.losses = losses;
  emit(state, { type: "trip-crashed", losses });
}

/** Хвилина, коли після аварії персонаж засинає: оптимальний час сну, за 8 годин до пробудження (§8.5). */
export function accidentBedtime(state: GameState): number {
  return wakeMinute(state) + MINUTES_PER_DAY - SLEEP_NEED_HOURS * MINUTES_PER_HOUR;
}

/** Персонаж удома: біля дверей, кіт із переноски виходить поруч. Повертає поїздку, що скінчилася. */
export function endTrip(state: GameState): Trip | null {
  const trip = state.trip;
  if (!trip) return null;
  state.trip = null;
  const body = state.character.body;
  body.x = HOME_DOOR.x;
  body.y = HOME_DOOR.y;
  body.facing = { x: 0, y: -1 };
  const cat = state.cats.find((c) => c.id === trip.cat);
  if (cat && cat.away === "trip") {
    cat.away = null;
    cat.x = HOME_DOOR.x - 0.6;
    cat.y = HOME_DOOR.y - 0.3;
    cat.act = { kind: "idle", target: null, goal: null, minutes: 3, elapsed: 0 };
    // Переноска й неприємне в поїздці — щойно кіт удома (§9.12): дметься й може помститися з цієї миті.
    stress(state, cat);
    if (cat.offense?.away === true) cat.offense = { at: cat.stressedAt ?? 0 };
  }
  emit(state, { type: "trip-ended", destination: trip.destination });
  return trip;
}
