// Хід гри: нова гра, плин часу, сон, знімки на початок дня й тижня, перегравання
// і збереження в JSON (§6.1).

import { catchEscaped, IDLE, tap, tickActivity, tickStove, type Input } from "./actions";
import { isMoving, moveBody, newBody, unstickBody } from "./body";
import { greetAtDoor, tickCats } from "./catai";
import { breedById, isPurebred } from "./breeds";
import { visibleFloorNear } from "./catmove";
import { isSolid } from "./home";
import { passAwakeTime } from "./character";
import { FIRST_DAY_MODIFIER, LEGACY_POSITION_PAY, MINUTES_PER_HOUR, MODIFIERS, POSITIONS, PRODUCTS, SINGLE_VARIANT, START_MONEY, START_STATS, TRIPS } from "./config";
import { newHome, tickDeliveries } from "./economy";
import { openDoor, ringBell } from "./door";
import { emit, endGame } from "./events";
import { upgradeAlbumDays } from "./farewell";
import { applyPureBreedLook } from "./genetics";
import { runNight } from "./night";
import { stateRng, seedDay, streamSeed } from "./rng";
import { newRace, type RaceInput } from "./race";
import { accidentBedtime, driveTrip, endTrip, roadMinutes, visitMinutes } from "./trips";
import { annoyingMesses, tickHousehold, upgradeFeeder } from "./household";
import { canGoToSleep, collapseMinute, wakeMinute } from "./sleep";
import { migrateTraits } from "./traits";
import { isLastDay, weekdayOf } from "./time";
import type { Address, Chronotype, Difficulty, GameState, Look, NightReport, Product, Quality, Save } from "./types";
import { isWorking, newJob, stopWork, tickWork } from "./work";
import { internetOut, momAtNight, tickModifiers } from "./modifiers";

export const SAVE_VERSION = 13;

const EPSILON = 1e-6;

/** Імена за замовчуванням за звертанням (ім'я в текстах узгоджується з ним); власне ім'я задасть гравець (§5.1). */
export const DEFAULT_NAME: Record<Address, string> = { she: "Марта", he: "Тарас" };
/**
 * Зовнішність без редактора — сценарій, нова гра в режимі розробки, тести (§5.1): одна для всіх, хоч би яке звертання (рішення
 * автора 2026-10-29, `GENERAL_REVIEW.md`, А4). Це та, що раніше була за замовчуванням у жіночого персонажа.
 */
export const DEFAULT_LOOK: Readonly<Look> = { face: 0, skin: 1, hair: 1, hairColor: 1, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 };

export interface NewGameOptions {
  /** Звертання в текстах (§5.1): лише граматика, на гру не впливає. */
  address: Address;
  difficulty: Difficulty;
  name?: string;
  look?: Look;
  /** Хронотип обирає гравець (§5.1); без нього — жайворонок, хоч би яке звертання. */
  chronotype?: Chronotype;
  seed?: number;
}

/** Seed нової гри (§6.1): єдина випадковість поза `rng.ts`. Редактор персонажа бере його наперед — для зовнішності (§5.1). */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

export function newGame(options: NewGameOptions): Save {
  const { address, difficulty } = options;
  const seed = (options.seed ?? newSeed()) >>> 0;
  const state: GameState = {
    seed,
    replays: 0,
    difficulty,
    day: 0,
    minute: 0,
    dayStartMinute: 0,
    character: {
      name: options.name?.trim() || DEFAULT_NAME[address],
      // Копія: зовнішність за замовчуванням спільна, а стан гри — свій.
      look: { ...(options.look ?? DEFAULT_LOOK) },
      address,
      // Хронотип обирає гравець (§5.1); режим розробки може змінити його окремо (§11.5).
      chronotype: options.chronotype ?? "lark",
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
    },
    job: newJob(),
    home: newHome(),
    modifiers: { day: FIRST_DAY_MODIFIER, week: null },
    today: { callAt: null, meetingMinutes: 0, officeDone: false, foundling: false, lastFoundling: -100, utilitiesDiscount: 0, earlyWake: 0 },
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
  return { version: SAVE_VERSION, current: state, dayStart: clone(state), weekStart: clone(state), morning: null };
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
  // Поки день перемотується після аварії, персонаж нічого не робить: цей час не рахується (§4.2, загальна ревізія 2026-10-29).
  if (trip) return trip.phase === "accident" ? null : trip.destination === "office" ? "work" : CAT_TRIPS.has(trip.destination) ? "cats" : "self";
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
  if (internetOut(state) && isWorking(state)) stopWork(state);
  tickWork(state, from, minutes);
  tickModifiers(state, from, minutes, isWorking(state));
  tickStove(state, minutes);
  tickHousehold(state, from, minutes);
  tickCats(state, minutes, { present: !away });
  if (!away) annoyingMesses(state, minutes);
  // Поки день перемотується після аварії, показники не нижче 5, ситість — не нижче 25, а голод не забирає здоров'я (§8.5, А1).
  passAwakeTime(state, minutes / MINUTES_PER_HOUR, state.trip?.phase === "accident");
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
 * й засинає (додому його повертає `sleep`, і ця ніч знімків не оновлює, §6.1). Якщо аварія сталася пізніше, засинає одразу.
 */
export function rewindAccident(save: Save): NightReport | null {
  const state = save.current;
  const left = accidentBedtime(state) - state.minute;
  if (left > 0) {
    const night = advance(save, left);
    if (night || state.end !== null) return night;
  }
  return sleep(save, false);
}

/**
 * Віднести знайду в притулок (§4.1): дві години персонаж поза домом — як поїздка без гонки й без картки на місці; повертаючись,
 * відчиняє двері (перевірка розмноження 2026-10-28: раніше ці дві години гра рахувала так, ніби він удома). Кота, що вибіг на
 * сходи, коли двері відчинили знайді, персонаж спершу ловить, як перед поїздкою (§9.12 «Втечі», загальна ревізія 2026-10-29).
 */
export function carryFoundling(save: Save): NightReport | null {
  const state = save.current;
  if (state.trip !== null || state.end !== null) return null;
  catchEscaped(state);
  state.trip = { destination: "shelter", phase: "visit", cat: null, race: newRace(0, 0), losses: [], visit: 0, seed: 0, foundling: true };
  return returnHome(save, MODIFIERS.foundlingShelterMinutes, 0);
}

/**
 * «Додому» з місця (§8.5): час на місці — у ветеринара, лікаря, грумера й на виставці лише за отримані послуги, а без жодної —
 * 15 хвилин (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6), — і дорога додому.
 */
export function goHome(save: Save): NightReport | null {
  const trip = save.current.trip;
  if (trip?.phase !== "visit") return null;
  return returnHome(save, visitMinutes(trip), roadMinutes(save.current, trip.destination));
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
  // Ніч, що настала через аварію (кінець перемотування, §8.5), — з поїздки, яка ще в аварії: її треба розпізнати до `endTrip`.
  const afterAccident = state.trip?.phase === "accident";
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
  if (state.end === null) updateSnapshots(save, afterAccident);
  emit(state, { type: "night", report });
  return report;
}

/**
 * Знімки перегравання після ночі, у якій гра не закінчилася (§6.1). Звичайна ніч робить ними ранок нового дня й понеділок його
 * тижня. Ніч після аварії — ранок дня аварії й понеділок її тижня, навіть коли вона сталася в неділю, а ранок нового дня гра
 * пам'ятає окремо, у `morning` (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А1). Тож коли аварії йдуть поспіль, «Переграти
 * день» повертає на ранок останньої з них, а не першої; а перша звичайна ніч після аварії в неділю робить знімком тижня понеділок
 * після неї — цей день гравець уже прожив (рецензія реалізації А1, 2026-10-29: раніше обидва знімки «застрягали» на першій
 * аварії ланцюжка, а «Переграти тиждень» увесь тиждень після аварії в неділю відкидав на тиждень назад).
 */
function updateSnapshots(save: Save, afterAccident: boolean): void {
  // Ранок дня, що минув, і понеділок його тижня: знімок тижня — завжди понеділок тижня знімка дня, тож він відстає від
  // поточного тижня, лише коли той почався з ночі після аварії, — і тоді понеділок поточного тижня й є `morning`.
  const morning = save.morning ?? save.dayStart;
  const monday = weekdayOf(morning.day) === 0 ? morning : save.weekStart;
  const state = clone(save.current);
  if (afterAccident) {
    save.dayStart = clone(morning);
    save.weekStart = clone(monday);
    save.morning = state;
  } else {
    save.dayStart = state;
    save.weekStart = clone(weekdayOf(state.day) === 0 ? state : monday);
    save.morning = null;
  }
}

/** Переграти день зі стану, з яким гравець у нього увійшов (§6.1); після аварії — з ранку дня аварії (А1). */
export function replayDay(save: Save): void {
  restore(save, save.dayStart);
}

/** Переграти тиждень з понеділка (§6.1); після аварії — з понеділка тижня аварії (А1). */
export function replayWeek(save: Save): void {
  save.dayStart = clone(save.weekStart);
  restore(save, save.weekStart);
}

// Умови дня повторюються, а поведінка котів генерується заново (§6.1).
function restore(save: Save, snapshot: GameState): void {
  const replays = save.current.replays + 1;
  save.current = clone(snapshot);
  // Поточний ранок — знову сам знімок дня.
  save.morning = null;
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
  // Ранку після аварії окремо від знімків старіші збереження не пам'ятають (рецензія реалізації А1, 2026-10-29).
  save.morning ??= null;
  for (const state of [save.current, save.dayStart, save.weekStart, save.morning]) if (state !== null) upgradeState(state);
  return save;
}

/**
 * Усі оновлення стану, збереженого старішою версією гри: і для збережень (`deserialize`), і для сценаріїв режиму розробки
 * (`applyScenario`), щоб нова міграція одразу діяла для обох (загальна ревізія 2026-10-29: сценарії мігрували лише риси, і стара
 * автогодівниця в сценарії не працювала, а комунальні за неї нараховувалися).
 */
export function upgradeState(state: GameState): void {
  upgradeCharacter(state);
  upgradeModifiers(state);
  upgradeFeeder(state);
  upgradeTraits(state);
  upgradeWardrobe(state);
  upgradeSupplies(state);
  upgradeAlbumDays(state);
  upgradeDiseases(state);
  upgradeTrip(state);
  upgradeLadder(state);
  upgradeBreedLook(state);
}

/**
 * Чистокровний — і гени породи (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А9; §9.11): чистокровний кіт, народжений удома
 * в грі, збереженій раніше, мав від породи лише форми, — тепер він отримує й гени породи, як отримав би кошеням, щоб картка не
 * писала про породу того, чого в кота немає (рецензія реалізації А9, 2026-10-29, рішення виконавця). Без випадковості, тож
 * повторне завантаження нічого не змінює. Коти з притулку, розплідника й знайди мали гени породи й раніше, а альбом пам'яті
 * лишається, яким був.
 */
export function upgradeBreedLook(state: GameState): void {
  for (const cat of state.cats) if (cat.source === "born" && isPurebred(cat.breed)) applyPureBreedLook(cat.genes, cat.shape, breedById(cat.breed[0]));
}

/**
 * Драбина з 15 посад (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А10; §8.6): у збереженні з колишньою драбиною з 10 посад
 * (поля `ladder` немає) посада стає посадою нової драбини з найближчою погодинною оплатою — зарплата майже та сама, — але
 * директором лишається лише директор: колишні 43–62 ₴ («Керівник групи», «Керівник відділу», «Директор напряму») стають
 * «Заступником директора». Репутація лишається.
 */
export function upgradeLadder(state: GameState): void {
  const job = state.job;
  if (job.ladder === undefined) job.position = legacyPosition(job.position);
  job.ladder = POSITIONS.length;
}

/** Посада нової драбини для посади колишньої (`upgradeLadder`). */
export function legacyPosition(old: number): number {
  const director = POSITIONS.length - 1;
  if (old >= LEGACY_POSITION_PAY.length - 1) return director;
  const pay = LEGACY_POSITION_PAY[Math.max(0, old)] ?? 0;
  let best = 0;
  for (let i = 1; i < director; i++) {
    if (Math.abs((POSITIONS[i]?.pay ?? 0) - pay) < Math.abs((POSITIONS[best]?.pay ?? 0) - pay)) best = i;
  }
  return best;
}

/**
 * Персонаж без статі (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4): стать зі старого збереження стає звертанням у текстах
 * (чоловіча — «він», жіноча — «вона»), а дні жіночого циклу (`cycleStart`) і гоління й підрівнювання (`beard`) зникають. Хронотип
 * у збереженні вже записаний — його не чіпають.
 */
export function upgradeCharacter(state: GameState): void {
  const character = state.character as GameState["character"] & { sex?: unknown };
  if (character.sex !== undefined) {
    character.address ??= character.sex === "male" ? "he" : "she";
    Reflect.deleteProperty(character, "sex");
  }
  Reflect.deleteProperty(character, "cycleStart");
  Reflect.deleteProperty(character, "beard");
}

/**
 * «Щеплення» прибрано (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А14): день, збережений з ним, — день без модифікатора, а
 * пропущене щеплення більше нічого не важить — поля про нього зникають.
 */
export function upgradeModifiers(state: GameState): void {
  if (state.modifiers.day === "vaccination") state.modifiers.day = null;
  Reflect.deleteProperty(state.today, "vaccinated");
  Reflect.deleteProperty(state.today, "vaccineMissedUntil");
}

/**
 * Поїздки, що нічого не давали (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15). Котокафе прибрано: поїздку туди, на якій
 * гру збережено, гра завершує — дорогою чи на місці персонаж уже вдома біля дверей (оплачене в кафе своє вже дало). Після аварії
 * день, як і раніше, перемотується до сну: поїздку лише записано на магазин — так само «собі» й без кота, а картка аварії пункту
 * не називає. «Віддати» з притулку прибрано: запис про кота, якого там уже віддали, зникає з журналу візиту (кіт — в альбомі),
 * а кіт, що приїхав у переносці й лишився, повертається з персонажем додому.
 */
export function upgradeTrip(state: GameState): void {
  const trip = state.trip;
  if (trip === null) return;
  if (trip.log) trip.log.done = trip.log.done.filter((done) => !done.startsWith("given:"));
  if ((trip.destination as string) === "cafe") {
    if (trip.phase === "accident") trip.destination = "shop";
    else endTrip(state);
    return;
  }
  // Час на місці — лише за отримані послуги (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6): у старій грі поїздка
  // до ветеринара, лікаря, грумера чи на виставку вже на старті мала повний час послуги. Якщо на місці ще нічого не отримали
  // (журнал візиту порожній), цього часу немає — «Додому» забере 15 хвилин; отримане вже рахується, як і раніше.
  const served = trip.log !== undefined && (trip.log.exam !== null || trip.log.done.length > 0);
  if (TRIPS[trip.destination].service && !served) trip.visit = 0;
}

/**
 * «Старечих болячок» немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А13): у старих збереженнях їх знімають з котів удома,
 * у притулку й у розпліднику разом зі шкодою від них у журналі здоров'я, а кіт, що помер від них, в альбомі пам'яті пішов від
 * старості.
 */
export function upgradeDiseases(state: GameState): void {
  const removed = (id: string): boolean => id === "senior";
  const cats = [...state.cats, ...(state.shelter?.cats ?? []), ...(state.breeder?.cats ?? [])];
  for (const cat of cats) {
    cat.diseases = cat.diseases.filter((d) => !removed(d.id));
    cat.healthLog = cat.healthLog.filter((entry) => entry.source !== "disease:senior");
  }
  for (const entry of state.album) if (entry.cause?.kind === "disease" && removed(entry.cause.disease)) entry.cause = { kind: "old" };
}

/**
 * Нові запаси (котяча м'ята, 2026-10-26, §9.12): у старих збереженнях їх немає — порожньо. Дзвіночка більше немає (рішення автора
 * 2026-10-29, `GENERAL_REVIEW.md`, А17): його запас в аптечці, у ящиках біля входу й у пакунках, що їдуть чи чекають під дверима,
 * зникає (5 ₴ за пакунок не повертають — дрібниця). Нашийник тепер один, без якостей (там само): нашийник будь-якої якості на
 * коті — просто нашийник, а дорогі в аптечці, у ящиках і в пакунках стають такими самими, як дешеві.
 */
export function upgradeSupplies(state: GameState): void {
  const home = state.home;
  const gone = (product: string): boolean => product === "bell";
  for (const product of Object.keys(home.supplies)) if (gone(product)) Reflect.deleteProperty(home.supplies, product);
  for (const product of Object.keys(home.boxes ?? {})) if (gone(product)) Reflect.deleteProperty(home.boxes ?? {}, product);
  home.acquired = home.acquired.filter((p) => !gone(p));
  if (home.ranOut) home.ranOut = home.ranOut.filter((p) => !gone(p));
  if (home.phoneHints) home.phoneHints = home.phoneHints.filter((p) => !gone(p));
  home.deliveries = home.deliveries.filter((d) => !("product" in d && gone(d.product)));
  home.porch = home.porch.filter((d) => !("product" in d && gone(d.product)));
  const cats = [...state.cats, ...(state.shelter?.cats ?? []), ...(state.breeder?.cats ?? [])];
  for (const cat of cats) cat.collar = Boolean(cat.collar);
  const single = (stock: Record<Quality, number> | undefined): void => {
    if (!stock) return;
    stock.cheap += stock.premium;
    stock.premium = 0;
  };
  for (const product of SINGLE_VARIANT) {
    single(home.supplies[product]);
    single(home.boxes?.[product]);
  }
  for (const d of [...home.deliveries, ...home.porch]) if ("product" in d && SINGLE_VARIANT.includes(d.product)) d.quality = "cheap";
  for (const product of Object.keys(PRODUCTS) as Product[]) home.supplies[product] ??= { cheap: 0, premium: 0 };
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
 * режиму розробки, збережених зі старої гри. Заздрість до дорогого корму прибрано (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А16) — разом із полем `premiumAt`, коли кіт востаннє їв такий корм.
 */
export function upgradeTraits(state: GameState): void {
  const cats = [...state.cats, ...(state.shelter?.cats ?? []), ...(state.breeder?.cats ?? [])];
  for (const cat of cats) cat.traits = migrateTraits(cat.traits);
  for (const entry of state.album) entry.traits = migrateTraits(entry.traits);
  for (const cat of state.cats) Reflect.deleteProperty(cat, "premiumAt");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
