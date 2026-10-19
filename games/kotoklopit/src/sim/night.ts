// Ніч — обробка між днями, поки персонаж спить (§4). Кроки йдуть строго в порядку §4.

import { dropEverything, tickStove } from "./actions";
import { newBody } from "./body";
import { changeStat, passSleepTime } from "./character";
import {
  DIFFICULTY,
  KITTEN_AGE_WEEKS,
  KITTEN_SANITY_THRESHOLD,
  MINUTES_PER_HOUR,
  SANITY_FLOOR,
} from "./config";
import { payUtilities, postponeDeliveries } from "./economy";
import { pickCatName } from "./names";
import { createRng, seedDay, streamSeed, type Rng } from "./rng";
import { hoursUntilWake, sleepSpeedAfter, wakeMinute } from "./sleep";
import { isSunday } from "./time";
import type { GameState, NightReport, NightStep } from "./types";
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

/** Крок, механіки якого ще немає: її додасть указаний крок плану. */
const pending = (): void => {};

const STEPS: readonly Step[] = [
  { id: "sleep", run: sleep },
  // 1. Здоров'я котів від настрою й хвороб (§9.5, §9.6) — кроки 6 і 10 плану.
  { id: "cat-health", run: pending },
  // 2. Смерть від нульового здоров'я (§9.5) — крок 10.
  { id: "cat-death", run: pending },
  // 3. Ніч із неділі на понеділок.
  { id: "cat-age", weekly: true, run: ageCats },
  { id: "age-limit", weekly: true, run: pending }, // §9.2 — крок 10
  { id: "births", weekly: true, run: pending }, // §9.8 — крок 12
  { id: "pregnancies", weekly: true, run: pending }, // §9.8 — крок 12
  { id: "utilities", weekly: true, run: utilities },
  { id: "week-modifier", weekly: true, run: pending }, // §4.1 — крок 14
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
    sleptHours: hoursUntilWake(state),
    collapsed,
    weekly: isSunday(state.day),
    steps: [],
    lostCats: [],
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

function sleep({ state, report }: Night): void {
  dropEverything(state);
  // Плита вночі не вимикається: страва, що лишилася на ній, підгорає (§8.7).
  tickStove(state, report.sleptHours * MINUTES_PER_HOUR);
  postponeDeliveries(state);
  passSleepTime(state, report.sleptHours);
  state.character.sleepSpeed = sleepSpeedAfter(report.sleptHours);
}

function ageCats({ state }: Night): void {
  // Нову рису за тиждень (§9.1) додасть модель кота — крок 6 плану.
  for (const cat of state.cats) cat.ageWeeks += 1;
}

function utilities({ state, report }: Night): void {
  report.utilities = payUtilities(state);
}

/**
 * Здоровий глузд увечері нижче 30% — персонаж забирає кошеня з притулку (§6.2).
 * Кошеня випадкове: стать і ім'я — з нічних кидків. Решту моделі кота додасть крок 6 плану.
 */
function kittenCheck({ state, report, rng }: Night): void {
  if (report.sanityEvening >= KITTEN_SANITY_THRESHOLD) return;
  const id = state.nextId++;
  const sex = rng.chance(0.5) ? "female" : "male";
  const name = pickCatName(rng, sex, state.cats.map((cat) => cat.name));
  state.cats.push({ id, name, sex, source: "shelter-forced", ageWeeks: KITTEN_AGE_WEEKS, arrivedDay: state.day + 1 });
  report.newCats.push(id);
}

function morning({ state, report }: Night): void {
  applyMorningSanity(state, report.lostCats.length, report.newCats.length);
  report.sanityMorning = state.character.stats.sanity;
}

function newDay({ state }: Night): void {
  state.day += 1;
  state.minute = wakeMinute(state);
  state.character.body = newBody();
  morningJob(state);
  // Тут обиратиметься модифікатор дня (§4.1) — крок 14 плану.
  state.modifiers.day = null;
  seedDay(state);
}
