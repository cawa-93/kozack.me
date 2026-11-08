// Кольори й шрифти інтерфейсу в Phaser у новому вигляді (крок 16, пакет T3): панель, бабли, сенсорні кнопки — тими самими
// токенами, що й арт (`art/palette.ts`, `art/STYLE.md`), а не старими `COLORS`. Без Phaser.

import { PALETTE } from "../../../art/palette";
import { artEntry } from "../art/manifest";
import type { ArtEntry, ArtId } from "../art/types";

/** Колір палітри арту (`#rrggbb`) — числом для Phaser Graphics. */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/**
 * Шрифт написів панелі й баблів. Рукописний шрифт A13 — для заголовків карток (DOM); цифри годинника, гроші й рядки
 * розкладу мусять читатися на телефоні з першого погляду, тож лишаються системним жирним шрифтом, а «в стилі гри» їх
 * робить чорнильна обвідка й кольори паперу.
 */
export const UI_FONT = "system-ui, sans-serif";

/** Кольори написів: рядком для Phaser Text. */
export const UI_TEXT = {
  /** Головне на темній панелі: годинник, гроші. */
  main: PALETTE.paper,
  /** Другорядне: дата, розклад. */
  muted: PALETTE.greyHi,
  /** Стани персонажа (сонливість, недосип, хвороби): гірчичний — «попередження». */
  warning: PALETTE.mustardHi,
  /** Обвідка написів на панелі й над квартирою. */
  stroke: PALETTE.ink,
  /** Текст на папері (бабл телефона). */
  onPaper: PALETTE.ink,
} as const;

/**
 * Написи над світом («+N ₴», `Bubbles.popText`): сцена передає колір старого вигляду, а в новому він стає токеном палітри
 * арту — так спільна `DayScene` до хвилі 3 лишається як була. Невідомий колір — як є.
 */
const ISO_POP_COLORS: Readonly<Record<string, string>> = {
  /** Зароблені гроші: зелений, приглушений, як уся палітра. */
  "#8fdc7a": PALETTE.greenHi,
};

/** Колір напису над світом у новому вигляді. */
export function isoPopColor(color: string): string {
  return ISO_POP_COLORS[color.toLowerCase()] ?? color;
}

/** Кольори Graphics: числом. */
export const UI_FILL = {
  ink: hex(PALETTE.ink),
  paper: hex(PALETTE.paper),
  /** Тінь доріжки шкали й штрихування частини понад межею. */
  trough: hex(PALETTE.ink),
  hatch: hex(PALETTE.inkSoft),
} as const;

/**
 * Запис маніфесту, без якого інтерфейс нового вигляду не складеться (фони баблів, кадри панелі): немає — помилка, а не
 * запасні числа, які непомітно застаріють. Що всі такі записи є, перевіряють `isobubbles.test.ts` і `isohud.test.ts`.
 */
export function uiEntry(id: ArtId): ArtEntry {
  const entry = artEntry(id);
  if (!entry) throw new Error(`немає запису маніфесту «${id}»`);
  return entry;
}
