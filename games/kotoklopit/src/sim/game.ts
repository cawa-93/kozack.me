// Хід гри: нова гра, плин часу, сон, знімки на початок дня й тижня, перегравання
// і збереження в JSON (§6.1).

import { IDLE, tap, tickActivity, tickStove, type Input } from "./actions";
import { isMoving, moveBody, newBody, unstickBody } from "./body";
import { greetAtDoor, tickCats } from "./catai";
import { visibleFloorNear } from "./catmove";
import { isSolid } from "./home";
import { passAwakeTime } from "./character";
import { ACCIDENT, CYCLE, FIRST_DAY_MODIFIER, MINUTES_PER_HOUR, MODIFIERS, PRODUCTS, START_MONEY, START_STATS } from "./config";
import { newHome, tickDeliveries } from "./economy";
import { openDoor, ringBell } from "./door";
import { emit, endGame } from "./events";
import { runNight } from "./night";
import { createRng, deriveSeed, stateRng, seedDay, streamSeed } from "./rng";
import { newRace, type RaceInput } from "./race";
import { accidentBedtime, driveTrip, endTrip } from "./trips";
import { annoyingMesses, tickHousehold, upgradeFeeder } from "./household";
import { canGoToSleep, collapseMinute, wakeMinute } from "./sleep";
import { migrateTraits } from "./traits";
import { isLastDay, weekdayOf } from "./time";
import type { Chronotype, Difficulty, GameState, Look, NightReport, Product, Save, Sex } from "./types";
import { isWorking, newJob, stopWork, tickWork } from "./work";
import { momAtNight, powerOut, tickModifiers } from "./modifiers";

export const SAVE_VERSION = 13;

const EPSILON = 1e-6;

/** Імена за замовчуванням; власне ім'я задасть конструктор персонажа (§5.1). */
const DEFAULT_NAME: Record<Sex, string> = { female: "Марта", male: "Тарас" };
/** Зовнішність за замовчуванням: такою вона була до конструктора (§5.1). */
export const DEFAULT_LOOK: Record<Sex, Look> = {
  female: { face: 0, skin: 1, hair: 1, hairColor: 1, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 },
  male: { face: 0, skin: 1, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 1, bottom: 0, shoes: 0 },
};

export interface NewGameOptions {
  sex: Sex;
  difficulty: Difficulty;
  name?: string;
  look?: Look;
  /** Хронотип обирає гравець (§5.1); без нього — як було: жінка — жайворонок, чоловік — сова. */
  chronotype?: Chronotype;
  seed?: number;
}

export function newGame(options: NewGameOptions): Save {
  const { sex, difficulty } = options;
  const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
  const state: GameState = {
    seed,
    replays: 0,
    difficulty,
    day: 0,
    minute: 0,
    dayStartMinute: 0,
    character: {
      name: options.name?.trim() || DEFAULT_NAME[sex],
      look: options.look ?? DEFAULT_LOOK[sex],
      sex,
      // Хронотип обирає гравець (§5.1); режим розробки може змінити його окремо (§11.5).
      chronotype: options.chronotype ?? (sex === "female" ? "lark" : "owl"),
      stats: { ...START_STATS },
      money: START_MONEY,
      sleepSpeed: 0,
      body: newBody(),
      held: null,
      activity: null,
      depressed: false,
      illnesses: [],
      shortNights: 0,
      restedNights: 0,
      // День початку циклу на старті випадковий (§4.1, `DAY_MODIFIERS.md`).
      cycleStart: -Math.floor(createRng(deriveSeed(seed, 28)).next() * CYCLE.days),
      beard: { shaved: 0, trimmed: -100 },
    },
    job: newJob(),
    home: newHome(),
    modifiers: { day: FIRST_DAY_MODIFIER, week: null },
    today: { callAt: null, meetingMinutes: 0, vaccinated: false, vaccineMissedUntil: -1, officeDone: false, foundling: false, lastFoundling: -100, utilitiesDiscount: 0, earlyWake: 0 },
    cats: [],
    relations: {},
    trip: null,
    shelter: null,
    breeder: null,
    ads: [],
    album: [],
    stats: { minutes: { work: 0, cats: 0, self: 0, bustle: 0 }, raised: { shelter: 0, "shelter-forced": 0, born: 0, breeder: 0, foundling: 0 } },
    nextId: 1,
    rng: { conditions: 0, behavior: 0 },
    lastNight: null,
    end: null,
  };
  state.minute = wakeMinute(state);
  state.dayStartMinute = state.minute;
  seedDay(state);
  return { version: SAVE_VERSION, current: state, dayStart: clone(state), weekStart: clone(state) };
}

/**
 * Прокрутити ігровий час, поки персонаж не спить, з керуванням гравця на цей час.
 * Якщо настала пора падати без сил (§8.8), персонаж засинає, а решта часу пропадає.
 * Повертає звіт про ніч, якщо вона настала.
 */
export function advance(save: Save, minutes: number, input: Input = IDLE): NightReport | null {
  const state = save.current;
  let left = minutes;
  while (state.end === null) {
    const untilCollapse = collapseMinute(state) - state.minute;
    if (untilCollapse < EPSILON) {
      state.minute = Math.max(state.minute, collapseMinute(state));
      return sleep(save, true);
    }
    if (left < EPSILON) break;
    // Кроки не перетинають цілих хвилин: межі (09:00, 10:15, поріг показника) спрацьовують точно.
    const untilNextMinute = Math.floor(state.minute + EPSILON) + 1 - state.minute;
    const step = Math.min(left, untilCollapse, untilNextMinute);
    tick(state, step, input);
    left -= step;
  }
  return null;
}

const CAT_TRIPS = new Set(["vet", "groomer", "shelter", "breeder", "show"]);
const CAT_USES = /^(item|mess):|^vacuum$/;

/** На що йде час (§4.2): робота, коти, собі чи «метушня» — ходіння між справами. */
function timeCategory(state: GameState, input: Input): keyof GameState["stats"]["minutes"] | null {
  const trip = state.trip;
  if (trip) return trip.destination === "office" ? "work" : CAT_TRIPS.has(trip.destination) ? "cats" : "self";
  const activity = state.character.activity;
  if (activity?.kind === "work") return "work";
  if (activity?.kind === "pet" || activity?.kind === "play") return "cats";
  // Купання кота — час на котів (§4.2; перевірка купання 2026-10-28: ішло в «собі»).
  if (activity?.kind === "use") return activity.bath === true || CAT_USES.test(activity.target) ? "cats" : "self";
  return isMoving(input.move) ? "bustle" : null;
}

/** Усе, що відбувається за крок часу вдень. Поки персонаж у поїздці, удома його немає (§8.5). */
function tick(state: GameState, minutes: number, input: Input): void {
  const from = state.minute;
  const category = timeCategory(state, input);
  if (category) state.stats.minutes[category] += minutes;
  const away = state.trip !== null;
  if (!away) {
    tickActivity(state, input, minutes);
    moveBody(state, state.character.activity === null ? input.move : IDLE.move, minutes);
  }
  if (powerOut(state) && isWorking(state)) stopWork(state);
  tickWork(state, from, minutes);
  tickModifiers(state, from, minutes, isWorking(state));
  tickStove(state, minutes);
  tickHousehold(state, from, minutes);
  tickCats(state, minutes, { present: !away });
  if (!away) annoyingMesses(state, minutes);
  // Поки день перемотується після аварії, показники не нижче 5 (§8.5).
  passAwakeTime(state, minutes / MINUTES_PER_HOUR, state.trip?.phase === "accident" ? ACCIDENT.floor : 0);
  state.minute += minutes;
  // Кур'єр дзвонить у двері (§9.12 «Двері й гості»): коти реагують на дзвінок.
  if (tickDeliveries(state) > 0) ringBell(state, false);
}

/** Хвилини гонки (§8.5); при аварії день перемотується до сну. Повертає звіт про ніч, якщо вона настала. */
export function drive(save: Save, minutes: number, input: RaceInput): { result: "arrived" | "crash" | null; night: NightReport | null } {
  let night: NightReport | null = null;
  const clock = {
    advance: (m: number): boolean => (night = advance(save, m) ?? night) !== null,
    rng: stateRng(save.current, "behavior"),
  };
  const result = driveTrip(save.current, clock, minutes, input);
  return { result, night };
}

/**
 * Після аварії (§8.5): решта дня проходить без персонажа до оптимального часу сну, потім він удома
 * й засинає. Якщо аварія сталася пізніше, засинає одразу.
 */
export function rewindAccident(save: Save): NightReport | null {
  const state = save.current;
  const left = accidentBedtime(state) - state.minute;
  if (left > 0) {
    const night = advance(save, left);
    if (night || state.end !== null) return night;
  }
  endTrip(state);
  return sleep(save, false);
}

/**
 * Віднести знайду в притулок (§4.1): дві години персонаж поза домом — як поїздка без гонки й без картки на місці; повертаючись,
 * відчиняє двері (перевірка розмноження 2026-10-28: раніше ці дві години гра рахувала так, ніби він удома).
 */
export function carryFoundling(save: Save): NightReport | null {
  const state = save.current;
  if (state.trip !== null || state.end !== null) return null;
  state.trip = { destination: "shelter", phase: "visit", cat: null, race: newRace(0, 0), losses: [], visit: 0, seed: 0, foundling: true };
  return returnHome(save, MODIFIERS.foundlingShelterMinutes, 0);
}

/** Подія на місці забрала хвилини, потім персонаж їде додому без гонки (§8.5). */
export function returnHome(save: Save, visitMinutes: number, roadMinutes: number): NightReport | null {
  // Час, поки шукали шкарпетку перед виїздом (§9.12, «Подарунки й схованки»), — теж час поїздки.
  const search = save.current.trip?.search ?? 0;
  const night = advance(save, visitMinutes + search) ?? advance(save, roadMinutes);
  if (night || save.current.end !== null) return night;
  // Коти, що заходять разом із персонажем: з переноски й щойно взяті в притулку чи розпліднику.
  const arrived = save.current.cats.filter((c) => c.away === "trip").map((c) => c.id);
  if (endTrip(save.current)) {
    // Персонаж відчинив двері (§9.12 «Двері й гості»): кіт біля них може вибігти — крім тих, що заходять із ним.
    openDoor(save.current, arrived);
    // Персонаж повернувся вдень — коти можуть вийти зустрічати до дверей (§9.12, «Відданість»).
    greetAtDoor(save.current, arrived);
  }
  return null;
}

/** Коротке натискання дії (§10). Повертає звіт про ніч, якщо персонаж ліг спати. */
export function interact(save: Save): NightReport | null {
  return tap(save.current) === "sleep" ? goToSleep(save) : null;
}

/** Лягти спати (§8.8). Повертає звіт про ніч або null, якщо після цього дня — пенсія. */
export function goToSleep(save: Save): NightReport | null {
  const state = save.current;
  if (state.end !== null) throw new Error("Гру вже закінчено");
  if (!canGoToSleep(state)) throw new Error("Ще зарано лягати спати");
  return sleep(save, false);
}

function sleep(save: Save, collapsed: boolean): NightReport | null {
  const state = save.current;
  // Персонаж засинає вдома, навіть якщо ніч застала його в поїздці.
  endTrip(state);
  // Гостинці мами, що чекали під дверима чи щойно приїхали з нею, — пакет судочків у ящиках біля входу (§4.1, §6.4).
  momAtNight(state);
  // Неділя 50-го тижня: пенсія, остання ніч уже не обробляється (§4.2).
  if (isLastDay(state.day)) {
    endGame(state, "retirement");
    return null;
  }
  const report = runNight(state, collapsed);
  // Якщо гра закінчилася вночі, знімки не оновлюються: переграти можна день, що минув (§6.4).
  if (state.end === null) {
    save.dayStart = clone(state);
    if (weekdayOf(state.day) === 0) save.weekStart = clone(state);
  }
  emit(state, { type: "night", report });
  return report;
}

/** Переграти день зі стану, з яким гравець у нього увійшов (§6.1). */
export function replayDay(save: Save): void {
  restore(save, save.dayStart);
}

/** Переграти тиждень з понеділка (§6.1). */
export function replayWeek(save: Save): void {
  save.dayStart = clone(save.weekStart);
  restore(save, save.weekStart);
}

// Умови дня повторюються, а поведінка котів генерується заново (§6.1).
function restore(save: Save, snapshot: GameState): void {
  const replays = save.current.replays + 1;
  save.current = clone(snapshot);
  save.current.replays = replays;
  // Умови дня — зі знімка (модифікатор уже обрано з них), поведінка — нова.
  save.current.rng.behavior = streamSeed(save.current.seed, "behavior", save.current.day, replays);
}

export function serialize(save: Save): string {
  return JSON.stringify(save);
}

export function deserialize(json: string): Save {
  const data: unknown = JSON.parse(json);
  const version = typeof data === "object" && data !== null && "version" in data ? data.version : undefined;
  if (version !== SAVE_VERSION) throw new Error(`Непідтримувана версія збереження: ${String(version)}`);
  const save = data as Save;
  for (const state of [save.current, save.dayStart, save.weekStart]) {
    upgradeFeeder(state);
    upgradeTraits(state);
    upgradeWardrobe(state);
    upgradeSupplies(state);
  }
  return save;
}

/** Нові запаси (котяча м'ята, 2026-10-26, §9.12): у старих збереженнях їх немає — порожньо. */
export function upgradeSupplies(state: GameState): void {
  for (const product of Object.keys(PRODUCTS) as Product[]) state.home.supplies[product] ??= { cheap: 0, premium: 0 };
}

/**
 * Шафа в спальні (2026-10-26, §9.12 «Лазіння») і підвіконня (2026-10-26, «Вікно») стали там, де в грі, збереженій раніше, міг
 * стояти персонаж чи лежати іграшка, безлад або скинута дрібничка: персонажа — на вільну клітинку поруч, речі — на видну підлогу
 * поруч (перевірка етапу 2026-10-26).
 */
export function upgradeWardrobe(state: GameState): void {
  unstickBody(state);
  const toys = state.home.items.filter((item) => item.kind === "toy");
  const fallen = Object.values(state.home.trinkets ?? {}).filter((t) => t !== undefined);
  for (const thing of [...toys, ...state.home.messes, ...fallen]) {
    if (!isSolid(state, Math.floor(thing.x), Math.floor(thing.y))) continue;
    const at = visibleFloorNear(state, thing);
    thing.x = at.x;
    thing.y = at.y;
  }
}

/**
 * Злиті групи рис (2026-10-25): у котів удома, у притулку, у розпліднику й в альбомі пам'яті. Ще й для сценаріїв
 * режиму розробки, збережених зі старої гри.
 */
export function upgradeTraits(state: GameState): void {
  const cats = [...state.cats, ...(state.shelter?.cats ?? []), ...(state.breeder?.cats ?? [])];
  for (const cat of cats) cat.traits = migrateTraits(cat.traits);
  for (const entry of state.album) entry.traits = migrateTraits(entry.traits);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
