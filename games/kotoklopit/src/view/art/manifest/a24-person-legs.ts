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
/** Широка штанина — ширше полотно, ті самі суглоби відносно pivot (стопи стоять так само). */
const WIDE_LEG = { size: { w: 41, h: 74 }, pivot: { x: 20, y: 18 }, points: { foot: { x: 20.6, y: 67.2 } } } as const;
/** Взуття — як еталон `person/shoe`: pivot — кісточка; підошва на тій самій висоті. */
const SHOE = { size: { w: 39, h: 25 }, pivot: { x: 16, y: 8 } } as const;
/** Низька халява (черевики, високі кеди): pivot — кісточка, верх — на 12 вище. */
const ANKLE_SHAFT = { size: { w: 30, h: 25 }, pivot: { x: 15, y: 18 } } as const;
/** Край штанини над голою стопою: pivot — кісточка. */
const EDGE = { size: { w: 30, h: 21 }, pivot: { x: 15, y: 13 } } as const;
/** Довгу спідницю сидячи й у присіді ламало б (`art/STYLE.md`, «Довжина»): стан на позу. */
const SKIRT_STATES = ["stand", "sit", "squat"] as const;
/** Спідниця — на полотні торса `person/torso/1`, зсунутому на (3, −37): pivot — таз. */
const SKIRT_PIVOT = { x: 32, y: 17 } as const;

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

  // --- Хвиля 2 ---------------------------------------------------------------------------------------

  // Строчка вузьких джинсів — під силует легінсів.
  { id: "person/legwear/skinny", ...LEG, layers: ["detail"], views: PART_VIEWS },
  // Вузький підкат вузьких джинсів.
  { id: "person/hem/skinny", size: { w: 26, h: 21 }, pivot: { x: 13, y: 14 }, layers: ["fill-bottom", "detail", "shade", "ink"], views: PART_VIEWS },
  // Накладна кишеня карго на стегні з клапаном — самі лінії й тінь поверх `person/leg`.
  { id: "person/legwear/cargo", size: { w: 33, h: 50 }, pivot: LEG.pivot, layers: ["shade", "ink"], views: PART_VIEWS },
  // Лампаси спортивних штанів уздовж зовнішнього боку.
  { id: "person/legwear/stripes", ...LEG, layers: ["detail", "ink"], views: PART_VIEWS },
  // Гумка спортивних штанів над взуттям.
  { id: "person/hem/band", size: { w: 30, h: 21 }, pivot: { x: 15, y: 14 }, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Штанина бриджів на голій нозі: до середини гомілки, з підгином.
  { id: "person/legwear/capri", size: { w: 33, h: 62 }, pivot: LEG.pivot, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Широка штанина до кісточки (низ — `person/hem/wide` поверх взуття); стрілка й тінь ззаду, щоб у кроці ноги не зливалися.
  { id: "person/leg/wide", ...WIDE_LEG, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Плями на широкій штанині (полотно й pivot — її).
  { id: "person/leg-extra/wide", ...WIDE_LEG, layers: ["extra-stain"], views: PART_VIEWS },
  // Низ широкої штанини: накриває верх взуття (і халяву — `BottomCut.over`), носок визирає.
  { id: "person/hem/wide", size: { w: 40, h: 37 }, pivot: { x: 20, y: 20 }, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Край довгої штанини над голою стопою (босоніж, сандалі, човники — `ShoeCut.open`): класичної ширини й вузький (легінси).
  { id: "person/hem/edge", ...EDGE, layers: ["fill-bottom", "ink"], views: PART_VIEWS },
  { id: "person/hem/edge-narrow", ...EDGE, layers: ["fill-bottom", "ink"], views: PART_VIEWS },
  // Міді: А-силует нижче колін; стоїть, сидить, присіла (сидячи — не нижче сідниць торса, щоб, падаючи, не йти під підлогу).
  { id: "person/skirt/midi", size: { w: 70, h: 62 }, pivot: SKIRT_PIVOT, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS, states: SKIRT_STATES },
  // Плісе: міді в складку; без тіні — об'єм дають складки (бюджет атласу).
  { id: "person/skirt/pleated", size: { w: 70, h: 62 }, pivot: SKIRT_PIVOT, layers: ["fill-bottom", "ink"], views: PART_VIEWS, states: SKIRT_STATES },
  // Олівець: вузька до коліна (хода дрібним кроком — `BottomCut.hobble`); без тіні.
  { id: "person/skirt/pencil", size: { w: 68, h: 55 }, pivot: SKIRT_PIVOT, layers: ["fill-bottom", "ink"], views: PART_VIEWS, states: SKIRT_STATES },
  // Туфлі: низькі, гладкі, з невеликим підбором.
  { id: "person/shoe/loafers", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Черевики — стопа зі шнурівкою й підбором; халява — `person/shaft/ankle`.
  { id: "person/shoe/ankle", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Халява черевиків над кісточкою (≈ 12) зі шнурівкою.
  { id: "person/shaft/ankle", ...ANKLE_SHAFT, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Халява високих кедів (стопа — `person/shoe/canvas`): шнурівка й гумова латка на кісточці.
  { id: "person/shaft/hightop", ...ANKLE_SHAFT, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Гумові чоботи: круглий носок, товста рифлена підошва.
  { id: "person/shoe/rubber", ...SHOE, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },
  // Широка халява гумових чобіт під коліно.
  { id: "person/shaft/rubber", size: { w: 36, h: 40 }, pivot: { x: 18, y: 33 }, layers: ["fill-shoes", "shade", "ink"], views: PART_VIEWS },
  // Човники: підбор-шпилька (≥ 3), відкритий підйом — шкіра (`fill-skin`).
  { id: "person/shoe/pumps", ...SHOE, layers: ["fill-shoes", "fill-skin", "detail", "shade", "ink"], views: PART_VIEWS },
  // Сандалі: стопа шкірою, ремінці кольором взуття, підошва.
  { id: "person/shoe/sandals", ...SHOE, layers: ["fill-shoes", "fill-skin", "detail", "shade", "ink"], views: PART_VIEWS },
  // Босоніж: гола стопа; на кісточці — згин, а не край штанини (його дає `person/hem/edge`, коли штанина довга).
  { id: "person/shoe/barefoot", ...SHOE, layers: ["fill-skin", "shade", "ink"], views: PART_VIEWS },
];
