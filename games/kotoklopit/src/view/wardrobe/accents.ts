// Акцент зачіски (§5.1, `WARDROBE.md`, «Акцент»): колір неонової маски `fill-accent` у кадрах зачіски. Діє лише в зачісок із
// маскою (`HairStyle.accent`); без акценту маску фарбує колір волосся.

import type { TintStep } from "../art/types";
import { HAIR_STYLES } from "./hair";
import type { WardrobeEntry, Wear } from "./types";

export interface HairAccent extends WardrobeEntry {
  /** Колір маски `fill-accent`; null — колір волосся. */
  readonly color: number | null;
}

export const HAIR_ACCENTS: readonly HairAccent[] = [{ name: "немає", color: null }];

/** Чи діє акцент у зачіски `hair` (номер `HAIR_STYLES`). */
export function accentFits(hair: number): boolean {
  return HAIR_STYLES[hair]?.accent === true;
}

/** Крок рецепта маски акценту: лише в зачіски з маскою (`hair` — колір волосся, коли акценту немає). */
export function accentSteps(wear: Wear, hair: number): TintStep[] {
  if (!accentFits(wear.hair)) return [];
  return [{ layer: "fill-accent", color: HAIR_ACCENTS[wear.hairAccent]?.color ?? hair, put: "source-over" }];
}
