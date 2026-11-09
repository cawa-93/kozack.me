// Фасони взуття (§5.1, `WARDROBE.md`, «Взуття»): взуття на стопі й халява на нозі; колір — `fill-shoes`. Що з низом
// (заправлені штани, шкарпетка під голою ногою) — правило поєднань `bottomSkin` (`bottoms.ts`).

import type { ArtId, TintStep } from "../art/types";
import type { SlotFrames, WardrobeEntry, Wear } from "./types";

export interface ShoeCut extends WardrobeEntry {
  /** Взуття на стопі (`shoe-near`, `shoe-far`; верх — не вище 2 над кісточкою); немає — `person/shoe`. */
  readonly shoe?: ArtId;
  /** Халява чи шкарпетка на нозі (`shaft-*`). */
  readonly shaft?: ArtId;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

export const SHOE_CUTS: readonly ShoeCut[] = [{ name: "кросівки" }];

/** Кадри взуття на обох ногах. */
export function shoeSkin(wear: Wear): SlotFrames<"shoe-near" | "shoe-far" | "shaft-near" | "shaft-far"> {
  const cut = SHOE_CUTS[wear.shoeCut] ?? SHOE_CUTS[0];
  const shoe = cut?.shoe ?? "person/shoe";
  const shaft = cut?.shaft ?? null;
  return { "shoe-near": shoe, "shoe-far": shoe, "shaft-near": shaft, "shaft-far": shaft };
}

/** Кроки рецепта взуття. */
export function shoeSteps(_wear: Wear, color: number): TintStep[] {
  return [{ layer: "fill-shoes", color, put: "source-over" }];
}
