// Візерунки тканини (§5.1, `WARDROBE.md`, «Візерунки»): плитка чи принт поверх заливки верху або низу. Другий тон задає сам
// візерунок (`tone`). Як тканина лягає на кадр — `art/cloth.ts` і компонувальник (`compose.ts`).

import { artEntry } from "../art/manifest";
import type { ArtId, TintPattern, TintStep } from "../art/types";
import { BUILDS } from "./body";
import { BOTTOM_CUTS } from "./bottoms";
import { CLOTHES } from "./clothes";
import { TOP_CUTS } from "./tops";
import type { Garment, WardrobeEntry, Wear } from "./types";

/** Другий тон: темніший відтінок кольору одягу, пара з палітри одягу чи готові кольори плитки. */
export type PatternTone = "tone" | "contrast" | "own";

export interface Pattern extends WardrobeEntry {
  /** На що лягає. */
  readonly on: readonly Garment[];
  /** Плитка (`cloth/<назва>`) чи принт (`cloth/print/<назва>`); null — однотонний. */
  readonly tile: ArtId | null;
  /** Плиткою по всій заливці чи принтом у точку `print` торса. */
  readonly kind?: "tile" | "print";
  readonly tone?: PatternTone;
  /** Принт на манжети — у точку `cuff` рукава. */
  readonly cuff?: ArtId;
  /** Плитку повернуто на чверть оберту. */
  readonly turn?: true;
}

/** Номери лише дописуються в кінець (`WARDROBE.md`, «Як влаштовано»): номер — у збереженні. */
export const PATTERNS: readonly Pattern[] = [{ name: "однотонний", on: ["top", "bottom"], tile: null }];

/**
 * Чи візерунок `pattern` лягає на одяг `garment` фасону `cut` (`TOP_CUTS` чи `BOTTOM_CUTS`); однотонний — завжди. Принт — лише
 * на верх, у торсів якого (кожної статури) є точка `print`.
 */
export function patternFits(pattern: number, garment: Garment, cut: number): boolean {
  if (pattern === 0) return true;
  const entry = PATTERNS[pattern];
  const plain = (garment === "top" ? TOP_CUTS[cut] : BOTTOM_CUTS[cut])?.plain === true;
  if (entry === undefined || !entry.on.includes(garment) || plain) return false;
  return entry.kind !== "print" || (garment === "top" && hasPrintPoint(cut));
}

const printPoints = new Map<number, boolean>();

function hasPrintPoint(cut: number): boolean {
  let fits = printPoints.get(cut);
  if (fits === undefined) {
    const torsos = TOP_CUTS[cut]?.torso ?? BUILDS.map((_, build): ArtId => `person/torso/${build}`);
    fits = torsos.every((id) => artEntry(id)?.points?.["print"] !== undefined);
    printPoints.set(cut, fits);
  }
  return fits;
}

/** Заливка, на яку лягає візерунок одягу. */
const FILL = { top: "fill-top", bottom: "fill-bottom" } as const;

/**
 * Крок візерунка одягу `garment` (`color` — колір цього одягу): плитка чи принт по його заливці; однотонний — нічого. Другий
 * тон — за `tone` (`secondTone`).
 */
export function patternSteps(garment: Garment, wear: Wear, color: number): TintStep[] {
  const pattern = PATTERNS[garment === "top" ? wear.topPattern : wear.bottomPattern];
  if (!pattern?.tile) return [];
  // Лише задані поля: з них складається ключ рецепта.
  const tint: TintPattern = {
    tile: pattern.tile,
    color: secondTone(pattern.tone ?? "tone", color),
    ...(pattern.kind === "print" ? { kind: "print" as const } : {}),
    ...(pattern.cuff ? { cuff: pattern.cuff } : {}),
    ...(pattern.turn ? { turn: true as const } : {}),
  };
  return [{ layer: FILL[garment], color: null, put: "source-over", pattern: tint }];
}

/** «Тон у тон»: світлий і середній колір темніє, темний — світлішає (темніше за графітовий уже не видно). */
const TONE = { darken: 0.78, lighten: 0.2, darkBelow: 110 } as const;

/**
 * «Контраст»: пара кожного кольору палітри одягу (`CLOTHES`, за номером) — найвиразніша з тих, що пасують: на кольоровому —
 * білий, на жовтому — графітовий, на білому — червоний. ΔE пар перевіряє `tests/wardrobe-patterns.test.ts`.
 */
const CONTRAST: readonly number[] = [6, 6, 6, 5, 6, 6, 0];

/** Другий тон візерунка: відтінок кольору одягу, пара з палітри одягу чи null — свої кольори плитки. */
export function secondTone(tone: PatternTone, color: number): number | null {
  if (tone === "own") return null;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (tone === "contrast") {
    const i = CLOTHES.indexOf(color);
    const pair = i >= 0 ? CLOTHES[CONTRAST[i] ?? -1] : undefined;
    return pair ?? (luma < 128 ? (CLOTHES[6] ?? color) : (CLOTHES[5] ?? color));
  }
  const k = luma < TONE.darkBelow ? (c: number): number => Math.round(c + (255 - c) * TONE.lighten) : (c: number): number => Math.round(c * TONE.darken);
  return (k(r) << 16) | (k(g) << 8) | k(b);
}
