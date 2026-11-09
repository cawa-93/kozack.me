// Акцент зачіски (§5.1, `WARDROBE.md`, «Акцент»): колір неонової маски `fill-accent` у кадрах зачіски. Діє лише в зачісок із
// маскою (`HairStyle.accent`); без акценту маску фарбує колір волосся.

import type { TintStep } from "../art/types";
import { HAIR_STYLES } from "./hair";
import type { WardrobeEntry, Wear } from "./types";

export interface HairAccent extends WardrobeEntry {
  /** Колір маски `fill-accent`; null — колір волосся. */
  readonly color: number | null;
}

/** Неонові: світліші й насиченіші за будь-який колір волосся, тож акцент видно й на фарбованому того самого відтінку. */
export const HAIR_ACCENTS: readonly HairAccent[] = [
  { name: "немає", color: null },
  { name: "рожевий", color: 0xff4fc4 },
  { name: "ціан", color: 0x3fe3f0 },
  { name: "лайм", color: 0xa8f03a },
  { name: "фіолетовий", color: 0xa35cff },
  { name: "помаранчевий", color: 0xff8a1f },
];

/** Чи діє акцент у зачіски `hair` (номер `HAIR_STYLES`). */
export function accentFits(hair: number): boolean {
  return HAIR_STYLES[hair]?.accent === true;
}

/** Крок рецепта маски акценту: лише в зачіски з маскою (`hair` — колір волосся, коли акценту немає). */
export function accentSteps(wear: Wear, hair: number): TintStep[] {
  if (!accentFits(wear.hair)) return [];
  return [{ layer: "fill-accent", color: HAIR_ACCENTS[wear.hairAccent]?.color ?? hair, put: "source-over" }];
}
