// Фасони взуття (§5.1, `WARDROBE.md`, «Взуття»): взуття на стопі й халява на нозі; колір — `fill-shoes`. Що з низом
// (заправлені штани, шкарпетка під голою ногою) — правило поєднань `bottomSkin` (`bottoms.ts`).

import type { ArtId } from "../art/types";
import type { WardrobeEntry } from "./types";

export interface ShoeCut extends WardrobeEntry {
  /** Взуття на стопі (`shoe-near`, `shoe-far`; верх — не вище 2 над кісточкою); немає — `person/shoe`. */
  readonly shoe?: ArtId;
  /** Халява чи шкарпетка на нозі (`shaft-*`). */
  readonly shaft?: ArtId;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

export const SHOE_CUTS: readonly ShoeCut[] = [{ name: "кросівки" }];
