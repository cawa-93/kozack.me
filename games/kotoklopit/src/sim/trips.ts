// Поїздки (§8.5): вирушити з дому, гонка, подія на місці, повернення без гонки; аварія —
// втрати й перемотування дня до сну. Події на місці — `destinations.ts`.

import { changeMood, idleAct, stress, traitLevel } from "./cat";
import { changeStat, spend } from "./character";
import { ACCIDENT, CARRIER_MOOD, GIFTS, MINUTES_PER_DAY, MINUTES_PER_HOUR, SLEEP_NEED_HOURS, TRIP_IDLE_MINUTES, TRIPS } from "./config";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { roadFactor, trafficFactor } from "./modifiers";
import { observe } from "./knowledge";
import { driveRace, newRace, type RaceInput } from "./race";
import { deriveSeed, type Rng } from "./rng";
import { wakeMinute } from "./sleep";
import { targetOf } from "./targets";
import type { AccidentLoss, Cat, Destination, GameState, Trip } from "./types";
import { isNewborn } from "./reproduction";
import { isWorkday, stopWork } from "./work";
import { catOnStairs, openDoor } from "./door";

/** Де персонаж з'являється вдома після поїздки: біля дверей. */
export const HOME_DOOR = { x: 10.5, y: 10.2 } as const;

/**
 * Дорога до пункту за звичайної швидкості, у хвилинах (§8.5): і гонка туди, і повернення без гонки. «Пробки» її подовжують,
 * «Порожні дороги» — скорочують (§4.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А14).
 */
export function roadMinutes(state: GameState, destination: Destination): number {
  return Math.round(TRIPS[destination].road * roadFactor(state));
}

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
export function tripBlocker(state: GameState, destination: Destination): "cat" | "carrier" | "no-cat" | "newborn" | "office" | "show" | null {
  const cat = heldCat(state);
  // Виставка — лише в її день і раз (§4.1): раніше можна було їздити знову й знову по призи (перевірка поїздок 2026-10-28).
  if (destination === "show" && (state.modifiers.day !== "show" || state.today.showDone === true)) return "show";
  // Офіс — лише в день зборів, раз і в робочий день: після зборів (і пропущених о 18:00) туди нема чого їхати (перевірка циклу
  // гри 2026-10-27), а безробітному, на лікарняному й у відпустці — теж; з котом на руках у списку не з'являється (перевірка
  // поїздок 2026-10-28).
  if (destination === "office" && (state.modifiers.day !== "office" || state.today.officeDone || !isWorkday(state))) return "office";
  // Новонароджене лежить біля матері (§9.8): у переноску його не саджають (перевірка розмноження 2026-10-28) — після офісу й
  // виставки, щоб їх, як завжди, не було в списку в інші дні (повторна перевірка розмноження й побуту 2026-10-28).
  if (cat && isNewborn(cat)) return "newborn";
  if (TRIPS[destination].cat) {
    if (!cat) return "cat";
    if (state.home.carrier === null) return "carrier";
    return null;
  }
  // Притулок котів не приймає — туди їздять лише взяти кота, а віддають через оголошення (§9.8; рішення автора 2026-10-29,
  // `GENERAL_REVIEW.md`, А15): з котом на руках туди, як і в магазин, не їдуть.
  if (cat) return "no-cat";
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
    // Переноску беруть у дорогу (§9.12 «Переноска»): кіт, що спав у ній, вилазить (перевірка етапу 2026-10-26).
    for (const other of state.cats) if (other.act.kind === "sleep" && other.act.target === "carrier") other.act = idleAct();
    const carrier = state.home.carrier ?? "cheap";
    // «Переноска» дзеркальна (§9.12, рішення автора 2026-10-25): «+» втрачає менше, «Сам лізе в переноску» — нічого.
    changeMood(state, cat, Math.min(0, CARRIER_MOOD[carrier] + CARRIER_MOOD.traitStep * trait), "переноска");
    stress(state, cat);
  }
  // Поїздка в робочий час (§8.6) зараховується, щойно настає робочий час: і на старті, і в дорозі (`tickWork`).
  const seed = deriveSeed(state.seed, state.day, Math.floor(state.minute), state.replays);
  // Час послуги додає сама послуга (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6): на старті поїздки
  // до ветеринара, лікаря, грумера, на виставку, у притулок чи розплідник часу на місці ще немає.
  const visit = TRIPS[destination].service ? 0 : TRIPS[destination].visit;
  state.trip = { destination, phase: "drive", cat: cat?.id ?? null, race: newRace(roadMinutes(state, destination), seed), losses: [], visit, seed };
  // Шкарпетку кіт заніс у схованку (§9.12, «Подарунки й схованки»): поки її шукали, минуло 10 хвилин — поїздка довша.
  if (state.home.sock === true) {
    delete state.home.sock;
    state.trip.search = GIFTS.sockSearch;
    emit(state, { type: "sock-found", where: "trip" });
  }
  emit(state, { type: "trip-started", destination });
  return true;
}

/**
 * Скільки хвилин минуло на місці (§8.5): у ветеринара, лікаря, грумера, на виставці, у притулку й розпліднику — лише за отримані
 * послуги (узяти кота — теж), а без жодної — 15 хвилин (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6; притулок і розплідник —
 * рецензія реалізації А6); у магазині й офісі — час самих покупок чи зборів.
 */
export function visitMinutes(trip: Trip): number {
  return TRIPS[trip.destination].service && trip.visit === 0 ? TRIP_IDLE_MINUTES : trip.visit;
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
    if (loss === "repair") {
      trip.repaired = Math.min(ACCIDENT.repair, Math.max(0, state.character.money));
      spend(state, trip.repaired, "other");
    }
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

/** Персонаж удома: біля дверей, коти з поїздки (з переноски й щойно взяті) виходять поруч. Повертає поїздку, що скінчилася. */
export function endTrip(state: GameState): Trip | null {
  const trip = state.trip;
  if (!trip) return null;
  state.trip = null;
  const body = state.character.body;
  body.x = HOME_DOOR.x;
  body.y = HOME_DOOR.y;
  body.facing = { x: 0, y: -1 };
  for (const cat of state.cats) {
    if (cat.away !== "trip") continue;
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
