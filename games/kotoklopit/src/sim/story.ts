// Титри життя (§4.2): шлях гравця для екрана пенсії. Коти — зі стану (коти й альбом), зміни посади, техніка, поломки й відкриті
// риси — з `story`.

import { DAYS_PER_WEEK, MINUTES_PER_DAY, POSITIONS } from "./config";
import { wakeMinute } from "./sleep";
import { absoluteMinute, weekOf } from "./time";
import type { AlbumEntry, Cat, CatSource, GameState, Quality, StoryBroken, StoryEntry, StoryThing, Trait } from "./types";

/** Кіт на фото: живий чи з альбому, і його вік у мить події (кошеня на фото приїзду — мале). */
export interface StoryCat {
  cat: Cat | AlbumEntry;
  ageWeeks: number;
}

export type CareerChange = "promoted" | "demoted" | "fired" | "hired";

/**
 * Подія стрічки (§4.2). `at` — мить події (`absoluteMinute`); список упорядковано за нею, а однакові — у порядку варіантів тут
 * (таблиця §4.2).
 */
export type StoryItem =
  | { kind: "start"; day: number; at: number }
  | { kind: "arrival"; day: number; at: number; cat: StoryCat; source: Exclude<CatSource, "born"> }
  | { kind: "births"; day: number; at: number; mother: StoryCat | null; kittens: StoryCat[] }
  | { kind: "thing"; day: number; at: number; thing: StoryThing; quality: Quality }
  /** Відкрита риса: кіт у віці того дня й середній настрій його життя на ту мить. */
  | { kind: "trait"; day: number; at: number; cat: StoryCat; trait: Trait; mood: number }
  /** Перша поломка кожного виду дорожчої речі; `cat` — хто зламав, у віці того дня. */
  | { kind: "broke"; day: number; at: number; thing: StoryBroken; quality?: Quality; cat: StoryCat }
  /**
   * Серія підвищень чи понижень поспіль за тиждень — один запис про посаду, якої дійшли (`position`), у мить останньої зміни;
   * звільнення й нова робота — кожне окремо. `milestone` — полароїд (звільнення, нова робота, вершина), інакше — рядок без фото.
   */
  | { kind: "career"; day: number; at: number; change: CareerChange; position: number; milestone: boolean }
  | { kind: "farewell"; day: number; at: number; entry: AlbumEntry };

/** Записати подію, якої не видно зі стану (§4.2). */
export function remember(state: GameState, entry: StoryEntry): void {
  (state.story ??= []).push(entry);
}

const BROKEN: readonly StoryBroken[] = ["carrier", "house", "scratcher", "sofa"];
const storyBroken = (thing: string): thing is StoryBroken => (BROKEN as readonly string[]).includes(thing);

/**
 * Кіт зламав річ `thing`: у стрічку — лише дорожчі й лише перший раз кожного виду (§4.2). Диван коти деруть часто, тож повтори не
 * записуємо зовсім: збереження не росте.
 */
export function rememberBroken(state: GameState, cat: Cat, thing: string, quality?: Quality): void {
  if (!storyBroken(thing) || state.story?.some((e) => e.kind === "broke" && e.thing === thing)) return;
  remember(state, { kind: "broke", day: state.day, minute: state.minute, thing, ...(quality ? { quality } : {}), cat: cat.id });
}

const ORDER: readonly StoryItem["kind"][] = ["start", "arrival", "births", "thing", "trait", "broke", "career", "farewell"];

/** Шлях гравця від першого дня до останнього (§4.2). */
export function lifeStory(state: GameState): StoryItem[] {
  // Без хвилини (старе збереження, сценарій) подія — на початку дня, коли персонаж прокинувся, а нічне прощання — на кінці дня:
  // нічні кроки йдуть, коли він уже прокидається.
  const morning = wakeMinute(state);
  const at = (day: number, minute: number | undefined): number => absoluteMinute(day, minute ?? morning);
  const cats = [...state.cats, ...state.album].sort((a, b) => a.id - b.id);
  const story = state.story ?? [];
  const items: StoryItem[] = [
    { kind: "start", day: 0, at: at(0, undefined) },
    ...cats.flatMap((cat): StoryItem[] =>
      cat.source === "born"
        ? []
        : [{ kind: "arrival", day: cat.arrivedDay, at: at(cat.arrivedDay, cat.arrivedMinute), cat: { cat, ageWeeks: arrivalAge(state, cat) }, source: cat.source }],
    ),
    ...births(state, cats).map(({ minute, ...b }): StoryItem => ({ kind: "births", at: at(b.day, minute), ...b })),
    ...firstThings(story).map(({ minute, ...thing }): StoryItem => ({ ...thing, at: at(thing.day, minute) })),
    ...openedTraits(state, cats, story).map(({ minute, ...trait }): StoryItem => ({ ...trait, at: at(trait.day, minute) })),
    ...firstBreaks(state, cats, story).map(({ minute, ...broke }): StoryItem => ({ ...broke, at: at(broke.day, minute) })),
    ...career(story).map(({ minute, ...change }): StoryItem => ({ ...change, at: at(change.day, minute) })),
    ...state.album.map((entry): StoryItem => {
      const minute = entry.minute ?? (entry.cause.kind === "given" ? morning : MINUTES_PER_DAY + morning);
      return { kind: "farewell", day: entry.day, at: at(entry.day, minute), entry };
    }),
  ];
  // Сортування стабільне: та сама мить і вид — у порядку вище, за id кота чи порядком запису. Нічне прощання й ранок наступного
  // дня — та сама мить: раніше — день, що закінчився.
  return items.sort((a, b) => a.at - b.at || a.day - b.day || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
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
function births(state: GameState, cats: readonly (Cat | AlbumEntry)[]): { day: number; minute?: number; mother: StoryCat | null; kittens: StoryCat[] }[] {
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
  return groups.map(({ day, mother, kittens }) => {
    const mom = mother === null ? undefined : (state.cats.find((c) => c.id === mother) ?? state.album.find((e) => e.id === mother));
    const minutes = kittens.flatMap((k) => (k.arrivedMinute === undefined ? [] : [k.arrivedMinute]));
    return {
      day,
      ...(minutes.length > 0 ? { minute: Math.min(...minutes) } : {}),
      mother: mom ? { cat: mom, ageWeeks: ageOn(state, mom, day) } : null,
      kittens: kittens.sort((a, b) => a.id - b.id).map((cat) => ({ cat, ageWeeks: 0 })),
    };
  });
}

/** Техніка: лише перша поява кожного виду. */
function firstThings(story: readonly StoryEntry[]): Extract<StoryEntry, { kind: "thing" }>[] {
  const seen = new Set<StoryThing>();
  return story.filter((entry): entry is Extract<StoryEntry, { kind: "thing" }> => {
    if (entry.kind !== "thing" || seen.has(entry.thing)) return false;
    seen.add(entry.thing);
    return true;
  });
}

/** Поломки: лише перша кожного виду; кота немає ні вдома, ні в пам'яті (сценарій) — запису немає. */
function firstBreaks(
  state: GameState,
  cats: readonly (Cat | AlbumEntry)[],
  story: readonly StoryEntry[],
): (Omit<Extract<StoryEntry, { kind: "broke" }>, "cat"> & { cat: StoryCat })[] {
  const seen = new Set<StoryBroken>();
  return story.flatMap((entry) => {
    if (entry.kind !== "broke" || seen.has(entry.thing)) return [];
    seen.add(entry.thing);
    const cat = cats.find((c) => c.id === entry.cat);
    return cat ? [{ ...entry, cat: { cat, ageWeeks: ageOn(state, cat, entry.day) } }] : [];
  });
}

/** Відкриті риси — кожна; кота чи риси немає (сценарій) — запису немає. */
function openedTraits(
  state: GameState,
  cats: readonly (Cat | AlbumEntry)[],
  story: readonly StoryEntry[],
): { kind: "trait"; day: number; minute?: number; cat: StoryCat; trait: Trait; mood: number }[] {
  return story.flatMap((entry) => {
    if (entry.kind !== "trait") return [];
    const cat = cats.find((c) => c.id === entry.cat);
    const trait = cat?.traits.find((t) => t.group === entry.group);
    if (!cat || !trait) return [];
    const { group: _group, ...rest } = entry;
    return [{ ...rest, cat: { cat, ageWeeks: ageOn(state, cat, entry.day) }, trait }];
  });
}

type CareerEntry = Extract<StoryEntry, { kind: "career" }>;

/** Кар'єра: серії підвищень чи понижень поспіль за тиждень — по запису з останньої зміни серії; звільнення й нова робота — кожне. */
function career(story: readonly StoryEntry[]): (Omit<CareerEntry, "kind"> & { kind: "career"; milestone: boolean })[] {
  const series: CareerEntry[] = [];
  for (const entry of story) {
    if (entry.kind !== "career") continue;
    const last = series.at(-1);
    const continues =
      last !== undefined && (entry.change === "promoted" || entry.change === "demoted") && last.change === entry.change && weekOf(last.day) === weekOf(entry.day);
    if (continues) series[series.length - 1] = entry;
    else series.push(entry);
  }
  const top = POSITIONS.length - 1;
  return series.map((entry) => ({
    ...entry,
    milestone: entry.change === "fired" || entry.change === "hired" || (entry.change === "promoted" && entry.position >= top),
  }));
}
