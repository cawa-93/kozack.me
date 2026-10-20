// Хід гри: нова гра, плин часу, сон, знімки на початок дня й тижня, перегравання
// і збереження в JSON (§6.1).

import { IDLE, tap, tickActivity, tickStove, type Input } from "./actions";
import { moveBody, newBody } from "./body";
import { tickCats } from "./catai";
import { passAwakeTime } from "./character";
import { FIRST_DAY_MODIFIER, MINUTES_PER_HOUR, START_MONEY, START_STATS } from "./config";
import { newHome, tickDeliveries } from "./economy";
import { emit, endGame } from "./events";
import { runNight } from "./night";
import { seedDay } from "./rng";
import { canGoToSleep, collapseMinute, wakeMinute } from "./sleep";
import { isLastDay, weekdayOf } from "./time";
import type { Difficulty, GameState, NightReport, Save, Sex } from "./types";
import { newJob, tickWork } from "./work";

export const SAVE_VERSION = 5;

const EPSILON = 1e-6;

/** Імена за замовчуванням; власне ім'я задасть конструктор персонажа (§5.1). */
const DEFAULT_NAME: Record<Sex, string> = { female: "Марта", male: "Тарас" };

export interface NewGameOptions {
  sex: Sex;
  difficulty: Difficulty;
  name?: string;
  seed?: number;
}

export function newGame(options: NewGameOptions): Save {
  const { sex, difficulty } = options;
  let nextId = 1;
  const state: GameState = {
    seed: (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0,
    replays: 0,
    difficulty,
    day: 0,
    minute: 0,
    dayStartMinute: 0,
    character: {
      name: options.name ?? DEFAULT_NAME[sex],
      sex,
      // Хронотип за статтю (§5.1); режим розробки може змінити його окремо (§11.5).
      chronotype: sex === "female" ? "lark" : "owl",
      stats: { ...START_STATS },
      money: START_MONEY,
      sleepSpeed: 0,
      body: newBody(),
      held: null,
      activity: null,
      depressed: false,
    },
    job: newJob(),
    home: newHome(() => nextId++),
    modifiers: { day: FIRST_DAY_MODIFIER, week: null },
    cats: [],
    relations: {},
    album: [],
    nextId: 0,
    rng: { conditions: 0, behavior: 0 },
    lastNight: null,
    end: null,
  };
  state.nextId = nextId;
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

/** Усе, що відбувається за крок часу вдень. */
function tick(state: GameState, minutes: number, input: Input): void {
  const from = state.minute;
  tickActivity(state, input, minutes);
  moveBody(state, state.character.activity === null ? input.move : IDLE.move, minutes);
  tickWork(state, from, minutes);
  tickStove(state, minutes);
  tickCats(state, minutes, { present: true });
  passAwakeTime(state, minutes / MINUTES_PER_HOUR);
  state.minute += minutes;
  tickDeliveries(state);
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
  seedDay(save.current);
}

export function serialize(save: Save): string {
  return JSON.stringify(save);
}

export function deserialize(json: string): Save {
  const data: unknown = JSON.parse(json);
  const version = typeof data === "object" && data !== null && "version" in data ? data.version : undefined;
  if (version !== SAVE_VERSION) throw new Error(`Непідтримувана версія збереження: ${String(version)}`);
  return data as Save;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
