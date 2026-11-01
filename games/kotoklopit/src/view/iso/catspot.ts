// Де кіт ізометричного вигляду (крок 16, T1): на підлозі, на меблях (на висоті їхнього верху), під меблями (з-під краю
// визирають очі), у будиночку, у барабані пральки, на роботі-пилососі, у переносці, під ковдрою, у ящиках, на руках чи
// колінах персонажа, у поїздці, за мискою. Чисті розрахунки без Phaser (`tests/isocats.test.ts`): яка точка підлоги, на
// якій висоті, на якій коробці реєстру глибини чи над якою точкою, з яким зсувом на екрані й що з кота видно.
//
// Те саме, що показував старий кіт на ізометричній підлозі (перехідний вигляд F3b), і те, що каже маніфест
// про точки речей: `drum` пральки, `blanket` ліжка, `inside` переноски, `door` будиночка, `top` робота, `top` ящиків.

import { CARRIER_SPOT, HIGH_PLACES, isSolid, isWall, itemPoint, objectAt, objectById } from "../../sim/home";
import type { Cat, GameState, HomeItem, LitterItem, ScratcherItem, Vec } from "../../sim/types";
import type { CatAnimId } from "../anim/ids";
import { isoScreenDir } from "../anim/iso";
import type { PairPlacement } from "../anim/pairs";
import { hidesUnder } from "../pose";
import type { ArtId } from "../art/types";
import { isoCatPerch, isoObjectLook } from "../world/objects";
import { blanketEars, catSize } from "./catrig";
import { ISO_DEPTH_SLOT } from "./depth";
import { artOffset, footprintCenter } from "./geometry";

/**
 * Де кіт:
 * - `away` — не вдома (поїздка, сходи): не видно;
 * - `hands` — на руках чи колінах персонажа (`PersonPart.hands`);
 * - `floor` — на підлозі (і за мискою, з якої їсть); `furniture` — на меблях, на висоті верху (`isoCatPerch`), у ящиках —
 *   у верхній коробці, нижче за борт;
 * - `under` — ховається під меблями: з-під ближчого видного краю видно очі й кінчик хвоста (з-під дивана — з боку сидіння,
 *   `hidePeek`);
 * - `house` — спить чи ховається в будиночку: у темному вході видно очі (сплячого — ще й кінчик хвоста з входу);
 * - `litter` — присідає в лотку: на наповнювачі, над лотком у порядку малювання (`LITTER_SEAT`);
 * - `blanket` — під ковдрою на ліжку (горбик малює квартира, `bedState`): анімація `blanket` (N1) показує лише вушка над
 *   горбиком і кінчик хвоста;
 * - `carrier` — спить у переносці: клубочок під ґратками (`CARRIER_GRATE_DEPTH`);
 * - `drum` — спить у барабані пральної машини;
 * - `robot` — їде на роботі-пилососі («Безстрашний»).
 */
export type CatSpotKind = "away" | "hands" | "floor" | "furniture" | "under" | "house" | "litter" | "blanket" | "carrier" | "drum" | "robot";

/**
 * Що з кота видно: скелет (що з нього видно — каже анімація: під ковдрою — лише вушка й кінчик хвоста), лише очі (і кінчик
 * хвоста) з-під меблів чи з будиночка, нічого.
 */
export type CatShow = "rig" | "eyes" | "none";

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
  /**
   * Точка — за коробкою `box` (`placeUnder`), а не на ній: з-під дивана очі визирають з боку сидіння, і край сидіння ховає
   * щілину й низ очей.
   */
  behind: boolean;
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
  /** Куди кіт дивиться (клітинки): на річ, біля якої стоїть збоку (`besideSeat`); null — як каже `catFacing`. */
  faces: Vec | null;
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
 * Кіт у лотку — одразу над лотком у його проміжку глибини: тінь і тулуб (`CAT_PIECE`) нижче за хвилі запаху брудного лотка
 * (`ON.fx` 0,003, `floor.ts`), тож запах здіймається й над котом.
 */
export const IN_LITTER = ISO_DEPTH_SLOT * 0.05;

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

/**
 * Кіт під ковдрою (§9.12, «Теплолюбність»): де посередині між основами вух — на гребені горбика ковдри (`env/bed`, стан
 * `hump`; одиниці арту від точки `blanket` ліжка). Гребінь — ≈ 25 над ковдрою, трохи праворуч від точки (верхній контур
 * горбика, `art/env/bed.svg`); основи вух — на середині його контуру (≈ 1,5 нижче за край), тож вушка виростають із ковдри, а
 * не висять над нею. Голова — праворуч, до подушки: горбик так і намальовано («голова праворуч нижче»).
 */
export const BLANKET_EARS: Vec = { x: 4.5, y: -21.5 };

/**
 * Зсув кореня кота під ковдрою від pivot ліжка (одиниці арту): середина основ його вух (`blanketEars` — за статурою, лапами й
 * віком; × масштаб кота) — у точці `BLANKET_EARS` горбика.
 */
export function blanketOffset(cat: Pick<Cat, "ageWeeks" | "traits" | "breed" | "shape">): Vec {
  const at = pointOf("env/bed", "blanket");
  const size = catSize(cat);
  const ears = blanketEars(cat.shape, size.kitten);
  return { x: at.x + BLANKET_EARS.x - ears.x * size.scale, y: at.y + BLANKET_EARS.y - ears.y * size.scale };
}

function spot(kind: CatSpotKind, at: Vec, extra: Partial<CatSpot> = {}): CatSpot {
  return { kind, at, lift: 0, offset: ZERO, box: null, behind: false, above: null, scale: 1, shadow: false, show: "rig", item: null, faces: null, ...extra };
}

// --- Схованка під меблями -------------------------------------------------------------------------

/**
 * Схованка під диваном (§9.12; рецензія хвилі 3). Диван стоїть під передньою стіною спинкою до камери: його ближній край
 * y1 = 11 лежить на передній стіні, а торець x1 = 16 упирається в шафу з пилососом, тож з боку камери під ним не видно
 * нічого — кота, що сховався, не було видно зовсім. Видно лише бік сидіння: очі визирають з-під його дальнього краю, над
 * силуетом дивана на екрані, як шкарпетка в схованці (`SOFA_PEEK`, `iso/geometry.ts`), — на лінії `y`, на 0,58 клітинки від
 * сидіння: очі (на 7 над підлогою) — на ≈ 11 над краєм сидіння (верх 34) на екрані, цілі, а темна щілина під ними
 * (`GAP_SHADOW`) лише виглядає з-за краю. І в межах `from`…`to` уздовж дивана: правіше
 * висока шафа з пилососом закриває очі на екрані, лівіше — бік ящиків біля входу (12, 9), коли вони є. Хто де під диваном
 * у сима (клітинки 13–15), той там само й у цих межах.
 */
export const SOFA_HIDE = { y: 9.42, from: 13.62, to: 14.18 } as const;

/** Чи видно точку схованки `p` на краю сліду речі `id`: не в стіні (передні — y = 11 і x = 19) і не в іншій речі за краєм. */
function peekOpen(state: GameState, id: string, p: Vec): boolean {
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  if (isWall(tx, ty)) return false;
  const other = objectAt(state, tx, ty);
  return other === null || other.id === id;
}

/**
 * Звідки визирає кіт, що сховався під річчю `id` (§9.12): з-під ближчого до камери краю сліду (`isoCatPerch`), якщо його
 * видно (`peekOpen`), інакше — з-під другого ближнього; під диваном жоден не видно — з боку сидіння (`SOFA_HIDE`, точка за
 * коробкою дивана). `behind` — точка за коробкою речі, а не на ній.
 */
export function hidePeek(state: GameState, id: string, cat: Vec): { at: Vec; behind: boolean } {
  const near = isoCatPerch(id, cat, true).at;
  if (peekOpen(state, id, near)) return { at: near, behind: false };
  const f = isoObjectLook(id).footprint;
  const other = near.x === f.x1 ? { x: cat.x, y: f.y1 } : { x: f.x1, y: cat.y };
  if (peekOpen(state, id, other)) return { at: other, behind: false };
  if (id === "sofa") {
    const t = Math.min(1, Math.max(0, (cat.x - f.x0) / (f.x1 - f.x0)));
    return { at: { x: SOFA_HIDE.from + (SOFA_HIDE.to - SOFA_HIDE.from) * t, y: SOFA_HIDE.y }, behind: true };
  }
  return { at: near, behind: false };
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

// --- Лоток і кігтеточка ---------------------------------------------------------------------------

/**
 * Кіт у лотку (§9.12; рецензія хвилі 3): присідає на наповнювачі — на `lift` над підлогою (наповнювач на 13, борт 22,
 * `art/item/litter/*.svg`) — і в порядку малювання одразу над лотком (`IN_LITTER`). У точці лотка на підлозі передній борт і
 * дашок ховали кота, крім кінчиків вух, і присідання (і крику від болю, §9.5) не було видно. У закритому лотку дашок — над
 * задньою половиною, вхід — на грані +x, тож кіт сидить у відкритій передній частині: на `premium` клітинки далі по x.
 */
export const LITTER_SEAT = { lift: 12, premium: 0.16 } as const;

/**
 * Кіт поруч із річчю, яку дере чи нюхає (§9.12; рецензія хвилі 3): збоку вздовж горизонталі екрана на `along` клітинок (x − y),
 * з того боку, звідки на неї дивиться, і на `front` ближче до камери — тож у порядку малювання він над річчю й лапами чи
 * носом дістає до неї, а не ховається за нею. Кігтеточка — стовпчик ≈ 0,2 клітинки на підставці, лоток — 0,8 × 0,6.
 */
export const BESIDE = { scratcher: { along: 0.62, front: 0.1 }, litter: { along: 0.95, front: 0.08 } } as const;
/** З такої відстані до речі (клітинки) кіт, що йде до неї, уже стає збоку — плавно, а не ривком в останню мить. */
export const BESIDE_APPROACH = 0.8;

/** Річ котячого кутка з цілі дії кота (`item:<id>`) потрібного виду. */
function targetItem<K extends HomeItem["kind"]>(state: GameState, cat: Cat, kind: K): Extract<HomeItem, { kind: K }> | null {
  const target = cat.act.target;
  if (!target?.startsWith("item:")) return null;
  const id = Number(target.slice(5));
  const item = state.home.items.find((i) => i.id === id);
  return item?.kind === kind ? (item as Extract<HomeItem, { kind: K }>) : null;
}

/** Лоток, до якого кіт прийшов у туалет (§9.12): у ньому присідає, а чистюля, що відмовився (`refused`), нюхає його збоку. */
export function litterOf(state: GameState, cat: Cat): LitterItem | null {
  return cat.act.kind === "toilet" ? targetItem(state, cat, "litter") : null;
}

/** Кігтеточка, яку кіт дере (§9.12, «Дряпання»). */
export function scratcherOf(state: GameState, cat: Cat): ScratcherItem | null {
  return cat.act.kind === "scratch" ? targetItem(state, cat, "scratcher") : null;
}

/**
 * Місце збоку зайняте, коли інша річ котячого кутка ближче за це на екрані (одиниці арту: по горизонталі й по вертикалі) —
 * кіт стояв би на ній чи перед нею: лотки й кігтеточки стоять рядком по діагоналі сітки, і сусідня річ на екрані якраз там.
 */
const BESIDE_CLEAR = { x: 56, y: 40 } as const;

/** Зсув місця збоку від речі (`BESIDE`): `side` −1 — ліворуч на екрані, 1 — праворуч. Праворуч на екрані — +x і −y. */
const besideShift = (side: number, along: number, front: number): Vec => ({ x: (side * along) / 2 + front, y: (-side * along) / 2 + front });

/**
 * З якого боку речі `item` стати (`BESIDE`): −1 — ліворуч на екрані, 1 — праворуч. Звідки кіт на неї дивиться (`facesRight`
 * — праворуч: тоді ліворуч від неї), якщо там вільно; інакше — з другого боку, якщо вільно там. Зайнято — стіна чи меблі або
 * інша річ котячого кутка ближче за `BESIDE_CLEAR` на екрані.
 */
export function besideSide(state: GameState, item: HomeItem, facesRight: boolean, along: number, front: number): -1 | 1 {
  const p = itemPoint(item);
  const free = (side: number): boolean => {
    const shift = besideShift(side, along, front);
    const at = { x: p.x + shift.x, y: p.y + shift.y };
    if (isSolid(state, Math.floor(at.x), Math.floor(at.y))) return false;
    return !state.home.items.some((other) => {
      if (other === item || other.kind === "toy") return false;
      const d = isoScreenDir({ x: itemPoint(other).x - at.x, y: itemPoint(other).y - at.y });
      return Math.abs(d.x) < BESIDE_CLEAR.x && Math.abs(d.y) < BESIDE_CLEAR.y;
    });
  };
  const first = facesRight ? -1 : 1;
  return free(first) || !free(-first) ? first : (-first as -1 | 1);
}

/**
 * Де стоїть кіт поруч із річчю в точці `item` (`BESIDE`): збоку вздовж горизонталі екрана на `along` (`side` — з якого боку,
 * `besideSide`) і на `front` ближче до камери. Кіт, що ще йде, стає туди поступово з `BESIDE_APPROACH` клітинок (`arrived` —
 * дійшов). Зсув — від самого кота: дійшовши, він у точці речі.
 */
export function besideSeat(cat: Vec, item: Vec, side: -1 | 1, arrived: boolean, along: number, front: number): Vec {
  const k = arrived ? 1 : Math.max(0, 1 - Math.hypot(item.x - cat.x, item.y - cat.y) / BESIDE_APPROACH);
  if (k === 0) return { x: cat.x, y: cat.y };
  const shift = besideShift(side, along, front);
  return { x: cat.x + shift.x * k, y: cat.y + shift.y * k };
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
  // Під ковдрою (§9.12, «Теплолюбність»): горбик — ліжко, над ним — вушка й кінчик хвоста (анімація `blanket` ховає решту).
  if (anim === "blanket") {
    const bed = objectById("bed");
    return spot("blanket", footprintCenter(bed), { offset: blanketOffset(cat), box: bed.id });
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
    // Ховається під меблями — визирає з-під ближчого видного краю (`hidePeek`); нагорі (холодильник, шафа) — лежить там
    // буханцем (`hidesUnder`).
    const hiding = hidesUnder(state, cat, anim) && !HIGH_PLACES.includes(object.id);
    if (hiding) {
      const peek = hidePeek(state, object.id, pair ? tile : cat);
      return spot("under", peek.at, { box: object.id, behind: peek.behind, show: "eyes" });
    }
    const perch = isoCatPerch(object.id, pair ? tile : cat, false);
    // У ящиках біля входу кіт лежить у верхній коробці, нижче за її борт (`perch` нижче за `top`): тіні на дні не видно —
    // вона лягла б на передню стінку.
    return spot("furniture", perch.at, { lift: perch.lift, box: object.id, shadow: object.kind !== "boxes" });
  }
  if (hidesUnder(state, cat, anim)) return spot("under", tile, { show: "eyes" });
  // Їсть чи п'є з миски — за нею (чи збоку, коли позаду автогодівниця), а не в ній.
  const bowl = pair ? null : bowlOf(state, cat);
  if (bowl) {
    const feeder = (state.home.feeders ?? []).some((f) => f.slot === bowl.slot);
    return spot("floor", bowlSeat(cat, itemPoint(bowl), feeder, cat.facing >= 0, act.goal === null), { shadow: true });
  }
  if (!pair) {
    // У лотку — присідає на наповнювачі (у закритому — у відкритій частині); чистюля, що відмовився, нюхає його збоку.
    const litter = litterOf(state, cat);
    if (litter && act.goal === null && act.refused !== true) {
      const p = itemPoint(litter);
      const at = litter.quality === "premium" ? { x: p.x + LITTER_SEAT.premium, y: p.y } : p;
      return spot("litter", at, { lift: LITTER_SEAT.lift, above: { id: `item:${litter.id}`, offset: IN_LITTER } });
    }
    // Дере кігтеточку чи нюхає лоток — збоку від речі (з вільного боку), лапами чи носом до неї.
    const scratcher = scratcherOf(state, cat);
    const beside = scratcher ? { item: scratcher, ...BESIDE.scratcher } : litter ? { item: litter, ...BESIDE.litter } : null;
    if (beside) {
      const p = itemPoint(beside.item);
      const side = besideSide(state, beside.item, cat.facing >= 0, beside.along, beside.front);
      const arrived = act.goal === null;
      return spot("floor", besideSeat(cat, p, side, arrived, beside.along, beside.front), { shadow: true, faces: arrived ? p : null });
    }
  }
  return spot("floor", tile, { shadow: true });
}

/** Чи кіт на чомусь над підлогою: на меблях, на роботі, у лотку (для плавного стрибка — висота змінюється не миттю). */
export const raised = (kind: CatSpotKind): boolean => kind === "furniture" || kind === "robot" || kind === "litter";
