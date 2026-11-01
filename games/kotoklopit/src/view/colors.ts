// Кольори коду поза палітрою арту (`art/palette.ts`): тло гри й галереї, запасний колір машини гонки й сяйво підсвітки кота.
// Решту кольорів інтерфейсу й позначок бере палітра арту (`iso/uilook.ts`). Без Phaser.

export const COLORS = {
  /** Тло гри (як `backgroundColor` у `main.ts`) і галереї арту. */
  background: 0x2b2530,
  paper: 0xf3e9dc,
  /** Сяйво підсвітки кота-цілі (§8.2). */
  highlight: 0xffd36b,
} as const;
