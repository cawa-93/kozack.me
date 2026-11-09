// Ряди редактора зовнішності персонажа (§5.1): підписи, назви варіантів із реєстрів гардеробу (`src/view/wardrobe/`,
// `WARDROBE.md`), що доступне за вигляду, і випадкова зовнішність, з якої редактор починає. Частини спільні для всіх — без
// прив'язки до статі чи звертання. Без DOM: номер варіанта — індекс у реєстрі.

import { createRng, deriveSeed, type Rng } from "../sim/rng";
import type { Look } from "../sim/types";
import { accentFits, HAIR_ACCENTS } from "../view/wardrobe/accents";
import { BUILDS, FACES, IRIS_COLORS, SKIN_TONES } from "../view/wardrobe/body";
import { BOTTOM_CUTS } from "../view/wardrobe/bottoms";
import { BOTTOM_COLORS, SHOE_COLORS, TOP_COLORS } from "../view/wardrobe/clothes";
import { HAIR_COLORS, HAIR_STYLES } from "../view/wardrobe/hair";
import { wearOf, type Wear } from "../view/wardrobe/index";
import { PATTERNS, patternFits } from "../view/wardrobe/patterns";
import { SHOE_CUTS } from "../view/wardrobe/shoes";
import { TOP_CUTS } from "../view/wardrobe/tops";
import type { WardrobeEntry } from "../view/wardrobe/types";

/** Вкладка редактора, коли всі ряди не вміщуються (`LOOK_PAGE`): тіло, волосся, верх, низ, взуття. */
export type LookTab = "body" | "hair" | "top" | "bottom" | "shoes";

export const LOOK_TABS: Readonly<Record<LookTab, string>> = { body: "Тіло", hair: "Волосся", top: "Верх", bottom: "Низ", shoes: "Взуття" };

/**
 * Скільки рядів уміщує картка без прокрутки на телефоні набік (три стовпці по три); більше — вкладки, і на вкладці ряди
 * підписано коротко («Фасон», «Колір»): що це верх, каже вкладка.
 */
export const LOOK_PAGE = 9;

/** Ряд редактора: поле вигляду, підпис (і коротший — на вкладці), вкладка й варіанти з реєстру. */
export interface LookRow {
  key: keyof Look;
  label: string;
  short: string;
  tab: LookTab;
  options: readonly string[];
  /** Вага варіанта для «Випадково» за номером; немає — однакові. */
  weights?: readonly number[];
  /** Чи варіант `i` доступний за вигляду (візерунок — на фасон); немає — усі. */
  fits?: (wear: Wear, i: number) => boolean;
  /** Чому ряд за вигляду не діє (підпис замість назви варіанта); null — діє. */
  off?: (wear: Wear) => string | null;
}

/** Підписи неактивних рядів. */
export const LOOK_OFF = { accent: "немає в цієї зачіски", suit: "разом із верхом" } as const;

const names = (entries: readonly WardrobeEntry[]): readonly string[] => entries.map((e) => e.name);
const weights = (entries: readonly WardrobeEntry[]): readonly number[] => entries.map((e) => e.weight ?? 1);
const suit = (wear: Wear): string | null => (wear.suit ? LOOK_OFF.suit : null);

/** Ряди в порядку на картці. Залежне — після того, від чого залежить: акцент — після зачіски, низ і візерунок — після фасону. */
export const LOOK_OPTIONS: readonly LookRow[] = [
  { key: "face", label: "Обличчя", short: "Обличчя", tab: "body", options: names(FACES), weights: weights(FACES) },
  { key: "skin", label: "Шкіра", short: "Шкіра", tab: "body", options: names(SKIN_TONES) },
  { key: "hair", label: "Зачіска", short: "Зачіска", tab: "hair", options: names(HAIR_STYLES), weights: weights(HAIR_STYLES) },
  { key: "hairColor", label: "Волосся", short: "Колір", tab: "hair", options: names(HAIR_COLORS), weights: weights(HAIR_COLORS) },
  {
    key: "hairAccent",
    label: "Акцент",
    short: "Акцент",
    tab: "hair",
    options: names(HAIR_ACCENTS),
    weights: weights(HAIR_ACCENTS),
    off: (wear) => (accentFits(wear.hair) ? null : LOOK_OFF.accent),
  },
  { key: "eyes", label: "Очі", short: "Очі", tab: "body", options: names(IRIS_COLORS) },
  { key: "build", label: "Статура", short: "Статура", tab: "body", options: names(BUILDS) },
  { key: "topCut", label: "Фасон верху", short: "Фасон", tab: "top", options: names(TOP_CUTS), weights: weights(TOP_CUTS) },
  { key: "top", label: "Верх", short: "Колір", tab: "top", options: names(TOP_COLORS) },
  {
    key: "topPattern",
    label: "Візерунок верху",
    short: "Візерунок",
    tab: "top",
    options: names(PATTERNS),
    weights: weights(PATTERNS),
    fits: (wear, i) => patternFits(i, "top", wear.topCut),
  },
  { key: "bottomCut", label: "Фасон низу", short: "Фасон", tab: "bottom", options: names(BOTTOM_CUTS), weights: weights(BOTTOM_CUTS), off: suit },
  { key: "bottom", label: "Низ", short: "Колір", tab: "bottom", options: names(BOTTOM_COLORS), off: suit },
  {
    key: "bottomPattern",
    label: "Візерунок низу",
    short: "Візерунок",
    tab: "bottom",
    options: names(PATTERNS),
    weights: weights(PATTERNS),
    fits: (wear, i) => patternFits(i, "bottom", wear.bottomCut),
    off: suit,
  },
  { key: "shoeCut", label: "Фасон взуття", short: "Фасон", tab: "shoes", options: names(SHOE_CUTS), weights: weights(SHOE_CUTS) },
  { key: "shoes", label: "Взуття", short: "Колір", tab: "shoes", options: names(SHOE_COLORS) },
];

/** Чи ряд показано: з одним варіантом у реєстрі вибирати нічого. */
export function shownRow(row: LookRow): boolean {
  return row.options.length > 1;
}

/** Номери варіантів ряду, доступних за вигляду (ряд, що не діє, — лише те, що вдягнено). */
export function rowChoices(row: LookRow, wear: Wear): number[] {
  if (row.off?.(wear)) return [wear[row.key]];
  const fits = row.fits;
  return row.options.map((_, i) => i).filter((i) => !fits || fits(wear, i));
}

/**
 * Випадкова зовнішність: у кожному ряду — доступний за вже обраного варіант за вагами (`WardrobeEntry.weight`); ряд, що не
 * діє чи має один варіант, — 0 і без кидка, тож нові ряди без варіантів не змінюють зовнішності для того самого seed.
 */
export function randomLook(rng: Rng): Look {
  const look: Partial<Look> = {};
  for (const row of LOOK_OPTIONS) {
    look[row.key] = 0;
    const wear = wearOf(look);
    if (row.off?.(wear)) continue;
    const choices = rowChoices(row, wear);
    if (choices.length > 1) look[row.key] = pickChoice(rng, choices, row.weights);
  }
  return look as Look;
}

/** Варіант за вагами (за номером варіанта); однакові ваги — один `rng.int`, як і без ваг. */
export function pickChoice(rng: Rng, choices: readonly number[], weights: readonly number[] | undefined): number {
  const w = choices.map((i) => Math.max(0, weights?.[i] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return choices[0] ?? 0;
  if (w.every((x) => x === w[0])) return choices[rng.int(0, choices.length - 1)] ?? 0;
  let left = rng.next() * total;
  for (let i = 0; i < choices.length; i++) {
    left -= w[i] ?? 0;
    if (left < 0) return choices[i] ?? 0;
  }
  return choices.at(-1) ?? 0;
}

/** Сіль генератора зовнішності: окремо від потоків гри (§6.1), що теж ростуть із seed. */
const LOOK_SALT = 0x4c4f4f4b;

/**
 * Генератор зовнішностей редактора для нової гри: із seed цієї гри, тож `Math.random` лишається тільки для seed (§6.1), а та сама
 * нова гра починає з тієї самої зовнішності.
 */
export function lookRng(seed: number): Rng {
  return createRng(deriveSeed(seed, LOOK_SALT));
}
