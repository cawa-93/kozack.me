// Фасони низу (§5.1, `WARDROBE.md`, «Низ»): нога й накладки в слотах низу; колір — `fill-bottom` (стегна — у торсі). Правила
// сидіння й присіду для слотів низу — `SIT_SLOTS` (`anims/person/chores.ts`) і `move.ts`.

import type { ArtId, TintStep } from "../art/types";
import type { SlotFrames, WardrobeEntry, Wear } from "./types";

export type BottomGroup = "довгі штани" | "укорочені" | "спідниці";

export interface BottomCut extends WardrobeEntry {
  readonly group: BottomGroup;
  /** Нога від стегна до кісточки (`leg-near`, `leg-far`); немає — `person/leg`. */
  readonly leg?: ArtId;
  /** Накладка на штанину (`legwear-*`), низ штанини над взуттям (`hem-*`), спідниця (`skirt`). */
  readonly legwear?: ArtId;
  readonly hem?: ArtId;
  readonly skirt?: ArtId;
  /** Візерунки на цей фасон не лягають. */
  readonly plain?: boolean;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

export const BOTTOM_CUTS: readonly BottomCut[] = [{ name: "класичні штани", group: "довгі штани" }];

/** Кадри низу на обох ногах (ближня й дальня — той самий кадр) і спідниця. */
export function bottomSkin(wear: Wear): SlotFrames<"leg-near" | "leg-far" | "legwear-near" | "legwear-far" | "hem-near" | "hem-far" | "skirt"> {
  const cut = BOTTOM_CUTS[wear.bottomCut] ?? BOTTOM_CUTS[0];
  const leg = cut?.leg ?? "person/leg";
  const legwear = cut?.legwear ?? null;
  const hem = cut?.hem ?? null;
  return { "leg-near": leg, "leg-far": leg, "legwear-near": legwear, "legwear-far": legwear, "hem-near": hem, "hem-far": hem, skirt: cut?.skirt ?? null };
}

/** Кроки рецепта низу (`color` — колір низу, у комбінезона — верху). */
export function bottomSteps(_wear: Wear, color: number): TintStep[] {
  return [{ layer: "fill-bottom", color, put: "source-over" }];
}
