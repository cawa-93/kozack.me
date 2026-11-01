// Скелет кота ізометричного вигляду (крок 16, T1): спільний `CAT_RIG` (`rig/defs/cat.ts`) з трьома додатками, які потрібні
// котові в грі, а спільному скелету — ні (його правлять пакети скелетів і арту, а анімації N1–N3 пишуться під нього):
//
// - кістки вух `ear-far` і `ear-near` (діти голови, там, де були слоти вух): вирази притискають, опускають і розводять вуха
//   поворотом кістки (`CatEars`, `catface.ts`; маніфест A7: «вуха притискає й опускає поворот кістки вуха»);
// - кістка `girth` (дитина тулуба в тій самій точці) — на ній кадр тулуба й живота: повний кіт ширшає тулубом
//   (`girthOf`, §9.12), а голова, лапи й хвіст, що висять на `body`, лишаються тими самими;
// - слот `belly` над тулубом (z тулуба + `BELLY_ABOVE`, під ближніми лапами) — живіт вагітної (`cat/belly/<статура>`, §9.8,
//   `showsPregnancy`): те саме полотно й pivot, що в тулуба, тож він стоїть точно на ньому; верхній край живота без
//   контуру захований у тулубі, а контур тулуба під ним не розтинає живіт (маніфест A8b). Анімації `CAT_ANIMS` про нього не
//   знають: що вони роблять із тулубом (ховають під ковдрою, міняють z), складена анімація робить і з животом
//   (`withBelly`, `catanim.ts`).
//
// Числа й точки арту — з `CAT_RIG` і `CAT_FIT` (переносяться програмно): пакети, що їх уточнюють, уточнюють і цей скелет.
// Анімації `CAT_ANIMS` (під `CAT_RIG`) підходять і сюди — нових кісток і слота вони не знають. Розмір кота (кошеня, порода,
// вага) — теж тут. Без Phaser.

import { isKitten, traitLevel } from "../../sim/cat";
import { WEIGHT } from "../../sim/config";
import { girthOf } from "../../sim/weight";
import type { Cat, Shape } from "../../sim/types";
import type { CatEars } from "../anim/catface";
import { ART_VIEWS, type ArtId, type ArtView } from "../art/types";
import { artEntry } from "../art/manifest";
import { CAT_ANIMS } from "../rig/anims";
import { catBrawlTop } from "../rig/anims/cat/behavior";
import { CAT_FIT, CAT_RIG, catProportions, catSkin, type CatSlot } from "../rig/defs/cat";
import { Rig, type Affine, type ProportionRef, type RigFit } from "../rig/rigcore";
import type { BoneDef, BoneOf, RigDef, RigSkin, RigViewSetup, SlotDef, SocketOf, Vec2 } from "../rig/types";

type CatBone = BoneOf<typeof CAT_RIG>;
/** Кістки кота в грі: скелета `CAT_RIG` плюс вуха й обхват тулуба. */
export type IsoCatBone = CatBone | "girth" | EarBone;
/** Слоти кота в грі: `CAT_RIG` плюс живіт вагітної. */
export type IsoCatSlot = CatSlot | "belly";
export type IsoCatSocket = SocketOf<typeof CAT_RIG>;
export type IsoCatRigDef = RigDef<IsoCatBone, IsoCatSlot, IsoCatSocket>;

/** Кістки вух — ті самі id, що в їхніх слотів. */
export type EarBone = "ear-far" | "ear-near";
export const EAR_BONES: readonly EarBone[] = ["ear-far", "ear-near"];

const isEar = (id: string): id is EarBone => (EAR_BONES as readonly string[]).includes(id);

/**
 * Найбільший обхват (`girthOf` — від 1 до 1 + `WEIGHT.girthStep`) — пропорції `fat` з вагою 1: тулуб глибшає (живіт
 * звисає) помітніше, ніж довшає, — як у старому вигляді (ширина × обхват, висота × 0,4 від приросту).
 */
const FAT = { depth: 0.8, length: 0.35 } as const;

/**
 * На скільки живіт вагітної вище за тулуб у порядку слотів: над тулубом і під ближніми лапами (7, 8), як задумав A8b
 * («z + 0,5»), але трохи нижче за 0,5 — хвіст клубка й буханця обгортає кота спереду на z 5,5 (`CURL_SLOTS`, `LOAF_SLOTS`
 * N1), і за рівних z живіт (слот далі в списку) лягав би поверх хвоста.
 */
export const BELLY_ABOVE = 0.45;

/** Скелет `CAT_RIG` з кістками вух, обхватом і животом (див. початок файлу). */
function derive(rig: typeof CAT_RIG): IsoCatRigDef {
  const slotOf = (id: CatSlot): SlotDef<CatBone, CatSlot> => {
    const slot = rig.slots.find((s) => s.id === id);
    if (!slot) throw new Error(`У скелеті кота немає слота «${id}»`);
    return slot;
  };
  const bones: BoneDef<IsoCatBone>[] = [];
  for (const bone of rig.bones) {
    bones.push(bone);
    // Обхват — одразу за тулубом: на його кадр (`body`) посилаються точки кісток, що йдуть далі (лапи, шия, хвіст).
    if (bone.id === "body") bones.push({ id: "girth", parent: "body", x: 0, y: 0, rot: 0, len: 0 });
    if (bone.id === "head") {
      for (const ear of EAR_BONES) {
        const slot = slotOf(ear);
        bones.push({ id: ear, parent: slot.bone, x: slot.x ?? 0, y: slot.y ?? 0, rot: 0, len: 0 });
      }
    }
  }
  const slots: SlotDef<IsoCatBone, IsoCatSlot>[] = rig.slots.flatMap((slot): SlotDef<IsoCatBone, IsoCatSlot>[] => {
    if (slot.id === "body") return [{ id: "belly", bone: "girth", z: slot.z + BELLY_ABOVE, frame: null }, { ...slot, bone: "girth" }];
    if (isEar(slot.id)) return [{ id: slot.id, bone: slot.id, z: slot.z, frame: slot.frame }];
    return [slot];
  });
  const views = {} as Record<ArtView, RigViewSetup<IsoCatBone, IsoCatSlot, IsoCatSocket>>;
  for (const view of ART_VIEWS) {
    const setup = rig.views[view] as RigViewSetup<CatBone, CatSlot, IsoCatSocket>;
    const boneOver: Partial<Record<IsoCatBone, { x?: number; y?: number }>> = { ...setup.bones };
    const slotOver: Partial<Record<IsoCatSlot, object>> = { ...setup.slots };
    // Зсув слота вуха в ракурсі стає зсувом його кістки.
    for (const ear of EAR_BONES) {
      const over = setup.slots?.[ear];
      if (!over) continue;
      const { x, y, ...rest } = over;
      if (x !== undefined || y !== undefined) boneOver[ear] = { ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) };
      slotOver[ear] = rest;
    }
    views[view] = { ...setup, bones: boneOver, slots: slotOver };
  }
  return {
    id: "cat",
    bones,
    slots,
    views,
    anchors: rig.anchors,
    sockets: rig.sockets,
    skin: { ...rig.skin, belly: null },
    proportions: {
      ...rig.proportions,
      fat: { girth: { scale: { x: 1 + WEIGHT.girthStep * FAT.length, y: 1 + WEIGHT.girthStep * FAT.depth } } },
    },
  };
}

/** Скелет кота в грі. */
export const ISO_CAT_RIG: IsoCatRigDef = derive(CAT_RIG);

/** Точки арту для `ISO_CAT_RIG`: як `CAT_FIT`, лише точки вух ставлять кістки вух, а не слоти. */
export const ISO_CAT_FIT: RigFit<IsoCatBone, IsoCatSlot, IsoCatSocket> = {
  ...CAT_FIT,
  bones: {
    ...CAT_FIT.bones,
    ...Object.fromEntries(EAR_BONES.flatMap((ear) => (CAT_FIT.slots?.[ear] ? [[ear, CAT_FIT.slots[ear]]] : []))),
  },
  slots: Object.fromEntries(Object.entries(CAT_FIT.slots ?? {}).filter(([id]) => !isEar(id))),
};

// --- Обвіс і пропорції ------------------------------------------------------------------------

/** Обвіс кота в грі: форми частин (`catSkin`) і живіт вагітної, коли його видно (§9.8). */
export function isoCatSkin(shape: Pick<Shape, "muzzle" | "ears" | "tail" | "build" | "legs">, pregnant: boolean): RigSkin<IsoCatSlot> {
  const belly: ArtId | null = pregnant ? `cat/belly/${shape.build}` : null;
  return { ...catSkin(shape), belly };
}

/**
 * Розмір кошеняти (§9.4, [Ухвалено] 2026-10-21): новонароджене — 0,4 дорослого, тижневе — 0,55, двотижневе — 0,65; з 3
 * тижнів — як дорослий.
 */
export const KITTEN_SIZE: readonly number[] = [0.4, 0.55, 0.65];
/**
 * Наскільки кошеня ще кошенячих пропорцій (пропорції `kitten` скелета — голова більша, лапи й хвіст коротші): 1 —
 * новонароджене; підростаючи, воно витягується.
 */
export const KITTEN_LOOK: readonly number[] = [1, 0.8, 0.6];
/** Розмір породи (§9.11): ±6% за одиницю риси «Розмір», як у старому вигляді. */
const BREED_SIZE_STEP = 0.06;

/** Масштаб кореня скелета в пропорціях `kitten` (з вагою 1): частина розміру кошеняти, яку дає вже сам скелет. */
const KITTEN_ROOT = CAT_RIG.proportions?.kitten?.root?.scale?.x ?? 1;

/** Розмір кота на екрані: вага пропорцій кошеняти й масштаб скелета (кошеня, порода). */
export interface CatSize {
  /** Вага пропорцій `kitten` 0…1. */
  kitten: number;
  /**
   * Масштаб усього скелета поверх пропорцій: кошеня разом із коренем пропорцій `kitten` — рівно `KITTEN_SIZE`, порода — свій
   * розмір.
   */
  scale: number;
  /** Розмір відносно дорослого кота (для пар: `catPairs`). */
  relative: number;
}

export function catSize(cat: Pick<Cat, "ageWeeks" | "traits" | "breed">): CatSize {
  const kitten = isKitten(cat as Cat);
  const week = Math.min(KITTEN_SIZE.length - 1, Math.max(0, Math.floor(cat.ageWeeks)));
  const look = kitten ? (KITTEN_LOOK[week] ?? 0) : 0;
  const size = kitten ? (KITTEN_SIZE[week] ?? 1) : 1;
  const root = 1 + (KITTEN_ROOT - 1) * look;
  const breed = 1 + BREED_SIZE_STEP * traitLevel(cat, "size");
  return { kitten: look, scale: (size / root) * breed, relative: size * breed };
}

/** Півширина дорослого кота звичайної статури на екрані, одиниці арту (≈ 70 завдовжки від носа до кінчика хвоста). */
export const CAT_HALF_WIDTH = 38;

/**
 * Півширина малюнка кота для реєстру глибини (`IsoPointOptions.half`): з запасом на те, яким кіт може стати, поки живе його
 * вигляд, — кошеня виросте дорослим, а кіт погладшає до найбільшого обхвату (тулуб довшає на `FAT.length` приросту). Порода
 * (риса «Розмір») стала. Ширша за правду точка дає лише зайві порівняння; вужча — пари, що перекриваються, ставала б як
 * завгодно (`isoorder.ts`).
 */
export function isoCatHalf(cat: Pick<Cat, "traits" | "breed">): number {
  const breed = 1 + BREED_SIZE_STEP * traitLevel(cat, "size");
  return CAT_HALF_WIDTH * breed * (1 + WEIGHT.girthStep * FAT.length);
}

/** Вага пропорцій `fat` 0…1 за обхватом кота (`girthOf`). */
export function fatWeight(girth: number): number {
  return Math.min(1, Math.max(0, (girth - 1) / WEIGHT.girthStep));
}

/** Пропорції кота в грі: короткі лапи, статура, кошеня (`catProportions`) і повнота. */
export function isoCatProportions(cat: Cat, size: CatSize = catSize(cat)): ProportionRef[] {
  return proportionsOf(cat.shape, size.kitten, fatStep(girthOf(cat)));
}

/** Вага пропорцій `fat` кроками по 0,05 (щоб від дрібної зміни ваги скелет не перераховувався): ціле 0…20. */
export function fatStep(girth: number): number {
  return Math.round(fatWeight(girth) * 20);
}

/** Пропорції з того, від чого вони залежать: форми породи, вага пропорцій кошеняти, крок повноти (`fatStep`). */
export function proportionsOf(shape: Pick<Shape, "build" | "legs">, kitten: number, fat: number): ProportionRef[] {
  const list = catProportions(shape, kitten);
  if (fat > 0) list.push({ name: "fat", weight: fat / 20 });
  return list;
}

// --- Вуха ---------------------------------------------------------------------------------------

/** Поворот кістки вуха (градуси; «−» — назад, до хвоста) і висота вуха (1 — як намальоване). */
export interface EarPose {
  rot: number;
  scale: number;
}

const ear = (rot: number, scale = 1): EarPose => ({ rot, scale });

/**
 * Вуха за станом (`CatEars`): `up` — як намальовані; `flat` — притиснуті назад і донизу (терпить, пручається, страх); `side`
 * — опущені в боки (сум); `back` — «літачком», розведені вбік і назад, притиснуті (дуга, шипіння, попереджає). На екрані
 * в ракурсі `front` ближнє вухо ліворуч (ззаду голови), дальнє — праворуч; у `back` — навпаки, тож «у боки» — різні знаки.
 */
export const EAR_POSES: Readonly<Record<CatEars, Readonly<Record<ArtView, Readonly<Record<EarBone, EarPose>>>>>> = {
  up: { front: { "ear-far": ear(0), "ear-near": ear(0) }, back: { "ear-far": ear(0), "ear-near": ear(0) } },
  flat: { front: { "ear-far": ear(-32, 0.8), "ear-near": ear(-38, 0.8) }, back: { "ear-far": ear(-38, 0.8), "ear-near": ear(-32, 0.8) } },
  side: { front: { "ear-far": ear(30, 0.95), "ear-near": ear(-30, 0.95) }, back: { "ear-far": ear(-30, 0.95), "ear-near": ear(30, 0.95) } },
  back: { front: { "ear-far": ear(42, 0.75), "ear-near": ear(-58, 0.75) }, back: { "ear-far": ear(-58, 0.75), "ear-near": ear(42, 0.75) } },
};

// --- Точки на кістках -------------------------------------------------------------------------

/**
 * Точка `local` у системі кістки `bone` (поза з останнього `evaluate`) — у системі кореня скелета (обличчям праворуч), у
 * `out`: рука на животі того, хто лежить на спині (`catPetPoint`, кістка `body`).
 */
export function bonePoint(rig: { bone(id: IsoCatBone): { readonly world: Readonly<Affine> } }, bone: IsoCatBone, local: Vec2, out: Vec2): Vec2 {
  const w = rig.bone(bone).world;
  const x = w.a * local.x + w.c * local.y + w.tx;
  out.y = w.b * local.x + w.d * local.y + w.ty;
  out.x = x;
  return out;
}

/** Під ковдрою: де посередині між основами вух (pivot кадрів вух), у системі кореня без масштабу спрайта — за формами. */
const BLANKET_EARS = new Map<string, Vec2>();

/**
 * Кіт під ковдрою (анімація `blanket`, N1, на початку циклу): середина між основами вух у системі кореня скелета (обличчям
 * праворуч, без масштабу спрайта), для статури, лап і ваги пропорцій кошеняти — вигляд ставить кота так, щоб вушка росли
 * з горбика ковдри (`catspot.ts`, `blanketOffset`). Рахується раз на набір форм.
 */
export function blanketEars(shape: Pick<Shape, "build" | "legs">, kitten: number): Vec2 {
  const key = `${shape.build}|${shape.legs}|${kitten}`;
  let ears = BLANKET_EARS.get(key);
  if (!ears) {
    const rig = new Rig(ISO_CAT_RIG, {
      fit: ISO_CAT_FIT,
      lookup: artEntry,
      skin: isoCatSkin({ muzzle: "normal", ears: "normal", tail: "long", ...shape }, false),
      proportions: proportionsOf(shape, kitten, 0),
    });
    rig.play(CAT_ANIMS.blanket as never, 0, { blend: 0 });
    rig.evaluate(0);
    const a = rig.slot("ear-near");
    const b = rig.slot("ear-far");
    ears = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    BLANKET_EARS.set(key, ears);
  }
  return ears;
}

/** Над клубком бійки (N2, `catBrawlTop`), у системі кореня дорослого кота. */
const BRAWL_TOP: Vec2 = catBrawlTop();

/**
 * Точка бабла «бійка» над клубком (N2, `catBrawlTop`) у системі кореня скелета, у `out`: під масштабом кореня кошеняти (вага
 * пропорцій `kitten`), але без підскоку кулі (доріжки кореня анімації) — бабл не стрибає разом із клубком.
 */
export function brawlTop(kitten: number, out: Vec2): Vec2 {
  const k = 1 + (KITTEN_ROOT - 1) * Math.min(1, Math.max(0, kitten));
  out.x = BRAWL_TOP.x * k;
  out.y = BRAWL_TOP.y * k;
  return out;
}

/** Що з дальніх частин затінює вигляд (`CAT_FAR_SLOTS`): дальні лапи й вухо — ті самі слоти в цьому скелеті. */
export { CAT_FAR_SLOTS } from "../rig/defs/cat";
