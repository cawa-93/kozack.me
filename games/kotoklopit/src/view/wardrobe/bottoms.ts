// Фасони низу (§5.1, `WARDROBE.md`, «Низ»): нога й накладки в слотах низу; колір — `fill-bottom` (стегна — у торсі). Правила
// сидіння й присіду для слотів низу — `SIT_SLOTS` (`anims/person/chores.ts`) і `move.ts`.

import type { ArtId } from "../art/types";
import type { WardrobeEntry } from "./types";

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
