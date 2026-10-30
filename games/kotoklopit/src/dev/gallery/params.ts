// Адреса галереї арту (крок 16): `gallery.html?tab=<id>&bg=<light|dark|floor>&zoom=<k>&t=<мс>…` — щоб посилання й скрипт
// знімків відкривали той самий вигляд. Без Phaser; DOM — лише `replaceParams` (решту перевіряє `tests/gallery.test.ts`).

/** Тло під артом: світле (папір), темне (як тло гри) чи підлога з ізометричною сіткою плиток. */
export type GalleryBg = "light" | "dark" | "floor";
export const GALLERY_BGS: readonly GalleryBg[] = ["light", "dark", "floor"];
export const BG_TITLES: Readonly<Record<GalleryBg, string>> = { light: "Світле", dark: "Темне", floor: "Підлога" };

/**
 * Масштаб «як у грі на телефоні»: CSS px на одиницю арту, за якого дорослий кіт (≈ 56 одиниць заввишки) має ≈ 40 px
 * (§9.4, GRAPHICS_PLAN.md: «Проєкція і глибина»). Висоти остаточно фіксує F1 у `art/STYLE.md`.
 */
export const PHONE_ZOOM = 40 / 56;
/** Межі масштабу, CSS px на одиницю арту. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Готові масштаби для перемикача: `phone` в адресі — `PHONE_ZOOM`. */
export const ZOOM_PRESETS: readonly { value: number; title: string }[] = [
  { value: 0.25, title: "×0,25" },
  { value: 0.5, title: "×0,5" },
  { value: PHONE_ZOOM, title: "як на телефоні" },
  { value: 1, title: "×1" },
  { value: 2, title: "×2" },
  { value: 4, title: "×4" },
];

/** Повзунок часу: від 0 до стількох мілісекунд (`span`), за замовчуванням і на вибір. */
export const DEFAULT_SPAN = 4000;
export const SPANS: readonly number[] = [1000, 2000, 4000, 8000, 16000];
/** Швидкість відтворення: множник живого часу. */
export const SPEEDS: readonly number[] = [0.1, 0.25, 0.5, 1, 2];

export interface GalleryParams {
  /** Вкладка (`tab`); null — перша. */
  tab: string | null;
  bg: GalleryBg;
  /** CSS px на одиницю арту (`zoom`: число чи `phone`). */
  zoom: number;
  /** Час на паузі, мс (`t`); null — час іде від нуля. */
  time: number | null;
  /** Довжина повзунка часу, мс (`span`). */
  span: number;
  /** Швидкість відтворення (`speed`). */
  speed: number;
  /** Бічна панель (`panel=1|0`); null — за шириною вікна. */
  panel: boolean | null;
}

/** Масштаб з адреси: `phone` чи додатне число, обмежене `MIN_ZOOM`…`MAX_ZOOM`; інше — null. */
export function parseZoom(value: string | null): number | null {
  if (value === null || value === "") return null;
  if (value === "phone") return PHONE_ZOOM;
  const zoom = Number(value.replace(",", "."));
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  return clampZoom(zoom);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Масштаб для адреси: `phone` для телефонного, інакше число без зайвих знаків. */
export function formatZoom(zoom: number): string {
  if (Math.abs(zoom - PHONE_ZOOM) < 1e-9) return "phone";
  return String(Math.round(zoom * 1000) / 1000);
}

function parseBg(value: string | null): GalleryBg {
  return GALLERY_BGS.find((bg) => bg === value) ?? "light";
}

function parseNumberIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/** Параметри галереї з `location.search`; незнайоме — за замовчуванням. */
export function parseGalleryParams(search: string): GalleryParams {
  const params = new URLSearchParams(search);
  const span = parseNumberIn(params.get("span"), 100, 600_000) ?? DEFAULT_SPAN;
  const time = parseNumberIn(params.get("t"), 0, Number.MAX_SAFE_INTEGER);
  const panel = params.get("panel");
  return {
    tab: params.get("tab") || null,
    bg: parseBg(params.get("bg")),
    zoom: parseZoom(params.get("zoom")) ?? 1,
    time: time === null ? null : Math.min(time, span),
    span,
    speed: parseNumberIn(params.get("speed"), 0.01, 10) ?? 1,
    panel: panel === "1" ? true : panel === "0" ? false : null,
  };
}

/**
 * `location.search` зі змінами: значення — замінити, null — прибрати; решту параметрів (зокрема вкладок) не чіпає. Повертає
 * рядок із «?» чи порожній.
 */
export function withParams(search: string, changes: Readonly<Record<string, string | null>>): string {
  const params = new URLSearchParams(search);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Оновити адресу сторінки без перезавантаження й без нового запису в історії. */
export function replaceParams(changes: Readonly<Record<string, string | null>>): void {
  const search = withParams(window.location.search, changes);
  window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
}
