// Версії збережень і міграції (§4.2): гру випущено, тож збереження гравців мають відкриватися й після змін формату стану.

import type { Save } from "./types";

/** Формат, з яким гру випущено, — найстаріший, який гра відкриває. Старіші лишилися з розробки: їх не мігруємо. */
export const RELEASED_SAVE_VERSION = 2;

/**
 * Стан у збереженні старої версії: поточні типи до нього не підходять, тож міграція працює з сирим JSON. Тип старого формату,
 * якщо він потрібен, міграція описує сама.
 */
export type OldState = Record<string, any>;

export interface OldSave {
  version: number;
  current: OldState;
  dayStart: OldState;
  weekStart: OldState;
  morning: OldState | null;
}

/** Переводить збереження з версії на наступну: змінює його на місці. */
export type Migration = (save: OldSave) => void;

/**
 * Міграції по черзі: `MIGRATIONS[i]` переводить версію `RELEASED_SAVE_VERSION + i` у наступну. Нова — своїм файлом у
 * `src/sim/migrations/` і рядком у кінці; випущену вже не змінюють, бо її збереження вже в браузерах гравців.
 */
export const MIGRATIONS: readonly Migration[] = [];

/** Поточна версія: кожна міграція додає одну, тож забути підняти її неможливо. */
export const SAVE_VERSION = RELEASED_SAVE_VERSION + MIGRATIONS.length;

/** Усі знімки стану в збереженні: міграція стану має пройти кожен, інакше перегравання дня чи тижня відкриє старий формат. */
export function snapshots(save: OldSave): OldState[] {
  return save.morning === null ? [save.current, save.dayStart, save.weekStart] : [save.current, save.dayStart, save.weekStart, save.morning];
}

/** Збереження будь-якої підтримуваної версії — у поточному форматі; непідтримувана версія — помилка. */
export function migrate(data: unknown, migrations: readonly Migration[] = MIGRATIONS): Save {
  const version = typeof data === "object" && data !== null && "version" in data ? data.version : undefined;
  const latest = RELEASED_SAVE_VERSION + migrations.length;
  if (typeof version !== "number" || !Number.isInteger(version) || version < RELEASED_SAVE_VERSION || version > latest) {
    throw new Error(`Непідтримувана версія збереження: ${String(version)}`);
  }
  const save = data as OldSave;
  for (let from = version; from < latest; from++) {
    migrations[from - RELEASED_SAVE_VERSION]?.(save);
    save.version = from + 1;
  }
  return save as unknown as Save;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Знімок стану хоча б основної форми: персонаж, коти й дім. */
function isState(value: unknown): boolean {
  return isObject(value) && isObject(value["character"]) && Array.isArray(value["cats"]) && isObject(value["home"]);
}

/**
 * Основна форма збереження поточного формату (§4.2): кожен знімок — стан із персонажем, котами й домом. Не той файл чи зіпсоване
 * збереження — помилка, як і непідтримувана версія: тоді «Не вдалося завантажити» й нечитабельне збереження, а не гра, що
 * падає на першому кадрі.
 */
export function checkSave(save: Save): Save {
  const { current, dayStart, weekStart, morning } = save as unknown as Record<string, unknown>;
  if (!isState(current) || !isState(dayStart) || !isState(weekStart) || (morning !== null && !isState(morning))) {
    throw new Error("Збереження не тієї форми");
  }
  return save;
}
