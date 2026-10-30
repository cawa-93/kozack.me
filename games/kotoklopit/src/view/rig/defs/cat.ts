// Скелет кота (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): кістки, слоти частин арту, якорі, гнізда, вихідні пози
// двох ракурсів і пропорції. Кіт дивиться праворуч; ліворуч — віддзеркалення.
//
// Одиниці арту = px світу. Корінь — точка підлоги під серединою кота; дорослий кіт стоїть ≈ 56 заввишки до кінчиків вух.
// Кістки — по одній на частину арту (кожна частина — один кадр, `cat/<частина>/<варіант>`), плюс таз і шия для руху:
//
//   root ─ pelvis ─ body ─┬─ neck ─ head        (вуха, морда, очі, рот — слоти на голові)
//                         ├─ tail
//                         ├─ leg-front-far, leg-front-near
//          pelvis ────────┴─ leg-back-far, leg-back-near   (задні лапи на тазі: тулуб нахиляється, а вони лишаються)
//
// Кути кісток: 0 — праворуч (уперед), 90 — донизу. Лапи дивляться донизу, тож додатний поворот лапи — назад.
//
// Положення суглобів беруться з точок кадрів (`CAT_FIT`): pivot кадру — суглоб, яким частина кріпиться до кістки; тулуб
// має точки `neck` (де pivot голови), `shoulder-far`/`-near`, `hip-far`/`-near`, `tail`, голова — `ear-far`/`-near`,
// `muzzle`, `eyes`, `mouth`. Необов'язкові: тулуб — `neck-base` (основа шиї, навколо якої голова киває) і `back` (спинка
// під рукою), голова — `top` (над вухами, для бульбашок), морда — `mouth` (якщо рот залежить від морди). Точки одного
// ракурсу — `<назва>-back` / `<назва>-front` (`rigcore.ts`, `RigFit`). Числа нижче — запасні (запису чи точки немає): вони
// дають ту саму вихідну позу, що й точки еталонів F1b (`art/cat/*`, art/STYLE.md, розділ 13; тест `tests/rig.test.ts`),
// тож скелет без атласу (тести, вигляд до завантаження) стоїть так само. Довжина лапи — від суглоба до точки `paw`.
//
// Дальні частини (`CAT_FAR_SLOTS`) вигляд затінює (`farRecipe`, пропозиція F1b): так ближній бік читається першим.

import type { ArtId } from "../../art/types";
import type { Shape } from "../../../sim/types";
import { defineFit, type ProportionRef } from "../rigcore";
import { defineRig, type SkinOf, type SlotOf } from "../types";

export const CAT_RIG = defineRig({
  id: "cat",
  bones: [
    { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
    // Таз — над задніми лапами; від нього тулуб іде вперед до плечей.
    { id: "pelvis", parent: "root", x: -14, y: -20, rot: 0, len: 6 },
    { id: "body", parent: "pelvis", x: 0, y: 0, rot: 0, len: 26 },
    { id: "tail", parent: "body", x: -8, y: -8, rot: -140, len: 22 },
    // Шия — від основи (`neck-base`) угору-вперед до точки `neck`, де сидить голова; голова — горизонтально.
    { id: "neck", parent: "body", x: 20, y: -7, rot: -27, len: 4.5 },
    { id: "head", parent: "neck", x: 4.5, y: 0, rot: 27, len: 16 },
    // Далекі лапи — трохи вище (далі від камери на підлозі), ближні — нижче; довжина — від суглоба до точки `paw`.
    { id: "leg-front-far", parent: "body", x: 30, y: -2, rot: 90, len: 20.5 },
    { id: "leg-front-near", parent: "body", x: 24.5, y: 1.5, rot: 90, len: 20.5 },
    { id: "leg-back-far", parent: "pelvis", x: 3.5, y: -2, rot: 90, len: 20.5 },
    { id: "leg-back-near", parent: "pelvis", x: -2, y: 1.5, rot: 90, len: 20.5 },
  ],
  // Порядок z — ¾ спереду: хвіст і далекі лапи за тулубом, ближні — перед ним, голова поверх усього.
  slots: [
    { id: "tail", bone: "tail", z: 0, frame: null },
    { id: "leg-back-far", bone: "leg-back-far", z: 1, frame: null },
    { id: "leg-front-far", bone: "leg-front-far", z: 2, frame: null },
    { id: "body", bone: "body", z: 5, frame: null },
    { id: "leg-back-near", bone: "leg-back-near", z: 6, frame: null },
    { id: "leg-front-near", bone: "leg-front-near", z: 7, frame: null },
    { id: "head", bone: "head", z: 10, frame: null },
    // Вуха — за контуром голови (основу вуха ховає голова); той самий кадр в обох слотах.
    { id: "ear-far", bone: "head", z: 8, frame: null, x: 14.5, y: -17 },
    { id: "ear-near", bone: "head", z: 9, frame: null, x: -0.5, y: -15.5 },
    { id: "muzzle", bone: "head", z: 11, frame: null, x: 12.8, y: -2.6 },
    { id: "eyes", bone: "head", z: 12, frame: "open", x: 11, y: -8.4 },
    { id: "mouth", bone: "head", z: 13, frame: "closed", x: 12.8, y: -1.2 },
  ],
  views: {
    front: {},
    // ¾ ззаду: кіт іде від камери. Хвіст і зад — найближче, голова — за плечима, обличчя не видно; ближній бік той самий,
    // але на екрані він праворуч, тож ближні й далекі лапи міняються місцями по x.
    back: {
      bones: {
        tail: { x: -7, y: -9 },
        neck: { x: 23, y: -10 },
        "leg-front-far": { x: 24.5, y: -2 },
        "leg-front-near": { x: 30, y: 1.5 },
        "leg-back-far": { x: -2, y: -2 },
        "leg-back-near": { x: 3.5, y: 1.5 },
      },
      slots: {
        tail: { z: 8 },
        // Голова менша й повернута від камери: вуха — інакше, ніж спереду (точки `ear-*-back` еталона).
        "ear-far": { z: 2.5, x: -0.5, y: -16 },
        "ear-near": { z: 2.7, x: 14, y: -16.5 },
        head: { z: 3 },
        muzzle: { visible: false },
        eyes: { visible: false },
        mouth: { visible: false },
      },
      sockets: { teeth: { z: 3.5 } },
    },
  },
  anchors: {
    // Над вухами — бульбашки й серця настрою.
    head: { bone: "head", x: 7, y: -33 },
    mouth: { bone: "head", x: 12.8, y: -1.2 },
  },
  sockets: {
    // Річ у зубах (іграшка, шкарпетка): вміст стоїть pivot-ом у роті й повертається з головою.
    teeth: { bone: "head", x: 12.8, y: -1.2, z: 14, cargo: ["toy", "sock"] },
    // Спинка під рукою, що гладить: рука персонажа малюється поверх кота.
    pet: { bone: "body", x: 12, y: -12, z: 15, cargo: ["hand"] },
  },
  skin: {
    tail: "cat/tail/long",
    "leg-back-far": "cat/leg-back/normal",
    "leg-front-far": "cat/leg-front/normal",
    body: "cat/body/normal",
    "leg-back-near": "cat/leg-back/normal",
    "leg-front-near": "cat/leg-front/normal",
    head: "cat/head/base",
    "ear-far": "cat/ear/normal",
    "ear-near": "cat/ear/normal",
    muzzle: "cat/muzzle/normal",
    eyes: "cat/eyes",
    mouth: "cat/mouth",
  },
  proportions: {
    // Кошеня: усе менше, голова відносно більша, лапи й хвіст коротші (тіло опускається на різницю довжини лап).
    kitten: {
      root: { scale: { x: 0.62, y: 0.62 } },
      pelvis: { y: 4 },
      body: { scale: { x: 0.88, y: 0.95 } },
      head: { scale: { x: 1.3, y: 1.3 } },
      tail: { scale: { x: 0.75, y: 1 } },
      "leg-front-far": { scale: { x: 0.8, y: 1.05 } },
      "leg-front-near": { scale: { x: 0.8, y: 1.05 } },
      "leg-back-far": { scale: { x: 0.8, y: 1.05 } },
      "leg-back-near": { scale: { x: 0.8, y: 1.05 } },
    },
    // Короткі лапи (манчкін): самі лапи коротші в арті (`cat/leg-*/short`), а тіло опускається на різницю.
    "short-legs": {
      pelvis: { y: 7 },
    },
    // Статура: тулуб — свій кадр (`cat/body/<статура>`), а лапи тонші чи товщі.
    slim: {
      "leg-front-far": { scale: { x: 1, y: 0.88 } },
      "leg-front-near": { scale: { x: 1, y: 0.88 } },
      "leg-back-far": { scale: { x: 1, y: 0.88 } },
      "leg-back-near": { scale: { x: 1, y: 0.88 } },
    },
    stocky: {
      "leg-front-far": { scale: { x: 1, y: 1.15 } },
      "leg-front-near": { scale: { x: 1, y: 1.15 } },
      "leg-back-far": { scale: { x: 1, y: 1.15 } },
      "leg-back-near": { scale: { x: 1, y: 1.15 } },
    },
  },
});

/** Слот скелета кота. */
export type CatSlot = SlotOf<typeof CAT_RIG>;

/**
 * Дальні частини кота — по той бік тулуба від камери: дальні лапи й вухо. Вигляд затінює їх (`farRecipe` у `recipes.ts`;
 * пропозиція F1b, лист `sheet-chars`), щоб ближній бік читався першим, а лапи не зливалися в одну пляму.
 */
export const CAT_FAR_SLOTS: readonly CatSlot[] = ["leg-back-far", "leg-front-far", "ear-far"];

/** Де скелет кота бере суглоби з точок кадрів (див. початок файлу). */
export const CAT_FIT = defineFit(CAT_RIG, {
  bones: {
    tail: { slot: "body", point: "tail" },
    neck: { slot: "body", point: "neck-base" },
    head: { slot: "body", point: "neck" },
    "leg-front-far": { slot: "body", point: "shoulder-far" },
    "leg-front-near": { slot: "body", point: "shoulder-near" },
    "leg-back-far": { slot: "body", point: "hip-far" },
    "leg-back-near": { slot: "body", point: "hip-near" },
  },
  slots: {
    "ear-far": { slot: "head", point: "ear-far" },
    "ear-near": { slot: "head", point: "ear-near" },
    muzzle: { slot: "head", point: "muzzle" },
    eyes: { slot: "head", point: "eyes" },
    mouth: [
      { slot: "muzzle", point: "mouth" },
      { slot: "head", point: "mouth" },
    ],
  },
  anchors: {
    head: { slot: "head", point: "top" },
    mouth: [
      { slot: "muzzle", point: "mouth" },
      { slot: "head", point: "mouth" },
    ],
  },
  sockets: {
    teeth: [
      { slot: "muzzle", point: "mouth" },
      { slot: "head", point: "mouth" },
    ],
    pet: { slot: "body", point: "back" },
  },
});

/** Варіанти частин за слотами — за формами кота (`Shape`, §9.10) і контрактом id арту (галерея, перевірки). */
export const CAT_VARIANTS: Readonly<Record<CatSlot, readonly (ArtId | null)[]>> = {
  tail: ["cat/tail/long", "cat/tail/short", "cat/tail/fluffy", "cat/tail/bobtail", null],
  "leg-back-far": ["cat/leg-back/normal", "cat/leg-back/short"],
  "leg-front-far": ["cat/leg-front/normal", "cat/leg-front/short"],
  body: ["cat/body/slim", "cat/body/normal", "cat/body/stocky"],
  "leg-back-near": ["cat/leg-back/normal", "cat/leg-back/short"],
  "leg-front-near": ["cat/leg-front/normal", "cat/leg-front/short"],
  head: ["cat/head/base"],
  "ear-far": ["cat/ear/normal", "cat/ear/large", "cat/ear/folded", "cat/ear/curled", "cat/ear/tufted"],
  "ear-near": ["cat/ear/normal", "cat/ear/large", "cat/ear/folded", "cat/ear/curled", "cat/ear/tufted"],
  muzzle: ["cat/muzzle/normal", "cat/muzzle/flat", "cat/muzzle/long"],
  eyes: ["cat/eyes"],
  mouth: ["cat/mouth"],
};

/** Обвіс кота за формами частин тіла (§9.10): безхвостий — без слота хвоста. Шерсть (`coat`) — справа компонувальника. */
export function catSkin(shape: Pick<Shape, "muzzle" | "ears" | "tail" | "build" | "legs">): SkinOf<typeof CAT_RIG> {
  const ear: ArtId = `cat/ear/${shape.ears}`;
  return {
    ...CAT_RIG.skin,
    tail: shape.tail === "none" ? null : `cat/tail/${shape.tail}`,
    body: `cat/body/${shape.build}`,
    "leg-back-far": `cat/leg-back/${shape.legs}`,
    "leg-back-near": `cat/leg-back/${shape.legs}`,
    "leg-front-far": `cat/leg-front/${shape.legs}`,
    "leg-front-near": `cat/leg-front/${shape.legs}`,
    "ear-far": ear,
    "ear-near": ear,
    muzzle: `cat/muzzle/${shape.muzzle}`,
  };
}

/**
 * Пропорції кота: короткі лапи, статура і, для кошеняти, `kitten` з вагою 0…1 (1 — щойно народжене, 0 — дорослий; як
 * швидко кошеня росте — справа вигляду котів).
 */
export function catProportions(shape: Pick<Shape, "build" | "legs">, kitten = 0): ProportionRef[] {
  const list: ProportionRef[] = [];
  if (shape.legs === "short") list.push("short-legs");
  if (shape.build !== "normal") list.push(shape.build);
  if (kitten > 0) list.push({ name: "kitten", weight: Math.min(1, kitten) });
  return list;
}
