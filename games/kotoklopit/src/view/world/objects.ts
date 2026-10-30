// Вигляд речей квартири (§8.4), спільний для частин світу: на яку висоту вилазить кіт, де стоїть персонаж, де бабл.
// Без Phaser.
//
// Два набори даних: старий вигляд (`objectHeight` — видима висота на косій проєкції) і ізометрія кроку 16 (`isoObjectLook`,
// `isoItemLook`): слід речі для порядку малювання, висота верху (на ній лежать речі й сидять коти), найвища точка (над нею
// бабл), де сидить кіт, де персонаж стоїть чи сидить, користуючись річчю, і зсув бабла. Висоти — в одиницях арту (1 одиниця =
// 1 px світу ізометрії; плитка 128 × 64, персонаж ≈ 140, дорослий кіт ≈ 56), ті самі, з якими маніфест арту рахує полотна
// (`src/view/art/manifest/a0*.ts`; що вони збігаються, перевіряє `tests/isoworld.test.ts`).

import { OBJECTS, type ObjectKind } from "../../sim/home";
import type { HomeItem, Quality, Vec } from "../../sim/types";

/**
 * Видима висота речі на екрані старого вигляду (коса проєкція «три чверті»), px: на таку висоту вилазить кіт, така
 * лицьова грань меблів.
 */
const HEIGHT: Record<ObjectKind, number> = {
  bed: 22,
  shower: 52,
  sink: 30,
  fridge: 72,
  stove: 32,
  counter: 32,
  table: 26,
  trash: 30,
  computer: 30,
  sofa: 30,
  // Двері — у стіні: заввишки як стіна косої проєкції.
  door: 30,
  catCabinet: 46,
  washer: 48,
  vacuum: 60,
  litterBag: 42,
  sterileBin: 36,
  catKit: 40,
  boxes: 40,
  wardrobe: 64,
  windowsill: 22,
};

/** Видима висота речі (старий вигляд): на неї вилазить кіт. */
export function objectHeight(kind: ObjectKind): number {
  return HEIGHT[kind];
}

// --- Ізометрія (крок 16) ------------------------------------------------------------------------

/** Слід речі в клітинках для порядку малювання (`isoOrder`): [x0, x1) × [y0, y1). */
export interface IsoFootprint {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Як персонаж користується річчю: де стоїть чи сидить (точка підлоги в клітинках) і куди дивиться (напрям у клітинках). */
export interface IsoUse {
  readonly at: Vec;
  readonly pose: "stand" | "sit";
  readonly facing: Vec;
}

/** Ізометричний вигляд речі квартири. */
export interface IsoObjectLook {
  /** Слід для порядку малювання; у більшості — прямокутник речі з `OBJECTS`, у підвіконь — лише дошка біля стіни. */
  readonly footprint: IsoFootprint;
  /** Висота верхньої поверхні: на ній лежать страва й дрібнички. */
  readonly top: number;
  /** Найвища точка (монітор, узголів'я, кран, спинка): над нею — бабл і підсвітка. */
  readonly tall: number;
  /**
   * На якій висоті стоїть кіт, що виліз на річ (§9.12, «Лазіння»): верх холодильника й шафи, сидіння дивана, клавіатура,
   * верхня коробка купи, піддон душу (у кабіні кіт сидить на мокрому піддоні біля входу). null — на річ не вилазять (двері).
   */
  readonly perch: number | null;
  /** Де персонаж стоїть чи сидить, користуючись річчю (дані для T2); null — річ лише обстановка. */
  readonly use: IsoUse | null;
  /** Зсув бабла від точки над найвищою точкою, одиниці арту (монітор стоїть ближче до стіни, ніж середина стола). */
  readonly bubble: Vec;
}

/** Що задають руками; решта — зі сліду речі. */
interface LookSpec {
  top: number;
  tall?: number;
  perch?: number | null;
  use?: IsoUse | null;
  bubble?: Vec;
  /** Слід, якщо не весь прямокутник речі. */
  footprint?: IsoFootprint;
}

/** Висоти, спільні з маніфестом (`a02-kitchen.ts`, `a04-rooms.ts`). */
const COUNTER = 62;
const DESK = 54;
const TABLE = 54;
const SILL = 70;

/** Персонаж стоїть перед річчю під задньою стіною (лицьова грань — до кімнати, y + h) і дивиться на неї. */
const front = (x: number, y: number, pose: IsoUse["pose"] = "stand"): IsoUse => ({ at: { x, y }, pose, facing: { x: 0, y: -1 } });

/**
 * Дані кожної речі квартири за id (`OBJECTS`). Висоти — як у маніфесті: меблі відносно персонажа 140, слід — клітинки речі.
 * Де персонаж користується річчю — перед її лицьовою гранню, на відстані руки (≈ 0,35 клітинки), а за столами — сидячи.
 */
const LOOKS: Readonly<Record<string, LookSpec>> = {
  // Ліжко 1 × 2 заввишки 40 з узголів'ям біля задньої стіни: кіт спить на ковдрі, під нею — теплолюб. Персонаж лягає збоку.
  bed: { top: 40, tall: 72, use: { at: { x: 2.35, y: 2 }, pose: "stand", facing: { x: -1, y: 0 } } },
  // Душова кабіна: персонаж усередині (не видно); кіт сидить на мокрому піддоні біля входу; купаючи кота — стоїть перед нею.
  shower: { top: 170, tall: 186, perch: 6, use: front(8.5, 2.35) },
  sink: { top: 70, tall: 92, use: front(11.5, 2.35) },
  washer: { top: 72, tall: 76, use: front(10.5, 2.35) },
  fridge: { top: 150, use: front(13.5, 2.35) },
  "counter-left": { top: COUNTER, use: front(14.5, 2.35) },
  // Плита: задня панель з ручками вища за стільницю; коти сідають на стільницю.
  stove: { top: COUNTER, tall: 84, use: front(15.5, 2.35) },
  "counter-right": { top: COUNTER, use: front(17, 2.35) },
  trash: { top: 46, use: front(18.5, 2.35) },
  // Кухонний стіл: персонаж їсть сидячи на стільці перед ним.
  table: { top: TABLE, use: front(14, 4.35, "sit") },
  // Шафка з кормом біля правої стіни: дверцята — на видній грані до кімнати (y + 1).
  "cat-cabinet": { top: 80, use: front(18.5, 4.35) },
  // Стіл із комп'ютером під внутрішньою стіною ряду 5: персонаж працює сидячи, спиною до камери; монітор — ближче до стіни.
  computer: { top: DESK, tall: 112, use: front(7, 7.35, "sit"), bubble: { x: 16, y: 0 } },
  wardrobe: { top: 170, use: null },
  // Підвіконня: вузька дошка з батареєю вздовж стіни з вікном — слід лише дошки, решта клітинки — підлога перед нею.
  "sill-bedroom": { top: SILL, tall: SILL + 6, use: null, footprint: { x0: 4, y0: 1, x1: 5, y1: 1.3 } },
  "sill-living": { top: SILL, tall: SILL + 6, use: null, footprint: { x0: 1, y0: 8, x1: 1.3, y1: 9 } },
  // Диван під передньою стіною: сидіння ≈ 34 дивиться в кімнату, спинка ≈ 60 — до камери.
  sofa: { top: 34, tall: 60, use: null },
  // Двері в передній стіні — поріг і низьке полотно; на них не вилазять. Персонаж стоїть перед ними обличчям до камери.
  door: { top: 40, perch: null, use: { at: { x: 11, y: 10.5 }, pose: "stand", facing: { x: 0, y: 1 } } },
  // Шафа з пилососом під передньою стіною: дверцята — на видній грані, персонаж стоїть з боку кімнати.
  vacuum: { top: 140, use: { at: { x: 16.5, y: 9.4 }, pose: "stand", facing: { x: 0, y: 1 } } },
  "litter-bag": { top: 56, use: front(5.5, 7.35) },
  "sterile-bin": { top: 50, use: { at: { x: 17.4, y: 6.5 }, pose: "stand", facing: { x: 1, y: 0 } } },
  // Аптечка: кришка ≈ 40, ручка — до 56.
  "cat-kit": { top: 40, tall: 56, use: front(13.5, 7.35) },
  // Ящики біля входу: купа до 64, а кіт лежить у верхній коробці (≈ 48).
  boxes: { top: 64, perch: 48, use: front(12.5, 10.3) },
};

const ISO_LOOKS: ReadonlyMap<string, IsoObjectLook> = new Map(
  OBJECTS.map((object) => {
    const spec = LOOKS[object.id];
    if (!spec) throw new Error(`Немає ізометричного вигляду для «${object.id}»`);
    const look: IsoObjectLook = {
      footprint: spec.footprint ?? { x0: object.x, y0: object.y, x1: object.x + object.w, y1: object.y + object.h },
      top: spec.top,
      tall: spec.tall ?? spec.top,
      perch: spec.perch === undefined ? spec.top : spec.perch,
      use: spec.use ?? null,
      bubble: spec.bubble ?? { x: 0, y: 0 },
    };
    return [object.id, look];
  }),
);

/** Ізометричний вигляд речі квартири за її id (`OBJECTS`). */
export function isoObjectLook(id: string): IsoObjectLook {
  const look = ISO_LOOKS.get(id);
  if (!look) throw new Error(`Немає речі «${id}»`);
  return look;
}

/** Де кіт на речі чи під нею: точка підлоги під лапами (клітинки) і висота над нею, одиниці арту. */
export interface IsoPerch {
  readonly at: Vec;
  readonly lift: number;
}

/**
 * Де стоїть кіт, що виліз на річ `id` (§9.12, «Лазіння»), чи ховається під нею: дані для T1 і для старого кота на ізометричній
 * підлозі. На речі — над своєю точкою на висоті `perch`; у душовій кабіні — на мокрому піддоні біля входу; під річчю —
 * визирає з-під ближчого до камери краю сліду (грань x1 чи y1), на підлозі.
 */
export function isoCatPerch(id: string, cat: Vec, hiding: boolean): IsoPerch {
  const look = isoObjectLook(id);
  const f = look.footprint;
  if (hiding) {
    const toRight = f.x1 - cat.x;
    const toLeft = f.y1 - cat.y;
    return { at: toRight <= toLeft ? { x: f.x1, y: cat.y } : { x: cat.x, y: f.y1 }, lift: 0 };
  }
  if (id === "shower") return { at: { x: (f.x0 + f.x1) / 2, y: f.y0 + (f.y1 - f.y0) * 0.85 }, lift: look.perch ?? 0 };
  return { at: { x: cat.x, y: cat.y }, lift: look.perch ?? 0 };
}

/** Речі на підлозі (§9.12, §8.5, §8.7): котячий куточок і техніка — для висоти бабла й ширини малюнка. */
export type IsoFloorKind = HomeItem["kind"] | "feeder" | "robot" | "carrier" | "basket";

/** Ізометричний вигляд речі на підлозі. */
export interface IsoItemLook {
  /** Видима висота над точкою підлоги, одиниці арту: над нею — бабл. */
  readonly height: number;
  /** Півширина малюнка на екрані, одиниці арту (`IsoPointOptions.half`): з ким він може перекритися. */
  readonly half: number;
}

/** Висоти — як полотна маніфесту (`a05-catstuff.ts`, `a03-bath.ts`) над pivot без запасу під контур. */
const ITEM_LOOKS: Readonly<Record<IsoFloorKind, Readonly<Record<Quality, IsoItemLook>>>> = {
  bowl: same({ height: 14, half: 24 }),
  water: same({ height: 14, half: 24 }),
  litter: { cheap: { height: 28, half: 44 }, premium: { height: 56, half: 44 } },
  toy: same({ height: 16, half: 40 }),
  house: same({ height: 90, half: 48 }),
  // Дешева — еталон F1a (заввишки 89, підставка й помпон ширші за стовпчик).
  scratcher: { cheap: { height: 89, half: 54 }, premium: { height: 100, half: 38 } },
  feeder: { cheap: { height: 56, half: 24 }, premium: { height: 56, half: 28 } },
  robot: same({ height: 20, half: 32 }),
  carrier: same({ height: 70, half: 48 }),
  basket: same({ height: 54, half: 36 }),
};

function same(look: IsoItemLook): Record<Quality, IsoItemLook> {
  return { cheap: look, premium: look };
}

/** Ізометричний вигляд речі на підлозі за видом і якістю. */
export function isoItemLook(kind: IsoFloorKind, quality: Quality = "cheap"): IsoItemLook {
  return ITEM_LOOKS[kind][quality];
}
