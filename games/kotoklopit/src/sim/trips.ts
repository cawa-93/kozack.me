// Поїздки (§8.5): вирушити з дому, гонка, подія на місці, повернення без гонки; аварія — втрати, години й ремонт за
// швидкістю, а тоді перемотування цих годин чи дня до сну (`rewindAccident`). Події на місці — `destinations.ts`.

import { boardCats } from "./carriers";
import { changeMood, hurtsHome, idleAct, stress, traitLevel } from "./cat";
import { changeStat, spend } from "./character";
import { ACCIDENT, CARRIER_MOOD, GIFTS, MINUTES_PER_DAY, MINUTES_PER_HOUR, SLEEP_NEED_HOURS, TRIP_IDLE_MINUTES, TRIPS } from "./config";
import { maybeFallIll } from "./diseases";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { gripFactor, roadFactor, trafficFactor } from "./modifiers";
import { observe } from "./knowledge";
import { driveRace, newRace, type RaceInput } from "./race";
import { deriveSeed, type Rng } from "./rng";
import { wakeMinute } from "./sleep";
import { targetOf } from "./targets";
import type { AccidentCost, AccidentLoss, Cat, Destination, Difficulty, GameState, Trip } from "./types";
import { isNewborn } from "./reproduction";
import { isWorkday, stopWork } from "./work";
import { catOnStairs, guestAtDoor, openDoor } from "./door";
import { HOME_DOOR } from "./home";

export { HOME_DOOR } from "./home";

/**
 * Дорога до пункту за звичайної швидкості, у хвилинах (§8.5): і гонка туди, і повернення без гонки. «Затори» її подовжують,
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
 * Чи можна вирушити від дверей (§8.5): персонаж біля дверей, під ними немає пакунків і ніхто не чекає, щоб йому відчинили
 * (гість подзвонив — двері відчиняють йому, §9.12, рішення автора 2026-11-03), жоден кіт не втік, у руках нічого або кіт.
 */
export function canLeave(state: GameState): boolean {
  if (state.trip !== null || state.end !== null) return false;
  if (targetOf(state)?.id !== "door") return false;
  if (state.home.porch.length > 0 || guestAtDoor(state) !== null || state.cats.some((c) => c.away === "stairs")) return false;
  const held = state.character.held;
  return held === null || held.kind === "cat";
}

/** Чому сюди зараз не поїхати; null — можна. */
export function tripBlocker(state: GameState, destination: Destination): "newborn" | "office" | "show" | null {
  const cat = heldCat(state);
  // Виставка — лише в її день і раз (§4.1): раніше можна було їздити знову й знову по призи (перевірка поїздок 2026-10-28).
  if (destination === "show" && (state.modifiers.day !== "show" || state.today.showDone === true)) return "show";
  // Офіс — лише в день зборів, раз і в робочий день: після зборів (і пропущених о 18:00) туди нема чого їхати (перевірка циклу
  // гри 2026-10-27), а безробітному, на лікарняному й у відпустці — теж; з котом на руках у списку не з'являється (перевірка
  // поїздок 2026-10-28).
  if (destination === "office" && (state.modifiers.day !== "office" || state.today.officeDone || !isWorkday(state))) return "office";
  // Новонароджене лежить біля матері (§9.8): у переноску його не саджають (перевірка розмноження 2026-10-28) — після офісу й
  // виставки, щоб їх, як завжди, не було в списку в інші дні (повторна перевірка розмноження й побуту 2026-10-28).
  return cat && isNewborn(cat) ? "newborn" : null;
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
    // Як кіт опирається, персонаж бачить: кіт у нього в руках (§9.9).
    if (traitLevel(cat, "carrier") < 0) observe(state, cat, "carrier", -1);
    state.character.held = null;
    cat.away = "trip";
  }
  const riders = boardCats(state, cat);
  // Переноски беруть у дорогу (§9.12 «Переноска»): кіт, що спав у ній, вилазить.
  if (riders.some((r) => r.place !== "hands")) for (const other of state.cats) if (other.act.kind === "sleep" && other.act.target === "carrier") other.act = idleAct();
  for (const rider of riders) {
    const passenger = state.cats.find((c) => c.id === rider.cat);
    if (!passenger) continue;
    // «Переноска» дзеркальна: «+» втрачає менше, «Пасажир першого класу» — нічого.
    changeMood(state, passenger, Math.min(0, CARRIER_MOOD[rider.place] + CARRIER_MOOD.traitStep * traitLevel(passenger, "carrier")), "переноска");
    stress(state, passenger);
  }
  // Поїздка в робочий час (§8.6) зараховується, щойно настає робочий час: і на старті, і в дорозі (`tickWork`).
  const seed = deriveSeed(state.seed, state.day, Math.floor(state.minute), state.replays);
  // Час послуги додає сама послуга (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6): на старті поїздки
  // до ветеринара, лікаря, грумера, на виставку, у притулок чи розплідник часу на місці ще немає.
  const visit = TRIPS[destination].service ? 0 : TRIPS[destination].visit;
  state.trip = { destination, phase: "drive", cat: riders[0]?.cat ?? null, riders, race: newRace(roadMinutes(state, destination), seed), losses: [], visit, seed };
  // Шкарпетку кіт заніс у схованку (§9.12, «Схованки»): поки її шукали, минуло 10 хвилин — поїздка довша.
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
  const result = driveRace(trip.race, minutes, input, state.difficulty, trafficFactor(state), gripFactor(state));
  if (clock.advance(minutes)) return null;
  if (result === "arrived") {
    trip.phase = "visit";
    emit(state, { type: "trip-arrived", destination: trip.destination });
  }
  if (result === "crash") crash(state, clock.rng);
  return result;
}

/**
 * Аварія (§8.5): кожна втрата — з шансом за складністю, найбільше 2/3/4; зайві відкидаються навмання. Години й ремонт — за
 * швидкістю в мить аварії (рішення автора 2026-11-02): поїздка пам'ятає їх і після перезавантаження сторінки.
 */
function crash(state: GameState, rng: Rng): void {
  const trip = state.trip;
  if (!trip) return;
  const accident = accidentCost(state.difficulty, trip.race.speed);
  trip.accident = accident;
  const candidates: AccidentLoss[] = ["repair", "health", "sanity"];
  const riders = trip.riders ?? [];
  if (riders.length > 0) candidates.push("cat");
  let losses = candidates.filter(() => rng.chance(ACCIDENT.chance[state.difficulty]));
  while (losses.length > ACCIDENT.max[state.difficulty]) losses.splice(rng.int(0, losses.length - 1), 1);
  for (const loss of losses) {
    if (loss === "repair") {
      trip.repaired = Math.min(accident.repair, Math.max(0, state.character.money));
      spend(state, trip.repaired, "other");
    }
    if (loss === "health") {
      changeStat(state, "health", ACCIDENT.health, ACCIDENT.floor);
      fallIllPerson(state, "injury");
    }
    if (loss === "sanity") changeStat(state, "sanity", ACCIDENT.sanity, ACCIDENT.floor);
    if (loss === "cat") {
      for (const rider of riders) {
        const cat = state.cats.find((c) => c.id === rider.cat);
        if (cat) changeMood(state, cat, ACCIDENT.catMood, "аварія");
      }
    }
  }
  // Травма — незалежно від решти втрат (§8.5): шанс за місцем, складність кладе `illnessChance`.
  for (const rider of riders) {
    const cat = state.cats.find((c) => c.id === rider.cat);
    if (cat && maybeFallIll(state, cat, "injury", ACCIDENT.catInjury[rider.place], rng)) (trip.injured ??= []).push(cat.id);
  }
  trip.phase = "accident";
  trip.losses = losses;
  emit(state, { type: "trip-crashed", losses, speed: accident.speed, minutes: accident.minutes });
}

/** Множник швидкості аварії (§8.5; рішення автора 2026-11-02): 0,5 + швидкість / 4, не більше 2 (×1 — 0,75, ×2 — 1, від ×6 — 2). */
export function crashSpeedFactor(speed: number): number {
  return Math.min(ACCIDENT.speedMax, ACCIDENT.speedBase + Math.max(0, speed) * ACCIDENT.speedStep);
}

/**
 * Години й ремонт аварії на цій швидкості (§8.5, §5.2; рішення автора 2026-11-02): 10 годин і 60 ₴ × множник складності × множник
 * швидкості; години — цілими чвертями години (`ACCIDENT.roundMinutes`), ремонт — до гривні.
 */
export function accidentCost(difficulty: Difficulty, speed: number): AccidentCost {
  const factor = ACCIDENT.scale[difficulty] * crashSpeedFactor(speed);
  const quarters = Math.round((ACCIDENT.hours * MINUTES_PER_HOUR * factor) / ACCIDENT.roundMinutes);
  return { speed, minutes: quarters * ACCIDENT.roundMinutes, repair: Math.round(ACCIDENT.repair * factor) };
}

/** Що забрала аварія поїздки (§8.5); null — поїздка не в аварії. */
export function accidentOf(state: GameState): AccidentCost | null {
  const trip = state.trip;
  if (trip?.phase !== "accident") return null;
  return trip.accident ?? null;
}

/**
 * Хвилина, коли після аварії персонаж удома й день триває (§8.5; рішення автора 2026-11-02): години аварії й час, поки шукали
 * шкарпетку перед виїздом (§9.12, «Схованки»; він минає й після звичайної поїздки, `returnHome`). null — перемотування
 * доходить до оптимального часу сну чи далі, і день закінчується, як і раніше (`accidentBedtime`); так само, коли це не аварія.
 */
export function accidentHome(state: GameState): number | null {
  const accident = accidentOf(state);
  if (!accident) return null;
  const home = state.minute + accident.minutes + (state.trip?.search ?? 0);
  return home < accidentBedtime(state) ? home : null;
}

/**
 * Хвилина, коли після аварії персонаж засинає, якщо її години доходять до неї: оптимальний час сну, за 8 годин до пробудження
 * (§8.5).
 */
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
    // Ласощі «одразу після» ветеринара — теж з повернення (§7): огляд і дорога довші за `TREATS.hurtMinutes`.
    hurtsHome(cat, cat.stressedAt ?? 0);
  }
  emit(state, { type: "trip-ended", destination: trip.destination });
  return trip;
}
