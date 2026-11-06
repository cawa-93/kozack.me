// Переноски (§8.7): кілька на дім, посадити й випустити котів, чотири етапи кота під замком, поїздка з котами.

import { changeHealth, changeMood, idleAct, offend, stress, traitLevel } from "./cat";
import { addMess, hideSpot, startAct } from "./catai";
import { visibleFloorNear } from "./catmove";
import { changeStat } from "./character";
import { CARRIER, CAT_ACT_MINUTES, MINUTES_PER_HOUR, NEED_THRESHOLD, PET } from "./config";
import { emit } from "./events";
import { removeCat } from "./farewell";
import { CARRIER_SPOT } from "./home";
import { observe } from "./knowledge";
import { applyMorningSanity } from "./night";
import { loudNoise } from "./noise";
import { isNewborn } from "./reproduction";
import { stateRng, type Rng } from "./rng";
import type { Cat, CatNeed, GameState, Home, Quality, TripRider } from "./types";

export type CageStage = keyof typeof CARRIER.moodPerHour;

/** Поставити куплену переноску: дорогі завжди попереду, їх заповнюють першими. */
export function addCarrier(home: Home, quality: Quality): void {
  home.carriers.push({ quality, wear: 0 });
  home.carriers.sort((a, b) => Number(b.quality === "premium") - Number(a.quality === "premium"));
}

/** Скільки котів вміщується в усі переноски. */
export const carrierRoom = (home: Home): number => home.carriers.length * CARRIER.cats;

/** Коти під замком у порядку посадки. */
export function cagedCats(state: GameState): Cat[] {
  return (state.home.caged ?? []).flatMap((id) => state.cats.filter((c) => c.id === id));
}

/** Номер переноски, де сидить кіт: спершу дорогі, далі за порядком посадки; -1 — не сидить. */
export function carrierOf(state: GameState, cat: Cat): number {
  const place = (state.home.caged ?? []).indexOf(cat.id);
  return place < 0 ? -1 : Math.floor(place / CARRIER.cats);
}

const cellmates = (state: GameState, index: number): Cat[] => cagedCats(state).filter((c) => carrierOf(state, c) === index);

/** Як риса зсуває сидіння кота (§8.7). «Сам лізе» після першої потреби поводиться, як кіт без риси. */
function cageTrait(cat: Cat): (typeof CARRIER.trait)[keyof typeof CARRIER.trait] {
  const level = Math.max(-2, Math.min(2, traitLevel(cat, "carrier")));
  return CARRIER.trait[level >= 2 && cat.cage?.alarmed === true ? 0 : (level as keyof typeof CARRIER.trait)];
}

/** Етап кота під замком (§8.7). */
export function cageStage(cat: Cat): CageStage {
  const clock = cat.cage?.clock ?? 0;
  const { stages } = cageTrait(cat);
  if (clock >= CARRIER.stages.chew * stages) return "chew";
  if (clock >= CARRIER.stages.stress * stages) return "stress";
  return clock >= CARRIER.stages.cry * stages ? "cry" : "calm";
}

/** Котові чогось бракує: будь-яка потреба від порога чи здоров'я до межі (§8.7). */
function needsSomething(cat: Cat): boolean {
  if (cat.health <= CARRIER.alarmHealth) return true;
  return (Object.keys(NEED_THRESHOLD) as (keyof typeof NEED_THRESHOLD)[]).some((need) => cat.needs[need] >= NEED_THRESHOLD[need]);
}

/** Потреби, від яких під замком помирають (§8.7); увага, гра й втома — ні. */
const VITAL: readonly CatNeed[] = ["hunger", "thirst", "toilet"];

/** Кусає того, хто підійшов до переноски, поки кіт гризе (§8.7). */
function bite(state: GameState, rng: Rng): void {
  for (const cat of cagedCats(state)) {
    if (cageStage(cat) !== "chew" || !rng.chance(CARRIER.bite * cageTrait(cat).bite)) continue;
    changeStat(state, "health", PET.biteHealth);
    emit(state, { type: "bite", cat: cat.id });
  }
}

/** Кіт вийшов із переноски: той, кого довели до стресу, ховається й ображається (§8.7). */
function freeCat(state: GameState, cat: Cat, rng: Rng): void {
  const upset = cageStage(cat) === "stress" || cageStage(cat) === "chew";
  delete cat.cage;
  cat.away = null;
  const at = visibleFloorNear(state, { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y - 0.6 });
  cat.x = at.x;
  cat.y = at.y;
  cat.act = idleAct(1);
  if (!upset) return;
  const spot = hideSpot(state, rng, cat);
  startAct(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
  offend(state, cat, CARRIER.offense, "переноска");
  stress(state, cat);
}

/** Посадити кота з рук (§8.7). Місця немає — false, це відмова. */
export function seatCat(state: GameState, cat: Cat): boolean {
  const { home } = state;
  const caged = (home.caged ??= []);
  if (caged.length >= carrierRoom(home)) return false;
  bite(state, stateRng(state, "behavior"));
  state.character.held = null;
  caged.push(cat.id);
  cat.away = "carrier";
  cat.cage = { clock: 0, cry: 0 };
  cat.act = idleAct();
  if (traitLevel(cat, "carrier") < 0) observe(state, cat, "carrier", -1);
  emit(state, { type: "cat-seated", cat: cat.id, seated: caged.length, room: carrierRoom(home) });
  return true;
}

/** Випустити всіх котів (§8.7); гризене після цього ціле, доки не зламане. */
export function releaseCats(state: GameState): void {
  const rng = stateRng(state, "behavior");
  bite(state, rng);
  const cats = cagedCats(state);
  for (const cat of cats) freeCat(state, cat, rng);
  state.home.caged = [];
  for (const carrier of state.home.carriers) carrier.wear = 0;
  emit(state, { type: "carrier-opened", cats: cats.length });
}

/** Прибрати переноску з дому: коти з неї виходять, решта пересідає за тим самим правилом. */
function removeCarrier(state: GameState, index: number, rng: Rng): void {
  const inside = cellmates(state, index);
  const { home } = state;
  home.carriers.splice(index, 1);
  home.caged = (home.caged ?? []).filter((id) => !inside.some((c) => c.id === id));
  for (const cat of inside) freeCat(state, cat, rng);
}

/** Викинути переноску (§8.7): хто спав у ній і хто сидів, вилазять. Поки коти в поїздці, не викинути. */
export function discardCarrier(state: GameState, index: number): boolean {
  if (state.home.carriers[index] === undefined || (state.trip?.riders?.length ?? 0) > 0) return false;
  removeCarrier(state, index, stateRng(state, "behavior"));
  for (const cat of state.cats) if (cat.act.kind === "sleep" && cat.act.target === "carrier" && state.home.carriers.length === 0) cat.act = idleAct();
  return true;
}

/** Кіт догриз переноску (§8.7): вона зламана, уламки поруч, тріск, коти на волі. */
function breakCarrier(state: GameState, index: number, rng: Rng): void {
  removeCarrier(state, index, rng);
  addMess(state, "broken", { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y - 0.4 }, null);
  emit(state, { type: "broke", what: "carrier" });
  loudNoise(state, "broken", CARRIER_SPOT);
}

/** Хвилини кота під замком (§8.7). `present` — персонаж удома не спить: смерть уночі рахує ранок. */
export function tickCaged(state: GameState, cat: Cat, minutes: number, rng: Rng, present: boolean): void {
  const cage = cat.cage;
  if (!cage) return;
  const hours = minutes / MINUTES_PER_HOUR;
  const wants = needsSomething(cat);
  if (wants && cageStage(cat) === "calm") {
    cage.alarmed = true;
    cage.clock = CARRIER.stages.cry * cageTrait(cat).stages;
    cage.cry = Infinity;
  }
  const index = carrierOf(state, cat);
  const pair = cellmates(state, index).length > 1;
  cage.clock += minutes * (wants ? CARRIER.needPace : 1) * (pair ? CARRIER.pairPace : 1);
  const stage = cageStage(cat);
  const trait = cageTrait(cat);
  const mood = CARRIER.moodPerHour[stage] * trait.mood * hours;
  if (mood !== 0) changeMood(state, cat, mood, "переноска");
  if (stage !== "calm") {
    cage.cry += minutes;
    if (cage.cry >= CARRIER.cryEvery[stage]) {
      cage.cry = 0;
      emit(state, { type: "carrier-cry", cat: cat.id });
    }
  }
  if (VITAL.some((need) => cat.needs[need] >= CARRIER.vitalNeed)) {
    changeHealth(state, cat, -CARRIER.healthPerHour * hours, "переноска");
    if (cat.health <= 0) return dieCaged(state, cat, present);
  }
  if (stage !== "chew") return;
  const carrier = state.home.carriers[index];
  if (!carrier) return;
  carrier.wear += minutes * trait.chew;
  if (carrier.wear >= CARRIER.strength[carrier.quality]) breakCarrier(state, index, rng);
}

/** Кіт не дочекався (§8.7): помирає одразу; уночі втрату рахує ранок, як і будь-яку іншу. */
function dieCaged(state: GameState, cat: Cat, present: boolean): void {
  removeCat(state, cat, { kind: "carrier" }, state.day);
  if (present) applyMorningSanity(state, 1, 0);
}

/**
 * Хто їде в поїздку (§8.5): посаджені — зі своїх переносок, спершу дорогі, і той, що на руках. Годинники зникають; посаджені виходять
 * після повернення разом із рештою.
 */
export function boardCats(state: GameState, inHands: Cat | null): TripRider[] {
  const riders: TripRider[] = cagedCats(state).map((cat) => ({ cat: cat.id, place: state.home.carriers[carrierOf(state, cat)]?.quality ?? "cheap" }));
  for (const cat of cagedCats(state)) {
    delete cat.cage;
    cat.away = "trip";
  }
  state.home.caged = [];
  for (const carrier of state.home.carriers) carrier.wear = 0;
  if (inHands) riders.push({ cat: inHands.id, place: "hands" });
  return riders;
}

/** Новонародженого не садять (§8.7). */
export const canSeat = (cat: Cat): boolean => !isNewborn(cat);
