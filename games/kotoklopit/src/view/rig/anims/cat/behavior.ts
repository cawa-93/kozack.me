// Анімації групи «behavior» — пакет N2 «Кіт — поведінка» (крок 16, хвиля 2, GRAPHICS_PLAN.md; назви й що кожна означає —
// `anim/ids.ts`, `CAT_ANIM_GROUPS.behavior`; де їх обирають — `pose.ts`, `catAnim`; пози стосунків — GAME_DESIGN.md, §9.4).
//
// Пози описано ключовими позами тіла (`Pose`): зсув і поворот таза, поворот тулуба, шиї, голови й хвоста — відносно вихідної
// пози ракурсу (`rig/types.ts`), а лапи, що стоять, — точкою подушечки на підлозі. Поворот і довжину такої лапи рахує `build`
// (обернена кінематика однієї кістки) для кожного ракурсу окремо: ззаду ближні й дальні лапи міняються місцями, тож у
// `back` лапи мають свої доріжки (`views.back`). Числа вихідної пози — з визначення скелета (`CAT_RIG`), тож якщо скелет
// підженуть під арт (A7), лапи й далі стоятимуть на підлозі. Решта руху — доріжки поверх ключових поз (`over`): хвіст, що
// б'є, тремтіння, кивки голови.
//
// Кути — градуси за годинниковою стрілкою (кіт дивиться праворуч): додатний поворот тулуба опускає морду, лапи — відводить
// назад, хвоста — піднімає його вперед-угору. Вісь y — донизу. Обличчя (очі, рот, вуха) задає `catFace`, тож доріжок цих
// слотів тут немає.

import { CAT_ONE_SHOT_MS } from "../../../anim/ids";
import type { ArtView } from "../../../art/types";
import { CAT_RIG } from "../../defs/cat";
import {
  defineAnims,
  type AnimOf,
  type BoneOf,
  type BoneTracks,
  type Ease,
  type Key,
  type RigTracks,
  type SlotOf,
  type SlotTracks,
  type Vec2,
} from "../../types";

type CatBone = BoneOf<typeof CAT_RIG>;
type CatSlot = SlotOf<typeof CAT_RIG>;
type CatAnim = AnimOf<typeof CAT_RIG>;
type Tracks = RigTracks<CatBone, CatSlot>;

/** Лапи кота. */
type Leg = "leg-front-far" | "leg-front-near" | "leg-back-far" | "leg-back-near";
const LEGS: readonly Leg[] = ["leg-front-far", "leg-front-near", "leg-back-far", "leg-back-near"];

// --- Ключові пози ------------------------------------------------------------------------------

/** Зміна кістки відносно вихідної пози: поворот (градуси), зсув у системі батька (одиниці арту), масштаб (1 — як є). */
interface Move {
  rot?: number;
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
}

/**
 * Лапа, що стоїть: подушечка — у вихідній точці лапи плюс `paw` (одиниці арту в системі кореня: x — уперед, y — донизу,
 * тобто від'ємний — лапу піднято). Поворот і довжину лапи рахує `build`. `x`, `y` — зсув суглоба в системі батька (лапа
 * кріпиться нижче чи вище на тулубі), `sy` — товщина лапи.
 */
interface Plant {
  paw: Vec2;
  x?: number;
  y?: number;
  sy?: number;
}

/** Ключова поза: кістки без запису — у вихідній позі (лапи — разом із тулубом, без підлаштування). */
interface Pose {
  root?: Move;
  pelvis?: Move;
  body?: Move;
  neck?: Move;
  head?: Move;
  tail?: Move;
  legs?: Partial<Record<Leg, Plant | Move>>;
}

/** Ключ анімації: поза в момент `t`; `ease` — як іти до наступного ключа (за замовчуванням `inOut`). */
interface PoseKey {
  t: number;
  pose: Pose;
  ease?: Ease;
}

/** Подушечка на місці. */
const ON_FLOOR: Plant = { paw: { x: 0, y: 0 } };
/** Подушечка на підлозі, зсунута вздовж (уперед — додатне). */
const at = (x: number, y = 0, more: Omit<Plant, "paw"> = {}): Plant => ({ paw: { x, y }, ...more });
/** Усі чотири лапи стоять на своїх місцях. */
const STANDING: Readonly<Record<Leg, Plant>> = { "leg-front-far": ON_FLOOR, "leg-front-near": ON_FLOOR, "leg-back-far": ON_FLOOR, "leg-back-near": ON_FLOOR };

const isPlant = (leg: Plant | Move): leg is Plant => "paw" in leg;

// --- Обернена кінематика -----------------------------------------------------------------------

/** Афінне перетворення: (x, y) → (a·x + c·y + tx, b·x + d·y + ty). */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const DEG = Math.PI / 180;

function trs(x: number, y: number, rot: number, sx: number, sy: number): Affine {
  const cos = Math.cos(rot * DEG);
  const sin = Math.sin(rot * DEG);
  return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, tx: x, ty: y };
}

function mul(p: Affine, l: Affine): Affine {
  return {
    a: p.a * l.a + p.c * l.b,
    b: p.b * l.a + p.d * l.b,
    c: p.a * l.c + p.c * l.d,
    d: p.b * l.c + p.d * l.d,
    tx: p.a * l.tx + p.c * l.ty + p.tx,
    ty: p.b * l.tx + p.d * l.ty + p.ty,
  };
}

const apply = (m: Affine, x: number, y: number): Vec2 => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });

/** Вектор у систему перетворення (без зсуву). */
function unrotate(m: Affine, v: Vec2): Vec2 {
  const det = m.a * m.d - m.b * m.c || 1;
  return { x: (m.d * v.x - m.c * v.y) / det, y: (m.a * v.y - m.b * v.x) / det };
}

/** Вихідна поза кістки в ракурсі — з визначення скелета й перевизначень ракурсу. */
function setupOf(id: CatBone, view: ArtView): { x: number; y: number; rot: number; len: number; parent: CatBone | null } {
  const bone = CAT_RIG.bones.find((b) => b.id === id);
  if (!bone) throw new Error(`Кістки «${id}» немає`);
  const over = CAT_RIG.views[view].bones?.[id];
  return { x: over?.x ?? bone.x, y: over?.y ?? bone.y, rot: over?.rot ?? bone.rot, len: over?.len ?? bone.len, parent: bone.parent };
}

/** Світове перетворення кістки в позі (лапи — без своїх змін: потрібні лише батьки лап). */
function worldOf(id: CatBone, view: ArtView, pose: Pose, cache: Map<CatBone, Affine>): Affine {
  const have = cache.get(id);
  if (have) return have;
  const s = setupOf(id, view);
  const m = moveOf(pose, id) ?? {};
  const local = trs(s.x + (m.x ?? 0), s.y + (m.y ?? 0), s.rot + (m.rot ?? 0), m.sx ?? 1, m.sy ?? 1);
  const world = s.parent === null ? local : mul(worldOf(s.parent, view, pose, cache), local);
  cache.set(id, world);
  return world;
}

/** Зміна не-лапи в позі. */
function moveOf(pose: Pose, id: CatBone): Move | undefined {
  switch (id) {
    case "root":
    case "pelvis":
    case "body":
    case "neck":
    case "head":
    case "tail":
      return pose[id];
    default:
      return undefined;
  }
}

/** Де подушечка лапи у вихідній позі ракурсу (система кореня). */
function setupPaw(leg: Leg, view: ArtView): Vec2 {
  const s = setupOf(leg, view);
  const parent = worldOf(s.parent ?? "root", view, {}, new Map());
  const origin = apply(parent, s.x, s.y);
  const r = s.rot * DEG;
  return { x: origin.x + Math.cos(r) * s.len, y: origin.y + Math.sin(r) * s.len };
}

/** Зміна лапи, що стоїть: поворот і довжина, щоб подушечка стала в `plant.paw` від вихідної точки. */
function plantLeg(leg: Leg, view: ArtView, pose: Pose, plant: Plant, cache: Map<CatBone, Affine>): Move {
  const s = setupOf(leg, view);
  const parent = worldOf(s.parent ?? "root", view, pose, cache);
  const ox = s.x + (plant.x ?? 0);
  const oy = s.y + (plant.y ?? 0);
  const origin = apply(parent, ox, oy);
  const home = setupPaw(leg, view);
  const target = { x: home.x + plant.paw.x, y: home.y + plant.paw.y };
  const v = unrotate(parent, { x: target.x - origin.x, y: target.y - origin.y });
  const angle = Math.atan2(v.y, v.x) / DEG;
  return { rot: angle - s.rot, x: plant.x ?? 0, y: plant.y ?? 0, sx: Math.hypot(v.x, v.y) / s.len, sy: plant.sy ?? 1 };
}

/** Зміни всіх кісток пози в ракурсі. */
function solve(pose: Pose, view: ArtView): Partial<Record<CatBone, Move>> {
  const cache = new Map<CatBone, Affine>();
  const out: Partial<Record<CatBone, Move>> = {};
  for (const bone of CAT_RIG.bones) {
    const id = bone.id;
    const leg = LEGS.find((l) => l === id);
    if (leg === undefined) {
      const m = moveOf(pose, id);
      if (m) out[id] = m;
      continue;
    }
    const spec = pose.legs?.[leg];
    if (spec) out[leg] = isPlant(spec) ? plantLeg(leg, view, pose, spec, cache) : spec;
  }
  return out;
}

// --- Доріжки -----------------------------------------------------------------------------------

const EPS = 1e-3;
const round = (v: number): number => Math.round(v * 100) / 100;

/** Доріжки кісток з ключових поз в одному ракурсі; порожні (усюди вихідна поза) — пропущено. */
function tracksOf(keys: readonly PoseKey[], view: ArtView): Partial<Record<CatBone, BoneTracks>> {
  const solved = keys.map((k) => solve(k.pose, view));
  const out: Partial<Record<CatBone, BoneTracks>> = {};
  for (const bone of CAT_RIG.bones) {
    const id = bone.id;
    const moves = solved.map((s) => s[id] ?? {});
    const rot = moves.map((m) => round(m.rot ?? 0));
    const pos = moves.map((m) => ({ x: round(m.x ?? 0), y: round(m.y ?? 0) }));
    const scale = moves.map((m) => ({ x: round(m.sx ?? 1), y: round(m.sy ?? 1) }));
    const tracks: BoneTracks = {};
    if (rot.some((v) => Math.abs(v) > EPS)) tracks.rot = keyed(keys, rot);
    if (pos.some((v) => Math.abs(v.x) > EPS || Math.abs(v.y) > EPS)) tracks.pos = keyed(keys, pos);
    if (scale.some((v) => Math.abs(v.x - 1) > EPS || Math.abs(v.y - 1) > EPS)) tracks.scale = keyed(keys, scale);
    if (tracks.rot || tracks.pos || tracks.scale) out[id] = tracks;
  }
  return out;
}

/** Ключі доріжки за часом ключових поз; однакові поспіль ключі (і всі однакові) — стиснуто. */
function keyed<V>(keys: readonly PoseKey[], values: readonly V[]): Key<V>[] {
  const same = (a: V, b: V): boolean => JSON.stringify(a) === JSON.stringify(b);
  if (values.every((v) => same(v, values[0] as V))) return [{ t: 0, v: values[0] as V }];
  return keys.map((k, i) => ({ t: k.t, v: values[i] as V, ease: k.ease ?? "inOut" }));
}

const sameTracks = (a: BoneTracks | undefined, b: BoneTracks | undefined): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/** Доріжки поверх ключових поз: замінюють ті самі доріжки (rot, pos чи scale) тих самих кісток; слоти — доріжки слотів. */
interface Over {
  bones?: Partial<Record<CatBone, BoneTracks>>;
  slots?: Partial<Record<CatSlot, SlotTracks>>;
  /** Те саме лише для ракурсу `back`. */
  back?: { bones?: Partial<Record<CatBone, BoneTracks>>; slots?: Partial<Record<CatSlot, SlotTracks>> };
}

/**
 * Анімація з ключових поз: доріжки кісток для `front`, а де `back` інакший (лапи, що стоять) — перевизначення ракурсу. По
 * колу — перший і останній ключі мають бути тією самою позою (без ривка на стику).
 */
function build(duration: number, loop: boolean, keys: readonly PoseKey[], over: Over = {}): CatAnim {
  const front = { ...tracksOf(keys, "front") };
  const backAll = tracksOf(keys, "back");
  const back: Partial<Record<CatBone, BoneTracks>> = {};
  for (const bone of CAT_RIG.bones) {
    const id = bone.id;
    if (!sameTracks(front[id], backAll[id])) back[id] = { ...(backAll[id] ?? {}) };
  }
  for (const [id, tracks] of Object.entries(over.bones ?? {}) as [CatBone, BoneTracks][]) {
    front[id] = { ...front[id], ...tracks };
    if (back[id]) back[id] = { ...back[id], ...tracks };
  }
  for (const [id, tracks] of Object.entries(over.back?.bones ?? {}) as [CatBone, BoneTracks][]) back[id] = { ...(back[id] ?? front[id]), ...tracks };
  // Перевизначення ракурсу замінює доріжку лише тоді, коли вона в ньому є: доріжку, якої в `back` немає (там усюди вихідна
  // поза), задати явно — інакше діяла б доріжка `front`.
  for (const [id, tracks] of Object.entries(back) as [CatBone, BoneTracks][]) {
    const main = front[id];
    if (main?.rot && !tracks.rot) tracks.rot = [{ t: 0, v: 0 }];
    if (main?.pos && !tracks.pos) tracks.pos = [{ t: 0, v: v2(0, 0) }];
    if (main?.scale && !tracks.scale) tracks.scale = [{ t: 0, v: v2(1, 1) }];
  }
  const views: Partial<Record<ArtView, Tracks>> = {};
  const backTracks: Tracks = {};
  if (Object.keys(back).length > 0) backTracks.bones = back;
  if (over.back?.slots) backTracks.slots = over.back.slots;
  if (backTracks.bones || backTracks.slots) views.back = backTracks;
  const anim: CatAnim = { duration, loop, bones: front, ...(over.slots ? { slots: over.slots } : {}), ...(views.back ? { views } : {}) };
  return anim;
}

/**
 * Синусоїда без ривка на стику: ключі кожні чверть періоду — від екстремуму до нуля `in`, від нуля до екстремуму `out`, тож
 * між ключами крива — точно синус. `phase` — у чвертях періоду (0 — починає з `mid + amp`, 1 — з середини донизу, 2 — з
 * `mid − amp`, 3 — з середини догори). `duration` — ціле число періодів.
 */
function sine(duration: number, period: number, mid: number, amp: number, phase = 0): Key<number>[] {
  const quarter = period / 4;
  const keys: Key<number>[] = [];
  for (let i = 0; i * quarter <= duration + 1e-6; i++) {
    const q = (i + phase) % 4;
    const v = q === 0 ? mid + amp : q === 2 ? mid - amp : mid;
    keys.push({ t: Math.round(i * quarter), v: round(v), ease: q % 2 === 0 ? "in" : "out" });
  }
  return keys;
}

/** Ключі довільної доріжки: [t, v] або [t, v, ease]; за замовчуванням `inOut`. */
function track<V>(...list: readonly (readonly [number, V] | readonly [number, V, Ease])[]): Key<V>[] {
  return list.map(([t, v, ease]) => ({ t, v, ease: ease ?? "inOut" }));
}

/** Вектор. */
const v2 = (x: number, y: number): Vec2 => ({ x, y });

/** Дихання: тулуб ледь ширшає впоперек (груди) і вертається — доріжка масштабу тулуба, `amp` — частка. */
function breathe(duration: number, period: number, amp: number): Key<Vec2>[] {
  return sine(duration, period, 1 + amp / 2, amp / 2, 2).map((k) => ({ ...k, v: v2(1, k.v) }));
}

// --- Спільні пози ------------------------------------------------------------------------------

/** Хвіст того, хто сидить, лежить на підлозі позаду й загинається вперед; того, хто лежить буханцем, — пласко позаду. */
const SIT_TAIL = -75;
const LOAF_TAIL = -95;

/**
 * Сидить: зад опущено до підлоги, тулуб піднято мордою вгору, передні лапи прямі від грудей до підлоги, задні складено
 * вздовж підлоги вперед (ступня лежить, як у кота, що сидить), голова рівно над грудьми; хвіст лежить на підлозі позаду.
 */
const SIT: Pose = {
  pelvis: { y: 9 },
  body: { rot: -32 },
  neck: { rot: 18 },
  head: { rot: 14 },
  tail: { rot: SIT_TAIL },
  legs: {
    "leg-front-far": at(2, 0, { y: 3 }),
    "leg-front-near": at(1, 0, { y: 3 }),
    "leg-back-far": at(15, 0, { x: 3, y: 5 }),
    "leg-back-near": at(18, 0, { x: 3, y: 5 }),
  },
};

/** Сидить — з іншими тулубом, головою, хвостом чи лапами. */
const sitWith = (more: Pose): Pose => ({ ...SIT, ...more, legs: { ...SIT.legs, ...more.legs } });

/**
 * Буханець: тулуб лежить на підлозі, лапки підібрано (передні — короткими подушечками під грудьми, задні сховано під
 * боки), голова піднята; хвіст лежить позаду.
 */
const LOAF: Pose = {
  pelvis: { y: 12 },
  neck: { rot: -6 },
  head: { rot: 6 },
  tail: { rot: LOAF_TAIL },
  legs: {
    "leg-front-far": { rot: -82, sx: 0.5, y: -1 },
    "leg-front-near": { rot: -82, sx: 0.5, y: -1 },
    "leg-back-far": { rot: 80, sx: 0.5, y: -4 },
    "leg-back-near": { rot: 80, sx: 0.5, y: -4 },
  },
};

const loafWith = (more: Pose): Pose => ({ ...LOAF, ...more, legs: { ...LOAF.legs, ...more.legs } });

/** Стоїть, як у вихідній позі. */
const STAND: Pose = { legs: STANDING };

const standWith = (more: Pose): Pose => ({ ...STAND, ...more, legs: { ...STANDING, ...more.legs } });

/** Середина тулуба в системі таза: довкола неї крутиться клубок бійки. */
const BODY_MIDDLE: Vec2 = { x: 8, y: -4 };

/**
 * Таз, повернутий на `rot`, так, щоб середина тулуба стала в точку `at` (система кореня): клубок крутиться довкола себе, а
 * не довкола стегон.
 */
function spin(rot: number, at: Vec2): Move {
  const pelvis = setupOf("pelvis", "front");
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  const mx = c * BODY_MIDDLE.x - s * BODY_MIDDLE.y;
  const my = s * BODY_MIDDLE.x + c * BODY_MIDDLE.y;
  return { rot, x: round(at.x - pelvis.x - mx), y: round(at.y - pelvis.y - my) };
}

// --- Анімації ------------------------------------------------------------------------------------

/** «Спина дугою» (§9.4, поза 1): цикл, мс — вдих-видих настовбурченої шерсті з тремтінням поверх. */
const ARCH_MS = 1200;
/** Тулуб у дузі: вужчий і вищий — спина горбом. */
const ARCH_BODY = { x: 0.92, y: 1.2 } as const;

/**
 * Дуга: тулуб угору горбом на прямих напружених лапах (лапи — прямовисно під плечима й стегнами), морда опущена нижче
 * спини, хвіст трубою — угору, пухнастий, кінчик загнуто над спиною. Голова — у своєму масштабі (поправка на тулуб), лише
 * трохи більша: настовбурчена. Кіт відступив назад від своєї точки, щоб двоє в протистоянні (64 одиниці між точками) стояли морда до
 * морди, а не одне в одному.
 */
function archPose(puff: number): Pose {
  const bx = ARCH_BODY.x * puff;
  const by = ARCH_BODY.y * puff;
  return {
    pelvis: { x: -11, y: -7, rot: 4 },
    body: { sx: bx, sy: by },
    neck: { rot: 24, y: 5 },
    head: { rot: -28, sx: 1.04 / bx, sy: 1.04 / by },
    tail: { rot: 22, sx: 1.08 * puff, sy: 1.08 * puff },
    legs: {
      "leg-front-far": at(-11, 0, { y: 3, sy: 0.95 }),
      "leg-front-near": at(-11, 0, { y: 3, sy: 0.95 }),
      "leg-back-far": at(-11, 0, { y: 3, sy: 0.95 }),
      "leg-back-near": at(-11, 0, { y: 3, sy: 0.95 }),
    },
  };
}

const ARCH = archPose(1);

/** «Спина дугою» (§9.4, поза 1): настовбурчена дуга дихає, тулуб і хвіст дрібно тремтять. */
function arch(): CatAnim {
  return build(
    ARCH_MS,
    true,
    [
      { t: 0, pose: ARCH },
      { t: ARCH_MS / 2, pose: archPose(1.03) },
      { t: ARCH_MS, pose: ARCH },
    ],
    {
      bones: {
        // Дрібне тремтіння: тулуб і хвіст здригаються.
        body: { rot: sine(ARCH_MS, 100, 0, 0.7) },
        tail: { rot: sine(ARCH_MS, 150, 22, 2.5) },
      },
    },
  );
}

/**
 * Шипіння — накладка, разова (`CAT_ONE_SHOT_MS.hiss`; рот з іклами й вуха назад — з `catFace`): кидок уперед — голова
 * подається вперед і вниз, тіло за нею, хвіст настовбурчується; тримає, здригаючись, і м'яко вертається — накладка
 * закінчується нулем, тож основна анімація продовжується без ривка.
 */
function hiss(): CatAnim {
  const D = CAT_ONE_SHOT_MS.hiss;
  /** Кидок триває до `LUNGE`, тримає до `HOLD`, далі — назад. */
  const LUNGE = Math.round(D / 7);
  const HOLD = Math.round((D * 3) / 4);
  const during = (part: number): number => Math.round(LUNGE + (HOLD - LUNGE) * part);
  return {
    duration: D,
    loop: false,
    bones: {
      pelvis: { pos: track([0, v2(0, 0), "out"], [LUNGE, v2(3, 0.5)], [HOLD, v2(3, 0.5)], [D, v2(0, 0)]) },
      neck: {
        pos: track([0, v2(0, 0), "out"], [LUNGE, v2(5.5, 2.5)], [during(0.5), v2(5, 2.5)], [HOLD, v2(5.5, 2.5)], [D, v2(0, 0)]),
        rot: track([0, 0, "out"], [LUNGE, 12], [HOLD, 12], [D, 0]),
      },
      head: { rot: track([0, 0, "out"], [LUNGE, -10], [during(0.25), -7], [during(0.5), -10], [during(0.75), -7], [HOLD, -10], [D, 0]) },
      tail: { scale: track([0, v2(1, 1), "out"], [LUNGE, v2(1.08, 1.08)], [HOLD, v2(1.08, 1.08)], [D, v2(1, 1)]) },
    },
  };
}

/**
 * «Клубок бійки» (§9.4, поза 2): кіт згорнувся кулею довкола точки посередині пари (`PAIR_GAPS.brawl` = 0) і крутиться
 * ривками перед хмарою `fx/brawl-cloud`; голова підібрана, лапи б'ють навсібіч — передні дряпають уперед, задні буцають, —
 * хвіст мотається. Обидва коти пари грають те саме віддзеркалено, тож ритм навмисно нерівний — ривки різної довжини й сили,
 * щоб двоє не здавалися дзеркалом одне одного.
 */
function brawl(): CatAnim {
  const D = 900;
  const middle = v2(2, -24);
  const ball = (rot: number, hop: number, ff: number, fn: number, bf: number, bn: number, tail: number): Pose => ({
    root: { y: hop },
    pelvis: spin(rot, middle),
    body: { sx: 1.06, sy: 1.06 },
    neck: { rot: 40 },
    head: { rot: -24 },
    tail: { rot: tail, sx: 1.12, sy: 1.12 },
    legs: {
      "leg-front-far": { rot: ff, sx: 1.08 },
      "leg-front-near": { rot: fn, sx: 1.08 },
      "leg-back-far": { rot: bf, sx: 1.04 },
      "leg-back-near": { rot: bn, sx: 1.04 },
    },
  });
  // Передні лапи дряпають уперед і вгору, задні буцають то вперед (під себе), то назад — лапи стирчать з кулі навсібіч.
  const A = ball(-20, 0, -140, -70, 70, -50, -60);
  return build(D, true, [
    { t: 0, pose: A, ease: "out" },
    { t: 130, pose: ball(25, -5, -60, -150, -40, 90, 20), ease: "inOut" },
    { t: 250, pose: ball(-45, -1, -150, -90, 100, 20, -120), ease: "out" },
    { t: 420, pose: ball(35, -6, -80, -140, -60, 70, 40), ease: "inOut" },
    { t: 540, pose: ball(-5, 0, -120, -40, 60, -40, -70), ease: "out" },
    { t: 720, pose: ball(45, -3, -50, -120, 20, 100, -10), ease: "inOut" },
    { t: D, pose: A },
  ]);
}

/**
 * «Вилизує іншого» (§9.4, поза 3): сидить упритул збоку, подавшись до друга; голова — біля його щоки й шиї й ходить у ритмі
 * лизання: два мазки знизу вгору (швидко вгору, повільніше вниз) і пауза; хвіст спокійно лежить. Очі напівзаплющені й
 * язичок — з `catFace`.
 */
function lick(): CatAnim {
  const D = 1200;
  const reach = (up: number): Pose => sitWith({ body: { rot: -16 }, neck: { rot: 40 - up * 0.3, x: 3, y: 5 - up * 0.3 }, head: { rot: -26 - up } });
  const down = reach(0);
  const up = reach(14);
  return build(
    D,
    true,
    [
      { t: 0, pose: down, ease: "in" },
      { t: 160, pose: up, ease: "inOut" },
      { t: 400, pose: down, ease: "in" },
      { t: 560, pose: up, ease: "inOut" },
      { t: 800, pose: down },
      { t: D, pose: down },
    ],
    { bones: { tail: { rot: sine(D, D, SIT_TAIL, 4) } } },
  );
}

/**
 * Ігрова боротьба, зверху (§9.4, поза 4): стоїть над другом, що лежить на спині, — тіло відсунуте назад і трохи піднесене,
 * ближня передня лапа високо піднята й легенько б'є згори вниз (двічі й пауза); хвіст угору й мотається.
 */
function paw(): CatAnim {
  const D = 1400;
  const base = (rot: number): Pose =>
    standWith({
      pelvis: { x: -9, y: -1 },
      body: { rot: -10 },
      neck: { rot: 18 },
      head: { rot: -6 },
      legs: {
        "leg-front-near": { rot, sx: 0.92, y: -1 },
        "leg-front-far": at(-6),
        "leg-back-far": at(-9),
        "leg-back-near": at(-9),
      },
    });
  const raised = base(-102);
  const hit = base(-36);
  return build(
    D,
    true,
    [
      { t: 0, pose: raised, ease: "in" },
      { t: 140, pose: hit, ease: "out" },
      { t: 380, pose: raised, ease: "in" },
      { t: 520, pose: hit, ease: "out" },
      { t: 800, pose: base(-82) },
      { t: D, pose: raised },
    ],
    { bones: { tail: { rot: sine(D, 700, 22, 14) } } },
  );
}

/**
 * Ігрова боротьба, знизу (§9.4, поза 4): лежить на спині — тулуб перевернуто животом догори, лапи догори дриґають
 * (повільніше, ніж у клубку бійки), голова підведена до того, хто зверху, хвіст мотається.
 */
function kick(): CatAnim {
  const D = 1100;
  const pose = (ff: number, fn: number, bf: number, bn: number, rock: number): Pose => ({
    pelvis: { x: -4, y: 5, rot: rock, sy: -1 },
    neck: { rot: -10, y: 7 },
    head: { rot: -12, sy: -1 },
    tail: { rot: -20, sy: -1 },
    legs: {
      "leg-front-far": { rot: ff, sx: 1.12 },
      "leg-front-near": { rot: fn, sx: 1.12 },
      "leg-back-far": { rot: bf, sx: 1.08 },
      "leg-back-near": { rot: bn, sx: 1.08 },
    },
  });
  const A = pose(-55, 10, -25, 45, -3);
  const B = pose(10, -55, 45, -25, 3);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: D / 2, pose: B },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, 550, -20, 16) } } },
  );
}

/** Засідка (§9.12, §9.4, поза 5): припав до підлоги, голова низько й уперед, зад виляє, кінчик хвоста смикається. */
function crouch(): CatAnim {
  const D = 1600;
  const low = (rump: number): Pose => ({
    pelvis: { y: 9 - rump * 1.6, rot: rump * 2 },
    body: { rot: 2 - rump * 2 + rump * 1.2 },
    neck: { rot: 4 },
    head: { rot: -6 },
    tail: { rot: -100 },
    legs: {
      "leg-front-far": at(9, 0, { sy: 1.1 }),
      "leg-front-near": at(9, 0, { sy: 1.1 }),
      "leg-back-far": at(5, 0, { sy: 1.1 }),
      "leg-back-near": at(5, 0, { sy: 1.1 }),
    },
  });
  const rest = low(0);
  return build(
    D,
    true,
    [
      { t: 0, pose: rest },
      { t: 140, pose: low(1) },
      { t: 280, pose: low(-0.4) },
      { t: 420, pose: low(1) },
      { t: 560, pose: low(-0.4) },
      { t: 700, pose: low(1) },
      { t: 880, pose: rest },
      { t: D, pose: rest },
    ],
    { bones: { tail: { rot: track([0, -100], [900, -100], [1000, -90], [1100, -102], [1200, -92], [1320, -100], [D, -100]) } } },
  );
}

/**
 * Дряпає (§9.12, «Дряпання»; і лапає рулон на стіні): стоїть на задніх лапах, витягнувшись угору, голова задерта, передні
 * лапи високо на кігтеточці й по черзі тягнуть униз; ближня лапа — перед мордою.
 */
function scratch(): CatAnim {
  const D = 1100;
  const up = (near: number, far: number): Pose => ({
    pelvis: { x: 2, y: 2, rot: -62 },
    neck: { rot: 40, x: -3 },
    head: { rot: 10 },
    tail: { rot: -55 },
    legs: {
      "leg-front-far": { rot: far },
      "leg-front-near": { rot: near },
      "leg-back-far": at(4),
      "leg-back-near": at(4),
    },
  });
  const A = up(-66, -34);
  const B = up(-34, -66);
  return build(
    D,
    true,
    [
      { t: 0, pose: A, ease: "in" },
      { t: 420, pose: B, ease: "inOut" },
      { t: 550, pose: B, ease: "in" },
      { t: 970, pose: A, ease: "inOut" },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, D, -55, 8, 1) } } },
  );
}

/**
 * Потягується на килимку (§9.12, «Дряпання»): груди й голова до підлоги, зад догори на прямих задніх лапах, хвіст угору,
 * передні лапи далеко вперед і по черзі шкрябають килимок.
 */
function stretch(): CatAnim {
  const D = 2400;
  const bow = (near: number, far: number): Pose => ({
    pelvis: { x: -2, y: 1, rot: 26 },
    neck: { rot: 4 },
    head: { rot: -22 },
    tail: { rot: 22 },
    legs: {
      "leg-front-far": at(24 + far, 0),
      "leg-front-near": at(22 + near, 0),
      "leg-back-far": at(-3),
      "leg-back-near": at(-3),
    },
  });
  const A = bow(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 350, pose: bow(-8, 0), ease: "in" },
      { t: 700, pose: A },
      { t: 1050, pose: bow(0, -8), ease: "in" },
      { t: 1400, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, D / 2, 22, 5, 1) } } },
  );
}

/**
 * Мітить (§9.12, «Мітки»): стоїть задом до цілі, зад піднято, хвіст задертий трубою вгору й тремтить, задні лапи
 * переступають.
 */
function mark(): CatAnim {
  const D = 1200;
  const stand = (bn: number, bf: number): Pose =>
    standWith({
      pelvis: { x: -2, y: -4, rot: 14 },
      neck: { rot: -18 },
      head: { rot: 8 },
      legs: { "leg-back-near": at(-3, bn), "leg-back-far": at(-3, bf), "leg-front-far": at(2), "leg-front-near": at(2) },
    });
  const A = stand(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 150, pose: stand(-5, 0) },
      { t: 300, pose: A },
      { t: 450, pose: stand(0, -5) },
      { t: 600, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, 60, 30, 3), scale: track([0, v2(1.05, 1.05)]) } } },
  );
}

/**
 * Скидає лапою (§9.12, «Скидання речей»; і лапає дверцята шафки чи смітник): сидить, подається вперед і тягнеться ближньою
 * лапою — штовхає раз, другий і відводить її.
 */
function knock(): CatAnim {
  const D = 1400;
  const pose = (rot: number, lean: number): Pose =>
    sitWith({ body: { rot: -32 + lean }, neck: { rot: 24 - lean }, head: { rot: 8 }, legs: { "leg-front-near": { rot, y: 2 } } });
  const rest = pose(15, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: rest },
      { t: 260, pose: pose(-70, 6) },
      { t: 400, pose: pose(-100, 8), ease: "out" },
      { t: 540, pose: pose(-70, 6) },
      { t: 680, pose: pose(-100, 8), ease: "out" },
      { t: 920, pose: rest },
      { t: D, pose: rest },
    ],
    { bones: { tail: { rot: sine(D, D / 2, SIT_TAIL, 5, 1) } } },
  );
}

/**
 * Просить (§9.12; і чекає крана на умивальнику): сидить рівно, витягнувшись, задерши морду до персонажа, і тупцяє
 * передніми лапками; хвіст повільно мете підлогу.
 */
function beg(): CatAnim {
  const D = 1600;
  const pose = (ff: number, fn: number): Pose =>
    sitWith({
      pelvis: { y: 8 },
      body: { rot: -42 },
      neck: { rot: 14 },
      head: { rot: 4 },
      legs: { "leg-front-far": at(3, ff, { y: 3 }), "leg-front-near": at(2, fn, { y: 3 }) },
    });
  const A = pose(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 200, pose: pose(0, -6) },
      { t: 400, pose: A },
      { t: 600, pose: pose(-6, 0) },
      { t: 800, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, 1600, -72, 9) } } },
  );
}

/**
 * Буцає головою (§9.12, «Ласкавість»): стоїть біля персонажа й тре лобом — подається вперед, голова вгору (лоб уперед),
 * потім ковзає щокою назад; хвіст трубою, кінчик тремтить.
 */
function nudge(): CatAnim {
  const D = 1600;
  const pose = (push: number, tilt: number): Pose =>
    standWith({ pelvis: { x: push * 0.6 }, body: { rot: -push * 0.5 }, neck: { rot: -push * 2, x: push }, head: { rot: tilt } });
  const A = pose(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 320, pose: pose(5, -22) },
      { t: 520, pose: pose(5, -14) },
      { t: 820, pose: pose(2, 12) },
      { t: 1100, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, 400, 22, 3) } } },
  );
}

/** На клавіатурі (§9.12, «Кіт і робота»): сидить і місить клавіші передніми лапками, голова повільно роззирається. */
function keyboard(): CatAnim {
  const D = 3000;
  const pose = (ff: number, fn: number, look: number): Pose =>
    sitWith({ head: { rot: 14 + look }, legs: { "leg-front-far": at(2, ff, { y: 3 }), "leg-front-near": at(1, fn, { y: 3 }) } });
  const A = pose(0, 0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 250, pose: pose(0, -7, -3) },
      { t: 500, pose: pose(-7, 0, -6) },
      { t: 750, pose: pose(0, -7, -8) },
      { t: 1000, pose: pose(0, 0, -8) },
      { t: 1700, pose: pose(0, 0, 8) },
      { t: 1950, pose: pose(-7, 0, 8) },
      { t: 2200, pose: pose(0, -7, 5) },
      { t: 2450, pose: pose(0, 0, 3) },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, D / 2, SIT_TAIL, 6, 1) } } },
  );
}

/**
 * Біля вікна (§9.12, «Вікно»): сидить, задерши голову, стежить за птахами — голова повільно веде за ними й смикається за
 * новим, кінчик хвоста сіпається. Здебільшого спиною до нас — у вікно в задній стіні (`catFacing`).
 */
function watchWindow(): CatAnim {
  const D = 4000;
  const pose = (look: number, lift: number): Pose => sitWith({ neck: { rot: 4 - lift }, head: { rot: 14 + look } });
  const A = pose(0, 6);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 900, pose: pose(-12, 10) },
      { t: 1500, pose: pose(-12, 10) },
      { t: 1620, pose: pose(4, 4), ease: "out" },
      { t: 2600, pose: pose(10, 8) },
      { t: 3300, pose: pose(2, 6) },
      { t: D, pose: A },
    ],
    {
      bones: {
        body: { scale: breathe(D, 2000, 0.02) },
        tail: {
          rot: track([0, SIT_TAIL], [1600, SIT_TAIL], [1700, SIT_TAIL + 9], [1800, SIT_TAIL - 1], [1900, SIT_TAIL + 8], [2000, SIT_TAIL], [D, SIT_TAIL]),
        },
      },
    },
  );
}

/**
 * Стрибає за пером вудки (§8.2, §9.12; і б'є свою іграшку): припадає й виляє задом, вистрибує вгору — тіло витягнуте,
 * передні лапи над головою ловлять перо, — приземляється на передні й випрямляється.
 */
function pounce(): CatAnim {
  const D = 1300;
  const ready = (rump: number): Pose =>
    standWith({
      pelvis: { y: 7 - rump, rot: rump },
      body: { rot: 3 - rump },
      neck: { rot: -4 },
      legs: { "leg-front-far": at(5), "leg-front-near": at(5), "leg-back-far": at(5), "leg-back-near": at(5) },
    });
  const launch: Pose = {
    root: { y: -8 },
    pelvis: { rot: -35 },
    neck: { rot: 12 },
    head: { rot: 4 },
    tail: { rot: -40 },
    legs: { "leg-front-far": { rot: -125 }, "leg-front-near": { rot: -95 }, "leg-back-far": { rot: 30 }, "leg-back-near": { rot: 35 } },
  };
  const top: Pose = {
    root: { y: -22 },
    pelvis: { x: 4, rot: -58 },
    neck: { rot: 24 },
    head: { rot: 16 },
    tail: { rot: -30 },
    legs: { "leg-front-far": { rot: -150 }, "leg-front-near": { rot: -118 }, "leg-back-far": { rot: 10 }, "leg-back-near": { rot: 20 } },
  };
  const land: Pose = standWith({
    pelvis: { y: 4, rot: 8 },
    neck: { rot: -8 },
    legs: { "leg-front-far": at(6), "leg-front-near": at(6), "leg-back-far": at(-2), "leg-back-near": at(-2) },
  });
  return build(
    D,
    true,
    [
      { t: 0, pose: STAND },
      { t: 180, pose: ready(0) },
      { t: 270, pose: ready(2) },
      { t: 360, pose: ready(0), ease: "in" },
      { t: 470, pose: launch, ease: "out" },
      { t: 620, pose: top, ease: "in" },
      { t: 780, pose: land, ease: "out" },
      { t: 1000, pose: STAND },
      { t: D, pose: STAND },
    ],
    // У стрибку ближня лапа ловить перо перед мордою — поверх голови.
    {
      slots: {
        "leg-front-near": {
          z: [
            { t: 0, v: 7 },
            { t: 430, v: 10.5 },
            { t: 760, v: 7 },
          ],
        },
      },
    },
  );
}

/**
 * Цикл ходи, мс, і пів кроку подушечки вздовж підлоги — як у звичайній ході (N1, `basic.ts`: рись 340 мс, крок ≈ 22
 * одиниці), щоб кіт, що підхопив шкарпетку, ішов у тому самому темпі. Подушечка в переносі піднімається на `GAIT_LIFT`.
 */
const GAIT_MS = 340;
const GAIT_STEP = 10.5;
const GAIT_LIFT = 4;

/** Подушечка в ході за фазою кроку 0…1: опора (пів циклу) — рівномірно назад по підлозі, перенос — дугою вперед. */
function gaitPaw(phase: number): Plant {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return at(round(GAIT_STEP - 4 * GAIT_STEP * p));
  const u = (p - 0.5) / 0.5;
  return at(round(-GAIT_STEP + GAIT_STEP * (1 - Math.cos(Math.PI * u))), round(-GAIT_LIFT * Math.sin(Math.PI * u)));
}

/**
 * Несе в зубах (§9.12: шкарпетку, іграшку) — рись з високо піднятою головою і хвостом угору: діагональні пари лап (ближня
 * передня з дальньою задньою), подушечки в опорі стоять на підлозі (`build` рахує лапи), таз ледь гойдається. Темп — за
 * швидкістю кота (`CatAnimChoice.speed`).
 */
function carry(): CatAnim {
  const T = GAIT_MS;
  const N = 16;
  const keys: PoseKey[] = [];
  for (let i = 0; i <= N; i++) {
    const phase = i / N;
    keys.push({
      t: Math.round((T * i) / N),
      ease: "linear",
      pose: {
        pelvis: { y: round(0.8 * Math.cos(4 * Math.PI * phase)) },
        neck: { rot: -14 },
        head: { rot: 6 },
        legs: {
          "leg-front-near": gaitPaw(phase),
          "leg-back-far": gaitPaw(phase),
          "leg-front-far": gaitPaw(phase + 0.5),
          "leg-back-near": gaitPaw(phase + 0.5),
        },
      },
    });
  }
  return build(T, true, keys, {
    bones: {
      head: { rot: sine(T, T / 2, 6, 1, 1) },
      tail: { rot: sine(T, T, 18, 4) },
    },
  });
}

/** Гризе дріт чи пакет (§9.12, «Гризіння»): лежить, морда до підлоги, голова повернута набік і ходить у ритмі жування. */
function chew(): CatAnim {
  const D = 900;
  const pose = (tilt: number, dip: number): Pose => loafWith({ pelvis: { y: 11 }, body: { rot: 5 }, neck: { rot: 26 + dip, x: 2 }, head: { rot: tilt } });
  const A = pose(10, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 200, pose: pose(-10, 4) },
      { t: 450, pose: A },
      { t: 650, pose: pose(-10, 4) },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, D, LOAF_TAIL, 5, 1) } } },
  );
}

/**
 * «Образливий» дметься (§9.12): сидить спиною до персонажа (`catFacing`), згорбившись, голова опущена, хвіст обгорнуто
 * довкола лап; кінчик зрідка сіпається.
 */
function sulk(): CatAnim {
  const D = 3200;
  // Важко зітхає раз за пів циклу: груди ширшають, плечі ледь піднімаються, голова хилиться нижче на видиху.
  const pose = (head: number, breath: number): Pose =>
    sitWith({ body: { rot: -24 - breath * 2, sy: 1 + breath * 0.04 }, neck: { rot: 30 }, head: { rot: 6 + head - breath * 2 }, tail: { rot: -100 } });
  const A = pose(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 700, pose: pose(2, 1) },
      { t: 1600, pose: pose(5, 0) },
      { t: 2300, pose: pose(3, 1) },
      { t: D, pose: A },
    ],
    {
      bones: {
        tail: { rot: track([0, -100], [2200, -100], [2350, -90], [2500, -101], [2650, -94], [D, -100]) },
      },
    },
  );
}

/**
 * Не хоче гратися (§9.4, поза 6): лежить буханцем, голова піднята до того, хто кликав; хвіст лежить, кінчик швидко б'є по
 * підлозі — частіше, ніж у спокійного кота. Рух — лише хвіст.
 */
function decline(): CatAnim {
  const D = 1500;
  return build(
    D,
    true,
    [
      { t: 0, pose: LOAF },
      { t: D, pose: LOAF },
    ],
    {
      bones: {
        body: { scale: breathe(D, 1500, 0.03) },
        tail: {
          rot: track([0, LOAF_TAIL], [140, LOAF_TAIL + 19, "out"], [300, LOAF_TAIL - 3], [440, LOAF_TAIL + 19, "out"], [600, LOAF_TAIL - 3], [D, LOAF_TAIL]),
        },
      },
    },
  );
}

/** Нюхає (§9.12: дрібничку, нову річ, м'яту, корм чи лоток, від яких відмовився): морда донизу, принюхується ривками. */
function sniff(): CatAnim {
  const D = 1800;
  const pose = (dip: number, reach: number): Pose =>
    standWith({ pelvis: { y: 1 }, body: { rot: 8 }, neck: { rot: 34 + dip, x: reach }, head: { rot: -6 }, tail: { rot: -10 } });
  const A = pose(0, 0);
  const B = pose(3, 1);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 120, pose: B },
      { t: 240, pose: A },
      { t: 360, pose: B },
      { t: 480, pose: A },
      { t: 1000, pose: pose(-6, -1) },
      { t: 1400, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: { rot: sine(D, D, -10, 7, 1) } } },
  );
}

/** Анімації групи «behavior» (`CAT_ANIM_GROUPS.behavior`). */
export const CAT_BEHAVIOR = defineAnims(CAT_RIG, {
  arch: arch(),
  hiss: hiss(),
  brawl: brawl(),
  lick: lick(),
  paw: paw(),
  kick: kick(),
  crouch: crouch(),
  scratch: scratch(),
  stretch: stretch(),
  mark: mark(),
  knock: knock(),
  beg: beg(),
  nudge: nudge(),
  keyboard: keyboard(),
  window: watchWindow(),
  pounce: pounce(),
  carry: carry(),
  chew: chew(),
  sulk: sulk(),
  decline: decline(),
  sniff: sniff(),
});
