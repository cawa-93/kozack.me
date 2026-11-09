// Маніфест фасонів верху (`WARDROBE.md`, «Верх»; реєстр — `src/view/wardrobe/tops.ts`): рукави-варіанти й накладки верху.
//
// Рукав — кадр руки (`person/arm/<код>` ближньої, `person/arm-far/<код>` дальньої) з полотном, pivot і точками `hand`,
// `grip` звичайної руки: кисть і все, що вона тримає, стоять так само в будь-якому фасоні. Накладки висять на нульових
// кістках тулуба з pivot у тазі (`top-front`, `hood` — `chest`, ширина за плечима; `top-hem` — `hips`, за стегнами) і
// малюються на звичайну статуру (`person/torso/1`); ширину інших дає скелет. Полотно накладки — лише її клаптик торса
// (`patch`): бюджет атласу рахує все полотно.
//
// Pivot має лежати на полотні, тож полотно кожної накладки сягає таза. Накладка, що лише лініями лягає на торс (планка,
// кишеня, капюшон ззаду), не має заливки: колір, тінь і плями торса лишаються під нею. Заливки накладок обходять місця плям
// торса (`person/torso-extra/1`), тож своїх `*-extra` немає.

import type { ArtEntry, ArtId, ArtLayer, ArtPoint } from "../types";
import { PART_VIEWS } from "./lib/geometry";

/** Рука, як `person/arm` (`a10-person.ts`): pivot — плече, `hand` — зап'ясток, `grip` — середина долоні. */
const ARM = { size: { w: 27, h: 73 }, pivot: { x: 13, y: 14 }, points: { hand: { x: 14, y: 54.6 }, grip: { x: 14.2, y: 61 } } } as const;

/** Таз звичайного торса (`person/torso/1`): pivot накладок верху в координатах торса. */
export const TORSO_PELVIS: ArtPoint = { x: 29, y: 54 };

/** Полотно накладки — клаптик торса від (`x`, `y`) розміром `w` × `h`; pivot — таз у координатах клаптика. */
export function patch(x: number, y: number, w: number, h: number): { size: { w: number; h: number }; pivot: ArtPoint } {
  return { size: { w, h }, pivot: { x: TORSO_PELVIS.x - x, y: TORSO_PELVIS.y - y } };
}

const SLEEVE: readonly ArtLayer[] = ["fill-top", "fill-skin", "shade", "ink"];
const BARE: readonly ArtLayer[] = ["fill-skin", "shade", "ink"];
const INNER_SLEEVE: readonly ArtLayer[] = ["fill-inner", "fill-skin", "shade", "ink"];
/** Комір, капюшон, водолазка — без тіні: бюджет атласу (`WARDROBE.md`, «Верх»). */
const COLLAR: readonly ArtLayer[] = ["fill-top", "ink"];
const LINES: readonly ArtLayer[] = ["ink"];

const overlay = (id: ArtId, at: ReturnType<typeof patch>, layers: readonly ArtLayer[]): ArtEntry => ({ id, ...at, layers, views: PART_VIEWS });

export const MANIFEST: readonly ArtEntry[] = [
  // Короткий рукав (футболка, поло, сорочка з коротким рукавом): рукав до середини плеча, нижче — гола рука.
  { id: "person/arm/tee", ...ARM, layers: SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/tee", ...ARM, layers: SLEEVE, views: PART_VIEWS },
  // Гола рука від плеча (майка).
  { id: "person/arm/tank", ...ARM, layers: BARE, views: PART_VIEWS },
  { id: "person/arm-far/tank", ...ARM, layers: BARE, views: PART_VIEWS },
  // Рукав сорочки під жилетом: річ під верхом (`fill-inner`), з манжетом.
  { id: "person/arm/vest", ...ARM, layers: INNER_SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/vest", ...ARM, layers: INNER_SLEEVE, views: PART_VIEWS },

  // Майка: шкіра у глибокому вирізі спереду й ззаду.
  overlay("person/top-front/tank", patch(14, 3, 30, 51), ["fill-skin", "shade", "ink"]),
  // Комір сорочки — спільний для сорочки, поло й комбінезона; планки — на поясі: повна (сорочка) і коротка (поло).
  overlay("person/top-front/collar", patch(15, 2, 29, 52), COLLAR),
  overlay("person/top-hem/shirt", patch(23, 10, 14, 48), LINES),
  overlay("person/top-hem/polo", patch(22, 10, 15, 48), LINES),
  // Водолазка: високий комір із відворотом.
  overlay("person/top-front/turtleneck", patch(14, -2, 30, 56), COLLAR),
  // Худі: край капюшона й шнурки; кишеня-кенгуру — на поясі; капюшон на спині (спереду його ховають голова й плечі).
  overlay("person/top-front/hoodie", patch(14, 2, 29, 52), COLLAR),
  overlay("person/top-hem/hoodie", patch(6, 30, 46, 27), LINES),
  overlay("person/hood/hoodie", patch(9, 3, 41, 51), LINES),
  // Худі на блискавці: краї капюшона, борти й футболка між ними (`fill-inner`).
  overlay("person/top-front/zip-hoodie", patch(14, 2, 29, 56), ["fill-top", "fill-inner", "ink"]),
  // Жилет: виріз із сорочкою (`fill-inner`) і її коміром, борт і ґудзики.
  overlay("person/top-front/vest", patch(15, 2, 29, 56), ["fill-inner", "shade", "ink"]),
  // Комбінезон: пасок із пряжкою над подолом.
  overlay("person/top-hem/jumpsuit", patch(0, 38, 57, 20), ["detail", "ink"]),
];
