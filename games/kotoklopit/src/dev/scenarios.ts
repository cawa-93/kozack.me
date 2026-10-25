// Сценарії режиму розробки (§11.5): іменовані стани гри у файлах JSON у теці `scenarios/`.
// Сценарій — параметри нової гри й зміни стану поверх неї, тож нові поля стану його не ламають.

import { WATER_CAPACITY } from "../sim/config";
import { createCat } from "../sim/cat";
import { newGame, upgradeTraits, type NewGameOptions } from "../sim/game";
import { addCat } from "../sim/night";
import { changeRelation, relation } from "../sim/relations";
import { createRng, seedDay } from "../sim/rng";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Cat, CatSource, GameState, Product, Quality, Save } from "../sim/types";
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
  /** Стосунки котів сценарію (§9.4): [номер кота, номер кота, значення], номери — з `cats`. */
  relations?: [number, number, number][];
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

/**
 * Простий котячий куток для сценаріїв і тестів: дешеві миска, вода, лоток із наповнювачем та іграшка.
 * У грі на старті котячих речей немає (§9.12), а сценарію з котами вони потрібні одразу.
 */
export function addCatCorner(state: GameState): void {
  const id = (): number => state.nextId++;
  state.home.items.push(
    { id: id(), kind: "bowl", quality: "cheap", slot: "bowl-1", food: 0, foodQuality: null, sterile: false },
    { id: id(), kind: "water", quality: "cheap", slot: "water-1", water: WATER_CAPACITY },
    { id: id(), kind: "litter", quality: "cheap", slot: "litter-1", litter: "cheap", uses: 0 },
    { id: id(), kind: "toy", quality: "cheap", x: 5.5, y: 8.5, uses: 0 },
  );
}

/** Нова гра в стані сценарію. Знімки перегравання починаються з нього. */
export function applyScenario(scenario: Scenario): Save {
  const save = newGame({ ...DEFAULT_GAME, ...scenario.game });
  const state = deepMerge(save.current, structuredClone(scenario.state ?? {}));
  // День змінився — засіяти потоки для нього, якщо сценарій не задав їх сам.
  if (!scenario.state?.rng) seedDay(state);
  // Запаси, які сценарій поклав додому, сховища показують, як придбані (§6.4).
  for (const [product, supply] of Object.entries(state.home.supplies) as [Product, Record<Quality, number>][]) {
    if (supply.cheap + supply.premium > 0 && !state.home.acquired.includes(product)) state.home.acquired.push(product);
  }
  // Сценарій із котами без власних речей отримує котячий куток.
  if ((scenario.cats?.length ?? 0) > 0 && !scenario.state?.home?.items) addCatCorner(state);
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
  const added = state.cats.slice(-(scenario.cats?.length ?? 0));
  for (const [i, j, value] of scenario.relations ?? []) {
    const a = added[i];
    const b = added[j];
    if (a && b) changeRelation(state, a, b, value - relation(state, a, b));
  }
  // Сценарій, збережений до злиття груп рис (2026-10-25), — риси в нових групах.
  upgradeTraits(state);
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
