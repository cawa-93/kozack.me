// Палітра й товщини контуру арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): якими кольорами малюють SVG і
// якої товщини контур. Без Phaser і DOM: її беруть конвеєр і `tests/art.test.ts` («кольори лише з палітри, товщина
// контуру в межах»).
//
// КАРКАС (шов хвилі 1): значення тимчасові — кілька теперішніх кольорів інтерфейсу (`src/view/colors.ts`) і старої
// квартири (`src/view/legacy/apartment.ts`). Справжні токени, відтінки тіні й товщини задає пакет F1 в `art/STYLE.md` і
// переписує цей файл; лишаються назви `PALETTE`, `ALLOWED_COLORS`, `LINE`, а в `PALETTE` — `ink`, `paper` і `fill`.

/** Кольори арту: токен → #rrggbb. */
export const PALETTE = {
  /** Чорнильний контур (шар `ink`). */
  ink: "#1f1a24",
  /** Тонкі внутрішні лінії, м'якший за контур. */
  inkSoft: "#3a3140",
  /** Папір: світле тло іконок і бульбашок. */
  paper: "#f3e9dc",
  /** Біла заливка шарів `fill-*` і масок, яку фарбує компонувальник. */
  fill: "#ffffff",
  /** Сірий тіні (шар `shade`, кладеться множенням). */
  shade: "#bdb3c2",
  wallTop: "#3b3340",
  wallFace: "#6b5d6e",
  floorBedroom: "#8f7a66",
  floorBathroom: "#7f8f94",
  floorKitchen: "#9a8c74",
  floorLiving: "#86725f",
  wood: "#8b5e3c",
  glass: "#bfe0ef",
  highlight: "#ffd36b",
  danger: "#d8483b",
  warning: "#e8a33a",
  good: "#6fae6a",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Кольори, дозволені в SVG: усі значення `PALETTE` нижнім регістром (#rrggbb) і білий заливок. */
export const ALLOWED_COLORS: ReadonlySet<string> = new Set([...Object.values(PALETTE).map((color) => color.toLowerCase()), "#ffffff"]);

/**
 * Товщини контуру, одиниці арту: `outer` — зовнішній контур (≈ 6), `inner` — внутрішні лінії (≈ 3); змінна ширина
 * лінії — у межах `min`…`max`.
 */
export const LINE = { outer: 6, inner: 3, min: 2, max: 9 } as const;
