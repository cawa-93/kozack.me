// Поправки вигляду персонажа поверх анімації (крок 16, T2, `GRAPHICS_PLAN.md`, «Скелети й анімації»): очі засинання, схована
// ближня рука (її малює вигляд, коли персонаж гладить) і голова, що хилиться, — в одну анімацію скелета, яку грає `Rig`. Без
// Phaser.
//
// Накладку рук (несе річ, тримає кота) тут уже не зводять: її кладе `personWithArms` пакета N4a
// (`rig/anims/person/move.ts`) — вона ЗАМІНЮЄ доріжки рук і кистей основної (розмах рук ходи, ривка чи разової не
// підкидає ні річ, ні кота) і ще тримає руки з річчю проти нахилу тулуба (противага), а анімації, що ведуть руки самі
// (`PERSON_OWN_ARMS`), лишає як є. Сюди приходить уже її результат (`iso/person.ts`). Поправки додаються зверху (поворот
// голови, що хилиться), а доріжки слотів поправок (кадр очей, видимість) перекривають анімацію. Поправки мають час самої
// анімації, тож вибір «за поступом» і разові працюють як з основною.
//
// Результат кешовано за (анімація, поправки), тож щокадру нічого не створюється, а та сама комбінація — той самий об'єкт
// (`Rig.play` її не перезапускає). Поправки — незмінні об'єкти, яких небагато (`personExtras` у `personlook.ts`): їхній ключ
// рахується раз на об'єкт.
//
// Перевіряє `tests/isopersonmix.test.ts`.

import { ART_VIEWS, type ArtView } from "../art/types";
import { sampleNumber, sampleVec } from "../rig/rigcore";
import type { BoneTracks, Key, RigAnim, RigTracks, SlotTracks, StepKey, Vec2 } from "../rig/types";

type LooseAnim = RigAnim<string, string>;
type LooseTracks = RigTracks<string, string>;

/** Крок перевибірки зведеної доріжки, мс: 30 ключів на секунду — плавно для ходи й рук. */
export const MIX_STEP_MS = 1000 / 30;

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

/** Без поправок. */
export const NO_EXTRAS: MixExtras = Object.freeze({});
const MEMO = new WeakMap<object, Map<string, LooseAnim>>();
/** Ключ кешу кожного об'єкта поправок. */
const KEYS = new WeakMap<MixExtras, string>();

/**
 * Анімація (основна чи разова — уже з накладкою рук, `personWithArms`) з поправками вигляду: без поправок — сама анімація
 * (той самий об'єкт). Однакові входи — той самий результат.
 */
export function mixAnims<B extends string, S extends string>(main: RigAnim<B, S>, extras: MixExtras = NO_EXTRAS): RigAnim<B, S> {
  if (extras === NO_EXTRAS) return main;
  let key = KEYS.get(extras);
  if (key === undefined) {
    key = extrasKey(extras);
    KEYS.set(extras, key);
  }
  if (key === "") return main;
  let byExtras = MEMO.get(main);
  if (!byExtras) {
    byExtras = new Map();
    MEMO.set(main, byExtras);
  }
  let mixed = byExtras.get(key);
  if (!mixed) {
    mixed = buildMix(main as LooseAnim, extras);
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

function buildMix(main: LooseAnim, extras: MixExtras): LooseAnim {
  const extra = extrasAnim(extras, main.duration, main.loop);
  if (!extra) return main;
  const layers: readonly LooseAnim[] = [main, extra];
  const out: LooseAnim = { duration: main.duration, loop: main.loop, ...mixTracks(layers, null, main.duration) };
  const views: Partial<Record<ArtView, LooseTracks>> = {};
  for (const view of ART_VIEWS) {
    if (!layers.some((l) => l.views?.[view])) continue;
    const tracks = mixTracks(layers, view, main.duration);
    if (tracks.bones || tracks.slots) views[view] = tracks;
  }
  if (Object.keys(views).length > 0) out.views = views;
  return out;
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

/** Доріжка шару для ракурсу (`view` null — основні): перевизначення ракурсу замінює основну доріжку тієї самої кістки. */
function boneTrack(anim: LooseAnim, view: ArtView | null, bone: string, channel: keyof BoneTracks): readonly Key<number>[] | readonly Key<Vec2>[] | undefined {
  const over = view ? anim.views?.[view]?.bones?.[bone]?.[channel] : undefined;
  return over ?? anim.bones?.[bone]?.[channel];
}

function slotTrack(anim: LooseAnim, view: ArtView | null, slot: string, channel: keyof SlotTracks): readonly StepKey<string | boolean | number>[] | undefined {
  const over = view ? anim.views?.[view]?.slots?.[slot]?.[channel] : undefined;
  return (over ?? anim.slots?.[slot]?.[channel]) as readonly StepKey<string | boolean | number>[] | undefined;
}

/**
 * Зведені доріжки для ракурсу `view` (null — основні): анімація й поправки з тим самим часом. Для ракурсу — лише ті кістки
 * й слоти, які хоч один шар перевизначає в ньому (решту `Rig` бере з основних).
 */
function mixTracks(layers: readonly LooseAnim[], view: ArtView | null, duration: number): LooseTracks {
  const boneIds = new Set<string>();
  const slotIds = new Set<string>();
  for (const anim of layers) {
    const source = view ? anim.views?.[view] : anim;
    for (const id of Object.keys(source?.bones ?? {})) boneIds.add(id);
    for (const id of Object.keys(source?.slots ?? {})) slotIds.add(id);
  }
  const bones: Record<string, BoneTracks> = {};
  for (const id of boneIds) {
    const tracks: BoneTracks = {};
    for (const channel of ["rot", "pos", "scale"] as const) {
      const own = view ? layers.some((l) => l.views?.[view]?.bones?.[id]?.[channel]) : true;
      if (!own) continue;
      const parts = layers.flatMap((anim) => {
        const keys = boneTrack(anim, view, id, channel);
        return keys && keys.length > 0 ? [keys] : [];
      });
      if (parts.length === 0) continue;
      if (channel === "rot") tracks.rot = mixNumbers(parts as (readonly Key<number>[])[], duration);
      else tracks[channel] = mixVecs(parts as (readonly Key<Vec2>[])[], duration, channel === "scale");
    }
    if (Object.keys(tracks).length > 0) bones[id] = tracks;
  }
  const slots: Record<string, SlotTracks> = {};
  for (const id of slotIds) {
    const tracks: SlotTracks = {};
    for (const channel of ["frame", "visible", "z"] as const) {
      const own = view ? layers.some((l) => l.views?.[view]?.slots?.[id]?.[channel]) : true;
      if (!own) continue;
      // Пізніший шар перекриває ранішій (поправки — анімацію).
      let top: readonly StepKey<string | boolean | number>[] | null = null;
      for (const anim of layers) {
        const keys = slotTrack(anim, view, id, channel);
        if (keys && keys.length > 0) top = keys;
      }
      if (top) (tracks as Record<string, unknown>)[channel] = top;
    }
    if (Object.keys(tracks).length > 0) slots[id] = tracks;
  }
  return {
    ...(Object.keys(bones).length > 0 ? { bones } : {}),
    ...(Object.keys(slots).length > 0 ? { slots } : {}),
  };
}

/** Числова доріжка — сума доріжок шарів (повороти). */
function mixNumbers(parts: readonly (readonly Key<number>[])[], duration: number): readonly Key<number>[] {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only) return only;
  if (parts.every(constantNumber)) return [{ t: 0, v: parts.reduce((sum, p) => sum + (p[0]?.v ?? 0), 0) }];
  // Одна рухома доріжка, решта — сталі: ті самі ключі (з їхніми переходами), зсунуті на сталу.
  const moving = parts.filter((p) => !constantNumber(p));
  const lone = moving.length === 1 ? moving[0] : undefined;
  if (lone) {
    const shift = parts.reduce((sum, p) => (p === lone ? sum : sum + (p[0]?.v ?? 0)), 0);
    return lone.map((k) => ({ ...k, v: k.v + shift }));
  }
  return resampleTimes(parts, duration).map((t) => ({ t, v: parts.reduce((sum, p) => sum + sampleNumber(p, t), 0) }));
}

/** Доріжка векторів — сума (положення) чи добуток (масштаб) доріжок шарів. */
function mixVecs(parts: readonly (readonly Key<Vec2>[])[], duration: number, product: boolean): readonly Key<Vec2>[] {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only) return only;
  const unit: Vec2 = product ? { x: 1, y: 1 } : { x: 0, y: 0 };
  const combine = (values: readonly Vec2[]): Vec2 =>
    values.reduce((acc, v) => (product ? { x: acc.x * v.x, y: acc.y * v.y } : { x: acc.x + v.x, y: acc.y + v.y }), unit);
  if (parts.every(constantVec)) return [{ t: 0, v: combine(parts.map((p) => p[0]?.v ?? unit)) }];
  const moving = parts.filter((p) => !constantVec(p));
  const lone = moving.length === 1 ? moving[0] : undefined;
  if (lone) {
    const rest = combine(parts.filter((p) => p !== lone).map((p) => p[0]?.v ?? unit));
    return lone.map((k) => ({ ...k, v: product ? { x: k.v.x * rest.x, y: k.v.y * rest.y } : { x: k.v.x + rest.x, y: k.v.y + rest.y } }));
  }
  const tmp: Vec2 = { x: 0, y: 0 };
  return resampleTimes(parts, duration).map((t) => ({ t, v: combine(parts.map((p) => ({ ...sampleVec(p, t, tmp) }))) }));
}

/**
 * Моменти перевибірки: 0, кінець, ключі кожного шару й рівномірна сітка `MIX_STEP_MS` — переходи (`inOut` тощо) стають
 * лінійними відрізками, яких на око не видно.
 */
function resampleTimes(parts: readonly (readonly { t: number }[])[], duration: number): number[] {
  const times = new Set<number>([0, duration]);
  const steps = Math.max(1, Math.ceil(duration / MIX_STEP_MS));
  for (let i = 1; i < steps; i++) times.add((duration * i) / steps);
  for (const keys of parts) for (const key of keys) if (key.t >= 0 && key.t <= duration) times.add(key.t);
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
