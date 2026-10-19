// Сценарії режиму розробки (§11.5): іменовані стани гри у файлах JSON у теці `scenarios/`.
// Сценарій — параметри нової гри й зміни стану поверх неї, тож нові поля стану його не ламають.

import { createCat } from "../sim/cat";
import { newGame, type NewGameOptions } from "../sim/game";
import { addCat } from "../sim/night";
import { createRng, seedDay } from "../sim/rng";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Cat, CatSource, GameState, Save } from "../sim/types";
import { rebase } from "./commands";

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Кіт сценарію: повний кіт створюється за віком і джерелом, решта полів накладається поверх. */
export type CatSpec = DeepPartial<Cat> & { ageWeeks: number; source?: CatSource };

export interface Scenario {
  name: string;
  description?: string;
  game?: Partial<NewGameOptions>;
  state?: DeepPartial<GameState>;
  cats?: CatSpec[];
}

const DEFAULT_GAME: NewGameOptions = { sex: "female", difficulty: "normal", seed: 1 };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Накласти зміни на об'єкт: вкладені об'єкти зливаються, масиви й числа замінюються. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) result[key] = deepMerge(result[key], value);
  return result as T;
}

/** Нова гра в стані сценарію. Знімки перегравання починаються з нього. */
export function applyScenario(scenario: Scenario): Save {
  const save = newGame({ ...DEFAULT_GAME, ...scenario.game });
  const state = deepMerge(save.current, structuredClone(scenario.state ?? {}));
  // День змінився — засіяти потоки для нього, якщо сценарій не задав їх сам.
  if (!scenario.state?.rng) seedDay(state);
  const rng = createRng(state.seed);
  for (const spec of scenario.cats ?? []) {
    const cat = createCat(state, rng, {
      source: spec.source ?? "shelter",
      ageWeeks: spec.ageWeeks,
      ...(spec.sex ? { sex: spec.sex } : {}),
      ...(spec.name ? { name: spec.name } : {}),
    });
    addCat(state, deepMerge(cat, structuredClone(spec)));
  }
  save.current = state;
  rebase(save);
  return save;
}

/** Зберегти поточний стан як сценарій. */
export function scenarioFromSave(save: Save, name: string): Scenario {
  const { character, difficulty, seed } = save.current;
  return {
    name,
    description: `Збережено з гри: тиждень ${weekOf(save.current.day)}, ${WEEKDAY_NAMES[weekdayOf(save.current.day)]}, ${formatClock(save.current.minute)}.`,
    game: { sex: character.sex, difficulty, seed, name: character.name },
    state: structuredClone(save.current),
  };
}

/** Сценарії з файлів `scenarios/*.json`: id — назва файлу. */
export const FILE_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  Object.entries(
    import.meta.glob<Scenario>("../../scenarios/*.json", { eager: true, import: "default" }),
  ).map(([path, scenario]) => [path.replace(/^.*\/|\.json$/g, ""), scenario]),
);

const LOCAL_KEY = "kotoklopit:dev-scenarios";

/** Сценарії, збережені в браузері. */
export function localScenarios(): Record<string, Scenario> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
    return isPlainObject(parsed) ? (parsed as Record<string, Scenario>) : {};
  } catch {
    return {};
  }
}

export function saveLocalScenario(id: string, scenario: Scenario): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...localScenarios(), [id]: scenario }));
  } catch {
    // Сховище недоступне — сценарій лишається лише файлом.
  }
}

export function deleteLocalScenario(id: string): void {
  const { [id]: _removed, ...rest } = localScenarios();
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rest));
  } catch {
    // Сховище недоступне.
  }
}

export function findScenario(id: string): Scenario | null {
  return FILE_SCENARIOS[id] ?? localScenarios()[id] ?? null;
}

// Транслітерація за спрощеною офіційною схемою: id сценарію стоїть в адресі.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i",
  ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "", "’": "",
};

/** id для назви: латиниця, цифри й дефіси. */
export function scenarioId(name: string): string {
  const id = [...name.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return id || "scenario";
}
