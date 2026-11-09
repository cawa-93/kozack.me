// Фасони верху (§5.1, `WARDROBE.md`, «Верх»): торс за статурою, рукав і накладки в слотах верху; колір — `fill-top`, річ під
// верхом — `fill-inner`. Нового торса на фасон немає (не вміщується в атлас): силует дають рукав і накладки.

import type { ArtId, TintStep } from "../art/types";
import { CLOTHES } from "./clothes";
import type { SlotFrames, WardrobeEntry, Wear } from "./types";

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

/** Річ під верхом — біла, а під білим верхом — графітова (`innerColor`). */
const WHITE = CLOTHES[6] ?? 0xe9e6df;
const GRAPHITE = CLOTHES[5] ?? 0x3a3440;

const TEE = { arm: "person/arm/tee", armFar: "person/arm-far/tee" } as const;
const COLLAR = "person/top-front/collar";
const SHIRT = { front: COLLAR, hem: "person/top-hem/shirt" } as const;
const HOOD = "person/hood/hoodie";

export const TOP_CUTS: readonly TopCut[] = [
  { name: "лонгслів", group: "повсякденне" },
  { name: "футболка", group: "повсякденне", ...TEE },
  { name: "майка", group: "повсякденне", arm: "person/arm/tank", armFar: "person/arm-far/tank", front: "person/top-front/tank" },
  { name: "сорочка", group: "ділове", ...SHIRT },
  { name: "сорочка з коротким рукавом", group: "ділове", ...SHIRT, ...TEE },
  { name: "поло", group: "повсякденне", ...TEE, front: COLLAR, hem: "person/top-hem/polo" },
  { name: "водолазка", group: "затишне", front: "person/top-front/turtleneck" },
  { name: "худі", group: "повсякденне", front: "person/top-front/hoodie", hem: "person/top-hem/hoodie", hood: HOOD },
  { name: "худі на блискавці", group: "повсякденне", front: "person/top-front/zip-hoodie", hood: HOOD, inner: WHITE },
  { name: "жилет", group: "ділове", arm: "person/arm/vest", armFar: "person/arm-far/vest", front: "person/top-front/vest", inner: WHITE },
  // Рідше за інші: «Випадково» з ним не обирає низу.
  { name: "комбінезон", group: "сукні й комбінезони", front: COLLAR, hem: "person/top-hem/jumpsuit", bottom: 0, weight: 0.5 },
];

/** Кадри верху; `skirt` — лише в сукні: тоді вона займає слот спідниці низу. */
export function topSkin(wear: Wear): SlotFrames<"torso" | "arm-near" | "arm-far" | "top-front" | "hood" | "top-hem"> & { readonly skirt?: ArtId } {
  const cut = TOP_CUTS[wear.topCut] ?? TOP_CUTS[0];
  return {
    torso: cut?.torso?.[wear.build] ?? `person/torso/${wear.build}`,
    "arm-near": cut?.arm ?? "person/arm",
    "arm-far": cut?.armFar ?? "person/arm-far",
    "top-front": cut?.front ?? null,
    hood: cut?.hood ?? null,
    "top-hem": cut?.hem ?? null,
    ...(cut?.skirt ? { skirt: cut.skirt } : {}),
  };
}

/** Кроки рецепта верху: заливка кольором верху й річ під ним (`inner`), якщо фасон її має. */
export function topSteps(wear: Wear, color: number): TintStep[] {
  const inner = TOP_CUTS[wear.topCut]?.inner;
  const steps: TintStep[] = [{ layer: "fill-top", color, put: "source-over" }];
  if (inner !== undefined) steps.push({ layer: "fill-inner", color: innerColor(inner, color), put: "source-over" });
  return steps;
}

/** Колір речі під верхом: того самого кольору, що верх, вона злилася б із ним — тоді протилежна за світлотою. */
export function innerColor(inner: number, top: number): number {
  if (inner !== top) return inner;
  const luma = 0.299 * ((top >> 16) & 0xff) + 0.587 * ((top >> 8) & 0xff) + 0.114 * (top & 0xff);
  return luma < 128 ? WHITE : GRAPHITE;
}
