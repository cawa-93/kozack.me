// Змішування анімацій персонажа нового вигляду (крок 16, T2, `GRAPHICS_PLAN.md`, «Скелети й анімації»): основна анімація
// (чи разова) плюс накладка рук (`PERSON_OVERLAYS`: несе річ, тримає кота) плюс поправки вигляду (очі засинання, схована
// ближня рука, голова хилиться) — в одну анімацію скелета, яку грає `Rig`. Без Phaser.
//
// Як зводиться: накладка рук ЗАМІНЮЄ доріжки основної для кісток, які вона рухає (руки й кисті), — як `personWithArms`
// пакета N4a (`rig/anims/person/move.ts`): інакше розмах рук ходи, ривка чи разової підкидав би річ і кота (накладки N4a —
// нерухомі пози рук). Решта кісток — від основної. Поправки додаються зверху (поворот голови, що хилиться). Доріжки слотів
// (кадр, видимість, z) накладки й поправок перекривають основну. Кожен шар — зі своїм часом: накладка по колу йде за модулем
// своєї тривалості, і зведена має тривалість і повтор основної (або кілька її циклів, якщо інакше накладка рвалася б на
// стику), тож вибір «за поступом» і разові працюють як з основною. Після злиття з N4a можна брати `personWithArms` (ще й
// противага рук нахилу тулуба) — тоді сюди йдуть лише поправки.
//
// Результат кешовано за (основна, накладка, поправки), тож щокадру нічого не створюється, а та сама комбінація — той самий
// об'єкт (`Rig.play` її не перезапускає). Поправки — незмінні об'єкти, яких небагато (`personExtras` у `personlook.ts`):
// їхній ключ рахується раз на об'єкт.
//
// Перевіряє `tests/isopersonmix.test.ts`.

import { ART_VIEWS, type ArtView } from "../art/types";
import { sampleNumber, sampleStep, sampleVec } from "../rig/rigcore";
import type { BoneTracks, Key, RigAnim, RigTracks, SlotTracks, StepKey, Vec2 } from "../rig/types";

type LooseAnim = RigAnim<string, string>;
type LooseTracks = RigTracks<string, string>;

/** Крок перевибірки зведеної доріжки, мс: 30 ключів на секунду — плавно для ходи й рук. */
export const MIX_STEP_MS = 1000 / 30;
/** Скільки циклів основної найбільше, щоб накладка по колу не рвалася на стику. */
const MAX_REPEATS = 6;
/** Похибка стику циклів, мс: менше — не видно. */
const SEAM_MS = 1;

/** Поправки вигляду поверх анімації. Незмінні: ключ кешу рахується раз на об'єкт. */
export interface MixExtras {
  /** Кадри слотів (очі: `half`, `closed`) — перекривають анімацію весь час. */
  readonly frames?: Readonly<Record<string, string>>;
  /** Слоти, яких не видно (ближня рука, коли її малює вигляд). */
  readonly hidden?: readonly string[];
  /**
   * Поворот кісток, що наростає від 0 на початку до значення наприкінці анімації, градуси (голова хилиться, засинаючи:
   * анімація за поступом). Додається до анімації.
   */
  readonly ramp?: Readonly<Record<string, number>>;
}

/** Шар зведення: анімація зі своїм часом. */
interface Layer {
  readonly anim: LooseAnim;
  /** Доріжки кісток шару заміняють доріжки нижчих шарів для тих самих кісток (накладка рук), а не додаються до них. */
  readonly replace: boolean;
  /** Час шару в момент `t` зведеної анімації. */
  readonly time: (t: number) => number;
  /** Час шару збігається з часом зведеної (основна з одним циклом, поправки). */
  readonly aligned: boolean;
}

const NONE = {};
/** Без поправок. */
export const NO_EXTRAS: MixExtras = Object.freeze({});
const MEMO = new WeakMap<object, WeakMap<object, Map<string, LooseAnim>>>();
/** Ключ кешу кожного об'єкта поправок. */
const KEYS = new WeakMap<MixExtras, string>();

/**
 * Основна анімація з накладкою й поправками: без накладки й поправок — сама основна (той самий об'єкт). Однакові входи — той
 * самий результат.
 */
export function mixAnims<B extends string, S extends string>(main: RigAnim<B, S>, overlay: RigAnim<B, S> | null, extras: MixExtras = NO_EXTRAS): RigAnim<B, S> {
  if (!overlay && extras === NO_EXTRAS) return main;
  let key = KEYS.get(extras);
  if (key === undefined) {
    key = extrasKey(extras);
    KEYS.set(extras, key);
  }
  if (!overlay && key === "") return main;
  let byOverlay = MEMO.get(main);
  if (!byOverlay) {
    byOverlay = new WeakMap();
    MEMO.set(main, byOverlay);
  }
  const over: object = overlay ?? NONE;
  let byExtras = byOverlay.get(over);
  if (!byExtras) {
    byExtras = new Map();
    byOverlay.set(over, byExtras);
  }
  let mixed = byExtras.get(key);
  if (!mixed) {
    mixed = buildMix(main as LooseAnim, overlay as LooseAnim | null, extras);
    byExtras.set(key, mixed);
  }
  return mixed as RigAnim<B, S>;
}

/** Ключ поправок для кешу: однакові поправки — однаковий рядок; без поправок — порожній. */
function extrasKey(extras: MixExtras): string {
  const frames = Object.entries(extras.frames ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slot, frame]) => `${slot}=${frame}`)
    .join(",");
  const hidden = [...(extras.hidden ?? [])].sort().join(",");
  const ramp = Object.entries(extras.ramp ?? {})
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bone, v]) => `${bone}=${v}`)
    .join(",");
  return frames === "" && hidden === "" && ramp === "" ? "" : `${frames}|${hidden}|${ramp}`;
}

/**
 * Скільки циклів основної у зведеній: 1, якщо накладка не рухається (сталі доріжки), не йде по колу чи основна разова;
 * інакше — найменше число циклів, за яке накладка теж замикає цикл (не більше `MAX_REPEATS`; без точного — з найменшим
 * стиком).
 */
export function mixRepeats(main: { duration: number; loop: boolean }, overlay: LooseAnim | null): number {
  if (!overlay || !main.loop || !overlay.loop || main.duration <= 0 || overlay.duration <= 0 || !moves(overlay)) return 1;
  let best = 1;
  let bestSeam = Infinity;
  for (let k = 1; k <= MAX_REPEATS; k++) {
    const rest = (main.duration * k) % overlay.duration;
    const seam = Math.min(rest, overlay.duration - rest);
    if (seam < SEAM_MS) return k;
    if (seam < bestSeam - SEAM_MS) {
      best = k;
      bestSeam = seam;
    }
  }
  return best;
}

/** Чи анімація має хоч одну несталу доріжку кістки (у будь-якому ракурсі). */
function moves(anim: LooseAnim): boolean {
  const tracks: (LooseTracks | undefined)[] = [anim, ...ART_VIEWS.map((v) => anim.views?.[v])];
  for (const t of tracks) {
    for (const bone of Object.values(t?.bones ?? {})) {
      if (!bone) continue;
      if ((bone.rot && !constantNumber(bone.rot)) || (bone.pos && !constantVec(bone.pos)) || (bone.scale && !constantVec(bone.scale))) return true;
    }
  }
  return false;
}

function buildMix(main: LooseAnim, overlay: LooseAnim | null, extras: MixExtras): LooseAnim {
  const repeats = mixRepeats(main, overlay);
  const duration = main.duration * repeats;
  const layers: Layer[] = [{ anim: main, replace: false, time: layerTime(main), aligned: repeats === 1 }];
  if (overlay) layers.push({ anim: overlay, replace: true, time: layerTime(overlay), aligned: overlay.duration === duration && overlay.loop === main.loop });
  const extra = extrasAnim(extras, duration, main.loop);
  if (extra) layers.push({ anim: extra, replace: false, time: (t) => t, aligned: true });

  const base = mixTracks(layers, null, duration);
  const out: LooseAnim = { duration, loop: main.loop, ...base };
  const views: Partial<Record<ArtView, LooseTracks>> = {};
  for (const view of ART_VIEWS) {
    if (!layers.some((l) => l.anim.views?.[view])) continue;
    const tracks = mixTracks(layers, view, duration);
    if (tracks.bones || tracks.slots) views[view] = tracks;
  }
  if (Object.keys(views).length > 0) out.views = views;
  return out;
}

/** Час шару: по колу — за модулем його тривалості, разова — до кінця й тримає останній кадр. */
function layerTime(anim: LooseAnim): (t: number) => number {
  const d = anim.duration;
  if (!(d > 0)) return () => 0;
  return anim.loop ? (t) => t % d : (t) => Math.min(t, d);
}

/** Поправки як анімація тієї самої тривалості: сталі кадри й видимість слотів, наростання повороту кісток. */
function extrasAnim(extras: MixExtras, duration: number, loop: boolean): LooseAnim | null {
  const slots: Record<string, SlotTracks> = {};
  for (const [slot, frame] of Object.entries(extras.frames ?? {})) slots[slot] = { ...slots[slot], frame: [{ t: 0, v: frame }] };
  for (const slot of extras.hidden ?? []) slots[slot] = { ...slots[slot], visible: [{ t: 0, v: false }] };
  const bones: Record<string, BoneTracks> = {};
  for (const [bone, deg] of Object.entries(extras.ramp ?? {})) {
    if (deg === 0) continue;
    bones[bone] = {
      rot: [
        { t: 0, v: 0 },
        { t: duration, v: deg },
      ],
    };
  }
  const hasSlots = Object.keys(slots).length > 0;
  const hasBones = Object.keys(bones).length > 0;
  if (!hasSlots && !hasBones) return null;
  return { duration, loop, ...(hasBones ? { bones } : {}), ...(hasSlots ? { slots } : {}) };
}

/** Доріжки шару для ракурсу (`view` null — основні): перевизначення ракурсу замінює основну доріжку тієї самої кістки. */
function boneTrack(anim: LooseAnim, view: ArtView | null, bone: string, channel: keyof BoneTracks): readonly Key<number>[] | readonly Key<Vec2>[] | undefined {
  const over = view ? anim.views?.[view]?.bones?.[bone]?.[channel] : undefined;
  return over ?? anim.bones?.[bone]?.[channel];
}

/** Чи шар рухає кістку (будь-яка доріжка) — в основних доріжках чи в перевизначенні ракурсу `view`. */
function movesBone(anim: LooseAnim, view: ArtView | null, bone: string): boolean {
  const has = (t: BoneTracks | undefined): boolean => Boolean(t?.rot?.length || t?.pos?.length || t?.scale?.length);
  return has(anim.bones?.[bone]) || (view !== null && has(anim.views?.[view]?.bones?.[bone]));
}

/** Шари, що діють на кістку: від найвищого, який її заміняє (накладка рук, що її рухає), догори; інакше — усі. */
function boneLayers(layers: readonly Layer[], view: ArtView | null, bone: string): readonly Layer[] {
  for (let i = layers.length - 1; i > 0; i--) {
    const layer = layers[i]!;
    if (layer.replace && movesBone(layer.anim, view, bone)) return layers.slice(i);
  }
  return layers;
}

function slotTrack(anim: LooseAnim, view: ArtView | null, slot: string, channel: keyof SlotTracks): readonly StepKey<string | boolean | number>[] | undefined {
  const over = view ? anim.views?.[view]?.slots?.[slot]?.[channel] : undefined;
  return (over ?? anim.slots?.[slot]?.[channel]) as readonly StepKey<string | boolean | number>[] | undefined;
}

/**
 * Зведені доріжки для ракурсу `view` (null — основні). Для ракурсу — лише ті кістки й слоти, які хоч один шар
 * перевизначає в ньому (решту `Rig` бере з основних).
 */
function mixTracks(layers: readonly Layer[], view: ArtView | null, duration: number): LooseTracks {
  const boneIds = new Set<string>();
  const slotIds = new Set<string>();
  for (const { anim } of layers) {
    const source = view ? anim.views?.[view] : anim;
    for (const id of Object.keys(source?.bones ?? {})) boneIds.add(id);
    for (const id of Object.keys(source?.slots ?? {})) slotIds.add(id);
  }
  const bones: Record<string, BoneTracks> = {};
  for (const id of boneIds) {
    const tracks: BoneTracks = {};
    const active = boneLayers(layers, view, id);
    // Кістку, яку заміняє накладка, перевизначення ракурсу основної вже не чіпає: без доріжки ракурсу `Rig` бере основну
    // зведену доріжку — накладку.
    for (const channel of ["rot", "pos", "scale"] as const) {
      const own = view ? active.some((l) => l.anim.views?.[view]?.bones?.[id]?.[channel]) : true;
      if (!own) continue;
      const parts = active.flatMap((layer) => {
        const keys = boneTrack(layer.anim, view, id, channel);
        return keys && keys.length > 0 ? [{ layer, keys }] : [];
      });
      if (parts.length === 0) continue;
      if (channel === "rot") tracks.rot = mixNumbers(parts as { layer: Layer; keys: readonly Key<number>[] }[], duration);
      else tracks[channel] = mixVecs(parts as { layer: Layer; keys: readonly Key<Vec2>[] }[], duration, channel === "scale");
    }
    if (Object.keys(tracks).length > 0) bones[id] = tracks;
  }
  const slots: Record<string, SlotTracks> = {};
  for (const id of slotIds) {
    const tracks: SlotTracks = {};
    for (const channel of ["frame", "visible", "z"] as const) {
      const own = view ? layers.some((l) => l.anim.views?.[view]?.slots?.[id]?.[channel]) : true;
      if (!own) continue;
      // Пізніший шар перекриває ранішій (накладка — основну, поправки — обидві).
      let top: { layer: Layer; keys: readonly StepKey<string | boolean | number>[] } | null = null;
      for (const layer of layers) {
        const keys = slotTrack(layer.anim, view, id, channel);
        if (keys && keys.length > 0) top = { layer, keys };
      }
      if (!top) continue;
      (tracks as Record<string, unknown>)[channel] = top.layer.aligned ? top.keys : stepResample(top.layer, top.keys, duration);
    }
    if (Object.keys(tracks).length > 0) slots[id] = tracks;
  }
  return {
    ...(Object.keys(bones).length > 0 ? { bones } : {}),
    ...(Object.keys(slots).length > 0 ? { slots } : {}),
  };
}

/** Числова доріжка — сума доріжок шарів (повороти). */
function mixNumbers(parts: readonly { layer: Layer; keys: readonly Key<number>[] }[], duration: number): Key<number>[] | readonly Key<number>[] {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only && only.layer.aligned) return only.keys;
  if (parts.every((p) => constantNumber(p.keys))) return [{ t: 0, v: parts.reduce((sum, p) => sum + (p.keys[0]?.v ?? 0), 0) }];
  // Одна рухома доріжка з часом зведеної, решта — сталі: ті самі ключі (з їхніми переходами), зсунуті на сталу.
  const moving = parts.filter((p) => !constantNumber(p.keys));
  const lone = moving.length === 1 ? moving[0] : undefined;
  if (lone && lone.layer.aligned) {
    const shift = parts.reduce((sum, p) => (p === lone ? sum : sum + (p.keys[0]?.v ?? 0)), 0);
    return lone.keys.map((k) => ({ ...k, v: k.v + shift }));
  }
  return resampleTimes(parts, duration).map((t) => ({ t, v: parts.reduce((sum, p) => sum + sampleNumber(p.keys, p.layer.time(t)), 0) }));
}

/** Доріжка векторів — сума (положення) чи добуток (масштаб) доріжок шарів. */
function mixVecs(parts: readonly { layer: Layer; keys: readonly Key<Vec2>[] }[], duration: number, product: boolean): Key<Vec2>[] | readonly Key<Vec2>[] {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only && only.layer.aligned) return only.keys;
  const combine = (values: readonly Vec2[]): Vec2 =>
    values.reduce((acc, v) => (product ? { x: acc.x * v.x, y: acc.y * v.y } : { x: acc.x + v.x, y: acc.y + v.y }), product ? { x: 1, y: 1 } : { x: 0, y: 0 });
  if (parts.every((p) => constantVec(p.keys))) return [{ t: 0, v: combine(parts.map((p) => p.keys[0]?.v ?? (product ? { x: 1, y: 1 } : { x: 0, y: 0 }))) }];
  const moving = parts.filter((p) => !constantVec(p.keys));
  const lone = moving.length === 1 ? moving[0] : undefined;
  if (lone && lone.layer.aligned) {
    const rest = combine(parts.filter((p) => p !== lone).map((p) => p.keys[0]?.v ?? (product ? { x: 1, y: 1 } : { x: 0, y: 0 })));
    return lone.keys.map((k) => ({ ...k, v: product ? { x: k.v.x * rest.x, y: k.v.y * rest.y } : { x: k.v.x + rest.x, y: k.v.y + rest.y } }));
  }
  const tmp: Vec2 = { x: 0, y: 0 };
  return resampleTimes(parts, duration).map((t) => ({ t, v: combine(parts.map((p) => ({ ...sampleVec(p.keys, p.layer.time(t), tmp) }))) }));
}

/** Доріжка слота шару з іншим часом: ключі на кожному її повторі в межах зведеної. */
function stepResample<V>(layer: Layer, keys: readonly StepKey<V>[], duration: number): StepKey<V>[] {
  const out: StepKey<V>[] = [];
  for (const t of resampleTimes([{ layer, keys }], duration)) {
    const v = sampleStep(keys, layer.time(t));
    if (v === undefined) continue;
    const last = out.at(-1);
    if (!last || last.v !== v) out.push({ t, v });
  }
  return out;
}

/**
 * Моменти перевибірки: 0, кінець, ключі кожного шару на кожному його повторі й рівномірна сітка `MIX_STEP_MS` — переходи
 * (`inOut` тощо) стають лінійними відрізками, яких на око не видно.
 */
function resampleTimes(parts: readonly { layer: Layer; keys: readonly { t: number }[] }[], duration: number): number[] {
  const times = new Set<number>([0, duration]);
  const steps = Math.max(1, Math.ceil(duration / MIX_STEP_MS));
  for (let i = 1; i < steps; i++) times.add((duration * i) / steps);
  for (const { layer, keys } of parts) {
    const d = layer.anim.duration;
    const period = layer.anim.loop && d > 0 ? d : Infinity;
    for (let start = 0; start <= duration; start += period) {
      for (const key of keys) {
        const t = start + key.t;
        if (t >= 0 && t <= duration) times.add(t);
      }
      if (period === Infinity) break;
    }
  }
  return [...times].sort((a, b) => a - b);
}

function constantNumber(keys: readonly Key<number>[]): boolean {
  const first = keys[0];
  return first === undefined || keys.every((k) => k.v === first.v);
}

function constantVec(keys: readonly Key<Vec2>[]): boolean {
  const first = keys[0];
  return first === undefined || keys.every((k) => k.v.x === first.v.x && k.v.y === first.v.y);
}
