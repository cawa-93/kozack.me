// Типи скелета й анімації (крок 16, GRAPHICS_PLAN.md, «Скелети й анімації»; §2.1: формат власний, як TS-дані з
// типізованими id). Лише типи й функції-тотожності для виведення типів, без Phaser і DOM: їх імпортують `rigcore.ts` і
// Node-тести.
//
// Скелет — `src/view/rig/defs/<cat|person>.ts`: `export const CAT_RIG = defineRig({ … })`. Анімації —
// `src/view/rig/anims/<rig>/<група>.ts`: `export const CAT_BASIC = defineAnims(CAT_RIG, { walk: { … }, sit: { … } })`.
// Визначення скелета дає літеральні id кісток, слотів і гнізд, тож помилковий id в анімації — помилка типів.
//
// Одиниці: довжини — одиниці арту (`art/types.ts`), вісь y донизу; кути — градуси, додатні — за годинниковою стрілкою; час —
// мілісекунди. Скелет і арт дивляться праворуч; ліворуч — віддзеркалення всього скелета (`RigFacing.flip`).
//
// Як кадр сидить на кістці: pivot кадру (`ArtEntry.pivot`) — у точці слота (`SlotDef.x`, `y`) у системі кістки. У вихідній
// позі ракурсу кожен кадр стоїть так, як намальований; далі він повертається й масштабується разом із кісткою відносно
// вихідної пози. Тож художник малює частину такою, як вона виглядає у вихідній позі, а pivot ставить у суглоб.

import type { ArtId, ArtView } from "../art/types";

/** Точка чи вектор в одиницях арту. */
export interface Vec2 {
  x: number;
  y: number;
}

// --- Скелет ------------------------------------------------------------------------------------

/** Вихідна поза кістки: де вона починається, куди дивиться й яка завдовжки. */
export interface BoneSetup {
  /** Початок кістки в системі батька, одиниці арту; у кореня — від точки скелета на підлозі (позиції кота чи персонажа). */
  x: number;
  y: number;
  /** Кут відносно батька, градуси за годинниковою стрілкою; вісь кістки — її локальна x. */
  rot: number;
  /** Довжина вздовж локальної x, одиниці арту: кінець кістки — (len, 0) у її системі (для галереї й гнізд). */
  len: number;
}

/** Кістка: id, батько й вихідна поза (спільна для обох ракурсів, поки ракурс її не перевизначить). */
export interface BoneDef<B extends string> extends BoneSetup {
  id: B;
  /** Батьківська кістка; null — корінь (він один). */
  parent: NoInfer<B> | null;
}

/** Слот: місце для одного кадру арту на кістці. */
export interface SlotDef<B extends string, S extends string> {
  id: S;
  bone: NoInfer<B>;
  /** Порядок малювання: більший — ближче до глядача; дробові числа — між сусідами. */
  z: number;
  /**
   * Стан кадру за замовчуванням (`open`, `up`, `sit`); null — запис без станів. Кадр слота —
   * `frameId(обвіс[слот], стан, ракурс)`: стан і ракурс додаються, лише якщо запис маніфесту їх має.
   */
  frame: string | null;
  /** Де pivot кадру: зсув від початку кістки в її системі, одиниці арту; за замовчуванням 0. */
  x?: number;
  y?: number;
}

/** Вихідний стан слота в ракурсі: перевизначає поля `SlotDef`. */
export interface SlotSetup {
  z?: number;
  frame?: string | null;
  /** Чи видно слот (морди не видно ззаду); за замовчуванням видно. */
  visible?: boolean;
  x?: number;
  y?: number;
}

/**
 * Вихідна поза ракурсу: перевизначення кісток (замінюють поля `BoneDef`), стани й порядок z слотів, порядок z гнізд.
 * Ракурс без перевизначень — `{}`.
 */
export interface RigViewSetup<B extends string, S extends string, K extends string> {
  bones?: Readonly<Partial<Record<B, Partial<BoneSetup>>>>;
  slots?: Readonly<Partial<Record<S, SlotSetup>>>;
  sockets?: Readonly<Partial<Record<K, { z: number }>>>;
}

/**
 * Якорі — точки для того, що лише стоїть поруч і не кріпиться до кістки: `head` — над головою (бульбашки, серця настрою),
 * `hands` — руки персонажа (куди летять запаси, звідки йде волосінь), `mouth` — рот кота, `lap` — коліна персонажа.
 */
export type RigAnchor = "head" | "hands" | "mouth" | "lap";

/** Точка на кістці: у її системі, одиниці арту. */
export interface AnchorDef<B extends string> {
  bone: NoInfer<B>;
  x: number;
  y: number;
}

/**
 * Що кріпиться в гніздо: `cat` — кіт (на руках, на колінах), `hand` — рука персонажа, що гладить кота, `rod` — вудочка в
 * руці, `held` — річ у руках (`Item` без кота: тарілка, судочок, совок корму, пакунок), `toy` — іграшка в зубах, `sock` —
 * шкарпетка в зубах.
 */
export type SocketCargo = "cat" | "hand" | "rod" | "held" | "toy" | "sock";

/**
 * Гніздо — точка на кістці для чужого об'єкта (іншого скелета чи кадру): він рухається й повертається з кісткою і
 * малюється між слотами за `z`. Наприклад, у кота — `pet` (спинка під рукою) і `teeth` (річ у зубах), у персонажа —
 * `arms`, `lap`, `rod`, `held`.
 */
export interface SocketDef<B extends string> extends AnchorDef<B> {
  /** Додатковий кут об'єкта відносно кістки, градуси; за замовчуванням 0. */
  rot?: number;
  /** Порядок малювання серед слотів скелета. */
  z: number;
  /** Що сюди можна покласти. */
  cargo: readonly SocketCargo[];
}

/**
 * Поправка пропорцій однієї кістки (кошеня, короткі лапи, статура): `x`, `y`, `rot` додаються до вихідної пози, `scale`
 * множить масштаб кістки (а з нею — дочірніх кісток і кадрів). Кілька поправок складаються по черзі. Поправка — не
 * вихідна поза: кадри повертаються й масштабуються з нею, як з анімацією (голова кошеняти більша).
 */
export interface BoneTweak {
  x?: number;
  y?: number;
  rot?: number;
  scale?: Vec2;
}

/** Поправка пропорцій скелета: кістка → поправка. */
export type RigTweak<B extends string> = Readonly<Partial<Record<B, BoneTweak>>>;

/**
 * Обвіс: який запис маніфесту показує кожен слот (`ear-l` → `cat/ear/large`); null — слота в цієї істоти немає
 * (безхвостий кіт). Збирається з форм кота (`Shape`) чи вигляду персонажа (`Look`).
 */
export type RigSkin<S extends string> = Readonly<Record<S, ArtId | null>>;

/** Визначення скелета: `B` — id кісток, `S` — id слотів, `K` — id гнізд. */
export interface RigDef<B extends string, S extends string, K extends string> {
  /** Назва скелета: `cat`, `person`. */
  id: string;
  /** Кістки; батько — раніше за дітей. */
  bones: readonly BoneDef<B>[];
  slots: readonly SlotDef<B, S>[];
  /** Вихідна поза й порядок z для кожного з двох ракурсів. */
  views: Readonly<Record<ArtView, RigViewSetup<NoInfer<B>, NoInfer<S>, NoInfer<K>>>>;
  anchors: Readonly<Partial<Record<RigAnchor, AnchorDef<B>>>>;
  sockets: Readonly<Record<K, SocketDef<B>>>;
  /** Обвіс за замовчуванням (галерея, тести, заглушки); істота підставляє свій. */
  skin: RigSkin<NoInfer<S>>;
  /** Поправки пропорцій за назвою (`kitten`, `short-legs`, `stocky`). */
  proportions?: Readonly<Record<string, RigTweak<NoInfer<B>>>>;
}

/** Будь-який скелет — для обмежень у generics. */
export interface AnyRig {
  id: string;
  bones: readonly { id: string }[];
  slots: readonly { id: string }[];
  sockets: object;
}

/** Id кісток, слотів і гнізд скелета. */
export type BoneOf<R extends AnyRig> = R["bones"][number]["id"];
export type SlotOf<R extends AnyRig> = R["slots"][number]["id"];
export type SocketOf<R extends AnyRig> = keyof R["sockets"] & string;

/** Визначити скелет: id кісток, слотів і гнізд стають літеральними типами, а посилання на них перевіряються. */
export function defineRig<const B extends string, const S extends string, const K extends string = never>(def: RigDef<B, S, K>): RigDef<B, S, K> {
  return def;
}

/** Куди дивиться скелет: ракурс і віддзеркалення (`flip` — обличчям ліворуч). */
export interface RigFacing {
  view: ArtView;
  flip: boolean;
}

// --- Анімація ----------------------------------------------------------------------------------

/**
 * Перехід від ключа до наступного: `linear` — рівномірно, `step` — тримати значення до наступного ключа, `in` / `out` /
 * `inOut` — м'який розгін / гальмування / обидва (синусоїда).
 */
export type Ease = "linear" | "step" | "in" | "out" | "inOut";

/** Ключ доріжки кістки. */
export interface Key<V> {
  /** Час від початку анімації, мс (0 … `duration`). */
  t: number;
  v: V;
  /** Як іти від цього ключа до наступного; за замовчуванням `linear`. */
  ease?: Ease;
}

/** Ключ доріжки слота: значення тримається до наступного ключа. */
export interface StepKey<V> {
  /** Час від початку анімації, мс. */
  t: number;
  v: V;
}

/**
 * Доріжки кістки — відносно вихідної пози ракурсу: `rot` додається до кута (градуси), `pos` — до положення (одиниці арту, у
 * системі батька), `scale` множить масштаб (1 — без змін). Ключі — за зростанням `t`; до першого ключа діє перший, після
 * останнього — останній.
 */
export interface BoneTracks {
  rot?: readonly Key<number>[];
  pos?: readonly Key<Vec2>[];
  scale?: readonly Key<Vec2>[];
}

/** Доріжки слота: `frame` — стан кадру (заміна очей, рота, вух), `visible` — чи видно, `z` — порядок малювання. */
export interface SlotTracks {
  frame?: readonly StepKey<string>[];
  visible?: readonly StepKey<boolean>[];
  z?: readonly StepKey<number>[];
}

/** Доріжки анімації за кістками й слотами; кістки й слоти без доріжок лишаються у вихідній позі. */
export interface RigTracks<B extends string, S extends string> {
  bones?: Readonly<Partial<Record<B, BoneTracks>>>;
  slots?: Readonly<Partial<Record<S, SlotTracks>>>;
}

/** Анімація скелета: `B` — id кісток, `S` — id слотів. */
export interface RigAnim<B extends string, S extends string> extends RigTracks<B, S> {
  /** Тривалість, мс: довжина циклу чи разової дії. */
  duration: number;
  /** По колу (ходьба, сон); інакше — разова: після кінця тримає останній кадр (поклав, узяв, вкусили). */
  loop: boolean;
  /**
   * Перевизначення для ракурсу: доріжка тут замінює ту саму доріжку тієї самої кістки чи слота (решта лишається від
   * основної анімації).
   */
  views?: Readonly<Partial<Record<ArtView, RigTracks<B, S>>>>;
}

/** Анімація для скелета `R`. */
export type AnimOf<R extends AnyRig> = RigAnim<BoneOf<R>, SlotOf<R>>;

/** Обвіс для скелета `R`. */
export type SkinOf<R extends AnyRig> = RigSkin<SlotOf<R>>;

/** Визначити групу анімацій скелета: назви анімацій лишаються літеральними, а id кісток і слотів перевіряються за скелетом. */
export function defineAnims<R extends AnyRig, const N extends string>(_rig: R, anims: Readonly<Record<N, AnimOf<NoInfer<R>>>>): Readonly<Record<N, AnimOf<R>>> {
  return anims;
}
