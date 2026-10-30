// Анімації групи «behavior» — пакет N2 «Кіт — поведінка» (крок 16, хвиля 2, GRAPHICS_PLAN.md; назви й що кожна означає —
// `anim/ids.ts`, `CAT_ANIM_GROUPS.behavior`; де їх обирають — `pose.ts`, `catAnim`; пози стосунків — GAME_DESIGN.md, §9.4).
//
// Пози описано ключовими позами тіла (`Pose`): зсув і поворот таза, поворот тулуба, шиї, голови й хвоста — відносно вихідної
// пози ракурсу (`rig/types.ts`), а лапи, що стоять, — точкою подушечки на підлозі. Поворот і довжину такої лапи рахує `build`
// (обернена кінематика однієї кістки) для кожного ракурсу окремо: ззаду ближні й дальні лапи міняються місцями, тож у
// `back` лапи мають свої доріжки (`views.back`). Числа вихідної пози — з визначення скелета (`CAT_RIG`), тож якщо скелет
// підженуть під арт (A7), лапи й далі стоятимуть на підлозі. Решта руху — доріжки поверх ключових поз (`over`): хвіст, що
// б'є, кивки голови.
//
// Сидить і лежить буханцем кіт так само, як у N1 (`basic.ts`, `SIT` і `LOAF`: ті самі числа), тож перехід «сидить → просить»
// чи «буханець → не хоче гратися» міняє лише голову, лапи й хвіст, а не всю позу. Хвіст повертається довкола свого корінця
// (`tailMove`, як `tail()` у N1): інакше товстий корінець кадру вилазить за круп світлою «гулею».
//
// Кути — градуси за годинниковою стрілкою (кіт дивиться праворуч): додатний поворот тулуба опускає морду, лапи — відводить
// назад, хвоста — піднімає його вперед-угору. Вісь y — донизу. Кадри обличчя (очі, рот, вуха) задає `catFace`, тож доріжок
// кадрів цих слотів тут немає (клубок бійки лише ховає голову за тулуб доріжкою z).

import { CAT_ONE_SHOT_MS } from "../../../anim/ids";
import type { ArtView } from "../../../art/types";
import { CAT_RIG } from "../../defs/cat";
import { easeValue } from "../../rigcore";
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
  type StepKey,
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
 * кріпиться нижче чи вище на тулубі), `sy` — товщина лапи на екрані. `back` — те саме для ракурсу ¾ ззаду, де лапа стоїть
 * інакше (ближні й дальні там міняються місцями по x).
 */
interface Plant {
  paw: Vec2;
  x?: number;
  y?: number;
  sy?: number;
  back?: Omit<Plant, "back">;
}

/** Хвіст у позі: поворот довкола корінця (градуси), масштаб (рівномірний) і чи віддзеркалено кадр уздовж кістки. */
interface TailPose {
  rot: number;
  s?: number;
  mirror?: boolean;
}

/**
 * Ключова поза: кістки без запису — у вихідній позі (лапи — разом із тулубом, без підлаштування). Масштаб голови й лап на
 * тулубі — як їх видно на екрані: поправку на нерівномірний масштаб тулуба (горб дуги, куля бійки) рахує `solve`.
 */
interface Pose {
  root?: Move;
  pelvis?: Move;
  body?: Move;
  neck?: Move;
  head?: Move;
  tail?: TailPose;
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

/** Та сама лапа, піднята на `dy` (в обох ракурсах). */
const lifted = (plant: Plant, dy: number): Plant => ({
  ...plant,
  paw: { x: plant.paw.x, y: plant.paw.y - dy },
  ...(plant.back ? { back: { ...plant.back, paw: { x: plant.back.paw.x, y: plant.back.paw.y - dy } } } : {}),
});

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

/** Вектор, повернутий на `deg` градусів. */
function turn(v: Vec2, deg: number): Vec2 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
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

/** Зміна батька лап у позі (корінь, таз, тулуб); решта кісток лапам не батьки. */
function moveOf(pose: Pose, id: CatBone): Move | undefined {
  switch (id) {
    case "root":
    case "pelvis":
    case "body":
    case "neck":
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

/** Масштаб тулуба в позі (за модулем): горб дуги, куля бійки. */
const bodyScale = (pose: Pose): Vec2 => ({ x: Math.abs(pose.body?.sx ?? 1), y: Math.abs(pose.body?.sy ?? 1) });

/**
 * Масштаб кістки на тулубі (`sx` — уздовж, `sy` — упоперек), щоб на екрані вона мала довжину `along` і товщину `across`:
 * нерівномірний масштаб тулуба розтягує дітей по-різному залежно від кута `deg` (у системі тулуба). Кадр слота бере з
 * перетворення лише напрям кістки, довжину й площу (`rigcore`, `place`), тож поправка точна.
 */
function onBody(deg: number, along: number, across: number, sb: Vec2): { sx: number; sy: number } {
  const len = Math.hypot(sb.x * Math.cos(deg * DEG), sb.y * Math.sin(deg * DEG));
  const area = sb.x * sb.y;
  return { sx: along / len, sy: (across * len) / area };
}

/** Зміна лапи, що стоїть: поворот і довжина, щоб подушечка стала в `plant.paw` від вихідної точки. */
function plantLeg(leg: Leg, view: ArtView, pose: Pose, plant: Plant, cache: Map<CatBone, Affine>): Move {
  const p = view === "back" && plant.back ? plant.back : plant;
  const s = setupOf(leg, view);
  const parent = worldOf(s.parent ?? "root", view, pose, cache);
  const origin = apply(parent, s.x + (p.x ?? 0), s.y + (p.y ?? 0));
  const home = setupPaw(leg, view);
  const reach = { x: home.x + p.paw.x - origin.x, y: home.y + p.paw.y - origin.y };
  const v = unrotate(parent, reach);
  const sx = Math.hypot(v.x, v.y) / s.len;
  // Товщина на екрані — площа перетворення на довжину: під масштабованим тулубом лапа інакше тоншала б чи товщала.
  const area = Math.abs(parent.a * parent.d - parent.b * parent.c) || 1;
  const sy = ((p.sy ?? 1) * Math.hypot(reach.x, reach.y)) / (area * sx * s.len || 1);
  return { rot: Math.atan2(v.y, v.x) / DEG - s.rot, x: p.x ?? 0, y: p.y ?? 0, sx, sy };
}

/**
 * Корінь хвоста в кадрі (`cat/tail/long`) — товстий «корінець», зсунутий від pivot на стільки (одиниці арту, у системі
 * тулуба): у вихідній позі його ховає тулуб, а поворот навколо pivot виносить корінець за силует крупа. Те саме число, що
 * `TAIL_ROOT` у N1 (`basic.ts`).
 */
const TAIL_ROOT: Vec2 = { x: 3.5, y: 0.5 };

/**
 * Хвіст, повернутий (і масштабований, і віддзеркалений) довкола корінця: зсув лишає корінець там, де він у вихідній позі. Під
 * нерівномірним масштабом тулуба масштаб хвоста — з поправкою (`onBody`), щоб на екрані він був рівно в `s` разів.
 */
function tailMove(tail: TailPose, sb: Vec2 = { x: 1, y: 1 }): Move {
  const setup = setupOf("tail", "front").rot;
  const angle = setup + tail.rot;
  const k = tail.s ?? 1;
  const fix = onBody(angle, k, k, sb);
  const sy = tail.mirror ? -fix.sy : fix.sy;
  const root = turn(TAIL_ROOT, -setup);
  const now = turn({ x: fix.sx * root.x, y: sy * root.y }, angle);
  return { rot: tail.rot, x: TAIL_ROOT.x - now.x, y: TAIL_ROOT.y - now.y, sx: fix.sx, sy };
}

/** Зміни всіх кісток пози в ракурсі. */
function solve(pose: Pose, view: ArtView): Partial<Record<CatBone, Move>> {
  const cache = new Map<CatBone, Affine>();
  const sb = bodyScale(pose);
  const out: Partial<Record<CatBone, Move>> = {};
  if (pose.root) out.root = pose.root;
  if (pose.pelvis) out.pelvis = pose.pelvis;
  if (pose.body) out.body = pose.body;
  if (pose.neck) out.neck = pose.neck;
  if (pose.head) {
    const angle = setupOf("neck", view).rot + setupOf("head", view).rot + (pose.neck?.rot ?? 0) + (pose.head.rot ?? 0);
    out.head = { ...pose.head, ...onBody(angle, pose.head.sx ?? 1, pose.head.sy ?? 1, sb) };
  }
  if (pose.tail) out.tail = tailMove(pose.tail, sb);
  for (const leg of LEGS) {
    const spec = pose.legs?.[leg];
    if (!spec) continue;
    if (isPlant(spec)) {
      out[leg] = plantLeg(leg, view, pose, spec, cache);
    } else if (setupOf(leg, view).parent === "body") {
      out[leg] = { ...spec, ...onBody(setupOf(leg, view).rot + (spec.rot ?? 0), spec.sx ?? 1, spec.sy ?? 1, sb) };
    } else {
      out[leg] = spec;
    }
  }
  return out;
}

/** Подушечка лапи (кінець кістки) в позі, система кореня. */
function pawOf(leg: Leg, view: ArtView, pose: Pose): Vec2 {
  const cache = new Map<CatBone, Affine>();
  const s = setupOf(leg, view);
  const m = solve(pose, view)[leg] ?? {};
  const world = mul(worldOf(s.parent ?? "root", view, pose, cache), trs(s.x + (m.x ?? 0), s.y + (m.y ?? 0), s.rot + (m.rot ?? 0), m.sx ?? 1, m.sy ?? 1));
  return apply(world, s.len, 0);
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

/**
 * Доріжки хвоста, що б'є, поверх ключових поз: кути `keys` — довкола корінця (зсув на кожному ключі — з `tailMove`, між
 * ключами корінець лишається на місці з точністю до частки одиниці). `s` — масштаб хвоста в позах.
 */
function tailWave(keys: readonly Key<number>[], s = 1): BoneTracks {
  const moves = keys.map((k) => tailMove({ rot: k.v, s }));
  const pos = keys.map((k, i) => ({ ...k, v: v2(round(moves[i]?.x ?? 0), round(moves[i]?.y ?? 0)) }));
  const tracks: BoneTracks = { rot: keys.map((k) => ({ ...k, v: round(k.v) })), pos };
  return s === 1 ? tracks : { ...tracks, scale: [{ t: 0, v: v2(round(s), round(s)) }] };
}

/** Вектор. */
const v2 = (x: number, y: number): Vec2 => ({ x, y });

/** Дихання: тулуб ледь ширшає впоперек (груди) і вертається — доріжка масштабу тулуба, `amp` — частка. */
function breathe(duration: number, period: number, amp: number): Key<Vec2>[] {
  return sine(duration, period, 1 + amp / 2, amp / 2, 2).map((k) => ({ ...k, v: v2(1, k.v) }));
}

/** Поза `base` зі змінами `delta`: повороти й зсуви додаються, масштаби множаться; лапи з `delta` замінюють лапи `base`. */
function withPose(base: Pose, delta: Pose): Pose {
  const sum = (a: Move | undefined, d: Move | undefined): Move | undefined => {
    if (!a) return d;
    if (!d) return a;
    return { rot: (a.rot ?? 0) + (d.rot ?? 0), x: (a.x ?? 0) + (d.x ?? 0), y: (a.y ?? 0) + (d.y ?? 0), sx: (a.sx ?? 1) * (d.sx ?? 1), sy: (a.sy ?? 1) * (d.sy ?? 1) };
  };
  const out: Pose = { legs: { ...base.legs, ...delta.legs } };
  for (const id of ["root", "pelvis", "body", "neck", "head"] as const) {
    const m = sum(base[id], delta[id]);
    if (m) out[id] = m;
  }
  const tail = base.tail && delta.tail ? { ...base.tail, rot: base.tail.rot + delta.tail.rot, s: (base.tail.s ?? 1) * (delta.tail.s ?? 1) } : (delta.tail ?? base.tail);
  if (tail) out.tail = tail;
  return out;
}

// --- Спільні пози ------------------------------------------------------------------------------

/** Хвіст того, хто сидить (спадає на підлогу позаду), і того, хто лежить буханцем (лежить позаду) — як у N1. */
const SIT_TAIL = -95;
const LOAF_TAIL = -80;

/**
 * Сидить — так само, як `SIT` у N1 (`basic.ts`): таз повернутий носом угору навколо стегон (круп на підлозі), передні лапи
 * прямо вниз від трохи зсунутих уздовж тулуба плечей (лопатки), задні підібрано під стегно, голова рівно, хвіст спадає на
 * підлогу. Точки подушечок — ті самі, що в N1, для кожного ракурсу (ззаду лапи стоять за місцем на екрані).
 */
const SIT: Pose = {
  pelvis: { rot: -32, y: 2 },
  head: { rot: 30 },
  tail: { rot: SIT_TAIL },
  legs: {
    "leg-front-far": { paw: v2(-5.2, 0), x: -5, y: 8.7, back: { paw: v2(-4.2, 0), x: -4, y: 7.5 } },
    "leg-front-near": { paw: v2(-2.6, 0), x: -4, y: 7, back: { paw: v2(-3.3, 0), x: -5.5, y: 9.6 } },
    "leg-back-far": { paw: v2(5.4, 0), back: { paw: v2(11.6, 0) } },
    "leg-back-near": { paw: v2(12.5, 0), back: { paw: v2(6, 0) } },
  },
};

/** Лапа того, хто сидить (як стоїть у `SIT`). */
const sitPaw = (leg: Leg): Plant => SIT.legs?.[leg] as Plant;

/** Сидить зі змінами (повороти й зсуви додаються до `SIT`, лапи — замінюються). */
const sitWith = (delta: Pose): Pose => withPose(SIT, delta);

/**
 * Буханець — так само, як `LOAF` у N1: тулуб на підлозі, лапи підібрані під себе (видно лише подушечки), голова трохи
 * схилена, хвіст лежить позаду.
 */
const LOAF: Pose = {
  pelvis: { y: 9 },
  head: { rot: 5 },
  tail: { rot: LOAF_TAIL },
  legs: {
    "leg-back-near": { sx: 0.35 },
    "leg-back-far": { sx: 0.35 },
    "leg-front-near": { rot: -10, sx: 0.38 },
    "leg-front-far": { sx: 0.35 },
  },
};

const loafWith = (delta: Pose): Pose => withPose(LOAF, delta);

/** Стоїть, як у вихідній позі. */
const STAND: Pose = { legs: STANDING };

const standWith = (more: Pose): Pose => ({ ...STAND, ...more, legs: { ...STANDING, ...more.legs } });

// --- Анімації ------------------------------------------------------------------------------------

/** «Спина дугою» (§9.4, поза 1): цикл, мс — шерсть повільно настовбурчується й опадає, поверх — дрібне тремтіння. */
const ARCH_MS = 1200;
/** Тулуб у дузі: коротший і вищий — горб. */
const ARCH_BODY = { x: 1, y: 1.4 } as const;
/** Крок ключів тремтіння, мс, і його сила: тулуб (градуси), хвіст (градуси). */
const ARCH_STEP = 50;
const ARCH_SHIVER = 1.8;
const ARCH_TAIL_SHAKE = 5;
/** Нерівне тремтіння: розмах на кожному кроці (чергується знак) — щоб не було рівного «моторчика». */
const ARCH_JITTER = [1, -0.7, 0.9, -1, 0.6, -0.9, 1, -0.8, 0.7, -1, 0.9, -0.6] as const;

/**
 * Дуга: кіт стоїть «на пальчиках» на високих прямих лапах, зібраних під тулуб буквою А (передні — назад, задні — уперед),
 * тулуб — високий короткий горб, морда опущена нижче спини й дивиться на суперника, хвіст трубою — прямо вгору, товстий.
 * `puff` — наскільки настовбурчено (1 — як завжди в дузі), `shiver` і `shake` — тремтіння тулуба й хвоста (−1…1). Кіт трохи
 * відступив тулубом над зібраними лапами, щоб двоє в протистоянні (64 одиниці між точками) стояли морда до морди, а не одне
 * в одному.
 */
function archPose(puff: number, shiver: number, shake: number): Pose {
  return {
    pelvis: { x: -4, y: -12, rot: 3 },
    body: { rot: shiver * ARCH_SHIVER, sx: ARCH_BODY.x * puff, sy: ARCH_BODY.y * puff },
    neck: { x: -4, y: 11 },
    head: { rot: 4, sx: 1.03, sy: 1.03 },
    // Кадр хвоста віддзеркалено вздовж кістки: гачок кінчика загинається назад, від голови, а не вперед знаком питання
    // (так кіт вітається, а не погрожує).
    tail: { rot: 58 + shake * ARCH_TAIL_SHAKE, s: 1.22 * puff, mirror: true },
    legs: {
      "leg-front-far": at(-8, 0, { sy: 0.92 }),
      "leg-front-near": at(-8, 0, { sy: 0.92 }),
      "leg-back-far": at(4, 0, { sy: 0.92 }),
      "leg-back-near": at(4, 0, { sy: 0.92 }),
    },
  };
}

/** «Спина дугою» (§9.4, поза 1): настовбурчена дуга дихає, тулуб і хвіст нерівно тремтять. */
function arch(): CatAnim {
  const keys: PoseKey[] = [];
  const n = ARCH_MS / ARCH_STEP;
  for (let i = 0; i <= n; i++) {
    const t = i * ARCH_STEP;
    const puff = 1 + 0.035 * (1 - Math.cos((2 * Math.PI * t) / ARCH_MS));
    const shiver = ARCH_JITTER[i % ARCH_JITTER.length] ?? 0;
    const shake = Math.sin((2 * Math.PI * t) / 150);
    keys.push({ t, pose: archPose(puff, shiver, i === n ? 0 : shake) });
  }
  // Стик: останній ключ — та сама поза, що перший (тривалість ділиться на крок і на період джиттера).
  keys[n] = { t: ARCH_MS, pose: archPose(1, ARCH_JITTER[0], 0) };
  return build(ARCH_MS, true, keys);
}

/**
 * Шипіння — накладка, разова (`CAT_ONE_SHOT_MS.hiss`; рот з іклами й вуха назад — з `catFace`): кидок — голова подається
 * вперед і вниз, хвіст настовбурчується; тримає, здригаючись, і м'яко вертається — накладка закінчується нулем, тож
 * основна анімація продовжується без ривка. Рухає лише шию, голову й хвіст: таз і тулуб — батьки лап, і будь-яка основа
 * (дуга, хода, засідка) лишається на своїх подушечках.
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
      neck: {
        pos: track([0, v2(0, 0), "out"], [LUNGE, v2(8, 3)], [during(0.5), v2(7, 3)], [HOLD, v2(8, 3)], [D, v2(0, 0)]),
        rot: track([0, 0, "out"], [LUNGE, 12], [HOLD, 12], [D, 0]),
      },
      head: { rot: track([0, 0, "out"], [LUNGE, -10], [during(0.25), -7], [during(0.5), -10], [during(0.75), -7], [HOLD, -10], [D, 0]) },
      tail: { scale: track([0, v2(1, 1), "out"], [LUNGE, v2(1.08, 1.08)], [HOLD, v2(1.08, 1.08)], [D, v2(1, 1)]) },
    },
  };
}

/** «Клубок бійки»: цикл, мс; центр кулі (система кореня), тулуб кулею. */
const BRAWL_MS = 900;
const BALL: Vec2 = { x: 2, y: -28 };
const BRAWL_BODY = { x: 0.7, y: 1.25 } as const;
/** Середина тулуба в системі таза (до масштабу тулуба): довкола неї крутиться клубок. */
const BODY_MIDDLE: Vec2 = { x: 8, y: -4 };
/**
 * Наскільки вище своєї лінії підлоги (вихідної точки подушечки) мусять лишатися лапи клубка: із запасом на статури, у яких
 * суглоби з точок арту трохи нижчі.
 */
const BRAWL_CLEAR = 1.5;

/**
 * Таз, повернутий на `rot`, так, щоб середина тулуба (з масштабом `sb`) стала в точку `at` (система кореня): клубок
 * крутиться довкола себе, а не довкола стегон.
 */
function spin(rot: number, at: Vec2, sb: Vec2): Move {
  const pelvis = setupOf("pelvis", "front");
  const mid = turn({ x: BODY_MIDDLE.x * sb.x, y: BODY_MIDDLE.y * sb.y }, rot);
  return { rot, x: round(at.x - pelvis.x - mid.x), y: round(at.y - pelvis.y - mid.y) };
}

/** Лапи клубка не пробивають підлогу: лапу, що сягає нижче своєї лінії підлоги (з запасом `BRAWL_CLEAR`), вкорочено (в обох ракурсах). */
function aboveFloor(pose: Pose): Pose {
  const legs: Partial<Record<Leg, Plant | Move>> = { ...pose.legs };
  for (const leg of LEGS) {
    const spec = legs[leg];
    if (!spec || isPlant(spec)) continue;
    let sx = spec.sx ?? 1;
    const below = (view: ArtView): number => pawOf(leg, view, { ...pose, legs: { ...legs, [leg]: { ...spec, sx } } }).y - setupPaw(leg, view).y;
    for (let i = 0; i < 16; i++) {
      if (Math.max(below("front"), below("back")) <= -BRAWL_CLEAR || sx < 0.35) break;
      sx *= 0.92;
    }
    legs[leg] = { ...spec, sx: round(sx) };
  }
  return { ...pose, legs };
}

/**
 * Поза кулі: `turnDeg` — оберт кулі, `hop` — підскок; лапи — кути (кожна стирчить назовні: передні — уперед, задні — назад)
 * і довжина `reach`; `tail` — куди стирчить хвіст на екрані (градуси, −90 — угору): лише вгору й убік, щоб не пробивав
 * підлогу. Голову підібрано до грудей (морду ховає доріжка z), тулуб — куля.
 */
function ballPose(turnDeg: number, hop: number, ff: number, fn: number, bf: number, bn: number, tail: number, reach: number): Pose {
  return aboveFloor({
    root: { y: hop },
    pelvis: spin(turnDeg, BALL, BRAWL_BODY),
    body: { sx: BRAWL_BODY.x, sy: BRAWL_BODY.y },
    neck: { rot: 85, x: -8, y: 6 },
    head: { rot: -12, sx: 0.9, sy: 0.9 },
    tail: { rot: tail - turnDeg - setupOf("tail", "front").rot },
    legs: {
      "leg-front-far": { rot: ff, sx: 1.1 * reach },
      "leg-front-near": { rot: fn, sx: 1.17 * reach },
      "leg-back-far": { rot: bf, sx: 1.04 * reach },
      "leg-back-near": { rot: bn, sx: 1.14 * reach },
    },
  });
}

/** Слоти голови: у клубку їх ховає за тулуб (z нижче тулуба, 5), лише часом морда проблискує. */
const HEAD_SLOTS = ["ear-far", "ear-near", "head", "muzzle", "eyes", "mouth"] as const satisfies readonly CatSlot[];
/** z слотів голови, сховано за тулубом (порядок між собою — як у вихідній позі). */
const HEAD_HIDDEN: Readonly<Record<(typeof HEAD_SLOTS)[number], number>> = { "ear-far": 3.2, "ear-near": 3.4, head: 3.6, muzzle: 3.8, eyes: 4, mouth: 4.2 };

/** Вихідний z слота в ракурсі. */
function slotZ(id: CatSlot, view: ArtView): number {
  const over = CAT_RIG.views[view].slots?.[id]?.z;
  return over ?? CAT_RIG.slots.find((s) => s.id === id)?.z ?? 0;
}

/** Ключ клубка: момент, оберт, підскок, кути лап (ff, fn, bf, bn), куди стирчить хвіст, довжина лап і перехід до наступного. */
type BallKey = readonly [t: number, turn: number, hop: number, ff: number, fn: number, bf: number, bn: number, tail: number, reach: number, ease: "out" | "inOut"];

/**
 * «Клубок бійки» (§9.4, поза 2): кіт згорнувся кулею довкола точки посередині пари (`PAIR_GAPS.brawl` = 0) — тулуб круглий,
 * голова підібрана до грудей і схована за тулубом (морда лише проблискує на мить), з кулі стирчать лапи, хвіст і вуха. Куля
 * перекочується ривками — за цикл повний оберт чвертями: ривок уперед з підскоком, віддача назад, — а лапи на кожному ривку
 * міняються місцями й коротко б'ють назовні. Найнижчі точки — не нижче лінії підлоги (`aboveFloor`).
 *
 * Пара: обидва коти грають те саме, другий — віддзеркалено, тож на екрані кулі котяться в протилежні боки. Щоб пара не була
 * точним дзеркалом, вигляд (T1) має пускати другого кота пари з іншою фазою — `from` зсунутим на ≈ 400 мс.
 */
function brawl(): CatAnim {
  const D = BRAWL_MS;
  const spec: readonly BallKey[] = [
    [0, 0, 0, -150, -60, 120, 60, -160, 1, "out"],
    [110, 100, -4, -40, -130, 50, 140, -40, 1.05, "inOut"],
    [220, 82, -1, -90, -170, 90, 30, -80, 0.9, "out"],
    [330, 195, -5, -130, -30, 150, 70, -170, 1.05, "inOut"],
    [440, 176, -1, -60, -110, 40, 120, -20, 0.9, "out"],
    [560, 282, -4, -160, -80, 110, 30, -120, 1.05, "inOut"],
    [670, 268, -1, -100, -150, 70, 150, -60, 0.9, "out"],
    [790, 372, -4, -120, -50, 140, 50, -150, 1.05, "inOut"],
    [D, 360, 0, -150, -60, 120, 60, -160, 1, "out"],
  ];
  // Між ключами куля провертається на сотню градусів, і лапа могла б пройти крізь підлогу посередині переходу: тож ключі
  // густі (кожен перехід — `SUB` кроків з тим самим згладжуванням), і на кожному лапи підрізано над підлогою.
  const SUB = 4;
  const keys: PoseKey[] = [];
  for (let i = 0; i < spec.length - 1; i++) {
    const a = spec[i];
    const b = spec[i + 1];
    if (!a || !b) continue;
    for (let j = 0; j < SUB; j++) {
      const u = easeValue(a[9], j / SUB);
      const mix = (k: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): number => a[k] + (b[k] - a[k]) * u;
      const t = Math.round(a[0] + ((b[0] - a[0]) * j) / SUB);
      keys.push({ t, pose: ballPose(mix(1), mix(2), mix(3), mix(4), mix(5), mix(6), mix(7), mix(8)), ease: "linear" });
    }
  }
  const last = spec[spec.length - 1];
  if (last) keys.push({ t: D, pose: ballPose(last[1], last[2], last[3], last[4], last[5], last[6], last[7], last[8]) });
  // Морда проблискує на мить після ривків, коли голова нагорі; решту часу голову ховає тулуб. Ззаду голова й так за тулубом.
  const shown: readonly StepKey<boolean>[] = [
    { t: 0, v: true },
    { t: 70, v: false },
    { t: 560, v: true },
    { t: 640, v: false },
  ];
  const slots: Partial<Record<CatSlot, SlotTracks>> = {};
  const backSlots: Partial<Record<CatSlot, SlotTracks>> = {};
  for (const id of HEAD_SLOTS) {
    slots[id] = { z: shown.map((k) => ({ t: k.t, v: k.v ? slotZ(id, "front") : HEAD_HIDDEN[id] })) };
    backSlots[id] = { z: [{ t: 0, v: slotZ(id, "back") }] };
  }
  return build(D, true, keys, { slots, back: { slots: backSlots } });
}

/**
 * «Вилизує іншого» (§9.4, поза 3): сидить упритул збоку (як `SIT`, лише рівніше), голова — біля голови друга: мазок
 * починається від щоки й швидко йде вгору до вуха, назад — повільніше; два мазки й пауза з головою посередині. Голова
 * лише торкається друга збоку, тож його морду (очі-дужки) видно; кошеня — нижче, під підборіддям. Хвіст спокійно лежить.
 * Очі напівзаплющені й язичок — з `catFace`.
 */
function lick(): CatAnim {
  const D = 1200;
  const reach = (up: number): Pose => sitWith({ pelvis: { rot: -12 }, neck: { rot: -2 - up * 12, x: 3, y: -up * 4 }, head: { rot: 30 - up * 10 } });
  const down = reach(0);
  const up = reach(1);
  const rest = reach(0.6);
  return build(
    D,
    true,
    [
      { t: 0, pose: rest, ease: "inOut" },
      { t: 160, pose: down, ease: "out" },
      { t: 280, pose: up, ease: "inOut" },
      { t: 470, pose: down, ease: "out" },
      { t: 590, pose: up, ease: "inOut" },
      { t: 820, pose: rest },
      { t: D, pose: rest },
    ],
    { bones: { tail: tailWave(sine(D, D, SIT_TAIL, 4)) } },
  );
}

/**
 * Ігрова боротьба, зверху (§9.4, поза 4): стоїть над другом, що лежить на спині, — тіло відсунуте назад і трохи піднесене,
 * ближня передня лапа високо піднята над мордою (поверх голови) й легенько б'є згори вниз (двічі й пауза); хвіст угору й
 * мотається.
 */
function paw(): CatAnim {
  const D = 1400;
  const base = (rot: number, look: number): Pose =>
    standWith({
      pelvis: { x: -9, y: -1 },
      body: { rot: -10 },
      neck: { rot: 18 - look },
      head: { rot: -6 },
      legs: {
        "leg-front-near": { rot, sx: 0.95, y: -2 },
        "leg-front-far": at(-6),
        "leg-back-far": at(-9),
        "leg-back-near": at(-9),
      },
    });
  const raised = base(-132, 14);
  const hit = base(-40, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: raised, ease: "in" },
      { t: 140, pose: hit, ease: "out" },
      { t: 380, pose: raised, ease: "in" },
      { t: 520, pose: hit, ease: "out" },
      { t: 800, pose: base(-110, 10) },
      { t: D, pose: raised },
    ],
    {
      bones: { tail: tailWave(sine(D, 700, 22, 14)) },
      // Піднята лапа — над мордою, поверх голови; б'ючи вниз, ховається за морду, як і стояла.
      slots: {
        "leg-front-near": {
          z: [
            { t: 0, v: 10.5 },
            { t: 100, v: 7 },
            { t: 260, v: 10.5 },
            { t: 480, v: 7 },
            { t: 640, v: 10.5 },
          ],
        },
      },
      back: { slots: { "leg-front-near": { z: [{ t: 0, v: slotZ("leg-front-near", "back") }] } } },
    },
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
    tail: { rot: -20, mirror: true },
    legs: {
      "leg-front-far": { rot: ff, sx: 1.12 },
      "leg-front-near": { rot: fn, sx: 1.12 },
      "leg-back-far": { rot: bf, sx: 1.08 },
      "leg-back-near": { rot: bn, sx: 1.08 },
    },
  });
  const A = pose(-55, 10, -25, 45, -3);
  const B = pose(10, -55, 45, -25, 3);
  const wave = sine(D, 550, -20, 16).map((k) => tailMove({ rot: k.v, mirror: true }));
  const keys = sine(D, 550, -20, 16);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: D / 2, pose: B },
      { t: D, pose: A },
    ],
    {
      bones: {
        tail: {
          rot: keys,
          pos: keys.map((k, i) => ({ ...k, v: v2(round(wave[i]?.x ?? 0), round(wave[i]?.y ?? 0)) })),
          scale: [{ t: 0, v: v2(1, -1) }],
        },
      },
    },
  );
}

/**
 * Засідка (§9.12, §9.4, поза 5): припав до підлоги, голова низько й уперед, — і зад виляє: кілька швидких ривків крупом
 * угору-вниз з поворотом, щораз швидше, і завмирає перед стрибком; кінчик хвоста смикається.
 */
function crouch(): CatAnim {
  const D = 1600;
  const TAIL = -100;
  const low = (rump: number): Pose => ({
    pelvis: { y: 9 - rump * 4.5, rot: rump * 7 },
    body: { rot: 2 - rump * 6 },
    neck: { rot: 4 },
    head: { rot: -6 },
    tail: { rot: TAIL },
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
      { t: 160, pose: low(1) },
      { t: 300, pose: low(-0.3) },
      { t: 420, pose: low(1) },
      { t: 520, pose: low(-0.3) },
      { t: 600, pose: low(1), ease: "out" },
      { t: 680, pose: low(-0.2) },
      { t: 820, pose: rest },
      { t: D, pose: rest },
    ],
    { bones: { tail: tailWave(track([0, TAIL], [860, TAIL], [960, TAIL + 18], [1060, TAIL - 4], [1160, TAIL + 16], [1300, TAIL], [D, TAIL])) } },
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
    { bones: { tail: tailWave(sine(D, D, -55, 8, 1)) } },
  );
}

/**
 * Потягується на килимку (§9.12, «Дряпання»): груди й голова до підлоги, зад догори на прямих задніх лапах, хвіст угору,
 * передні лапи далеко вперед і по черзі шкрябають килимок — тягнуть кігтями назад по ворсу, а вперед переносять у повітрі.
 */
function stretch(): CatAnim {
  const D = 2400;
  const bow = (near: Plant, far: Plant): Pose => ({
    pelvis: { x: -2, y: 1, rot: 26 },
    neck: { rot: 4 },
    head: { rot: -22 },
    tail: { rot: 22 },
    legs: { "leg-front-far": far, "leg-front-near": near, "leg-back-far": at(-3), "leg-back-near": at(-3) },
  });
  const NEAR = 22;
  const FAR = 24;
  const A = bow(at(NEAR), at(FAR));
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 350, pose: bow(at(NEAR - 8), at(FAR)), ease: "in" },
      { t: 520, pose: bow(at(NEAR - 3, -4), at(FAR)) },
      { t: 700, pose: A },
      { t: 1050, pose: bow(at(NEAR), at(FAR - 8)), ease: "in" },
      { t: 1220, pose: bow(at(NEAR), at(FAR - 3, -4)) },
      { t: 1400, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: tailWave(sine(D, D / 2, 22, 5, 1)) } },
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
      tail: { rot: 30, s: 1.05 },
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
    { bones: { tail: tailWave(sine(D, 60, 30, 3), 1.05) } },
  );
}

/** Та сама лапа, зсунута на (`dx`, `dy`) від того місця, де стоїть (в обох ракурсах). */
const shifted = (plant: Plant, dx: number, dy: number): Plant => ({
  ...plant,
  paw: { x: plant.paw.x + dx, y: plant.paw.y + dy },
  ...(plant.back ? { back: { ...plant.back, paw: { x: plant.back.paw.x + dx, y: plant.back.paw.y + dy } } } : {}),
});

/**
 * Скидає лапою (§9.12, «Скидання речей»; і лапає дверцята шафки чи смітник): сидить, подається вперед і тягнеться ближньою
 * лапою — штовхає раз, другий і відводить її. Лапу спершу піднято, а тоді вона йде вперед (і назад так само), тож по
 * підлозі не ковзає.
 */
function knock(): CatAnim {
  const D = 1400;
  const near = sitPaw("leg-front-near");
  const pose = (dx: number, dy: number, lean: number): Pose =>
    sitWith({ pelvis: { rot: lean }, neck: { rot: -lean }, head: { rot: -lean * 0.5 }, legs: { "leg-front-near": shifted(near, dx, dy) } });
  const rest = sitWith({});
  return build(
    D,
    true,
    [
      { t: 0, pose: rest },
      { t: 150, pose: pose(1, -7, 2) },
      { t: 300, pose: pose(12, -10, 6) },
      { t: 400, pose: pose(17, -5, 8), ease: "out" },
      { t: 540, pose: pose(12, -10, 6) },
      { t: 640, pose: pose(17, -5, 8), ease: "out" },
      { t: 880, pose: pose(2, -8, 2) },
      { t: 1040, pose: rest },
      { t: D, pose: rest },
    ],
    { bones: { tail: tailWave(sine(D, D / 2, SIT_TAIL, 5, 1)) } },
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
      pelvis: { rot: -6, y: -1 },
      head: { rot: -14 },
      legs: { "leg-front-far": lifted(sitPaw("leg-front-far"), ff), "leg-front-near": lifted(sitPaw("leg-front-near"), fn) },
    });
  const A = pose(0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 200, pose: pose(0, 6) },
      { t: 400, pose: A },
      { t: 600, pose: pose(6, 0) },
      { t: 800, pose: A },
      { t: D, pose: A },
    ],
    { bones: { tail: tailWave(sine(D, 1600, SIT_TAIL + 3, 9)) } },
  );
}

/**
 * Буцає головою (§9.12, «Ласкавість»): стоїть біля персонажа й тре лобом — подається вперед, голова вгору (лоб уперед),
 * потім ковзає щокою назад; хвіст трубою, кінчик тремтить.
 */
function nudge(): CatAnim {
  const D = 1600;
  const pose = (push: number, tilt: number): Pose =>
    standWith({ pelvis: { x: push * 0.6 }, body: { rot: -push * 0.5 }, neck: { rot: -push * 2, x: push }, head: { rot: tilt }, tail: { rot: 22 } });
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
    { bones: { tail: tailWave(sine(D, 400, 22, 3)) } },
  );
}

/** На клавіатурі (§9.12, «Кіт і робота»): сидить і місить клавіші передніми лапками, голова повільно роззирається. */
function keyboard(): CatAnim {
  const D = 3000;
  const pose = (ff: number, fn: number, look: number): Pose =>
    sitWith({ head: { rot: look }, legs: { "leg-front-far": lifted(sitPaw("leg-front-far"), ff), "leg-front-near": lifted(sitPaw("leg-front-near"), fn) } });
  const A = pose(0, 0, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 250, pose: pose(0, 6, -3) },
      { t: 500, pose: pose(6, 0, -6) },
      { t: 750, pose: pose(0, 6, -8) },
      { t: 1000, pose: pose(0, 0, -8) },
      { t: 1700, pose: pose(0, 0, 8) },
      { t: 1950, pose: pose(6, 0, 8) },
      { t: 2200, pose: pose(0, 6, 5) },
      { t: 2450, pose: pose(0, 0, 3) },
      { t: D, pose: A },
    ],
    { bones: { tail: tailWave(sine(D, D / 2, SIT_TAIL, 6, 1)) } },
  );
}

/**
 * Біля вікна (§9.12, «Вікно»): сидить, задерши голову, стежить за птахами — голова веде за ними й смикається за новим,
 * кінчик хвоста сіпається. Здебільшого спиною до нас — у вікно в задній стіні (`catFacing`).
 */
function watchWindow(): CatAnim {
  const D = 4000;
  const pose = (look: number): Pose => sitWith({ pelvis: { rot: -4 }, neck: { rot: -12 }, head: { rot: -14 + look } });
  const A = pose(0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 900, pose: pose(-16) },
      { t: 1500, pose: pose(-18) },
      { t: 1620, pose: pose(8), ease: "out" },
      { t: 2600, pose: pose(14) },
      { t: 2700, pose: pose(-6), ease: "out" },
      { t: 3300, pose: pose(-2) },
      { t: D, pose: A },
    ],
    {
      bones: {
        body: { scale: breathe(D, 2000, 0.02) },
        tail: tailWave(track([0, SIT_TAIL], [1600, SIT_TAIL], [1700, SIT_TAIL + 12], [1800, SIT_TAIL - 1], [1900, SIT_TAIL + 10], [2000, SIT_TAIL], [D, SIT_TAIL])),
      },
    },
  );
}

/**
 * Стрибає за пером вудки (§8.2, §9.12; і б'є свою іграшку): припадає, відсунувшись тазом назад, і виляє задом, вистрибує
 * вгору — тіло витягнуте, передні лапи над головою ловлять перо, — приземляється на передні на ті самі місця й
 * випрямляється. Лапи, поки на підлозі, не ковзають.
 */
function pounce(): CatAnim {
  const D = 1300;
  const ready = (rump: number): Pose =>
    standWith({
      pelvis: { x: -3, y: 7 - rump, rot: rump },
      body: { rot: 3 - rump },
      neck: { rot: -4 },
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
  const land: Pose = standWith({ pelvis: { y: 4, rot: 8 }, neck: { rot: -8 }, tail: { rot: -20 } });
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
 * Цикл ходи, мс, і пів кроку подушечки вздовж підлоги — як у звичайній ході (N1, `basic.ts`: рись 340 мс, передні лапи
 * ±11,7 одиниці, задні ±10,4), щоб кіт, що підхопив шкарпетку, ішов у тому самому темпі й так само не ковзав за
 * швидкістю відтворення. Подушечка в переносі піднімається на `GAIT_LIFT`.
 */
const GAIT_MS = 340;
const GAIT_FRONT = 11.7;
const GAIT_BACK = 10.4;
const GAIT_LIFT = 4;

/** Подушечка в ході за фазою кроку 0…1: опора (пів циклу) — рівномірно назад по підлозі, перенос — дугою вперед. */
function gaitPaw(phase: number, step: number): Plant {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return at(round(step - 4 * step * p));
  const u = (p - 0.5) / 0.5;
  return at(round(-step + step * (1 - Math.cos(Math.PI * u))), round(-GAIT_LIFT * Math.sin(Math.PI * u)));
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
        tail: { rot: 18 },
        legs: {
          "leg-front-near": gaitPaw(phase, GAIT_FRONT),
          "leg-back-far": gaitPaw(phase, GAIT_BACK),
          "leg-front-far": gaitPaw(phase + 0.5, GAIT_FRONT),
          "leg-back-near": gaitPaw(phase + 0.5, GAIT_BACK),
        },
      },
    });
  }
  return build(T, true, keys, {
    bones: {
      head: { rot: sine(T, T / 2, 6, 1, 1) },
      tail: tailWave(sine(T, T, 18, 4)),
    },
  });
}

/** Гризе дріт чи пакет (§9.12, «Гризіння»): лежить буханцем, морда до підлоги, голова повернута набік і ходить у ритмі жування. */
function chew(): CatAnim {
  const D = 900;
  const pose = (tilt: number, dip: number): Pose => loafWith({ neck: { rot: 30 + dip, x: 2, y: 2 }, head: { rot: tilt } });
  const A = pose(5, 0);
  return build(
    D,
    true,
    [
      { t: 0, pose: A },
      { t: 200, pose: pose(-15, 4) },
      { t: 450, pose: A },
      { t: 650, pose: pose(-15, 4) },
      { t: D, pose: A },
    ],
    { bones: { tail: tailWave(sine(D, D, LOAF_TAIL, 5, 1)) } },
  );
}

/**
 * «Образливий» дметься (§9.12): сидить спиною до персонажа (`catFacing`), згорбившись — плечі вперед-униз, голова опущена в
 * плечі (ззаду її майже ховає спина), хвіст лежить на підлозі; кінчик зрідка сіпається.
 */
function sulk(): CatAnim {
  const D = 3200;
  const TAIL = SIT_TAIL + 8;
  // Важко зітхає раз за пів циклу: груди ширшають, плечі ледь піднімаються, голова хилиться нижче на видиху.
  const pose = (head: number, breath: number): Pose =>
    sitWith({ pelvis: { rot: 8 - breath * 2 }, body: { sy: 1 + breath * 0.04 }, neck: { rot: 46, x: -4, y: 3 }, head: { rot: -32 + head - breath * 2 }, tail: { rot: 8 } });
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
    { bones: { tail: tailWave(track([0, TAIL], [2200, TAIL], [2350, TAIL + 10], [2500, TAIL - 1], [2650, TAIL + 6], [D, TAIL])) } },
  );
}

/**
 * Не хоче гратися (§9.4, поза 6): лежить буханцем, голова піднята до того, хто кликав; хвіст лежить, кінчик швидко б'є по
 * підлозі — частіше, ніж у спокійного кота. Рух — лише хвіст.
 */
function decline(): CatAnim {
  const D = 1500;
  const pose = loafWith({ neck: { rot: -6 }, head: { rot: -4 } });
  return build(
    D,
    true,
    [
      { t: 0, pose },
      { t: D, pose },
    ],
    {
      bones: {
        body: { scale: breathe(D, 1500, 0.03) },
        tail: tailWave(track([0, LOAF_TAIL], [140, LOAF_TAIL + 19, "out"], [300, LOAF_TAIL - 3], [440, LOAF_TAIL + 19, "out"], [600, LOAF_TAIL - 3], [D, LOAF_TAIL])),
      },
    },
  );
}

/**
 * Нюхає (§9.12: дрібничку, нову річ, м'яту, корм чи лоток, від яких відмовився): морда біля самої підлоги — передні лапи
 * зігнуті, груди низько, шия донизу, — і принюхується дрібними ривками там, унизу.
 */
function sniff(): CatAnim {
  const D = 1800;
  const pose = (dip: number, reach: number): Pose =>
    standWith({
      pelvis: { y: 2 },
      body: { rot: 14 },
      neck: { rot: 52 + dip, x: reach },
      head: { rot: -26 },
      tail: { rot: -10 },
      legs: { "leg-front-far": at(2), "leg-front-near": at(2) },
    });
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
    { bones: { tail: tailWave(sine(D, D, -10, 7, 1)) } },
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
