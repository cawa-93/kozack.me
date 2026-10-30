// Де кіт ізометричного вигляду (крок 16, T1): на підлозі, на меблях (на висоті їхнього верху), під меблями (з-під краю
// визирають очі), у будиночку, у барабані пральки, на роботі-пилососі, у переносці, під ковдрою, на руках чи колінах
// персонажа, у поїздці. Чисті розрахунки без Phaser (`tests/isocats.test.ts`): яка точка підлоги, на якій висоті, на якій
// коробці реєстру глибини чи над якою точкою, з яким зсувом на екрані й що з кота видно.
//
// Те саме, що показує старий кіт на ізометричній підлозі (`legacy/cat.ts`, перехідний вигляд F3b), і те, що каже маніфест
// про точки речей: `drum` пральки, `blanket` ліжка, `inside` переноски, `door` будиночка, `top` робота.

import { CARRIER_SPOT, HIGH_PLACES, itemPoint, objectAt, objectById } from "../../sim/home";
import type { Cat, GameState, HomeItem, Vec } from "../../sim/types";
import type { CatAnimId } from "../anim/ids";
import type { PairPlacement } from "../anim/pairs";
import type { ArtId } from "../art/types";
import { isoCatPerch } from "../world/objects";
import { ISO_DEPTH_SLOT } from "./depth";
import { artOffset, footprintCenter } from "./geometry";

/**
 * Де кіт:
 * - `away` — не вдома (поїздка, сходи): не видно;
 * - `hands` — на руках чи колінах персонажа (`PersonPart.hands`);
 * - `floor` — на підлозі; `furniture` — на меблях, на висоті верху (`isoCatPerch`);
 * - `under` — ховається під меблями: з-під ближчого краю видно очі й кінчик хвоста;
 * - `house` — спить чи ховається в будиночку: у темному вході видно очі;
 * - `blanket` — під ковдрою на ліжку (горбик малює квартира, `bedState`): видно вушка й кінчик хвоста;
 * - `carrier` — спить у переносці: клубочок під ґратками (`CARRIER_GRATE_DEPTH`);
 * - `drum` — спить у барабані пральної машини;
 * - `robot` — їде на роботі-пилососі («Безстрашний»).
 */
export type CatSpotKind = "away" | "hands" | "floor" | "furniture" | "under" | "house" | "blanket" | "carrier" | "drum" | "robot";

/** Що з кота видно: увесь скелет, лише очі (і кінчик хвоста), лише вушка й кінчик хвоста. */
export type CatShow = "rig" | "eyes" | "ears" | "none";

export interface CatSpot {
  kind: CatSpotKind;
  /** Точка підлоги під котом, клітинки: від неї — місце на екрані й порядок малювання. */
  at: Vec;
  /** Висота лап над підлогою, одиниці арту (меблі). */
  lift: number;
  /** Зсув малюнка на екрані від точки `at` (точка на кадрі речі: барабан, переноска, вхід будиночка), одиниці арту. */
  offset: Vec;
  /** Коробка реєстру глибини, на якій кіт (меблі, барабан, ліжко) чи під краєм якої (`under`); null — підлога. */
  box: string | null;
  /** Точка реєстру, над якою кіт, і зсув у її проміжку (переноска, робот, будиночок); null — сам по собі. */
  above: { id: string; offset: number } | null;
  /** Масштаб кота тут: у барабані й переносці клубочок менший, щоб помістився. */
  scale: number;
  /** Тінь під котом. */
  shadow: boolean;
  /** Що видно. */
  show: CatShow;
  /** Річ, у якій кіт (будиночок): її id у реєстрі. */
  item: string | null;
}

/** Клубочок у барабані пральки й у переносці — менший, щоб поміститися в отвір. */
export const SPOT_SCALE = { drum: 0.62, carrier: 0.78 } as const;

/** Над точкою речі, у її проміжку глибини: кіт у будиночку й на роботі — над ними, нижче за ґратки чи накладки вище. */
const ABOVE_ITEM = ISO_DEPTH_SLOT * 0.4;

/** Ґратки переноски (`floor.ts`, `CARRIER_GRATE_DEPTH` 0,004): кіт — під ними, над самою переноскою. */
const UNDER_GRATE = ISO_DEPTH_SLOT * 0.2;

const ZERO: Vec = { x: 0, y: 0 };

function spot(kind: CatSpotKind, at: Vec, extra: Partial<CatSpot> = {}): CatSpot {
  return { kind, at, lift: 0, offset: ZERO, box: null, above: null, scale: 1, shadow: false, show: "rig", item: null, ...extra };
}

/** Точка кадру речі (`name` запису `id`) — зсув від pivot; немає — нуль. */
const pointOf = (id: ArtId, name: string): Vec => artOffset(id, name) ?? ZERO;

/** Будиночок, у якому кіт спить чи ховається (дійшов до нього). */
function houseOf(state: GameState, cat: Cat): HomeItem | null {
  const act = cat.act;
  if (act.goal !== null || (act.kind !== "sleep" && act.kind !== "hide") || !act.target?.startsWith("item:")) return null;
  const id = Number(act.target.slice(5));
  const item = state.home.items.find((i) => i.id === id);
  return item?.kind === "house" ? item : null;
}

/**
 * Де кіт (див. `CatSpotKind`): `anim` — що він грає (`catAnim`), `pair` — місце в парі (`catPairs`), `held` — на руках чи
 * колінах.
 */
export function catSpot(state: GameState, cat: Cat, anim: CatAnimId, pair: PairPlacement | null): CatSpot {
  if (cat.away !== null) return spot("away", { x: cat.x, y: cat.y }, { show: "none" });
  const held = state.character.held;
  if ((held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap") return spot("hands", { x: cat.x, y: cat.y });
  const act = cat.act;
  // У переносці (§9.12): клубочок крізь ґратки.
  if (act.kind === "sleep" && act.target === "carrier" && act.goal === null && state.home.carrier) {
    return spot("carrier", CARRIER_SPOT, {
      offset: pointOf(`item/carrier/${state.home.carrier}`, "inside"),
      above: { id: "carrier", offset: UNDER_GRATE },
      scale: SPOT_SCALE.carrier,
    });
  }
  // У барабані пральки (§9.12): дверцята відчинені, кіт спить усередині.
  if (act.kind === "sleep" && act.target === "washer" && act.goal === null) {
    const washer = objectById("washer");
    return spot("drum", footprintCenter(washer), { offset: pointOf("env/washer", "drum"), box: washer.id, scale: SPOT_SCALE.drum });
  }
  // Під ковдрою (§9.12, «Теплолюбність»): горбик — ліжко, з-під нього — вушка й кінчик хвоста.
  if (anim === "blanket") {
    const bed = objectById("bed");
    return spot("blanket", footprintCenter(bed), { offset: pointOf("env/bed", "blanket"), box: bed.id, show: "ears" });
  }
  // У будиночку (§9.12): у темному вході — очі.
  const house = houseOf(state, cat);
  if (house) {
    return spot("house", itemPoint(house), { offset: pointOf(`item/house/${house.quality}`, "door"), above: { id: `item:${house.id}`, offset: ABOVE_ITEM }, show: "eyes", item: `item:${house.id}` });
  }
  // «Безстрашний» їде на роботі-пилососі (§8.7, §9.12): застрибнув — і сидить на ньому.
  const robot = state.home.appliances.robot;
  if (act.target === "robot" && act.elapsed > 0 && act.goal === null && robot) {
    return spot("robot", { x: cat.x, y: cat.y }, { offset: pointOf(`item/robot/${robot}`, "top"), above: { id: "robot", offset: ABOVE_ITEM } });
  }
  // У парі (`catPairs`) — зсунутий уздовж горизонталі екрана: той самий зсув у клітинках дає і місце, і глибину.
  const tile = pair ? { x: cat.x + pair.tile.x, y: cat.y + pair.tile.y } : { x: cat.x, y: cat.y };
  const object = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  if (object && object.kind !== "door") {
    // Ховається під меблями — визирає з-під ближчого краю; нагорі (холодильник, шафа) — лежить там (`catPose` — буханець).
    const hiding = anim === "hide" && !HIGH_PLACES.includes(object.id);
    const perch = isoCatPerch(object.id, pair ? tile : cat, hiding);
    if (hiding) return spot("under", perch.at, { box: object.id, show: "eyes" });
    return spot("furniture", perch.at, { lift: perch.lift, box: object.id, shadow: true });
  }
  if (anim === "hide") return spot("under", tile, { show: "eyes" });
  return spot("floor", tile, { shadow: true });
}

/** Чи кіт на чомусь над підлогою: на меблях, на роботі (для плавного стрибка — висота змінюється не миттю). */
export const raised = (kind: CatSpotKind): boolean => kind === "furniture" || kind === "robot";
