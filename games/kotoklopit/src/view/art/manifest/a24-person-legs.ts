// Маніфест гардеробу «Низ і взуття» (`WARDROBE.md`, «Низ», «Взуття»; правила арту — `art/STYLE.md`, «person»): ноги-варіанти,
// накладки штанини, низ штанини, спідниця, взуття й халява. Які кадри в які слоти — `bottomSkin` і `shoeSkin`
// (`src/view/wardrobe/bottoms.ts`, `shoes.ts`).
//
// Полотна й pivot — суглоба господаря: нога й накладка штанини — стегно (як `person/leg`), низ штанини й халява — кісточка
// (точка `foot` ноги), взуття — кісточка (як `person/shoe`), спідниця — таз (як `person/torso/1`, ширину статури дає кістка
// `hips`).

import type { ArtEntry } from "../types";
import { PART_VIEWS } from "./lib/geometry";

/** Нога від стегна до кісточки — як еталон `person/leg` (`a10-person.ts`): pivot — стегно, `foot` — кісточка. */
const LEG = { size: { w: 33, h: 74 }, pivot: { x: 16, y: 18 }, points: { foot: { x: 16.6, y: 67.2 } } } as const;
/** Взуття — як еталон `person/shoe`: pivot — кісточка; підошва на тій самій висоті. */
const SHOE = { size: { w: 39, h: 25 }, pivot: { x: 16, y: 8 } } as const;
/** Довгу спідницю сидячи й у присіді ламало б (`art/STYLE.md`, «Довжина»): стан на позу. */
const SKIRT_STATES = ["stand", "sit", "squat"] as const;

export const MANIFEST: readonly ArtEntry[] = [
  // Гола нога (шорти, міні-спідниця): шкіра `fill-skin` того ж тону, що обличчя; плям немає (`BOTTOM_CUTS`, `stains`).
  { id: "person/leg/bare", ...LEG, layers: ["fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Легінси: силует голої ноги, кольором низу.
  { id: "person/leg/leggings", ...LEG, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Штанина шортів на голій нозі (слоти `legwear-*`): до коліна, з підгином.
  { id: "person/legwear/shorts", size: { w: 33, h: 46 }, pivot: LEG.pivot, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Бічна строчка джинсів поверх `person/leg`.
  { id: "person/legwear/jeans", ...LEG, layers: ["detail"], views: PART_VIEWS },
  // Підкат джинсів над взуттям (слоти `hem-*`).
  { id: "person/hem/cuff", size: { w: 30, h: 21 }, pivot: { x: 15, y: 14 }, layers: ["fill-bottom", "detail", "shade", "ink"], views: PART_VIEWS },
  // Розтруб кльошу: від коліна ширшає й накриває верх взуття (й халяву чобіт — `shoeSkin` її ховає).
  { id: "person/hem/flare", size: { w: 38, h: 38 }, pivot: { x: 19, y: 28 }, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Міні-спідниця (слот `skirt`): до середини стегна; стоїть, сидить, присіла.
  {
    id: "person/skirt/mini",
    size: { w: 64, h: 48 },
    pivot: { x: 32, y: 17 },
    layers: ["fill-bottom", "shade", "ink"],
    views: PART_VIEWS,
    states: SKIRT_STATES,
  },
  // Кеди: плаский носок із гумовою накладкою, висока біла підошва.
  { id: "person/shoe/canvas", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Капці: пухкі, без шнурків, з опушкою.
  { id: "person/shoe/slippers", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Чоботи — стопа з підбором; верх без контуру, бо його завжди накриває халява.
  { id: "person/shoe/boots", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Халява чобіт до коліна (слоти `shaft-*`, на кістці ноги в кісточці).
  { id: "person/shaft/boots", size: { w: 34, h: 38 }, pivot: { x: 17, y: 31 }, layers: ["fill-shoes", "shade", "ink"], views: PART_VIEWS },
  // Коротка шкарпетка над низьким взуттям на голій нозі; `fill-shoes` під нею — силует для затінення дальньої.
  { id: "person/shaft/sock", size: { w: 25, h: 20 }, pivot: { x: 13, y: 14 }, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
];
