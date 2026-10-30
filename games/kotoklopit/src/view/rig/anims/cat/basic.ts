// Анімації кота, група «basic» — пакет N1 «Кіт — базові» (крок 16, хвиля 2; назви й що кожна означає — `anim/ids.ts`, де й
// коли кожну обирають — `pose.ts`, `catPose`). Формат — `rig/types.ts`: доріжки відносно вихідної пози ракурсу (кіт стоїть,
// дивиться праворуч), кути в градусах за годинниковою, вісь y донизу, час у мс.
//
// Як тут побудовано: кожна поза — набір змін кісток (`Pose`: поворот, зсув, масштаб уздовж і впоперек кістки), а анімація —
// ключові пози в часі (`posed`), до яких додаються окремі доріжки «живого» (дихання, хвіст, голова — `osc`). Пози лежать у
// спільних сталих (`SIT`, `LOAF`, `CURL`…), тож та сама поза однакова в усіх анімаціях, що з неї починаються.
//
// Що треба знати про скелет (`defs/cat.ts`): лапа — одна кістка від плеча чи стегна до подушечки (`len` 20,5), тож лапу
// «згинає» лише масштаб уздовж кістки (`sx` < 1 — підібрана, > 1 — витягнута), а куди вона дивиться — поворот (додатний —
// назад). Задні лапи — на тазі, передні — на тулубі: нахил тулуба переносить передні лапи, а задні лишаються. Таз — батько
// всього кота: його зсув і поворот рухають кота цілком (поворот — навколо стегон). Хвіст — один кадр-«S», тож згинати його
// не можна: лише повертати й рівномірно масштабувати (нерівномірний масштаб кістки під кутом компонувальник відкидає).
//
// Лапи на підлозі: у ході за кожну опору лапа йде назад рівномірно (`linear`), а таз опускається, коли лапи навскіс
// (`WALK_BOB`), і подовжується лапа на краях кроку — подушечка лишається на лінії підлоги. Повністю без ковзання хода
// неможлива: сим веде кота 2,5 клітинки за хвилину гри (≈ 3,3 клітинки за секунду, 210–300 одиниць арту за секунду на
// екрані), а короткі лапи (20,5) за крок проходять ≈ 22. Тому цикл ходи короткий і жвавий (`WALK_MS`, рись), а вигляд множить
// швидкість відтворення на `walkFactor` (`CatAnimChoice.speed`). Обличчя (очі, рот, вуха) — справа `catFace`, тут його немає.

import type { AnimOf, BoneOf, BoneTracks, Ease, Key, SlotOf, SlotTracks, Vec2 } from "../../types";
import { defineAnims } from "../../types";
import type { CatAnimId } from "../../../anim/ids";
import { CAT_ONE_SHOT_MS } from "../../../anim/ids";
import { CAT_RIG } from "../../defs/cat";

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
  return ease === undefined ? { t, v } : { t, v, ease };
}

/**
 * Доріжки з ключових поз: канал, який задає хоч одна поза, має ключ у кожній (де поза його не задає — вихідне значення:
 * 0 для повороту й зсуву, 1 для масштабу). Так поза — це завжди вся поза, а не «що змінилося з минулої».
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
    const a = base[bone];
    const d = delta[bone];
    if (!d) continue;
    const sum = (field: "rot" | "x" | "y"): number | undefined => (a?.[field] === undefined && d[field] === undefined ? undefined : (a?.[field] ?? 0) + (d[field] ?? 0));
    const mul = (field: "sx" | "sy"): number | undefined => (a?.[field] === undefined && d[field] === undefined ? undefined : (a?.[field] ?? 1) * (d[field] ?? 1));
    const tweak: Tweak = {};
    const rot = sum("rot");
    const x = sum("x");
    const y = sum("y");
    const sx = mul("sx");
    const sy = mul("sy");
    if (rot !== undefined) tweak.rot = rot;
    if (x !== undefined) tweak.x = x;
    if (y !== undefined) tweak.y = y;
    if (sx !== undefined) tweak.sx = sx;
    if (sy !== undefined) tweak.sy = sy;
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

/** Те саме для зсуву чи масштабу. */
function oscV(T: number, values: readonly Vec2[], ease: Ease = "inOut"): Key<Vec2>[] {
  const step = T / values.length;
  const keys = values.map((v, i) => key(Math.round(i * step), v, ease));
  keys.push({ t: T, v: values[0] ?? { x: 0, y: 0 } });
  return keys;
}

/** Канал пози кістки (для коливань довкола неї). */
const at = (pose: Pose, bone: CatBone, field: keyof Tweak): number => pose[bone]?.[field] ?? (field === "sx" || field === "sy" ? 1 : 0);

/** Коливання повороту кістки довкола пози: `deltas` додаються до повороту з пози. */
const rotAround = (T: number, pose: Pose, bone: CatBone, deltas: readonly number[], ease: Ease = "inOut"): BoneTracks => ({
  rot: osc(
    T,
    deltas.map((d) => at(pose, bone, "rot") + d),
    ease,
  ),
});

/**
 * Дихання: тулуб трохи товщає впоперек (`sy`), разів `breaths` за цикл; решта масштабу тулуба — з пози. Груди здіймаються —
 * передні лапи й голова (діти тулуба) теж ледь піднімаються, тож дихання видно й у силуеті.
 */
function breathe(T: number, pose: Pose, depth: number, breaths = 1): BoneTracks {
  const sx = at(pose, "body", "sx");
  const sy = at(pose, "body", "sy");
  const values: Vec2[] = [];
  for (let i = 0; i < breaths; i++) values.push({ x: sx, y: sy }, { x: sx, y: sy * (1 + depth) });
  return { scale: oscV(T, values) };
}

/** Доріжка видимості слота: сховано весь час. */
const HIDDEN: SlotTracks = { visible: [{ t: 0, v: false }] };

const DEG = Math.PI / 180;

/**
 * Корінь хвоста в кадрі — товстий «корінець» довкола pivot, зсунутий від нього на стільки (одиниці арту, еталон
 * `cat/tail/long`): у вихідній позі його ховає тулуб, а поворот навколо pivot виносить корінець за силует круп'я (видно
 * світлу «гулю» без контуру). Тож хвіст повертаємо навколо корінця: `catTail(кут)` додає зсув, що лишає корінець на місці.
 * Якщо pivot кадру хвоста колись перенесуть на сам корінець (A7), тут має стати { x: 0, y: 0 }.
 */
const TAIL_ROOT: Vec2 = { x: 3.5, y: 0.5 };

/**
 * Хвіст повернутий на `rot` градусів (і рівномірно масштабований на `scale`) навколо корінця: поворот і зсув кістки `tail`
 * для пози. Для N2 і N3 теж: накладка, що б'є хвостом (`warn`, `reluctant`), додає лише поворот навколо pivot, тож корінець
 * у неї трохи ходить — компенсувати це лінійно не можна (зсув залежить від кута основної пози); на розмаху ±30–40° це ≈ 2
 * одиниці арту, і круп їх здебільшого ховає.
 */
export function catTail(rot: number, scale = 1): { rot: number; x: number; y: number; sx?: number; sy?: number } {
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  const x = TAIL_ROOT.x - scale * (TAIL_ROOT.x * c - TAIL_ROOT.y * s);
  const y = TAIL_ROOT.y - scale * (TAIL_ROOT.x * s + TAIL_ROOT.y * c);
  return scale === 1 ? { rot, x, y } : { rot, x, y, sx: scale, sy: scale };
}
const tail = catTail;

function boneDef(id: CatBone): { x: number; y: number; rot: number } {
  const bone = CAT_RIG.bones.find((b) => b.id === id);
  if (!bone) throw new Error(`Скелет кота: кістки «${id}» немає`);
  return bone;
}
const PELVIS_AT = boneDef("pelvis");
const NECK_AT = boneDef("neck");
const HEAD_AT = boneDef("head");
/** Кінець шиї (pivot голови) у системі тулуба, вихідна поза ¾ спереду. */
const NECK_END: Vec2 = { x: NECK_AT.x + HEAD_AT.x * Math.cos(NECK_AT.rot * DEG), y: NECK_AT.y + HEAD_AT.x * Math.sin(NECK_AT.rot * DEG) };

/**
 * Голова там, де треба, і рівно — для поз, де тулуб лежить: зсув шиї, що ставить pivot голови (шию) у точку `at` системи
 * кореня (за тазом `pelvis` і масштабом тулуба `body`; тулуб без повороту), і поворот голови, за якого вона у світі нахилена
 * на `tilt` градусів (від'ємний — носом угору). Масштаб тулуба голова не успадковує: її масштаб обернений до тулубового —
 * тож коли таз віддзеркалено згори донизу (кіт на спині, `sy` < 0), голова рівна, а не догори дриґом, і над вухами лишається
 * якір бульбашок (перекіс, що лишається від повороту під масштабом, компонувальник відкидає).
 */
function headAt(pelvis: Tweak, body: Tweak, at: Vec2, tilt: number): Pose {
  const kx = body.sx ?? 1;
  const ky = (pelvis.sy ?? 1) * (body.sy ?? 1);
  const p = (pelvis.rot ?? 0) * DEG;
  const dx = at.x - (PELVIS_AT.x + (pelvis.x ?? 0));
  const dy = at.y - (PELVIS_AT.y + (pelvis.y ?? 0));
  // Точка в системі тулуба: R(−p) · (at − таз), поділене на масштаб.
  const bx = (dx * Math.cos(p) + dy * Math.sin(p)) / kx;
  const by = (-dx * Math.sin(p) + dy * Math.cos(p)) / ky;
  // Поворот голови h: S(kx, ky) · R(h) має дивитися під кутом tilt − p; масштаб — щоб перший стовпець був одиничним, а
  // визначник — 1.
  const w = tilt * DEG - p;
  const h = Math.atan2((kx * Math.sin(w)) / ky, Math.cos(w));
  const sx = 1 / Math.hypot(kx * Math.cos(h), ky * Math.sin(h));
  const sy = 1 / (kx * ky * sx);
  const head: Tweak = { rot: h / DEG };
  if (Math.abs(sx - 1) > 1e-3) head.sx = sx;
  if (Math.abs(sy - 1) > 1e-3) head.sy = sy;
  return { neck: { x: bx - NECK_END.x, y: by - NECK_END.y }, head };
}

// --- Пози -----------------------------------------------------------------------------------------
//
// Числа підібрано за запеченими кадрами еталона F1b (`art/cat/*`) в обох ракурсах і з пропорціями кошеняти: подушечки
// ближніх лап — на 2 нижче кореня, дальніх — на 1,5 вище (глибина ізометрії), як у вихідній позі.

/**
 * Сидить: таз повернутий носом угору навколо стегон (круп на підлозі), передні лапи прямо вниз, витягнуті й трохи зсунуті
 * вниз уздовж тулуба (лопатки), ближня задня лапа — стегно під тулубом, хвіст спадає на підлогу. Голова рівно.
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
 * Лапи того, хто сидить, у ракурсі ¾ ззаду: ближні й дальні лапи там міняються місцями по x (`defs/cat.ts`), тож після
 * повороту таза вони сягають підлоги інакше.
 */
const SIT_BACK: Pose = {
  "leg-back-near": { rot: 16, sx: 1.02 },
  "leg-back-far": { rot: -5 },
  // Глибше в груди й трохи навскіс уперед: верх лапи (без контуру) ховається під грудьми, подушечка — на підлозі.
  "leg-front-near": { rot: 20, x: -12.5, y: 7.6, sx: 1.08 },
  "leg-front-far": { rot: 32, x: -4, y: 7.5, sx: 1.13 },
};

/** Буханець: тулуб на підлозі, лапи підібрані під себе (видно лише подушечки), голова трохи схилена, хвіст лежить ззаду. */
const LOAF: Pose = {
  pelvis: { y: 9 },
  "leg-back-near": { sx: 0.35 },
  "leg-back-far": { sx: 0.35 },
  "leg-front-near": { rot: -10, sx: 0.38 },
  "leg-front-far": { sx: 0.35 },
  head: { rot: 5 },
  tail: tail(-80),
};

/**
 * Клубок: тулуб коротший і круглий, лапи сховані під собою (видно лише ближню передню під підборіддям), голова лежить носом
 * донизу перед грудьми, хвіст обгорнув кота спереду — у ракурсі ¾ спереду він малюється поверх тулуба (`CURL_SLOTS`), ззаду
 * хвіст і так ближчий за тулуб.
 */
const CURL: Pose = {
  pelvis: { y: 11 },
  body: { rot: -4, sx: 0.84, sy: 1.08 },
  "leg-front-near": { rot: -40, sx: 0.4 },
  neck: { x: -5, y: 12 },
  head: { rot: 26 },
  tail: tail(125),
};
const CURL_SLOTS: SlotSet = {
  "leg-back-far": HIDDEN,
  "leg-back-near": HIDDEN,
  "leg-front-far": HIDDEN,
  tail: { z: [{ t: 0, v: 5.5 }] },
};
/**
 * Клубок ззаду: лапу під підборіддям не видно (вона по той бік тулуба), а хвіст лежить уздовж низу, за тулубом, — видно
 * лише кінчик біля морди (поверх крупа він читався б як ручка).
 */
const CURL_BACK_SLOTS: SlotSet = { "leg-front-near": HIDDEN, tail: { z: [{ t: 0, v: 4.9 }] } };

/** Їсть: присів на задні лапи (таз нижче, задні підібрані), голова в мисці, хвіст низько. */
const EAT: Pose = {
  pelvis: { y: 5, rot: -4 },
  "leg-back-near": { rot: -14, sx: 0.78 },
  "leg-back-far": { rot: -10, sx: 0.8 },
  "leg-front-near": { rot: -8, sx: 0.85 },
  "leg-front-far": { rot: -8, sx: 0.85 },
  neck: { x: 4, y: 13 },
  head: { rot: 40 },
  tail: tail(-85),
};

/** П'є: ще нижче, ніж їсть (лікті назовні, задні підібрані), голова над самою водою. */
const DRINK: Pose = over(EAT, {
  pelvis: { y: 2 },
  "leg-back-near": { sx: 0.85 },
  "leg-back-far": { sx: 0.85 },
  "leg-front-near": { rot: -8, sx: 0.92 },
  "leg-front-far": { rot: -8, sx: 0.92 },
  neck: { x: 2, y: 1 },
  head: { rot: 4 },
});

/**
 * Присів на лотку: круп опущений, але не сидить — зависає над наповнювачем, задні лапи зігнуті під ним, передні прямі, хвіст
 * піднятий над підлогою прямо назад (так присідання на лотку не сплутати з «сидить», де хвіст лежить).
 */
const SQUAT: Pose = {
  pelvis: { y: 7, rot: -20 },
  "leg-back-near": { rot: -25, sx: 0.93 },
  "leg-back-far": { rot: -25, sx: 1 },
  "leg-front-near": { rot: 20, x: -1, y: 2, sx: 0.98 },
  "leg-front-far": { rot: 20, x: -1, y: 2, sx: 1.06 },
  head: { rot: 18 },
  tail: tail(-6),
};
/** Лапи на лотку в ракурсі ¾ ззаду (ближні й дальні там міняються місцями по x). */
const SQUAT_BACK: Pose = {
  "leg-back-near": { rot: -25, sx: 1.02 },
  "leg-back-far": { rot: -25, sx: 0.88 },
  "leg-front-near": { rot: 20, x: -1, y: 2, sx: 1.05 },
  "leg-front-far": { rot: 20, x: -1, y: 2, sx: 0.95 },
};

/** Ховається: припав до підлоги пласко, лапи підібрані, голова низько й уперед (з-під меблів видно очі), хвіст по підлозі. */
const HIDE: Pose = {
  pelvis: { y: 13 },
  body: { sy: 0.94 },
  "leg-back-near": { rot: -20, sx: 0.35 },
  "leg-back-far": { rot: -20, sx: 0.35 },
  "leg-front-near": { rot: -60, sx: 0.4 },
  "leg-front-far": { rot: -60, sx: 0.4 },
  neck: { x: 3, y: 6 },
  head: { rot: 8 },
  tail: tail(-88),
};

/**
 * На руках (§9.12): обвислий — животом на руці персонажа (гніздо `arms` — на рівні рук), передні лапи звисають уперед,
 * задні — назад, хвіст униз; груди трохи вище за круп. Так кіт на руках не схожий на кота, що стоїть: у нього немає
 * підлоги, а лапи висять навскіс. «Подобається» (топче лапками) і «пручається» — накладки N3 поверх цієї пози.
 */
const CARRIED: Pose = {
  pelvis: { y: 13, rot: -8 },
  "leg-back-near": { rot: 24, sx: 1.04 },
  "leg-back-far": { rot: 14 },
  "leg-front-near": { rot: -16, sx: 0.96 },
  "leg-front-far": { rot: -8, sx: 0.94 },
  head: { rot: 8 },
  tail: tail(-110),
};

/** Розпластався на плитці на боці (§9.12): тулуб пласко на підлозі, лапи витягнуті вперед і назад, голова лежить, хвіст по підлозі. */
const SPRAWL: Pose = {
  pelvis: { y: 13 },
  body: { sy: 0.92 },
  "leg-back-near": { rot: 75, sx: 0.95 },
  "leg-back-far": { rot: 65, sx: 0.9 },
  "leg-front-near": { rot: -75 },
  "leg-front-far": { rot: -65, sx: 0.9 },
  neck: { x: 3, y: 6 },
  head: { rot: 12 },
  tail: tail(-100),
};

/**
 * На спині, лапки догори («Пастка на животику», §9.12). У профіль кіт, що перевернувся навколо хребта, — дзеркало згори
 * донизу: таз має масштаб −1 упоперек, тож спина лягає на підлогу (вона якраз на висоті таза), а живіт і лапи — догори. Лапи
 * стирчать над животом майже прямовисно (суглоби зсунуті до живота, лапи майже на повну довжину): передні трохи вперед і
 * зігнуті, задні трохи назад — чотири подушечки над силуетом читаються й на телефоні. Під дзеркалом поворот лапи 0 — прямо
 * вгору, додатний — назад (до хвоста). Голова — з того самого боку, що й у кота, який стоїть (`catFacing`: головою від
 * персонажа), але рівна, не догори дриґом (`headAt`), трохи закинута носом угору й лежить потилицею на підлозі: над вухами —
 * якір бульбашок, а вираз «попереджає» (вуха літачком, сердиті очі) видно. Руку, що гладить, вигляд кладе на живіт
 * (`catPetPoint`), а не на спинку.
 */
const BELLY_PELVIS: Tweak = { sy: -1, x: 4, y: 3 };
/**
 * Голова того, хто лежить на спині: де pivot голови (одиниці арту від кореня) і нахил (від'ємний — носом угору). Голова — на
 * самому передньому краю грудей, щоб не ховала передні лапи.
 */
const BELLY_HEAD_AT: Vec2 = { x: 24, y: -8 };
const BELLY_TILT = -25;
/** На скільки суглоби лап зсунуті до живота (у системі тулуба; у дзеркалі — угору). */
const BELLY_LIFT = 5;
const BELLY: Pose = {
  pelvis: BELLY_PELVIS,
  "leg-front-near": { rot: 12, y: BELLY_LIFT, sx: 0.88 },
  "leg-front-far": { rot: 0, y: BELLY_LIFT, sx: 0.82 },
  "leg-back-near": { rot: 16, y: BELLY_LIFT, sx: 0.96 },
  "leg-back-far": { rot: 32, y: BELLY_LIFT, sx: 0.9 },
  ...headAt(BELLY_PELVIS, {}, BELLY_HEAD_AT, BELLY_TILT),
  // Хвіст — дугою по підлозі від крупа (у дзеркалі гачок кадру загинається донизу, до підлоги).
  tail: tail(-75),
};

/**
 * Ракурс ¾ ззаду: ближня передня лапа там — на самому краю грудей (суглоб `shoulder-near-back`), і її верх (без контуру — за
 * STYLE він ховається в тулубі) вилазить за силует грудей світлою плямою ≈ 3 одиниці арту — уже у вихідній позі, а коли
 * тулуб нахилено, то й більше. Тож ззаду ця лапа малюється під тулубом (контур грудей накриває її верх, і лапа виходить з-під
 * тулуба, як дальні) і трохи всередину від краю (`BACK_NEAR_IN`, у системі тулуба). Пози з нахиленим тулубом (сидить, на
 * лотку) мають для неї власні числа (`SIT_BACK`, `SQUAT_BACK`). Якщо суглоб у скелеті чи кадрі колись посунуть усередину
 * (A7), `BACK_NEAR_IN` має стати 0.
 */
const BACK_NEAR_IN = -3.5;
const NEAR_FRONT_UNDER: SlotSet = { "leg-front-near": { z: [{ t: 0, v: 4.9 }] } };
const NEAR_FRONT_IN: Tracks = { "leg-front-near": { pos: [{ t: 0, v: { x: BACK_NEAR_IN, y: 0 } }] } };
/** Перевизначення ракурсу ззаду для поз, де ближня передня лапа — у вихідному суглобі. */
const BACK_NEAR = { bones: NEAR_FRONT_IN, slots: NEAR_FRONT_UNDER };

// --- Ходьба й біг ---------------------------------------------------------------------------------

/** Цикл ходи, мс: рись — діагональні пари лап (ближня передня з дальньою задньою, дальня передня з ближньою задньою). */
const WALK_MS = 340;
/** Розмах лап у ході, градуси від вертикалі: передні — ширше. */
const WALK_FRONT = 32;
const WALK_BACK = 28;
/** Наскільки таз нижчає, коли опорні лапи навскіс (на зміні пар), щоб подушечки лишалися на підлозі. */
const WALK_BOB = 1.5;
/** Лапа на краях опори трохи витягнута (тягнеться вперед і відштовхується), у переносі — підібрана. */
const WALK_REACH = 1.08;
const WALK_LIFT = 0.78;

/**
 * Лапа в ході: опора — з моменту `start` пів циклу (лапа на підлозі йде спереду назад рівномірно), потім перенос (піднята
 * й м'яко вперед). Розмах `amp` — від вертикалі в обидва боки.
 */
function gaitLeg(T: number, amp: number, start: 0 | 0.5): BoneTracks {
  const H = T / 2;
  const Q = T / 4;
  if (start === 0) {
    return {
      rot: [
        { t: 0, v: -amp, ease: "linear" },
        { t: H, v: amp, ease: "inOut" },
        { t: T, v: -amp },
      ],
      scale: [
        { t: 0, v: { x: WALK_REACH, y: 1 }, ease: "out" },
        { t: Q, v: { x: 1, y: 1 }, ease: "in" },
        { t: H, v: { x: WALK_REACH, y: 1 }, ease: "inOut" },
        { t: H + Q, v: { x: WALK_LIFT, y: 1 }, ease: "inOut" },
        { t: T, v: { x: WALK_REACH, y: 1 } },
      ],
    };
  }
  return {
    rot: [
      { t: 0, v: amp, ease: "inOut" },
      { t: H, v: -amp, ease: "linear" },
      { t: T, v: amp },
    ],
    scale: [
      { t: 0, v: { x: WALK_REACH, y: 1 }, ease: "inOut" },
      { t: Q, v: { x: WALK_LIFT, y: 1 }, ease: "inOut" },
      { t: H, v: { x: WALK_REACH, y: 1 }, ease: "out" },
      { t: H + Q, v: { x: 1, y: 1 }, ease: "in" },
      { t: T, v: { x: WALK_REACH, y: 1 } },
    ],
  };
}

/** Таз підстрибує двічі за цикл: найвище — посередині опори (лапи прямо), найнижче — на зміні пар (лапи навскіс). */
function gaitBob(T: number, bob: number): BoneTracks {
  const Q = T / 4;
  return {
    pos: [
      { t: 0, v: { x: 0, y: bob }, ease: "out" },
      { t: Q, v: { x: 0, y: 0 }, ease: "in" },
      { t: 2 * Q, v: { x: 0, y: bob }, ease: "out" },
      { t: 3 * Q, v: { x: 0, y: 0 }, ease: "in" },
      { t: T, v: { x: 0, y: bob } },
    ],
  };
}

const walk: CatAnim = {
  duration: WALK_MS,
  loop: true,
  bones: {
    pelvis: gaitBob(WALK_MS, WALK_BOB),
    "leg-front-near": gaitLeg(WALK_MS, WALK_FRONT, 0),
    "leg-back-far": gaitLeg(WALK_MS, WALK_BACK, 0),
    "leg-front-far": gaitLeg(WALK_MS, WALK_FRONT, 0.5),
    "leg-back-near": gaitLeg(WALK_MS, WALK_BACK, 0.5),
    // Голова ледь киває в такт крокам, хвіст піднятий і похитується раз за цикл.
    head: { rot: osc(WALK_MS, [0, -1.5, 0, -1.5]) },
    tail: { rot: osc(WALK_MS, [-2.5, 2.5]) },
  },
  // Ззаду хвіст найближче до камери — хай ходить ширше.
  views: { back: { bones: { ...NEAR_FRONT_IN, tail: { rot: osc(WALK_MS, [-4, 4]) } }, slots: NEAR_FRONT_UNDER } },
};

/** Цикл бігу (зумі), мс: галоп — збір (лапи під тулубом) і виліт (передні вперед, задні назад, кіт у повітрі). */
const RUN_MS = 300;

/** Ключові пози галопу (ближні лапи); дальні — з невеликим зсувом у часі (`RUN_LAG`), як у поворотному галопі. */
const RUN_KEYS: readonly Frame[] = [
  // Збір: передні під грудьми назад, задні під тулубом уперед, спина опущена.
  { t: 0, pose: { pelvis: { y: 4, rot: 4 }, "leg-front-near": { rot: 38, sx: 0.9 }, "leg-back-near": { rot: -40 }, head: { rot: -4 } } },
  // Поштовх задніми: тіло злітає носом угору, передні тягнуться вперед.
  { t: 75, pose: { pelvis: { y: -2, rot: -6 }, "leg-front-near": { rot: -45 }, "leg-back-near": { rot: 30, sx: 1.15 }, head: { rot: 6 } } },
  // Політ: витягнувся.
  { t: 150, pose: { pelvis: { y: -7, rot: -2 }, "leg-front-near": { rot: -58, sx: 1.05 }, "leg-back-near": { rot: 48 }, head: { rot: 2 } } },
  // Передні стали: тіло нахиляється носом униз, задні вже летять уперед.
  { t: 205, pose: { pelvis: { y: -3, rot: 6 }, "leg-front-near": { rot: -15, sx: 1.05 }, "leg-back-near": { rot: 20, sx: 0.85 }, head: { rot: -6 } } },
  { t: 255, pose: { pelvis: { y: 0, rot: 8 }, "leg-front-near": { rot: 15, sx: 0.86 }, "leg-back-near": { rot: -20, sx: 0.8 }, head: { rot: -8 } } },
  { t: RUN_MS, pose: { pelvis: { y: 4, rot: 4 }, "leg-front-near": { rot: 38, sx: 0.9 }, "leg-back-near": { rot: -40 }, head: { rot: -4 } } },
];
/** Затримка дальньої лапи пари, мс. */
const RUN_LAG = 18;

/** Доріжка, зсунута по колу на `dt` мс (дальні лапи галопу). */
function shifted(keys: readonly Key<number>[] | undefined, T: number, dt: number): Key<number>[] | undefined {
  if (!keys) return undefined;
  const moved = keys.slice(0, -1).map((k) => ({ ...k, t: (k.t + dt) % T }));
  moved.sort((a, b) => a.t - b.t);
  const first = moved[0];
  const last = moved[moved.length - 1];
  if (!first || !last) return [...keys];
  // На межі циклу — значення, до якого дійшов відрізок від останнього ключа до першого (лінійно — для малих зсувів досить).
  const span = first.t + T - last.t;
  const edge = last.v + (first.v - last.v) * ((T - last.t) / span);
  return [{ t: 0, v: edge, ease: last.ease ?? "linear" }, ...moved, { t: T, v: edge }];
}

function shiftedV(keys: readonly Key<Vec2>[] | undefined, T: number, dt: number): Key<Vec2>[] | undefined {
  if (!keys) return undefined;
  const xs = shifted(
    keys.map((k) => ({ ...k, v: k.v.x })),
    T,
    dt,
  );
  const ys = shifted(
    keys.map((k) => ({ ...k, v: k.v.y })),
    T,
    dt,
  );
  return xs?.map((k, i) => ({ ...k, v: { x: k.v, y: ys?.[i]?.v ?? 1 } }));
}

function lagged(tracks: BoneTracks | undefined, T: number, dt: number): BoneTracks {
  const rot = shifted(tracks?.rot, T, dt);
  const scale = shiftedV(tracks?.scale, T, dt);
  return { ...(rot ? { rot } : {}), ...(scale ? { scale } : {}) };
}

const RUN_TRACKS = posed(RUN_KEYS);

const run: CatAnim = {
  duration: RUN_MS,
  loop: true,
  bones: {
    ...RUN_TRACKS,
    "leg-front-far": lagged(RUN_TRACKS["leg-front-near"], RUN_MS, RUN_LAG),
    "leg-back-far": lagged(RUN_TRACKS["leg-back-near"], RUN_MS, RUN_LAG),
    // Хвіст летить за котом майже горизонтально й хвилюється.
    tail: { rot: osc(RUN_MS, [-48, -38]) },
  },
  views: { back: BACK_NEAR },
};

// --- Стрибки ---------------------------------------------------------------------------------------
//
// Разові, рівно `CAT_ONE_SHOT_MS`: вигляд уже поставив кота на нову висоту (меблі чи підлога), тож стрибок угору починається
// нижче за корінь (кіт ще злітає й дряпається на край), а вниз — вище (ще падає), і обидва закінчуються у вихідній позі — з
// неї м'яко вступає основна анімація. Тому стрибок варто починати без змішування (`play(…, { blend: 0 })`): змішування з
// попередньою позою на новій висоті з'їло б перші ≈ 120 мс польоту, і кіт спершу «телепортувався» б на меблі.

const JUMP_UP_MS = CAT_ONE_SHOT_MS.jumpUp;
const JUMP_DOWN_MS = CAT_ONE_SHOT_MS.jumpDown;

const jumpUp: CatAnim = {
  duration: JUMP_UP_MS,
  loop: false,
  bones: posed([
    // Злітає: задні щойно відштовхнулися (витягнуті назад), передні тягнуться вгору-вперед на край, тіло носом угору.
    { t: 0, ease: "out", pose: { pelvis: { y: 22, rot: -26 }, "leg-front-near": { rot: -40 }, "leg-front-far": { rot: -46 }, "leg-back-near": { rot: 40, sx: 1.08 }, "leg-back-far": { rot: 34, sx: 1.08 }, head: { rot: 14 }, tail: tail(-30) } },
    // Передні стали на верх, задні підтягуються під тулуб.
    { t: 150, pose: { pelvis: { y: 1, rot: -8 }, "leg-front-near": { rot: 2 }, "leg-front-far": { rot: 0 }, "leg-back-near": { rot: -26, sx: 0.78 }, "leg-back-far": { rot: -20, sx: 0.8 }, head: { rot: 6 }, tail: tail(-10) } },
    // Приземлився на всі чотири: присів.
    { t: 250, pose: { pelvis: { y: 2.5, rot: 2 }, "leg-front-near": { sx: 0.84 }, "leg-front-far": { sx: 0.84 }, "leg-back-near": { rot: -4, sx: 0.88 }, "leg-back-far": { rot: -4, sx: 0.88 }, head: { rot: -2 }, tail: tail(4) } },
    { t: JUMP_UP_MS, pose: { tail: tail(0) } },
  ]),
  views: { back: BACK_NEAR },
};

const jumpDown: CatAnim = {
  duration: JUMP_DOWN_MS,
  loop: false,
  bones: posed([
    // Ще в повітрі над підлогою: носом униз, передні тягнуться до підлоги, задні — ззаду вгорі, хвіст угору для рівноваги.
    { t: 0, ease: "in", pose: { pelvis: { y: -20, rot: 22 }, "leg-front-near": { rot: -44, sx: 1.06 }, "leg-front-far": { rot: -50, sx: 1.06 }, "leg-back-near": { rot: 18, sx: 0.85 }, "leg-back-far": { rot: 12, sx: 0.85 }, head: { rot: -14 }, tail: tail(28) } },
    // Передні торкнулися підлоги й пружинять; круп ще вгорі.
    { t: 140, pose: { pelvis: { y: -2, rot: 14 }, "leg-front-near": { rot: -14, sx: 0.82 }, "leg-front-far": { rot: -16, sx: 0.82 }, "leg-back-near": { rot: -10, sx: 0.8 }, "leg-back-far": { rot: -14, sx: 0.8 }, head: { rot: -10 }, tail: tail(18) } },
    // Задні стали: кіт присів.
    { t: 250, pose: { pelvis: { y: 2.5 }, "leg-front-near": { rot: 2, sx: 0.88 }, "leg-front-far": { rot: 2, sx: 0.88 }, "leg-back-near": { rot: -4, sx: 0.9 }, "leg-back-far": { rot: -4, sx: 0.9 }, head: { rot: 2 }, tail: tail(-4) } },
    { t: JUMP_DOWN_MS, pose: { tail: tail(0) } },
  ]),
  views: { back: BACK_NEAR },
};

// --- Спокій -----------------------------------------------------------------------------------------

const SIT_MS = 3200;
const sit: CatAnim = {
  duration: SIT_MS,
  loop: true,
  bones: merge(still(SIT), {
    body: breathe(SIT_MS, SIT, 0.025, 2),
    // Хвіст ліниво ворушиться, голова то трохи підводиться (роздивляється), то знову рівно.
    tail: { ...still({ tail: SIT.tail ?? {} }).tail, ...rotAround(SIT_MS, SIT, "tail", [0, 5, 0, -3]) },
    head: rotAround(SIT_MS, SIT, "head", [0, -4]),
  }),
  views: { back: { bones: still(SIT_BACK), slots: NEAR_FRONT_UNDER } },
};

const LOAF_MS = 4000;
const loaf: CatAnim = {
  duration: LOAF_MS,
  loop: true,
  bones: merge(still(LOAF), {
    body: breathe(LOAF_MS, LOAF, 0.03, 2),
    // Дрімає: голова повільно схиляється й знову підводиться; кінчик хвоста ледь ворушиться.
    head: rotAround(LOAF_MS, LOAF, "head", [0, 4]),
    tail: { ...still({ tail: LOAF.tail ?? {} }).tail, ...rotAround(LOAF_MS, LOAF, "tail", [0, 3]) },
  }),
};

const SLEEP_MS = 4000;
const sleep: CatAnim = {
  duration: SLEEP_MS,
  loop: true,
  // Глибоке повільне дихання — два вдихи за цикл; голова ледь піднімається з ним.
  bones: merge(still(CURL), { body: breathe(SLEEP_MS, CURL, 0.05, 2), head: rotAround(SLEEP_MS, CURL, "head", [0, -1.5, 0, -1.5]) }),
  slots: CURL_SLOTS,
  views: { back: { slots: CURL_BACK_SLOTS } },
};

const HIDE_MS = 3000;
const hide: CatAnim = {
  duration: HIDE_MS,
  loop: true,
  bones: merge(still(HIDE), {
    body: breathe(HIDE_MS, HIDE, 0.03, 2),
    // Визирає: голова трохи повертається; кінчик хвоста двічі сіпається.
    head: rotAround(HIDE_MS, HIDE, "head", [0, -3, 0, 2]),
    tail: {
      ...still({ tail: HIDE.tail ?? {} }).tail,
      rot: [-88, -88, -80, -88, -82, -88, -88].map((v, i) => key([0, 1900, 2050, 2200, 2350, 2550, HIDE_MS][i] ?? 0, v, "inOut")),
    },
  }),
};

const CARRIED_MS = 3000;
const carried: CatAnim = {
  duration: CARRIED_MS,
  loop: true,
  bones: merge(still(CARRIED), {
    body: breathe(CARRIED_MS, CARRIED, 0.025, 2),
    // Звисле похитується в такт крокам того, хто несе: задні лапи й хвіст — маятником, із запізненням.
    "leg-back-near": rotAround(CARRIED_MS, CARRIED, "leg-back-near", [0, 4, 0, -2]),
    "leg-back-far": rotAround(CARRIED_MS, CARRIED, "leg-back-far", [-2, 0, 4, 0]),
    tail: { ...still({ tail: CARRIED.tail ?? {} }).tail, ...rotAround(CARRIED_MS, CARRIED, "tail", [0, 5, 0, -5]) },
    head: rotAround(CARRIED_MS, CARRIED, "head", [0, -3]),
  }),
  views: { back: BACK_NEAR },
};

const SPRAWL_MS = 4000;
const sprawl: CatAnim = {
  duration: SPRAWL_MS,
  loop: true,
  bones: merge(still(SPRAWL), { body: breathe(SPRAWL_MS, SPRAWL, 0.04, 2), tail: { ...still({ tail: SPRAWL.tail ?? {} }).tail, ...rotAround(SPRAWL_MS, SPRAWL, "tail", [0, 4]) } }),
};

/** У переносці — клубочок, тісніший, ніж на підлозі (§9.12: крізь дверцята видно клубочок шерсті). */
const CARRIER: Pose = over(CURL, { body: { sx: 0.95 }, neck: { x: 1 } });
const CARRIER_MS = 4400;
const carrier: CatAnim = {
  duration: CARRIER_MS,
  loop: true,
  bones: merge(still(CARRIER), { body: breathe(CARRIER_MS, CARRIER, 0.05, 2) }),
  slots: CURL_SLOTS,
  views: { back: { slots: CURL_BACK_SLOTS } },
};

/**
 * Під ковдрою (§9.12, «Теплолюбність»): горбик ковдри малює ліжко (`env/bed`, стан `hump`), а кіт — лише вушка над ним і
 * кінчик хвоста з другого боку (решта частин схована). Основи вух і корінь хвоста — на висоті ≈ 27 над коренем кота: горбик
 * має вкривати цю лінію. Дихання ледь підіймає вушка, кінчик хвоста ліниво ворушиться.
 */
const BLANKET: Pose = { pelvis: { y: 12 }, neck: { x: -2, y: 4 }, head: { rot: -4 }, tail: { ...tail(-20, 0.6), x: 10, y: -10 } };
const BLANKET_MS = 4000;
const BLANKET_Y = at(BLANKET, "pelvis", "y");
const blanket: CatAnim = {
  duration: BLANKET_MS,
  loop: true,
  bones: merge(still(BLANKET), {
    pelvis: {
      pos: oscV(BLANKET_MS, [
        { x: 0, y: BLANKET_Y },
        { x: 0, y: BLANKET_Y - 0.8 },
        { x: 0, y: BLANKET_Y },
        { x: 0, y: BLANKET_Y - 0.8 },
      ]),
    },
    tail: { ...still({ tail: BLANKET.tail ?? {} }).tail, ...rotAround(BLANKET_MS, BLANKET, "tail", [0, 8]) },
  }),
  slots: {
    body: HIDDEN,
    head: HIDDEN,
    muzzle: HIDDEN,
    eyes: HIDDEN,
    mouth: HIDDEN,
    "leg-back-far": HIDDEN,
    "leg-back-near": HIDDEN,
    "leg-front-far": HIDDEN,
    "leg-front-near": HIDDEN,
  },
};

// --- Справи ------------------------------------------------------------------------------------------

/** Їсть: хрумтить — три швидкі вкуси (голова в миску), потім підвів голову й жує. */
const EAT_MS = 1200;
const EAT_TIMES = [0, 150, 300, 450, 600, 750, 900, 1050, EAT_MS];
const EAT_HEAD = [0, -5, 0, -5, 0, -5, -10, -8, 0];
const EAT_NECK = [0, -1, 0, -1, 0, -1, -2.5, -2, 0];
const eat: CatAnim = {
  duration: EAT_MS,
  loop: true,
  bones: merge(still(EAT), {
    head: { rot: EAT_TIMES.map((t, i) => key(t, at(EAT, "head", "rot") + (EAT_HEAD[i] ?? 0), "inOut")) },
    neck: { pos: EAT_TIMES.map((t, i) => key(t, { x: at(EAT, "neck", "x"), y: at(EAT, "neck", "y") + (EAT_NECK[i] ?? 0) }, "inOut")) },
    tail: { ...still({ tail: EAT.tail ?? {} }).tail, ...rotAround(EAT_MS, EAT, "tail", [0, 3]) },
  }),
  views: { back: BACK_NEAR },
};

/** П'є: язиком хлебче швидко й дрібно — голова ледь сіпається чотири рази за цикл. */
const DRINK_MS = 800;
const drink: CatAnim = {
  duration: DRINK_MS,
  loop: true,
  bones: merge(still(DRINK), {
    head: rotAround(DRINK_MS, DRINK, "head", [0, -2.5, 0, -2.5, 0, -2.5, 0, -2.5]),
  }),
  views: { back: BACK_NEAR },
};

/**
 * Вмивається: сидить, ближню передню лапу підніс до підборіддя — тричі лизнув (голова кивками до лапи), потім двічі провів
 * лапою по морді аж за вухо, схиливши голову. Лапа в цей час — перед мордою (z вище за голову) у ракурсі ¾ спереду; ззаду
 * морди не видно, тож лапа — за головою й тулубом: видно лише кінчик біля щоки й за вухом.
 */
const GROOM_MS = 2400;
const PAW_UP: Pose = { ...SIT, "leg-front-near": { rot: -88, x: -1, y: 3, sx: 0.72 }, head: { rot: 40 } };
const LICK: Pose = { ...PAW_UP, head: { rot: 48 } };
const PAW_WIPE: Pose = { ...PAW_UP, "leg-front-near": { rot: -132, x: 0, y: 1, sx: 0.8 }, head: { rot: 52 } };
const groom: CatAnim = {
  duration: GROOM_MS,
  loop: true,
  bones: merge(
    posed([
      { t: 0, pose: PAW_UP },
      { t: 220, pose: LICK },
      { t: 420, pose: PAW_UP },
      { t: 640, pose: LICK },
      { t: 840, pose: PAW_UP },
      { t: 1060, pose: LICK },
      { t: 1300, pose: PAW_UP },
      { t: 1600, pose: PAW_WIPE },
      { t: 1850, pose: PAW_UP },
      { t: 2150, pose: PAW_WIPE },
      { t: GROOM_MS, pose: PAW_UP },
    ]),
    { body: breathe(GROOM_MS, SIT, 0.02, 2) },
  ),
  slots: { "leg-front-near": { z: [{ t: 0, v: 13.5 }] } },
  views: { back: { bones: still({ "leg-back-near": SIT_BACK["leg-back-near"] ?? {}, "leg-back-far": SIT_BACK["leg-back-far"] ?? {}, "leg-front-far": SIT_BACK["leg-front-far"] ?? {} }), slots: { "leg-front-near": { z: [{ t: 0, v: 2.8 }] } } } },
};

/** Закопує: стоїть, дивиться вниз і гребе лапою назад — спершу ближньою, потім дальньою. */
const BURY_MS = 1200;
const BURY_STAND: Pose = {
  pelvis: { y: 1.5, rot: 4 },
  "leg-front-near": { sx: 0.85 },
  "leg-front-far": { sx: 0.85 },
  "leg-back-near": { sx: 0.93 },
  "leg-back-far": { sx: 0.93 },
  neck: { x: 1, y: 3 },
  head: { rot: 22 },
  tail: tail(-40),
};
const scrape = (leg: "leg-front-near" | "leg-front-far", t0: number): Frame[] => [
  // Лапа піднята вперед…
  { t: t0, pose: { ...BURY_STAND, [leg]: { rot: -30, sx: 0.72 } } },
  // …опускається й гребе назад по підлозі…
  { t: t0 + 260, ease: "in", pose: over({ ...BURY_STAND, [leg]: { rot: 34, sx: 0.98 } }, { pelvis: { y: 0.5 }, head: { rot: 3 } }) },
  // …і знову вгору вперед.
  { t: t0 + 420, pose: { ...BURY_STAND, [leg]: { rot: 20, sx: 0.7 } } },
];
const bury: CatAnim = {
  duration: BURY_MS,
  loop: true,
  bones: posed([...scrape("leg-front-near", 0), ...scrape("leg-front-far", 600), { t: BURY_MS, pose: { ...BURY_STAND, "leg-front-near": { rot: -30, sx: 0.72 } } }]),
  views: { back: BACK_NEAR },
};

/** На лотку: присів і завмер; круп ледь тремтить від зусилля, хвіст напружено витягнутий і тремтить. */
const SQUAT_MS = 2400;
const SQUAT_Y = at(SQUAT, "pelvis", "y");
const squat: CatAnim = {
  duration: SQUAT_MS,
  loop: true,
  bones: merge(still(SQUAT), {
    pelvis: {
      rot: [{ t: 0, v: at(SQUAT, "pelvis", "rot") }],
      pos: oscV(SQUAT_MS, [
        { x: 0, y: SQUAT_Y },
        { x: 0, y: SQUAT_Y + 0.8 },
        { x: 0, y: SQUAT_Y },
        { x: 0, y: SQUAT_Y + 0.8 },
      ]),
    },
    tail: { ...still({ tail: SQUAT.tail ?? {} }).tail, ...rotAround(SQUAT_MS, SQUAT, "tail", [0, 2, 0, 2, 0, 2, 0, 2]) },
    head: rotAround(SQUAT_MS, SQUAT, "head", [0, -3]),
  }),
  views: { back: { bones: still(SQUAT_BACK), slots: NEAR_FRONT_UNDER } },
};

// --- На спині --------------------------------------------------------------------------------------

/** На спині чекає: лапки ліниво перебирають повітря, хвіст мете по підлозі, голова ледь гойдається — пастка. */
const BELLY_MS = 2400;
const belly: CatAnim = {
  duration: BELLY_MS,
  loop: true,
  bones: merge(still(BELLY), {
    body: breathe(BELLY_MS, BELLY, 0.03, 2),
    "leg-front-near": rotAround(BELLY_MS, BELLY, "leg-front-near", [0, -12]),
    "leg-front-far": rotAround(BELLY_MS, BELLY, "leg-front-far", [-10, 0]),
    "leg-back-near": rotAround(BELLY_MS, BELLY, "leg-back-near", [0, 8]),
    tail: { ...still({ tail: BELLY.tail ?? {} }).tail, ...rotAround(BELLY_MS, BELLY, "tail", [0, 10, 0, -6]) },
    head: rotAround(BELLY_MS, BELLY, "head", [0, 5]),
  }),
};

/**
 * Качається на котячій м'яті: на спині звивається з боку на бік — перекочується навколо хребта (у профіль — масштаб таза
 * впоперек: −1 — на спині, ближче до нуля — на боці; голова тим часом лишається рівною й круглою, `headAt`), лапами б'є
 * повітря, голова треться потилицею об підлогу, хвіст мете.
 */
const ROLL_MS = 2000;
/** Наскільки кіт перекочується на бік: масштаб таза впоперек на боці. */
const ROLL_SIDE = 0.68;
const rollSide = (lean: 1 | -1): Pose => {
  // Спина лишається на підлозі: таз опускається на стільки, на скільки сплющився кіт.
  const pelvis: Tweak = { sy: -ROLL_SIDE, x: 4, y: 3 + 20 * (1 - ROLL_SIDE), rot: 6 * lean };
  return {
    ...BELLY,
    pelvis,
    "leg-front-near": { rot: 12 - 26 * lean, y: BELLY_LIFT, sx: 0.88 },
    "leg-front-far": { rot: 20 * lean, y: BELLY_LIFT, sx: 0.82 },
    "leg-back-near": { rot: 16 + 18 * lean, y: BELLY_LIFT, sx: 0.96 },
    "leg-back-far": { rot: 32 - 22 * lean, y: BELLY_LIFT, sx: 0.9 },
    ...headAt(pelvis, {}, BELLY_HEAD_AT, BELLY_TILT + 8 * lean),
    tail: tail(-75 + 18 * lean),
  };
};
const rollBack = (lean: 1 | -1): Pose => {
  const pelvis: Tweak = { ...BELLY_PELVIS, rot: -10 * lean };
  return {
    ...BELLY,
    pelvis,
    "leg-front-near": { rot: 12 + 22 * lean, y: BELLY_LIFT, sx: 0.88 },
    "leg-front-far": { rot: -22 * lean, y: BELLY_LIFT, sx: 0.82 },
    "leg-back-near": { rot: 16 - 20 * lean, y: BELLY_LIFT, sx: 0.96 },
    "leg-back-far": { rot: 32 + 25 * lean, y: BELLY_LIFT, sx: 0.9 },
    ...headAt(pelvis, {}, BELLY_HEAD_AT, BELLY_TILT - 12 * lean),
    tail: tail(-75 - 15 * lean),
  };
};
const roll: CatAnim = {
  duration: ROLL_MS,
  loop: true,
  bones: posed([
    { t: 0, pose: rollBack(1) },
    { t: 500, pose: rollSide(1) },
    { t: 1000, pose: rollBack(-1) },
    { t: 1500, pose: rollSide(-1) },
    { t: ROLL_MS, pose: rollBack(1) },
  ]),
};

/**
 * Анімації, у яких кіт лежить на спині (таз віддзеркалено згори донизу): спинка, а з нею гніздо `pet`, там — на підлозі,
 * під котом.
 */
const BELLY_UP: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["belly", "roll"]);
/** Точка на животі в системі кістки `body` (одиниці арту, як `CAT_RIG.sockets.pet`). */
const BELLY_PET: Vec2 = { x: 13, y: 11 };

/**
 * Де рука гладить кота, що грає анімацію `anim`: для тих, хто лежить на спині (§9.12 — «Пастка на животику» підставляє
 * живіт), — точка на животі в системі кістки `body` (одиниці арту); null — як завжди, у гнізді `pet` (спинка). Для T1 і T2:
 * рука тут — поверх кота, як і в гнізді, без віддзеркалення. (Модулі груп анімацій експортують лише групи, числа й функції:
 * галерея й тести вважають кожен експортований об'єкт групою анімацій.)
 */
export function catPetPoint(anim: CatAnimId): Vec2 | null {
  return BELLY_UP.has(anim) ? { ...BELLY_PET } : null;
}

export const CAT_BASIC = defineAnims(CAT_RIG, {
  walk,
  run,
  sit,
  loaf,
  sleep,
  eat,
  drink,
  groom,
  bury,
  squat,
  jumpUp,
  jumpDown,
  hide,
  carried,
  blanket,
  sprawl,
  carrier,
  belly,
  roll,
});
