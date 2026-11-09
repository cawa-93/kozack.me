// Фасони низу (§5.1, `WARDROBE.md`, «Низ»): нога й накладки в слотах низу; колір — `fill-bottom` (стегна — у торсі), гола нога —
// `fill-skin`. Правила сидіння й присіду для слотів низу — `SIT_SLOTS` (`anims/person/chores.ts`) і `move.ts`; що з низом робить
// взуття (заправлені штани, шкарпетка під голою ногою, кльош поверх халяви) — `shoeSkin` (`shoes.ts`), за полями `bare` і `over`.

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
  /** Нога над взуттям гола: під низьким взуттям — шкарпетка. */
  readonly bare?: boolean;
  /** Штанина поверх халяви: халяви чобіт не видно, низ штанини не ховається. */
  readonly over?: boolean;
  /** Візерунки на цей фасон не лягають. */
  readonly plain?: boolean;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

/** Гола нога плям не має (`WARDROBE.md`, «Низ»). */
const BARE_LEG = "person/leg/bare";

export const BOTTOM_CUTS: readonly BottomCut[] = [
  { name: "класичні штани", group: "довгі штани" },
  { name: "джинси", group: "довгі штани", legwear: "person/legwear/jeans", hem: "person/hem/cuff" },
  // Плями штанини (`person/leg-extra`) лягають і на легінси: компонувальник обтинає їх по силуету ноги.
  { name: "легінси", group: "довгі штани", leg: "person/leg/leggings", stains: { "person/leg/leggings": "person/leg-extra" } },
  { name: "кльош", group: "довгі штани", hem: "person/hem/flare", over: true },
  {
    name: "шорти",
    group: "укорочені",
    leg: BARE_LEG,
    legwear: "person/legwear/shorts",
    bare: true,
    stains: { [BARE_LEG]: null, "person/legwear/shorts": null },
  },
  { name: "міні-спідниця", group: "спідниці", leg: BARE_LEG, skirt: "person/skirt/mini", bare: true, stains: { [BARE_LEG]: null, "person/skirt/mini": null } },
];

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
