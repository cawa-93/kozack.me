// Анімації групи «move» — пакет N4a «Персонаж — рух» (крок 16, хвиля 2). Назви й що кожна означає — `anim/ids.ts`
// (`PERSON_ANIM_GROUPS.move`), де й коли їх обирають — `anim/personanim.ts` (`personAnim`, `personEventAnim`). Формат —
// `rig/types.ts`: доріжки відносно вихідної пози ракурсу; кути — градуси за годинниковою (додатний поворот руки чи ноги —
// назад, тулуба — нахил уперед, голови — підборіддям донизу), y — донизу.
//
// Як тут влаштовано:
// - Ліктів і колін у скелета немає: рука й нога — по одному кадру. «Присісти» — ноги коротші вздовж кістки (у ракурсі ¾
//   стегна йдуть до камери) і без повороту (інакше нерівний масштаб ноги перекосив би взуття), а взуття масштабується
//   назад, щоб не плющилося; «таз назад» — нахилом тулуба.
// - Хода (`walk`, `dash`, `limp`, `trudge`, `dizzy`) рахується з кроку (`gaitTracks`): нога на підлозі йде назад рівно
//   (кісточка в системі кореня — з постійною швидкістю), таз опускається рівно настільки, щоб опорна стопа стояла на
//   підлозі, а нога в переносі коротшає, щоб не черкала підлогу. Скільки одиниць арту хода проходить за цикл —
//   `personGait`; швидкість відтворення, за якої стопи не ковзають, — `personGaitSpeed` (зі швидкості на екрані). За
//   швидкості 1 кожна хода йде номінальною швидкістю сима свого стану вздовж осі клітинки (`NOMINAL_SPEED`).
// - Персонаж у симі швидкий (4 клітинки за секунду — ≈ 2,6 свого зросту), тож ходьба — легкий підтюпцем з коротким польотом
//   і довгим кроком: інакше ноги мелькали б. Виснаження ходу не сповільнює (§6.5), а травма — лише на 0,8
//   (`ILLNESS_EFFECTS.slow`), тож «плететься» й «кульгає» — не дрібніші кроки, а важкі (`personGait`: темп не вищий, ніж у
//   ходьби за тієї самої швидкості сима).
// - Кисті (`hand-*`) кадрів не мають — лише гнізда (`held`, `rod`) і якір `hands`. У ході й стоянні кисть повертається назад
//   на кут руки й тулуба (`levelHand`, з поправкою на вкорочену руку), тож річ у руках лишається рівною.
// - НАКЛАДКИ РУК (`carry`, `holdCat`, `PERSON_OVERLAYS`) ДО ОСНОВНОЇ НЕ ДОДАЮТЬСЯ (на відміну від загального правила
//   `anim/ids.ts` про накладки), а ЗАМІНЮЮТЬ її доріжки рук і кистей: інакше розмах рук ходи й ривка підкидав би річ і кота
//   на ≈ 15–18 од. Вигляд персонажа грає ОДНУ анімацію — `personWithArms(основна, накладка, назва)` (той самий об'єкт для тієї
//   самої пари, `Rig.play` її не починає знову), а не основну плюс накладку додаванням доріжок. Несе річ — руки тримають
//   свій кут у світі (тулуб нахиляється — руки ні), річ рівно; тримає кота — руки разом із тулубом (кіт у гнізді `arms` на
//   тулубі), кисті під котом. Анімації, які самі ведуть руки (`PERSON_OWN_ARMS` з `anim/ids.ts`: вудочка, бере й опускає
//   кота, усі справи N4b), накладки не беруть. `carry` і `holdCat` у групі — лише поза рук над вихідним тулубом (для
//   реєстру й галереї). Тримає пилосос (`holdVacuum`, рішення автора 2026-11-02) — так само, але замінює лише ближню руку,
//   а щітку тримає на підлозі нахилом пилососа в кулаці (розділ «Пилосос у руках» нижче).
// - Ззаду ближня рука — з боку обличчя, дальня — з боку спини: де руки йдуть «у боки» (відмова, посковзнувся, паморочиться,
//   кульгає), ракурс `back` має ті самі кути з протилежним знаком (`sidewaysArms`), інакше рука йшла б через спину. Де рука
//   йде до грудей (вкусили, застуда), ззаду вона йде вперед і коротшає (від камери), а не назад через спину.
// - Разові закінчуються у вихідній позі: з неї м'яко повертається основна. Виняток — `pickUp`: закінчується позою «тримає
//   кота» (`holdCat`), з якої далі йде основна з накладкою. Оглушення в симі — ≈ 0,4 с, тож у «спіткнувся» й «посковзнувся»
//   головне (ноги й таз) — у перші ≈ 0,4 с, далі лише руки ловлять рівновагу.
// - Кіт біля рук (контракт для вигляду, T2). Гладить (`pet`): кота ставлять так, щоб його гніздо `pet` (спинка) було в
//   якорі `hands`. Бере й опускає (`pickUp`, `putDown`): кіт НЕ стрибає в гніздо `arms` — до `PERSON_PICKUP_GRAB_MS` він
//   стоїть на підлозі (гніздо `pet` — у точці `personCatGrip`, де кисті підхоплюють), далі вигляд веде його від місця на
//   підлозі до гнізда `arms`: корінь — lerp(місце, гніздо, w), кут — w × кут гнізда, де w = `personCatLift(anim, t)`
//   (0 — на підлозі, 1 — у руках); у `putDown` — навпаки, кіт на підлозі з `PERSON_PUTDOWN_RELEASE_MS`.

import { ILLNESS_EFFECTS, MINUTES_PER_HOUR, REAL_SECONDS_PER_GAME_HOUR, WALK_TILES_PER_MINUTE } from "../../../../sim/config";
import { PERSON_ONE_SHOT_MS, PERSON_OWN_ARMS, type PersonAnimId } from "../../../anim/ids";
import { artEntry } from "../../../art/manifest";
import type { ArtView } from "../../../art/types";
import { ISO_TILE } from "../../../world/projection";
import { PERSON_RIG } from "../../defs/person";
import { entryPoint, Rig, type ProportionRef } from "../../rigcore";
import { defineAnims, type AnimOf, type BoneOf, type BoneTracks, type Ease, type Key, type Vec2 } from "../../types";

type PersonBone = BoneOf<typeof PERSON_RIG>;
type Tracks = { [B in PersonBone]?: BoneTracks };
type PersonAnim = AnimOf<typeof PERSON_RIG>;

const DEG = Math.PI / 180;

/** Вихідна поза кістки з визначення скелета. */
function setupOf(id: PersonBone): { x: number; y: number } {
  return PERSON_RIG.bones.find((bone) => bone.id === id) ?? { x: 0, y: 0 };
}

/** Довжина ноги — від кульшового суглоба до кісточки (де стопа). */
const LEG = Math.hypot(setupOf("foot-near").x, setupOf("foot-near").y);

const round = (v: number): number => Math.round(v * 100) / 100 + 0;

/** Дробова частина (0…1). */
const frac = (v: number): number => v - Math.floor(v);

/** Ключ. */
function k<V>(t: number, v: V, ease?: Ease): Key<V> {
  return ease === undefined ? { t, v } : { t, v, ease };
}

/**
 * Поворот кисті (відносно руки), за якого гніздо кисті рівно у світі, коли рука (з усім, що над нею) повернута на `a` від
 * вихідної пози й укорочена вздовж до `sx`. Кут гнізда рахується від поперечної осі кисті (рука й кисть у вихідній позі —
 * донизу), а нерівний масштаб руки перекошує осі дитини, тож просто −a тут не годиться: поперечна вісь кисті має стати
 * туди ж, куди у вихідній позі.
 */
export function levelHand(a: number, sx = 1): number {
  return round(Math.atan2(-Math.sin(a * DEG), sx * Math.cos(a * DEG)) / DEG);
}

/** Синусоїда циклу: `u` — 0…1, `cycles` — скільки разів за цикл, `phase` — зсув у частках. */
function wave(u: number, cycles = 1, phase = 0): number {
  return Math.sin(2 * Math.PI * (u * cycles + phase));
}

/** Ключі по колу: `n` рівних відрізків за `ms`, значення — `f(u)`, u = 0…1; останній ключ — той самий, що перший. */
function loopKeys(ms: number, n: number, f: (u: number) => number): Key<number>[] {
  const keys: Key<number>[] = [];
  for (let i = 0; i < n; i++) keys.push(k(round((ms * i) / n), round(f(i / n))));
  keys.push(k(ms, round(f(0))));
  return keys;
}

function loopVecKeys(ms: number, n: number, f: (u: number) => Vec2): Key<Vec2>[] {
  const keys: Key<Vec2>[] = [];
  const at = (u: number): Vec2 => {
    const v = f(u);
    return { x: round(v.x), y: round(v.y) };
  };
  for (let i = 0; i < n; i++) keys.push(k(round((ms * i) / n), at(i / n)));
  keys.push(k(ms, at(0)));
  return keys;
}

// --- Ноги на підлозі ----------------------------------------------------------------------------

/**
 * Обидві стопи стоять на своїх місцях, а таз зсунуто на `px` уперед і ноги вкорочено до `s` (присів): кут ніг, опускання таза
 * і взуття, яке тримається рівно на підлозі й не плющиться.
 */
function plant(px: number, s = 1): { rot: number; py: number } {
  const rot = Math.asin(Math.max(-1, Math.min(1, px / (LEG * s)))) / DEG;
  return { rot, py: LEG * (1 - s * Math.cos(rot * DEG)) };
}

/** Поза ніг і таза за `plant` у вигляді значень доріжок (для ключів разових і поз). */
interface Stand {
  pelvis: Vec2;
  leg: number;
  legScale: Vec2;
  foot: number;
  footScale: Vec2;
}

function stand(px: number, s = 1, widen = 1): Stand {
  const { rot, py } = plant(px, s);
  return {
    pelvis: { x: round(px), y: round(py) },
    leg: round(rot),
    legScale: { x: s, y: widen },
    foot: round(-rot),
    footScale: { x: round(1 / widen), y: round(1 / s) },
  };
}

/** Доріжки ніг і таза з ключів поз `stand` (обидві ноги однаково). */
function standTracks(keys: readonly Key<Stand>[]): Tracks {
  const map = <V>(pick: (s: Stand) => V): Key<V>[] => keys.map((key) => k(key.t, pick(key.v), key.ease));
  const leg: BoneTracks = { rot: map((s) => s.leg), scale: map((s) => s.legScale) };
  const foot: BoneTracks = { rot: map((s) => s.foot), scale: map((s) => s.footScale) };
  return { pelvis: { pos: map((s) => s.pelvis) }, "leg-near": leg, "leg-far": leg, "foot-near": foot, "foot-far": foot };
}

// --- Хода ---------------------------------------------------------------------------------------

/**
 * Нога в ході: опора — від `on` (частка циклу) протягом `len`: стопа стає спереду під кутом `front` і йде назад до `back`
 * (градуси від вертикалі); решта циклу — перенос: нога коротшає на `lift`, носок спершу донизу на `push`, перед кроком
 * угору на `toe`; `sink` — нога в опорі підгинається.
 */
interface GaitLeg {
  on: number;
  len: number;
  front: number;
  back: number;
  lift: number;
  toe: number;
  push: number;
  /** Підгинається під вагою посеред опори: нога коротшає на стільки; стопа все одно йде рівно. */
  sink?: number;
}

interface LegState {
  rot: number;
  scale: number;
  /** Поворот стопи відносно ноги. */
  foot: number;
  stance: boolean;
}

function legAt(leg: GaitLeg, u: number): LegState {
  const d = frac(u - leg.on);
  const front = Math.sin(leg.front * DEG);
  const back = Math.sin(leg.back * DEG);
  if (d <= leg.len) {
    // Кісточка йде назад рівно: синус кута — лінійно в часі.
    const p = d / leg.len;
    const scale = 1 - (leg.sink ?? 0) * Math.sin(Math.PI * p);
    const rot = Math.asin((-front + (front + back) * p) / scale) / DEG;
    const toe = p < 0.15 ? -leg.toe * (1 - p / 0.15) ** 2 : 0;
    return { rot, scale, foot: toe - rot, stance: true };
  }
  const q = (d - leg.len) / (1 - leg.len);
  const e = (1 - Math.cos(Math.PI * q)) / 2;
  const rot = leg.back + (-leg.front - leg.back) * e;
  const world = leg.push * Math.sin(Math.PI * q) - leg.toe * q * q;
  return { rot, scale: 1 - leg.lift * Math.sin(Math.PI * q), foot: world - rot, stance: false };
}

/** Хода: ноги, підскок у польоті (`hop`, одиниці; коли обидві ноги в повітрі). */
interface Gait {
  near: GaitLeg;
  far: GaitLeg;
  hop?: number;
}

/** Скільки одиниць арту корінь проходить за цикл ходи: стопа в опорі йде назад на свій розмах за свою частку циклу. */
function strideOf(gait: Gait): number {
  const legs = [gait.near, gait.far];
  const sweep = (leg: GaitLeg): number => LEG * (Math.sin(leg.front * DEG) + Math.sin(leg.back * DEG));
  return legs.reduce((sum, leg) => sum + sweep(leg), 0) / legs.reduce((sum, leg) => sum + leg.len, 0);
}

/** Таз над опорною ногою: опускається, щоб стопа стояла на підлозі. */
function stancePelvis(gait: Gait, u: number): number | null {
  let py: number | null = null;
  for (const leg of [gait.near, gait.far]) {
    const state = legAt(leg, u);
    if (state.stance) py = Math.min(py ?? Infinity, LEG * (1 - state.scale * Math.cos(state.rot * DEG)));
  }
  return py;
}

function pelvisY(gait: Gait, u: number): number {
  const py = stancePelvis(gait, u);
  if (py !== null) return py;
  // Політ: між кінцем опори й початком наступної — дугою вгору.
  const step = 0.002;
  let back = step;
  while (back < 1 && stancePelvis(gait, u - back) === null) back += step;
  let fwd = step;
  while (fwd < 1 && stancePelvis(gait, u + fwd) === null) fwd += step;
  const a = stancePelvis(gait, u - back) ?? 0;
  const b = stancePelvis(gait, u + fwd) ?? 0;
  const g = back / (back + fwd);
  return a + (b - a) * g - (gait.hop ?? 0) * Math.sin(Math.PI * g);
}

/**
 * Доріжки ніг і таза для ходи: `cycles` циклів за `ms`, по `n` ключів на цикл. Таз ходить уперед-назад відносно кореня,
 * коли опори різної тривалості (кульгає): кісточка на підлозі все одно йде назад рівно.
 */
function gaitTracks(ms: number, n: number, gait: Gait, cycles = 1): Tracks {
  const legs = [gait.near, gait.far];
  const sweep = (leg: GaitLeg): number => LEG * (Math.sin(leg.front * DEG) + Math.sin(leg.back * DEG));
  const stride = strideOf(gait);
  // Зсув таза: в опорі ноги i — швидкість sweep / len − stride, у польоті — 0.
  const grid = 2000;
  const px: number[] = [0];
  for (let i = 0; i < grid; i++) {
    const u = (i + 0.5) / grid;
    let rate = 0;
    for (const leg of legs) if (legAt(leg, u).stance) rate = sweep(leg) / leg.len - stride;
    px.push((px[i] ?? 0) + rate / grid);
  }
  const mean = px.reduce((sum, v) => sum + v, 0) / px.length;
  const pxAt = (u: number): number => (px[Math.round(u * grid)] ?? 0) - mean;
  const cyc = (u: number): number => frac(u * cycles);
  const near = (u: number): LegState => legAt(gait.near, cyc(u));
  const far = (u: number): LegState => legAt(gait.far, cyc(u));
  const keys = n * cycles;
  const legTracks = (state: (u: number) => LegState): { leg: BoneTracks; foot: BoneTracks } => ({
    leg: { rot: loopKeys(ms, keys, (u) => state(u).rot), scale: loopVecKeys(ms, keys, (u) => ({ x: state(u).scale, y: 1 })) },
    foot: { rot: loopKeys(ms, keys, (u) => state(u).foot), scale: loopVecKeys(ms, keys, (u) => ({ x: 1, y: 1 / state(u).scale })) },
  });
  const n1 = legTracks(near);
  const f1 = legTracks(far);
  return {
    pelvis: { pos: loopVecKeys(ms, keys, (u) => ({ x: pxAt(cyc(u)), y: pelvisY(gait, cyc(u)) })) },
    "leg-near": n1.leg,
    "foot-near": n1.foot,
    "leg-far": f1.leg,
    "foot-far": f1.foot,
  };
}

/** Верх тіла по колу: тулуб, голова, руки (функції часу 0…1). Кисті тримають річ рівно: назад на кут тулуба й руки. */
interface Upper {
  torso?: (u: number) => number;
  head?: (u: number) => number;
  near?: (u: number) => number;
  far?: (u: number) => number;
  /** Плечі вгору (уздовж тулуба), одиниці. */
  shrug?: (u: number) => number;
  /** Голова вгору (уздовж шиї), одиниці. */
  neck?: (u: number) => number;
}

function upperTracks(ms: number, n: number, up: Upper): Tracks {
  const torso = up.torso ?? ((): number => 0);
  const tracks: Tracks = {};
  if (up.torso) tracks.torso = { rot: loopKeys(ms, n, up.torso) };
  if (up.head) tracks.head = { rot: loopKeys(ms, n, up.head) };
  if (up.neck) {
    const neck = up.neck;
    tracks.neck = { pos: loopVecKeys(ms, n, (u) => ({ x: neck(u), y: 0 })) };
  }
  const shrug = up.shrug;
  const arm = (f: ((u: number) => number) | undefined): BoneTracks | null => {
    if (!f && !shrug) return null;
    return {
      ...(f ? { rot: loopKeys(ms, n, f) } : {}),
      ...(shrug ? { pos: loopVecKeys(ms, n, (u) => ({ x: shrug(u), y: 0 })) } : {}),
    };
  };
  const near = arm(up.near);
  const far = arm(up.far);
  if (near) tracks["arm-near"] = near;
  if (far) tracks["arm-far"] = far;
  tracks["hand-near"] = { rot: loopKeys(ms, n, (u) => -(torso(u) + (up.near?.(u) ?? 0))) };
  tracks["hand-far"] = { rot: loopKeys(ms, n, (u) => -(torso(u) + (up.far?.(u) ?? 0))) };
  return tracks;
}

// --- Хода: числа --------------------------------------------------------------------------------

/**
 * Номінальна швидкість ходьби в симі по горизонталі екрана, одиниць арту за секунду: `WALK_TILES_PER_MINUTE` клітинок за
 * ігрову хвилину (0,75 с) уздовж осі клітинки, а вісь клітинки на екрані — півромба вбік на кожну клітинку.
 */
const NOMINAL_SPEED = (WALK_TILES_PER_MINUTE / (REAL_SECONDS_PER_GAME_HOUR / MINUTES_PER_HOUR)) * (ISO_TILE.width / 2);

/** Тривалість циклу, мс: щоб за швидкості відтворення 1 хода йшла зі швидкістю `speed`. */
const cycleMs = (gait: Gait, speed: number): number => Math.round((strideOf(gait) / speed) * 1000);

/** Ходьба — легкий підтюпцем: опора коротша за пів циклу (мить польоту з ледь помітним підскоком), довгий крок. */
const WALK_GAIT: Gait = {
  near: { on: 0, len: 0.41, front: 30, back: 30, lift: 0.2, toe: 14, push: 26 },
  far: { on: 0.5, len: 0.41, front: 30, back: 30, lift: 0.2, toe: 14, push: 26 },
  hop: 2.5,
};
const WALK_MS = cycleMs(WALK_GAIT, NOMINAL_SPEED);
const WALK_KEYS = 24;
const WALK = gaitTracks(WALK_MS, WALK_KEYS, WALK_GAIT);

/** Ривок: довгий крок із польотом (обидві ноги в повітрі), сильний нахил. */
const DASH_GAIT: Gait = {
  near: { on: 0, len: 0.3, front: 32, back: 38, lift: 0.28, toe: 10, push: 45 },
  far: { on: 0.5, len: 0.3, front: 32, back: 38, lift: 0.28, toe: 10, push: 45 },
  hop: 6,
};
const DASH_MS = 300;
const DASH_LEAN = 22;
const DASH = gaitTracks(DASH_MS, 20, DASH_GAIT);

/**
 * Кульгає на ближню ногу: на хвору ступає ненадовго, вона підгинається під вагою, а в переносі ледь відривається й не
 * працює носком; на здорову — довга опора. Травма сповільнює на `ILLNESS_EFFECTS.slow`, тож крок — не коротший за стільки
 * від кроку ходьби: темп не вищий, ніж у здорового.
 */
const LIMP_GAIT: Gait = {
  near: { on: 0, len: 0.36, front: 27, back: 32, lift: 0.04, toe: 2, push: 3, sink: 0.07 },
  far: { on: 0.36, len: 0.64, front: 32, back: 27, lift: 0.14, toe: 12, push: 18 },
};
const LIMP_MS = cycleMs(LIMP_GAIT, NOMINAL_SPEED * ILLNESS_EFFECTS.slow);
const LIMP_KEYS = 25;
const LIMP = gaitTracks(LIMP_MS, LIMP_KEYS, LIMP_GAIT);

/**
 * Плететься (виснажений): виснаження ходу не сповільнює (§6.5), тож крок не коротший за крок ходьби, але важкий — без
 * польоту й підскоку, ноги ледь відриваються (човгає) і не працюють носком, на кожному кроці провисає (`sink`).
 */
const TRUDGE_GAIT: Gait = {
  near: { on: 0, len: 0.47, front: 35, back: 35, lift: 0.06, toe: 3, push: 5, sink: 0.06 },
  far: { on: 0.5, len: 0.47, front: 35, back: 35, lift: 0.06, toe: 3, push: 5, sink: 0.06 },
};
const TRUDGE_MS = cycleMs(TRUDGE_GAIT, NOMINAL_SPEED);
const TRUDGE_KEYS = 24;
const TRUDGE = gaitTracks(TRUDGE_MS, TRUDGE_KEYS, TRUDGE_GAIT);

/**
 * Паморочиться: його видно на ходу (збій керування — §6.5; оглушення завжди накрите разовими «спіткнувся» чи
 * «посковзнувся»), тож ноги — ходьба без підскоку, з підгинанням, а хитається верх тіла. Збій керування в симі короткий
 * (`GLITCH_MINUTES` — ≈ 0,4 с, з них ≈ 0,12 с — змішування), тож характерне — у перших ≈ 0,35 с: цикл починається з
 * найбільшого нахилу, голова хилитається раз за цикл ходи (≈ 0,47 с: туди й назад за перші 0,35 с), руки розведені з
 * першого кадру; повний цикл верху — 2 цикли ходи.
 */
const DIZZY_GAIT: Gait = {
  near: { ...WALK_GAIT.near, lift: 0.14, sink: 0.05 },
  far: { ...WALK_GAIT.far, lift: 0.14, sink: 0.05 },
};
const DIZZY_CYCLES = 2;
const DIZZY_MS = cycleMs(DIZZY_GAIT, NOMINAL_SPEED) * DIZZY_CYCLES;
const DIZZY = gaitTracks(DIZZY_MS, WALK_KEYS, DIZZY_GAIT, DIZZY_CYCLES);

/** Ходи: ті, де стопи йдуть по підлозі. */
export type PersonGait = "walk" | "dash" | "limp" | "trudge" | "dizzy";

/** Хода: скільки одиниць арту корінь проходить за анімацію (`stride`) за її тривалість (`ms`) і частки опори кожної ноги. */
export interface PersonGaitInfo {
  stride: number;
  ms: number;
  /** Циклів ходи за анімацію. */
  cycles: number;
  /** Опора ближньої й дальньої ноги в першому циклі: [початок, кінець), частки циклу. */
  near: readonly [number, number];
  far: readonly [number, number];
}

function gaitInfo(gait: Gait, ms: number, cycles = 1): PersonGaitInfo {
  return {
    stride: round(strideOf(gait) * cycles),
    ms,
    cycles,
    near: [gait.near.on, gait.near.on + gait.near.len],
    far: [gait.far.on, gait.far.on + gait.far.len],
  };
}

/** Ходи персонажа: крок і тривалість. */
const GAITS: Readonly<Record<PersonGait, PersonGaitInfo>> = {
  walk: gaitInfo(WALK_GAIT, WALK_MS),
  dash: gaitInfo(DASH_GAIT, DASH_MS),
  limp: gaitInfo(LIMP_GAIT, LIMP_MS),
  trudge: gaitInfo(TRUDGE_GAIT, TRUDGE_MS),
  dizzy: gaitInfo(DIZZY_GAIT, DIZZY_MS, DIZZY_CYCLES),
};

/**
 * Хода персонажа: крок, тривалість і опори (для `personGaitSpeed`, тестів і звуку кроків). Модуль анімацій експортує
 * об'єктом лише групу (`PERSON_MOVE`): будь-який інший об'єкт тести й галерея вважали б групою анімацій.
 */
export function personGait(gait: PersonGait): PersonGaitInfo {
  return GAITS[gait];
}

/**
 * Найменша частка темпу ходи від «швидкості по підлозі», коли персонаж іде здебільшого вгору чи вниз екрана: тоді стопи
 * (вони ходять лише вбік) і так ковзають, а темп має лишатися живим.
 */
const GAIT_MIN_SHARE = 0.7;

/**
 * Швидкість відтворення ходи (`PersonAnimParams.speed`) зі швидкості персонажа на екрані (`vx`, `vy` — одиниць арту за
 * секунду). Стопи ходять лише вбік екрана, тож по горизонталі вони не ковзають: темп — за `|vx|`. А щоб на русі вгору чи
 * вниз ноги не стояли, темп не нижчий за `GAIT_MIN_SHARE` від швидкості по підлозі (вертикаль ромба стиснута вдвічі —
 * розтягуємо назад): 4 клітинки за секунду вправо — 362 од./с, уздовж осі клітинки — 256 по горизонталі, угору — 0,7 × 362.
 */
export function personGaitSpeed(gait: PersonGait, vx: number, vy: number): number {
  const ground = Math.hypot(vx, (vy * ISO_TILE.width) / ISO_TILE.height);
  const along = Math.max(Math.abs(vx), GAIT_MIN_SHARE * ground);
  const info = GAITS[gait];
  return (along * info.ms) / (1000 * info.stride);
}

// --- Руки з річчю й котом -----------------------------------------------------------------------

/** Поза рук: кути рук (відносно вихідної) і наскільки рука коротша (зігнута до камери). */
interface Arms {
  near: number;
  far: number;
  nearScale?: number;
  farScale?: number;
}

/**
 * Тримає кота перед собою: ближня рука навскіс під котом, дальня зігнута під ним з того боку. Ззаду кіт за тулубом (гніздо
 * `arms` визирає з-за плеча), тож ближня рука коротка (зігнута до камери) і кисть — під грудьми кота.
 */
const HOLD: Arms = { near: -62, far: -50, farScale: 0.78 };
const HOLD_BACK: Arms = { near: -16, far: -40, nearScale: 0.55, farScale: 0.85 };
/**
 * Несе річ: ближня рука вперед (річ на долоні — гніздо `held`), дальня підтримує знизу. Ззаду річ перед персонажем — від
 * камери: ближня рука коротка (іде вглиб) і майже донизу, тож річ визирає з-за правого краю тулуба на рівні грудей, як
 * спереду (а не збоку на рівні стегна); кисть рівно — `levelHand` з поправкою на вкорочення.
 */
const CARRY: Arms = { near: -52, far: -44, farScale: 0.85 };
const CARRY_BACK: Arms = { near: -24, far: -36, nearScale: 0.72, farScale: 0.85 };

/** Накладки рук: поза спереду й ззаду; `level` — руки тримають свій кут у світі (річ рівно), інакше — разом із тулубом. */
const ARMS_OVERLAYS = {
  carry: { front: CARRY, back: CARRY_BACK, level: true },
  holdCat: { front: HOLD, back: HOLD_BACK, level: false },
} as const satisfies Partial<Record<PersonAnimId, { front: Arms; back: Arms; level: boolean }>>;

/** Накладка рук персонажа. */
export type PersonArmsOverlay = keyof typeof ARMS_OVERLAYS;

/**
 * Поза рук накладки в ракурсі `view`: з нею стикуються справи, що починаються чи закінчуються з річчю або котом у руках
 * (N4b, `chores.ts`). Функція, а не об'єкт: експортовані об'єкти файлу анімацій — групи анімацій.
 */
export function personArmsPose(id: PersonArmsOverlay, view: ArtView): Readonly<Arms> {
  return ARMS_OVERLAYS[id][view];
}

/**
 * Доріжки рук і кистей у позі `arms` над тулубом, що повертається за ключами `torso`: `level` — руки тримають кут у світі
 * (противага тулуба з тими самими часами й переходами — точна в кожен момент), а кисть — рівно у світі (річ рівно);
 * інакше руки й кисті нерухомі відносно тулуба — разом із котом у гнізді `arms`. Кисть в обох випадках — назад на кут
 * пози руки (`levelHand`).
 */
function armsTracks(arms: Arms, torso: readonly Key<number>[] | undefined, level: boolean): Tracks {
  const keys = level && torso && torso.length > 0 ? torso : [k(0, 0)];
  const arm = (a: number): Key<number>[] => keys.map((key) => k(key.t, round(a - key.v), key.ease));
  const hand = (a: number, sx: number | undefined): Key<number>[] => [k(0, levelHand(a, sx))];
  const scale = (by: number | undefined): Key<Vec2>[] => [k(0, { x: by ?? 1, y: 1 })];
  const still: Key<Vec2>[] = [k(0, { x: 0, y: 0 })];
  return {
    "arm-near": { rot: arm(arms.near), pos: still, scale: scale(arms.nearScale) },
    "hand-near": { rot: hand(arms.near, arms.nearScale), pos: still, scale: scale(undefined) },
    "arm-far": { rot: arm(arms.far), pos: still, scale: scale(arms.farScale) },
    "hand-far": { rot: hand(arms.far, arms.farScale), pos: still, scale: scale(undefined) },
  };
}

/** Накладка рук як анімація (для реєстру й галереї): поза рук над вихідним тулубом. */
function armsOverlay(id: PersonArmsOverlay): PersonAnim {
  const spec = ARMS_OVERLAYS[id];
  return {
    duration: 2400,
    loop: true,
    bones: armsTracks(spec.front, undefined, spec.level),
    views: { back: { bones: armsTracks(spec.back, undefined, spec.level) } },
  };
}

/** Кістки рук і кистей — їх замінює накладка. */
const ARM_BONES: ReadonlySet<string> = new Set<PersonBone>(["arm-near", "arm-far", "hand-near", "hand-far"]);

function withoutArms(bones: Readonly<Tracks> | undefined): Tracks {
  const out: Tracks = {};
  for (const [id, track] of Object.entries(bones ?? {}) as [PersonBone, BoneTracks][]) if (!ARM_BONES.has(id)) out[id] = track;
  return out;
}

// --- Пилосос у руках ----------------------------------------------------------------------------
//
// Рішення автора 2026-11-02 (GAME_DESIGN §8.7, «Пилосос у руках»): вертикальний пилосос беруть у руки, як будь-яку річ, і
// ходять із ним квартирою. Накладка рук `holdVacuum`: ближня рука тримає ручку (кадр `item/vacuum` у гнізді `held`, pivot —
// хват), щітка — на підлозі попереду; дальня рука — як в основній (махає в ході, розводить руками, відмовляючи). Кут ближньої
// руки тримається у світі, хоч би як нахилявся тулуб (як «несе»). Хода й ривок підкидають таз, а з ним плече й кулак, тож
// кисть повертає пилосос довкола кулака рівно настільки, щоб щітка лишалася на підлозі: ковзає нею, а ручка ходить
// угору-вниз (`vacuumTilts`).

/**
 * Кут ближньої руки з пилососом (відносно вихідної, «−» — уперед), окремо для ракурсів: спереду кулак перед животом
 * (≈ 64 над підлогою), ззаду рука йде вглиб, тож майже донизу — кулак біля стегна праворуч від тулуба.
 */
const VACUUM_ARM: Readonly<Record<ArtView, number>> = { front: -40, back: -22 };

/**
 * Щітка від хвату за замовчуванням (поки кадру `item/vacuum` немає): спереду щітка ближче до камери — нижче на екрані, ззаду
 * — далі від неї, вище.
 */
const VACUUM_BRUSH: Readonly<Record<ArtView, Vec2>> = { front: { x: 58, y: 76 }, back: { x: 49, y: 50 } };

/** Підлога попереду в умовному ¾ скелета (як `FWD_X`, `FWD_Y` справ, N4b): на одиницю праворуч — на стільки нижче (спереду). */
const FLOOR_SLOPE = 0.3 / 0.85;

/**
 * Найбільший нахил пилососа в кулаці, градуси: далі щітка вже відривається від підлоги (присів, упав). Ззаду хода й ривок
 * нахиляють тулуб уперед, плече з кулаком іде вниз і вперед, і пилосос там лягає пологіше на 6–28° (спереду — ±2…6°).
 */
const VACUUM_TILT_MAX = 28;

/**
 * Кулак над ручкою пилососа: ближня рука (12) — над гніздом `held` (12,5), як у справі «пилососить» (`OVER_HELD`, N4b). Ззаду
 * гніздо й так за тулубом.
 */
const VACUUM_SLOTS = { "arm-near": { z: [k(0, 13)] } } as const;

/**
 * Щітка пилососа відносно хвату в ракурсі `view`: точка `brush` (ззаду — `brush-back`) кадру `item/vacuum` від його pivot
 * (одиниці арту, обличчям праворуч, пилосос рівно). Без кадру — `VACUUM_BRUSH`. Функція, а не об'єкт: експортовані об'єкти
 * файлу анімацій — групи анімацій.
 */
export function personVacuumBrush(view: ArtView): Vec2 {
  const entry = artEntry("item/vacuum");
  const point = entryPoint(entry, "brush", view);
  return entry && point ? { x: point.x - entry.pivot.x, y: point.y - entry.pivot.y } : { ...VACUUM_BRUSH[view] };
}

/**
 * Ближня рука й кисть із пилососом над тулубом, що повертається за ключами `torso`: рука тримає кут у світі (противага
 * тулуба), кисть — пилосос рівно, плюс нахил `tilts` (ключі, градуси) довкола кулака.
 */
function vacuumTracks(view: ArtView, torso: readonly Key<number>[] | undefined, tilts: readonly Key<number>[]): Tracks {
  const a = VACUUM_ARM[view];
  const keys = torso && torso.length > 0 ? torso : [k(0, 0)];
  const still: Key<Vec2>[] = [k(0, { x: 0, y: 0 })];
  const one: Key<Vec2>[] = [k(0, { x: 1, y: 1 })];
  return {
    "arm-near": { rot: keys.map((key) => k(key.t, round(a - key.v), key.ease)), pos: still, scale: one },
    "hand-near": { rot: tilts.map((key) => k(key.t, round(levelHand(a) + key.v), key.ease)), pos: still, scale: one },
  };
}

/** Ближня рука й кисть — їх замінює накладка з пилососом (дальня — від основної). */
const NEAR_BONES: ReadonlySet<string> = new Set<PersonBone>(["arm-near", "hand-near"]);

function withoutNear(bones: Readonly<Tracks> | undefined): Tracks {
  const out: Tracks = {};
  for (const [id, track] of Object.entries(bones ?? {}) as [PersonBone, BoneTracks][]) if (!NEAR_BONES.has(id)) out[id] = track;
  return out;
}

/** Основна `base` з пилососом у ближній руці й нахилом `tilts` (за ракурсами). */
function vacuumOver(base: PersonAnim, tilts: Readonly<Record<ArtView, readonly Key<number>[]>>): PersonAnim {
  const back = base.views?.back;
  const torsoFront = base.bones?.torso?.rot;
  const torsoBack = back?.bones?.torso?.rot ?? torsoFront;
  return {
    ...base,
    bones: { ...withoutNear(base.bones), ...vacuumTracks("front", torsoFront, tilts.front) },
    views: { ...base.views, back: { ...back, bones: { ...withoutNear(back?.bones), ...vacuumTracks("back", torsoBack, tilts.back) } } },
    slots: { ...base.slots, "arm-near": { ...base.slots?.["arm-near"], ...VACUUM_SLOTS["arm-near"] } },
  };
}

/** Без нахилу: пилосос рівно в кулаці. */
const NO_TILT: Readonly<Record<ArtView, readonly Key<number>[]>> = { front: [k(0, 0)], back: [k(0, 0)] };

/**
 * Нахил пилососа в кулаці (градуси, «−» — щіткою вгору) у ключах по всій основній, для кожного ракурсу: щітка на лінії
 * підлоги попереду, що йде через неї ж у вихідній позі накладки (`holdVacuum` над вихідним тілом) з нахилом підлоги ракурсу
 * (`FLOOR_SLOPE`: спереду праворуч — нижче, ззаду — вище). Поза — зі скелета за числами визначення (вони дають ту саму позу,
 * що й точки арту), як `personCatGrip`.
 */
function vacuumTilts(base: PersonAnim): Record<ArtView, Key<number>[]> {
  const probe = vacuumOver(base, NO_TILT);
  const rest = vacuumOver({ duration: 1, loop: true }, NO_TILT);
  const n = base.duration > 1200 ? 36 : 24;
  const out = {} as Record<ArtView, Key<number>[]>;
  for (const view of ["front", "back"] as const) {
    const brush = personVacuumBrush(view);
    const slope = view === "front" ? FLOOR_SLOPE : -FLOOR_SLOPE;
    const rig = new Rig(PERSON_RIG, { facing: { view, flip: false } });
    rig.play(rest, 0, { blend: 0 });
    rig.evaluate(0);
    const r = rig.socket("held", undefined, false);
    const x0 = (r?.x ?? 0) + brush.x;
    const y0 = (r?.y ?? 0) + brush.y;
    rig.play(probe, 0, { blend: 0, restart: true });
    const keys: Key<number>[] = [];
    for (let i = 0; i <= n; i++) {
      const t = round((base.duration * i) / n);
      rig.evaluate(t);
      const s = rig.socket("held", undefined, false);
      if (!s) continue;
      // Щітка після повороту на d (радіани) довкола кулака — і як далеко вона від лінії підлоги.
      const miss = (d: number): number => {
        const a = s.rot * DEG + d;
        const bx = s.x + brush.x * Math.cos(a) - brush.y * Math.sin(a);
        const by = s.y + brush.x * Math.sin(a) + brush.y * Math.cos(a);
        return by - (y0 + slope * (bx - x0));
      };
      let d = 0;
      for (let step = 0; step < 4; step++) {
        const m = miss(d);
        const dm = (miss(d + 1e-3) - m) / 1e-3;
        if (Math.abs(dm) < 1e-6) break;
        d -= m / dm;
      }
      const deg = Math.max(-VACUUM_TILT_MAX, Math.min(VACUUM_TILT_MAX, d / DEG));
      keys.push(k(t, round(deg), "linear"));
    }
    out[view] = keys;
  }
  return out;
}

/** Накладка «тримає пилосос» для реєстру й галереї: пилосос рівно над вихідним тілом. */
function vacuumOverlay(): PersonAnim {
  return vacuumOver({ duration: 2400, loop: true }, NO_TILT);
}

// --- Присідання й пози всього тіла --------------------------------------------------------------

/** Присів біля кота: ноги коротші (стегна до камери) й без повороту — взуття рівно; «таз назад» — нахилом тулуба. */
const SQUAT = stand(0, 0.54, 1.1);
/** Ззаду кіт вище на екрані (далі від камери) — присідає менше. */
const SQUAT_BACK = stand(0, 0.8, 1.05);

/**
 * Гладить: присів глибоко й нахилився, кисть ≈ на 28 од. над підлогою (спереду) — між спинкою дорослого кота (≈ 32) і
 * кошеняти (≈ 17…24), тож кіт, чия спинка під кистю, стоїть лише на ≈ 4 од. нижче на екрані (дорослий) чи на ≈ 4…11 вище
 * (кошеня), ніж ноги персонажа, — на підлозі поруч, а не висить і не відходить углиб. Ззаду кіт перед персонажем — від камери, вище на екрані: кисть вища (≈ 36), і кіт будь-якого
 * зросту стоїть за ним.
 */
interface PetPose {
  legs: Stand;
  torso: number;
  head: number;
  near: number;
  far: number;
  farScale: number;
}
const PET: PetPose = { legs: stand(0, 0.47, 1.12), torso: 51, head: -24, near: -64, far: -22, farScale: 0.74 };
const PET_BACK: PetPose = { legs: SQUAT_BACK, torso: 26, head: -6, near: -50, far: -14, farScale: 0.8 };

/** Гладить: присів, рука гладить уздовж спинки (±9°), плече й тулуб ледь ідуть за рукою, голова дивиться на кота. */
function petTracks(p: PetPose): Tracks {
  const far = (u: number): number => p.far + 3 * wave(u, 1, 0.1);
  return {
    ...standTracks([k(0, p.legs)]),
    ...upperTracks(1000, 10, {
      torso: (u) => p.torso - 3 * wave(u),
      head: (u) => p.head + 4 * wave(u, 1, -0.05),
      near: (u) => p.near + 9 * wave(u),
      far,
    }),
    "arm-far": { rot: loopKeys(1000, 10, far), scale: [k(0, { x: p.farScale, y: 1 })] },
  };
}

/** Поза всього тіла в ключі разової: ноги, тулуб, голова, руки. */
interface BodyPose {
  t: number;
  legs: Stand;
  torso: number;
  head: number;
  arms: Arms;
  ease?: Ease;
}

/** Доріжки з поз `BodyPose`: кисті — противагою тулуба й руки (кіт у руках і кисті рівно). */
function bodyTracks(poses: readonly BodyPose[]): Tracks {
  const map = <V>(pick: (p: BodyPose) => V): Key<V>[] => poses.map((p) => k(p.t, pick(p), p.ease));
  const scale = (by: number | undefined): Vec2 => ({ x: by ?? 1, y: 1 });
  return {
    ...standTracks(map((p) => p.legs)),
    torso: { rot: map((p) => p.torso) },
    head: { rot: map((p) => p.head) },
    "arm-near": { rot: map((p) => p.arms.near), scale: map((p) => scale(p.arms.nearScale)) },
    "hand-near": { rot: map((p) => levelHand(p.torso + p.arms.near, p.arms.nearScale)) },
    "arm-far": { rot: map((p) => p.arms.far), scale: map((p) => scale(p.arms.farScale)) },
    "hand-far": { rot: map((p) => levelHand(p.torso + p.arms.far, p.arms.farScale)) },
  };
}

const STAND = stand(0);
const REST: Arms = { near: 0, far: 0 };

// --- Разові -------------------------------------------------------------------------------------

const ONE = PERSON_ONE_SHOT_MS;

/**
 * Ззаду ближня рука — з боку обличчя, а дальня — з боку спини, тож рух рук «у боки» (розвести руками, ловити рівновагу) там
 * — з протилежним знаком кута: інакше ближня рука ззаду йшла б навскіс через спину. Лише руки (`arm-*`) разових без кистей.
 */
function sidewaysArms(anim: PersonAnim): PersonAnim {
  const back: Tracks = {};
  for (const id of ["arm-near", "arm-far"] as const) {
    const track = anim.bones?.[id];
    if (track?.rot) back[id] = { ...track, rot: track.rot.map((key) => ({ ...key, v: -key.v + 0 })) };
  }
  return { ...anim, views: { ...anim.views, back: { ...anim.views?.back, bones: { ...anim.views?.back?.bones, ...back } } } };
}

/** Лише руки й кисті з доріжок верху тіла (перевизначення ракурсу ззаду). */
function armsOnly(tracks: Tracks): Tracks {
  const out: Tracks = {};
  for (const id of ["arm-near", "arm-far", "hand-near", "hand-far"] as const) {
    const track = tracks[id];
    if (track) out[id] = track;
  }
  return out;
}

/**
 * Паморочиться: тулуб з найбільшого нахилу вперед хитається назад і знову вперед (раз за анімацію, з неправильністю) і
 * пружинить на кроках; голова хилитається раз за цикл ходи із запізненням — від закинутої до звислої; руки широко в боки
 * ловлять рівновагу й махають кожна своєю фазою.
 */
const dizzyTorso = (u: number): number => 5 + 9 * Math.cos(2 * Math.PI * u) + 2.5 * wave(u, DIZZY_CYCLES, 0.1) + 1.2 * wave(u, DIZZY_CYCLES * 2, 0.25);
const dizzyHead = (u: number): number => -16 * Math.cos(2 * Math.PI * (u * DIZZY_CYCLES - 0.03)) - 3;
const dizzyNear = (u: number): number => 32 + 16 * wave(u, DIZZY_CYCLES, 0.05);
const dizzyFar = (u: number): number => -34 + 14 * wave(u, DIZZY_CYCLES, 0.4);
/** Кульгає: тулуб западає вперед на хворій нозі, ближня рука — в бік. */
const limpTorso = (u: number): number => 5 + 12 * bump(u, 0.02, 0.4);
const limpArm = (u: number): number => 14 + 12 * bump(u, 0.04, 0.4);
const limpFar = (u: number): number => -12 + 10 * wave(u, 1, 0.3);

/** Застуда: ссутулений тулуб тремтить, плечі підняті (змерз) і тремтять, на шмиганні здригаються. */
const sickTorso = (u: number): number => 9 + shiver(u) + 0.8 * breath(u) - 2 * wipe(u);
const sickShrug = (u: number): number => 3 + 2 * sniff(u, 0.62) + 1.2 * sniff(u, 0.7) + 0.7 * Math.abs(shiver(u));
/**
 * Застуда, ближня рука: спереду — навхрест грудей (обхопив себе), на витиранні — рукавом до носа й тре; ззаду — щільно
 * біля боку, трохи вперед (коротка — від камери), на витиранні лише ледь підіймається: обличчя не видно, а рука, піднята
 * вперед до нього, зі спини читалася б як «показує пальцем» — шмигання там видно з голови й плечей. Кут і вкорочення.
 */
const sickNear = (u: number): number => -64 + 0.8 * shiver(u) + (-30 + 5 * wave(u, 10)) * wipe(u);
const sickNearScale = (u: number): number => 0.72 - 0.04 * wipe(u);
const sickNearBack = (u: number): number => -20 + 0.8 * shiver(u) + (-10 + 3 * wave(u, 10)) * wipe(u);
const sickNearBackScale = (u: number): number => 0.72 - 0.08 * wipe(u);

/** Вкусили: відсахнувся назад над стопами. */
const BITTEN_BACK = stand(-3);
/**
 * Вкусили: ближню руку смикає й трусить (часи й сила 0…1): спереду — назад від кота, ззаду (кіт перед персонажем, від
 * камери) — до грудей: уперед і коротша, щоб не тицяла в кота й не йшла через спину.
 */
const BITTEN_JERK: readonly (readonly [number, number])[] = [
  [0, 0],
  [90, 1],
  [170, 0.69],
  [240, 0.96],
  [320, 0.72],
  [420, 0.52],
  [ONE.bitten, 0],
];
/** Вкусили: плечі різко вгору й голова втягується (переляк видно й зі спини). */
const BITTEN_SHRUG: readonly Key<Vec2>[] = [k(0, { x: 0, y: 0 }, "out"), k(80, { x: 4, y: 0 }, "inOut"), k(300, { x: 1.5, y: 0 }, "inOut"), k(ONE.bitten, { x: 0, y: 0 })];
const BITTEN_NECK: readonly Key<Vec2>[] = [k(0, { x: 0, y: 0 }, "out"), k(80, { x: -3, y: 0 }, "inOut"), k(320, { x: -0.8, y: 0 }, "inOut"), k(ONE.bitten, { x: 0, y: 0 })];
const bittenKeys = <V>(f: (by: number) => V): Key<V>[] => BITTEN_JERK.map(([t, by], i) => k(t, f(by), i === 0 ? "out" : "inOut"));
/** Спіткнувся: таз над стопами — пірнає вперед і повертається. */
const TRIP = [stand(0), stand(7), stand(9), stand(2)] as const;

/** Бере й опускає кота: присів, тулуб нахилено, обидві руки внизу біля підлоги (як у `pet`, кисті — до кота). */
const REACH: Arms = { near: -65, far: -55 };
const REACH_BACK: Arms = { near: -45, far: -38, nearScale: 0.85 };
const REACH_TORSO = 45;
const REACH_TORSO_BACK = 28;

/**
 * Мить «підхопив» у `pickUp`, мс: кисті на коті, що стоїть на підлозі (ближня — на спинці, дальня — під грудьми); до неї кіт
 * стоїть на підлозі, з неї вигляд веде його в гніздо `arms` (`personCatLift`).
 */
export const PERSON_PICKUP_GRAB_MS = 210;
/** Мить «відпустив» у `putDown`, мс: та сама поза, що «підхопив»; з неї кіт стоїть на підлозі, руки йдуть від нього. */
export const PERSON_PUTDOWN_RELEASE_MS = 180;

/** Поза «підхопив» / «відпустив»: присів, нахилився, кисті біля кота на підлозі. */
const GRAB: Omit<BodyPose, "t"> = { legs: SQUAT, torso: REACH_TORSO - 4, head: -16, arms: { near: -67, far: -57 } };
const GRAB_BACK: Omit<BodyPose, "t"> = { legs: SQUAT_BACK, torso: REACH_TORSO_BACK - 3, head: -5, arms: { ...REACH_BACK, near: REACH_BACK.near - 2 } };

/** Плавно 0…1 (smoothstep). */
function smooth(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/**
 * Скільки кіт «у руках» у мить `t` (мс) разової `pickUp` чи `putDown`: 0 — стоїть на підлозі на своєму місці, 1 — у гнізді
 * `arms`. Вигляд ставить корінь кота в lerp(місце на підлозі, гніздо `arms`, w), а кут — w × кут гнізда: так кіт не
 * стрибає в гніздо (на ≈ 45 од. угору) і не висить носом донизу, поки тулуб нахилений. `pickUp`: 0 до
 * `PERSON_PICKUP_GRAB_MS`, далі плавно до 1 наприкінці (кіт піднімається разом із руками). `putDown`: з 1 на початку
 * плавно до 0 у `PERSON_PUTDOWN_RELEASE_MS`, далі 0.
 */
export function personCatLift(anim: "pickUp" | "putDown", t: number): number {
  if (anim === "pickUp") return smooth((t - PERSON_PICKUP_GRAB_MS) / (ONE.pickUp - PERSON_PICKUP_GRAB_MS));
  return 1 - smooth(t / PERSON_PUTDOWN_RELEASE_MS);
}

const GRIPS = new Map<string, Vec2>();

/**
 * Де кисті підхоплюють кота: якір `hands` у мить `PERSON_PICKUP_GRAB_MS` (у `putDown` у мить `PERSON_PUTDOWN_RELEASE_MS` —
 * та сама поза) у системі кореня, обличчям праворуч (ліворуч — x з протилежним знаком), для скелета за числами визначення
 * (вони дають ту саму позу, що й точки еталонів) і пропорцій статури `proportions`. Кота на підлозі вигляд ставить так,
 * щоб його гніздо `pet` (спинка) було тут, — як у `pet`; тоді дальня кисть — під грудьми кота.
 */
export function personCatGrip(view: ArtView, proportions: readonly ProportionRef[] = []): Vec2 {
  const key = `${view} ${JSON.stringify(proportions)}`;
  let grip = GRIPS.get(key);
  if (!grip) {
    const rig = new Rig(PERSON_RIG, { facing: { view, flip: false }, proportions });
    rig.play(PERSON_MOVE.pickUp, 0, { blend: 0 });
    rig.evaluate(PERSON_PICKUP_GRAB_MS);
    const at = rig.anchor("hands", { x: 0, y: 0 }, false);
    grip = { x: round(at?.x ?? 0), y: round(at?.y ?? 0) };
    GRIPS.set(key, grip);
  }
  return { ...grip };
}

export const PERSON_MOVE = defineAnims(PERSON_RIG, {
  /**
   * Стоїть: дихає (плечі й голова ледь угору), повільно переносить вагу з ноги на ногу (стопи на місці) і трохи хитає
   * головою.
   */
  idle: {
    duration: 4800,
    loop: true,
    bones: {
      ...standLoop(4800, 16, (u) => 1.6 * wave(u)),
      ...upperTracks(4800, 16, {
        torso: (u) => -0.6 * wave(u) - 0.5 * breath(u),
        head: (u) => 1.5 * wave(u, 1, 0.2) + 0.4 * breath(u),
        near: (u) => 1.2 * wave(u, 1, 0.1),
        far: (u) => 1.2 * wave(u, 1, 0.1),
        shrug: (u) => 0.7 * breath(u),
        neck: (u) => 0.4 * breath(u),
      }),
    },
  },

  /**
   * Іде (легкий підтюпцем): ноги ходою (`WALK_GAIT`), руки широко навхрест із ногами, тулуб уперед і пружинить двічі за
   * цикл, голова тримається рівно з легким запізненням.
   */
  walk: {
    duration: WALK_MS,
    loop: true,
    bones: {
      ...WALK,
      ...upperTracks(WALK_MS, WALK_KEYS, {
        torso: (u) => 7.5 + 1.5 * wave(u, 2, 0.25),
        head: (u) => -4.5 + 1.8 * wave(u, 2, 0.1),
        near: (u) => -5 + 22 * wave(u, 1, 0.22),
        far: (u) => -5 - 22 * wave(u, 1, 0.22),
      }),
    },
  },

  /**
   * Ривок: сильно нахилений уперед, довгий крок із польотом, руки широко працюють (уперед більше, ніж назад), голова
   * тягнеться вперед. Ривок короткий (≈ 0,2 с), тож поза сильна з першого кадру.
   */
  dash: {
    duration: DASH_MS,
    loop: true,
    bones: {
      ...DASH,
      ...upperTracks(DASH_MS, 20, {
        torso: (u) => DASH_LEAN + 2 * wave(u, 2, 0.3),
        head: (u) => -14 + 2 * wave(u, 2, 0.15),
        near: (u) => -DASH_LEAN - 12 + 36 * wave(u, 1, 0.25),
        far: (u) => -DASH_LEAN - 12 - 36 * wave(u, 1, 0.25),
      }),
    },
  },

  /**
   * Несе річ (накладка рук): руки перед собою, річ на долоні — рівно. Тут — лише поза рук над вихідним тулубом (для реєстру
   * й галереї); у грі — тільки `personWithArms(основна, "carry")`, де руки ще й тримають свій кут у світі, коли тулуб
   * нахиляється. Додавати доріжки до основної не можна: розмах рук підкидав би річ.
   */
  carry: armsOverlay("carry"),

  /**
   * Тримає кота перед собою (накладка рук): руки під котом, нерухомо відносно тулуба. Тут — лише поза рук (для реєстру й
   * галереї); у грі — тільки `personWithArms(основна, "holdCat")`.
   */
  holdCat: armsOverlay("holdCat"),

  /**
   * Тримає вертикальний пилосос (накладка рук; рішення автора 2026-11-02, GAME_DESIGN §8.7): ближня рука на ручці, щітка на
   * підлозі попереду, кулак над ручкою. Тут — лише поза над вихідним тілом (для реєстру й галереї); у грі — тільки
   * `personWithArms(основна, "holdVacuum")`, де дальня рука від основної, а пилосос хилиться в кулаці так, щоб щітка не
   * відривалася від підлоги.
   */
  holdVacuum: vacuumOverlay(),

  /**
   * Гладить кота на підлозі: присів глибоко, нахилився, ближня рука вперед і вниз — на спинці кота — і гладить уздовж
   * спинки, плече й тулуб ледь ідуть за рукою; дальня рука спирається вниз, голова дивиться на кота. Кота вигляд ставить
   * так, щоб його гніздо `pet` було в якорі `hands` (`PET`: спереду кисть ≈ 28 над підлогою — дорослий кіт стоїть на
   * ≈ 4 од. нижче на екрані, ніж ноги персонажа, кошеня — на ≈ 4…11 вище). Ззаду кіт вище на екрані — присідає менше.
   */
  pet: {
    duration: 1000,
    loop: true,
    bones: petTracks(PET),
    views: { back: { bones: petTracks(PET_BACK) } },
  },

  /**
   * Грається вудочкою: ближня рука витягнута вперед, кисть малими колами водить паличкою (пір'їнка кружляє над котом), тулуб
   * трохи вперед, голова дивиться вниз на кота, тіло ледь пружинить у такт. Руки веде сама (`PERSON_OWN_ARMS`): іграшку
   * вигляд чіпляє в гніздо `rod`, накладки рук немає.
   */
  rod: {
    duration: 1200,
    loop: true,
    bones: {
      ...standLoop(1200, 12, (u) => 0.8 * wave(u, 2)),
      ...upperTracks(1200, 12, {
        torso: (u) => 6 + 1 * wave(u, 2, 0.1),
        head: (u) => 10 + 1.5 * wave(u, 2),
        near: (u) => -80 + 7 * wave(u),
        far: (u) => -10 + 2 * wave(u, 1, 0.3),
      }),
      "hand-near": { rot: loopKeys(1200, 12, (u) => 74 - 7 * wave(u) + 16 * wave(u, 2, 0.15)) },
    },
  },

  /**
   * Паморочиться (збій керування на ходу): ноги йдуть, підгинаючись; з першого кадру нахилений, руки широко в боки — ловить
   * рівновагу; тулуб хитається назад і вперед, голова хилитається із запізненням. Хода — `personGait("dizzy")` (темп той
   * самий, що в ходьби).
   */
  dizzy: {
    duration: DIZZY_MS,
    loop: true,
    bones: {
      ...DIZZY,
      ...upperTracks(DIZZY_MS, WALK_KEYS * DIZZY_CYCLES, {
        torso: dizzyTorso,
        head: dizzyHead,
        near: dizzyNear,
        far: dizzyFar,
      }),
    },
    views: {
      back: {
        bones: armsOnly(upperTracks(DIZZY_MS, WALK_KEYS * DIZZY_CYCLES, { torso: dizzyTorso, near: (u) => -dizzyNear(u), far: (u) => -dizzyFar(u) })),
      },
    },
  },

  /**
   * Вкусили чи подряпали (600 мс): плечі різко вгору, голова втягується, ближню руку смикає й трусить, тулуб і голова
   * відсахуються, мить на носках; очі заплющені. Спереду ближня рука — назад від кота, дальня — уперед. Ззаду кіт перед
   * персонажем (вище на екрані, від камери), тож ближня рука (з боку обличчя) не тицяє в кота й не йде через спину, а
   * притискається до грудей — уперед і коротша (від камери), з тим самим трусінням; дальня смикається назад, з-за спини
   * (дзеркально). Закінчується вихідною позою.
   */
  bitten: {
    duration: ONE.bitten,
    loop: false,
    bones: {
      // Відсахнувся: таз назад над стопами, що стоять, і мить на носках (підскок).
      ...standTracks([k(0, STAND, "out"), k(90, BITTEN_BACK, "inOut"), k(260, stand(-1), "inOut"), k(ONE.bitten, STAND)]),
      pelvis: {
        pos: [
          k(0, { x: 0, y: 0 }, "out"),
          k(90, { x: BITTEN_BACK.pelvis.x, y: BITTEN_BACK.pelvis.y - 2.5 }, "inOut"),
          k(260, stand(-1).pelvis, "inOut"),
          k(ONE.bitten, { x: 0, y: 0 }),
        ],
      },
      torso: { rot: [k(0, 0, "out"), k(90, -9, "inOut"), k(320, -3, "inOut"), k(ONE.bitten, 0)] },
      neck: { pos: BITTEN_NECK },
      head: { rot: [k(0, 0, "out"), k(80, -10, "inOut"), k(300, -2, "inOut"), k(ONE.bitten, 0)] },
      "arm-near": { rot: bittenKeys((by) => round(58 * by)), pos: BITTEN_SHRUG },
      "arm-far": { rot: [k(0, 0, "out"), k(100, -16, "inOut"), k(350, -6, "inOut"), k(ONE.bitten, 0)], pos: BITTEN_SHRUG },
    },
    views: {
      back: {
        bones: {
          "arm-near": {
            rot: bittenKeys((by) => round(-24 * by)),
            scale: bittenKeys((by) => ({ x: round(1 - 0.36 * by), y: 1 })),
          },
          "arm-far": { rot: [k(0, 0, "out"), k(100, 30, "inOut"), k(350, 10, "inOut"), k(ONE.bitten, 0)] },
        },
      },
    },
    slots: { eyes: { frame: [k(0, "open"), k(40, "closed"), k(300, "open")] } },
  },

  /**
   * Застуда: ссутулився, плечі підняті, обхопив себе руками — ближня навхрест грудей, дальня притиснута; тремтить
   * хвилями, шмигає носом: ближня рука витирає ніс рукавом і тре, голова смикається вгору, плечі здригаються. Ззаду
   * обличчя не видно: ближня рука щільно біля боку, трохи вперед (коротка — від камери), шмигання — головою й плечима.
   */
  sick: {
    duration: 3000,
    loop: true,
    bones: {
      ...upperTracks(3000, 60, {
        torso: sickTorso,
        head: (u) => 8 - 4 * wipe(u) - 6 * sniff(u, 0.62) - 4 * sniff(u, 0.7),
        far: (u) => -12 + 0.8 * shiver(u),
        shrug: sickShrug,
      }),
      "arm-far": {
        rot: loopKeys(3000, 60, (u) => -12 + 0.8 * shiver(u)),
        scale: [k(0, { x: 0.85, y: 1 })],
        pos: loopVecKeys(3000, 60, (u) => ({ x: sickShrug(u), y: 0 })),
      },
      "arm-near": {
        rot: loopKeys(3000, 60, sickNear),
        scale: loopVecKeys(3000, 60, (u) => ({ x: sickNearScale(u), y: 1 })),
        pos: loopVecKeys(3000, 60, (u) => ({ x: sickShrug(u), y: 0 })),
      },
    },
    views: {
      back: {
        bones: {
          "arm-near": {
            rot: loopKeys(3000, 60, sickNearBack),
            scale: loopVecKeys(3000, 60, (u) => ({ x: sickNearBackScale(u), y: 1 })),
          },
        },
      },
    },
  },

  /** Кульгає на ближню ногу: на хвору ступає швидко й обережно, тіло западає вперед, голова кивком; ближня рука в бік. */
  limp: {
    duration: LIMP_MS,
    loop: true,
    bones: {
      ...LIMP,
      ...upperTracks(LIMP_MS, LIMP_KEYS, {
        torso: limpTorso,
        head: (u) => -2 + 12 * bump(u, 0.06, 0.44),
        near: limpArm,
        far: limpFar,
      }),
    },
    views: { back: { bones: armsOnly(upperTracks(LIMP_MS, LIMP_KEYS, { torso: limpTorso, near: (u) => -limpArm(u), far: limpFar })) } },
  },

  /**
   * Виснажений: стоїть зсутулений, голова звисає, руки висять; глибоко й повільно дихає (на видиху никне ще нижче) і ледь
   * похитується.
   */
  exhausted: {
    duration: 3600,
    loop: true,
    bones: {
      ...standLoop(3600, 16, (u) => -2 + 1.2 * wave(u, 1, 0.1), (u) => 0.98 - 0.01 * breath(u)),
      ...upperTracks(3600, 16, {
        torso: (u) => 15 - 3 * breath(u),
        head: (u) => 18 - 6 * breath(u, 0.05),
        near: (u) => -14 + 3 * breath(u) + 1.5 * wave(u, 1, 0.3),
        far: (u) => -14 + 3 * breath(u) + 1.5 * wave(u, 1, 0.3),
        shrug: (u) => -2 + 1.5 * breath(u),
      }),
    },
  },

  /**
   * Плететься: важкі човгаючі кроки (провисає на кожному), зсутулений, голова звисає й кивком падає на кроці, руки висять і
   * теліпаються із запізненням.
   */
  trudge: {
    duration: TRUDGE_MS,
    loop: true,
    bones: {
      ...TRUDGE,
      ...upperTracks(TRUDGE_MS, TRUDGE_KEYS, {
        torso: (u) => 15 + 2 * wave(u, 2, 0.3),
        head: (u) => 17 + 4 * wave(u, 2, 0.12),
        near: (u) => -12 + 8 * wave(u, 1, 0.32),
        far: (u) => -12 - 8 * wave(u, 1, 0.32),
        shrug: () => -1.5,
      }),
    },
  },

  /** Відмова (600 мс): розводить руками й знизує плечима, голова набік-назад. */
  refuse: sidewaysArms({
    duration: ONE.refuse,
    loop: false,
    bones: {
      torso: { rot: [k(0, 0, "out"), k(170, -4, "inOut"), k(430, -3, "inOut"), k(ONE.refuse, 0)] },
      head: { rot: [k(0, 0, "out"), k(170, -9, "inOut"), k(430, -7, "inOut"), k(ONE.refuse, 0)] },
      "arm-near": {
        rot: [k(0, 0, "out"), k(170, 40, "inOut"), k(430, 44, "inOut"), k(ONE.refuse, 0)],
        pos: [k(0, { x: 0, y: 0 }, "out"), k(170, { x: 3.5, y: 0 }, "inOut"), k(430, { x: 3, y: 0 }, "inOut"), k(ONE.refuse, { x: 0, y: 0 })],
      },
      "arm-far": {
        rot: [k(0, 0, "out"), k(170, -40, "inOut"), k(430, -44, "inOut"), k(ONE.refuse, 0)],
        pos: [k(0, { x: 0, y: 0 }, "out"), k(170, { x: 3.5, y: 0 }, "inOut"), k(430, { x: 3, y: 0 }, "inOut"), k(ONE.refuse, { x: 0, y: 0 })],
      },
    },
  }),

  /**
   * Спіткнувся (900 мс): нога зачепилася позаду, тіло пірнає вперед, руки махають; ступає вперед і стає рівно — усе за
   * ≈ 0,4 с (оглушення); далі руки ще ловлять рівновагу.
   */
  trip: {
    duration: ONE.trip,
    loop: false,
    bones: {
      // Таз пірнає вперед над дальньою стопою, що стоїть; ближня, зачеплена, спершу позаду в повітрі, потім стає на своє місце.
      pelvis: {
        pos: [
          k(0, { x: 0, y: 0 }, "out"),
          k(80, TRIP[1].pelvis, "inOut"),
          k(210, TRIP[2].pelvis, "inOut"),
          k(330, TRIP[3].pelvis, "inOut"),
          k(420, { x: 0, y: 0 }),
        ],
      },
      torso: { rot: [k(0, 0, "out"), k(80, 26, "inOut"), k(210, 20, "inOut"), k(330, -4, "inOut"), k(480, 1.5, "inOut"), k(640, 0)] },
      head: { rot: [k(0, 0, "out"), k(80, -14, "inOut"), k(210, -8, "inOut"), k(330, 3, "inOut"), k(520, -1, "inOut"), k(680, 0)] },
      "leg-near": {
        rot: [k(0, 0, "out"), k(80, 38, "inOut"), k(210, TRIP[2].leg, "inOut"), k(330, TRIP[3].leg, "inOut"), k(420, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(80, { x: 0.94, y: 1 }, "inOut"), k(210, { x: 1, y: 1 })],
      },
      "leg-far": { rot: [k(0, 0, "out"), k(80, TRIP[1].leg, "inOut"), k(210, TRIP[2].leg, "inOut"), k(330, TRIP[3].leg, "inOut"), k(420, 0)] },
      "foot-near": { rot: [k(0, 0, "out"), k(80, -24, "inOut"), k(210, TRIP[2].foot, "inOut"), k(330, TRIP[3].foot, "inOut"), k(420, 0)] },
      "foot-far": { rot: [k(0, 0, "out"), k(80, TRIP[1].foot, "inOut"), k(210, TRIP[2].foot, "inOut"), k(330, TRIP[3].foot, "inOut"), k(420, 0)] },
      "arm-near": {
        rot: [k(0, 0, "out"), k(80, -85, "inOut"), k(160, -40, "inOut"), k(240, -75, "inOut"), k(360, -18, "inOut"), k(520, 8, "inOut"), k(700, -3, "inOut"), k(ONE.trip, 0)],
      },
      "arm-far": {
        rot: [k(0, 0, "out"), k(80, -115, "inOut"), k(160, -70, "inOut"), k(240, -30, "inOut"), k(360, -10, "inOut"), k(520, 5, "inOut"), k(700, -2, "inOut"), k(ONE.trip, 0)],
      },
    },
    slots: { eyes: { frame: [k(0, "open"), k(70, "closed"), k(260, "open")] } },
  },

  /**
   * Посковзнувся (900 мс): ближня нога виїжджає вперед, тіло валиться назад, руки злітають угору в боки (ближня — назад
   * через верх, дальня — уперед, обличчя не закривають) і махають; ноги й таз стають рівно за ≈ 0,45 с (оглушення), а руки
   * ще ловлять рівновагу.
   */
  slip: sidewaysArms({
    duration: ONE.slip,
    loop: false,
    bones: {
      pelvis: {
        pos: [k(0, { x: 0, y: 0 }, "out"), k(110, { x: -6, y: 5 }, "inOut"), k(250, { x: -5, y: 4 }, "inOut"), k(370, { x: 1, y: 0 }, "inOut"), k(450, { x: 0, y: 0 })],
      },
      torso: { rot: [k(0, 0, "out"), k(110, -24, "inOut"), k(250, -16, "inOut"), k(370, 5, "inOut"), k(520, -1.5, "inOut"), k(680, 0)] },
      head: { rot: [k(0, 0, "out"), k(110, 12, "inOut"), k(250, 6, "inOut"), k(370, -2, "inOut"), k(520, 1, "inOut"), k(680, 0)] },
      "leg-near": { rot: [k(0, 0, "out"), k(110, -58, "inOut"), k(250, -34, "inOut"), k(370, -4, "inOut"), k(450, 0)] },
      "leg-far": {
        rot: [k(0, 0, "out"), k(110, -8, "inOut"), k(250, -6, "inOut"), k(370, 1, "inOut"), k(450, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(110, { x: 0.9, y: 1 }, "inOut"), k(250, { x: 0.92, y: 1 }, "inOut"), k(370, { x: 1, y: 1 })],
      },
      "foot-near": { rot: [k(0, 0, "out"), k(110, 30, "inOut"), k(250, 20, "inOut"), k(370, 3, "inOut"), k(450, 0)] },
      "foot-far": {
        rot: [k(0, 0, "out"), k(110, 8, "inOut"), k(250, 6, "inOut"), k(370, -1, "inOut"), k(450, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(110, { x: 1, y: 1.11 }, "inOut"), k(250, { x: 1, y: 1.09 }, "inOut"), k(370, { x: 1, y: 1 })],
      },
      "arm-near": {
        rot: [k(0, 0, "out"), k(110, 150, "inOut"), k(200, 115, "inOut"), k(300, 145, "inOut"), k(430, 50, "inOut"), k(560, 12, "inOut"), k(720, -5, "inOut"), k(ONE.slip, 0)],
      },
      "arm-far": {
        rot: [k(0, 0, "out"), k(110, -120, "inOut"), k(200, -150, "inOut"), k(300, -110, "inOut"), k(430, -45, "inOut"), k(560, -10, "inOut"), k(720, 4, "inOut"), k(ONE.slip, 0)],
      },
    },
    slots: { eyes: { frame: [k(0, "open"), k(90, "closed"), k(360, "open")] } },
  }),

  /**
   * Бере кота на руки (400 мс): присідає й нахиляється, обидві руки до кота на підлозі (як у `pet`), у
   * `PERSON_PICKUP_GRAB_MS` — підхопив (ближня кисть на спинці, дальня під грудьми), і випростується, піднімаючи руки в
   * позу «тримає кота» (`holdCat`) — нею й закінчується, далі основна з накладкою. Руки веде сама (`PERSON_OWN_ARMS`). Кіт
   * до «підхопив» стоїть на підлозі (гніздо `pet` — у `personCatGrip`), далі вигляд веде його в гніздо `arms` за
   * `personCatLift` — не чіпляє стрибком.
   */
  pickUp: {
    duration: ONE.pickUp,
    loop: false,
    bones: bodyTracks([
      { t: 0, legs: STAND, torso: 0, head: 0, arms: REST, ease: "inOut" },
      { t: 150, legs: SQUAT, torso: REACH_TORSO, head: -18, arms: REACH, ease: "inOut" },
      { t: PERSON_PICKUP_GRAB_MS, ...GRAB, ease: "inOut" },
      { t: ONE.pickUp, legs: STAND, torso: 0, head: 0, arms: HOLD },
    ]),
    views: {
      back: {
        bones: bodyTracks([
          { t: 0, legs: STAND, torso: 0, head: 0, arms: REST, ease: "inOut" },
          { t: 150, legs: SQUAT_BACK, torso: REACH_TORSO_BACK, head: -6, arms: REACH_BACK, ease: "inOut" },
          { t: PERSON_PICKUP_GRAB_MS, ...GRAB_BACK, ease: "inOut" },
          { t: ONE.pickUp, legs: STAND, torso: 0, head: 0, arms: HOLD_BACK },
        ]),
      },
    },
  },

  /**
   * Опускає кота (400 мс): з пози «тримає кота» присідає й опускає руки до підлоги, у `PERSON_PUTDOWN_RELEASE_MS` відпускає
   * (поза та сама, що «підхопив»: кіт стоїть на підлозі, гніздо `pet` — у `personCatGrip`), руки йдуть угору від кота, і він
   * випростується. Кіт до «відпустив» іде з гнізда `arms` на підлогу за `personCatLift`. Руки веде сама (`PERSON_OWN_ARMS`).
   */
  putDown: {
    duration: ONE.putDown,
    loop: false,
    bones: bodyTracks([
      { t: 0, legs: STAND, torso: 0, head: 0, arms: HOLD, ease: "inOut" },
      { t: PERSON_PUTDOWN_RELEASE_MS, ...GRAB, ease: "inOut" },
      { t: 260, legs: SQUAT, torso: REACH_TORSO - 12, head: -14, arms: { near: -50, far: -40 }, ease: "inOut" },
      { t: ONE.putDown, legs: STAND, torso: 0, head: 0, arms: REST },
    ]),
    views: {
      back: {
        bones: bodyTracks([
          { t: 0, legs: STAND, torso: 0, head: 0, arms: HOLD_BACK, ease: "inOut" },
          { t: PERSON_PUTDOWN_RELEASE_MS, ...GRAB_BACK, ease: "inOut" },
          { t: 260, legs: SQUAT_BACK, torso: REACH_TORSO_BACK - 8, head: -4, arms: { near: -30, far: -26 }, ease: "inOut" },
          { t: ONE.putDown, legs: STAND, torso: 0, head: 0, arms: REST },
        ]),
      },
    },
  },
});

// --- Основна з накладкою рук -------------------------------------------------------------------

const WITH_ARMS = new WeakMap<PersonAnim, Map<PersonArmsOverlay | "holdVacuum", PersonAnim>>();

/**
 * Основна анімація `base` (її назва — `id`) з накладкою рук (`PersonAnimChoice.overlay`): доріжки рук і кистей основної
 * ЗАМІНЕНО позою накладки (розмах ходи й ривка не підкидає ні річ, ні кота), решта — від основної. Несе річ (`carry`) — руки
 * тримають свій кут у світі проти нахилу тулуба (противага), а кисть — річ рівно (кут гнізда `held` у світі — 0); тримає кота
 * (`holdCat`) — руки разом із тулубом, кисті під котом у гнізді `arms`; тримає пилосос (`holdVacuum`) — замінено лише
 * ближню руку й кисть (дальня — від основної), кулак над ручкою (z слота `arm-near`), щітка на підлозі. Анімації, які самі
 * ведуть руки (`PERSON_OWN_ARMS` з `anim/ids.ts`: вудочка, бере й опускає кота, усі справи N4b), і накладка null — основна
 * як є. Для тієї самої пари — той самий об'єкт (`Rig.play` не починає її знову). Разові (вкусили, відмова, спіткнувся,
 * посковзнувся) з річчю чи котом у руках — так само: тіло реагує, руки тримають.
 */
export function personWithArms(base: PersonAnim, overlay: PersonAnimId | null, id: PersonAnimId): PersonAnim {
  if (overlay === null || !(overlay in ARMS_OVERLAYS || overlay === "holdVacuum") || PERSON_OWN_ARMS.has(id)) return base;
  let cache = WITH_ARMS.get(base);
  if (!cache) {
    cache = new Map();
    WITH_ARMS.set(base, cache);
  }
  if (overlay === "holdVacuum") {
    // Пилосос у руках: ближня рука з пилососом, дальня — від основної, щітка на підлозі (`vacuumTilts`).
    const known = cache.get(overlay);
    if (known) return known;
    const made = vacuumOver(base, vacuumTilts(base));
    cache.set(overlay, made);
    return made;
  }
  const arms = overlay as PersonArmsOverlay;
  const known = cache.get(arms);
  if (known) return known;
  const spec = ARMS_OVERLAYS[arms];
  const torsoFront = base.bones?.torso?.rot;
  const torsoBack = base.views?.back?.bones?.torso?.rot ?? torsoFront;
  const back = base.views?.back;
  const made: PersonAnim = {
    ...base,
    bones: { ...withoutArms(base.bones), ...armsTracks(spec.front, torsoFront, spec.level) },
    views: { ...base.views, back: { ...back, bones: { ...withoutArms(back?.bones), ...armsTracks(spec.back, torsoBack, spec.level) } } },
  };
  cache.set(arms, made);
  return made;
}

// --- Допоміжні криві (оголошені функціями — їх видно й вище) --------------------------------------

/** Подих 0…1: двічі за цикл (вдих — угору, видих — униз), м'яко. */
function breath(u: number, phase = 0): number {
  return (1 - Math.cos(2 * Math.PI * 2 * (u + phase))) / 2;
}

/** Горбик 0…1…0 на відрізку циклу `a`…`b` (синусом). */
function bump(u: number, a: number, b: number): number {
  return u >= a && u <= b ? Math.sin((Math.PI * (u - a)) / (b - a)) : 0;
}

/** Плато 0…1…0: м'яко вгору за `ramp` від `a`, тримає до `b`, м'яко вниз за `ramp`. */
function plateau(u: number, a: number, b: number, ramp: number): number {
  if (u <= a || u >= b + ramp) return 0;
  if (u < a + ramp) return (1 - Math.cos((Math.PI * (u - a)) / ramp)) / 2;
  if (u <= b) return 1;
  return (1 + Math.cos((Math.PI * (u - b)) / ramp)) / 2;
}

/** Шмигання носом у момент `at` (частка циклу): швидко вгору, повільно назад. */
function sniff(u: number, at: number): number {
  const d = u - at;
  if (d < 0 || d > 0.14) return 0;
  return d < 0.025 ? d / 0.025 : 1 - (d - 0.025) / 0.115;
}

/** Хворий підносить руку до носа: 0 — рука обіймає тулуб, 1 — біля носа. */
function wipe(u: number): number {
  return plateau(u, 0.53, 0.74, 0.07);
}

/** Тремтіння хвилями: дрібне й часте на початку циклу, далі — тихо. */
function shiver(u: number): number {
  return 1.1 * bump(u, 0.04, 0.42) * wave(u, 24);
}

/** Стоїть на місці, а таз ходить уперед-назад (`px`) і ноги коротшають (`s`, підгинаються): стопи — на своїх місцях. */
function standLoop(ms: number, n: number, px: (u: number) => number, s: (u: number) => number = () => 1): Tracks {
  const leg = (u: number): { rot: number; s: number } => ({ rot: plant(px(u), s(u)).rot, s: s(u) });
  const legTrack: BoneTracks = { rot: loopKeys(ms, n, (u) => leg(u).rot), scale: loopVecKeys(ms, n, (u) => ({ x: leg(u).s, y: 1 })) };
  const footTrack: BoneTracks = { rot: loopKeys(ms, n, (u) => -leg(u).rot), scale: loopVecKeys(ms, n, (u) => ({ x: 1, y: 1 / leg(u).s })) };
  return {
    pelvis: { pos: loopVecKeys(ms, n, (u) => ({ x: px(u), y: plant(px(u), s(u)).py })) },
    "leg-near": legTrack,
    "foot-near": footTrack,
    "leg-far": legTrack,
    "foot-far": footTrack,
  };
}
