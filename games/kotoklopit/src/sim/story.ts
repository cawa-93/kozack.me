// Титри життя (§4.2): шлях гравця для екрана пенсії. Коти — зі стану (коти й альбом), зміни посади й техніка — з `story`.
// КОНТРАКТ: сигнатури й типи нижче — спільні для симуляції, текстів, фото й стрічки; тіла заповнює пакет «сим і тексти».

import type { AlbumEntry, Cat, CatSource, GameState, Quality, StoryEntry, StoryThing } from "./types";

/** Кіт на фото: живий чи з альбому, і його вік у мить події (кошеня на фото приїзду — мале). */
export interface StoryCat {
  cat: Cat | AlbumEntry;
  ageWeeks: number;
}

export type CareerChange = "promoted" | "demoted" | "fired" | "hired";

/** Подія стрічки (§4.2); у списку — за днями, а того самого дня — у порядку таблиці §4.2 (порядок варіантів тут той самий). */
export type StoryItem =
  | { kind: "start"; day: number }
  | { kind: "arrival"; day: number; cat: StoryCat; source: Exclude<CatSource, "born"> }
  | { kind: "births"; day: number; mother: StoryCat | null; kittens: StoryCat[] }
  | { kind: "thing"; day: number; thing: StoryThing; quality: Quality }
  /** `milestone` — полароїд (звільнення, нова робота, уперше `CAREER_AXIS.middle`, вершина), інакше — рядок без фото. */
  | { kind: "career"; day: number; change: CareerChange; position: number; milestone: boolean }
  | { kind: "farewell"; day: number; entry: AlbumEntry };

/** Записати подію, якої не видно зі стану (§4.2). */
export function remember(state: GameState, entry: StoryEntry): void {
  (state.story ??= []).push(entry);
}

/** Шлях гравця від першого дня до останнього (§4.2). */
export function lifeStory(state: GameState): StoryItem[] {
  void state;
  return [{ kind: "start", day: 0 }];
}
