// Розведення пар котів в ізометрії (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»). Сим ставить двох котів поруч уздовж осі x
// клітинок (протистояння за 0,6 клітинки, вилизування й гра — впритул, кошенята — біля матері): у старій косій проєкції це
// горизонталь екрана, а в ізометрії — діагональ, і двоє накладаються одне на одного. Вигляд розсуває їх уздовж горизонталі
// екрана, щоб стояли боком до камери обличчям одне до одного, і каже, хто куди дивиться. Позиції сима не змінюються: це лише
// зсув малюнка (і того самого місця в клітинках — для глибини). Без Phaser.

import { asleep } from "../../sim/cat";
import { RELATIONS } from "../../sim/config";
import { isNewborn } from "../../sim/reproduction";
import type { Cat, GameState, Vec } from "../../sim/types";
import { brawlFoe } from "../pose";
import type { RigFacing } from "../rig/types";
import { isoScreenDir, isoTileDir } from "./iso";

/**
 * Пара: `faceoff` — протистояння (обидва дугою), `brawl` — клубок бійки (обидва в одній точці), `groom` — вилизує друга чи
 * кошеня, `wrestle` — гра-боротьба зблизька, `pile` — сплять поруч, `cuddle` — «Щедра душа» лежить поруч із тим, кого
 * гладять (рухається лише вона), `nursing` — новонароджені біля матері (мати на місці, кошенята рядком перед нею).
 */
export type PairKind = "faceoff" | "brawl" | "groom" | "wrestle" | "pile" | "cuddle" | "nursing";

/** Де кіт у парі. */
export interface PairPlacement {
  kind: PairKind;
  /** З ким: другий кіт пари; кошеня — з матір'ю, мати — з першим кошеням. */
  with: number;
  /** Зсув малюнка від точки кота на екрані, одиниці арту (= px світу ізометрії). */
  offset: Vec;
  /** Той самий зсув у клітинках: точка кота для глибини (`isoOrder`) — його позиція плюс цей зсув. */
  tile: Vec;
  /** Ракурс у парі (обличчям до пари); null — звичайний (`catFacing` без пари). */
  facing: RigFacing | null;
}

/**
 * Відстань між точками двох котів пари вздовж горизонталі екрана, одиниці арту, для дорослих котів (кошенята — менше, за
 * `sizeOf`). Дорослий кіт ≈ 56 заввишки й ≈ 70 завдовжки (контракт хвилі 0).
 */
export const PAIR_GAPS: Readonly<Record<Exclude<PairKind, "nursing">, number>> = {
  // Морда до морди, з дугами спин: як 0,6 клітинки старого вигляду.
  faceoff: 64,
  // Одна фігура посередині: кожен малює свою кулю довкола спільної точки.
  brawl: 0,
  // Сидять упритул боками, голова того, хто вилизує (анімація `lick` тягне її вперед), дістає до щоки друга. З 30 тулуби
  // налягали майже цілком, і на телефоні пара читалася як один двоголовий кіт із шістьма лапами (рецензія хвилі 3).
  groom: 46,
  // Мисливець над тим, хто на спині.
  wrestle: 34,
  pile: 30,
  cuddle: 40,
};

/**
 * Той, хто вилизує, — на стільки ближче до камери, ніж друг (одиниці арту, × розмір пари): у порядку малювання завжди поверх
 * друга (§9.4, поза 3), хоч би з якого боку сидів, — його голова лягає на щоку друга, а не ховається за нею.
 */
export const GROOM_FRONT = 3;

/** Кошенята біля матері: крок рядка й на скільки рядок перед нею (ближче до камери), одиниці арту. */
export const NURSING = { spacing: 20, front: 10 } as const;

/** Далі за це (клітинки) двоє вже не пара, а кожен сам по собі: розбіглися в грі, друг відійшов. */
const NEAR = 1.2;

/** Розмір кота відносно дорослого (кошеня менше): відстань у парі множиться на середній розмір пари. */
export type SizeOf = (cat: Cat) => number;

const ADULT: SizeOf = () => 1;

const home = (state: GameState, cat: Cat): boolean => {
  const held = state.character.held;
  return cat.away === null && !(held?.kind === "cat" && held.cat === cat.id) && cat.act.kind !== "lap";
};

const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Інший кіт за ціллю дії `prefix:<id>`, якщо він удома. */
function byTarget(state: GameState, target: string | null, prefixes: readonly string[]): Cat | null {
  if (target === null) return null;
  for (const prefix of prefixes) {
    if (!target.startsWith(`${prefix}:`)) continue;
    const id = Number(target.slice(prefix.length + 1));
    const other = state.cats.find((c) => c.id === id);
    return other && home(state, other) ? other : null;
  }
  return null;
}

const standing = (cat: Cat): boolean => cat.act.goal === null;
/**
 * Гра з другом на місці: ніхто не біжить. Сим рухає котів у грі без `goal` — утікача до `act.run` (засідка, погоня), мисливця
 * за ним (погоня) чи до нього (боротьба, `run`), — і тоді двоє не пара: кожен дивиться туди, куди біжить.
 */
const playingStill = (cat: Cat): boolean => standing(cat) && cat.act.run === undefined && cat.act.game?.phase !== "chase";
const eyeing = (cat: Cat, other: Cat): boolean => cat.act.target === `cat:${other.id}`;

/** Пара для кота `a` за його дією: з ким і яка; null — кіт не в парі. Мати й кошенята — окремо (`nursing`). */
function partnerOf(state: GameState, a: Cat): { b: Cat; kind: Exclude<PairKind, "nursing"> } | null {
  const act = a.act;
  const brawl = brawlFoe(state, a);
  if (brawl && home(state, brawl)) return { b: brawl, kind: "brawl" };
  if ((act.kind === "standoff" || act.kind === "fight") && standing(a)) {
    const b = byTarget(state, act.target, ["cat"]);
    if (b && (b.act.kind === "standoff" || b.act.kind === "fight") && standing(b) && eyeing(b, a)) return { b, kind: "faceoff" };
  }
  if (act.kind === "wrestle" && act.paired === true && playingStill(a)) {
    const b = byTarget(state, act.target, ["cat"]);
    if (b && b.act.kind === "wrestle" && b.act.paired === true && playingStill(b) && distance(a, b) <= NEAR) return { b, kind: "wrestle" };
  }
  if (act.kind === "groom" && standing(a)) {
    const b = byTarget(state, act.target, ["cat", "kitten"]);
    if (b && distance(a, b) <= NEAR) return { b, kind: "groom" };
  }
  if (asleep(a)) {
    const b = byTarget(state, act.target, ["pile"]);
    if (b && asleep(b) && distance(a, b) <= Math.max(NEAR, RELATIONS.sleepTogether.distance)) return { b, kind: "pile" };
  }
  if (act.kind === "idle" && standing(a)) {
    const b = byTarget(state, act.target, ["cuddle"]);
    if (b && distance(a, b) <= NEAR * 1.5) return { b, kind: "cuddle" };
  }
  return null;
}

const placement = (kind: PairKind, other: Cat, offset: Vec, facing: RigFacing | null): PairPlacement => ({
  kind,
  with: other.id,
  offset,
  tile: isoTileDir(offset),
  facing,
});

/** Обличчям праворуч, якщо кіт ліворуч від пари, і навпаки; лицем до нас. */
const towards = (left: boolean): RigFacing => ({ view: "front", flip: !left });

/**
 * Пари котів, що зараз удома (крок 16): для кожного кота в парі — де його малювати й куди він дивиться. Двоє стають на
 * горизонталі екрана через середину між ними на `PAIR_GAPS` × середній розмір пари (`sizeOf`; за замовчуванням усі —
 * дорослі): той, хто лівіше, — ліворуч, обличчям праворуч. «Щедра душа» підсувається до того, кого гладять, а той лишається
 * на місці під рукою. Новонароджені, що сплять біля сплячої матері, лягають рядком перед нею. Кіт буває лише в одній парі —
 * у першій за порядком: бійка, протистояння, гра, вилизування, сон поруч, «Щедра душа»; кошенята — перед ними всіма.
 */
export function catPairs(state: GameState, sizeOf: SizeOf = ADULT): Map<number, PairPlacement> {
  const placed = new Map<number, PairPlacement>();
  nursing(state, sizeOf, placed);
  for (const a of state.cats) {
    if (placed.has(a.id) || !home(state, a)) continue;
    const partner = partnerOf(state, a);
    if (partner === null || placed.has(partner.b.id)) continue;
    const { b, kind } = partner;
    const pa = isoScreenDir(a);
    const pb = isoScreenDir(b);
    const aLeft = pa.x < pb.x || (pa.x === pb.x && a.id < b.id);
    const gap = PAIR_GAPS[kind] * ((sizeOf(a) + sizeOf(b)) / 2);
    if (kind === "cuddle") {
      // Підсувається до того, кого гладять, з того самого боку, де лежить.
      const at = { x: pb.x + (aLeft ? -gap : gap), y: pb.y };
      placed.set(a.id, placement(kind, b, { x: at.x - pa.x, y: at.y - pa.y }, towards(aLeft)));
      continue;
    }
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const half = gap / 2;
    const shift = (p: Vec, left: boolean, front = 0): Vec => ({ x: mid.x + (left ? -half : half) - p.x, y: mid.y + front - p.y });
    // Той, хто вилизує (`a` — у його дії `groom`), — трохи ближче до камери.
    const front = kind === "groom" ? GROOM_FRONT * ((sizeOf(a) + sizeOf(b)) / 2) : 0;
    placed.set(a.id, placement(kind, b, shift(pa, aLeft, front), towards(aLeft)));
    placed.set(b.id, placement(kind, a, shift(pb, !aLeft), towards(!aLeft)));
  }
  return placed;
}

/** Новонароджені біля матері (§9.8): сплять поруч зі сплячою матір'ю — рядком перед нею, обличчям до неї. */
function nursing(state: GameState, sizeOf: SizeOf, placed: Map<number, PairPlacement>): void {
  for (const mother of state.cats) {
    if (!home(state, mother) || !asleep(mother)) continue;
    const kittens = state.cats.filter((k) => k.parents.mother === mother.id && isNewborn(k) && home(state, k) && asleep(k) && distance(k, mother) <= NEAR);
    const first = kittens[0];
    if (first === undefined) continue;
    const pm = isoScreenDir(mother);
    placed.set(mother.id, placement("nursing", first, { x: 0, y: 0 }, null));
    const n = kittens.length;
    for (const [i, kitten] of kittens.entries()) {
      const pk = isoScreenDir(kitten);
      const size = sizeOf(kitten);
      const at = { x: pm.x + (i - (n - 1) / 2) * NURSING.spacing * size, y: pm.y + NURSING.front * size };
      placed.set(kitten.id, placement("nursing", mother, { x: at.x - pk.x, y: at.y - pk.y }, towards(at.x <= pm.x)));
    }
  }
}

/** Місце кота в парі; null — кіт не в парі. Для всіх котів кадру дешевше один раз `catPairs`. */
export function pairOf(state: GameState, cat: Cat, sizeOf: SizeOf = ADULT): PairPlacement | null {
  return catPairs(state, sizeOf).get(cat.id) ?? null;
}

// --- Юрба ----------------------------------------------------------------------------------------

/**
 * Юрба (рецензія хвилі 3): сим веде всіх, хто йде по увагу чи просить, у центр клітинки персонажа, а двох біля однієї миски
 * (охоронець і злодій) — у ту саму точку, і вигляд малював їх точно одне в одному: четверо котів зливалися в одного з
 * купкою баблів і разом із баблами закривали персонажа. Тож коти, що стоять (не в парі) майже в одній точці на екрані
 * (ближче за `near`), стають рядком уздовж горизонталі екрана з кроком `step` (≈ пів кота, × розмір) довкола спільної
 * середини; а ті, хто прийшов до персонажа й стоїть біля його ніг (ближче за `person`), — обабіч нього, перший на
 * `beside` від його точки, далі з кроком `step`, і на `front` ближче до камери: інакше кіт поруч і персонаж мали той самий
 * ключ глибини (x + y), і хто з них зверху, вирішувала похибка округлення — кота, якого гладять, то було видно, то ні
 * (рецензія хвилі 3). «Біля ніг» (`person`) — уся клітинка персонажа довкола нього (≈ ±0,5 клітинки: 64 × 32 на екрані, із
 * запасом): персонаж ходить вільно й майже завжди стоїть не в центрі клітинки, а сим веде котів у центр, тож за меншої межі
 * (було 44 × 30) ті, хто прийшов до персонажа, ставали звичайним рядом довкола своєї точки, і крайній опинявся за його
 * ногами (рецензія, cats-r3-3). Двоє й більше, що їдять чи п'ють з тієї самої миски (охоронець і злодій), — обабіч неї
 * на `bowl` від її середини на екрані (троє — з кроком 2 × `bowl`), кожен лицем до миски (`CatSpot.faces`): з кроком
 * `step` довкола своєї точки голови опинялися поза мискою, а коти — спинами одне до одного (рецензія, cats-r3-2). `bowl` —
 * трохи більше, ніж голова того, хто їсть (анімація `eat`), висунута від кореня вперед (≈ 31), тож морди — лицем до лиця над
 * мискою (≈ 11 від її середини) й обидві видно; ближче голови налазили одна на одну, і від дальшого кота лишався тулуб.
 * `tie` — на скільки кожен наступний праворуч у ряду ближче до камери (сталий порядок малювання сусідів). Кіт під рукою
 * (`touched`) стає обабіч персонажа й з `touch` — ширшої смуги «біля ніг» по вертикалі екрана: гладити й гратися можна котом
 * за `REACH` + 0,6 ≈ 1,35 клітинки (до ≈ 61 угору чи вниз на екрані), і кіт ≈ 50 позаду персонажа лишався за його ногами й
 * тулубом, а кіт ≈ 50 попереду — під ногами, куди рука не дістає (доробки після хвилі 3). Одиниці арту (= px світу ізометрії).
 */
export const CROWD = { near: { x: 24, y: 14 }, person: { x: 72, y: 40 }, touch: { x: 72, y: 62 }, beside: 56, step: 36, front: 3, bowl: 42, tie: 0.5 } as const;

/** Кіт юрби: де стоїть (точка підлоги з `catSpot`, клітинки), його розмір і чи прийшов до персонажа. */
export interface CrowdMember {
  id: number;
  at: Vec;
  size: number;
  /**
   * Стає в юрбу біля ніг персонажа: прийшов до нього (`towardPerson`) чи під рукою (`touched`). Хто вже має там місце
   * (`CrowdMemory`), лишається в ній, поки стоїть біля ніг, хоч би що тепер робив: кота, якого почали гладити, сим перемикає з
   * уваги на `idle`, а того, хто відмовився, — на `wander` (рецензія хвилі 3).
   */
  toPerson: boolean;
  /** Під рукою (гладять, грається вудочкою): на своєму боці стає найближче до персонажа, щоб рука дістала. */
  touched?: boolean;
  /** Де кіт намальований зараз — зсув від `at` у клітинках (юрба минулих кадрів): з якого боку персонажа він стоїть. */
  shift?: Vec;
  /** Звідки кіт прийшов, коли стоїть точно в точці персонажа: −1 — зліва, 1 — справа (з ракурсу, яким ішов), 0 — невідомо. */
  from?: number;
  /**
   * Миска, з якої кіт їсть, п'є чи краде (дійшов до неї, `bowlOf`): її номер і точка (клітинки). Коти тієї самої миски —
   * обабіч неї (`CROWD.bowl`); біля ніг персонажа такий кіт не стає.
   */
  bowl?: { id: number; at: Vec } | null;
}

/** Місце кота в юрбі біля персонажа: бік (−1 — ліворуч, 1 — праворуч) і черга на ньому (менша — ближче до персонажа). */
export interface CrowdSlot {
  side: -1 | 1;
  order: number;
}

/**
 * Що юрба біля персонажа пам'ятає між кадрами (`catCrowds`): місце кожного кота в ній. Без цього місця роздавалися наново
 * щокадру за тим, хто де стоїть, і кіт, що вийшов із юрби чи став у неї, переставляв решту — хтось перебігав на другий бік
 * крізь персонажа (рецензія хвилі 3). `next` — черга наступного, хто стане.
 */
export interface CrowdMemory {
  slots: Map<number, CrowdSlot>;
  next: number;
}

export const crowdMemory = (): CrowdMemory => ({ slots: new Map(), next: 0 });

/** Кіт прийшов до персонажа (§9.12): просить, іде по увагу чи слідом, по корм із рук чи до ніг — як у `catFacing`. */
export function towardPerson(cat: Cat): boolean {
  const act = cat.act;
  return act.kind === "attention" || act.kind === "beg" || act.kind === "follow" || act.target === "character" || act.target === "food" || act.target === "feet";
}

/**
 * Зсуви котів юрби (`CROWD`) уздовж горизонталі екрана, у клітинках (`isoTileDir`): пише в `out` (очищає) лише тих, кого
 * треба зсунути. `person` — точка персонажа в клітинках (null — його немає вдома); `blocked` — чи клітинка, куди став би кіт,
 * зайнята (стіна, меблі): тоді кіт лишається на своєму місці. `memory` — місця юрби біля персонажа з минулого кадру
 * (оновлюється): хто вже стоїть біля ніг, той на своєму боці й у своїй черзі, новий стає з краю; без неї — усі нові.
 */
export function catCrowds(
  members: readonly CrowdMember[],
  person: Vec | null,
  blocked: (x: number, y: number) => boolean,
  out: Map<number, Vec>,
  memory: CrowdMemory = crowdMemory(),
): Map<number, Vec> {
  out.clear();
  const n = members.length;
  const slots = memory.slots;
  const screen = members.map((m) => isoScreenDir(m.at));
  const ps = person ? isoScreenDir(person) : null;
  const near = (a: Vec, b: Vec, box: { x: number; y: number }): boolean => Math.abs(a.x - b.x) < box.x && Math.abs(a.y - b.y) < box.y;
  // Біля ніг персонажа: прийшов до нього, під рукою чи вже стоїть у юрбі (і не їсть із миски).
  const byPerson = members.map(
    (m, i) => ps !== null && !m.bowl && (m.toPerson || m.touched === true || slots.has(m.id)) && near(screen[i]!, ps, m.touched === true ? CROWD.touch : CROWD.person),
  );
  // Хто вийшов із юрби біля персонажа (пішов, відійшов, персонаж сам пішов), місця більше не тримає.
  for (const id of slots.keys()) if (!members.some((m, i) => m.id === id && byPerson[i])) slots.delete(id);
  if (n === 0) return out;
  // Групи: хто майже в одній точці (ланцюжком), і окремо — хто біля ніг персонажа.
  const group = members.map((_, i) => i);
  const root = (i: number): number => {
    while (group[i] !== i) i = group[i] = group[group[i]!]!;
    return i;
  };
  const bowlId = (i: number): number | null => members[i]!.bowl?.id ?? null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (byPerson[i] !== byPerson[j]) continue;
      const sameBowl = bowlId(i) !== null && bowlId(i) === bowlId(j);
      if (sameBowl || byPerson[i] || near(screen[i]!, screen[j]!, CROWD.near)) group[root(i)] = root(j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = root(i);
    const list = groups.get(r);
    if (list) list.push(i);
    else groups.set(r, [i]);
  }
  for (const list of groups.values()) {
    const atPerson = byPerson[list[0]!] === true && ps !== null;
    if (list.length < 2 && !atPerson) continue;
    const size = list.reduce((sum, i) => sum + members[i]!.size, 0) / list.length;
    const step = CROWD.step * size;
    const target = new Map<number, number>();
    // Біля персонажа — трохи ближче до камери за нього (`CROWD.front`).
    const front = atPerson ? CROWD.front * size : 0;
    /** Зсув кота `i` (клітинки), щоб він став на `x` екрана (і на `tie` ближче до камери); null — там стіна чи меблі. */
    const shiftTo = (i: number, x: number, tie = 0): Vec | null => {
      const dx = x - screen[i]!.x;
      // Майже на одній висоті з персонажем — трохи ближче до камери; хто й так помітно перед ним чи за ним, той там і стоїть.
      const rise = atPerson ? screen[i]!.y - ps.y : 0;
      const dy = (Math.abs(rise) < front ? front - rise : 0) + tie;
      const shift = isoTileDir({ x: dx, y: dy });
      const at = members[i]!.at;
      return blocked(Math.floor(at.x + shift.x), Math.floor(at.y + shift.y)) ? null : shift;
    };
    if (atPerson) {
      // Чи вільне k-те місце (від персонажа) на боці `side` для кота `i`.
      const fits = (i: number, side: -1 | 1, k: number): boolean => shiftTo(i, ps.x + side * (CROWD.beside * size + k * step)) !== null;
      personRow(list, members, screen, ps, memory, fits);
      // Обабіч персонажа: на кожному боці — за чергою, перший на `beside` від нього.
      for (const side of SIDES) {
        const row = list.filter((i) => slots.get(members[i]!.id)?.side === side);
        row.sort((a, b) => slots.get(members[a]!.id)!.order - slots.get(members[b]!.id)!.order);
        row.forEach((i, k) => target.set(i, ps.x + side * (CROWD.beside * size + k * step)));
      }
    } else if (bowlId(list[0]!) !== null && list.every((i) => bowlId(i) === bowlId(list[0]!))) {
      // Біля однієї миски — обабіч неї. Зліва направо, як намальовані (з юрбою минулих кадрів), а з однієї точки — хто
      // дивиться праворуч, той ліворуч від миски (так він уже лицем до неї), далі — за номером.
      const drawn = (i: number): number => {
        const m = members[i]!;
        return m.shift ? isoScreenDir({ x: m.at.x + m.shift.x, y: m.at.y + m.shift.y }).x : screen[i]!.x;
      };
      list.sort((a, b) => drawn(a) - drawn(b) || (members[a]!.from ?? 0) - (members[b]!.from ?? 0) || members[a]!.id - members[b]!.id);
      const bx = isoScreenDir(members[list[0]!]!.bowl!.at).x;
      list.forEach((i, k) => target.set(i, bx + (k - (list.length - 1) / 2) * 2 * CROWD.bowl * size));
    } else {
      // Зліва направо, як стояли (за однакового x — за номером): ніхто не перебігає крізь іншого.
      list.sort((a, b) => screen[a]!.x - screen[b]!.x || members[a]!.id - members[b]!.id);
      const cx = list.reduce((sum, i) => sum + screen[i]!.x, 0) / list.length;
      list.forEach((i, k) => target.set(i, cx + (k - (list.length - 1) / 2) * step));
    }
    // Рядом уздовж горизонталі екрана коти мають той самий ключ глибини (x + y), і хто з сусідів зверху, вирішувала похибка
    // округлення зсувів: біля миски голови мінялися місцями з кадру на кадр (рецензія хвилі 3). Тож правіший — на `tie`
    // ближче до камери: на екрані непомітно, а порядок сталий (як і за рівного ключа — правіший поверх).
    const row = [...list].sort((a, b) => target.get(a)! - target.get(b)! || members[a]!.id - members[b]!.id);
    row.forEach((i, rank) => {
      const shift = shiftTo(i, target.get(i)!, rank * CROWD.tie);
      if (shift === null || (Math.abs(shift.x) < 1e-9 && Math.abs(shift.y) < 1e-9)) return;
      out.set(members[i]!.id, shift);
    });
  }
  return out;
}

const SIDES = [-1, 1] as const;

/**
 * Місця юрби біля персонажа (`CrowdMemory`): хто вже має місце, лишається на ньому. Новий стає з краю: якщо вже стоїть
 * з якогось боку персонажа — того самого (крізь персонажа не перебігає), а коли стоїть точно в його точці (сим веде всіх у
 * центр клітинки) — того, де менше котів, а порівну — звідки прийшов. Місце в стіні чи меблях (`fits`) — тоді з краю
 * другого боку. Той, кого гладять чи з ким грається персонаж, — найближчий до нього на своєму боці (рука має дістати), і
 * там лишається й потім.
 */
function personRow(
  list: readonly number[],
  members: readonly CrowdMember[],
  screen: readonly Vec[],
  ps: Vec,
  memory: CrowdMemory,
  fits: (i: number, side: -1 | 1, k: number) => boolean,
): void {
  const slots = memory.slots;
  let left = 0;
  let right = 0;
  for (const i of list) {
    const slot = slots.get(members[i]!.id);
    if (slot?.side === -1) left++;
    else if (slot) right++;
  }
  const fresh = list.filter((i) => !slots.has(members[i]!.id));
  fresh.sort((a, b) => screen[a]!.x - screen[b]!.x || members[a]!.id - members[b]!.id);
  for (const i of fresh) {
    const m = members[i]!;
    const drawn = m.shift ? isoScreenDir({ x: m.at.x + m.shift.x, y: m.at.y + m.shift.y }).x : screen[i]!.x;
    const dx = drawn - ps.x;
    const fewer = left < right ? -1 : left > right ? 1 : 0;
    const pick = Math.abs(dx) >= 1 ? Math.sign(dx) : fewer || Math.sign(m.from ?? 0) || 1;
    let side: -1 | 1 = pick < 0 ? -1 : 1;
    const other: -1 | 1 = side < 0 ? 1 : -1;
    const count = (s: -1 | 1): number => (s < 0 ? left : right);
    if (!fits(i, side, count(side)) && fits(i, other, count(other))) side = other;
    slots.set(m.id, { side, order: memory.next++ });
    if (side < 0) left++;
    else right++;
  }
  for (const i of list) {
    if (members[i]!.touched !== true) continue;
    const own = slots.get(members[i]!.id)!;
    let first = Number.POSITIVE_INFINITY;
    for (const j of list) {
      const slot = slots.get(members[j]!.id)!;
      if (j !== i && slot.side === own.side) first = Math.min(first, slot.order);
    }
    if (own.order > first) own.order = first - 1;
  }
}
