// Що грає скелет кота ізометричного вигляду (крок 16, T1): основна анімація, накладка й обличчя — в одній анімації скелета,
// бо `Rig` грає одну (`rigcore.ts`). Чисті розрахунки без Phaser (`tests/isocats.test.ts`).
//
// - Накладка (`CAT_OVERLAYS`, `anim/ids.ts`), спершу підігнана під основу (`catOverlayOn`, N3), додається до основної:
//   `rot` і `pos` — сумою, `scale` — добутком, доріжки слотів накладки замінюють доріжки основної. Доріжка, яку має лише одна
//   з двох, переноситься ключ у ключ (по колу — стільки разів, скільки треба на спільний період); доріжка, яку мають обидві, —
//   сума, вибрана з кроком `SAMPLE_MS`.
// - Обличчя (`catFace`): стани кадрів очей і рота — сталими доріжками слотів, якщо анімація їх не має (чхання має свої), і
//   поворот кісток вух (`EAR_POSES`, `catrig.ts`) — сталими доріжками кісток вух у кожному ракурсі.
// - Живіт вагітної (слот `belly` скелета гри, `catrig.ts`): анімації `CAT_ANIMS` про нього не знають, тож те, що вони роблять
//   із тулубом (ховають під ковдрою, міняють z), складена анімація повторює для живота (`withBelly`).
//
// Складені анімації кешуються (основна → накладка → обличчя), тож щокадру нічого не створюється, а `Rig` компілює кожну раз.

import type { CatEars } from "../anim/catface";
import { ART_VIEWS, type ArtView } from "../art/types";
import { catBlendMs } from "../rig/anims/cat/basic";
import { catOverlayOn } from "../rig/anims/cat/feelings";
import { animTime, BLEND_MS, sampleNumber, sampleVec } from "../rig/rigcore";
import type { BoneTracks, Key, RigAnim, RigTracks, SlotTracks, StepKey, Vec2 } from "../rig/types";
import { BELLY_ABOVE, EAR_BONES, EAR_POSES } from "./catrig";

type Loose = RigAnim<string, string>;
type CatAnim = Parameters<typeof catOverlayOn>[0];
type LooseTracks = RigTracks<string, string>;

/** Крок вибірки суми двох доріжок, мс: 30 разів на секунду — між ключами лінійно, на око не відрізнити. */
export const SAMPLE_MS = 1000 / 30;
/**
 * Найдовший спільний період основної й накладки по колу, мс. Довший (тривалості майже взаємно прості) — період дорівнює
 * довшій із двох, і коротша наприкінці періоду перестрибує на початок: це раз на кілька секунд і в накладці, що ледь рухає
 * хвостом, не видно, а доріжки лишаються короткими (`Rig` шукає ключ перебором).
 */
export const MAX_PERIOD = 6000;

/** Скільки триває анімація з накладкою і чи по колу. */
export function layeredTiming(base: Pick<Loose, "duration" | "loop">, overlay: Pick<Loose, "duration" | "loop">): { duration: number; loop: boolean } {
  // Разова накладка (шипіння, чхання, задишка) — на свій час поверх основної; далі вигляд повертається до основної.
  if (!overlay.loop) return { duration: base.loop ? overlay.duration : Math.max(base.duration, overlay.duration), loop: false };
  if (!base.loop) return { duration: base.duration, loop: false };
  const period = lcm(Math.round(base.duration), Math.round(overlay.duration));
  return { duration: period <= MAX_PERIOD ? period : Math.max(base.duration, overlay.duration), loop: true };
}

/** Основна анімація з накладкою поверх (див. початок файлу); без накладки — сама основна. */
export function layerAnims(base: Loose, overlay: Loose | null): Loose {
  if (!overlay) return base;
  const timing = layeredTiming(base, overlay);
  const views: Partial<Record<ArtView, LooseTracks>> = {};
  for (const view of ART_VIEWS) views[view] = layerTracks(effective(base, view), base, effective(overlay, view), overlay, timing.duration);
  return { duration: timing.duration, loop: timing.loop, views };
}

/**
 * Живіт вагітної за тулубом: доріжка видимості тулуба — і живота (ковдра ховає тулуб — і живіт), доріжка z тулуба — z
 * живота на `BELLY_ABOVE` вище. Анімація, що тулуба не чіпає, — та сама (той самий об'єкт).
 */
export function withBelly(anim: Loose): Loose {
  if (!ART_VIEWS.some((view) => touchesBody(anim, view))) return anim;
  const views: Partial<Record<ArtView, LooseTracks>> = {};
  for (const view of ART_VIEWS) {
    const own = effective(anim, view);
    const body = own.slots.body;
    const slots: Record<string, SlotTracks> = { ...own.slots };
    if (body?.visible || body?.z) {
      slots.belly = {
        ...own.slots.belly,
        ...(body.visible ? { visible: body.visible } : {}),
        ...(body.z ? { z: body.z.map((k) => ({ t: k.t, v: k.v + BELLY_ABOVE })) } : {}),
      };
    }
    views[view] = { bones: own.bones, slots };
  }
  return { duration: anim.duration, loop: anim.loop, views };
}

/** Чи анімація в ракурсі має доріжки видимості чи z тулуба. */
function touchesBody(anim: Loose, view: ArtView): boolean {
  const body = { ...anim.slots?.body, ...anim.views?.[view]?.slots?.body };
  return body.visible !== undefined || body.z !== undefined;
}

/** Кадри обличчя для анімації: стани очей і рота, вуха. */
export interface FaceFrames {
  eyes: string;
  mouth: string;
  ears: CatEars;
}

/**
 * Обличчя поверх анімації: стани очей і рота — якщо анімація в ракурсі не має своїх доріжок цих слотів; вуха — поворот і
 * висота кісток вух за `EAR_POSES` (анімації `CAT_ANIMS` кісток вух не знають).
 */
export function withFace(anim: Loose, face: FaceFrames): Loose {
  const views: Partial<Record<ArtView, LooseTracks>> = {};
  for (const view of ART_VIEWS) {
    const own = effective(anim, view);
    const slots: Record<string, SlotTracks> = { ...own.slots };
    if (!own.slots.eyes?.frame) slots.eyes = { ...own.slots.eyes, frame: [{ t: 0, v: face.eyes }] };
    if (!own.slots.mouth?.frame) slots.mouth = { ...own.slots.mouth, frame: [{ t: 0, v: face.mouth }] };
    const bones: Record<string, BoneTracks> = { ...own.bones };
    for (const ear of EAR_BONES) {
      const pose = EAR_POSES[face.ears][view][ear];
      const tracks: { rot?: Key<number>[]; scale?: Key<Vec2>[] } = {};
      if (pose.rot !== 0) tracks.rot = [{ t: 0, v: pose.rot }];
      if (pose.scale !== 1) tracks.scale = [{ t: 0, v: { x: 1, y: pose.scale } }];
      if (tracks.rot || tracks.scale) bones[ear] = { ...own.bones[ear], ...tracks };
    }
    views[view] = { bones, slots };
  }
  return { duration: anim.duration, loop: anim.loop, views };
}

/** Основна з накладкою (вибірка суми — найдорожче) і її варіанти з обличчями: обличчя → вуха → рот → очі. */
interface Layered {
  anim: Loose;
  faces: Map<string, Map<string, Map<string, Loose>>>;
}

const cache = new WeakMap<Loose, Map<Loose | null, Layered>>();

/**
 * Що грати котові: основна, накладка (null — без неї) й обличчя — одна анімація, та сама для тих самих трьох (кеш), тож
 * `RigSprite.play` з нею нічого не робить, поки нічого не змінилося. Основна з накладкою складається раз на пару (вибірка
 * суми — найдорожче), а нове обличчя (кліпання, рот, вуха) лише кладе сталі доріжки поверх готової. Ключі — самі рядки
 * станів, без склеювання, тож щокадру нічого не створюється.
 */
export function composeCatAnim(base: Loose, overlay: Loose | null, face: FaceFrames): Loose {
  let byOverlay = cache.get(base);
  if (!byOverlay) {
    byOverlay = new Map();
    cache.set(base, byOverlay);
  }
  let layered = byOverlay.get(overlay);
  if (!layered) {
    // Накладку почуттів спершу підганяє під основу пакет N3 (`catOverlayOn`): на спині хвіст б'є над підлогою, на руках
    // «пручається» брикає лапами, що звисають, а «терпить» сіпає ширше; для тієї самої пари — той самий об'єкт.
    const fitted = overlay === null ? null : (catOverlayOn(overlay as CatAnim, base as CatAnim) as Loose);
    layered = { anim: withBelly(layerAnims(base, fitted)), faces: new Map() };
    byOverlay.set(overlay, layered);
  }
  let byMouth = layered.faces.get(face.ears);
  if (!byMouth) {
    byMouth = new Map();
    layered.faces.set(face.ears, byMouth);
  }
  let byEyes = byMouth.get(face.mouth);
  if (!byEyes) {
    byEyes = new Map();
    byMouth.set(face.mouth, byEyes);
  }
  let anim = byEyes.get(face.eyes);
  if (!anim) {
    // Обличчя кладеться і на основну, і на накладку разом: так доріжки очей разової накладки (чхання) перекривають його.
    anim = withFace(layered.anim, face);
    byEyes.set(face.eyes, anim);
  }
  return anim;
}

/** Що грає кіт — для вибору змішування поз (`playBlend`): основна, накладка (до складання) і вуха. */
export interface PlayKey {
  readonly base: Loose;
  readonly overlay: Loose | null;
  readonly ears: string;
}

/**
 * Змішування поз (мс), коли кіт переходить від `prev` до `next`. Та сама основна й накладка (і не разова заново) — фаза та
 * сама: без змішування, лише вуха — з коротким (`BLEND_MS`); кліпання міняє очі кілька разів на секунду. Інша — як каже
 * `catBlendMs` пакета N1: на спину й зі спини (`belly`, `roll` — дзеркало таза) одним кадром, бо змішування вело б масштаб
 * таза через нуль і посередині кіт сплющився б у смужку й зник; решта — `BLEND_MS`.
 */
export function playBlend(prev: PlayKey | null, next: PlayKey, restart = false): number {
  if (!restart && prev !== null && prev.base === next.base && prev.overlay === next.overlay) return prev.ears !== next.ears ? BLEND_MS : 0;
  return catBlendMs(prev?.base ?? null, next.base, BLEND_MS);
}

// --- Усередині ----------------------------------------------------------------------------------

/** Доріжки анімації в ракурсі: основні з перевизначеннями ракурсу (доріжка ракурсу замінює ту саму доріжку). */
interface Effective {
  bones: Record<string, BoneTracks>;
  slots: Record<string, SlotTracks>;
}

function effective(anim: Loose, view: ArtView): Effective {
  const over = anim.views?.[view];
  const bones: Record<string, BoneTracks> = {};
  for (const [id, tracks] of Object.entries(anim.bones ?? {})) if (tracks) bones[id] = { ...tracks };
  for (const [id, tracks] of Object.entries(over?.bones ?? {})) if (tracks) bones[id] = { ...bones[id], ...tracks };
  const slots: Record<string, SlotTracks> = {};
  for (const [id, tracks] of Object.entries(anim.slots ?? {})) if (tracks) slots[id] = { ...tracks };
  for (const [id, tracks] of Object.entries(over?.slots ?? {})) if (tracks) slots[id] = { ...slots[id], ...tracks };
  return { bones, slots };
}

type Timed = Pick<Loose, "duration" | "loop">;

function layerTracks(base: Effective, baseTime: Timed, over: Effective, overTime: Timed, duration: number): LooseTracks {
  const bones: Record<string, BoneTracks> = {};
  for (const id of new Set([...Object.keys(base.bones), ...Object.keys(over.bones)])) {
    const a = base.bones[id] ?? {};
    const b = over.bones[id] ?? {};
    const out: { rot?: Key<number>[]; pos?: Key<Vec2>[]; scale?: Key<Vec2>[] } = {};
    const rot = combine(a.rot, baseTime, b.rot, overTime, duration, (x, y) => x + y, (keys, t) => sampleNumber(keys, t));
    if (rot) out.rot = rot;
    const pos = combine(a.pos, baseTime, b.pos, overTime, duration, (x, y) => ({ x: x.x + y.x, y: x.y + y.y }), sampleVector);
    if (pos) out.pos = pos;
    const scale = combine(a.scale, baseTime, b.scale, overTime, duration, (x, y) => ({ x: x.x * y.x, y: x.y * y.y }), sampleVector);
    if (scale) out.scale = scale;
    bones[id] = out;
  }
  const slots: Record<string, SlotTracks> = {};
  for (const id of new Set([...Object.keys(base.slots), ...Object.keys(over.slots)])) {
    const a = base.slots[id] ?? {};
    const b = over.slots[id] ?? {};
    const pick = <V>(x: readonly StepKey<V>[] | undefined, y: readonly StepKey<V>[] | undefined): StepKey<V>[] | undefined =>
      y ? repeatStep(y, overTime, duration) : x ? repeatStep(x, baseTime, duration) : undefined;
    const frame = pick(a.frame, b.frame);
    const visible = pick(a.visible, b.visible);
    const z = pick(a.z, b.z);
    slots[id] = { ...(frame ? { frame } : {}), ...(visible ? { visible } : {}), ...(z ? { z } : {}) };
  }
  return { bones, slots };
}

function sampleVector(keys: readonly Key<Vec2>[], t: number): Vec2 {
  return sampleVec(keys, t, { x: 0, y: 0 });
}

/**
 * Доріжка анімації з накладкою: є лише в одній — її ключі на весь період; в обох — вибірка суми (`join`) з кроком
 * `SAMPLE_MS`, кожна у своєму часі (по колу — за модулем своєї тривалості).
 */
function combine<V>(
  a: readonly Key<V>[] | undefined,
  at: Timed,
  b: readonly Key<V>[] | undefined,
  bt: Timed,
  duration: number,
  join: (x: V, y: V) => V,
  sample: (keys: readonly Key<V>[], t: number) => V,
): Key<V>[] | undefined {
  if (!a && !b) return undefined;
  if (!b) return repeat(a!, at, duration, sample);
  if (!a) return repeat(b, bt, duration, sample);
  const out: Key<V>[] = [];
  const steps = Math.max(1, Math.ceil(duration / SAMPLE_MS));
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(duration, i * SAMPLE_MS);
    out.push({ t, v: join(sample(a, local(at, t)), sample(b, local(bt, t))) });
  }
  return out;
}

/** Час складової в момент `t` спільної анімації. */
function local(anim: Timed, t: number): number {
  // Кінець періоду по колу — це кінець циклу складової, а не її початок (`animTime` дав би 0).
  if (anim.loop && t > 0 && t % anim.duration === 0) return anim.duration;
  return animTime(anim.duration, anim.loop, t);
}

/**
 * Ключі доріжки на `duration` мс: разова — як є (після кінця тримає останній); по колу — повтори, і так, що між повторами
 * значення те саме, що дала б сама доріжка: до першого ключа циклу — перший, після останнього — останній до кінця циклу.
 */
function repeat<V>(keys: readonly Key<V>[], anim: Timed, duration: number, sample: (keys: readonly Key<V>[], t: number) => V): Key<V>[] {
  const copies = anim.loop ? Math.ceil(duration / anim.duration - 1e-9) : 1;
  if (keys.length === 0) return [];
  if (copies <= 1) {
    // Довша за спільну анімацію (разова накладка на коротшій основній) — обрізана, з ключем у кінці.
    if (keys[keys.length - 1]!.t <= duration) return [...keys];
    return [...keys.filter((key) => key.t < duration), { t: duration, v: sample(keys, local(anim, duration)) }];
  }
  const first = keys[0]!;
  const cycle: Key<V>[] = [...keys];
  if (first.t > 0) cycle.unshift({ t: 0, v: first.v, ease: "step" });
  const last = cycle[cycle.length - 1]!;
  if (last.t < anim.duration) cycle[cycle.length - 1] = { ...last, ease: "step" };
  const out: Key<V>[] = [];
  for (let k = 0; k < copies; k++) {
    const shift = k * anim.duration;
    for (const key of cycle) if (key.t + shift <= duration + 1e-6) out.push({ ...key, t: Math.min(duration, key.t + shift) });
  }
  return out;
}

/** Те саме для доріжок слотів (значення тримається до наступного ключа). */
function repeatStep<V>(keys: readonly StepKey<V>[], anim: Timed, duration: number): StepKey<V>[] {
  const copies = anim.loop ? Math.ceil(duration / anim.duration - 1e-9) : 1;
  if (keys.length === 0) return [];
  if (copies <= 1) {
    const kept = keys.filter((key) => key.t <= duration);
    return kept.length > 0 ? kept : [{ t: 0, v: keys[0]!.v }];
  }
  const first = keys[0]!;
  const cycle: StepKey<V>[] = first.t > 0 ? [{ t: 0, v: first.v }, ...keys] : [...keys];
  const out: StepKey<V>[] = [];
  for (let k = 0; k < copies; k++) {
    const shift = k * anim.duration;
    for (const key of cycle) if (key.t + shift <= duration + 1e-6) out.push({ t: Math.min(duration, key.t + shift), v: key.v });
  }
  return out;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) [x, y] = [y, x % y];
  return x;
}

function lcm(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Math.max(a, b);
  return (a / gcd(a, b)) * b;
}
