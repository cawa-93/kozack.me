// Розміри картки поверх гри (`.card` і `.overlay` в `overlay.css`) — для сцени дороги: на місці (§8.5 «На місці — кадр
// парковки») вона ставить парковку у вільну смугу праворуч від картки й вирішує, чи притиснути картку ліворуч (`.aside`).
// Числа мусять збігатися з CSS: їх звіряє `tests/cardsize.test.ts`. Чисті розрахунки без DOM.

export const CARD_CSS = {
  /** `.card { width: min(560px, 100%) }`, разом із рамкою (border-box). */
  width: 560,
  /** Рамка картки виступає за її край (`border-image-outset`). */
  outset: 4,
  /** Поле `.overlay`. */
  pad: 16,
  /** Низький екран (телефон набік): `@media (max-height: 420px)` — тонші рамка й поле. */
  low: { maxHeight: 420, pad: 8, outset: 3 },
} as const;

/**
 * Правий край картки, притиснутої ліворуч (`.overlay.aside`), у CSS px від лівого краю вікна: поле (чи виріз камери ліворуч,
 * якщо він ширший) + ширина картки (не більше, ніж уміщається) + виступ рамки.
 */
export function asideCardRight(viewport: { width: number; height: number }, safeLeft = 0, safeRight = 0): number {
  const low = viewport.height <= CARD_CSS.low.maxHeight;
  const pad = low ? CARD_CSS.low.pad : CARD_CSS.pad;
  const outset = low ? CARD_CSS.low.outset : CARD_CSS.outset;
  const left = Math.max(pad, safeLeft);
  const right = Math.max(pad, safeRight);
  const width = Math.min(CARD_CSS.width, Math.max(0, viewport.width - left - right));
  return left + width + outset;
}
