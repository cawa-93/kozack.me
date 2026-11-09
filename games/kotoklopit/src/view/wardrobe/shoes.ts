// Фасони взуття (§5.1, `WARDROBE.md`, «Взуття»): взуття на стопі й халява на нозі; колір — `fill-shoes`, гола стопа — `fill-skin`.
// Поєднання з низом (`WARDROBE.md`, «Поєднання» під «Взуттям») — тут, у `shoeSkin`: його слоти малюються над штаниною, тож саме
// взуття вирішує, що з низу видно.

import type { ArtId, TintStep } from "../art/types";
import { BOTTOM_CUTS, EDGE } from "./bottoms";
import type { SlotFrames, WardrobeEntry, Wear } from "./types";

export interface ShoeCut extends WardrobeEntry {
  /** Взуття на стопі (`shoe-near`, `shoe-far`; верх — не вище 2 над кісточкою); немає — `person/shoe`. */
  readonly shoe?: ArtId;
  /** Халява на нозі (`shaft-*`). */
  readonly shaft?: ArtId;
  /** Штани заправлено в халяву: низу штанини (`hem-*`) не видно, хіба що штанина поверх халяви (`BottomCut.over`). */
  readonly tuck?: boolean;
  /** Халява до кісточки: під довгою штаниною її не видно — лише стопа; на голій нозі — є. */
  readonly ankle?: boolean;
  /** Відкритий підйом (гола стопа): довга штанина без свого низу закінчується над стопою краєм `BottomCut.edge`. */
  readonly open?: boolean;
  /** На босу ногу: під голою ногою без шкарпетки. Інакше низьке взуття (без халяви) з голою ногою — зі шкарпеткою. */
  readonly sockless?: boolean;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

/** Коротка шкарпетка над низьким взуттям на голій нозі. */
const SOCK = "person/shaft/sock";

export const SHOE_CUTS: readonly ShoeCut[] = [
  { name: "кросівки" },
  { name: "кеди", shoe: "person/shoe/canvas" },
  { name: "капці", shoe: "person/shoe/slippers", sockless: true },
  { name: "чоботи", shoe: "person/shoe/boots", shaft: "person/shaft/boots", tuck: true },
  // Під спідницею й шортами — без шкарпетки: верх туфель і так чітко відділяє шкіру.
  { name: "туфлі", shoe: "person/shoe/loafers", sockless: true },
  { name: "черевики", shoe: "person/shoe/ankle", shaft: "person/shaft/ankle", tuck: true, ankle: true },
  // Стопа — кеди: високі відрізняються лише халявою.
  { name: "високі кеди", shoe: "person/shoe/canvas", shaft: "person/shaft/hightop", tuck: true, ankle: true },
  { name: "гумові чоботи", shoe: "person/shoe/rubber", shaft: "person/shaft/rubber", tuck: true, weight: 0.5 },
  { name: "човники", shoe: "person/shoe/pumps", open: true, sockless: true },
  { name: "сандалі", shoe: "person/shoe/sandals", open: true, sockless: true },
  { name: "босоніж", shoe: "person/shoe/barefoot", open: true, sockless: true },
];

/** Що взуття робить із низом штанини: ховає (заправлено), відкриває край над голою стопою чи не чіпає. */
type HemFrames = { readonly "hem-near"?: ArtId | null; readonly "hem-far"?: ArtId | null };

/**
 * Кадри взуття на обох ногах і що воно робить із низом: халява (кльош її накриває, довга штанина — низьку), шкарпетка під голою
 * ногою, заправлені штани — без низу штанини (`hem-*` порожні), над відкритою стопою — край штанини. Поле `hem-*` є лише тоді,
 * коли взуття міняє низ (`personSkin` бере його поверх низу).
 */
export function shoeSkin(wear: Wear): SlotFrames<"shoe-near" | "shoe-far" | "shaft-near" | "shaft-far"> & HemFrames {
  const cut = SHOE_CUTS[wear.shoeCut] ?? SHOE_CUTS[0];
  const legs = BOTTOM_CUTS[wear.bottomCut] ?? BOTTOM_CUTS[0];
  const over = legs?.over === true;
  const bare = legs?.bare === true;
  const shoe = cut?.shoe ?? "person/shoe";
  const own = cut?.shaft ?? null;
  const shaft = own ? (over || (cut?.ankle === true && !bare) ? null : own) : bare && cut?.sockless !== true ? SOCK : null;
  const hem = (frame: ArtId | null): HemFrames => ({ "hem-near": frame, "hem-far": frame });
  const tucked = cut?.tuck === true && !over && !bare;
  const edge = cut?.open === true && !bare && !legs?.hem ? (legs?.edge ?? EDGE) : null;
  return { "shoe-near": shoe, "shoe-far": shoe, "shaft-near": shaft, "shaft-far": shaft, ...(tucked ? hem(null) : edge ? hem(edge) : {}) };
}

/** Кроки рецепта взуття. */
export function shoeSteps(_wear: Wear, color: number): TintStep[] {
  return [{ layer: "fill-shoes", color, put: "source-over" }];
}
