// Ряди редактора зовнішності персонажа (§5.1): підписи, назви варіантів із реєстрів гардеробу (`src/view/wardrobe/`,
// `WARDROBE.md`) і випадкова зовнішність, з якої редактор починає. Частини спільні для всіх — без прив'язки до статі чи
// звертання. Без DOM: номер варіанта — індекс у реєстрі.

import { createRng, deriveSeed, type Rng } from "../sim/rng";
import type { Look } from "../sim/types";
import { HAIR_ACCENTS } from "../view/wardrobe/accents";
import { BUILDS, FACES, IRIS_COLORS, SKIN_TONES } from "../view/wardrobe/body";
import { BOTTOM_CUTS } from "../view/wardrobe/bottoms";
import { BOTTOM_COLORS, SHOE_COLORS, TOP_COLORS } from "../view/wardrobe/clothes";
import { HAIR_COLORS, HAIR_STYLES } from "../view/wardrobe/hair";
import { PATTERNS } from "../view/wardrobe/patterns";
import { SHOE_CUTS } from "../view/wardrobe/shoes";
import { TOP_CUTS } from "../view/wardrobe/tops";
import type { WardrobeEntry } from "../view/wardrobe/types";

/** Ряд редактора: поле вигляду, підпис і варіанти з реєстру. */
export interface LookRow {
  key: keyof Look;
  label: string;
  options: readonly string[];
}

const names = (entries: readonly WardrobeEntry[]): readonly string[] => entries.map((e) => e.name);

/** Ряди в порядку на картці. Залежне — після того, від чого залежить: акцент — після зачіски, візерунок — після фасону. */
export const LOOK_OPTIONS: readonly LookRow[] = [
  { key: "face", label: "Обличчя", options: names(FACES) },
  { key: "skin", label: "Шкіра", options: names(SKIN_TONES) },
  { key: "hair", label: "Зачіска", options: names(HAIR_STYLES) },
  { key: "hairColor", label: "Волосся", options: names(HAIR_COLORS) },
  { key: "hairAccent", label: "Акцент", options: names(HAIR_ACCENTS) },
  { key: "eyes", label: "Очі", options: names(IRIS_COLORS) },
  { key: "build", label: "Статура", options: names(BUILDS) },
  { key: "topCut", label: "Фасон верху", options: names(TOP_CUTS) },
  { key: "top", label: "Верх", options: names(TOP_COLORS) },
  { key: "topPattern", label: "Візерунок верху", options: names(PATTERNS) },
  { key: "bottomCut", label: "Фасон низу", options: names(BOTTOM_CUTS) },
  { key: "bottom", label: "Низ", options: names(BOTTOM_COLORS) },
  { key: "bottomPattern", label: "Візерунок низу", options: names(PATTERNS) },
  { key: "shoeCut", label: "Фасон взуття", options: names(SHOE_CUTS) },
  { key: "shoes", label: "Взуття", options: names(SHOE_COLORS) },
];

/** Чи ряд показано: з одним варіантом вибирати нічого. */
export function shownRow(row: LookRow): boolean {
  return row.options.length > 1;
}

/** Випадкова зовнішність: кожна частина — будь-який із її варіантів, незалежно від інших; ряд з одним варіантом — 0. */
export function randomLook(rng: Rng): Look {
  const look: Partial<Look> = {};
  for (const row of LOOK_OPTIONS) look[row.key] = shownRow(row) ? rng.int(0, row.options.length - 1) : 0;
  return look as Look;
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
