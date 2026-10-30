// Рантайм скелета (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): поза скелета в момент часу з визначення
// (`defs/*.ts`), точок кадрів маніфесту, пропорцій і анімації. Чистий TypeScript без Phaser і DOM: його перевіряє
// `tests/rig.test.ts` у Node, а показує `rigsprite.ts`.
//
// Як рахується поза (`Rig.evaluate(now)`):
// 1. Вихідна поза ракурсу: кістки й слоти з визначення, перевизначення ракурсу (`views`), а де кадр слота має потрібну
//    точку (`RigFit`, `ArtEntry.points`) — положення з неї; числа визначення — запасні, поки арту немає. Рахується лише при
//    зміні ракурсу чи обвісу.
// 2. Локальна поза кістки = вихідна + поправки пропорцій + доріжки анімації в момент t (`rot` і `pos` додаються, `scale`
//    множиться); після `play` протягом `BLEND_MS` — плавно від попередньої пози до нової.
// 3. Світові перетворення кісток у системі кореня (обличчям праворуч, вісь y донизу, кути за годинниковою), а з них —
//    слоти (місце, кут і масштаб кадру відносно вихідної пози), якорі, гнізда й порядок малювання за z.
//
// Віддзеркалення (`RigFacing.flip`, обличчям ліворуч) позу не змінює: `rigsprite.ts` дзеркалить увесь контейнер
// (`scaleX = −1`), а якорі й гнізда в системі кореня тут віддають уже віддзеркаленими (x → −x, кут → −кут), z — той самий.
//
// Щокадру нічого не виділяється: стан кісток, слотів і гнізд — об'єкти, створені разом зі скелетом, а поза пишеться в них.

import { ART_SEGMENT, ART_VIEWS, frameId, type ArtEntry, type ArtId, type ArtPoint, type ArtView, type FrameId } from "../art/types";
import type {
  AnyRig,
  BoneOf,
  BoneSetup,
  BoneTracks,
  Ease,
  Key,
  RigAnchor,
  RigAnim,
  RigDef,
  RigFacing,
  RigSkin,
  RigTracks,
  SlotOf,
  SlotTracks,
  SocketCargo,
  SocketOf,
  StepKey,
  Vec2,
} from "./types";

/** Скільки триває змішування поз, коли анімація змінюється, мс. */
export const BLEND_MS = 120;

/** Усі якорі (`RigAnchor`). */
export const RIG_ANCHORS: readonly RigAnchor[] = ["head", "hands", "mouth", "lap"];

const EASES: readonly Ease[] = ["linear", "step", "in", "out", "inOut"];
const CARGO: readonly SocketCargo[] = ["cat", "hand", "rod", "held", "toy", "sock"];

/** Скелет без літеральних id — для перевірок і внутрішніх таблиць. */
type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

// --- Точки кадрів ------------------------------------------------------------------------------

/** Точка кадру, який показує слот `slot`: `point` — назва точки в його записі маніфесту (`ArtEntry.points`). */
export interface PointRef<S extends string> {
  slot: S;
  point: string;
}

/** Одна точка чи кілька за пріоритетом: береться перша, яка знайшлася в арті (рот — з морди, інакше з голови). */
export type PointRefs<S extends string> = PointRef<S> | readonly PointRef<S>[];

/**
 * Де скелет бере вихідні положення з арту: кістка починається в точці кадру (лапа — у `shoulder-near` тулуба), слот,
 * якір чи гніздо стоїть у точці кадру (очі — у `eyes` голови). Точки ще немає (арту немає, запис без неї, слот
 * порожній) — діє число з визначення. Кадр, на точку якого посилаються, має належати кістці, що стоїть у переліку раніше
 * (для слота — або тій самій кістці й слоту раніше за переліком): так вихідна поза рахується за один прохід.
 *
 * Точка для одного ракурсу — `<назва>-<ракурс>` (`neck-back`): якщо вона є, ракурс бере її, інакше — `<назва>`.
 */
export interface RigFit<B extends string, S extends string, K extends string> {
  bones?: Readonly<Partial<Record<B, PointRefs<S>>>>;
  slots?: Readonly<Partial<Record<S, PointRefs<S>>>>;
  anchors?: Readonly<Partial<Record<RigAnchor, PointRefs<S>>>>;
  sockets?: Readonly<Partial<Record<K, PointRefs<S>>>>;
}

/** Точки арту для скелета `R`. */
export type FitOf<R extends AnyRig> = RigFit<BoneOf<R>, SlotOf<R>, SocketOf<R>>;

/** Визначити, де скелет бере положення з точок кадрів: id кісток, слотів і гнізд перевіряються за скелетом. */
export function defineFit<R extends AnyRig>(_rig: R, fit: FitOf<NoInfer<R>>): FitOf<R> {
  return fit;
}

/** Точка кадру для ракурсу: спершу `<назва>-<ракурс>`, потім `<назва>`; немає — undefined. */
export function entryPoint(entry: ArtEntry | undefined, name: string, view: ArtView): ArtPoint | undefined {
  const points = entry?.points;
  if (!points) return undefined;
  return points[`${name}-${view}`] ?? points[name];
}

/** Як знайти запис маніфесту за id (у грі — `artEntry` з `art/manifest.ts`; у тестах — свій). */
export type ArtLookup = (id: ArtId) => ArtEntry | undefined;

/** Кадр, який показує слот: запис, стан і ракурс (null — запис їх не має) і id кадру атласу. */
export interface SlotFrame {
  art: ArtId;
  state: string | null;
  view: ArtView | null;
  frame: FrameId;
}

/**
 * Кадр слота за записом маніфесту: стан і ракурс додаються, лише якщо запис їх має; стану, якого в записі немає, —
 * перший стан запису. Запису немає (арту ще немає) — як просили: кадр однаково буде заглушкою.
 */
export function slotFrame(art: ArtId, entry: ArtEntry | undefined, state: string | null, view: ArtView): SlotFrame {
  if (!entry) return { art, state, view, frame: frameId(art, state, view) };
  const states = entry.states;
  const st = states ? (state !== null && states.includes(state) ? state : (states[0] ?? null)) : null;
  const views = entry.views;
  const vw = views ? (views.includes(view) ? view : (views[0] ?? null)) : null;
  return { art, state: st, view: vw, frame: frameId(art, st, vw) };
}

// --- Перевірка ---------------------------------------------------------------------------------

const finite = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);

/** Що не так із визначенням скелета: по рядку на помилку; порожньо — усе гаразд. Типи ловлять не все (повтори id, порядок). */
export function rigProblems(def: LooseRig): string[] {
  const problems: string[] = [];
  const where = `скелет «${def.id}»`;
  if (!ART_SEGMENT.test(def.id)) problems.push(`${where}: id — малі латинські літери, цифри й дефіс`);
  const boneAt = new Map<string, number>();
  def.bones.forEach((bone, i) => {
    const at = `${where}, кістка «${bone.id}»`;
    if (boneAt.has(bone.id)) problems.push(`${at}: id повторюється`);
    if (bone.parent === null) {
      if (i !== 0) problems.push(`${at}: корінь (parent: null) має бути першим і єдиним`);
    } else if (i === 0) {
      problems.push(`${at}: перша кістка — корінь (parent: null)`);
    } else if (!boneAt.has(bone.parent)) {
      problems.push(`${at}: батько «${bone.parent}» має стояти раніше в переліку`);
    }
    if (![bone.x, bone.y, bone.rot, bone.len].every(finite)) problems.push(`${at}: x, y, rot і len мають бути числами`);
    if (bone.len < 0) problems.push(`${at}: len не може бути від'ємною`);
    if (!boneAt.has(bone.id)) boneAt.set(bone.id, i);
  });
  if (def.bones.length === 0) problems.push(`${where}: немає кісток`);

  const slotIds = new Set<string>();
  for (const slot of def.slots) {
    const at = `${where}, слот «${slot.id}»`;
    if (slotIds.has(slot.id)) problems.push(`${at}: id повторюється`);
    slotIds.add(slot.id);
    if (!boneAt.has(slot.bone)) problems.push(`${at}: кістки «${slot.bone}» немає`);
    if (!finite(slot.z)) problems.push(`${at}: z має бути числом`);
    if (slot.frame !== null && !ART_SEGMENT.test(slot.frame)) problems.push(`${at}: стан «${slot.frame}» — сегмент id`);
    if ((slot.x !== undefined && !finite(slot.x)) || (slot.y !== undefined && !finite(slot.y))) problems.push(`${at}: x і y мають бути числами`);
  }

  const socketIds = Object.keys(def.sockets);
  for (const id of socketIds) {
    const socket = (def.sockets as Readonly<Record<string, LooseRig["sockets"][string]>>)[id];
    const at = `${where}, гніздо «${id}»`;
    if (!socket) continue;
    if (slotIds.has(id)) problems.push(`${at}: id збігається з id слота`);
    if (!boneAt.has(socket.bone)) problems.push(`${at}: кістки «${socket.bone}» немає`);
    if (![socket.x, socket.y, socket.z].every(finite) || (socket.rot !== undefined && !finite(socket.rot))) problems.push(`${at}: x, y, z і rot мають бути числами`);
    if (socket.cargo.length === 0) problems.push(`${at}: порожній перелік cargo`);
    for (const cargo of socket.cargo) if (!CARGO.includes(cargo)) problems.push(`${at}: невідомий cargo «${cargo}»`);
  }

  for (const [name, anchor] of Object.entries(def.anchors)) {
    const at = `${where}, якір «${name}»`;
    if (!RIG_ANCHORS.includes(name as RigAnchor)) problems.push(`${at}: невідомий якір`);
    if (!anchor) continue;
    if (!boneAt.has(anchor.bone)) problems.push(`${at}: кістки «${anchor.bone}» немає`);
    if (!finite(anchor.x) || !finite(anchor.y)) problems.push(`${at}: x і y мають бути числами`);
  }

  for (const view of ART_VIEWS) {
    const setup = (def.views as Partial<LooseRig["views"]>)[view];
    const at = `${where}, ракурс «${view}»`;
    if (!setup) {
      problems.push(`${at}: немає вихідної пози`);
      continue;
    }
    for (const [id, bone] of Object.entries(setup.bones ?? {})) {
      if (!boneAt.has(id)) problems.push(`${at}: кістки «${id}» немає`);
      for (const v of Object.values(bone ?? {})) if (!finite(v)) problems.push(`${at}, кістка «${id}»: значення мають бути числами`);
    }
    for (const [id, slot] of Object.entries(setup.slots ?? {})) {
      if (!slotIds.has(id)) problems.push(`${at}: слота «${id}» немає`);
      if (!slot) continue;
      if ([slot.z, slot.x, slot.y].some((v) => v !== undefined && !finite(v))) problems.push(`${at}, слот «${id}»: z, x і y мають бути числами`);
      if (slot.frame !== undefined && slot.frame !== null && !ART_SEGMENT.test(slot.frame)) problems.push(`${at}, слот «${id}»: стан «${slot.frame}» — сегмент id`);
    }
    for (const [id, socket] of Object.entries(setup.sockets ?? {})) {
      if (!socketIds.includes(id)) problems.push(`${at}: гнізда «${id}» немає`);
      if (socket && !finite(socket.z)) problems.push(`${at}, гніздо «${id}»: z має бути числом`);
    }
  }
  for (const view of Object.keys(def.views)) if (!ART_VIEWS.includes(view as ArtView)) problems.push(`${where}: невідомий ракурс «${view}»`);

  const skinIds = Object.keys(def.skin);
  for (const id of slotIds) if (!skinIds.includes(id)) problems.push(`${where}: обвіс не має слота «${id}»`);
  for (const [id, art] of Object.entries(def.skin)) {
    if (!slotIds.has(id)) problems.push(`${where}: обвіс має зайвий слот «${id}»`);
    if (art !== null && !(art.split("/").length >= 2 && art.split("/").every((s) => ART_SEGMENT.test(s)))) problems.push(`${where}: обвіс «${id}» — не id арту: «${art}»`);
  }

  for (const [name, tweak] of Object.entries(def.proportions ?? {})) {
    for (const [id, bone] of Object.entries(tweak)) {
      const at = `${where}, пропорції «${name}», кістка «${id}»`;
      if (!boneAt.has(id)) problems.push(`${at}: кістки немає`);
      if (!bone) continue;
      if ([bone.x, bone.y, bone.rot].some((v) => v !== undefined && !finite(v))) problems.push(`${at}: x, y і rot мають бути числами`);
      if (bone.scale && !(finite(bone.scale.x) && finite(bone.scale.y) && bone.scale.x !== 0 && bone.scale.y !== 0)) problems.push(`${at}: scale — ненульові числа`);
    }
  }
  return problems;
}

/** Що не так із точками арту скелета (`RigFit`): невідомі id і посилання на кадр, якого ще не пораховано. */
export function fitProblems(def: LooseRig, fit: RigFit<string, string, string>): string[] {
  const problems: string[] = [];
  const where = `точки скелета «${def.id}»`;
  const boneAt = new Map(def.bones.map((bone, i) => [bone.id, i]));
  const slotAt = new Map(def.slots.map((slot, i) => [slot.id, i]));
  const slotBone = (slot: string): number => boneAt.get(def.slots[slotAt.get(slot) ?? -1]?.bone ?? "") ?? -1;
  const refs = (value: PointRefs<string> | undefined): readonly PointRef<string>[] => (value === undefined ? [] : isRefList(value) ? value : [value]);
  const check = (at: string, value: PointRefs<string> | undefined, ok: (slot: string) => boolean): void => {
    for (const ref of refs(value)) {
      if (!slotAt.has(ref.slot)) problems.push(`${at}: слота «${ref.slot}» немає`);
      else if (!ok(ref.slot)) problems.push(`${at}: кадр слота «${ref.slot}» ще не пораховано — його кістка має стояти раніше`);
      if (!ART_SEGMENT.test(ref.point)) problems.push(`${at}: точка «${ref.point}» — сегмент id`);
    }
  };
  for (const [id, value] of Object.entries(fit.bones ?? {})) {
    const at = `${where}, кістка «${id}»`;
    const i = boneAt.get(id);
    if (i === undefined) problems.push(`${at}: кістки немає`);
    check(at, value, (slot) => i !== undefined && slotBone(slot) < i);
  }
  for (const [id, value] of Object.entries(fit.slots ?? {})) {
    const at = `${where}, слот «${id}»`;
    const i = slotAt.get(id);
    if (i === undefined) problems.push(`${at}: слота немає`);
    const own = slotBone(id);
    check(at, value, (slot) => i !== undefined && (slotBone(slot) < own || (slotBone(slot) === own && (slotAt.get(slot) ?? Infinity) < i)));
  }
  for (const [id, value] of Object.entries(fit.anchors ?? {})) {
    const at = `${where}, якір «${id}»`;
    if (!(def.anchors as Readonly<Record<string, unknown>>)[id]) problems.push(`${at}: у скелеті немає такого якоря`);
    check(at, value, () => true);
  }
  for (const [id, value] of Object.entries(fit.sockets ?? {})) {
    const at = `${where}, гніздо «${id}»`;
    if (!Object.hasOwn(def.sockets, id)) problems.push(`${at}: гнізда немає`);
    check(at, value, () => true);
  }
  return problems;
}

/** Що не так з анімацією скелета: невідомі id, ключі не за часом чи поза тривалістю, не числа. */
export function animProblems(def: LooseRig, anim: LooseAnim, name = "анімація"): string[] {
  const problems: string[] = [];
  const where = `«${def.id}/${name}»`;
  const bones = new Set(def.bones.map((bone) => bone.id));
  const slots = new Set(def.slots.map((slot) => slot.id));
  if (!(finite(anim.duration) && anim.duration > 0)) problems.push(`${where}: тривалість має бути додатною`);
  const keys = (at: string, list: readonly { t: number; v: unknown; ease?: unknown }[] | undefined, value: (v: unknown) => boolean): void => {
    if (!list) return;
    if (list.length === 0) problems.push(`${at}: порожня доріжка (без ключів — не задавати)`);
    list.forEach((key, i) => {
      if (!finite(key.t) || key.t < 0 || key.t > anim.duration) problems.push(`${at}: час ключа ${i} — від 0 до тривалості`);
      if (i > 0 && key.t < (list[i - 1]?.t ?? 0)) problems.push(`${at}: ключі мають іти за часом`);
      if (!value(key.v)) problems.push(`${at}: неправильне значення ключа ${i}`);
      if (key.ease !== undefined && !EASES.includes(key.ease as Ease)) problems.push(`${at}: невідомий ease «${String(key.ease)}»`);
    });
  };
  const vec = (v: unknown): boolean => typeof v === "object" && v !== null && finite((v as Vec2).x) && finite((v as Vec2).y);
  const tracks = (at: string, set: RigTracks<string, string> | undefined): void => {
    for (const [id, track] of Object.entries(set?.bones ?? {})) {
      if (!bones.has(id)) problems.push(`${at}: кістки «${id}» немає`);
      const t: BoneTracks = track ?? {};
      keys(`${at}, кістка «${id}», rot`, t.rot, finite);
      keys(`${at}, кістка «${id}», pos`, t.pos, vec);
      keys(`${at}, кістка «${id}», scale`, t.scale, vec);
    }
    for (const [id, track] of Object.entries(set?.slots ?? {})) {
      if (!slots.has(id)) problems.push(`${at}: слота «${id}» немає`);
      const t: SlotTracks = track ?? {};
      keys(`${at}, слот «${id}», frame`, t.frame, (v) => typeof v === "string" && ART_SEGMENT.test(v));
      keys(`${at}, слот «${id}», visible`, t.visible, (v) => typeof v === "boolean");
      keys(`${at}, слот «${id}», z`, t.z, finite);
    }
  };
  tracks(where, anim);
  for (const [view, set] of Object.entries(anim.views ?? {})) {
    if (!ART_VIEWS.includes(view as ArtView)) problems.push(`${where}: невідомий ракурс «${view}»`);
    tracks(`${where}, ракурс «${view}»`, set);
  }
  return problems;
}

// --- Час і ключі -------------------------------------------------------------------------------

/** Ease на відрізку 0…1: `step` тримає початок, `in` / `out` / `inOut` — чверть і половина синусоїди. */
export function easeValue(kind: Ease | undefined, u: number): number {
  switch (kind) {
    case "step":
      return 0;
    case "in":
      return 1 - Math.cos((u * Math.PI) / 2);
    case "out":
      return Math.sin((u * Math.PI) / 2);
    case "inOut":
      return (1 - Math.cos(u * Math.PI)) / 2;
    default:
      return u;
  }
}

/** Індекс останнього ключа з `t ≤ time`; −1 — раніше за перший. */
function keyAt(keys: readonly { t: number }[], time: number): number {
  let i = -1;
  while (i + 1 < keys.length && (keys[i + 1]?.t ?? Infinity) <= time) i++;
  return i;
}

/** Значення числової доріжки в момент `time`: до першого ключа — перший, після останнього — останній. */
export function sampleNumber(keys: readonly Key<number>[], time: number): number {
  const i = keyAt(keys, time);
  const a = keys[Math.max(0, i)];
  const b = keys[i + 1];
  if (!a) return 0;
  if (i < 0 || !b) return a.v;
  const span = b.t - a.t;
  if (span <= 0) return b.v;
  return a.v + (b.v - a.v) * easeValue(a.ease, (time - a.t) / span);
}

/** Значення доріжки векторів у момент `time` — в `out`. */
export function sampleVec(keys: readonly Key<Vec2>[], time: number, out: Vec2): Vec2 {
  const i = keyAt(keys, time);
  const a = keys[Math.max(0, i)];
  const b = keys[i + 1];
  if (!a) {
    out.x = 0;
    out.y = 0;
  } else if (i < 0 || !b || b.t - a.t <= 0) {
    const v = i < 0 || !b ? a.v : b.v;
    out.x = v.x;
    out.y = v.y;
  } else {
    const e = easeValue(a.ease, (time - a.t) / (b.t - a.t));
    out.x = a.v.x + (b.v.x - a.v.x) * e;
    out.y = a.v.y + (b.v.y - a.v.y) * e;
  }
  return out;
}

/** Значення доріжки слота: останній ключ з `t ≤ time` (до першого — перший). */
export function sampleStep<V>(keys: readonly StepKey<V>[], time: number): V | undefined {
  return keys[Math.max(0, keyAt(keys, time))]?.v;
}

/** Час усередині анімації: по колу — за модулем тривалості, разова — від 0 до тривалості (далі тримає останній кадр). */
export function animTime(duration: number, loop: boolean, elapsed: number): number {
  if (!(duration > 0)) return 0;
  if (loop) {
    const t = elapsed % duration;
    return t < 0 ? t + duration : t;
  }
  return Math.min(duration, Math.max(0, elapsed));
}

// --- Перетворення ------------------------------------------------------------------------------

/** Афінне перетворення 2D: (x, y) → (a·x + c·y + tx, b·x + d·y + ty). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const DEG = Math.PI / 180;

function affine(): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

/** T(x, y) · R(rot) · S(sx, sy); кут у градусах. */
function setTRS(m: Affine, x: number, y: number, rot: number, sx: number, sy: number): void {
  const cos = Math.cos(rot * DEG);
  const sin = Math.sin(rot * DEG);
  m.a = cos * sx;
  m.b = sin * sx;
  m.c = -sin * sy;
  m.d = cos * sy;
  m.tx = x;
  m.ty = y;
}

/** out = p · l; `out` не може бути `l`. */
function multiply(p: Affine, l: Affine, out: Affine): void {
  const { a, b, c, d, tx, ty } = l;
  out.a = p.a * a + p.c * b;
  out.b = p.b * a + p.d * b;
  out.c = p.a * c + p.c * d;
  out.d = p.b * c + p.d * d;
  out.tx = p.a * tx + p.c * ty + p.tx;
  out.ty = p.b * tx + p.d * ty + p.ty;
}


function apply(m: Affine, x: number, y: number, out: Vec2): Vec2 {
  out.x = m.a * x + m.c * y + m.tx;
  out.y = m.b * x + m.d * y + m.ty;
  return out;
}

function applyInverse(m: Affine, x: number, y: number, out: Vec2): Vec2 {
  const det = m.a * m.d - m.b * m.c || 1;
  const dx = x - m.tx;
  const dy = y - m.ty;
  out.x = (m.d * dx - m.c * dy) / det;
  out.y = (m.a * dy - m.b * dx) / det;
  return out;
}

/** Кут, масштаб і місце об'єкта на кістці (кадр слота, вміст гнізда) — у системі кореня, обличчям праворуч. */
export interface Placement {
  x: number;
  y: number;
  /** Кут відносно вихідної пози, градуси за годинниковою. */
  rot: number;
  /** Масштаб відносно вихідної пози (зі знаком: від'ємний — віддзеркалено). */
  sx: number;
  sy: number;
}

/**
 * Куди стає об'єкт у точці (x, y) кістки: місце — `world · (x, y)`, а поворот і масштаб — зміна кістки відносно вихідної
 * пози (`world · R(−кут вихідної пози)`), розкладена на кут і масштаб (перекіс, якого Phaser не вміє, відкидається; при
 * масштабі вздовж і впоперек кістки, кратній 90°, його немає).
 */
function place(world: Affine, cos: number, sin: number, x: number, y: number, extraRot: number, out: Placement): void {
  out.x = world.a * x + world.c * y + world.tx;
  out.y = world.b * x + world.d * y + world.ty;
  const l00 = world.a * cos - world.c * sin;
  const l10 = world.b * cos - world.d * sin;
  const l01 = world.a * sin + world.c * cos;
  const l11 = world.b * sin + world.d * cos;
  const sx = Math.hypot(l00, l10);
  out.sx = sx;
  out.sy = sx > 0 ? (l00 * l11 - l01 * l10) / sx : Math.hypot(l01, l11);
  out.rot = Math.atan2(l10, l00) / DEG + extraRot;
}

// --- Скелет у роботі ----------------------------------------------------------------------------

/** Поза кістки: світове перетворення в системі кореня (обличчям праворуч), кінець — `world · (len, 0)`. */
export interface BonePose {
  readonly id: string;
  readonly parent: number;
  readonly world: Readonly<Affine>;
  /** Довжина у вихідній позі ракурсу. */
  readonly len: number;
}

/** Слот у позі: місце, кут і масштаб кадру (`Placement`), z, видимість і кадр. */
export interface SlotPose<S extends string = string> extends Placement {
  readonly id: S;
  z: number;
  /** Видно: у вихідній позі ракурсу, обвіс має запис і доріжка `visible` (якщо є) — true. */
  visible: boolean;
  /** Запис обвісу; null — слота в цієї істоти немає. */
  art: ArtId | null;
  /** Стан кадру: з доріжки `frame` чи вихідної пози. */
  state: string | null;
}

/** Гніздо в позі: місце й кут вмісту (`Placement`, кут — з `SocketDef.rot`) і z серед слотів. */
export interface SocketPose extends Placement {
  z: number;
}

/** Елемент порядку малювання: слот чи гніздо (`index` — у `def.slots` чи в `socketIds`). */
export interface DrawItem {
  readonly kind: "slot" | "socket";
  readonly index: number;
  readonly id: string;
  z: number;
}

/** Пропорції: назва (`RigDef.proportions`) або назва з вагою 0…1 (кошеня, що підростає). */
export type ProportionRef = string | { readonly name: string; readonly weight: number };

export interface RigOptions<B extends string, S extends string, K extends string> {
  /** Звідки брати вихідні положення в арті; null чи не задано — лише числа визначення. */
  fit?: RigFit<B, S, K> | null | undefined;
  /** Записи маніфесту за id; не задано — точок немає (лише числа визначення), стан і ракурс кадру — як просили. */
  lookup?: ArtLookup | undefined;
  /** Обвіс поверх `def.skin`. */
  skin?: Partial<RigSkin<S>> | undefined;
  facing?: Partial<RigFacing> | undefined;
  proportions?: readonly ProportionRef[] | undefined;
}

export interface PlayOptions {
  /** По колу; за замовчуванням — `anim.loop`. */
  loop?: boolean | undefined;
  /** З якого моменту анімації почати, мс; за замовчуванням 0. */
  from?: number | undefined;
  /** Змішування з попередньою позою, мс; за замовчуванням `BLEND_MS`, 0 — одразу. */
  blend?: number | undefined;
  /** Та сама анімація вже грає — почати знову (інакше `play` нічого не робить). */
  restart?: boolean | undefined;
}

interface Local {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
}

interface BoneRt extends BonePose {
  readonly def: LooseRig["bones"][number];
  setup: BoneSetup;
  /** Вихідна поза ракурсу у світі (без пропорцій і анімації) і косинус/синус її кута. */
  readonly setupWorld: Affine;
  setupRot: number;
  setupCos: number;
  setupSin: number;
  readonly tweak: Local;
  readonly local: Local;
  readonly from: Local;
  readonly world: Affine;
}

interface SlotRt {
  readonly def: LooseRig["slots"][number];
  readonly bone: number;
  x: number;
  y: number;
  z: number;
  state: string | null;
  visible: boolean;
  readonly pose: SlotPose;
}

interface SocketRt {
  readonly id: string;
  readonly def: LooseRig["sockets"][string];
  readonly bone: number;
  x: number;
  y: number;
  z: number;
  readonly pose: SocketPose;
}

interface AnchorRt {
  readonly name: RigAnchor;
  readonly bone: number;
  x: number;
  y: number;
}

/** Доріжки анімації для одного ракурсу за індексами кісток і слотів (перевизначення ракурсу вже враховано). */
interface CompiledAnim {
  rot: (readonly Key<number>[] | undefined)[];
  pos: (readonly Key<Vec2>[] | undefined)[];
  scale: (readonly Key<Vec2>[] | undefined)[];
  frame: (readonly StepKey<string>[] | undefined)[];
  visible: (readonly StepKey<boolean>[] | undefined)[];
  z: (readonly StepKey<number>[] | undefined)[];
}

/** Скомпільовані анімації за скелетом: анімація → [front, back]. */
const COMPILED = new WeakMap<object, WeakMap<object, CompiledAnim[]>>();

function compileAnim(def: LooseRig, anim: LooseAnim, view: ArtView): CompiledAnim {
  const over = anim.views?.[view];
  const bone = (id: string): BoneTracks | undefined => anim.bones?.[id];
  const boneOver = (id: string): BoneTracks | undefined => over?.bones?.[id];
  const slot = (id: string): SlotTracks | undefined => anim.slots?.[id];
  const slotOver = (id: string): SlotTracks | undefined => over?.slots?.[id];
  return {
    rot: def.bones.map((b) => boneOver(b.id)?.rot ?? bone(b.id)?.rot),
    pos: def.bones.map((b) => boneOver(b.id)?.pos ?? bone(b.id)?.pos),
    scale: def.bones.map((b) => boneOver(b.id)?.scale ?? bone(b.id)?.scale),
    frame: def.slots.map((s) => slotOver(s.id)?.frame ?? slot(s.id)?.frame),
    visible: def.slots.map((s) => slotOver(s.id)?.visible ?? slot(s.id)?.visible),
    z: def.slots.map((s) => slotOver(s.id)?.z ?? slot(s.id)?.z),
  };
}

function isRefList<S extends string>(value: PointRefs<S>): value is readonly PointRef<S>[] {
  return Array.isArray(value);
}

/** Плавний крок 0…1 для змішування поз. */
function smooth(w: number): number {
  return w * w * (3 - 2 * w);
}

/**
 * Скелет у роботі: ракурс, обвіс, пропорції й анімація; `evaluate(now)` рахує позу, а її читають `slots`, `order`,
 * `bones`, `anchor`, `socket`. Час — мілісекунди будь-якого годинника (час сцени, повзунок галереї), лише один і той
 * самий для `play` і `evaluate`.
 */
export class Rig<B extends string, S extends string, K extends string> {
  readonly def: RigDef<B, S, K>;
  /** Кістки в порядку визначення (батько раніше за дітей). */
  readonly bones: readonly BonePose[];
  /** Слоти в порядку визначення. */
  readonly slots: readonly SlotPose<S>[];
  /** Id гнізд у порядку визначення. */
  readonly socketIds: readonly K[];
  /** Порядок малювання слотів і гнізд — за z (рівні — у порядку визначення, слоти раніше за гнізда). */
  readonly order: readonly DrawItem[];
  /** Росте щоразу, як змінюється `order`: `rigsprite.ts` переставляє зображення лише тоді. */
  orderVersion = 0;

  private readonly fit: RigFit<string, string, string> | null;
  private readonly lookup: ArtLookup | undefined;
  private readonly boneRt: BoneRt[];
  private readonly slotRt: SlotRt[];
  private readonly socketRt: SocketRt[];
  private readonly anchorRt: AnchorRt[];
  /** Елементи порядку малювання: `items` — за z, `slotItems` і `socketItems` — ті самі об'єкти в порядку визначення. */
  private readonly items: DrawItem[];
  private readonly slotItems: DrawItem[];
  private readonly socketItems: DrawItem[];
  private readonly anchorByName = new Map<RigAnchor, AnchorRt>();
  private readonly boneIndex = new Map<string, number>();
  private readonly slotIndex = new Map<string, number>();
  private readonly socketIndex = new Map<string, number>();
  /** Слоти кожної кістки в порядку визначення: для вихідної пози за один прохід. */
  private readonly slotsOfBone: number[][];
  private readonly anims: WeakMap<object, CompiledAnim[]>;

  private skinNow: Record<string, ArtId | null>;
  private facingNow: RigFacing;
  private proportionsNow: readonly ProportionRef[] = [];
  private setupDirty = true;

  private current: LooseAnim | null = null;
  private loopNow = false;
  private start = 0;
  private blendStart = -Infinity;
  private blendMs = 0;
  private evaluated = false;

  private readonly tmpM = affine();
  private readonly tmpV: Vec2 = { x: 0, y: 0 };
  private readonly tmpP: Vec2 = { x: 0, y: 0 };

  constructor(def: RigDef<B, S, K>, opts: RigOptions<B, S, K> = {}) {
    const loose = def as unknown as LooseRig;
    const problems = rigProblems(loose);
    if (opts.fit) problems.push(...fitProblems(loose, opts.fit));
    if (problems.length > 0) throw new Error(`Скелет:\n- ${problems.join("\n- ")}`);
    this.def = def;
    this.fit = opts.fit ?? null;
    this.lookup = opts.lookup;
    let anims = COMPILED.get(def);
    if (!anims) {
      anims = new WeakMap();
      COMPILED.set(def, anims);
    }
    this.anims = anims;

    this.boneRt = loose.bones.map((bone, i) => {
      this.boneIndex.set(bone.id, i);
      return {
        id: bone.id,
        def: bone,
        parent: bone.parent === null ? -1 : (this.boneIndex.get(bone.parent) ?? -1),
        setup: { x: bone.x, y: bone.y, rot: bone.rot, len: bone.len },
        len: bone.len,
        setupWorld: affine(),
        setupRot: 0,
        setupCos: 1,
        setupSin: 0,
        tweak: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 },
        local: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 },
        from: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 },
        world: affine(),
      };
    });
    this.slotsOfBone = this.boneRt.map(() => []);
    this.slotRt = loose.slots.map((slot, i) => {
      this.slotIndex.set(slot.id, i);
      const bone = this.boneIndex.get(slot.bone) ?? 0;
      this.slotsOfBone[bone]?.push(i);
      const pose: SlotPose = { id: slot.id, x: 0, y: 0, rot: 0, sx: 1, sy: 1, z: slot.z, visible: false, art: null, state: null };
      return { def: slot, bone, x: 0, y: 0, z: slot.z, state: slot.frame, visible: true, pose };
    });
    const sockets = loose.sockets as Readonly<Record<string, LooseRig["sockets"][string]>>;
    this.socketIds = Object.keys(sockets) as K[];
    this.socketRt = this.socketIds.flatMap((id, i) => {
      const socket = sockets[id];
      if (!socket) return [];
      this.socketIndex.set(id, i);
      return [{ id, def: socket, bone: this.boneIndex.get(socket.bone) ?? 0, x: 0, y: 0, z: socket.z, pose: { x: 0, y: 0, rot: 0, sx: 1, sy: 1, z: socket.z } }];
    });
    this.anchorRt = RIG_ANCHORS.flatMap((name) => {
      const anchor = loose.anchors[name];
      return anchor ? [{ name, bone: this.boneIndex.get(anchor.bone) ?? 0, x: anchor.x, y: anchor.y }] : [];
    });
    for (const anchor of this.anchorRt) this.anchorByName.set(anchor.name, anchor);
    this.slotItems = this.slotRt.map((slot, index): DrawItem => ({ kind: "slot", index, id: slot.def.id, z: slot.z }));
    this.socketItems = this.socketRt.map((socket, index): DrawItem => ({ kind: "socket", index, id: socket.id, z: socket.z }));
    this.items = [...this.slotItems, ...this.socketItems];
    this.bones = this.boneRt;
    this.slots = this.slotRt.map((slot) => slot.pose) as SlotPose<S>[];
    this.order = this.items;

    this.skinNow = { ...loose.skin };
    if (opts.skin) this.setSkin(opts.skin);
    this.facingNow = { view: opts.facing?.view ?? "front", flip: opts.facing?.flip ?? false };
    this.setProportions(opts.proportions ?? []);
  }

  /** Ракурс і віддзеркалення зараз. */
  get facing(): Readonly<RigFacing> {
    return this.facingNow;
  }

  /** Обвіс зараз: слот → запис маніфесту (null — слота немає). */
  get skin(): Readonly<RigSkin<S>> {
    return this.skinNow as RigSkin<S>;
  }

  /** Пропорції зараз. */
  get proportions(): readonly ProportionRef[] {
    return this.proportionsNow;
  }

  /** Анімація, що грає (null — вихідна поза). */
  get anim(): RigAnim<B, S> | null {
    return this.current as RigAnim<B, S> | null;
  }

  /** Змінити ракурс чи віддзеркалення; новий ракурс — нова вихідна поза (без змішування). Повертає, чи щось змінилося. */
  setFacing(facing: Partial<RigFacing>): boolean {
    const view = facing.view ?? this.facingNow.view;
    const flip = facing.flip ?? this.facingNow.flip;
    if (view === this.facingNow.view && flip === this.facingNow.flip) return false;
    if (view !== this.facingNow.view) {
      this.setupDirty = true;
      this.blendStart = -Infinity;
    }
    this.facingNow = { view, flip };
    return true;
  }

  /** Замінити частину обвісу (решта лишається). Повертає, чи щось змінилося. */
  setSkin(skin: Partial<RigSkin<S>>): boolean {
    let changed = false;
    for (const [slot, art] of Object.entries(skin) as [string, ArtId | null | undefined][]) {
      if (art === undefined || !this.slotIndex.has(slot) || this.skinNow[slot] === art) continue;
      this.skinNow[slot] = art;
      changed = true;
    }
    if (changed) this.setupDirty = true;
    return changed;
  }

  /** Пропорції за назвами з `def.proportions` (невідомі назви пропускаються); складаються по черзі. */
  setProportions(list: readonly ProportionRef[]): void {
    this.proportionsNow = [...list];
    for (const bone of this.boneRt) {
      const t = bone.tweak;
      t.x = 0;
      t.y = 0;
      t.rot = 0;
      t.sx = 1;
      t.sy = 1;
    }
    const all = (this.def as unknown as LooseRig).proportions ?? {};
    for (const ref of list) {
      const name = typeof ref === "string" ? ref : ref.name;
      const w = typeof ref === "string" ? 1 : ref.weight;
      const tweaks = all[name];
      if (!tweaks || w === 0) continue;
      for (const [id, tweak] of Object.entries(tweaks)) {
        const bone = this.boneRt[this.boneIndex.get(id) ?? -1];
        if (!bone || !tweak) continue;
        const t = bone.tweak;
        t.x += (tweak.x ?? 0) * w;
        t.y += (tweak.y ?? 0) * w;
        t.rot += (tweak.rot ?? 0) * w;
        t.sx *= 1 + ((tweak.scale?.x ?? 1) - 1) * w;
        t.sy *= 1 + ((tweak.scale?.y ?? 1) - 1) * w;
      }
    }
  }

  /**
   * Грати анімацію з моменту `now` (null — вихідна поза). Та сама анімація з тим самим `loop` уже грає — нічого не
   * робить, якщо не `restart`. Повертає, чи почала.
   */
  play(anim: RigAnim<B, S> | null, now: number, opts: PlayOptions = {}): boolean {
    const next = anim as LooseAnim | null;
    const loop = next ? (opts.loop ?? next.loop) : false;
    if (next === this.current && loop === this.loopNow && !opts.restart) return false;
    this.blendMs = Math.max(0, opts.blend ?? BLEND_MS);
    if (this.evaluated && this.blendMs > 0) {
      for (const bone of this.boneRt) Object.assign(bone.from, bone.local);
      this.blendStart = now;
    } else {
      this.blendStart = -Infinity;
    }
    this.current = next;
    this.loopNow = loop;
    this.start = now - (opts.from ?? 0);
    return true;
  }

  /** Час усередині анімації, що грає, у момент `now`, мс. */
  time(now: number): number {
    return this.current ? animTime(this.current.duration, this.loopNow, now - this.start) : 0;
  }

  /** Разова анімація дійшла до кінця (по колу — ніколи; вихідна поза — завжди). */
  done(now: number): boolean {
    return !this.current || (!this.loopNow && now - this.start >= this.current.duration);
  }

  /** Порахувати позу в момент `now`. */
  evaluate(now: number): this {
    if (this.setupDirty) this.rebuildSetup();
    const view = this.facingNow.view;
    const anim = this.current ? this.compiled(this.current, view) : null;
    const t = this.time(now);
    const w = this.blendMs > 0 ? Math.min(1, Math.max(0, (now - this.blendStart) / this.blendMs)) : 1;
    const e = smooth(w);
    const v = this.tmpV;

    for (let i = 0; i < this.boneRt.length; i++) {
      const bone = this.boneRt[i]!;
      const l = bone.local;
      const s = bone.setup;
      const tw = bone.tweak;
      l.x = s.x + tw.x;
      l.y = s.y + tw.y;
      l.rot = s.rot + tw.rot;
      l.sx = tw.sx;
      l.sy = tw.sy;
      if (anim) {
        const rot = anim.rot[i];
        if (rot) l.rot += sampleNumber(rot, t);
        const pos = anim.pos[i];
        if (pos) {
          sampleVec(pos, t, v);
          l.x += v.x;
          l.y += v.y;
        }
        const scale = anim.scale[i];
        if (scale) {
          sampleVec(scale, t, v);
          l.sx *= v.x;
          l.sy *= v.y;
        }
      }
      if (w < 1) {
        const f = bone.from;
        l.x = f.x + (l.x - f.x) * e;
        l.y = f.y + (l.y - f.y) * e;
        l.rot = f.rot + (l.rot - f.rot) * e;
        l.sx = f.sx + (l.sx - f.sx) * e;
        l.sy = f.sy + (l.sy - f.sy) * e;
      }
      const parent = this.boneRt[bone.parent];
      if (parent) {
        setTRS(this.tmpM, l.x, l.y, l.rot, l.sx, l.sy);
        multiply(parent.world, this.tmpM, bone.world);
      } else {
        setTRS(bone.world, l.x, l.y, l.rot, l.sx, l.sy);
      }
    }

    for (let i = 0; i < this.slotRt.length; i++) {
      const slot = this.slotRt[i]!;
      const pose = slot.pose;
      const art = this.skinNow[slot.def.id] ?? null;
      let state = slot.state;
      let visible = slot.visible && art !== null;
      let z = slot.z;
      if (anim) {
        const frame = anim.frame[i];
        if (frame) state = sampleStep(frame, t) ?? state;
        const vis = anim.visible[i];
        if (vis && sampleStep(vis, t) === false) visible = false;
        const zs = anim.z[i];
        if (zs) z = sampleStep(zs, t) ?? z;
      }
      pose.art = art;
      pose.state = state;
      pose.visible = visible;
      pose.z = z;
      const bone = this.boneRt[slot.bone]!;
      place(bone.world, bone.setupCos, bone.setupSin, slot.x, slot.y, 0, pose);
      this.slotItems[i]!.z = z;
    }

    for (let i = 0; i < this.socketRt.length; i++) {
      const socket = this.socketRt[i]!;
      const bone = this.boneRt[socket.bone]!;
      place(bone.world, bone.setupCos, bone.setupSin, socket.x, socket.y, socket.def.rot ?? 0, socket.pose);
      socket.pose.z = socket.z;
      this.socketItems[i]!.z = socket.z;
    }

    if (this.sortItems()) this.orderVersion++;
    this.evaluated = true;
    return this;
  }

  /** Слот за id (поза з останнього `evaluate`). */
  slot(id: S): Readonly<SlotPose<S>> {
    const pose = this.slots[this.slotIndex.get(id) ?? -1];
    if (!pose) throw new Error(`Скелет «${this.def.id}»: слота «${id}» немає`);
    return pose;
  }

  /** Кістка за id (поза з останнього `evaluate`). */
  bone(id: B): BonePose {
    const bone = this.bones[this.boneIndex.get(id) ?? -1];
    if (!bone) throw new Error(`Скелет «${this.def.id}»: кістки «${id}» немає`);
    return bone;
  }

  /** Індекс кістки за id (для `bones`); −1 — немає. */
  boneAt(id: string): number {
    return this.boneIndex.get(id) ?? -1;
  }

  /** Вихідна поза кістки в ракурсі (з точками арту, без пропорцій і анімації). */
  boneSetup(id: B): Readonly<BoneSetup> {
    if (this.setupDirty) this.rebuildSetup();
    return this.boneRt[this.boneIndex.get(id) ?? -1]?.setup ?? { x: 0, y: 0, rot: 0, len: 0 };
  }

  /**
   * Якір у системі кореня (поза з останнього `evaluate`); `flip` — віддзеркалити (за замовчуванням — як `facing.flip`).
   * Якоря в скелеті немає — null.
   */
  anchor(name: RigAnchor, out: Vec2 = { x: 0, y: 0 }, flip: boolean = this.facingNow.flip): Vec2 | null {
    const anchor = this.anchorByName.get(name);
    if (!anchor) return null;
    apply(this.boneRt[anchor.bone]!.world, anchor.x, anchor.y, out);
    if (flip) out.x = -out.x;
    return out;
  }

  /** Гніздо в системі кореня (поза з останнього `evaluate`): місце, кут і z; `flip` — як в `anchor`. */
  socket(id: K, out: SocketPose = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, z: 0 }, flip: boolean = this.facingNow.flip): SocketPose | null {
    const socket = this.socketRt[this.socketIndex.get(id) ?? -1];
    if (!socket) return null;
    Object.assign(out, socket.pose);
    if (flip) {
      out.x = -out.x;
      out.rot = -out.rot;
      out.sx = -out.sx;
    }
    return out;
  }

  /** Гніздо за індексом у `socketIds` (без віддзеркалення) — для `rigsprite.ts`. */
  socketAt(index: number): Readonly<SocketPose> | undefined {
    return this.socketRt[index]?.pose;
  }

  /** Індекс гнізда за id (у `socketIds`); −1 — немає. */
  socketIndexOf(id: string): number {
    return this.socketIndex.get(id) ?? -1;
  }

  /** Якорі скелета. */
  anchorNames(): RigAnchor[] {
    return this.anchorRt.map((a) => a.name);
  }

  // --- Усередині ---

  private compiled(anim: LooseAnim, view: ArtView): CompiledAnim {
    let views = this.anims.get(anim);
    if (!views) {
      const def = this.def as unknown as LooseRig;
      views = ART_VIEWS.map((v) => compileAnim(def, anim, v));
      this.anims.set(anim, views);
    }
    return views[ART_VIEWS.indexOf(view)] ?? views[0]!;
  }

  /** Вихідна поза ракурсу: визначення, перевизначення ракурсу й точки арту. */
  private rebuildSetup(): void {
    this.setupDirty = false;
    const view = this.facingNow.view;
    const setup = (this.def as unknown as LooseRig).views[view];
    const fit = this.fit;
    const p = this.tmpP;
    for (let i = 0; i < this.boneRt.length; i++) {
      const bone = this.boneRt[i]!;
      const over = setup.bones?.[bone.id];
      const s = bone.setup;
      s.x = over?.x ?? bone.def.x;
      s.y = over?.y ?? bone.def.y;
      s.rot = over?.rot ?? bone.def.rot;
      s.len = over?.len ?? bone.def.len;
      (bone as { len: number }).len = s.len;
      const parent = this.boneRt[bone.parent];
      if (this.refWorld(fit?.bones?.[bone.id], view, p)) {
        if (parent) applyInverse(parent.setupWorld, p.x, p.y, p);
        s.x = p.x;
        s.y = p.y;
      }
      if (parent) {
        setTRS(this.tmpM, s.x, s.y, s.rot, 1, 1);
        multiply(parent.setupWorld, this.tmpM, bone.setupWorld);
        bone.setupRot = parent.setupRot + s.rot;
      } else {
        setTRS(bone.setupWorld, s.x, s.y, s.rot, 1, 1);
        bone.setupRot = s.rot;
      }
      bone.setupCos = Math.cos(bone.setupRot * DEG);
      bone.setupSin = Math.sin(bone.setupRot * DEG);

      for (const index of this.slotsOfBone[i] ?? []) {
        const slot = this.slotRt[index]!;
        const so = setup.slots?.[slot.def.id];
        slot.x = so?.x ?? slot.def.x ?? 0;
        slot.y = so?.y ?? slot.def.y ?? 0;
        slot.z = so?.z ?? slot.def.z;
        slot.state = so?.frame !== undefined ? so.frame : slot.def.frame;
        slot.visible = so?.visible ?? true;
        if (this.refWorld(fit?.slots?.[slot.def.id], view, p)) {
          applyInverse(bone.setupWorld, p.x, p.y, p);
          slot.x = p.x;
          slot.y = p.y;
        }
      }
    }
    const anchors = (this.def as unknown as LooseRig).anchors;
    for (const anchor of this.anchorRt) {
      const def = anchors[anchor.name];
      anchor.x = def?.x ?? 0;
      anchor.y = def?.y ?? 0;
      if (this.refWorld(fit?.anchors?.[anchor.name], view, p)) {
        applyInverse(this.boneRt[anchor.bone]!.setupWorld, p.x, p.y, p);
        anchor.x = p.x;
        anchor.y = p.y;
      }
    }
    for (const socket of this.socketRt) {
      socket.x = socket.def.x;
      socket.y = socket.def.y;
      socket.z = setup.sockets?.[socket.id]?.z ?? socket.def.z;
      if (this.refWorld(fit?.sockets?.[socket.id], view, p)) {
        applyInverse(this.boneRt[socket.bone]!.setupWorld, p.x, p.y, p);
        socket.x = p.x;
        socket.y = p.y;
      }
    }
  }

  /**
   * Точка кадру у вихідній позі (система кореня): кадр стоїть як намальований, pivot — у точці слота, тож точка —
   * `pivot слота + (точка − pivot)`. Перша точка, що знайшлася; жодної — false.
   */
  private refWorld(refs: PointRefs<string> | undefined, view: ArtView, out: Vec2): boolean {
    if (refs === undefined || !this.lookup) return false;
    for (const ref of isRefList(refs) ? refs : [refs]) {
      const slot = this.slotRt[this.slotIndex.get(ref.slot) ?? -1];
      const art = this.skinNow[ref.slot];
      if (!slot || !art) continue;
      const entry = this.lookup(art);
      const point = entryPoint(entry, ref.point, view);
      if (!entry || !point) continue;
      apply(this.boneRt[slot.bone]!.setupWorld, slot.x, slot.y, out);
      out.x += point.x - entry.pivot.x;
      out.y += point.y - entry.pivot.y;
      return true;
    }
    return false;
  }

  /** Сортування вставками за (z, порядок визначення): майже завжди вже впорядковано. Повертає, чи порядок змінився. */
  private sortItems(): boolean {
    const items = this.items;
    let changed = false;
    for (let i = 1; i < items.length; i++) {
      const item = items[i]!;
      let j = i - 1;
      while (j >= 0 && before(item, items[j]!)) {
        items[j + 1] = items[j]!;
        j--;
      }
      if (j !== i - 1) {
        items[j + 1] = item;
        changed = true;
      }
    }
    return changed;
  }
}

/** Порядок визначення: слоти, потім гнізда. */
function seq(item: DrawItem): number {
  return item.kind === "slot" ? item.index : 100000 + item.index;
}

function before(a: DrawItem, b: DrawItem): boolean {
  return a.z < b.z || (a.z === b.z && seq(a) < seq(b));
}

/** Скелет у роботі для визначення `R`. */
export type RigOf<R extends AnyRig> = Rig<BoneOf<R>, SlotOf<R>, SocketOf<R>>;
