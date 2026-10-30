// Кольори й шрифти інтерфейсу в Phaser у новому вигляді (крок 16, пакет T3): панель, бабли, сенсорні кнопки — тими самими
// токенами, що й арт (`art/palette.ts`, `art/STYLE.md`), а не старими `COLORS`. Без Phaser.

import { PALETTE } from "../../../art/palette";

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

/** Кольори Graphics: числом. */
export const UI_FILL = {
  ink: hex(PALETTE.ink),
  paper: hex(PALETTE.paper),
  /** Тінь доріжки шкали й штрихування частини понад межею. */
  trough: hex(PALETTE.ink),
  hatch: hex(PALETTE.inkSoft),
} as const;
