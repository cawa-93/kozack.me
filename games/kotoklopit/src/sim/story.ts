// Титри життя (§4.2): шлях гравця для екрана пенсії. Коти — зі стану (коти й альбом), зміни посади й техніка — з `story`.

import { CAREER_AXIS, DAYS_PER_WEEK } from "./config";
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

const ORDER: readonly StoryItem["kind"][] = ["start", "arrival", "births", "thing", "career", "farewell"];

/** Шлях гравця від першого дня до останнього (§4.2). */
export function lifeStory(state: GameState): StoryItem[] {
  const cats = [...state.cats, ...state.album].sort((a, b) => a.id - b.id);
  const items: StoryItem[] = [
    { kind: "start", day: 0 },
    ...cats.flatMap((cat): StoryItem[] =>
      cat.source === "born" ? [] : [{ kind: "arrival", day: cat.arrivedDay, cat: { cat, ageWeeks: arrivalAge(state, cat) }, source: cat.source }],
    ),
    ...births(state, cats),
    ...firstThings(state.story ?? []),
    ...career(state.story ?? []),
    ...state.album.map((entry): StoryItem => ({ kind: "farewell", day: entry.day, entry })),
  ];
  // Сортування стабільне: того самого дня й виду лишається порядок вище — за id кота чи порядком запису.
  return items.sort((a, b) => a.day - b.day || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** Скільки разів кіт постаршав від появи до дня `day`: щотижня в ніч на день своєї появи (§9.1). */
function agings(arrivedDay: number, day: number): number {
  return Math.max(0, Math.floor((day - arrivedDay) / DAYS_PER_WEEK));
}

/**
 * Вік кота в день появи. В альбомі — вік на прощанні: смерть від нульового здоров'я — до нічного старшання, старість — уже після
 * нього (ніч, коли кіт постаршав, §9.2), а віддають уранці наступного дня (`AlbumEntry.day` — уже він).
 */
function arrivalAge(state: GameState, cat: Cat | AlbumEntry): number {
  const day = "cause" in cat ? (cat.cause.kind === "old" ? cat.day + 1 : cat.day) : state.day;
  return Math.max(0, cat.ageWeeks - agings(cat.arrivedDay, day));
}

function ageOn(state: GameState, cat: Cat | AlbumEntry, day: number): number {
  return arrivalAge(state, cat) + agings(cat.arrivedDay, day);
}

/**
 * Пологи: один запис на маму й день. Кошеня з альбому старого збереження (без `parents`) — з єдиним виводком свого дня, а коли
 * їх кілька чи жодного — окремо, без мами.
 */
function births(state: GameState, cats: readonly (Cat | AlbumEntry)[]): StoryItem[] {
  const groups: { day: number; mother: number | null; kittens: (Cat | AlbumEntry)[] }[] = [];
  const unknown: (Cat | AlbumEntry)[] = [];
  for (const cat of cats) {
    if (cat.source !== "born") continue;
    if (!cat.parents) {
      unknown.push(cat);
      continue;
    }
    const mother = cat.parents.mother;
    const group = groups.find((g) => g.day === cat.arrivedDay && g.mother === mother);
    if (group) group.kittens.push(cat);
    else groups.push({ day: cat.arrivedDay, mother, kittens: [cat] });
  }
  for (const cat of unknown) {
    const sameDay = groups.filter((g) => g.day === cat.arrivedDay && g.mother !== null);
    const group = sameDay.length === 1 ? sameDay[0] : groups.find((g) => g.day === cat.arrivedDay && g.mother === null);
    if (group) group.kittens.push(cat);
    else groups.push({ day: cat.arrivedDay, mother: null, kittens: [cat] });
  }
  return groups.map(({ day, mother, kittens }): StoryItem => {
    const mom = mother === null ? undefined : (state.cats.find((c) => c.id === mother) ?? state.album.find((e) => e.id === mother));
    return {
      kind: "births",
      day,
      mother: mom ? { cat: mom, ageWeeks: ageOn(state, mom, day) } : null,
      kittens: kittens.sort((a, b) => a.id - b.id).map((cat) => ({ cat, ageWeeks: 0 })),
    };
  });
}

/** Техніка: лише перша поява кожного виду. */
function firstThings(story: readonly StoryEntry[]): StoryItem[] {
  const seen = new Set<StoryThing>();
  const items: StoryItem[] = [];
  for (const entry of story) {
    if (entry.kind !== "thing" || seen.has(entry.thing)) continue;
    seen.add(entry.thing);
    items.push({ ...entry });
  }
  return items;
}

/**
 * Кар'єра: усі зміни посади; полароїд — звільнення, нова робота й перший вихід на середню посаду та на вершину. Найвищу посаду до
 * запису видно з самого запису (підвищення — з посади нижче, пониження — з вищої): у збереженні, старшому за титри, середня посада
 * могла бути ще до них.
 */
function career(story: readonly StoryEntry[]): StoryItem[] {
  const middle = CAREER_AXIS.middle - 1;
  const top = CAREER_AXIS.high - 1;
  let best = -1;
  const items: StoryItem[] = [];
  for (const entry of story) {
    if (entry.kind !== "career") continue;
    const before = entry.change === "promoted" ? entry.position - 1 : entry.change === "demoted" ? entry.position + 1 : entry.change === "fired" ? 0 : -1;
    best = Math.max(best, before);
    const reached = (level: number): boolean => entry.position >= level && best < level;
    const milestone = entry.change === "fired" || entry.change === "hired" || (entry.change === "promoted" && (reached(middle) || reached(top)));
    best = Math.max(best, entry.position);
    items.push({ ...entry, milestone });
  }
  return items;
}
