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
  // Голова того, хто вилизує, дістає до щоки друга.
  groom: 30,
  // Мисливець над тим, хто на спині.
  wrestle: 34,
  pile: 30,
  cuddle: 40,
};

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
    const shift = (p: Vec, left: boolean): Vec => ({ x: mid.x + (left ? -half : half) - p.x, y: mid.y - p.y });
    placed.set(a.id, placement(kind, b, shift(pa, aLeft), towards(aLeft)));
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
