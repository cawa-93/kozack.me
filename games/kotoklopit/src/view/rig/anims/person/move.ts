// Анімації групи «move» — пакет N4a «Персонаж — рух» (крок 16, хвиля 2). Назви й що кожна означає — `anim/ids.ts`
// (`PERSON_ANIM_GROUPS.move`), де й коли їх обирають — `anim/personanim.ts` (`personAnim`, `personEventAnim`). Формат —
// `rig/types.ts`: доріжки відносно вихідної пози ракурсу; кути — градуси за годинниковою (додатний поворот руки чи ноги —
// назад, тулуба — нахил уперед, голови — підборіддям донизу), y — донизу.
//
// Як тут влаштовано:
// - Ліктів і колін у скелета немає: рука й нога — по одному кадру. «Присісти» — ноги коротші вздовж кістки (у ракурсі ¾
//   стегна йдуть до камери), а взуття на кінці ноги масштабується назад, щоб не плющилося.
// - Хода (`walk`, `dash`, `limp`, `trudge`) рахується з кроку (`gaitTracks`): нога на підлозі йде назад рівно (кісточка в
//   системі кореня — з постійною швидкістю), таз опускається рівно настільки, щоб опорна стопа стояла на підлозі, а нога в
//   переносі коротшає, щоб не черкала підлогу. Скільки одиниць арту персонаж проходить за цикл — `PERSON_*_STRIDE`: стопи не
//   ковзають, коли швидкість відтворення (`PersonAnimParams.speed`) = швидкість на екрані по горизонталі / (крок /
//   тривалість). За швидкості 1 ходьба — приблизно номінальна швидкість сима (`WALK_TILES_PER_MINUTE`: 4 клітинки за секунду
//   уздовж осі клітинки, по горизонталі екрана ≈ 240 одиниць/с), кульгає й плететься — ×0,8 від неї (травма, низькі показники,
//   §6.5). Ривок (×3, ≈ 0,2 с) стопами не встигнути: його поза сильна з першого кадру.
// - Кисті (`hand-*`) кадрів не мають — лише гнізда (`held`, `rod`) і якір `hands`. У ході й стоянні кисть повертається назад
//   на кут руки й тулуба, тож річ у руках лишається рівною, хоч рука й гойдається.
// - Накладки рук (`carry`, `holdCat`, `PERSON_OVERLAYS`) додаються до основної (`idle`, `walk`, `dash` …): rot і pos
//   додаються, тож вони рухають лише руки й кисті.
// - Ззаду ближня рука — з боку обличчя, дальня — з боку спини: де руки йдуть «у боки» (відмова, посковзнувся, вкусили,
//   паморочиться, кульгає), ракурс `back` має ті самі кути з протилежним знаком (`sidewaysArms`), інакше рука йшла б через спину.
// - Разові закінчуються у вихідній позі: з неї м'яко повертається основна. Під час `pickUp` кіт уже в руках, тож руки тримає
//   накладка `holdCat` (якщо вигляд її додає), а сама разова лише присідає й випростується; у `putDown` кота й накладки вже
//   немає, тож руки від пози `holdCat` опускаються самі.

import { PERSON_ONE_SHOT_MS } from "../../../anim/ids";
import { PERSON_RIG } from "../../defs/person";
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

const round = (v: number): number => Math.round(v * 100) / 100;

/** Ключ. */
function k<V>(t: number, v: V, ease?: Ease): Key<V> {
  return ease === undefined ? { t, v } : { t, v, ease };
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
function standTracks(keys: readonly { t: number; v: Stand; ease?: Ease }[]): Tracks {
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
  /** Підгинається під вагою посеред опори (кульгає на хвору): нога коротшає на стільки; стопа все одно йде рівно. */
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
  const d = (((u - leg.on) % 1) + 1) % 1;
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

/** Хода: ноги, підскок у польоті (`hop`, одиниці; коли обидві ноги в повітрі — ривок). */
interface Gait {
  near: GaitLeg;
  far: GaitLeg;
  hop?: number;
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
 * Доріжки ніг і таза для ходи з `n` ключами за цикл `ms` і крок — скільки одиниць проходить корінь за цикл. Таз ходить
 * уперед-назад відносно кореня, коли опори різної тривалості (кульгає): кісточка на підлозі все одно йде назад рівно.
 */
function gaitTracks(ms: number, n: number, gait: Gait): { bones: Tracks; stride: number } {
  const legs = [gait.near, gait.far];
  const sweep = (leg: GaitLeg): number => LEG * (Math.sin(leg.front * DEG) + Math.sin(leg.back * DEG));
  const stride = legs.reduce((sum, leg) => sum + sweep(leg), 0) / legs.reduce((sum, leg) => sum + leg.len, 0);
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
  const near = (u: number): LegState => legAt(gait.near, u);
  const far = (u: number): LegState => legAt(gait.far, u);
  const legTracks = (state: (u: number) => LegState): { leg: BoneTracks; foot: BoneTracks } => ({
    leg: { rot: loopKeys(ms, n, (u) => state(u).rot), scale: loopVecKeys(ms, n, (u) => ({ x: state(u).scale, y: 1 })) },
    foot: { rot: loopKeys(ms, n, (u) => state(u).foot), scale: loopVecKeys(ms, n, (u) => ({ x: 1, y: 1 / state(u).scale })) },
  });
  const n1 = legTracks(near);
  const f1 = legTracks(far);
  return {
    bones: {
      pelvis: { pos: loopVecKeys(ms, n, (u) => ({ x: pxAt(u), y: pelvisY(gait, u) })) },
      "leg-near": n1.leg,
      "foot-near": n1.foot,
      "leg-far": f1.leg,
      "foot-far": f1.foot,
    },
    stride,
  };
}

/**
 * Верх тіла по колу: тулуб, голова, руки (функції часу 0…1). Кисті тримають річ рівно: повертаються назад на кут тулуба
 * й руки (накладка рук додає й свій поворот, і противагу кисті — річ теж рівна).
 */
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

/** Ходьба: цикл (два кроки), мс; кут ноги від вертикалі на початку й наприкінці опори. */
const WALK_MS = 360;
const WALK_SWING = 26;
const WALK = gaitTracks(WALK_MS, 16, {
  near: { on: 0, len: 0.5, front: WALK_SWING, back: WALK_SWING, lift: 0.14, toe: 14, push: 22 },
  far: { on: 0.5, len: 0.5, front: WALK_SWING, back: WALK_SWING, lift: 0.14, toe: 14, push: 22 },
});

/** Ривок: довгий крок із польотом (обидві ноги в повітрі), сильний нахил. */
const DASH_MS = 300;
const DASH_LEAN = 22;
const DASH = gaitTracks(DASH_MS, 20, {
  near: { on: 0, len: 0.3, front: 32, back: 38, lift: 0.28, toe: 10, push: 45 },
  far: { on: 0.5, len: 0.3, front: 32, back: 38, lift: 0.28, toe: 10, push: 45 },
  hop: 6,
});

/**
 * Кульгає на ближню ногу: на хвору ступає ненадовго, вона підгинається під вагою, а в переносі ледь відривається й не
 * працює носком; на здорову — довга опора.
 */
const LIMP_MS = 370;
const LIMP = gaitTracks(LIMP_MS, 25, {
  near: { on: 0, len: 0.36, front: 18, back: 24, lift: 0.03, toe: 2, push: 3, sink: 0.07 },
  far: { on: 0.36, len: 0.64, front: 24, back: 18, lift: 0.14, toe: 12, push: 18 },
});

/** Плететься: ноги ледь відриваються (човгає) і не працюють носком. */
const TRUDGE_MS = 350;
const TRUDGE = gaitTracks(TRUDGE_MS, 16, {
  near: { on: 0, len: 0.5, front: 20, back: 20, lift: 0.05, toe: 4, push: 8 },
  far: { on: 0.5, len: 0.5, front: 20, back: 20, lift: 0.05, toe: 4, push: 8 },
});

/** Скільки одиниць арту персонаж проходить за цикл ходи: швидкість відтворення = швидкість на екрані / (крок / тривалість). */
export const PERSON_WALK_STRIDE = round(WALK.stride);
export const PERSON_DASH_STRIDE = round(DASH.stride);
export const PERSON_LIMP_STRIDE = round(LIMP.stride);
export const PERSON_TRUDGE_STRIDE = round(TRUDGE.stride);

// --- Накладки рук -------------------------------------------------------------------------------

/** Поза рук накладки: кути рук (відносно вихідної) і наскільки рука коротша (зігнута до камери). */
interface Arms {
  near: number;
  far: number;
  nearScale?: number;
  farScale?: number;
}

/**
 * Тримає кота перед собою: ближня рука навскіс під котом, дальня зігнута під ним з того боку. Ззаду ближня рука — з боку
 * обличчя, тож коротша й нижче: кіт за тулубом.
 */
const HOLD: Arms = { near: -62, far: -50, farScale: 0.78 };
const HOLD_BACK: Arms = { near: -42, far: -40, nearScale: 0.8, farScale: 0.85 };
/**
 * Несе річ: ближня рука вперед (річ на долоні — гніздо `held`), дальня підтримує знизу. Ближню руку не вкорочено: у кисті
 * гніздо, а нерівний масштаб руки перекосив би річ.
 */
const CARRY: Arms = { near: -52, far: -44, farScale: 0.85 };
const CARRY_BACK: Arms = { near: -36, far: -36, farScale: 0.85 };

/** Доріжки накладки рук: кисть — противагою, щоб річ (кіт) була рівно; руки ледь гойдаються (`sway`, градуси). */
function armsTracks(ms: number, arms: Arms, sway: number): Tracks {
  const near = (u: number): number => arms.near + sway * wave(u);
  const far = (u: number): number => arms.far + sway * wave(u, 1, 0.08);
  const scale = (by: number | undefined): { scale?: Key<Vec2>[] } => (by === undefined ? {} : { scale: [k(0, { x: by, y: 1 })] });
  return {
    "arm-near": { rot: loopKeys(ms, 8, near), ...scale(arms.nearScale) },
    "hand-near": { rot: loopKeys(ms, 8, (u) => -near(u)) },
    "arm-far": { rot: loopKeys(ms, 8, far), ...scale(arms.farScale) },
    "hand-far": { rot: loopKeys(ms, 8, (u) => -far(u)) },
  };
}

// --- Присідання ---------------------------------------------------------------------------------

/** Присів біля кота: ноги коротші (стегна до камери), таз трохи назад. */
const SQUAT = stand(-5, 0.54, 1.1);
/** Ззаду кіт вище на екрані (далі від камери) — присідає менше. */
const SQUAT_BACK = stand(-3, 0.8, 1.05);
/** Присідає взяти чи поставити кота. */
const CROUCH = stand(-4, 0.62, 1.08);

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
    if (track?.rot) back[id] = { ...track, rot: track.rot.map((key) => ({ ...key, v: -key.v })) };
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

/** Паморочиться: тулуб ходить колом, руки в боки ловлять рівновагу (ближня — `dizzyArm`, дальня — на 44° уперед від неї). */
const dizzyTorso = (u: number): number => -9 * wave(u, 1, 0.08) + 2 * wave(u, 2);
const dizzyArm = (u: number): number => 22 + 14 * wave(u, 1, -0.05);
/** Кульгає: тулуб западає вперед на хворій нозі, ближня рука — в бік. */
const limpTorso = (u: number): number => 5 + 12 * bump(u, 0.02, 0.4);
const limpArm = (u: number): number => 14 + 12 * bump(u, 0.04, 0.4);
const limpFar = (u: number): number => -12 + 10 * wave(u, 1, 0.3);

/** Застуда: ссутулений тулуб тремтить, на шмиганні плечі здригаються. */
const sickTorso = (u: number): number => 9 + shiver(u) + 0.8 * breath(u) - 2 * wipe(u);
const sickShrug = (u: number): number => 2 + 2 * sniff(u, 0.62) + 1.2 * sniff(u, 0.7);

/** Вкусили: відсахнувся назад над стопами. */
const BITTEN_BACK = stand(-3);
/** Спіткнувся: таз над стопами — пірнає вперед і повертається. */
const TRIP = [stand(0), stand(7), stand(9), stand(2)] as const;

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
   * Іде: ноги ходою (`WALK`), руки навхрест із ногами, тулуб трохи вперед і пружинить двічі за цикл, голова тримається рівно
   * з легким запізненням.
   */
  walk: {
    duration: WALK_MS,
    loop: true,
    bones: {
      ...WALK.bones,
      ...upperTracks(WALK_MS, 16, {
        torso: (u) => 5 + 1.2 * wave(u, 2, 0.25),
        head: (u) => -3 + 1.5 * wave(u, 2, 0.1),
        near: (u) => -4 + 14 * wave(u, 1, 0.22),
        far: (u) => -4 - 14 * wave(u, 1, 0.22),
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
      ...DASH.bones,
      ...upperTracks(DASH_MS, 20, {
        torso: (u) => DASH_LEAN + 2 * wave(u, 2, 0.3),
        head: (u) => -14 + 2 * wave(u, 2, 0.15),
        near: (u) => -DASH_LEAN - 12 + 36 * wave(u, 1, 0.25),
        far: (u) => -DASH_LEAN - 12 - 36 * wave(u, 1, 0.25),
      }),
    },
  },

  /** Несе річ (накладка): руки перед собою, річ на долоні — рівно. */
  carry: { duration: 2400, loop: true, bones: armsTracks(2400, CARRY, 1), views: { back: { bones: armsTracks(2400, CARRY_BACK, 1) } } },

  /** Тримає кота перед собою (накладка): руки під котом, ледь колише. */
  holdCat: { duration: 2400, loop: true, bones: armsTracks(2400, HOLD, 1.5), views: { back: { bones: armsTracks(2400, HOLD_BACK, 1.5) } } },

  /**
   * Гладить кота на підлозі: присів, нахилився, ближня рука вперед і вниз — на спинці кота (якір `hands`; точку спинки під
   * рукою кладе вигляд) — і гладить уздовж спинки, плече й тулуб ледь ідуть за рукою; дальня рука спирається вниз, голова
   * дивиться на кота. Ззаду кіт вище на екрані — присідає менше.
   */
  pet: {
    duration: 1000,
    loop: true,
    bones: {
      ...standTracks([k(0, SQUAT)]),
      ...upperTracks(1000, 10, {
        torso: (u) => 44 - 3 * wave(u),
        head: (u) => -22 + 4 * wave(u, 1, -0.05),
        near: (u) => -80 + 9 * wave(u),
        far: (u) => -26 + 3 * wave(u, 1, 0.1),
      }),
      "arm-far": { rot: loopKeys(1000, 10, (u) => -26 + 3 * wave(u, 1, 0.1)), scale: [k(0, { x: 0.76, y: 1 })] },
    },
    views: {
      back: {
        bones: {
          ...standTracks([k(0, SQUAT_BACK)]),
          ...upperTracks(1000, 10, {
            torso: (u) => 26 - 3 * wave(u),
            head: (u) => -6 + 4 * wave(u, 1, -0.05),
            near: (u) => -50 + 9 * wave(u),
            far: (u) => -14 + 3 * wave(u, 1, 0.1),
          }),
          "arm-far": { rot: loopKeys(1000, 10, (u) => -14 + 3 * wave(u, 1, 0.1)), scale: [k(0, { x: 0.8, y: 1 })] },
        },
      },
    },
  },

  /**
   * Грається вудочкою: ближня рука витягнута вперед, кисть малими колами водить паличкою (пір'їнка кружляє над котом), тулуб
   * трохи вперед, голова дивиться вниз на кота, тіло ледь пружинить у такт.
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
   * Паморочиться: тіло повільно ходить колом над стопами, коліна підгинаються, ноги переступають на місці, голова хилитається
   * з запізненням, руки в боки — ловить рівновагу.
   */
  dizzy: {
    duration: 1800,
    loop: true,
    bones: {
      ...standLoop(
        1800,
        24,
        (u) => 5 * wave(u),
        (u) => 0.96 + 0.04 * wave(u, 2, 0.25),
        { near: (u) => 0.1 * bump(u, 0.18, 0.36), far: (u) => 0.1 * bump(u, 0.68, 0.86) },
      ),
      ...upperTracks(1800, 24, {
        torso: dizzyTorso,
        head: (u) => 18 * wave(u, 1, -0.12),
        near: dizzyArm,
        far: (u) => dizzyArm(u) - 44,
      }),
    },
    views: { back: { bones: armsOnly(upperTracks(1800, 24, { torso: dizzyTorso, near: (u) => -dizzyArm(u), far: (u) => 44 - dizzyArm(u) })) } },
  },

  /**
   * Вкусили чи подряпали (600 мс): ближню руку смикає назад і трусить, тулуб і голова відсахуються, мить на носках; очі
   * заплющені. Закінчується вихідною позою.
   */
  bitten: sidewaysArms({
    duration: ONE.bitten,
    loop: false,
    bones: {
      // Відсахнувся: таз назад над стопами, що стоять, і мить на носках (підскок).
      ...standTracks([k(0, stand(0), "out"), k(90, BITTEN_BACK, "inOut"), k(260, stand(-1), "inOut"), k(ONE.bitten, stand(0))]),
      pelvis: {
        pos: [
          k(0, { x: 0, y: 0 }, "out"),
          k(90, { x: BITTEN_BACK.pelvis.x, y: BITTEN_BACK.pelvis.y - 2.5 }, "inOut"),
          k(260, stand(-1).pelvis, "inOut"),
          k(ONE.bitten, { x: 0, y: 0 }),
        ],
      },
      torso: { rot: [k(0, 0, "out"), k(90, -9, "inOut"), k(320, -3, "inOut"), k(ONE.bitten, 0)] },
      head: { rot: [k(0, 0, "out"), k(80, -10, "inOut"), k(300, -2, "inOut"), k(ONE.bitten, 0)] },
      "arm-near": {
        rot: [
          k(0, 0, "out"),
          k(90, 58, "inOut"),
          k(170, 40, "inOut"),
          k(240, 56, "inOut"),
          k(320, 42, "inOut"),
          k(420, 30, "inOut"),
          k(ONE.bitten, 0),
        ],
      },
      "arm-far": { rot: [k(0, 0, "out"), k(100, -16, "inOut"), k(350, -6, "inOut"), k(ONE.bitten, 0)] },
    },
    slots: { eyes: { frame: [k(0, "open"), k(40, "closed"), k(300, "open")] } },
  }),

  /**
   * Застуда: ссутулився, обхопив себе руками; тремтить хвилями, шмигає носом: ближня рука витирає ніс рукавом (коротша —
   * зігнута в лікті до камери), голова смикається вгору, плечі здригаються.
   */
  sick: {
    duration: 3000,
    loop: true,
    bones: {
      ...upperTracks(3000, 60, {
        torso: sickTorso,
        head: (u) => 8 - 4 * wipe(u) - 6 * sniff(u, 0.62) - 4 * sniff(u, 0.7),
        far: (u) => -30 + 0.6 * shiver(u),
        shrug: (u) => sickShrug(u) + 0.6 * Math.abs(shiver(u)),
      }),
      "arm-near": {
        rot: loopKeys(3000, 60, (u) => -34 + 0.6 * shiver(u) + (-58 + 5 * wave(u, 10)) * wipe(u)),
        scale: loopVecKeys(3000, 60, (u) => ({ x: 1 - 0.3 * wipe(u), y: 1 })),
        pos: loopVecKeys(3000, 60, (u) => ({ x: sickShrug(u), y: 0 })),
      },
    },
    // Ззаду обличчя не видно: рука до носа не йде, лише обіймає тулуб (з боку обличчя — коротша), шмигає головою й плечима.
    views: {
      back: {
        bones: {
          "arm-near": {
            rot: loopKeys(3000, 60, (u) => 14 + 0.6 * shiver(u)),
            scale: [k(0, { x: 0.85, y: 1 })],
            pos: loopVecKeys(3000, 60, (u) => ({ x: sickShrug(u), y: 0 })),
          },
          "hand-near": { rot: loopKeys(3000, 60, (u) => -(sickTorso(u) + 14 + 0.6 * shiver(u))) },
        },
      },
    },
  },

  /** Кульгає на ближню ногу: на хвору ступає швидко й обережно, тіло западає вперед, голова кивком; ближня рука в бік. */
  limp: {
    duration: LIMP_MS,
    loop: true,
    bones: {
      ...LIMP.bones,
      ...upperTracks(LIMP_MS, 25, {
        torso: limpTorso,
        head: (u) => -2 + 12 * bump(u, 0.06, 0.44),
        near: limpArm,
        far: limpFar,
      }),
    },
    views: { back: { bones: armsOnly(upperTracks(LIMP_MS, 25, { torso: limpTorso, near: (u) => -limpArm(u), far: limpFar })) } },
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

  /** Плететься: короткі човгаючі кроки, зсутулений, голова звисає й хитається, руки висять і ледь теліпаються. */
  trudge: {
    duration: TRUDGE_MS,
    loop: true,
    bones: {
      ...TRUDGE.bones,
      ...upperTracks(TRUDGE_MS, 16, {
        torso: (u) => 14 + 1.5 * wave(u, 2, 0.3),
        head: (u) => 16 + 3 * wave(u, 2, 0.15),
        near: (u) => -13 + 5 * wave(u, 1, 0.3),
        far: (u) => -13 - 5 * wave(u, 1, 0.3),
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

  /** Спіткнувся (900 мс): нога зачепилася позаду, тіло пірнає вперед, руки махають; ступає вперед, ловить рівновагу. */
  trip: {
    duration: ONE.trip,
    loop: false,
    bones: {
      // Таз пірнає вперед над дальньою стопою, що стоїть; ближня, зачеплена, спершу позаду в повітрі, потім стає на своє місце.
      pelvis: {
        pos: [
          k(0, { x: 0, y: 0 }, "out"),
          k(110, TRIP[1].pelvis, "inOut"),
          k(330, TRIP[2].pelvis, "inOut"),
          k(600, TRIP[3].pelvis, "inOut"),
          k(ONE.trip, { x: 0, y: 0 }),
        ],
      },
      torso: { rot: [k(0, 0, "out"), k(110, 26, "inOut"), k(330, 22, "inOut"), k(600, -4, "inOut"), k(ONE.trip, 0)] },
      head: { rot: [k(0, 0, "out"), k(110, -14, "inOut"), k(330, -8, "inOut"), k(600, 3, "inOut"), k(ONE.trip, 0)] },
      "leg-near": {
        rot: [k(0, 0, "out"), k(110, 38, "inOut"), k(330, TRIP[2].leg, "inOut"), k(600, TRIP[3].leg, "inOut"), k(ONE.trip, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(110, { x: 0.94, y: 1 }, "inOut"), k(330, { x: 1, y: 1 })],
      },
      "leg-far": { rot: [k(0, 0, "out"), k(110, TRIP[1].leg, "inOut"), k(330, TRIP[2].leg, "inOut"), k(600, TRIP[3].leg, "inOut"), k(ONE.trip, 0)] },
      "foot-near": { rot: [k(0, 0, "out"), k(110, -24, "inOut"), k(330, TRIP[2].foot, "inOut"), k(600, TRIP[3].foot, "inOut"), k(ONE.trip, 0)] },
      "foot-far": { rot: [k(0, 0, "out"), k(110, TRIP[1].foot, "inOut"), k(330, TRIP[2].foot, "inOut"), k(600, TRIP[3].foot, "inOut"), k(ONE.trip, 0)] },
      "arm-near": { rot: [k(0, 0, "out"), k(110, -85, "inOut"), k(220, -40, "inOut"), k(330, -75, "inOut"), k(600, -10, "inOut"), k(ONE.trip, 0)] },
      "arm-far": { rot: [k(0, 0, "out"), k(110, -115, "inOut"), k(220, -70, "inOut"), k(330, -30, "inOut"), k(600, -6, "inOut"), k(ONE.trip, 0)] },
    },
    slots: { eyes: { frame: [k(0, "open"), k(90, "closed"), k(300, "open")] } },
  },

  /**
   * Посковзнувся (900 мс): ближня нога виїжджає вперед, тіло валиться назад, руки злітають угору в боки (ближня — назад
   * через верх, дальня — уперед, обличчя не закривають) і махають; ловить рівновагу.
   */
  slip: sidewaysArms({
    duration: ONE.slip,
    loop: false,
    bones: {
      pelvis: {
        pos: [
          k(0, { x: 0, y: 0 }, "out"),
          k(130, { x: -6, y: 5 }, "inOut"),
          k(330, { x: -5, y: 4 }, "inOut"),
          k(620, { x: 1, y: 0 }, "inOut"),
          k(ONE.slip, { x: 0, y: 0 }),
        ],
      },
      torso: { rot: [k(0, 0, "out"), k(130, -24, "inOut"), k(330, -16, "inOut"), k(620, 5, "inOut"), k(ONE.slip, 0)] },
      head: { rot: [k(0, 0, "out"), k(130, 12, "inOut"), k(330, 6, "inOut"), k(620, -2, "inOut"), k(ONE.slip, 0)] },
      "leg-near": { rot: [k(0, 0, "out"), k(130, -58, "inOut"), k(330, -34, "inOut"), k(620, -4, "inOut"), k(ONE.slip, 0)] },
      "leg-far": {
        rot: [k(0, 0, "out"), k(130, -8, "inOut"), k(330, -6, "inOut"), k(620, 1, "inOut"), k(ONE.slip, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(130, { x: 0.9, y: 1 }, "inOut"), k(330, { x: 0.92, y: 1 }, "inOut"), k(620, { x: 1, y: 1 })],
      },
      "foot-near": { rot: [k(0, 0, "out"), k(130, 30, "inOut"), k(330, 20, "inOut"), k(620, 3, "inOut"), k(ONE.slip, 0)] },
      "foot-far": {
        rot: [k(0, 0, "out"), k(130, 8, "inOut"), k(330, 6, "inOut"), k(620, -1, "inOut"), k(ONE.slip, 0)],
        scale: [k(0, { x: 1, y: 1 }, "out"), k(130, { x: 1, y: 1.11 }, "inOut"), k(330, { x: 1, y: 1.09 }, "inOut"), k(620, { x: 1, y: 1 })],
      },
      "arm-near": { rot: [k(0, 0, "out"), k(130, 150, "inOut"), k(250, 115, "inOut"), k(400, 145, "inOut"), k(620, 20, "inOut"), k(ONE.slip, 0)] },
      "arm-far": { rot: [k(0, 0, "out"), k(130, -120, "inOut"), k(250, -150, "inOut"), k(400, -110, "inOut"), k(620, -15, "inOut"), k(ONE.slip, 0)] },
    },
    slots: { eyes: { frame: [k(0, "open"), k(100, "closed"), k(420, "open")] } },
  }),

  /**
   * Бере кота на руки (400 мс): присідає й нахиляється до кота, руки — ще нижче, і випростується; кіт у руках (накладка
   * `holdCat` тримає руки).
   */
  pickUp: {
    duration: ONE.pickUp,
    loop: false,
    bones: {
      ...standTracks([k(0, stand(0), "out"), k(150, CROUCH, "inOut"), k(ONE.pickUp, stand(0))]),
      torso: { rot: [k(0, 0, "out"), k(150, 36, "inOut"), k(ONE.pickUp, 0)] },
      head: { rot: [k(0, 0, "out"), k(150, -16, "inOut"), k(ONE.pickUp, 0)] },
      "arm-near": { rot: [k(0, 0, "out"), k(150, -14, "inOut"), k(ONE.pickUp, 0)] },
      "arm-far": { rot: [k(0, 0, "out"), k(150, -10, "inOut"), k(ONE.pickUp, 0)] },
    },
  },

  /** Опускає кота (400 мс): руки від пози «тримає кота» опускаються разом із присіданням, відпускають, і він випростується. */
  putDown: {
    duration: ONE.putDown,
    loop: false,
    bones: {
      ...standTracks([k(0, stand(0), "inOut"), k(180, CROUCH, "inOut"), k(ONE.putDown, stand(0))]),
      torso: { rot: [k(0, 0, "inOut"), k(180, 36, "inOut"), k(ONE.putDown, 0)] },
      head: { rot: [k(0, 0, "inOut"), k(180, -16, "inOut"), k(ONE.putDown, 0)] },
      "arm-near": { rot: [k(0, HOLD.near, "inOut"), k(180, -50, "inOut"), k(260, -44, "inOut"), k(ONE.putDown, 0)] },
      "hand-near": { rot: [k(0, -HOLD.near, "inOut"), k(180, 30, "inOut"), k(ONE.putDown, 0)] },
      "arm-far": {
        rot: [k(0, HOLD.far, "inOut"), k(180, -40, "inOut"), k(260, -32, "inOut"), k(ONE.putDown, 0)],
        scale: [k(0, { x: HOLD.farScale ?? 1, y: 1 }, "inOut"), k(260, { x: 1, y: 1 })],
      },
      "hand-far": { rot: [k(0, -HOLD.far, "inOut"), k(180, 20, "inOut"), k(ONE.putDown, 0)] },
    },
    views: {
      back: {
        bones: {
          "arm-near": {
            rot: [k(0, HOLD_BACK.near, "inOut"), k(180, -30, "inOut"), k(260, -26, "inOut"), k(ONE.putDown, 0)],
            scale: [k(0, { x: HOLD_BACK.nearScale ?? 1, y: 1 }, "inOut"), k(260, { x: 1, y: 1 })],
          },
          "hand-near": { rot: [k(0, -HOLD_BACK.near, "inOut"), k(180, 20, "inOut"), k(ONE.putDown, 0)] },
          "arm-far": {
            rot: [k(0, HOLD_BACK.far, "inOut"), k(180, -30, "inOut"), k(260, -24, "inOut"), k(ONE.putDown, 0)],
            scale: [k(0, { x: HOLD_BACK.farScale ?? 1, y: 1 }, "inOut"), k(260, { x: 1, y: 1 })],
          },
          "hand-far": { rot: [k(0, -HOLD_BACK.far, "inOut"), k(180, 16, "inOut"), k(ONE.putDown, 0)] },
        },
      },
    },
  },
});

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

/**
 * Стоїть на місці, а таз ходить уперед-назад (`px`) і ноги коротшають (`s`, підгинаються); `lift` — нога коротшає ще
 * (піднята, переступає): стопи — на своїх місцях, таз — на тій, що стоїть.
 */
function standLoop(
  ms: number,
  n: number,
  px: (u: number) => number,
  s: (u: number) => number = () => 1,
  lift: { near?: (u: number) => number; far?: (u: number) => number } = {},
): Tracks {
  const legOf = (u: number, up: number): { rot: number; s: number } => {
    const scale = s(u) - up;
    return { rot: plant(px(u), scale).rot, s: scale };
  };
  const near = (u: number): { rot: number; s: number } => legOf(u, lift.near?.(u) ?? 0);
  const far = (u: number): { rot: number; s: number } => legOf(u, lift.far?.(u) ?? 0);
  const py = (u: number): number => Math.min(...[near(u), far(u)].map((leg) => LEG * (1 - leg.s * Math.cos(leg.rot * DEG))));
  const legTracks = (leg: (u: number) => { rot: number; s: number }, up: ((u: number) => number) | undefined): { leg: BoneTracks; foot: BoneTracks } => ({
    leg: { rot: loopKeys(ms, n, (u) => leg(u).rot), scale: loopVecKeys(ms, n, (u) => ({ x: leg(u).s, y: 1 })) },
    // Піднята нога — носком донизу.
    foot: { rot: loopKeys(ms, n, (u) => -leg(u).rot + 120 * (up?.(u) ?? 0)), scale: loopVecKeys(ms, n, (u) => ({ x: 1, y: 1 / leg(u).s })) },
  });
  const n1 = legTracks(near, lift.near);
  const f1 = legTracks(far, lift.far);
  return {
    pelvis: { pos: loopVecKeys(ms, n, (u) => ({ x: px(u), y: py(u) })) },
    "leg-near": n1.leg,
    "foot-near": n1.foot,
    "leg-far": f1.leg,
    "foot-far": f1.foot,
  };
}
