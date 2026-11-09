// Фасони верху (§5.1, `WARDROBE.md`, «Верх»): торс за статурою, рукав і накладки в слотах верху; колір — `fill-top`, річ під
// верхом — `fill-inner`. Нового торса на фасон немає (не вміщується в атлас): силует дають рукав і накладки.

import type { ArtId } from "../art/types";
import type { WardrobeEntry } from "./types";

export type TopGroup = "повсякденне" | "ділове" | "затишне" | "сукні й комбінезони";

export interface TopCut extends WardrobeEntry {
  readonly group: TopGroup;
  /** Торс за статурою (`BUILDS`); немає — `person/torso/<статура>`. */
  readonly torso?: readonly ArtId[];
  /** Ближня й дальня рука з рукавом; немає — `person/arm`, `person/arm-far`. */
  readonly arm?: ArtId;
  readonly armFar?: ArtId;
  /** Накладки: на груди (`top-front`), капюшон (`hood`), поділ (`top-hem`), спідниця сукні (слот `skirt` замість низу). */
  readonly front?: ArtId;
  readonly hood?: ArtId;
  readonly hem?: ArtId;
  readonly skirt?: ArtId;
  /** Колір речі під верхом (`fill-inner`: сорочка під жилетом); немає — шару в рецепті немає. */
  readonly inner?: number;
  /** Верх із власним низом (комбінезон): цей фасон низу (`BOTTOM_CUTS`), ноги — кольором і візерунком верху. */
  readonly bottom?: number;
  /** Візерунки на цей фасон не лягають. */
  readonly plain?: boolean;
  /** Плями: кадр → його накладка плям (null — без плям); без запису — `<частина>-extra` за назвою кадру. */
  readonly stains?: Readonly<Record<string, ArtId | null>>;
}

export const TOP_CUTS: readonly TopCut[] = [{ name: "лонгслів", group: "повсякденне" }];
