// Анімації кота, група «feelings» — пакет N3 «Кіт — хвороби й почуття» (крок 16, хвиля 2; назви й що кожна означає —
// `anim/ids.ts`, де й коли кожну обирають — `pose.ts` (`catPose`, `catAnim`) і `anim/catevents.ts`). Формат — `rig/types.ts`:
// доріжки відносно вихідної пози ракурсу (кіт стоїть, дивиться праворуч), кути в градусах за годинниковою, вісь y донизу,
// час у мс.
//
// Види тут:
// - основні (по колу): кашель (`cough`), кульгає (`limp`), хропе (`snore`), незграбна (`clumsy`) і сумна (`sadWalk`) хода;
// - разові всього тіла (рівно `CAT_ONE_SHOT_MS`): чухає задньою лапою (`itch`), тре очі (`rubEyes`), блює (`vomit`) —
//   починаються й закінчуються в позі, з якої основна вступає м'яко (чухання й тертя очей — сидячи, як `sit` групи
//   `basic`; блювання — стоячи);
// - накладки (`CAT_OVERLAYS`): чхання й задишка (разові), «подобається», «терпить», «попереджає», «пручається», повільне
//   кліпання (по колу). Накладка додається до основної (rot і pos додаються, scale множиться), тож рухає лише свої кістки:
//   голову, хвіст, тулуб диханням; у кінці разової накладки всі її доріжки — нуль. Доріжки накладок — для кота, що сидить
//   під рукою (`sit`); під іншу основу (на руках, на спині) їх підганяє `catOverlayOn` (див. розділ унизу).
//
// Обличчя (очі, рот, вуха) — справа `catFace` і разових подій (`catevents.ts`); доріжки цих слотів тут лише в разових —
// чханні, блюванні й задишці, де вираз має мінятися за ходом дії (спершу «а-а», потім «чхи»).
//
// Будова скелета (`defs/cat.ts`), яку треба пам'ятати: лапа — одна кістка від плеча чи стегна до подушечки (`len` 20,5), тож
// лапу «згинає» лише масштаб уздовж кістки (`sx` < 1 — підібрана), а куди вона дивиться — поворот (додатний — назад). Задні
// лапи — на тазі, передні — на тулубі. Таз — батько всього кота. Хвіст — один кадр-«S»: лише повертати навколо корінця
// (`tail`). Пози, спільні з групою `basic` (сидить — `SIT`, клубок — `CURL`), і ритм ходи повторені тут тими самими числами,
// щоб чухання починалося з того, як кіт сидить, хропіння було тим самим клубком, що й сон, а кульгання — тією самою ходою.

import type { AnimOf, BoneOf, BoneTracks, Ease, Key, SlotOf, SlotTracks, Vec2 } from "../../types";
import { defineAnims } from "../../types";
import type { ArtView } from "../../../art/types";
import { CAT_ONE_SHOT_MS } from "../../../anim/ids";
import { CAT_RIG } from "../../defs/cat";
import { Rig, sampleNumber, sampleVec } from "../../rigcore";

type CatBone = BoneOf<typeof CAT_RIG>;
type CatSlot = SlotOf<typeof CAT_RIG>;
type CatAnim = AnimOf<typeof CAT_RIG>;
type Tracks = Partial<Record<CatBone, BoneTracks>>;
type SlotSet = Partial<Record<CatSlot, SlotTracks>>;

// --- Інструменти ---------------------------------------------------------------------------------

/** Зміна кістки відносно вихідної пози: поворот (градуси), зсув (у системі батька) і масштаб (`sx` — уздовж кістки). */
interface Tweak {
  rot?: number;
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
}

/** Поза кота: кістка → зміна. Кістки, яких немає, — у вихідній позі. */
type Pose = Partial<Record<CatBone, Tweak>>;

/** Ключова поза: момент, поза й перехід від неї до наступної (за замовчуванням `inOut`). */
interface Frame {
  t: number;
  pose: Pose;
  ease?: Ease;
}

const BONES: readonly CatBone[] = CAT_RIG.bones.map((bone) => bone.id);

function key<V>(t: number, v: V, ease: Ease | undefined): Key<V> {
  return ease === undefined || ease === "linear" ? { t, v } : { t, v, ease };
}

/**
 * Доріжки з ключових поз: канал, який задає хоч одна поза, має ключ у кожній (де поза його не задає — вихідне значення: 0
 * для повороту й зсуву, 1 для масштабу). Так поза — це завжди вся поза, а не «що змінилося з минулої».
 */
function posed(frames: readonly Frame[]): Tracks {
  const out: Tracks = {};
  for (const bone of BONES) {
    const has = (field: keyof Tweak): boolean => frames.some((f) => f.pose[bone]?.[field] !== undefined);
    const ease = (f: Frame): Ease => f.ease ?? "inOut";
    const tracks: BoneTracks = {
      ...(has("rot") ? { rot: frames.map((f) => key(f.t, f.pose[bone]?.rot ?? 0, ease(f))) } : {}),
      ...(has("x") || has("y") ? { pos: frames.map((f) => key(f.t, { x: f.pose[bone]?.x ?? 0, y: f.pose[bone]?.y ?? 0 }, ease(f))) } : {}),
      ...(has("sx") || has("sy") ? { scale: frames.map((f) => key(f.t, { x: f.pose[bone]?.sx ?? 1, y: f.pose[bone]?.sy ?? 1 }, ease(f))) } : {}),
    };
    if (tracks.rot || tracks.pos || tracks.scale) out[bone] = tracks;
  }
  return out;
}

/** Поза, що не рухається. */
const still = (pose: Pose): Tracks => posed([{ t: 0, pose }]);

/** Поза `base` зі змінами `delta`: повороти й зсуви додаються, масштаби множаться. */
function over(base: Pose, delta: Pose): Pose {
  const out: Pose = { ...base };
  for (const bone of BONES) {
    const a = base[bone] ?? {};
    const d = delta[bone];
    if (!d) continue;
    const tweak: Tweak = { ...a };
    for (const field of ["rot", "x", "y"] as const) if (d[field] !== undefined) tweak[field] = (a[field] ?? 0) + d[field];
    for (const field of ["sx", "sy"] as const) if (d[field] !== undefined) tweak[field] = (a[field] ?? 1) * d[field];
    out[bone] = tweak;
  }
  return out;
}

/** Доріжки, що замінюють канали попередніх (кістка за кісткою, канал за каналом). */
function merge(...sets: readonly Tracks[]): Tracks {
  const out: Tracks = {};
  for (const set of sets) {
    for (const bone of BONES) {
      const tracks = set[bone];
      if (tracks) out[bone] = { ...out[bone], ...tracks };
    }
  }
  return out;
}

/**
 * Коливання по колу: значення `values` рівно розставлені за `T` мс і замкнені на перше (перехід `inOut` — між крайніми
 * точками це синусоїда). `[0, 3]` — туди й назад за цикл, `[0, 3, 0, 3]` — двічі.
 */
function osc(T: number, values: readonly number[], ease: Ease = "inOut"): Key<number>[] {
  const step = T / values.length;
  const keys = values.map((v, i) => key(Math.round(i * step), v, ease));
  keys.push({ t: T, v: values[0] ?? 0 });
  return keys;
}

/** Ключі за часом: пари [t, значення], перехід `inOut` (останній ключ — без переходу). */
function keys(list: readonly (readonly [number, number])[], ease: Ease = "inOut"): Key<number>[] {
  return list.map(([t, v], i) => (i === list.length - 1 ? { t, v } : key(t, v, ease)));
}

/** Те саме для векторів (зсув, масштаб). */
function keysV(list: readonly (readonly [number, number, number])[], ease: Ease = "inOut"): Key<Vec2>[] {
  return list.map(([t, x, y], i) => (i === list.length - 1 ? { t, v: { x, y } } : key(t, { x, y }, ease)));
}

/** Доріжка кадру слота: пари [t, стан]. */
const frames = (list: readonly (readonly [number, string])[]): SlotTracks => ({ frame: list.map(([t, v]) => ({ t, v })) });

const DEG = Math.PI / 180;

/**
 * Корінь хвоста в кадрі — товстий «корінець» довкола pivot, зсунутий від нього на стільки (одиниці арту, у системі тулуба;
 * еталон `cat/tail/long`, як `TAIL_ROOT` групи `basic`): поворот навколо самого pivot виносить корінець за силует круп'я.
 * Тож хвіст повертаємо навколо корінця: `tail(кут)` додає зсув, що лишає корінець на місці.
 */
const TAIL_ROOT: Vec2 = { x: 3.5, y: 0.5 };

/**
 * Зсув, що тримає корінець хвоста на місці, коли хвіст повернуто на `rot` від вихідної пози й рівномірно масштабовано на
 * `scale` (`catTail` групи `basic`).
 */
function tailShift(rot: number, scale = 1): Vec2 {
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  return { x: TAIL_ROOT.x - scale * (TAIL_ROOT.x * c - TAIL_ROOT.y * s), y: TAIL_ROOT.y - scale * (TAIL_ROOT.x * s + TAIL_ROOT.y * c) };
}

/** Хвіст повернутий на `rot` градусів навколо корінця (поза). */
function tail(rot: number): Tweak {
  const { x, y } = tailShift(rot);
  return { rot, x, y };
}

/**
 * Зсув хвоста накладки: на `rot` від хвоста основної, що лежить під кутом `rest` (і масштабований на `scale`), — навколо
 * корінця. Накладка додається до основної, тож зсув — різниця між поворотом на `rest + rot` і на `rest`.
 */
function tailFrom(rest: number, rot: number, scale = 1): Vec2 {
  const a = tailShift(rest + rot, scale);
  const b = tailShift(rest, scale);
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Доріжка зсуву хвоста накладки за доріжкою його повороту (ключ у ключ, з тими самими переходами). */
function tailFollow(rot: readonly Key<number>[], rest: number, scale = 1): Key<Vec2>[] {
  return rot.map((k) => (k.ease === undefined ? { t: k.t, v: tailFrom(rest, k.v, scale) } : { t: k.t, v: tailFrom(rest, k.v, scale), ease: k.ease }));
}

// --- Лапа до точки ------------------------------------------------------------------------------------
//
// Лапа — одна кістка, тож поставити подушечку в точку (на підлогу, за вухо) — це знайти поворот і масштаб уздовж кістки:
// кут і довжину вектора від суглоба до точки в системі батька (тулуба чи таза). Скелет — числа визначення
// (`new Rig(CAT_RIG)`, без арту): вони дають ту саму вихідну позу, що й точки еталонів (`defs/cat.ts`).

type CatRig = Rig<CatBone, CatSlot, string>;

/** Батько кожної кістки скелета кота. */
const PARENT = new Map<CatBone, CatBone | null>(CAT_RIG.bones.map((bone) => [bone.id, bone.parent]));

/** Скелет кота, що грає анімацію `anim` (ракурс `view`), у момент `t`. */
function rigAt(anim: CatAnim, view: ArtView, t = 0): CatRig {
  const rig = new Rig(CAT_RIG, { facing: { view } }) as unknown as CatRig;
  rig.play(anim, 0, { blend: 0, from: t });
  rig.evaluate(0);
  return rig;
}

/** Скелет кота в позі `pose` (ракурс `view`). */
const rigIn = (pose: Pose, view: ArtView): CatRig => rigAt({ duration: 1, loop: true, bones: still(pose) }, view);

/** Точка `p` системи кістки `bone` — у світі (оцінений скелет). */
function toWorld(rig: CatRig, bone: CatBone, p: Vec2): Vec2 {
  const w = rig.bone(bone).world;
  return { x: w.a * p.x + w.c * p.y + w.tx, y: w.b * p.x + w.d * p.y + w.ty };
}

/** Подушечка лапи (кінець кістки) у світі. */
function pawOf(rig: CatRig, leg: CatBone): Vec2 {
  return toWorld(rig, leg, { x: rig.bone(leg).len, y: 0 });
}

/**
 * Зміна лапи `leg` від вихідної пози (поворот, градуси; масштаб уздовж кістки), за якої її подушечка — у світовій точці
 * `paw`, а решта пози — як у `rig` (суглоб лапи не залежить від її власного повороту й масштабу).
 */
function legTo(rig: CatRig, leg: CatBone, paw: Vec2): { rot: number; sx: number } {
  const bone = rig.bone(leg);
  const parent = PARENT.get(leg);
  const p = parent ? rig.bone(parent).world : { a: 1, b: 0, c: 0, d: 1 };
  const dx = paw.x - bone.world.tx;
  const dy = paw.y - bone.world.ty;
  const det = p.a * p.d - p.b * p.c;
  const lx = (p.d * dx - p.c * dy) / det;
  const ly = (-p.b * dx + p.a * dy) / det;
  let rot = Math.atan2(ly, lx) / DEG - rig.boneSetup(leg).rot;
  rot -= 360 * Math.round(rot / 360);
  return { rot, sx: Math.hypot(lx, ly) / bone.len };
}

// --- Спільні пози (ті самі числа, що в групі `basic`) ------------------------------------------------
//
// Копії поз N1 (`basic.ts`): чухання й тертя очей починаються й закінчуються так, як кіт сидить (`sit`), хропіння — той
// самий клубок, що й сон (`sleep`), разом зі слотами в обох ракурсах. Збіг перевіряє `tests/catfeelings.test.ts`, щойно
// група `basic` — не заглушка; змінилися пози там — змінити й тут.

/**
 * Сидить (`sit` групи `basic`): таз повернутий носом угору навколо стегон, передні лапи прямо вниз, витягнуті й зсунуті вниз
 * уздовж тулуба, хвіст спадає на підлогу.
 */
const SIT: Pose = {
  pelvis: { rot: -32, y: 2 },
  "leg-back-near": { sx: 1.05 },
  "leg-back-far": { rot: 12 },
  "leg-front-near": { rot: 32, x: -4, y: 7, sx: 1.12 },
  "leg-front-far": { rot: 32, x: -5, y: 8.7, sx: 1.12 },
  head: { rot: 30 },
  tail: tail(-95),
};
/**
 * Лапи того, хто сидить, у ракурсі ¾ ззаду (`SIT_BACK` групи `basic`): ближні й дальні там міняються місцями по x, а ближня
 * передня — глибше в груди й трохи навскіс уперед, під тулубом (`NEAR_FRONT_UNDER`).
 */
const SIT_BACK_LEGS: Pose = {
  "leg-back-near": { rot: 16, sx: 1.02 },
  "leg-back-far": { rot: -5 },
  "leg-front-near": { rot: 20, x: -12.5, y: 7.6, sx: 1.08 },
  "leg-front-far": { rot: 32, x: -4, y: 7.5, sx: 1.13 },
};
const SIT_BACK: Pose = { ...SIT, ...SIT_BACK_LEGS };
/** Кут хвоста кота, що сидить, — від нього б'є хвостом накладка під рукою (для інших основ — `catOverlayOn`). */
const SIT_TAIL = -95;

/**
 * Ракурс ¾ ззаду: ближня передня лапа там на самому краю грудей, тож малюється під тулубом (z 4,9) і, де стоїть у вихідному
 * суглобі, трохи всередину (`BACK_NEAR_IN`) — як `NEAR_FRONT_UNDER`, `NEAR_FRONT_IN` і `BACK_NEAR` групи `basic`. Біля
 * морди (тре очі) — під головою (z 2,8, як у вмиванні `groom`).
 */
const BACK_NEAR_IN = -3.5;
const NEAR_FRONT_Z = 4.9;
const NEAR_FRONT_UNDER: SlotSet = { "leg-front-near": { z: [{ t: 0, v: NEAR_FRONT_Z }] } };
const NEAR_FRONT_IN: Tracks = { "leg-front-near": { pos: [{ t: 0, v: { x: BACK_NEAR_IN, y: 0 } }] } };
/** Перевизначення ракурсу ззаду для поз, де ближня передня лапа — у вихідному суглобі (стоїть, іде, присів). */
const BACK_NEAR = { bones: NEAR_FRONT_IN, slots: NEAR_FRONT_UNDER };
const PAW_AT_FACE_BACK_Z = 2.8;

/**
 * Лапи, підібрані під тулуб того, хто лежить (`TUCKED` групи `basic`): де лапи сховані слотами, кістки однаково підібрані —
 * наступна анімація вмикає слоти з першого кадру, і змішування починається з лап під тулубом, а не з прямих лап крізь підлогу.
 */
const TUCKED: Pose = {
  "leg-back-near": { rot: -15, sx: 0.35 },
  "leg-back-far": { rot: -15, sx: 0.35 },
  "leg-front-near": { rot: -40, sx: 0.4 },
  "leg-front-far": { rot: -40, sx: 0.4 },
};
/**
 * Клубок (`sleep` групи `basic`): тулуб коротший і круглий, лапи сховані під собою (видно лише ближню передню під
 * підборіддям), голова лежить носом донизу перед грудьми, хвіст обгорнув кота спереду — у ¾ спереду поверх тулуба.
 */
const CURL: Pose = {
  ...TUCKED,
  pelvis: { y: 11 },
  body: { rot: -4, sx: 0.84, sy: 1.08 },
  neck: { x: -5, y: 12 },
  head: { rot: 26 },
  tail: tail(125),
};
const HIDDEN: SlotTracks = { visible: [{ t: 0, v: false }] };
const CURL_SLOTS: SlotSet = {
  "leg-back-far": HIDDEN,
  "leg-back-near": HIDDEN,
  "leg-front-far": HIDDEN,
  tail: { z: [{ t: 0, v: 5.5 }] },
};
/** Клубок ззаду: лапи під підборіддям не видно, хвіст — за тулубом уздовж низу (поверх крупа читався б як ручка). */
const CURL_BACK_SLOTS: SlotSet = { "leg-front-near": HIDDEN, tail: { z: [{ t: 0, v: 4.9 }] } };

/** Від основи таза до плечей уздовж тулуба (одиниці арту) і довжина лапи (`len` кісток лап). */
const SHOULDER = 28;
const LEG = 20.5;

/**
 * У скільки разів подовжити передні лапи, щоб подушечки лишилися на підлозі, коли плечі піднялися на `lift` одиниць, а
 * тулуб став товщим у `sy` разів. Лапа — дитина тулуба під прямим кутом, тож його масштаб упоперек (дихання, стиснутий
 * живіт) подовжує чи вкорочує й лапу. `sx` — масштаб лапи в позі, до якої додається зміна.
 */
const frontReach = (sx: number, lift: number, sy: number): number => (sx + lift / LEG) / sy / sx;

/** Доріжка масштабу передніх лап, що гасить подовження від дихання тулуба (`body` — його доріжка масштабу). */
const frontBreath = (body: readonly Key<Vec2>[]): Key<Vec2>[] => body.map((k) => ({ ...k, v: { x: 1 / k.v.y, y: 1 } }));

// --- Хода ---------------------------------------------------------------------------------------------
//
// Ті самі ритм, розмах і крок, що в ході групи `basic` (рись: діагональні пари лап, цикл `WALK_MS`, крок
// `CAT_WALK_STRIDE`): опорна лапа йде назад рівномірно, з тією самою швидкістю, тож кульгання, незграбну й сумну ходу вигляд
// грає з тією самою швидкістю відтворення, що й звичайну (`catWalkRate` групи `basic`), — і лапи не ковзають.

/** Цикл ходи, мс. */
const WALK_MS = 340;
/** Розмах лап, градуси від вертикалі: однаковий спереду й ззаду (жодна лапа пари не ковзає відносно другої). */
const WALK_AMP = 34;
/** Наскільки таз нижчає на зміні пар (лапи навскіс), щоб подушечки лишалися на підлозі. */
const WALK_BOB = 2;
/** Лапа на краях опори трохи витягнута, у переносі — підібрана. */
const WALK_REACH = 1.08;
const WALK_LIFT = 0.78;

/** Розмах лапи, коротшої в `k` разів, за якого крок той самий, що в ході (кіт іде з тією самою швидкістю). */
const ampFor = (k: number): number => Math.asin(Math.sin(WALK_AMP * DEG) / k) / DEG;
/** Наскільки таз нижчає на зміні пар для лапи, коротшої в `k` разів, з розмахом `amp`: як `WALK_BOB`, пропорційно. */
const bobFor = (k: number, amp: number): number => (WALK_BOB * k * (1 - WALK_REACH * Math.cos(amp * DEG))) / (1 - WALK_REACH * Math.cos(WALK_AMP * DEG));

/** Лапа в ході (рись), як у групі `basic`: опора з `start` пів циклу, далі перенос; `lift` — наскільки підібрана в переносі. */
function gaitLeg(T: number, amp: number, start: 0 | 0.5, lift = WALK_LIFT, reach = WALK_REACH): BoneTracks {
  const H = T / 2;
  const Q = T / 4;
  if (start === 0) {
    return {
      rot: [
        { t: 0, v: -amp },
        { t: H, v: amp, ease: "inOut" },
        { t: T, v: -amp },
      ],
      scale: [
        { t: 0, v: { x: reach, y: 1 }, ease: "out" },
        { t: Q, v: { x: 1, y: 1 }, ease: "in" },
        { t: H, v: { x: reach, y: 1 }, ease: "inOut" },
        { t: H + Q, v: { x: lift, y: 1 }, ease: "inOut" },
        { t: T, v: { x: reach, y: 1 } },
      ],
    };
  }
  return {
    rot: [
      { t: 0, v: amp, ease: "inOut" },
      { t: H, v: -amp },
      { t: T, v: amp },
    ],
    scale: [
      { t: 0, v: { x: reach, y: 1 }, ease: "inOut" },
      { t: Q, v: { x: lift, y: 1 }, ease: "inOut" },
      { t: H, v: { x: reach, y: 1 }, ease: "out" },
      { t: H + Q, v: { x: 1, y: 1 }, ease: "in" },
      { t: T, v: { x: reach, y: 1 } },
    ],
  };
}

/** Таз підстрибує двічі за цикл: найвище — посередині опори, найнижче — на зміні пар; `y0` — постійний зсув донизу. */
function gaitBob(T: number, bob: number, y0 = 0): BoneTracks {
  const Q = T / 4;
  return {
    pos: [
      { t: 0, v: { x: 0, y: y0 + bob }, ease: "out" },
      { t: Q, v: { x: 0, y: y0 }, ease: "in" },
      { t: 2 * Q, v: { x: 0, y: y0 + bob }, ease: "out" },
      { t: 3 * Q, v: { x: 0, y: y0 }, ease: "in" },
      { t: T, v: { x: 0, y: y0 + bob } },
    ],
  };
}

/**
 * Кульгає (травма, §9.5): ближня передня болить — її кіт тримає підібраною попереду й лише ледь торкається нею підлоги
 * посередині свого кроку; здорова передня стоїть довше (`LIMP_STANCE` циклу замість половини) і швидко «підскоком»
 * переноситься вперед. Плечі й голова злітають, коли ступає хвора (кіт знімає з неї вагу), і падають, коли вага на здоровій,
 * — нерівний кивок, який видно й на телефоні. Задні — рись, як у звичайній ході. Передні лапи на підлозі рахує `legTo`:
 * подушечка стоїть на лінії підлоги й іде назад з тією самою швидкістю, що в ході (`WALK_SPEED`), — не ковзає й не пірнає,
 * хоч плечі й хиляться.
 */
/** Частка циклу, яку здорова передня стоїть на підлозі (у ході — половина). */
const LIMP_STANCE = 0.58;
/** Частка циклу, яку хвора лапа торкається підлоги (посередині своєї опори). */
const LIMP_TOUCH = 0.18;
/** Хвора лапа в повітрі: тримає вперед і підібрана (поворот, масштаб уздовж). */
const LIMP_HELD = { rot: -42, sx: 0.6 };
/** Здорова лапа посередині переносу: наскільки підібрана. */
const LIMP_HOP = 0.74;
/** Наскільки кіт іде за мілісекунду ходи, одиниці арту: за цикл `WALK_MS` — крок `CAT_WALK_STRIDE` довжин лапи. */
const WALK_SPEED = (4 * WALK_REACH * Math.sin(WALK_AMP * DEG) * LEG) / WALK_MS;

/** М'який перехід 0 → 1. */
const smooth = (u: number): number => u * u * (3 - 2 * u);

/**
 * Передні лапи кульгання в ракурсі `view` за рештою ходи `core` (плечі, таз; `extra` — перевизначення ракурсу): щільні ключі
 * (кожні 10 мс) повороту й масштабу.
 */
function limpFront(core: Tracks, view: ArtView, extra: Tracks): Tracks {
  const T = WALK_MS;
  const STEP = 10;
  const rig = new Rig(CAT_RIG, { facing: { view } }) as unknown as CatRig;
  rig.evaluate(0);
  const floor = { "leg-front-near": pawOf(rig, "leg-front-near").y, "leg-front-far": pawOf(rig, "leg-front-far").y };
  rig.play({ duration: T, loop: true, bones: merge(core, extra) }, 0, { blend: 0 });
  const at = (t: number): CatRig => {
    rig.evaluate(((t % T) + T) % T);
    return rig;
  };
  /**
   * Лапа на підлозі в опорі [from, to] (мс, `to` може бути за кінцем циклу): посередині — під плечем, далі йде назад з
   * швидкістю ходи. `t` — у межах опори (розгорнутий час).
   */
  const planted = (leg: "leg-front-near" | "leg-front-far", from: number, to: number) => {
    const mid = (from + to) / 2;
    const x0 = at(mid).bone(leg).world.tx;
    return (t: number): { rot: number; sx: number } => legTo(at(t), leg, { x: x0 - WALK_SPEED * (t - mid), y: floor[leg] });
  };
  // Здорова (дальня) передня: опора навколо 3/4 циклу, як у рисі, але довша; перенос — швидкий підскок.
  const farFrom = 0.75 * T - (LIMP_STANCE * T) / 2;
  const farTo = 0.75 * T + (LIMP_STANCE * T) / 2;
  const far = planted("leg-front-far", farFrom, farTo);
  const farLift = far(farTo);
  const farLand = far(farFrom);
  const farAt = (t: number): { rot: number; sx: number } => {
    const u = t < farFrom ? t + T : t;
    if (u <= farTo) return far(u);
    const k = (u - farTo) / (farFrom + T - farTo);
    const sx = farLift.sx + (farLand.sx - farLift.sx) * k;
    return { rot: farLift.rot + (farLand.rot - farLift.rot) * smooth(k), sx: sx - (sx - LIMP_HOP) * Math.sin(Math.PI * k) };
  };
  // Хвора (ближня) передня: торкається посередині своєї опори (1/4 циклу), решту часу — підібрана попереду.
  const nearFrom = 0.25 * T - (LIMP_TOUCH * T) / 2;
  const nearTo = 0.25 * T + (LIMP_TOUCH * T) / 2;
  const near = planted("leg-front-near", nearFrom, nearTo);
  const nearUp = near(nearTo);
  const nearDown = near(nearFrom);
  const held = 0.75 * T;
  const nearAt = (t: number): { rot: number; sx: number } => {
    const u = t < nearFrom ? t + T : t;
    if (u <= nearTo) return near(u);
    // Відриваючись, лапа спершу підбирається (масштаб випереджає поворот), а опускаючись — спершу виноситься вперед і лише
    // тоді випрямляється до підлоги: так подушечка не черкає підлогу, коли лапа проходить під плечем.
    const lifting = u < held;
    const [a, b, k] = lifting ? [nearUp, LIMP_HELD, (u - nearTo) / (held - nearTo)] : [LIMP_HELD, nearDown, (u - held) / (nearFrom + T - held)];
    const fast = 1 - (1 - k) * (1 - k);
    const slow = k * k;
    return { rot: a.rot + (b.rot - a.rot) * (lifting ? slow : fast), sx: a.sx + (b.sx - a.sx) * (lifting ? fast : slow) };
  };
  const out: Tracks = {};
  for (const [leg, f] of [
    ["leg-front-far", farAt],
    ["leg-front-near", nearAt],
  ] as const) {
    const rot: Key<number>[] = [];
    const scale: Key<Vec2>[] = [];
    for (let t = 0; t <= T; t += STEP) {
      const { rot: r, sx } = f(t === T ? 0 : t);
      rot.push({ t, v: r });
      scale.push({ t, v: { x: sx, y: 1 } });
    }
    out[leg] = { ...extra[leg], rot, scale };
  }
  return out;
}

function limpAnim(): CatAnim {
  const T = WALK_MS;
  const H = T / 2;
  const Q = T / 4;
  const core: Tracks = {
    pelvis: gaitBob(T, WALK_BOB),
    "leg-back-far": gaitLeg(T, WALK_AMP, 0),
    "leg-back-near": gaitLeg(T, WALK_AMP, 0.5),
    // Плечі: угору, коли ступає хвора, униз, коли вага на здоровій (від'ємний поворот тулуба — плечі вище).
    body: {
      rot: keys([
        [0, 0],
        [Q, -2],
        [H, 0.5],
        [H + Q, 2.5],
        [T, 0],
      ]),
    },
    // Кивок: угору, поки хвора лапа на підлозі, униз — коли вага на здоровій.
    neck: {
      rot: keys([
        [0, 0],
        [H * 0.5, -9],
        [H, 0],
        [H * 1.5, 9],
        [T, 0],
      ]),
    },
    head: {
      rot: keys([
        [0, 0],
        [H * 0.5, -3],
        [H, 0],
        [H * 1.5, 5],
        [T, 0],
      ]),
    },
    // Хвіст нижче, ніж у звичайній ході, похитується для рівноваги.
    tail: {
      rot: osc(T, [-62, -54]),
      pos: [
        { t: 0, v: tailShift(-62), ease: "inOut" },
        { t: H, v: tailShift(-54), ease: "inOut" },
        { t: T, v: tailShift(-62) },
      ],
    },
  };
  return {
    duration: T,
    loop: true,
    bones: { ...core, ...limpFront(core, "front", {}) },
    views: { back: { bones: limpFront(core, "back", NEAR_FRONT_IN), slots: NEAR_FRONT_UNDER } },
  };
}

/**
 * Незграбна хода (хребет, §9.5): задні лапи ступають невпевнено й не в такт передніх — цикл із двох кроків неоднаковий. На
 * першому круп ледь хитається, на другому ближня задня підгинається: круп осідає (кіт ніби провалюється задом, а передні
 * лишаються на підлозі), дальня задня волочиться; задні лапи ступають коротше й твердіше за передні, хвіст низько й ходить
 * широко, ловлячи рівновагу, голова опущена — кіт дивиться під ноги.
 */
function clumsyAnim(): CatAnim {
  const S = WALK_MS;
  const T = 2 * S;
  const H = S / 2;
  const leg = (amp: number, start: 0 | 0.5, lift = WALK_LIFT): BoneTracks => {
    const one = gaitLeg(S, amp, start, lift);
    return { rot: twice(one.rot ?? [], S), scale: twiceV(one.scale ?? [], S) };
  };
  const trot: Tracks = {
    pelvis: { pos: twiceV(gaitBob(S, WALK_BOB).pos ?? [], S) },
    "leg-front-near": leg(WALK_AMP, 0),
    "leg-front-far": leg(WALK_AMP, 0.5),
    // Задні ледь відриваються від підлоги: тверді, човгають.
    "leg-back-far": leg(WALK_AMP, 0, 0.9),
    "leg-back-near": leg(WALK_AMP, 0.5, 0.9),
  };
  // Осідання крупа на `r` градусів: таз повертається носом угору навколо стегон і опускається так, що плечі лишаються на
  // місці; передні лапи й шия повертаються назад на той самий кут, задні коротшають на стільки, на скільки осіли стегна.
  const sag = (r: number, head = 0): Pose => {
    const drop = SHOULDER * Math.sin(r * DEG);
    // Лапи стоять навскіс, а стегна трохи нижчають і від повороту таза — коротшають із запасом.
    const k = 1 - (1.33 * drop) / LEG;
    return {
      pelvis: { rot: -r, y: drop },
      "leg-front-near": { rot: r },
      "leg-front-far": { rot: r },
      "leg-back-near": { rot: r, sx: k },
      "leg-back-far": { rot: r, sx: k },
      neck: { rot: r + head },
    };
  };
  const wobble = posed([
    { t: 0, pose: sag(0, 4) },
    { t: H * 0.7, pose: sag(3, 6) },
    { t: S, pose: sag(0, 3) },
    { t: S + H * 0.5, pose: sag(5, 6), ease: "in" },
    { t: S + H * 0.85, pose: sag(11, 10), ease: "out" },
    { t: S + H * 1.5, pose: sag(4, 5) },
    { t: T, pose: sag(0, 4) },
  ]);
  return {
    duration: T,
    loop: true,
    bones: merge(layer(T, trot, wobble), {
      tail: tailKeys(
        [
          [0, -72],
          [S * 0.55, -48],
          [S * 1.3, -88],
          [T, -72],
        ],
        0,
      ),
    }),
    views: { back: BACK_NEAR },
  };
}

/** Доріжка кроку `S` мс, повторена двічі (цикл з двох кроків). */
function twice(list: readonly Key<number>[], S: number): Key<number>[] {
  return [...list.slice(0, -1), ...list.map((k) => ({ ...k, t: k.t + S }))];
}
function twiceV(list: readonly Key<Vec2>[], S: number): Key<Vec2>[] {
  return [...list.slice(0, -1), ...list.map((k) => ({ ...k, t: k.t + S }))];
}

/**
 * Дві анімації в одну за щільними ключами (кожні `step` мс): повороти й зсуви додаються, масштаби множаться — як накладка
 * поверх основної, але вже в самих доріжках (коли рух складається з ходи й окремого коливання).
 */
function layer(T: number, base: Tracks, delta: Tracks, step = 20): Tracks {
  const out: Tracks = {};
  const v: Vec2 = { x: 0, y: 0 };
  const times: number[] = [];
  for (let t = 0; t < T; t += step) times.push(t);
  times.push(T);
  for (const bone of BONES) {
    const a = base[bone];
    const b = delta[bone];
    if (!a && !b) continue;
    const rot = a?.rot ?? b?.rot ? times.map((t) => ({ t, v: (a?.rot ? sampleNumber(a.rot, t) : 0) + (b?.rot ? sampleNumber(b.rot, t) : 0) })) : undefined;
    const vec = (ka: readonly Key<Vec2>[] | undefined, kb: readonly Key<Vec2>[] | undefined, mul: boolean): Key<Vec2>[] | undefined =>
      ka ?? kb
        ? times.map((t) => {
            const p = ka ? { ...sampleVec(ka, t, v) } : mul ? { x: 1, y: 1 } : { x: 0, y: 0 };
            const q = kb ? sampleVec(kb, t, v) : mul ? { x: 1, y: 1 } : { x: 0, y: 0 };
            return { t, v: mul ? { x: p.x * q.x, y: p.y * q.y } : { x: p.x + q.x, y: p.y + q.y } };
          })
        : undefined;
    const pos = vec(a?.pos, b?.pos, false);
    const scale = vec(a?.scale, b?.scale, true);
    out[bone] = { ...(rot ? { rot } : {}), ...(pos ? { pos } : {}), ...(scale ? { scale } : {}) };
  }
  return out;
}

/**
 * Сумна хода (§11.4): та сама рись, але кіт пригнувся, голова опущена носом донизу, хвіст звисає й ледь хитається, лапи
 * в переносі ледь піднімаються — плететься.
 */
function sadWalkAnim(): CatAnim {
  const T = WALK_MS;
  /** Наскільки кіт пригнувся: таз нижче, лапи коротші на стільки ж. */
  const LOW = 1.5;
  const k = 1 - LOW / LEG;
  // Розмах ширший на стільки, на скільки лапи коротші: за крок кіт проходить стільки ж, скільки у звичайній ході.
  const amp = ampFor(k);
  const leg = (start: 0 | 0.5): BoneTracks => {
    const tracks = gaitLeg(T, amp, start, 0.88, WALK_REACH);
    return { ...tracks, scale: (tracks.scale ?? []).map((key) => ({ ...key, v: { x: key.v.x * k, y: key.v.y } })) };
  };
  return {
    duration: T,
    loop: true,
    bones: {
      pelvis: gaitBob(T, bobFor(k, amp), LOW),
      "leg-front-near": leg(0),
      "leg-back-far": leg(0),
      "leg-front-far": leg(0.5),
      "leg-back-near": leg(0.5),
      neck: { pos: [{ t: 0, v: { x: 2, y: 4 } }], rot: osc(T, [13, 15, 13, 15]) },
      head: { rot: osc(T, [10, 11.5, 10, 11.5]) },
      tail: {
        rot: osc(T, [-118, -112]),
        pos: [
          { t: 0, v: tailShift(-118), ease: "inOut" },
          { t: T / 2, v: tailShift(-112), ease: "inOut" },
          { t: T, v: tailShift(-118) },
        ],
      },
    },
    views: { back: BACK_NEAR },
  };
}

// --- Хвороби ------------------------------------------------------------------------------------------

/**
 * Кашель перед шерстяною грудкою (§9.5): кіт присів на всі чотири, шия витягнута вперед і низько, і раз у раз двічі поспіль
 * «гикає» — живіт стискається, плечі смикаються, голова тягнеться вперед і вниз, — а тоді віддихується.
 */
const COUGH: Pose = {
  pelvis: { y: 5, rot: -4 },
  "leg-back-near": { rot: -14, sx: 0.78 },
  "leg-back-far": { rot: -10, sx: 0.8 },
  "leg-front-near": { rot: -8, sx: 0.85 },
  "leg-front-far": { rot: -8, sx: 0.85 },
  neck: { x: 6, y: 8, rot: 20 },
  head: { rot: -10 },
  tail: tail(-85),
};
/** Поштовх кашлю поверх `COUGH`: живіт стиснутий, спина горбиться, шия й голова тягнуться вперед і вниз. */
const HACK: Pose = {
  body: { y: -2, sy: 0.93 },
  "leg-front-near": { sx: frontReach(0.85, 2, 0.93) },
  "leg-front-far": { sx: frontReach(0.85, 2, 0.93) },
  neck: { x: 3, y: 2.5, rot: 10 },
  head: { rot: 8 },
};
const COUGH_MS = 1300;

function coughAnim(): CatAnim {
  const hack = over(COUGH, HACK);
  const breath = over(COUGH, { body: { sy: 1.03 } });
  return {
    duration: COUGH_MS,
    loop: true,
    bones: posed([
      { t: 0, pose: COUGH, ease: "in" },
      { t: 90, pose: hack, ease: "out" },
      { t: 230, pose: COUGH, ease: "in" },
      { t: 330, pose: hack, ease: "out" },
      { t: 520, pose: COUGH },
      { t: 900, pose: breath },
      { t: COUGH_MS, pose: COUGH },
    ]),
    views: { back: BACK_NEAR },
  };
}

/**
 * Чхання (застуда) — накладка: «а-а…» — голова відкидається носом угору, рот відкривається; «чхи!» — різкий кивок униз;
 * відскок і назад. Рухає лише шию й голову; в кінці — нуль. Очі заплющені все чхання (як у разовій події, `catevents.ts`):
 * так і кіт, що спить клубком (застуда чхає й уві сні), не розплющує очей посеред чхання.
 */
function sneezeAnim(): CatAnim {
  const T = CAT_ONE_SHOT_MS.sneeze;
  return {
    duration: T,
    loop: false,
    // Кивок «чхи!» неглибокий (голова кота, що спить клубком чи їсть, і так біля підлоги), а різкий — від високого «а-а».
    bones: posed([
      { t: 0, pose: {} },
      { t: 300, pose: { neck: { rot: -8 }, head: { rot: -15 } }, ease: "in" },
      { t: 365, pose: { neck: { rot: 3, x: 1.5 }, head: { rot: 7 } }, ease: "out" },
      { t: 460, pose: { neck: { rot: -2 }, head: { rot: -3 } } },
      { t: 550, pose: { neck: { rot: 1 }, head: { rot: 3 } } },
      { t: T, pose: {} },
    ]),
    slots: {
      eyes: frames([[0, "closed"]]),
      mouth: frames([
        [0, "closed"],
        [180, "meow"],
        [480, "closed"],
      ]),
    },
  };
}

/**
 * Чухає задньою лапою за вухом (блохи, дерматит): сидячи (як `sit`), кіт втягує голову й пригинає її до лапи (шия нижче й
 * назад, голова носом донизу), ближня задня лапа злітає — спершу коліном угору, підібрана, тоді випрямляється за вухо — і
 * часто-часто чеше згори вниз, голова трусится в такт; наприкінці лапа так само підбирається й стає на підлогу. Куди дістає
 * лапа, рахує `legTo`: подушечка — у точках за вухом (система голови), тож і спереду, і ззаду лапа закінчується на голові,
 * а не на шиї чи плечі (ззаду вона йде від стегна вгору до потилиці, а не смугою навскіс через бік до плеча).
 */
/** Наскільки кіт пригинає голову, коли чухається: зсув шиї (назад і вниз уздовж тулуба) і поворот голови носом донизу. */
const ITCH_LEAN: Pose = { neck: { x: -8, y: 5 }, head: { rot: 10 } };
/** Де чеше лапа (система голови: (0, 0) — pivot голови, основа ближнього вуха — над ним, (−0,5; −15,5)): за вухом і нижче. */
const ITCH_TOP: Vec2 = { x: -4, y: -10 };
const ITCH_LOW: Vec2 = { x: -6, y: -5.5 };
/** Лапа на півдорозі (коліном угору): поворот уперед і наскільки підібрана. */
const ITCH_TUCK: Tweak = { rot: -95, sx: 0.72 };

function itchTracks(sit: Pose, view: ArtView): Tracks {
  const T = CAT_ONE_SHOT_MS.itch;
  const lean = over(sit, ITCH_LEAN);
  /** Поза удару: голова трусится на `h`, подушечка — у точці `spot` системи голови. */
  const raised = (h: number, spot: Vec2): Pose => {
    const pose = over(lean, { head: { rot: h } });
    const rig = rigIn(pose, view);
    return { ...pose, "leg-back-near": legTo(rig, "leg-back-near", toWorld(rig, "head", spot)) };
  };
  const tucked: Pose = { ...lean, "leg-back-near": ITCH_TUCK };
  const strokes: Frame[] = [];
  // Часті удари лапою: згори за вухом униз і назад кожні 45 мс, голова трусится назустріч.
  for (let t = 200, i = 0; t < 1300; t += 45, i++) strokes.push({ t, pose: i % 2 === 0 ? raised(1.5, ITCH_TOP) : raised(-1.5, ITCH_LOW) });
  return posed([
    { t: 0, pose: sit },
    { t: 110, pose: tucked },
    ...strokes,
    { t: 1330, pose: raised(0, ITCH_TOP) },
    { t: 1440, pose: tucked },
    { t: T, pose: sit },
  ]);
}

function itchAnim(): CatAnim {
  return {
    duration: CAT_ONE_SHOT_MS.itch,
    loop: false,
    bones: itchTracks(SIT, "front"),
    views: { back: { bones: legsOf(itchTracks(SIT_BACK, "back")), slots: NEAR_FRONT_UNDER } },
  };
}
/** Доріжки лише лап (для перевизначення ракурсу ¾ ззаду, де лапи інакше сягають підлоги). */
function legsOf(tracks: Tracks): Tracks {
  const out: Tracks = {};
  for (const leg of ["leg-back-near", "leg-back-far", "leg-front-near", "leg-front-far"] as const) if (tracks[leg]) out[leg] = tracks[leg];
  return out;
}

/**
 * Тре очі лапою (кон'юнктивіт): сидячи, ближня передня лапа піднімається до морди й тричі проводить від чола вниз через око,
 * голова схиляється назустріч лапі, — і лапа знову на підлозі. Поки лапа біля морди, її кадр малюється поверх голови.
 */
function rubTracks(sit: Pose, leg: number): Tracks {
  const T = CAT_ONE_SHOT_MS.rubEyes;
  const near = sit["leg-front-near"] ?? {};
  const bowed = over(sit, { neck: { x: 2, y: 5 }, head: { rot: 14 } });
  const paw = (d: number, h: number): Pose => ({ ...bowed, "leg-front-near": { ...near, rot: leg + d, sx: 0.94 }, head: { rot: (bowed.head?.rot ?? 0) + h } });
  const wipes: Frame[] = [];
  for (let i = 0; i < 3; i++) {
    const t = 230 + i * 310;
    wipes.push({ t, pose: paw(-12, -3) }, { t: t + 190, pose: paw(12, 4) });
  }
  return posed([{ t: 0, pose: sit }, { t: 180, pose: paw(-6, 0), ease: "out" }, ...wipes, { t: 1180, pose: paw(0, 0) }, { t: T, pose: sit }]);
}

function rubEyesAnim(): CatAnim {
  const T = CAT_ONE_SHOT_MS.rubEyes;
  return {
    duration: T,
    loop: false,
    bones: rubTracks(SIT, -130),
    slots: {
      "leg-front-near": {
        z: [
          { t: 0, v: 7 },
          { t: 60, v: 12.5 },
          { t: 1330, v: 7 },
        ],
      },
    },
    // Ззаду лапа біля морди — під головою (морда по той бік), а біля підлоги — під тулубом, як у `sit`.
    views: {
      back: {
        bones: legsOf(rubTracks(SIT_BACK, -130)),
        slots: {
          "leg-front-near": {
            z: [
              { t: 0, v: NEAR_FRONT_Z },
              { t: 110, v: PAW_AT_FACE_BACK_Z },
              { t: 1300, v: NEAR_FRONT_Z },
            ],
          },
        },
      },
    },
  };
}

/**
 * Блює чи зригує грудку (розлад шлунка, ковтає надто швидко, шерстяна грудка): присідає з витягнутою шиєю (як у кашлі),
 * тричі важко стискається животом — щоразу сильніше, — різко тягнеться головою до підлоги з відкритим ротом і повільно
 * випрямляється, стоячи. Від початку до кінця кіт пригнічений (`QUEASY`): хвіст низько, голова ледь опущена — не здіймає
 * хвоста «знаком питання», як привітний кіт, що стоїть, і не випинається, перш ніж основа (сидить, їсть) його посадить.
 */
const QUEASY: Pose = { neck: { rot: 3 }, head: { rot: 5 }, tail: tail(-72) };

function vomitAnim(): CatAnim {
  const T = CAT_ONE_SHOT_MS.vomit;
  const low = over(COUGH, { neck: { y: 3, rot: 4 }, head: { rot: 8 } });
  const heave = (k: number): Pose => {
    const reach = frontReach(0.85, 1.2 * k, 1 - 0.06 * k);
    return over(low, { body: { y: -1.2 * k, sy: 1 - 0.06 * k }, "leg-front-near": { sx: reach }, "leg-front-far": { sx: reach }, neck: { x: 1.5 * k, y: 1 * k, rot: 4 * k }, head: { rot: 4 * k } });
  };
  // Видих: плечі опускаються (тулуб носом униз на 3°), живіт стиснутий.
  const expelReach = frontReach(0.85, -SHOULDER * Math.sin(3 * DEG), 0.9);
  const expel = over(low, { body: { rot: 3, sy: 0.9 }, "leg-front-near": { sx: expelReach }, "leg-front-far": { sx: expelReach }, neck: { x: 2, y: 1, rot: 2 }, head: { rot: 6 } });
  return {
    duration: T,
    loop: false,
    bones: posed([
      { t: 0, pose: QUEASY, ease: "out" },
      { t: 180, pose: low },
      { t: 300, pose: heave(0.8), ease: "inOut" },
      { t: 420, pose: low },
      { t: 560, pose: heave(1.1) },
      { t: 680, pose: low, ease: "in" },
      { t: 900, pose: heave(1.4), ease: "in" },
      { t: 990, pose: expel },
      { t: 1180, pose: expel },
      { t: T, pose: QUEASY },
    ]),
    slots: {
      mouth: frames([
        [0, "closed"],
        [960, "meow"],
        [1260, "closed"],
      ]),
    },
    views: { back: BACK_NEAR },
  };
}

/**
 * Задишка після гри (дихання, серце) — разова накладка: часте дихання животом з відкритим ротом і висолопленим язиком, голова
 * трохи піднята й киває в такт; до кінця кіт віддихується — подих рідшає й мілішає, рот закривається. Рухає тулуб (лише
 * масштаб упоперек), шию й голову.
 */
function pantAnim(): CatAnim {
  const T = CAT_ONE_SHOT_MS.pant;
  const body: Key<Vec2>[] = [{ t: 0, v: { x: 1, y: 1 }, ease: "inOut" }];
  const neck: Key<number>[] = [{ t: 0, v: 0, ease: "inOut" }];
  // Подихи: від 260 мс і 9 % до 560 мс і 2 %.
  let t = 120;
  neck.push({ t, v: -5, ease: "inOut" });
  body.push({ t, v: { x: 1, y: 1 }, ease: "inOut" });
  while (t < T - 700) {
    const u = t / T;
    const period = 260 + 300 * u * u;
    const depth = 0.09 - 0.07 * u;
    const lift = -5 * (1 - u);
    body.push({ t: Math.round(t + period * 0.4), v: { x: 1, y: 1 + depth }, ease: "inOut" });
    neck.push({ t: Math.round(t + period * 0.4), v: lift - 1.5 * (1 - u), ease: "inOut" });
    t = Math.round(t + period);
    body.push({ t, v: { x: 1, y: 1 }, ease: "inOut" });
    neck.push({ t, v: lift, ease: "inOut" });
  }
  body.push({ t: T, v: { x: 1, y: 1 } });
  neck.push({ t: T, v: 0 });
  return {
    duration: T,
    loop: false,
    bones: {
      body: { scale: body },
      "leg-front-near": { scale: frontBreath(body) },
      "leg-front-far": { scale: frontBreath(body) },
      neck: { rot: neck },
      head: {
        rot: keys([
          [0, 0],
          [150, -3],
          [T - 900, -2],
          [T, 0],
        ]),
      },
    },
    slots: {
      mouth: frames([
        [0, "closed"],
        [100, "tongue"],
        [T - 800, "meow"],
        [T - 450, "closed"],
      ]),
    },
  };
}

/**
 * Хропе уві сні (проблеми з диханням): той самий клубок, що й сон, але дихає важко й гучно — так, що видно й на телефоні:
 * вдих двома ривками, глибокий (увесь клубок здіймається), на верху вдиху голова сіпається носом угору — «хр!», — а довгий
 * видих іде з тремтінням тулуба й голови. Два подихи за цикл; сон дихає ледь помітно, тож хропіння від нього відрізняє
 * розмах і ривок.
 */
function snoreAnim(): CatAnim {
  const T = 3600;
  const B = T / 2;
  const sx = CURL.body?.sx ?? 1;
  const sy = CURL.body?.sy ?? 1;
  const head = CURL.head?.rot ?? 0;
  const lie = CURL.pelvis?.y ?? 0;
  /** Найглибший подих: тулуб товщає на стільки (частка). */
  const DEPTH = 0.18;
  /**
   * Від основи таза клубка до підлоги, одиниці арту: тулуб товщає вниз і вгору від неї, тож таз піднімається на стільки,
   * на скільки тулуб товщає вниз, — клубок здіймається, а не пірнає в підлогу.
   */
  const FLOOR = 9;
  // Подих: [мс від початку, частка глибини, кивок голови (від'ємний — носом угору), перехід].
  const breath: readonly (readonly [number, number, number, Ease])[] = [
    [0, 0, 0, "out"],
    [230, 0.5, -1, "inOut"],
    [330, 0.45, -1, "inOut"],
    [620, 1, -2, "in"],
    [690, 1, -9, "out"],
    [800, 0.92, -3, "inOut"],
    // «Р-р-р»: видих із тремтінням тулуба й голови, що згасає.
    [865, 0.8, -5, "inOut"],
    [930, 0.84, -2.5, "inOut"],
    [995, 0.66, -4.5, "inOut"],
    [1060, 0.7, -2.2, "inOut"],
    [1125, 0.52, -3.5, "inOut"],
    [1190, 0.54, -1.8, "inOut"],
    [1255, 0.4, -2.6, "inOut"],
    [1500, 0, 0, "inOut"],
  ];
  const body: Key<Vec2>[] = [];
  const pelvis: Key<Vec2>[] = [];
  const nod: Key<number>[] = [];
  for (let i = 0; i < 2; i++) {
    for (const [dt, f, h, ease] of breath) {
      const t = i * B + dt;
      body.push({ t, v: { x: sx, y: sy * (1 + DEPTH * f) }, ease });
      pelvis.push({ t, v: { x: 0, y: lie - FLOOR * DEPTH * f }, ease });
      nod.push({ t, v: head + h, ease });
    }
  }
  body.push({ t: T, v: { x: sx, y: sy } });
  pelvis.push({ t: T, v: { x: 0, y: lie } });
  nod.push({ t: T, v: head });
  return {
    duration: T,
    loop: true,
    bones: merge(still(CURL), { pelvis: { pos: pelvis }, body: { ...still({ body: CURL.body ?? {} }).body, scale: body }, head: { rot: nod } }),
    slots: CURL_SLOTS,
    views: { back: { slots: CURL_BACK_SLOTS } },
  };
}

// --- Почуття під рукою й на руках (накладки, §9.12, §10) ------------------------------------------------
//
// Під рукою кіт здебільшого сидить (`sit`; «Пастка на животику» — на спині, `belly`), на руках і в душі — `carried`, біля
// вікна — `window`. Доріжки тут — для того, хто сидить: хвіст лежить на підлозі (`SIT_TAIL`), тож удари хвостом — угору від
// нього (додатний поворот піднімає хвіст) і назад на підлогу, а передні лапи стоять. Під інші основи їх підганяє
// `catOverlayOn` (розділ нижче).

/**
 * «Подобається»: мружиться (очі — `catFace`), спокійно погойдується — голова повільно хилиться назустріч руці й назад, хвіст
 * ліниво ворушиться, муркотіння видно диханням, а передні лапки по черзі топчуться. Цикл — як у того, хто сидить (`sit`,
 * 3200 мс): вигляд складає основу з накладкою в одну анімацію спільного періоду, і під рукою стику не видно.
 */
function contentAnim(): CatAnim {
  const T = 3200;
  /** Муркотіння: тулуб двічі за цикл ледь товщає. */
  const purr = [1, 1.025, 1, 1.025];
  // Лапка підібрана (коротша) на своїй чверті циклу; дихання тулуба її не подовжує.
  const knead = (phase: 0 | 1): BoneTracks => {
    const a = phase === 0 ? [0, -9, 0, 0] : [0, 0, 0, -9];
    const s = phase === 0 ? [1, 0.87, 1, 1] : [1, 1, 1, 0.87];
    return { rot: osc(T, a), scale: osc(T, s.map((v, i) => v / (purr[i] ?? 1))).map((k) => ({ ...k, v: { x: k.v, y: 1 } })) };
  };
  return {
    duration: T,
    loop: true,
    bones: {
      neck: { rot: osc(T, [0, 3, 0, -1]) },
      head: { rot: osc(T, [0, 5, 2, -2]) },
      body: { scale: osc(T, purr).map((k) => ({ ...k, v: { x: 1, y: k.v } })) },
      "leg-front-near": knead(0),
      "leg-front-far": knead(1),
      tail: tailKeys([
        [0, 0],
        [T / 2, 10],
        [T, 0],
      ]),
    },
  };
}

/**
 * Хвіст накладки за ключами [t, кут від хвоста основної, перехід до наступного (за замовчуванням `ease`)]: поворот і зсув
 * навколо корінця.
 */
function tailKeys(list: readonly (readonly [number, number, Ease?])[], rest = SIT_TAIL, ease: Ease = "inOut"): BoneTracks {
  const rot = list.map(([t, v, own], i): Key<number> => (i === list.length - 1 ? { t, v } : key(t, v, own ?? ease)));
  return { rot, pos: tailFollow(rot, rest) };
}

/**
 * «Терпить»: кінчиком хвоста коротко сіпає — двічі поспіль, пауза, ще раз, — голова трохи опущена й з кожним сіпанням
 * коротко струшує дотик (вуха й мружені очі — `catFace`). Сіпання дрібні й рідкі — на відміну від «попереджає». На руках
 * хвіст звисає під тулуб і ховається за стегном — там `catOverlayOn` сіпає ним ширше (`RELUCTANT_HANGING_PEAK`), щоб кінчик
 * вилітав з-за стегна.
 */
const RELUCTANT_HANGING_PEAK = 45;

function reluctantAnim(): CatAnim {
  const T = 2200;
  return {
    duration: T,
    loop: true,
    bones: {
      tail: tailKeys([
        [0, 0],
        [200, 0],
        [270, 17],
        [370, 2],
        [440, 14],
        [560, 0],
        [1300, 0],
        [1370, 16],
        [1500, 0],
        [T, 0],
      ]),
      neck: {
        rot: keys([
          [0, 0],
          [240, 0],
          [290, -3.5],
          [390, 0.5],
          [450, -2.5],
          [580, 0],
          [1330, 0],
          [1380, -3.5],
          [1520, 0],
          [T, 0],
        ]),
      },
      // Голова опущена весь час (без погойдування — вигляд, що складає накладку з основою іншого циклу, не дасть стрибка).
      head: { rot: [{ t: 0, v: 4.5 }] },
    },
  };
}

/**
 * «Попереджає» (рішення автора 2026-10-30, п. 4, §10): хвіст б'є сильно й широко — хльоском злітає високо й з розгону гупає
 * об підлогу (короткий відскок), без пауз, удвічі частіше за сіпання «терпить»; голова опущена й трохи відтягнута назад, по
 * спині пробігає здригання шкіри. Вуха «літачком» і сердиті очі — з `catFace`. Цикл (два удари) — 800 мс: ціле число
 * разів укладається в цикл того, хто сидить (3200), і того, хто на спині (2400), — вигляд, що складає основу з накладкою в
 * одну анімацію спільного періоду, грає їх без стрибка на стику.
 */
function warnAnim(): CatAnim {
  const T = 800;
  // Здригання шкіри на спині — щоразу, як хвіст гупає об підлогу.
  const shiver = keysV([
    [0, 1, 1],
    [235, 1, 1],
    [265, 1, 1.03],
    [330, 1, 1],
    [635, 1, 1],
    [665, 1, 1.03],
    [730, 1, 1],
    [T, 1, 1],
  ]);
  return {
    duration: T,
    loop: true,
    bones: {
      // Угору — хльоском (швидко зривається й гальмує вгорі), униз — з розгоном до самої підлоги, тоді відскок.
      tail: tailKeys([
        [0, 0, "out"],
        [120, 72, "inOut"],
        [150, 74, "in"],
        [240, 0, "out"],
        [280, 8, "inOut"],
        [330, 0, "inOut"],
        [400, 0, "out"],
        [520, 68, "inOut"],
        [550, 70, "in"],
        [640, 0, "out"],
        [680, 7, "inOut"],
        [730, 0, "inOut"],
        [T, 0],
      ]),
      neck: { pos: [{ t: 0, v: { x: -1.2, y: 0.5 } }], rot: osc(T, [5, 6]) },
      head: { rot: osc(T, [6, 4]) },
      body: { scale: shiver },
      "leg-front-near": { scale: frontBreath(shiver) },
      "leg-front-far": { scale: frontBreath(shiver) },
    },
  };
}

/** «Пручається»: ритм нерівних ривків, мс (щоб не було схоже на механічне коливання). */
const STRUGGLE_MS = 900;
const JERKS = [0, 110, 230, 380, 470, 600, 760, STRUGGLE_MS] as const;
const jerk = (values: readonly number[]): Key<number>[] => keys(JERKS.map((t, i) => [t, values[i] ?? 0] as const));
const jerkV = (values: readonly (readonly [number, number])[]): Key<Vec2>[] => keysV(JERKS.map((t, i) => [t, values[i]?.[0] ?? 0, values[i]?.[1] ?? 0] as const));

/**
 * «Пручається»: вертиться й вивертається — плечі то зіщулюються, то випинаються, голова то пірнає й смикається назад з-під
 * руки, то крутиться, хвіст хльоскає, а ближньою передньою двічі б'є вперед і вгору — відбивається від руки. Задні лапи й
 * дальня передня стоять на місці: під рукою кіт сидить, тож таз нерухомий (зсув таза тягнув би подушечки по підлозі), а
 * вивертається кіт плечима, шиєю й головою. Там, де лапи не стоять на підлозі (на руках, на спині), вони брикаються
 * (`STRUGGLE_KICKS`, `catOverlayOn`).
 */
/** «Пручається»: плечі то зіщулюються, то випинаються — масштаб тулуба впоперек на кожному ривку. */
const SQUIRM = [1, 1.06, 0.97, 1.07, 0.98, 1.05, 0.97, 1] as const;
/** Удар ближньою передньою: [мс, поворот, наскільки підібрана] — лапа злітає вперед і вгору й повертається на підлогу. */
const SWAT: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [110, -12, 0.95],
  [190, -78, 0.84],
  [260, -70, 0.86],
  [350, 0, 1],
  [380, 0, 1],
  [470, 0, 1],
  [560, -74, 0.84],
  [640, -64, 0.86],
  [760, 0, 1],
  [STRUGGLE_MS, 0, 1],
];

/**
 * Передні лапи «пручається» того, хто сидить (`sit` — поза `SIT` чи `SIT_BACK` ракурсу `view`): дальня стоїть, хоч тулуб і
 * зіщулюється (`legTo` тримає подушечку там, де в `sit`), ближня б'є й стає на те саме місце.
 */
function struggleFront(sit: Pose, view: ArtView): Tracks {
  const v: Vec2 = { x: 0, y: 0 };
  const squirm = jerkV(SQUIRM.map((y) => [1, y] as const));
  const was = rigIn(sit, view);
  /** Зміна лапи від `sit`, за якої вона стоїть на своєму місці, коли тулуб масштабовано впоперек на `y`. */
  const stand = (leg: "leg-front-near" | "leg-front-far", y: number): readonly [number, number] => {
    const solved = legTo(rigIn(over(sit, { body: { sy: y } }), view), leg, pawOf(was, leg));
    return [solved.rot - (sit[leg]?.rot ?? 0), solved.sx / (sit[leg]?.sx ?? 1)];
  };
  const far = SQUIRM.map((y) => stand("leg-front-far", y));
  const near = SWAT.map(([t, r, k]) => (r === 0 && k === 1 ? stand("leg-front-near", sampleVec(squirm, t, v).y) : ([r, k / sampleVec(squirm, t, v).y] as const)));
  return {
    "leg-front-far": { rot: jerk(far.map(([r]) => r)), scale: jerkV(far.map(([, k]) => [k, 1] as const)) },
    "leg-front-near": { rot: keys(SWAT.map(([t], i) => [t, near[i]?.[0] ?? 0] as const)), scale: keysV(SWAT.map(([t], i) => [t, near[i]?.[1] ?? 1, 1] as const)) },
  };
}

function struggleAnim(): CatAnim {
  const T = STRUGGLE_MS;
  return {
    duration: T,
    loop: true,
    bones: {
      body: { scale: jerkV(SQUIRM.map((y) => [1, y] as const)) },
      ...struggleFront(SIT, "front"),
      // Шия смикає голову назад і вниз з-під руки й знову випинає вперед (основа шиї на тулубі, тож лапи стоять).
      neck: {
        rot: jerk([0, -8, 7, -10, 4, -6, 6, 0]),
        pos: jerkV([
          [0, 0],
          [-2.4, 1.6],
          [1.2, -0.6],
          [-2.8, 2],
          [0.8, -0.4],
          [-2, 1.4],
          [1, -0.4],
          [0, 0],
        ]),
      },
      head: { rot: jerk([0, -10, 9, -6, 8, -12, 5, 0]) },
      tail: tailKeys(JERKS.map((t, i) => [t, [0, 34, 6, 40, 10, 36, 4, 0][i] ?? 0] as const)),
    },
    views: { back: { bones: struggleFront(SIT_BACK, "back") } },
  };
}

/** Лапи «пручається», що не стоять на підлозі (висять на руках, стирчать догори): брикаються не в такт одна одній. */
const STRUGGLE_KICKS: Tracks = {
  "leg-back-near": {
    rot: jerk([0, 28, -12, 32, 0, 24, -8, 0]),
    scale: jerkV([
      [1, 1],
      [1.05, 1],
      [0.8, 1],
      [1.06, 1],
      [0.85, 1],
      [1.04, 1],
      [0.9, 1],
      [1, 1],
    ]),
  },
  "leg-back-far": { rot: jerk([0, -8, 26, -4, 30, 0, 20, 0]) },
  "leg-front-near": { rot: jerk([0, -22, 6, -26, 2, -18, 4, 0]) },
  "leg-front-far": { rot: jerk([0, 4, -20, 2, -24, 0, -14, 0]) },
};

/**
 * Повільне кліпання до персонажа (§11.4) — накладка: голова м'яко хилиться носом донизу й так і лишається, поки кіт кліпає
 * (саме кліпання — очі з `catFace`, за `blinkAmount` з `thoughts.ts`). Поза стала, без кивка в такт кліпанню: кліпання йде за
 * годинником гри зі зсувом кота, а накладку вигляд починає тоді, коли кіт почав кліпати, тож кивок і очі розходилися б. Цикл
 * — як у ходи (340 мс), не довший за цикл жодної основи по колу: вигляд, що складає основу з накладкою в одну анімацію
 * спільного періоду (а якщо він задовгий — кількох циклів основи з трохи зміненим темпом накладки, `layeredTiming`), грає
 * основу цілою, а стала накладка стику не має.
 */
const SLOW_BLINK_MS = WALK_MS;

function slowBlinkAnim(): CatAnim {
  return {
    duration: SLOW_BLINK_MS,
    loop: true,
    bones: {
      neck: { rot: [{ t: 0, v: 3 }] },
      head: { rot: [{ t: 0, v: 7 }] },
    },
  };
}

// --- Накладка на основу ---------------------------------------------------------------------------------
//
// Накладка одна на всі основи, а основи різні: хвіст лежить під своїм кутом (сидить — −95, буханцем — −80, на руках — −165),
// а кіт на спині (`belly`, `roll` групи `basic`) — дзеркало згори донизу (таз має масштаб −1 упоперек), тож будь-який поворот
// під тазом там іде у світі навпаки: хвіст, що б'є вгору, пробивав би підлогу. Доріжки накладок вище — для кота, що сидить
// під рукою; `catOverlayOn` підганяє їх під основу, яку грає вигляд.

/** Подушечка, далі за стільки одиниць арту від свого місця на підлозі, — лапа не стоїть (висить на руках, стирчить догори). */
const FREE_PAW = 4;
const LEGS = ["leg-front-near", "leg-front-far", "leg-back-near", "leg-back-far"] as const satisfies readonly CatBone[];
type Leg = (typeof LEGS)[number];
const isLeg = (bone: CatBone): bone is Leg => (LEGS as readonly CatBone[]).includes(bone);

/** Доріжки лап, що в основі не стоять на підлозі: накладка → доріжки (заміняють її власні). */
const FREE_LEG_TRACKS = new WeakMap<CatAnim, Tracks>();
/**
 * Кіт на спині: хвіст основи лежить на підлозі за крупом, а над ним — задні лапи догори й тулуб, і в ¾ спереду хвіст
 * малюється за ними. Удар, ширший за стільки градусів, заводив би хвіст за силует (на піку удару хвоста не видно), тож на
 * основі-дзеркалі удари хвостом стискаються до цього розмаху з тим самим ритмом — хвіст гупає по підлозі збоку від кота.
 */
const MIRROR_TAIL_PEAK = 40;
/**
 * Хвіст основи звисає вперед під тулуб (на руках): кут його кістки у світі — між цими (градуси, 0 — уперед, 90 — донизу). У ¾
 * спереду такий хвіст ховається за задніми лапами й тулубом.
 */
const HANGING_TAIL: readonly [number, number] = [10, 80];
/**
 * Накладки, для яких сіпання хвостом — сама суть («терпить»): на хвості, що звисає під тулуб, вони сіпають ним щонайменше на
 * стільки градусів, щоб кінчик вилітав з-за стегна (накладка → розмах).
 */
const HANGING_TAIL_PEAK = new WeakMap<CatAnim, number>();
/** Підігнані накладки: накладка → основа → підігнана. */
const FITTED = new WeakMap<CatAnim, WeakMap<CatAnim, CatAnim>>();

/** Доріжки кісток анімації в ракурсі: основні з перевизначеннями ракурсу (канал за каналом, як у `rigcore`). */
function bonesIn(anim: CatAnim, view: ArtView): Tracks {
  const out: Tracks = {};
  for (const bone of BONES) {
    const main = anim.bones?.[bone];
    const over = anim.views?.[view]?.bones?.[bone];
    if (main || over) out[bone] = { ...main, ...over };
  }
  return out;
}

/** Лапи, що на початку основи не стоять на підлозі: подушечка далі за `FREE_PAW` від тієї, що у вихідній позі. */
function freeLegs(base: CatAnim): Set<Leg> {
  const rig = new Rig(CAT_RIG);
  const paws = (): number[] =>
    LEGS.map((leg) => {
      const bone = rig.bone(leg);
      return bone.world.b * bone.len + bone.world.ty;
    });
  rig.evaluate(0);
  const rest = paws();
  rig.play(base, 0, { blend: 0 });
  rig.evaluate(0);
  const now = paws();
  return new Set(LEGS.filter((_, i) => Math.abs((now[i] ?? 0) - (rest[i] ?? 0)) > FREE_PAW));
}

/** Чи хвіст основи на початку звисає вперед під тулуб (`HANGING_TAIL`; ракурс ¾ спереду). */
function tailHangs(base: CatAnim): boolean {
  const rig = new Rig(CAT_RIG);
  rig.play(base, 0, { blend: 0 });
  rig.evaluate(0);
  const w = rig.bone("tail").world;
  const angle = Math.atan2(w.b, w.a) / DEG;
  return w.a * w.d - w.b * w.c > 0 && angle > HANGING_TAIL[0] && angle < HANGING_TAIL[1];
}

/** Доріжки, віддзеркалені згори донизу: поворот і зсув упоперек — навпаки. */
function mirrored(tracks: BoneTracks): BoneTracks {
  return {
    ...(tracks.rot ? { rot: tracks.rot.map((k) => ({ ...k, v: -k.v })) } : {}),
    ...(tracks.pos ? { pos: tracks.pos.map((k) => ({ ...k, v: { x: k.v.x, y: -k.v.y } })) } : {}),
    ...(tracks.scale ? { scale: tracks.scale } : {}),
  };
}

/**
 * Накладка `overlay` (будь-яка з `CAT_OVERLAYS`), підігнана під основну `base`, яку грає вигляд (T1: замість самої накладки —
 * `layerAnims(base, catOverlayOn(overlay, base))`; для тієї самої пари — той самий об'єкт, тож кеш вигляду працює):
 * - хвіст повертається від кута хвоста основи навколо свого корінця — корінець не ходить, хоч би де лежав хвіст;
 * - на основі-дзеркалі (кіт на спині: масштаб таза впоперек від'ємний) повороти й зсуви впоперек усіх кісток під тазом —
 *   навпаки, тож хвіст б'є над підлогою, а не крізь неї, і голова киває туди ж, куди в того, хто сидить;
 *   Удари хвостом там не ширші за `MIRROR_TAIL_PEAK`: хвіст лежить за піднятими лапами й тулубом і не має за них заходити;
 * - на хвості, що звисає під тулуб (на руках), «терпить» сіпає ширше (`HANGING_TAIL_PEAK`) — інакше сіпання за стегном не
 *   видно;
 * - лапи, що в основі не стоять на підлозі (звисають на руках, стирчать догори в того, хто на спині), брикаються, якщо
 *   накладка це передбачає («пручається»).
 * Доріжки слотів, тривалість і повтор — накладки.
 */
export function catOverlayOn(overlay: CatAnim, base: CatAnim): CatAnim {
  let byBase = FITTED.get(overlay);
  if (!byBase) {
    byBase = new WeakMap();
    FITTED.set(overlay, byBase);
  }
  const known = byBase.get(base);
  if (known) return known;
  const kicks = FREE_LEG_TRACKS.get(overlay);
  const free = kicks ? freeLegs(base) : new Set<Leg>();
  const hanging = HANGING_TAIL_PEAK.get(overlay);
  const hangs = hanging !== undefined && tailHangs(base);
  const v: Vec2 = { x: 0, y: 0 };
  const fit = (view: ArtView): Tracks => {
    const own = bonesIn(overlay, view);
    const under = bonesIn(base, view);
    const pelvis = under.pelvis?.scale;
    const mirror = pelvis !== undefined && sampleVec(pelvis, 0, v).y < 0;
    const out: Tracks = {};
    for (const bone of BONES) {
      const tracks = (isLeg(bone) && free.has(bone) ? kicks?.[bone] : undefined) ?? own[bone];
      if (!tracks) continue;
      out[bone] = mirror && bone !== "root" && bone !== "pelvis" ? mirrored(tracks) : tracks;
    }
    const tail = out.tail;
    if (tail?.rot) {
      // Розмах ударів: на спині — не ширше за `MIRROR_TAIL_PEAK`; на хвості, що звисає (¾ спереду), — не вужче за свій.
      const peak = Math.max(...tail.rot.map((k) => Math.abs(k.v)));
      const gain =
        peak <= 0 ? 1 : mirror ? Math.min(1, MIRROR_TAIL_PEAK / peak) : hangs && view === "front" ? Math.max(1, (hanging ?? 0) / peak) : 1;
      const rot = gain === 1 ? tail.rot : tail.rot.map((k) => ({ ...k, v: k.v * gain }));
      const rest = under.tail?.rot ? sampleNumber(under.tail.rot, 0) : 0;
      const scale = under.tail?.scale ? sampleVec(under.tail.scale, 0, v).x : 1;
      out.tail = { ...tail, rot, pos: tailFollow(rot, rest, scale) };
    }
    return out;
  };
  const slots = overlay.views?.back?.slots;
  const fitted: CatAnim = {
    duration: overlay.duration,
    loop: overlay.loop,
    bones: fit("front"),
    ...(overlay.slots ? { slots: overlay.slots } : {}),
    views: { back: { bones: fit("back"), ...(slots ? { slots } : {}) } },
  };
  byBase.set(base, fitted);
  return fitted;
}

const struggle = struggleAnim();
FREE_LEG_TRACKS.set(struggle, STRUGGLE_KICKS);
const reluctant = reluctantAnim();
HANGING_TAIL_PEAK.set(reluctant, RELUCTANT_HANGING_PEAK);

export const CAT_FEELINGS = defineAnims(CAT_RIG, {
  cough: coughAnim(),
  sneeze: sneezeAnim(),
  itch: itchAnim(),
  rubEyes: rubEyesAnim(),
  limp: limpAnim(),
  vomit: vomitAnim(),
  pant: pantAnim(),
  snore: snoreAnim(),
  clumsy: clumsyAnim(),
  content: contentAnim(),
  reluctant,
  warn: warnAnim(),
  struggle,
  sadWalk: sadWalkAnim(),
  slowBlink: slowBlinkAnim(),
});
