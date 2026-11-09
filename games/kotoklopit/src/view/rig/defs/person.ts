// Скелет персонажа (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): кістки, слоти частин арту, якорі, гнізда, вихідні
// пози двох ракурсів і пропорції статури. Персонаж дивиться праворуч; ліворуч — віддзеркалення.
//
// Одиниці арту = px світу. Корінь — точка підлоги між ступнями; персонаж ≈ 140 заввишки до маківки. Кістки — по одній
// на частину арту (нога — один кадр `person/leg`, рука — `person/arm`, дальня — `person/arm-far`), плюс таз, шия і короткі кістки кисті й стопи
// (кисть тримає гнізда рук, стопа — взуття):
//
//   root ─ pelvis ─┬─ torso ─┬─ neck ─ head            (волосся ззаду й спереду, очі — слоти на голові)
//                  │         ├─ chest, hips            (накладки одягу: груди й капюшон, поділ і спідниця)
//                  │         ├─ arm-far ─┬─ arm-far-skin   (кадр руки)
//                  │         │           └─ hand-far
//                  │         └─ arm-near ─┬─ arm-near-skin (кадр руки)
//                  │                      └─ hand-near     (гнізда: вудочка, річ у руках)
//                  ├─ leg-far ─ foot-far               (взуття — на стопі; накладки штанини, халява й низ штанини — на нозі)
//                  └─ leg-near ─ foot-near
//
// Накладки одягу (гардероб, `WARDROBE.md`) висять на «шкірі» тулуба: `chest` і `hips` — нульові кістки торса, ширші й вужчі за
// статурою (`proportions`), бо кадр накладки один на всі статури, а торси статур — різні кадри. Халява й низ штанини — на
// кістці ноги в кісточці, а не на стопі: стопа в ході повертається, а халява має йти за гомілкою.
//
// Кадр руки висить не на самій кістці руки, а на її «шкірі» (`arm-*-skin`: та сама точка й кут, довжина 0): товщину рук за
// статурою (`proportions`) дає масштаб шкіри, і кисть його не успадковує. Інакше масштаб упоперек руки, повернутої
// анімацією, перекошував би осі кисті, і річ у руці стрункої й кремезної статури хилилася б на ±3,5–4° (кисть тримає
// її рівно за `levelHand`, що про статуру не знає).
//
// Кути кісток: 0 — праворуч (уперед), 90 — донизу, −90 — угору. Тулуб і голова дивляться вгору, руки й ноги — донизу,
// тож додатний поворот руки чи ноги — назад, а тулуба — нахил уперед. Система тулуба: x — угору, y — уперед.
//
// ¾ спереду ближній бік (права рука) на екрані ліворуч від тулуба, ¾ ззаду — праворуч: ближні й далекі кінцівки міняються
// місцями по x, а за z ближні завжди перед тулубом.
//
// Положення суглобів беруться з точок кадрів (`PERSON_FIT`): pivot кадру — суглоб (голова — підборіддя над шиєю, рука —
// плече, нога — кульшовий суглоб, взуття — щиколотка, тулуб — середина таза); торс має точки `neck` (де pivot голови),
// `shoulder-far`/`-near`, `hip-far`/`-near`; необов'язкові: торс — `neck-base`, `arms` (де тримає кота), голова — `eyes`
// і `top` (над маківкою, для бульбашок), рука — `hand` (зап'ясток) і `grip` (кулак: річ і вудочка). Волосся ззаду й
// спереду мають той самий pivot, що й голова (малюються на її полотні). Числа нижче — запасні (запису чи точки немає): вони
// дають ту саму вихідну позу, що й точки еталонів F1b (`art/person/*`, art/STYLE.md, розділ 13; тест `tests/rig.test.ts`),
// тож скелет без атласу стоїть так само.

import type { ArtId } from "../../art/types";
import type { Look } from "../../../sim/types";
import { bottomSkin } from "../../wardrobe/bottoms";
import { hairSkin } from "../../wardrobe/hair";
import { personLooks, wearOf } from "../../wardrobe/index";
import { shoeSkin } from "../../wardrobe/shoes";
import { topSkin } from "../../wardrobe/tops";
import { defineFit, type ProportionRef } from "../rigcore";
import { defineRig, type SkinOf, type SlotOf } from "../types";

/** Товщина рук і ніг за статурою: руки — масштаб «шкіри» (кисть його не успадковує, див. початок файлу). */
const limbs = (k: number) =>
  ({
    "arm-far-skin": { scale: { x: 1, y: k } },
    "arm-near-skin": { scale: { x: 1, y: k } },
    "leg-far": { scale: { x: 1, y: k } },
    "leg-near": { scale: { x: 1, y: k } },
  }) as const;

/**
 * Ширина накладок одягу за статурою відносно звичайної — як у торсів статур (`person/torso/<статура>`): груди — за відстанню
 * між плечима, поділ і спідниця — між стегнами (звіряє `tests/rig.test.ts`). У системі тулуба ширина — вісь y.
 */
export const OVERLAY_WIDTH = { slim: { chest: 0.88, hips: 0.85 }, stocky: { chest: 1.14, hips: 1.21 } } as const;

const overlays = (w: { chest: number; hips: number }) =>
  ({
    chest: { scale: { x: 1, y: w.chest } },
    hips: { scale: { x: 1, y: w.hips } },
  }) as const;

/** Кісточка в системі ноги (точка `foot` кадру `person/leg` від стегна): там халява й низ штанини. */
const ANKLE = { x: 49.2, y: -0.6 } as const;

export const PERSON_RIG = defineRig({
  id: "person",
  bones: [
    { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
    { id: "pelvis", parent: "root", x: 0, y: -64, rot: 0, len: 4 },
    { id: "torso", parent: "pelvis", x: 0, y: 0, rot: -90, len: 40 },
    { id: "chest", parent: "torso", x: 0, y: 0, rot: 0, len: 0 },
    { id: "hips", parent: "torso", x: 0, y: 0, rot: 0, len: 0 },
    // Шия — від основи (`neck-base`) до підборіддя (`neck`); голова дивиться вгору.
    { id: "neck", parent: "torso", x: 40, y: 0.5, rot: 0, len: 5.5 },
    { id: "head", parent: "neck", x: 5.5, y: 1, rot: 0, len: 30 },
    // Руки: у системі тулуба x — угору, y — уперед; ¾ спереду далеке плече праворуч (+y), ближнє — ліворуч і нижче.
    // Довжина — від плеча до зап'ястка (`hand`), кисть — до хвату (`grip`).
    { id: "arm-far", parent: "torso", x: 38.4, y: 15, rot: 180, len: 40.6 },
    { id: "arm-far-skin", parent: "arm-far", x: 0, y: 0, rot: 0, len: 0 },
    { id: "hand-far", parent: "arm-far", x: 40.6, y: -1, rot: 0, len: 6.4 },
    { id: "arm-near", parent: "torso", x: 36.4, y: -17, rot: 180, len: 40.6 },
    { id: "arm-near-skin", parent: "arm-near", x: 0, y: 0, rot: 0, len: 0 },
    { id: "hand-near", parent: "arm-near", x: 40.6, y: -1, rot: 0, len: 6.4 },
    // Ноги: далека трохи вище (далі на підлозі), ближня — нижче; довжина — від стегна до кісточки (`foot`); стопа дивиться
    // вперед.
    { id: "leg-far", parent: "pelvis", x: 6, y: 2.6, rot: 90, len: 49.2 },
    { id: "foot-far", parent: "leg-far", x: 49.2, y: -0.6, rot: -90, len: 12 },
    { id: "leg-near", parent: "pelvis", x: -6.5, y: 5, rot: 90, len: 49.2 },
    { id: "foot-near", parent: "leg-near", x: 49.2, y: -0.6, rot: -90, len: 12 },
  ],
  slots: [
    { id: "hair-back", bone: "head", z: 0, frame: null },
    { id: "arm-far", bone: "arm-far-skin", z: 1, frame: null },
    { id: "leg-far", bone: "leg-far", z: 2, frame: null },
    { id: "legwear-far", bone: "leg-far", z: 2.3, frame: null },
    { id: "shoe-far", bone: "foot-far", z: 3, frame: null },
    { id: "shaft-far", bone: "leg-far", z: 3.3, frame: null, ...ANKLE },
    { id: "hem-far", bone: "leg-far", z: 3.6, frame: null, ...ANKLE },
    { id: "leg-near", bone: "leg-near", z: 4, frame: null },
    { id: "legwear-near", bone: "leg-near", z: 4.3, frame: null },
    { id: "shoe-near", bone: "foot-near", z: 5, frame: null },
    { id: "shaft-near", bone: "leg-near", z: 5.3, frame: null, ...ANKLE },
    { id: "hem-near", bone: "leg-near", z: 5.6, frame: null, ...ANKLE },
    // Капюшон спереду — за торсом (лежить на спині), ззаду — поверх торса під головою (`views.back`).
    { id: "hood", bone: "chest", z: 5.8, frame: null },
    { id: "torso", bone: "torso", z: 6, frame: null },
    { id: "skirt", bone: "hips", z: 6.2, frame: null },
    { id: "top-hem", bone: "hips", z: 6.4, frame: null },
    { id: "top-front", bone: "chest", z: 6.6, frame: null },
    { id: "head", bone: "head", z: 8, frame: null },
    // Очі на голові: у системі голови x — угору від підборіддя, y — уперед.
    { id: "eyes", bone: "head", z: 9, frame: "open", x: 13.9, y: 5.3 },
    { id: "hair-front", bone: "head", z: 10, frame: null },
    { id: "arm-near", bone: "arm-near-skin", z: 12, frame: null },
  ],
  views: {
    front: {},
    // ¾ ззаду: видно потилицю (волосся ззаду — поверх голови), обличчя й чубчика не видно; ближні й далекі кінцівки — по
    // інший бік тулуба; те, що персонаж тримає перед собою, — за тулубом.
    back: {
      bones: {
        neck: { y: -0.5 },
        head: { y: 0 },
        "arm-far": { y: -15 },
        "arm-near": { y: 17 },
        "leg-far": { x: -6 },
        "leg-near": { x: 6.5 },
      },
      slots: {
        "hair-back": { z: 9 },
        "hair-front": { visible: false },
        eyes: { visible: false },
        hood: { z: 7 },
      },
      sockets: { arms: { z: 5.5 }, lap: { z: 5.5 }, held: { z: 5.5 } },
    },
  },
  anchors: {
    // Над маківкою — бульбашки.
    head: { bone: "head", x: 41.5, y: 0.5 },
    // Руки — куди летять запаси і звідки йде волосінь.
    hands: { bone: "hand-near", x: 6.4, y: -0.2 },
    // Кисть дальньої руки — нею гладять другого кота («Двох одразу», §9.12).
    "hands-far": { bone: "hand-far", x: 6.4, y: -0.2 },
    // Коліна: над сидінням перед тазом (сидячи — на стегнах). На тазі, а не на нозі: гніздо повертається разом із кісткою від
    // її вихідного кута, тож на нозі, що сидячи лягає горизонтально, кіт лежав би боком; таз не повертається (N4b).
    lap: { bone: "pelvis", x: 14, y: -1 },
  },
  sockets: {
    // Кіт на руках: корінь кота (його лапи) — на рівні пояса перед тулубом; руки (ближня) — поверх кота.
    arms: { bone: "torso", x: 20, y: 9, z: 7, cargo: ["cat"] },
    // Кіт на колінах: над сидінням перед тазом (як якір `lap`), кут — 0.
    lap: { bone: "pelvis", x: 14, y: -1, z: 7, cargo: ["cat"] },
    // Річ у руках (тарілка, судочок, совок, пилосос) — у кулаці ближньої руки, ПОВЕРХ неї (z над `arm-near`): несучи, рука
    // йде навскіс через груди, і кулак лежить по той бік тулуба — під рукою від тарілки лишався клаптик, і сиру порцію не
    // відрізнити від готової чи пригорілої страви. Тарілка (pivot — під її дном) лягає на кулак, як на долоню. Де рука має
    // бути над річчю (телефон біля вуха, ручка пилососа в кулаці), анімація піднімає `arm-near` над гніздом
    // (`OVER_HELD` у `anims/person/chores.ts`). Ззаду річ — за тулубом (`views.back`).
    held: { bone: "hand-near", x: 6.4, y: -0.2, z: 12.5, cargo: ["held"] },
    // Вудочка — у ближній руці.
    rod: { bone: "hand-near", x: 6.4, y: -0.2, z: 11, cargo: ["rod"] },
  },
  skin: {
    "hair-back": "person/hair-back/0",
    "arm-far": "person/arm-far",
    "leg-far": "person/leg",
    "legwear-far": null,
    "shoe-far": "person/shoe",
    "shaft-far": null,
    "hem-far": null,
    "leg-near": "person/leg",
    "legwear-near": null,
    "shoe-near": "person/shoe",
    "shaft-near": null,
    "hem-near": null,
    hood: null,
    // Статура за замовчуванням — звичайна (`BUILDS[1]`).
    torso: "person/torso/1",
    skirt: null,
    "top-hem": null,
    "top-front": null,
    head: "person/head/0",
    eyes: "person/eyes",
    "hair-front": "person/hair-front/0",
    "arm-near": "person/arm",
  },
  proportions: {
    // Статура: торс — свій кадр (`person/torso/<статура>`), руки й ноги тонші чи товщі, накладки одягу — вужчі чи ширші.
    slim: { ...limbs(0.88), ...overlays(OVERLAY_WIDTH.slim) },
    stocky: { ...limbs(1.15), ...overlays(OVERLAY_WIDTH.stocky) },
  },
});

/** Слот скелета персонажа. */
export type PersonSlot = SlotOf<typeof PERSON_RIG>;

/**
 * Дальні частини персонажа — по той бік тулуба від камери: дальні рука, нога з накладками й черевик із халявою. Вигляд
 * затінює їх (`farRecipe` у `recipes.ts`; пропозиція F1b, лист `sheet-chars`).
 */
export const PERSON_FAR_SLOTS: readonly PersonSlot[] = ["arm-far", "leg-far", "legwear-far", "shoe-far", "shaft-far", "hem-far"];

/** Де скелет персонажа бере суглоби з точок кадрів (див. початок файлу). */
export const PERSON_FIT = defineFit(PERSON_RIG, {
  bones: {
    neck: { slot: "torso", point: "neck-base" },
    head: { slot: "torso", point: "neck" },
    "arm-far": { slot: "torso", point: "shoulder-far" },
    "hand-far": { slot: "arm-far", point: "hand" },
    "arm-near": { slot: "torso", point: "shoulder-near" },
    "hand-near": { slot: "arm-near", point: "hand" },
    "leg-far": { slot: "torso", point: "hip-far" },
    "leg-near": { slot: "torso", point: "hip-near" },
    // Стопа (взуття) — у кісточці ноги: точка `foot` еталона F1b `person/leg`.
    "foot-far": { slot: "leg-far", point: "foot" },
    "foot-near": { slot: "leg-near", point: "foot" },
  },
  slots: {
    eyes: { slot: "head", point: "eyes" },
    // Халява й низ штанини — у кісточці ноги, як і стопа.
    "shaft-far": { slot: "leg-far", point: "foot" },
    "hem-far": { slot: "leg-far", point: "foot" },
    "shaft-near": { slot: "leg-near", point: "foot" },
    "hem-near": { slot: "leg-near", point: "foot" },
  },
  anchors: {
    // Маківка — найвища зачіска; без зачіски (лиса) — голова.
    head: [
      { slot: "hair-front", point: "top" },
      { slot: "hair-back", point: "top" },
      { slot: "head", point: "top" },
    ],
    hands: { slot: "arm-near", point: "grip" },
    "hands-far": { slot: "arm-far", point: "grip" },
  },
  sockets: {
    arms: { slot: "torso", point: "arms" },
    // Річ і вудочка — у кулаці ближньої руки: точка `grip` еталона F1b `person/arm`.
    held: { slot: "arm-near", point: "grip" },
    rod: { slot: "arm-near", point: "grip" },
  },
});

let variants: Readonly<Record<PersonSlot, readonly (ArtId | null)[]>> | null = null;

/**
 * Варіанти частин за слотами — усе, що може показати слот за будь-якого вигляду (`personLooks`, реєстри гардеробу), null —
 * слот порожній (галерея, перевірки). Рахується раз.
 */
export function personVariants(): Readonly<Record<PersonSlot, readonly (ArtId | null)[]>> {
  if (variants) return variants;
  const out = Object.fromEntries(PERSON_RIG.slots.map((slot) => [slot.id, [] as (ArtId | null)[]])) as Record<PersonSlot, (ArtId | null)[]>;
  for (const wear of personLooks()) {
    const skin = personSkin(wear);
    for (const slot of PERSON_RIG.slots) if (!out[slot.id].includes(skin[slot.id])) out[slot.id].push(skin[slot.id]);
  }
  variants = out;
  return out;
}

/**
 * Обвіс персонажа за виглядом (§5.1): обличчя з тіла, решту кажуть ділянки гардеробу (`hairSkin`, `topSkin`, `bottomSkin`,
 * `shoeSkin`); кольори — справа компонувальника. Сукня займає слот спідниці низу.
 */
export function personSkin(look: Pick<Look, "face" | "hair" | "build"> & Partial<Look>): SkinOf<typeof PERSON_RIG> {
  const wear = wearOf(look);
  const top = topSkin(wear);
  const bottom = bottomSkin(wear);
  return {
    ...PERSON_RIG.skin,
    head: `person/head/${wear.face}`,
    ...hairSkin(wear),
    ...bottom,
    ...shoeSkin(wear),
    ...top,
    skirt: top.skirt ?? bottom.skirt,
  };
}

/** Пропорції персонажа за статурою (`BUILDS`: 0 — струнка, 1 — звичайна, 2 — кремезна). */
export function personProportions(look: Pick<Look, "build">): ProportionRef[] {
  if (look.build === 0) return ["slim"];
  if (look.build === 2) return ["stocky"];
  return [];
}
