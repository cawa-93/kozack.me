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
//   голову, хвіст, тулуб диханням; у кінці разової накладки всі її доріжки — нуль.
//
// Обличчя (очі, рот, вуха) — справа `catFace` і разових подій (`catevents.ts`); доріжки цих слотів тут лише в разових —
// чханні, блюванні й задишці, де вираз має мінятися за ходом дії (спершу «а-а», потім «чхи»).
//
// Будова скелета (`defs/cat.ts`), яку треба пам'ятати: лапа — одна кістка від плеча чи стегна до подушечки (`len` 20,5), тож
// лапу «згинає» лише масштаб уздовж кістки (`sx` < 1 — підібрана), а куди вона дивиться — поворот (додатний — назад). Задні
// лапи — на тазі, передні — на тулубі. Таз — батько всього кота. Хвіст — один кадр-«S»: лише повертати навколо корінця
// (`tail`). Пози, спільні з групою `basic` (сидить — `SIT`, клубок — `CURL`), повторені тут тими самими числами, щоб чухання
// починалося з того, як кіт сидить, а хропіння було тим самим клубком, що й сон.

import type { AnimOf, BoneOf, BoneTracks, Ease, Key, SlotOf, SlotTracks, Vec2 } from "../../types";
import { defineAnims } from "../../types";
import { CAT_ONE_SHOT_MS } from "../../../anim/ids";
import { CAT_RIG } from "../../defs/cat";
import { MOOD_LOOK } from "../../../../sim/config";
import { sampleNumber, sampleVec } from "../../rigcore";

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
 * еталон `cat/tail/long`, як у групі `basic`): поворот навколо самого pivot виносить корінець за силует круп'я. Тож хвіст
 * повертаємо навколо корінця: `tail(кут)` додає зсув, що лишає корінець на місці.
 */
const TAIL_ROOT: Vec2 = { x: 3.5, y: 0.5 };

/** Зсув, що тримає корінець хвоста на місці, коли хвіст повернуто на `rot` від вихідної пози. */
function tailShift(rot: number): Vec2 {
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  return { x: TAIL_ROOT.x - (TAIL_ROOT.x * c - TAIL_ROOT.y * s), y: TAIL_ROOT.y - (TAIL_ROOT.x * s + TAIL_ROOT.y * c) };
}

/** Хвіст повернутий на `rot` градусів навколо корінця (поза). */
function tail(rot: number): Tweak {
  const { x, y } = tailShift(rot);
  return { rot, x, y };
}

/**
 * Хвіст накладки: на `rot` від хвоста основної, що лежить під кутом `rest` (кіт сидить під рукою чи висить на руках), —
 * навколо корінця. Накладка додається до основної, тож зсув — різниця між поворотом на `rest + rot` і на `rest`.
 */
function tailFrom(rest: number, rot: number): Tweak {
  const a = tailShift(rest + rot);
  const b = tailShift(rest);
  return { rot, x: a.x - b.x, y: a.y - b.y };
}

// --- Спільні пози (ті самі числа, що в групі `basic`) ------------------------------------------------

/**
 * Сидить (`sit` групи `basic`): таз повернутий носом угору навколо стегон, передні лапи прямо вниз, витягнуті й зсунуті вниз
 * уздовж тулуба, хвіст спадає на підлогу. Чухання й тертя очей починаються й закінчуються в ній.
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
/** Лапи того, хто сидить, у ракурсі ¾ ззаду (ближні й дальні там міняються місцями по x). */
const SIT_BACK_LEGS: Pose = {
  "leg-back-near": { rot: 16, sx: 1.02 },
  "leg-back-far": { rot: -5 },
  "leg-front-near": { rot: 32, x: -5.5, y: 9.6, sx: 1.14 },
  "leg-front-far": { rot: 32, x: -4, y: 7.5, sx: 1.13 },
};
const SIT_BACK: Pose = { ...SIT, ...SIT_BACK_LEGS };
/** Кут хвоста кота, що сидить, — від нього б'є хвостом накладка під рукою. */
const SIT_TAIL = -95;

/**
 * Клубок (`sleep` групи `basic`): тулуб коротший і круглий, лапи сховані під собою, голова лежить носом донизу перед грудьми,
 * хвіст обгорнув кота спереду (у ¾ спереду — поверх тулуба).
 */
const CURL: Pose = {
  pelvis: { y: 11 },
  body: { rot: -4, sx: 0.84, sy: 1.08 },
  "leg-front-near": { rot: -40, sx: 0.4 },
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
// Ті самі ритм і розмах, що в ході групи `basic` (рись: діагональні пари лап, цикл `WALK_MS`): опорна лапа йде назад
// рівномірно, з тією самою швидкістю, тож кульгання, незграбна й сумна хода не ковзають там, де не ковзає звичайна, а
// вигляд множить швидкість відтворення на `walkFactor` (травма 0,6, хребет 0,9 — `CatAnimChoice.speed`).

/** Цикл ходи, мс. */
const WALK_MS = 340;
/** Розмах лап, градуси від вертикалі: передні — ширше. */
const WALK_FRONT = 32;
const WALK_BACK = 28;
/** Наскільки таз нижчає на зміні пар (лапи навскіс), щоб подушечки лишалися на підлозі. */
const WALK_BOB = 1.5;
/** Лапа на краях опори трохи витягнута, у переносі — підібрана. */
const WALK_REACH = 1.08;
const WALK_LIFT = 0.78;

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
 * Кульгає (травма, §9.5): ближня передня болить — підібрана й лише ледь торкається підлоги посередині свого кроку; голова
 * злітає вгору, коли хвора лапа ступає (кіт знімає з неї вагу), і падає, коли ступає здорова, — нерівний кивок, який видно
 * й на телефоні. Решта лап — рись, як у звичайній ході.
 */
function limpAnim(): CatAnim {
  const T = WALK_MS;
  const H = T / 2;
  return {
    duration: T,
    loop: true,
    bones: {
      pelvis: gaitBob(T, WALK_BOB),
      "leg-back-far": gaitLeg(T, WALK_BACK, 0),
      "leg-front-far": gaitLeg(T, WALK_FRONT, 0.5),
      "leg-back-near": gaitLeg(T, WALK_BACK, 0.5),
      // Хвора лапа: тримає вперед підібраною, посередині своєї опори ледь торкається підлоги й одразу знову піднімається.
      "leg-front-near": {
        rot: keys([
          [0, -42],
          [H * 0.4, -12],
          [H * 0.55, -2],
          [H * 0.7, 2],
          [H, -28],
          [T, -42],
        ]),
        scale: keysV([
          [0, 0.6, 1],
          [H * 0.4, 0.86, 1],
          [H * 0.55, 0.96, 1],
          [H * 0.7, 0.95, 1],
          [H, 0.62, 1],
          [T, 0.6, 1],
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
      // Тулуб ледь хилиться за кивком (передні плечі вниз, коли ступає здорова).
      body: {
        rot: keys([
          [0, 0],
          [H * 0.5, -1.5],
          [H, 0],
          [H * 1.5, 1.5],
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
    },
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
    "leg-front-near": leg(WALK_FRONT, 0),
    "leg-front-far": leg(WALK_FRONT, 0.5),
    // Задні — коротший розмах і ледь відриваються від підлоги: тверді, човгають.
    "leg-back-far": leg(WALK_BACK, 0, 0.9),
    "leg-back-near": leg(WALK_BACK, 0.5, 0.9),
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
  const k = 1 - LOW / 20.5;
  // Розмах більший на стільки, на скільки лапи коротші: за крок кіт проходить стільки ж, скільки у звичайній ході.
  const leg = (amp: number, start: 0 | 0.5): BoneTracks => {
    const tracks = gaitLeg(T, amp / k, start, 0.88, WALK_REACH);
    return { ...tracks, scale: (tracks.scale ?? []).map((key) => ({ ...key, v: { x: key.v.x * k, y: key.v.y } })) };
  };
  return {
    duration: T,
    loop: true,
    bones: {
      pelvis: gaitBob(T, WALK_BOB * 0.8, LOW),
      "leg-front-near": leg(WALK_FRONT, 0),
      "leg-back-far": leg(WALK_BACK, 0),
      "leg-front-far": leg(WALK_FRONT, 0.5),
      "leg-back-near": leg(WALK_BACK, 0.5),
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
  };
}

/**
 * Чхання (застуда) — накладка: «а-а…» — голова відкидається носом угору, очі мружаться, рот відкривається; «чхи!» — різкий
 * кивок униз; відскок і назад. Рухає лише шию й голову; в кінці — нуль.
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
      eyes: frames([
        [0, "half"],
        [250, "closed"],
        [620, "half"],
      ]),
      mouth: frames([
        [0, "closed"],
        [180, "meow"],
        [480, "closed"],
      ]),
    },
  };
}

/**
 * Чухає задньою лапою за вухом (блохи, дерматит): сидячи (як `sit`), ближня задня лапа злітає до шиї за вухом і часто-часто
 * чеше, голова хилиться назустріч і трусится в такт, — і лапа знову на підлозі.
 */
function itchTracks(sit: Pose, leg: number, reach: number): Tracks {
  const T = CAT_ONE_SHOT_MS.itch;
  const up: Pose = over(sit, { neck: { x: -1, y: 1.5 }, head: { rot: 6 } });
  const raised = (d: number, h: number): Pose => ({ ...up, "leg-back-near": { rot: leg + d, sx: reach }, head: { rot: (up.head?.rot ?? 0) + h } });
  const strokes: Frame[] = [];
  // Часті удари лапою: туди й назад кожні 45 мс, голова трусится навпаки.
  for (let t = 200, i = 0; t < 1300; t += 45, i++) strokes.push({ t, pose: raised(i % 2 === 0 ? -7 : 7, i % 2 === 0 ? 1.5 : -1.5) });
  return posed([{ t: 0, pose: sit }, ...strokes, { t: 1330, pose: raised(0, 0) }, { t: T, pose: sit }]);
}

function itchAnim(): CatAnim {
  const front = itchTracks(SIT, -148, 1.26);
  const back = itchTracks(SIT_BACK, -150, 1.24);
  return {
    duration: CAT_ONE_SHOT_MS.itch,
    loop: false,
    bones: front,
    views: { back: { bones: legsOf(back) } },
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
    views: { back: { bones: legsOf(rubTracks(SIT_BACK, -130)), slots: { "leg-front-near": { z: [{ t: 0, v: 7 }] } } } },
  };
}

/**
 * Блює чи зригує грудку (розлад шлунка, ковтає надто швидко, шерстяна грудка): присідає з витягнутою шиєю (як у кашлі),
 * тричі важко стискається животом — щоразу сильніше, — різко тягнеться головою до підлоги з відкритим ротом і повільно
 * випрямляється, стоячи.
 */
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
      { t: 0, pose: {}, ease: "out" },
      { t: 180, pose: low },
      { t: 300, pose: heave(0.8), ease: "inOut" },
      { t: 420, pose: low },
      { t: 560, pose: heave(1.1) },
      { t: 680, pose: low, ease: "in" },
      { t: 900, pose: heave(1.4), ease: "in" },
      { t: 990, pose: expel },
      { t: 1180, pose: expel },
      { t: T, pose: {} },
    ]),
    slots: {
      mouth: frames([
        [0, "closed"],
        [960, "meow"],
        [1260, "closed"],
      ]),
    },
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
// Під рукою кіт сидить (`sit`), на руках — `carried`; хвіст у них лежить чи звисає (`SIT_TAIL`), тож удари хвостом —
// угору від нього (додатний поворот піднімає хвіст) і назад на підлогу.

/**
 * «Подобається»: мружиться (очі — `catFace`), спокійно погойдується — голова повільно хилиться назустріч руці й назад, хвіст
 * ліниво ворушиться, муркотіння видно диханням, а передні лапки по черзі топчуться.
 */
function contentAnim(): CatAnim {
  const T = 2400;
  /** Муркотіння: тулуб двічі за цикл ледь товщає. */
  const purr = [1, 1.025, 1, 1.025];
  // Лапка підібрана (коротша) на своїй чверті циклу; дихання тулуба її не подовжує.
  const knead = (phase: 0 | 1): BoneTracks => {
    const a = phase === 0 ? [0, -9, 0, 0] : [0, 0, 0, -9];
    const s = phase === 0 ? [1, 0.87, 1, 1] : [1, 1, 1, 0.87];
    return { rot: osc(T, a), scale: osc(T, s.map((v, i) => v / (purr[i] ?? 1))).map((k) => ({ ...k, v: { x: k.v, y: 1 } })) };
  };
  const sway = (r: number): Tweak => tailFrom(SIT_TAIL, r);
  return {
    duration: T,
    loop: true,
    bones: {
      neck: { rot: osc(T, [0, 3, 0, -1]) },
      head: { rot: osc(T, [0, 5, 2, -2]) },
      body: { scale: osc(T, purr).map((k) => ({ ...k, v: { x: 1, y: k.v } })) },
      "leg-front-near": knead(0),
      "leg-front-far": knead(1),
      tail: {
        rot: osc(T, [0, 10]),
        pos: [
          { t: 0, v: { x: sway(0).x ?? 0, y: sway(0).y ?? 0 }, ease: "inOut" },
          { t: T / 2, v: { x: sway(10).x ?? 0, y: sway(10).y ?? 0 }, ease: "inOut" },
          { t: T, v: { x: 0, y: 0 } },
        ],
      },
    },
  };
}

/** Хвіст накладки за ключами [t, кут від хвоста основної]: поворот і зсув навколо корінця. */
function tailKeys(list: readonly (readonly [number, number])[], rest = SIT_TAIL, ease: Ease = "inOut"): BoneTracks {
  return {
    rot: keys(list, ease),
    pos: list.map(([t, r], i) => {
      const w = tailFrom(rest, r);
      const v = { x: w.x ?? 0, y: w.y ?? 0 };
      return i === list.length - 1 ? { t, v } : key(t, v, ease);
    }),
  };
}

/**
 * «Терпить»: кінчиком хвоста коротко сіпає — двічі поспіль, пауза, ще раз, — голова трохи опущена (вуха й мружені очі —
 * `catFace`). Сіпання дрібні й рідкі — на відміну від «попереджає».
 */
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
      head: { rot: osc(T, [4, 5]) },
    },
  };
}

/**
 * «Попереджає» (рішення автора 2026-10-30, п. 4, §10): хвіст б'є сильно й широко — злітає високо й гупає об підлогу, без пауз,
 * удвічі частіше за сіпання «терпить»; голова опущена й трохи відтягнута назад, по спині пробігає здригання шкіри. Вуха
 * «літачком» і сердиті очі — з `catFace`.
 */
function warnAnim(): CatAnim {
  const T = 1000;
  // Здригання шкіри на спині — щоразу, як хвіст гупає об підлогу.
  const shiver = keysV([
    [0, 1, 1],
    [300, 1, 1],
    [340, 1, 1.03],
    [420, 1, 1],
    [720, 1, 1],
    [760, 1, 1.03],
    [840, 1, 1],
    [T, 1, 1],
  ]);
  return {
    duration: T,
    loop: true,
    bones: {
      tail: tailKeys([
        [0, 0],
        [150, 72],
        [190, 74],
        [310, 0],
        [360, 8],
        [420, 0],
        [580, 68],
        [620, 70],
        [740, 0],
        [790, 7],
        [850, 0],
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

/**
 * «Пручається»: вертиться й вивертається — круп смикається вгору, передні лапи впираються, задні брикаються, голова
 * крутиться туди-сюди, хвіст хльоскає. Ритм нерівний, щоб не було схоже на механічне коливання.
 */
function struggleAnim(): CatAnim {
  const T = 900;
  return {
    duration: T,
    loop: true,
    bones: {
      pelvis: {
        rot: keys([
          [0, 0],
          [110, -7],
          [230, -2],
          [380, -9],
          [470, -3],
          [600, -6],
          [760, -1],
          [T, 0],
        ]),
        pos: keysV([
          [0, 0, 0],
          [110, 0, -2.2],
          [230, 0, 0],
          [380, 0, -1.6],
          [470, 0, -0.4],
          [600, 0, -2],
          [760, 0, 0],
          [T, 0, 0],
        ]),
      },
      "leg-back-near": {
        rot: keys([
          [0, 0],
          [110, 28],
          [230, -12],
          [380, 32],
          [470, 0],
          [600, 24],
          [760, -8],
          [T, 0],
        ]),
        scale: keysV([
          [0, 1, 1],
          [110, 1.05, 1],
          [230, 0.8, 1],
          [380, 1.06, 1],
          [470, 0.85, 1],
          [600, 1.04, 1],
          [760, 0.9, 1],
          [T, 1, 1],
        ]),
      },
      "leg-back-far": {
        rot: keys([
          [0, 0],
          [110, -8],
          [230, 26],
          [380, -4],
          [470, 30],
          [600, 0],
          [760, 20],
          [T, 0],
        ]),
      },
      "leg-front-near": {
        rot: keys([
          [0, 0],
          [110, -22],
          [230, 6],
          [380, -26],
          [470, 2],
          [600, -18],
          [760, 4],
          [T, 0],
        ]),
      },
      "leg-front-far": {
        rot: keys([
          [0, 0],
          [110, 4],
          [230, -20],
          [380, 2],
          [470, -24],
          [600, 0],
          [760, -14],
          [T, 0],
        ]),
      },
      neck: {
        rot: keys([
          [0, 0],
          [110, -8],
          [230, 7],
          [380, -10],
          [470, 4],
          [600, -6],
          [760, 6],
          [T, 0],
        ]),
      },
      head: {
        rot: keys([
          [0, 0],
          [110, -10],
          [230, 9],
          [380, -6],
          [470, 8],
          [600, -12],
          [760, 5],
          [T, 0],
        ]),
      },
      tail: tailKeys([
        [0, 0],
        [110, 34],
        [230, 6],
        [380, 40],
        [470, 10],
        [600, 36],
        [760, 4],
        [T, 0],
      ]),
    },
  };
}

/**
 * Повільне кліпання до персонажа (§11.4) — накладка: голова трохи хилиться носом донизу й ледь погойдується; на час самого
 * кліпання (як `blinkAmount` у `thoughts.ts`: заплющує 450 мс, тримає 350, розплющує 450) — киває глибше. Цикл — період
 * кліпання (`MOOD_LOOK.blinkSeconds`), тож вигляд може почати накладку з того самого зсуву, що й кліпання кота
 * (`from` = (час + id · 2333) за модулем періоду), — тоді кивок збігається з заплющеними очима. Очі — `catFace`.
 */
function slowBlinkAnim(): CatAnim {
  const T = MOOD_LOOK.blinkSeconds * 1000;
  const close = 450;
  const hold = 350;
  const open = 450;
  return {
    duration: T,
    loop: true,
    bones: {
      neck: {
        rot: keys([
          [0, 2],
          [close, 5],
          [close + hold, 5],
          [close + hold + open, 2],
          [T, 2],
        ]),
      },
      head: {
        rot: keys([
          [0, 5],
          [close, 13],
          [close + hold, 13],
          [close + hold + open, 5],
          [close + hold + open + 2400, 7],
          [close + hold + open + 4800, 4],
          [T, 5],
        ]),
      },
    },
  };
}

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
  reluctant: reluctantAnim(),
  warn: warnAnim(),
  struggle: struggleAnim(),
  sadWalk: sadWalkAnim(),
  slowBlink: slowBlinkAnim(),
});
