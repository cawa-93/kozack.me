// Фасони взуття (§5.1, `WARDROBE.md`, «Взуття»): взуття на стопі й халява на нозі; колір — `fill-shoes`. Поєднання з низом
// (`WARDROBE.md`, «Поєднання» під «Взуттям») — тут, у `shoeSkin`: його слоти малюються над штаниною, тож саме взуття вирішує, що з
// низу видно.

import type { ArtId, TintStep } from "../art/types";
import { BOTTOM_CUTS } from "./bottoms";
import type { SlotFrames, WardrobeEntry, Wear } from "./types";

export interface ShoeCut extends WardrobeEntry {
  /** Взуття на стопі (`shoe-near`, `shoe-far`; верх — не вище 2 над кісточкою); немає — `person/shoe`. */
  readonly shoe?: ArtId;
  /** Халява на нозі (`shaft-*`). */
  readonly shaft?: ArtId;
  /** Штани заправлено в халяву: низу штанини (`hem-*`) не видно, хіба що штанина поверх халяви (`BottomCut.over`). */
  readonly tuck?: boolean;
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
];

/**
 * Кадри взуття на обох ногах і що воно робить із низом: халява (кльош її накриває — тоді її немає), шкарпетка під голою
 * ногою, а заправлені штани — без низу штанини (`hem-*` порожні; поле є лише тоді, щоб не перекрити низ, `personSkin`).
 */
export function shoeSkin(wear: Wear): SlotFrames<"shoe-near" | "shoe-far" | "shaft-near" | "shaft-far"> & { readonly "hem-near"?: null; readonly "hem-far"?: null } {
  const cut = SHOE_CUTS[wear.shoeCut] ?? SHOE_CUTS[0];
  const legs = BOTTOM_CUTS[wear.bottomCut] ?? BOTTOM_CUTS[0];
  const over = legs?.over === true;
  const shoe = cut?.shoe ?? "person/shoe";
  const sock = legs?.bare === true && cut?.sockless !== true ? SOCK : null;
  const shaft = over ? null : (cut?.shaft ?? sock);
  const tucked = cut?.tuck === true && !over;
  return { "shoe-near": shoe, "shoe-far": shoe, "shaft-near": shaft, "shaft-far": shaft, ...(tucked ? { "hem-near": null, "hem-far": null } : {}) };
}

/** Кроки рецепта взуття. */
export function shoeSteps(_wear: Wear, color: number): TintStep[] {
  return [{ layer: "fill-shoes", color, put: "source-over" }];
}
