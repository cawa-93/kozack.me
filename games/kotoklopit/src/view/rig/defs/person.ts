// Скелет персонажа (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): кістки, слоти частин арту, якорі, гнізда, вихідні
// пози двох ракурсів і пропорції статури. Персонаж дивиться праворуч; ліворуч — віддзеркалення.
//
// Одиниці арту = px світу. Корінь — точка підлоги між ступнями; персонаж ≈ 140 заввишки до маківки. Кістки — по одній
// на частину арту (рука й нога — один кадр, `person/arm`, `person/leg`), плюс таз, шия і короткі кістки кисті й стопи
// (кисть тримає гнізда рук, стопа — взуття):
//
//   root ─ pelvis ─┬─ torso ─┬─ neck ─ head            (волосся ззаду й спереду, очі — слоти на голові)
//                  │         ├─ arm-far ─ hand-far
//                  │         └─ arm-near ─ hand-near   (гнізда: вудочка, річ у руках)
//                  ├─ leg-far ─ foot-far               (взуття — на стопі)
//                  └─ leg-near ─ foot-near
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
// і `top` (над маківкою, для бульбашок), рука — `hand` (зап'ясток). Волосся ззаду й спереду мають той самий pivot, що й
// голова (малюються на її полотні). Поки арту немає, діють числа нижче — їх підганяють під еталонні частини.

import type { ArtId } from "../../art/types";
import type { Look } from "../../../sim/types";
import { BUILDS, FACES, HAIR_STYLES } from "../../palette";
import { defineFit, type ProportionRef } from "../rigcore";
import { defineRig, type SkinOf, type SlotOf } from "../types";

/** Товщина рук і ніг за статурою. */
const limbs = (k: number) =>
  ({
    "arm-far": { scale: { x: 1, y: k } },
    "arm-near": { scale: { x: 1, y: k } },
    "leg-far": { scale: { x: 1, y: k } },
    "leg-near": { scale: { x: 1, y: k } },
  }) as const;

export const PERSON_RIG = defineRig({
  id: "person",
  bones: [
    { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
    { id: "pelvis", parent: "root", x: 0, y: -64, rot: 0, len: 4 },
    { id: "torso", parent: "pelvis", x: 0, y: 0, rot: -90, len: 44 },
    { id: "neck", parent: "torso", x: 40, y: 0, rot: 0, len: 6 },
    { id: "head", parent: "neck", x: 6, y: 0, rot: 0, len: 30 },
    // Руки: у системі тулуба x — угору, y — уперед; ¾ спереду далеке плече праворуч (+y), ближнє — ліворуч.
    { id: "arm-far", parent: "torso", x: 40, y: 8, rot: 180, len: 42 },
    { id: "hand-far", parent: "arm-far", x: 42, y: 0, rot: 0, len: 8 },
    { id: "arm-near", parent: "torso", x: 40, y: -9, rot: 180, len: 42 },
    { id: "hand-near", parent: "arm-near", x: 42, y: 0, rot: 0, len: 8 },
    // Ноги: далека трохи вище (далі на підлозі), ближня — нижче; стопа дивиться вперед.
    { id: "leg-far", parent: "pelvis", x: 5, y: -1, rot: 90, len: 56 },
    { id: "foot-far", parent: "leg-far", x: 56, y: 0, rot: -90, len: 10 },
    { id: "leg-near", parent: "pelvis", x: -5, y: 1, rot: 90, len: 56 },
    { id: "foot-near", parent: "leg-near", x: 56, y: 0, rot: -90, len: 10 },
  ],
  slots: [
    { id: "hair-back", bone: "head", z: 0, frame: null },
    { id: "arm-far", bone: "arm-far", z: 1, frame: null },
    { id: "leg-far", bone: "leg-far", z: 2, frame: null },
    { id: "shoe-far", bone: "foot-far", z: 3, frame: null },
    { id: "leg-near", bone: "leg-near", z: 4, frame: null },
    { id: "shoe-near", bone: "foot-near", z: 5, frame: null },
    { id: "torso", bone: "torso", z: 6, frame: null },
    { id: "head", bone: "head", z: 8, frame: null },
    // Очі на голові: у системі голови x — угору від підборіддя, y — уперед.
    { id: "eyes", bone: "head", z: 9, frame: "open", x: 15, y: 4 },
    { id: "hair-front", bone: "head", z: 10, frame: null },
    { id: "arm-near", bone: "arm-near", z: 12, frame: null },
  ],
  views: {
    front: {},
    // ¾ ззаду: видно потилицю (волосся ззаду — поверх голови), обличчя й чубчика не видно; ближні й далекі кінцівки — по
    // інший бік тулуба; те, що персонаж тримає перед собою, — за тулубом.
    back: {
      bones: {
        "arm-far": { y: -8 },
        "arm-near": { y: 9 },
        "leg-far": { x: -5 },
        "leg-near": { x: 5 },
      },
      slots: {
        "hair-back": { z: 9 },
        "hair-front": { visible: false },
        eyes: { visible: false },
      },
      sockets: { arms: { z: 5.5 }, lap: { z: 5.5 }, held: { z: 5.5 } },
    },
  },
  anchors: {
    // Над маківкою — бульбашки.
    head: { bone: "head", x: 36, y: 0 },
    // Руки — куди летять запаси і звідки йде волосінь.
    hands: { bone: "hand-near", x: 4, y: 0 },
    // Коліна: на стегні ближньої ноги (сидячи стегно горизонтальне, «верх» — −y у системі ноги).
    lap: { bone: "leg-near", x: 20, y: -6 },
  },
  sockets: {
    // Кіт на руках: корінь кота (його лапи) — на рівні пояса перед тулубом; руки (ближня) — поверх кота.
    arms: { bone: "torso", x: 10, y: 8, z: 7, cargo: ["cat"] },
    // Кіт на колінах.
    lap: { bone: "leg-near", x: 20, y: -6, z: 7, cargo: ["cat"] },
    // Річ у руках (тарілка, судочок, совок, пакунок) — у ближній руці, під кистю.
    held: { bone: "hand-near", x: 6, y: 0, z: 11, cargo: ["held"] },
    // Вудочка — у ближній руці.
    rod: { bone: "hand-near", x: 4, y: 0, z: 11, cargo: ["rod"] },
  },
  skin: {
    "hair-back": "person/hair-back/0",
    "arm-far": "person/arm",
    "leg-far": "person/leg",
    "shoe-far": "person/shoe",
    "leg-near": "person/leg",
    "shoe-near": "person/shoe",
    // Статура за замовчуванням — звичайна (`BUILDS[1]`).
    torso: "person/torso/1",
    head: "person/head/0",
    eyes: "person/eyes",
    "hair-front": "person/hair-front/0",
    "arm-near": "person/arm",
  },
  proportions: {
    // Статура: торс — свій кадр (`person/torso/<статура>`), руки й ноги тонші чи товщі.
    slim: limbs(0.88),
    stocky: limbs(1.15),
  },
});

/** Слот скелета персонажа. */
export type PersonSlot = SlotOf<typeof PERSON_RIG>;

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
  },
  anchors: {
    head: [
      { slot: "hair-front", point: "top" },
      { slot: "head", point: "top" },
    ],
  },
  sockets: {
    arms: { slot: "torso", point: "arms" },
  },
});

/** Варіанти частин за слотами — за виглядом персонажа (`Look`, §5.1) і контрактом id арту (галерея, перевірки). */
export const PERSON_VARIANTS: Readonly<Record<PersonSlot, readonly (ArtId | null)[]>> = {
  "hair-back": HAIR_STYLES.map((_, i): ArtId => `person/hair-back/${i}`),
  "arm-far": ["person/arm"],
  "leg-far": ["person/leg"],
  "shoe-far": ["person/shoe"],
  "leg-near": ["person/leg"],
  "shoe-near": ["person/shoe"],
  torso: BUILDS.map((_, i): ArtId => `person/torso/${i}`),
  head: FACES.map((_, i): ArtId => `person/head/${i}`),
  eyes: ["person/eyes"],
  "hair-front": HAIR_STYLES.map((_, i): ArtId => `person/hair-front/${i}`),
  "arm-near": ["person/arm"],
};

/** Обвіс персонажа за виглядом (§5.1): обличчя, зачіска й статура; кольори — справа компонувальника. */
export function personSkin(look: Pick<Look, "face" | "hair" | "build">): SkinOf<typeof PERSON_RIG> {
  return {
    ...PERSON_RIG.skin,
    head: `person/head/${look.face}`,
    "hair-back": `person/hair-back/${look.hair}`,
    "hair-front": `person/hair-front/${look.hair}`,
    torso: `person/torso/${look.build}`,
  };
}

/** Пропорції персонажа за статурою (`BUILDS`: 0 — струнка, 1 — звичайна, 2 — кремезна). */
export function personProportions(look: Pick<Look, "build">): ProportionRef[] {
  if (look.build === 0) return ["slim"];
  if (look.build === 2) return ["stocky"];
  return [];
}
