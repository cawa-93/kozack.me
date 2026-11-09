// Візерунки тканини (§5.1, `WARDROBE.md`, «Візерунки»): плитка чи принт поверх заливки верху або низу. Другий тон задає сам
// візерунок (`tone`). Як плитка лягає на кадр — компонувальник (`compose.ts`, `bake.ts`).

import type { ArtId, TintStep } from "../art/types";
import { BOTTOM_CUTS } from "./bottoms";
import { CLOTHES } from "./clothes";
import { TOP_CUTS } from "./tops";
import type { Garment, WardrobeEntry, Wear } from "./types";

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

/** Заливка, на яку лягає візерунок одягу. */
const FILL = { top: "fill-top", bottom: "fill-bottom" } as const;

/**
 * Крок візерунка одягу `garment` (`color` — колір цього одягу): плитка по його заливці; однотонний — нічого. Другий тон —
 * за `tone` (`secondTone`).
 */
export function patternSteps(garment: Garment, wear: Wear, color: number): TintStep[] {
  const pattern = PATTERNS[garment === "top" ? wear.topPattern : wear.bottomPattern];
  if (!pattern?.tile) return [];
  return [{ layer: FILL[garment], color: null, put: "source-over", pattern: { tile: pattern.tile, color: secondTone(pattern.tone ?? "tone", color) } }];
}

/** Темніший відтінок кольору одягу для «тон у тон». */
const TONE_DARKEN = 0.78;

/** Другий тон візерунка: темніший відтінок, протилежний за світлотою колір палітри одягу чи null — свої кольори плитки. */
export function secondTone(tone: PatternTone, color: number): number | null {
  if (tone === "own") return null;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  if (tone === "contrast") return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? (CLOTHES[6] ?? color) : (CLOTHES[5] ?? color);
  const k = (c: number): number => Math.round(c * TONE_DARKEN);
  return (k(r) << 16) | (k(g) << 8) | k(b);
}
