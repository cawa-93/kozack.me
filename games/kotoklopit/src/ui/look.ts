// Частини конструктора зовнішності персонажа (§5.1): назви варіантів для повзунків редактора й випадкова зовнішність, з якої
// редактор починає. Частини спільні для всіх — без прив'язки до статі чи звертання (рішення автора 2026-10-29,
// `GENERAL_REVIEW.md`, А4). Без DOM: номери варіантів — індекси в палітрах і формах графіки (`view/palette.ts`).

import { createRng, deriveSeed, type Rng } from "../sim/rng";
import type { Look } from "../sim/types";
import { BUILDS, FACES, HAIR_STYLES } from "../view/palette";

/** Повзунки редактора в порядку на картці: частина зовнішності, підпис і назви варіантів. */
export const LOOK_OPTIONS: readonly { key: keyof Look; label: string; options: readonly string[] }[] = [
  { key: "face", label: "Обличчя", options: FACES },
  { key: "skin", label: "Шкіра", options: ["світла", "бежева", "смаглява", "темна", "дуже темна"] },
  { key: "hair", label: "Зачіска", options: HAIR_STYLES },
  { key: "hairColor", label: "Волосся", options: ["чорне", "каштанове", "русяве", "біляве", "руде", "сиве"] },
  { key: "eyes", label: "Очі", options: ["темні", "блакитні", "зелені", "карі"] },
  { key: "build", label: "Статура", options: BUILDS },
  { key: "top", label: "Верх", options: ["червоний", "синій", "зелений", "жовтий", "вишневий", "графітовий", "білий"] },
  { key: "bottom", label: "Низ", options: ["графітовий", "білий", "червоний", "синій", "зелений", "жовтий", "вишневий"] },
  { key: "shoes", label: "Взуття", options: ["графітове", "біле", "червоне", "синє", "зелене", "жовте", "вишневе"] },
];

/** Випадкова зовнішність: кожна частина — будь-який із її варіантів, незалежно від інших. */
export function randomLook(rng: Rng): Look {
  const look: Partial<Look> = {};
  for (const { key, options } of LOOK_OPTIONS) look[key] = rng.int(0, options.length - 1);
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
