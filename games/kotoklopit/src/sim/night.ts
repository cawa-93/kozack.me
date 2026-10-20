// Ніч — обробка між днями, поки персонаж спить (§4). Кроки йдуть строго в порядку §4.

import { dropEverything, tickStove } from "./actions";
import { newBody } from "./body";
import { ageCat, closeCatDay, createCat, traitLevel } from "./cat";
import { tickCats } from "./catai";
import { changeStat, passSleepTime } from "./character";
import {
  BREEDING,
  DIFFICULTY,
  MODIFIERS,
  ILLNESS,
  KITTEN_AGE_WEEKS,
  KITTEN_SANITY_THRESHOLD,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SANITY_FLOOR,
  SHELTER_STARTER_PACK,
  WAKE_UP,
  COLLAPSE_HOURS_BEFORE_WAKE,
} from "./config";
import { addSupply, payUtilities, postponeDeliveries } from "./economy";
import { emit } from "./events";
import { maybeFallIll, nightlyDiseases, weeklyDiseases } from "./diseases";
import { nightlyIllness } from "./illness";
import { nightlyCare } from "./care";
import { nightlyHousehold, tickHousehold } from "./household";
import { collectAds, oldAgeDeaths, zeroHealthDeaths } from "./farewell";
import { initRelations, nightlyRelations } from "./relations";
import { conceive, giveBirth, inHeat, nightlyStates } from "./reproduction";
import { chooseWeekModifier, startModifiers } from "./modifiers";
import { createRng, seedDay, stateRng, streamSeed, type Rng } from "./rng";
import { sleepSpeedAfter, wakeMinute } from "./sleep";
import { isSunday, weekOf } from "./time";
import type { Cat, GameState, NightReport, NightStep } from "./types";
import { morningJob } from "./work";

interface Night {
  state: GameState;
  report: NightReport;
  /** Нічні кидки: на переграванні ті самі (§6.1). */
  rng: Rng;
}

interface Step {
  id: NightStep;
  /** Лише в ніч із неділі на понеділок. */
  weekly?: true;
  run(night: Night): void;
}

const STEPS: readonly Step[] = [
  { id: "sleep", run: sleep },
  // 1. Здоров'я котів від настрою (§9.6) і хвороб (§9.5 — крок 10 плану).
  { id: "cat-health", run: catHealth },
  // 2. Смерть від нульового здоров'я (§9.5).
  { id: "cat-death", run: catDeath },
  // 3. Ніч із неділі на понеділок.
  { id: "cat-age", weekly: true, run: ageCats },
  { id: "age-limit", weekly: true, run: ageLimit }, // §9.2
  { id: "births", weekly: true, run: births }, // §9.8
  { id: "pregnancies", weekly: true, run: pregnancies }, // §9.8
  { id: "utilities", weekly: true, run: utilities },
  { id: "week-modifier", weekly: true, run: weekModifier }, // §4.1
  // 4. Поріг 30% за здоровим глуздом увечері.
  { id: "kitten-check", run: kittenCheck },
  // 5. Ранок: персонаж бачить, що сталося вночі.
  { id: "morning", run: morning },
  // 6. Новий день.
  { id: "new-day", run: newDay },
];

/** Проспати ніч і почати новий день. */
export function runNight(state: GameState, collapsed: boolean): NightReport {
  const sanity = state.character.stats.sanity;
  const report: NightReport = {
    day: state.day,
    sleptHours: 0,
    collapsed,
    weekly: isSunday(state.day),
    wakeUps: [],
    wokeMinute: wakeMinute(state),
    steps: [],
    lostCats: [],
    givenCats: [],
    newCats: [],
    utilities: null,
    sanityEvening: sanity,
    sanityMorning: sanity,
  };
  const night: Night = { state, report, rng: createRng(streamSeed(state.seed, "night", state.day)) };
  for (const step of STEPS) {
    if (step.weekly && !report.weekly) continue;
    step.run(night);
    report.steps.push(step.id);
    // Виселення закінчує гру: решта ночі вже не обробляється (§6.4).
    if (state.end !== null) break;
  }
  state.lastNight = report;
  return report;
}

/**
 * Уранці здоровий глузд змінюється спершу за втрачених котів (не нижче 10%),
 * потім за нових (не вище 100) (§4, §6.2).
 */
export function applyMorningSanity(state: GameState, lost: number, gained: number): void {
  const { lostCatSanity, newCatSanity } = DIFFICULTY[state.difficulty];
  for (let i = 0; i < lost; i++) changeStat(state, "sanity", lostCatSanity, SANITY_FLOOR);
  for (let i = 0; i < gained; i++) changeStat(state, "sanity", newCatSanity);
}

/** Хто й коли будитиме персонажа цієї ночі (§9.12): ранкова побудка й нічні пісні. */
function plannedWakeUps(state: GameState, rng: Rng, from: number, to: number): { cat: Cat; minute: number; reason: "morning" | "night" }[] {
  const wakes: { cat: Cat; minute: number; reason: "morning" | "night" }[] = [];
  const dawn = MINUTES_PER_DAY + WAKE_UP.morningMinute;
  for (const cat of state.cats) {
    if (cat.away !== null) continue;
    // Тиха ніч: коти не будять (§4.1).
    if (state.modifiers.day === "quiet-night" || state.modifiers.day === "quiet-evening") continue;
    // Після феєрверків коти неспокійні.
    if (state.modifiers.day === "festival" && rng.chance(MODIFIERS.festival.wake)) wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night" });
    const nocturnal = traitLevel(cat, "nocturnal");
    // Кішка в тічці кричить уночі (§9.8).
    if (inHeat(state, cat) && rng.chance(BREEDING.heatWake)) wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night" });
    if (nocturnal > 0 && rng.chance(WAKE_UP.nightStep * nocturnal)) {
      wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night" });
    }
    // Чи кіт справді будить, вирішиться о 05:00: якщо він голодний, а миски порожні.
    const chance = WAKE_UP.morningBase + WAKE_UP.morningStep * Math.max(0, traitLevel(cat, "morning"));
    if (dawn > from && dawn < to && rng.chance(chance)) wakes.push({ cat, minute: dawn, reason: "morning" });
  }
  return wakes.sort((a, b) => a.minute - b.minute);
}

/**
 * Сон (§8.8, §9.12): коти живуть ніч, поки персонаж спить, і можуть його розбудити.
 * Розбудили в межах вікна сну — 30 хвилин сну втрачено; пізніше — день починається одразу.
 */
function sleep({ state, report, rng }: Night): void {
  dropEverything(state);
  const start = state.minute;
  // Галасливі сусіди будять раніше (§4.1).
  const planned = wakeMinute(state) + MINUTES_PER_DAY - state.today.earlyWake;
  const wakes = plannedWakeUps(state, rng, start, planned);
  let lost = 0;
  let woke = planned;
  let minute = start;
  while (minute < planned) {
    const nextWake = wakes[0];
    const until = Math.min(planned, nextWake ? nextWake.minute : planned);
    // Коти живуть ніч похвилинно: безлад, порожні миски, брудний лоток (§4).
    while (minute < until) {
      const step = Math.min(1, until - minute);
      tickHousehold(state, minute, step);
      tickCats(state, step, { present: false });
      minute += step;
      state.minute = minute;
    }
    if (!nextWake || minute >= planned) break;
    wakes.shift();
    const { cat, reason } = nextWake;
    // Ранкова побудка — лише якщо кіт голодний і миски порожні.
    if (reason === "morning" && !(cat.needs.hunger >= WAKE_UP.hungry && !state.home.items.some((i) => i.kind === "bowl" && i.food > 0))) continue;
    report.wakeUps.push({ cat: cat.id, reason });
    if ((planned - minute) / MINUTES_PER_HOUR >= COLLAPSE_HOURS_BEFORE_WAKE) {
      lost += WAKE_UP.lostMinutes;
    } else {
      woke = minute;
      break;
    }
  }
  const slept = Math.max(0, woke - start - lost) / MINUTES_PER_HOUR;
  report.sleptHours = slept;
  report.wokeMinute = woke - MINUTES_PER_DAY;
  // Плита вночі не вимикається: страва, що лишилася на ній, підгорає (§8.7).
  tickStove(state, woke - start);
  postponeDeliveries(state);
  passSleepTime(state, slept);
  state.character.sleepSpeed = sleepSpeedAfter(slept);
  nightlyIllness(state, slept);
}

/** Здоров'я котів змінюється від середнього настрою за день (§9.6). */
function catHealth({ state, rng }: Night): void {
  for (const cat of state.cats) closeCatDay(state, cat);
  // Хвороби — після підсумку дня, бо цистит залежить від середнього настрою дня (§9.5).
  nightlyDiseases(state, rng);
  nightlyStates(state, rng);
  nightlyCare(state, rng);
  // Підсумок дня для пар: життя разом зближує (§9.4).
  nightlyRelations(state);
}

function catDeath({ state, report, rng }: Night): void {
  for (const entry of zeroHealthDeaths(state, rng)) report.lostCats.push(entry.id);
}

function ageLimit({ state, report, rng }: Night): void {
  for (const entry of oldAgeDeaths(state, rng)) report.lostCats.push(entry.id);
}

function births({ state, report, rng }: Night): void {
  for (const kitten of giveBirth(state, rng)) {
    addCat(state, kitten);
    report.newCats.push(kitten.id);
  }
}

function pregnancies({ state, rng }: Night): void {
  conceive(state, rng);
}

function weekModifier({ state }: Night): void {
  state.modifiers.week = chooseWeekModifier(state, weekOf(state.day + 1));
}

function ageCats({ state, rng }: Night): void {
  for (const cat of state.cats) ageCat(state, cat, rng);
  weeklyDiseases(state, rng);
}

function utilities({ state, report }: Night): void {
  report.utilities = payUtilities(state);
}

/**
 * Здоровий глузд увечері нижче 30% — персонаж забирає кошеня з притулку (§6.2).
 * Кошеня випадкове: 1 тиждень, 1 риса, жодної відомої; приходить зі стартовим пакетом (§9.12).
 */
function kittenCheck({ state, report, rng }: Night): void {
  if (report.sanityEvening >= KITTEN_SANITY_THRESHOLD) return;
  const cat = createCat(state, rng, { source: "shelter-forced", ageWeeks: KITTEN_AGE_WEEKS });
  cat.arrivedDay = state.day + 1;
  addCat(state, cat);
  // Притулок: блохи (§9.5).
  maybeFallIll(state, cat, "fleas", ILLNESS.shelterFleas, rng);
  giveStarterPack(state);
  report.newCats.push(cat.id);
}

/** Новий кіт у домі: «Пригніченість» знімається (§6.2). */
export function addCat(state: GameState, cat: Cat): void {
  initRelations(state, cat);
  state.stats.raised[cat.source] += 1;
  state.cats.push(cat);
  state.character.depressed = false;
  emit(state, { type: "cat-arrived", cat: cat.id });
}

/** Стартовий пакет кота з притулку: корм і наповнювач (§9.12). */
export function giveStarterPack(state: GameState): void {
  addSupply(state, "catFood", "cheap", SHELTER_STARTER_PACK.catFood);
  addSupply(state, "litter", "cheap", SHELTER_STARTER_PACK.litter);
}

/** Ранок: здоровий глузд від нічних подій; без котів і нижче 30% — «Пригніченість» (§6.2). */
function morning({ state, report, rng }: Night): void {
  nightlyHousehold(state, rng);
  applyMorningSanity(state, report.lostCats.length, report.newCats.length);
  // Нові господарі приїжджають по котів за оголошеннями (§9.8).
  for (const entry of collectAds(state)) report.givenCats.push(entry.id);
  const character = state.character;
  character.depressed = character.stats.sanity < KITTEN_SANITY_THRESHOLD && state.cats.length === 0;
  report.sanityMorning = character.stats.sanity;
}

function newDay({ state, report }: Night): void {
  state.day += 1;
  state.minute = report.wokeMinute;
  state.dayStartMinute = report.wokeMinute;
  state.character.body = newBody();
  morningJob(state);
  seedDay(state);
  // Модифікатор дня й тижня (§4.1): з потоку умов дня, тож на переграванні той самий.
  startModifiers(state, stateRng(state, "conditions"));
}
