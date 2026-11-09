// Візерунки тканини (§5.1, `WARDROBE.md`, «Візерунки»): плитка чи принт поверх заливки верху або низу. Другий тон задає сам
// візерунок (`tone`). Як плитка лягає на кадр — компонувальник (`compose.ts`, `bake.ts`).

import type { ArtId } from "../art/types";
import { BOTTOM_CUTS } from "./bottoms";
import { TOP_CUTS } from "./tops";
import type { Garment, WardrobeEntry } from "./types";

/** Другий тон: темніший відтінок кольору одягу, пара з палітри одягу чи готові кольори плитки. */
export type PatternTone = "tone" | "contrast" | "own";

export interface Pattern extends WardrobeEntry {
  /** На що лягає. */
  readonly on: readonly Garment[];
  /** Плитка (`cloth/<код>`) чи принт (`cloth/print/<код>`); null — однотонний. */
  readonly tile: ArtId | null;
  /** Плиткою по всій заливці чи принтом у точку `print` торса. */
  readonly kind?: "tile" | "print";
  readonly tone?: PatternTone;
}

export const PATTERNS: readonly Pattern[] = [{ name: "однотонний", on: ["top", "bottom"], tile: null }];

/** Чи візерунок `pattern` лягає на одяг `garment` фасону `cut` (`TOP_CUTS` чи `BOTTOM_CUTS`); однотонний — завжди. */
export function patternFits(pattern: number, garment: Garment, cut: number): boolean {
  if (pattern === 0) return true;
  const entry = PATTERNS[pattern];
  const plain = (garment === "top" ? TOP_CUTS[cut] : BOTTOM_CUTS[cut])?.plain === true;
  return entry !== undefined && entry.on.includes(garment) && !plain;
}
