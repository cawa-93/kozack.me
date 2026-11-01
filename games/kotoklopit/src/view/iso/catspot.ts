// Де кіт ізометричного вигляду (крок 16, T1): на підлозі, на меблях (на висоті їхнього верху), під меблями (з-під краю
// визирають очі), у будиночку, у барабані пральки, на роботі-пилососі, у переносці, під ковдрою, у ящиках, на руках чи
// колінах персонажа, у поїздці, за мискою. Чисті розрахунки без Phaser (`tests/isocats.test.ts`): яка точка підлоги, на
// якій висоті, на якій коробці реєстру глибини чи над якою точкою, з яким зсувом на екрані й що з кота видно.
//
// Те саме, що показує старий кіт на ізометричній підлозі (`legacy/cat.ts`, перехідний вигляд F3b), і те, що каже маніфест
// про точки речей: `drum` пральки, `blanket` ліжка, `inside` переноски, `door` будиночка, `top` робота, `top` ящиків.

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
 * - `floor` — на підлозі (і за мискою, з якої їсть); `furniture` — на меблях, на висоті верху (`isoCatPerch`), у ящиках —
 *   у верхній коробці, нижче за борт;
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

/** Що частина котів знає про глибини інших частин світу. */
export interface CatSpotDepths {
  /** Ґратки переноски над нею (`CARRIER_GRATE_DEPTH`, `floor.ts`): кіт у переносці — увесь під ними. */
  grate: number;
}

/** Клубочок у барабані пральки й у переносці — менший, щоб поміститися в отвір. */
export const SPOT_SCALE = { drum: 0.62, carrier: 0.78 } as const;

/**
 * Шматки кота в проміжку глибини його точки (`ISO_DEPTH_SLOT` 0,01): тінь, скелет, очі й вушка, що визирають, — нижче за
 * половину проміжку, де лежить те, що «над» котом (рука, що гладить, — у персонажа; хмара бійки — у частини котів).
 */
export const CAT_PIECE = { shadow: 0.001, body: 0.002, peek: 0.003 } as const;

/** Над точкою речі, у її проміжку глибини: кіт у будиночку й на роботі — над ними, нижче за ґратки чи накладки вище. */
const ABOVE_ITEM = ISO_DEPTH_SLOT * 0.4;

/**
 * Наскільки найвищий шматок кота в переносці (тулуб) нижче за ґратки: з таким запасом похибка округлення глибин (~1e-13 на
 * глибинах у сотні) не поставить його на ґратки чи над ними.
 */
const GRATE_GAP = 0.0005;

/** Зсув точки кота над переноскою: тінь і тулуб — над самою переноскою, але нижче за ґратки на глибині `grate`. */
export function underGrate(grate: number): number {
  return grate - CAT_PIECE.body - GRATE_GAP;
}

/**
 * Кіт, що їсть чи п'є з миски, сидить за нею, схилившись (§9.12, «Швидкість їжі»; перевірка етапу 2026-10-25 — кіт закривав
 * миску, і корму не було видно): на стільки клітинок далі по x і по y — на екрані вище, у порядку раніше за миску.
 */
export const BOWL_BEHIND = 0.35;
/**
 * Позаду миски автогодівниця (`FEEDER_BEHIND` 0,3, `floor.ts`) — за мискою місця немає: кіт сидить збоку від миски, з того
 * боку, звідки дивиться на неї (`along` — уздовж горизонталі екрана, клітинки x − y), і трохи позаду, щоб у порядку все одно
 * бути раніше за миску.
 */
export const BOWL_SIDE = { along: 0.64, behind: 0.08 } as const;
/** З такої відстані до миски (клітинки) кіт, що йде до неї, уже сідає за неї — плавно, а не ривком в останню мить. */
export const BOWL_APPROACH = 0.8;

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
 * Миска з кормом чи водою, з якої кіт їсть, п'є, краде, біля якої закопує корм чи яку обнюхує (нова річ): та, що в цілі його
 * дії. Інша ціль — null.
 */
export function bowlOf(state: GameState, cat: Cat): Extract<HomeItem, { kind: "bowl" | "water" }> | null {
  const { kind, target } = cat.act;
  if (!target) return null;
  let id: number | null = null;
  if ((kind === "eat" || kind === "drink" || kind === "bury" || kind === "steal") && target.startsWith("item:")) id = Number(target.slice(5));
  else if (kind === "idle" && (target.startsWith("sniff:") || target.startsWith("shun:"))) id = Number(target.slice(target.indexOf(":") + 1));
  if (id === null) return null;
  const item = state.home.items.find((i) => i.id === id);
  return item !== undefined && (item.kind === "bowl" || item.kind === "water") ? item : null;
}

/**
 * Де сидить кіт біля миски `bowl` (клітинки): за нею (`BOWL_BEHIND`), а коли позаду автогодівниця (`feeder`), — збоку, з
 * боку, протилежного тому, куди він дивиться (`facesRight` — праворуч на екрані: тоді ліворуч від миски), тож дивиться на
 * неї. Кіт, що ще йде до миски, сідає туди поступово з `BOWL_APPROACH` клітинок (`arrived` — дійшов). Зсув — від самого кота:
 * дійшовши, він у точці миски.
 */
export function bowlSeat(cat: Vec, bowl: Vec, feeder: boolean, facesRight: boolean, arrived: boolean): Vec {
  const k = arrived ? 1 : Math.max(0, 1 - Math.hypot(bowl.x - cat.x, bowl.y - cat.y) / BOWL_APPROACH);
  if (k === 0) return { x: cat.x, y: cat.y };
  if (!feeder) return { x: cat.x - BOWL_BEHIND * k, y: cat.y - BOWL_BEHIND * k };
  // Праворуч на екрані — +x і −y (ізометрія 2:1): зсув `along` по x − y — це половина його на кожну вісь.
  const side = facesRight ? -1 : 1;
  const half = BOWL_SIDE.along / 2;
  return { x: cat.x + (side * half - BOWL_SIDE.behind) * k, y: cat.y + (-side * half - BOWL_SIDE.behind) * k };
}

/**
 * Де кіт (див. `CatSpotKind`): `anim` — що він грає (`catAnim`), `pair` — місце в парі (`catPairs`), `held` — на руках чи
 * колінах; `depths` — глибини інших частин світу.
 */
export function catSpot(state: GameState, cat: Cat, anim: CatAnimId, pair: PairPlacement | null, depths: CatSpotDepths): CatSpot {
  if (cat.away !== null) return spot("away", { x: cat.x, y: cat.y }, { show: "none" });
  const held = state.character.held;
  if ((held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap") return spot("hands", { x: cat.x, y: cat.y });
  const act = cat.act;
  // У переносці (§9.12): клубочок крізь ґратки.
  if (act.kind === "sleep" && act.target === "carrier" && act.goal === null && state.home.carrier) {
    return spot("carrier", CARRIER_SPOT, {
      offset: pointOf(`item/carrier/${state.home.carrier}`, "inside"),
      above: { id: "carrier", offset: underGrate(depths.grate) },
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
    // У ящиках біля входу кіт лежить у верхній коробці, нижче за її борт (`perch` нижче за `top`): тіні на дні не видно —
    // вона лягла б на передню стінку.
    return spot("furniture", perch.at, { lift: perch.lift, box: object.id, shadow: object.kind !== "boxes" });
  }
  if (anim === "hide") return spot("under", tile, { show: "eyes" });
  // Їсть чи п'є з миски — за нею (чи збоку, коли позаду автогодівниця), а не в ній.
  const bowl = pair ? null : bowlOf(state, cat);
  if (bowl) {
    const feeder = (state.home.feeders ?? []).some((f) => f.slot === bowl.slot);
    return spot("floor", bowlSeat(cat, itemPoint(bowl), feeder, cat.facing >= 0, act.goal === null), { shadow: true });
  }
  return spot("floor", tile, { shadow: true });
}

/** Чи кіт на чомусь над підлогою: на меблях, на роботі (для плавного стрибка — висота змінюється не миттю). */
export const raised = (kind: CatSpotKind): boolean => kind === "furniture" || kind === "robot";
