// Маніфест фасонів верху (`WARDROBE.md`, «Верх»; реєстр — `src/view/wardrobe/tops.ts`): рукави-варіанти й накладки верху.
//
// Рукав — кадр руки (`person/arm/<код>` ближньої, `person/arm-far/<код>` дальньої) з pivot і точками `hand`, `grip`
// звичайної руки відносно плеча: кисть і все, що вона тримає, стоять так само в будь-якому фасоні. Накладки висять на нульових
// кістках тулуба з pivot у тазі (`top-front`, `hood` — `chest`, ширина за плечима; `top-hem` і спідниця сукні `top-skirt` у
// слоті `skirt` — `hips`, за стегнами) і малюються на звичайну статуру (`person/torso/1`); ширину інших дає скелет. Полотно
// накладки — лише її клаптик торса (`patch`): бюджет атласу рахує все полотно.
//
// Pivot має лежати на полотні, тож полотно кожної накладки сягає таза. Накладка, що лише лініями лягає на торс (планка,
// кишеня, лацкани, капюшон ззаду), не має заливки: колір, тінь і плями торса лишаються під нею. Заливки накладок здебільшого
// обходять місця плям торса (`person/torso-extra/1`), тож своїх `*-extra` немає: футболка сарафана й напівкомбінезона і поли
// ховають частину плям, решта лишається видимою.

import type { ArtEntry, ArtId, ArtLayer, ArtPoint } from "../types";
import { PART_VIEWS } from "./lib/geometry";

/** Рука, як `person/arm` (`a10-person.ts`): pivot — плече, `hand` — зап'ясток, `grip` — середина долоні. */
const ARM = { size: { w: 27, h: 73 }, pivot: { x: 13, y: 14 }, points: { hand: { x: 14, y: 54.6 }, grip: { x: 14.2, y: 61 } } } as const;
/**
 * Широкий рукав: у полотні руки (поле 4) рукав ширший за звичайний не вміщується, тож полотно ширше на 4, а pivot і точки
 * зсунуті на 2 — відносно плеча кисть там само. `cuff` — середина манжета (принти на манжети).
 */
const WIDE = { size: { w: 31, h: 73 }, pivot: { x: 15, y: 14 }, points: { hand: { x: 16, y: 54.6 }, grip: { x: 16.2, y: 61 } } } as const;
const wideCuff = (x: number, y: number) => ({ ...WIDE, points: { ...WIDE.points, cuff: { x, y } } });
/** Спідниця сукні: таз, як у `person/skirt/mini`; довга — зі станами пози (`art/STYLE.md`, «Довжина»). */
const SKIRT_STATES = ["stand", "sit", "squat"] as const;

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
/** Річ під верхом чи шкіра у вирізі під підборіддям — з тінню від голови, як у торса: без неї виріз читається плямою. */
const UNDER: readonly ArtLayer[] = ["fill-inner", "shade", "ink"];
const SKIRT: readonly ArtLayer[] = ["fill-top", "shade", "ink"];

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

  // Широкий рукав зі спущеним плечем і резинкою на манжеті (светр оверсайз, кардиган).
  { id: "person/arm/sweater", ...wideCuff(16, 52.2), layers: SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/sweater", ...wideCuff(16, 52.2), layers: SLEEVE, views: PART_VIEWS },
  // Рукав-ліхтарик блузки; нижче — гола рука.
  { id: "person/arm/puff", ...WIDE, layers: SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/puff", ...WIDE, layers: SLEEVE, views: PART_VIEWS },
  // Широкий донизу рукав халата з відворотом.
  { id: "person/arm/robe", ...wideCuff(15.6, 51.8), layers: SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/robe", ...wideCuff(15.6, 51.8), layers: SLEEVE, views: PART_VIEWS },
  // Рукав футболки під бретелями (сарафан, напівкомбінезон): річ під верхом (`fill-inner`).
  { id: "person/arm/tee-inner", ...ARM, layers: INNER_SLEEVE, views: PART_VIEWS },
  { id: "person/arm-far/tee-inner", ...ARM, layers: INNER_SLEEVE, views: PART_VIEWS },

  // Майка: шкіра у глибокому вирізі й на плечах за проймою, спереду й ззаду.
  overlay("person/top-front/tank", patch(0, 3, 58, 51), ["fill-skin", "shade", "ink"]),
  // Комір сорочки — спільний для сорочки й комбінезона; планки — на поясі: повна (сорочка) і коротка (поло).
  overlay("person/top-front/collar", patch(15, 2, 29, 52), COLLAR),
  // Комір поло — менший, із заокругленими кінцями.
  overlay("person/top-front/polo", patch(15, 2, 29, 52), COLLAR),
  overlay("person/top-hem/shirt", patch(23, 10, 14, 48), LINES),
  overlay("person/top-hem/polo", patch(22, 10, 15, 48), LINES),
  // Водолазка: високий комір із відворотом.
  overlay("person/top-front/turtleneck", patch(14, -2, 30, 56), COLLAR),
  // Худі: край капюшона й шнурки; кишеня-кенгуру — на поясі; капюшон: ззаду — лініями на спині, спереду — горб за шиєю (видно
  // між головою й плечем, тож полотно сягає вище за торс).
  overlay("person/top-front/hoodie", patch(14, 2, 29, 52), COLLAR),
  overlay("person/top-hem/hoodie", patch(6, 30, 46, 27), LINES),
  overlay("person/hood/hoodie", patch(2, -4, 48, 58), COLLAR),
  // Худі на блискавці: краї капюшона, борти й футболка між ними (`fill-inner`).
  overlay("person/top-front/zip-hoodie", patch(14, 2, 29, 56), ["fill-top", "fill-inner", "ink"]),
  // Жилет: виріз із сорочкою (`fill-inner`) і її коміром, борт і ґудзики.
  overlay("person/top-front/vest", patch(15, 2, 29, 56), ["fill-inner", "shade", "ink"]),
  // Комбінезон: пасок із пряжкою над подолом.
  overlay("person/top-hem/jumpsuit", patch(0, 38, 57, 20), ["detail", "ink"]),
  // Піджак: лацкани й виріз із сорочкою; поли на стегнах — до промежини, тож без станів.
  overlay("person/top-front/blazer", patch(12, 2, 37, 52), UNDER),
  overlay("person/top-hem/blazer", patch(0, 42, 58, 28), COLLAR),
  // Кардиган: V-виріз із футболкою й борт із ґудзиками до низу резинки (полотно нижче подолу торса).
  overlay("person/top-front/cardigan", patch(14, 2, 30, 64), UNDER),
  // Напуск і резинка светра й кардигана.
  overlay("person/top-hem/rib", patch(0, 40, 58, 27), COLLAR),
  // Блузка: бант біля коміра.
  overlay("person/top-front/blouse", patch(15, 2, 29, 52), COLLAR),
  // Сарафан і напівкомбінезон: футболка довкола ліфа чи нагрудника й бретелей.
  overlay("person/top-front/sarafan", patch(0, 4, 58, 50), UNDER),
  overlay("person/top-front/overalls", patch(0, 4, 58, 50), UNDER),
  // Халат: запах — виріз шкірою, шалевий комір і край поли.
  overlay("person/top-front/robe", patch(14, 2, 30, 52), ["fill-skin", "shade", "ink"]),
  // Спідниці сукень (слот `skirt`): кльош туніки й сарафана, низ халата до колін із поясом.
  { id: "person/top-skirt/flare", size: { w: 68, h: 50 }, pivot: { x: 34, y: 17 }, layers: SKIRT, views: PART_VIEWS, states: SKIRT_STATES },
  { id: "person/top-skirt/robe", size: { w: 64, h: 54 }, pivot: { x: 32, y: 17 }, layers: SKIRT, views: PART_VIEWS, states: SKIRT_STATES },
];
