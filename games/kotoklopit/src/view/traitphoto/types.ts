// Знімок риси на фото титрів (§4.2): що риса з опису життя (§9.7) додає до пози рівня — річ поруч і зміну пози. Без Phaser і DOM.

import type { CatAnimId } from "../anim/ids";
import type { CatEars, CatEyes, CatMouth } from "../anim/catface";
import type { ArtId, ArtView } from "../art/types";

/** Поза рівня життя (`LIFE_PHOTO_POSES`): мружиться від задоволення, спокійно сидить, ображено, хворий і зіщулений. */
export type LifePose = "content" | "calm" | "sulk" | "ill";
export const LIFE_POSES: readonly LifePose[] = ["content", "calm", "sulk", "ill"];

/** Кістки кота, які знімок може довернути сталим кутом. */
export type CatPhotoBone = "root" | "pelvis" | "body" | "tail" | "neck" | "head" | "leg-front-far" | "leg-front-near" | "leg-back-far" | "leg-back-near";
export const CAT_PHOTO_BONES: readonly CatPhotoBone[] = ["root", "pelvis", "body", "tail", "neck", "head", "leg-front-far", "leg-front-near", "leg-back-far", "leg-back-near"];

/**
 * Поза замість пози рівня. Чого не задано — як у позі рівня; лише нова основа (`base`) скидає накладку рівня: ту підібрано під її
 * основу.
 */
export interface TraitStill {
  /** Основна анімація кота (`CAT_ANIMS`). */
  base?: CatAnimId;
  /** Мить кадру, мс від початку анімації. */
  at?: number;
  /** Накладка (`CAT_OVERLAYS`); null — без накладки. Разом із `bones` не можна. */
  overlay?: CatAnimId | null;
  /** Сталий доворот кісток поверх основи, градуси (голова: «+» — носом донизу, хвіст: «+» — угору). Замість накладки. */
  bones?: Readonly<Partial<Record<CatPhotoBone, number>>>;
  view?: ArtView;
  eyes?: CatEyes;
  mouth?: CatMouth;
  ears?: CatEars;
  /** Кіт дивиться ліворуч: кадри кота дивляться праворуч. Речі не віддзеркалюються. */
  flip?: boolean;
}

/** Річ на фото — кадр арту (`artEntry`), там, де вона стоїть відносно кота. */
export interface TraitProp {
  art: ArtId;
  /** Стан кадру (`artEntry(art).states`); null — без стану. */
  state: string | null;
  /**
   * Pivot кадру від кореня кота (на підлозі між лапами), одиниці арту дорослого кота: x — праворуч, y — донизу, тобто ближче
   * до камери. Кошеня менше — місця ближче, сама річ — та сама.
   */
  x: number;
  y: number;
  /** Поверх кота; інакше — позаду нього. */
  front?: boolean;
  rot?: number;
  scale?: number;
  /** Віддзеркалити річ. */
  flip?: boolean;
}

/**
 * Інший кіт на фото (друг, суперник, кошеня) — свого незмінного вигляду, не схожого на героя. Місце — як у речі (`TraitProp`);
 * хто ближче до камери (більший y), той поверх.
 */
export interface TraitCompanion {
  age: "adult" | "kitten";
  /** Поза; основа обов'язкова — пози рівня в іншого кота немає. */
  still: TraitStill & { base: CatAnimId };
  x: number;
  y: number;
}

/** Знімок риси на одну позу рівня. */
export interface TraitShot {
  /** Задум: що видно на фото й як це каже про рису й настрій рівня. Для рецензії, гравець його не бачить. */
  idea: string;
  still?: TraitStill;
  props?: readonly TraitProp[];
  companions?: readonly TraitCompanion[];
}

/** Знімки одного боку групи: на кожну позу рівня. */
export type TraitSideShots = Readonly<Record<LifePose, TraitShot>>;

/** Знімки розділу рис: група (`TRAIT_GROUPS`) → бік (`plus` — рівні +1 і +2, `minus` — −1 і −2) → поза рівня. */
export type TraitPhotoShots = Readonly<Record<string, { plus: TraitSideShots; minus: TraitSideShots }>>;
