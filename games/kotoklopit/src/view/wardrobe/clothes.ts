// Кольори одягу (§5.1): одна палітра на верх, низ і взуття, якою компонувальник фарбує `fill-top`, `fill-bottom`,
// `fill-shoes`. Номер кольору в `Look` — індекс у своєму ряду.

import type { WardrobeColor } from "./types";

export const CLOTHES: readonly number[] = [0xc0675a, 0x5a7fc0, 0x6fae6a, 0xe8b93a, 0x8e4a6a, 0x3a3440, 0xe9e6df];

/** Низ і взуття починаються з графітового: той самий ряд палітри, зсунутий на стільки. */
const DARK_FIRST = 5;

const row = (names: readonly string[], shift: number): readonly WardrobeColor[] =>
  names.map((name, i) => ({ name, color: CLOTHES[(i + shift) % CLOTHES.length] ?? 0 }));

export const TOP_COLORS = row(["червоний", "синій", "зелений", "жовтий", "вишневий", "графітовий", "білий"], 0);
export const BOTTOM_COLORS = row(["графітовий", "білий", "червоний", "синій", "зелений", "жовтий", "вишневий"], DARK_FIRST);
export const SHOE_COLORS = row(["графітове", "біле", "червоне", "синє", "зелене", "жовте", "вишневе"], DARK_FIRST);
