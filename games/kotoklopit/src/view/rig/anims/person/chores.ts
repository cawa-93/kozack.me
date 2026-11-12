// Анімації персонажа — справи (крок 16, хвиля 2, пакет N4b; назви й що кожна означає — `anim/ids.ts`, `PERSON_ANIM_GROUPS.chores`;
// де й коли їх обирають — `anim/personanim.ts`, де персонаж стоїть чи сидить біля речі — `world/objects.ts`).
//
// Формат — `rig/types.ts`: доріжки відносно вихідної пози ракурсу (кут у градусах за годинниковою, y донизу). Тут анімації
// задано позами в ключові моменти (`Beat`): поза — поправки кісток, а з послідовності поз збираються доріжки. Між ключами —
// м'який перехід (`inOut`), тож рух розганяється й гальмує, як живий.
//
// Скелет персонажа не має ліктів і колін: рука й нога — один кадр. Тому:
// - сидить — ближнє стегно горизонтально вперед (на ньому коліна — гніздо `lap`), а гомілку до підлоги показує дальня нога,
//   що висить від коліна (дальню ногу сидячи й так видно за ближньою); ближній черевик схований;
// - тягнеться до близького — рука вкорочена вздовж себе (рука, що йде вглиб чи до камери, у ракурсі ¾ і так коротшає);
// - до підлоги — нахиляється в стегнах, а ноги стоять прямо (присісти без колін не можна).
//
// Ракурс ¾ має глибину: руки тягнуться до точки «на f попереду, на висоті h, на n убік» (`Space.at`, `Space.reach`), а
// проєкція ракурсу кладе її на екран — у ¾ ззаду те, що попереду, вище на екрані, у ¾ спереду — нижче. Тому доріжки рук і ніг
// рахуються для кожного ракурсу окремо: основні — для ¾ спереду, перевизначення — для ¾ ззаду (`views.back`). Більшість справ
// персонаж робить спиною до камери (комп'ютер, стіл, кухня, ванна, ліжко), тож їх підганяли передусім за ¾ ззаду; у ¾ спереду
// ближня рука, що тягнеться вперед, перетинає груди — тому там тіло нахиляється більше, а кулак іде далі вперед і до дальнього
// боку, за силует тулуба (`forward`), до рота рука підходить лише під підборіддя, а біля дверей (персонаж дивиться до камери)
// до ручки тягнеться дальня.
//
// Ноги стоять: де таз зсувається (нахил, сидіння, падіння), кути ніг рахує `stance` — ступні лишаються на своїх місцях на
// підлозі, а стопи — рівно. Річ у руках (гніздо `held` на кисті ближньої руки) кисть тримає рівно (`level`): тарілка не
// перекидається.
//
// Руки справ — власні: накладки рук (`carry`, `holdCat`) справи не беруть (`PERSON_OWN_ARMS`), тож річ і кіт тримаються в
// гнізді так, як ведуть руки справи. Стики з накладками — у позах накладок (`CARRY`, `HOLD` — з `move.ts`, N4a: `personArmsPose`):
// «бере» закінчується позою «несе», «кладе» й «викидає» з неї починаються (до події персонаж ніс річ), «миски» — з рук коло
// себе (`halfCarry`: совок несуть, а воду й годівницю — ні), «доглядає кота» починається й закінчується позою «тримає кота». Решта разових починаються й закінчуються у вихідній позі (з неї м'яко
// повертається основна), по колу — перший і останній ключі однакові, за поступом (засинання, падіння) — від вихідної пози до
// кінцевої. Мить, коли річ з'являється в руці чи лишає її, — `PERSON_CONTACT_MS` (вигляд міняє вміст гнізда саме тоді).

import { PERSON_CONTACT_MS, PERSON_ONE_SHOT_MS } from "../../../anim/ids";
import type { ArtView } from "../../../art/types";
import { isoObjectLook } from "../../../world/objects";
import { ISO_TILE } from "../../../world/projection";
import { PERSON_RIG } from "../../defs/person";
import { easeValue } from "../../rigcore";
import { defineAnims, type BoneOf, type BoneTracks, type Ease, type Key, type RigTracks, type SlotOf, type SlotTracks, type StepKey, type Vec2 } from "../../types";
import { levelHand, personArmsPose } from "./move";

type Bone = BoneOf<typeof PERSON_RIG>;
type Slot = SlotOf<typeof PERSON_RIG>;
type Tracks = RigTracks<Bone, Slot>;

// --- Пози й ключі -------------------------------------------------------------------------------

/** Поправка однієї кістки: кут (градуси), зсув і масштаб відносно вихідної пози. */
interface Part {
  rot?: number;
  pos?: Vec2;
  scale?: Vec2;
}

/** Поза: поправки кісток; кістки без поправки — у вихідній позі. */
type Pose = Readonly<Partial<Record<Bone, Part>>>;

/** Ключ: момент (мс), поза й перехід до наступного ключа (за замовчуванням `inOut`). */
type Beat = readonly [t: number, pose: Pose, ease?: Ease];

const BONES: readonly Bone[] = PERSON_RIG.bones.map((bone) => bone.id);

/** Пози разом: кути й зсуви додаються, масштаби множаться. */
function add(...poses: readonly Pose[]): Pose {
  const out: Partial<Record<Bone, Part>> = {};
  for (const pose of poses) {
    for (const id of BONES) {
      const part = pose[id];
      if (!part) continue;
      const sum: Part = { ...out[id] };
      if (part.rot !== undefined) sum.rot = (sum.rot ?? 0) + part.rot;
      if (part.pos) sum.pos = { x: (sum.pos?.x ?? 0) + part.pos.x, y: (sum.pos?.y ?? 0) + part.pos.y };
      if (part.scale) sum.scale = { x: (sum.scale?.x ?? 1) * part.scale.x, y: (sum.scale?.y ?? 1) * part.scale.y };
      out[id] = sum;
    }
  }
  return out;
}

/** Ключ доріжки з переходом. */
function key<V>(t: number, v: V, ease: Ease): Key<V> {
  return { t, v, ease };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Доріжки кісток з послідовності поз: для кожної кістки й властивості, яку змінює хоч одна поза, — ключ у кожен момент
 * (де поза її не змінює — вихідне значення). Доріжки, що весь час у вихідному значенні, не пишуться.
 */
function bonesOf(beats: readonly Beat[]): NonNullable<Tracks["bones"]> {
  const out: Partial<Record<Bone, BoneTracks>> = {};
  for (const id of BONES) {
    // Кут між сусідніми ключами — коротшим шляхом: −175 і +179 — це 6° різниці, а не оберт руки через спину.
    let prev = 0;
    const rot = beats.map(([t, pose, ease], i) => {
      let v = pose[id]?.rot ?? 0;
      if (i > 0) {
        while (v - prev > 180) v -= 360;
        while (v - prev < -180) v += 360;
      }
      prev = v;
      return key(t, r1(v), ease ?? "inOut");
    });
    const pos = beats.map(([t, pose, ease]) => key(t, { x: r1(pose[id]?.pos?.x ?? 0), y: r1(pose[id]?.pos?.y ?? 0) }, ease ?? "inOut"));
    const scale = beats.map(([t, pose, ease]) => key(t, { x: r3(pose[id]?.scale?.x ?? 1), y: r3(pose[id]?.scale?.y ?? 1) }, ease ?? "inOut"));
    const track: BoneTracks = {
      ...(rot.some((k) => k.v !== 0) ? { rot } : {}),
      ...(pos.some((k) => k.v.x !== 0 || k.v.y !== 0) ? { pos } : {}),
      ...(scale.some((k) => k.v.x !== 1 || k.v.y !== 1) ? { scale } : {}),
    };
    if (track.rot || track.pos || track.scale) out[id] = track;
  }
  return out;
}

// --- Простір ракурсу ----------------------------------------------------------------------------

/** Вихідна поза кістки в ракурсі: визначення з перевизначенням ракурсу. */
function setup(view: ArtView, id: Bone): { x: number; y: number; rot: number; len: number } {
  const bone = PERSON_RIG.bones.find((b) => b.id === id);
  if (!bone) throw new Error(`Немає кістки «${id}»`);
  const over = PERSON_RIG.views[view].bones?.[id];
  return { x: over?.x ?? bone.x, y: over?.y ?? bone.y, rot: over?.rot ?? bone.rot, len: over?.len ?? bone.len };
}

const RAD = Math.PI / 180;
/** Довжина ноги від стегна до кісточки, одиниці арту. */
const LEG = setup("front", "leg-near").len;
/** Рука від плеча до кулака (зап'ясток + кисть). */
const ARM = setup("front", "arm-near").len + setup("front", "hand-near").len;
/** Таз над підлогою у вихідній позі (від'ємне: y донизу). */
const PELVIS_Y = setup("front", "pelvis").y;
/** Найкоротша рука: ще коротша вже не читається як рука. */
const ARM_MIN = 0.45;

/**
 * Проєкція ¾ (одиниці екрана на одиницю вглиб чи вбік): уперед — праворуч і на третину вглиб (у ¾ ззаду — угору, спереду —
 * донизу), ближній бік — до камери (у ¾ спереду — ліворуч, ззаду — праворуч) і трохи донизу. Пологіша за ромб плитки (1 : 2):
 * вигляд персонажа — умовний ¾, і сувора проєкція гнала б руки й ноги задалеко вгору чи вниз.
 */
const FWD_X = 0.85;
const FWD_Y = 0.3;
const SIDE_X = 0.8;
const SIDE_Y = 0.3;
/** Плече вбік від середини тулуба (до ближнього боку — +). */
const SHOULDER_SIDE = 18;

/** Як стоїть тіло: зсув таза від вихідного й нахил тулуба вперед (градуси). */
interface Body {
  hip: Vec2;
  lean: number;
}

/** Рука: ближня (з гніздом речі) чи дальня. */
type Side = "near" | "far";

/** Простір ракурсу: де точка попереду персонажа і як дотягнутися до неї рукою. */
interface Space {
  view: ArtView;
  /** Точка на `f` попереду, на висоті `h` над підлогою і на `n` убік (+ — до ближнього боку), у системі кореня. */
  at(f: number, h: number, n?: number): Vec2;
  /** Ступня на `f` уперед по підлозі (зсув від вихідного місця). */
  step(f: number): Vec2;
  /** Рука кулаком до точки «f, h, n»: кут і вкорочення (рука пряма, від плеча). */
  reach(side: Side, body: Body, f: number, h: number, n?: number): Part;
  /** Рука кулаком до точки екрана (системи кореня). */
  point(side: Side, body: Body, target: Vec2): Part;
}

/** Кут руки й вкорочення з вектора на екрані від плеча до кулака. */
function armPart(body: Body, dx: number, dy: number): Part {
  // Кут руки у світі = кут тулуба + 180 + поправка; у вихідній позі рука звисає донизу (90 + нахил).
  let rot = Math.atan2(dy, dx) / RAD - (90 + body.lean);
  while (rot > 180) rot -= 360;
  while (rot < -180) rot += 360;
  const k = Math.min(1, Math.max(ARM_MIN, Math.hypot(dx, dy) / ARM));
  return k < 1 ? { rot, scale: { x: k, y: 1 } } : { rot };
}

/** Точка в системі тулуба (x — угору від таза, y — уперед) на екрані: таз зсунуто на `hip`, тулуб нахилено на `lean`. */
function torsoPoint(body: Body, x: number, y: number): Vec2 {
  const torso = (-90 + body.lean) * RAD;
  return { x: body.hip.x + x * Math.cos(torso) - y * Math.sin(torso), y: PELVIS_Y + body.hip.y + x * Math.sin(torso) + y * Math.cos(torso) };
}

function space(view: ArtView): Space {
  const back = view === "back";
  const shoulders = { near: setup(view, "arm-near"), far: setup(view, "arm-far") };
  /** Вектор «f, h, n» на екрані. */
  const project = (f: number, h: number, n: number): Vec2 => ({
    x: FWD_X * f + (back ? SIDE_X : -SIDE_X) * n,
    y: -h + (back ? -FWD_Y : FWD_Y) * f + SIDE_Y * n,
  });
  return {
    view,
    at: (f, h, n = 0) => project(f, h, n),
    step: (f) => project(f, 0, 0),
    reach(side, body, f, h, n = 0) {
      // Плече в просторі: над тазом на довжину до плеча, нахил тулуба несе його вперед і вниз.
      const up = shoulders[side].x;
      const lean = body.lean * RAD;
      const sf = body.hip.x / FWD_X + up * Math.sin(lean);
      const sh = -PELVIS_Y - body.hip.y + up * Math.cos(lean);
      const sn = side === "near" ? SHOULDER_SIDE : -SHOULDER_SIDE;
      let vf = f - sf;
      let vh = h - sh;
      let vn = n - sn;
      // Рука не довша за себе: далеку точку кулак не дістає, а лише тягнеться до неї.
      const len = Math.hypot(vf, vh, vn);
      if (len > ARM) {
        vf *= ARM / len;
        vh *= ARM / len;
        vn *= ARM / len;
      }
      const v = project(vf, vh, vn);
      return armPart(body, v.x, v.y);
    },
    point(side, body, target) {
      // Плече на екрані: таз + поворот тулуба (вихідний кут −90, нахил додається) × точка плеча в системі тулуба.
      const s = shoulders[side];
      const at = torsoPoint(body, s.x, s.y);
      return armPart(body, target.x - at.x, target.y - at.y);
    },
  };
}

const SPACES: Readonly<Record<ArtView, Space>> = { front: space("front"), back: space("back") };

/** Кісточка (початок стопи) в системі ноги: на кінці ноги й трохи вбік від її осі. */
const ANKLE_SIDE = setup("front", "foot-near").y;

/**
 * Нога від таза, зсунутого на `hip`, до ступні, зсунутої на `foot`: кут, вкорочення й стопа рівно. Ціль — кісточка, а вона
 * трохи збоку від осі ноги (`ANKLE_SIDE`): нога, що лягає майже горизонтально (сів на підлогу, впав), інакше відносила б
 * ступню на ≈ 1.
 */
function legTo(hip: Vec2, foot: Vec2): { leg: Part; foot: Part } {
  // Від стегна до кісточки: у вихідній позі нога донизу (90°), кісточка — на `ANKLE_SIDE` убік від осі.
  const dx = -ANKLE_SIDE + foot.x - hip.x;
  const dy = LEG + foot.y - hip.y;
  const along = Math.sqrt(Math.max(0, dx * dx + dy * dy - ANKLE_SIDE * ANKLE_SIDE));
  const k = Math.min(1, along / LEG);
  const phi = (Math.atan2(dy, dx) - Math.atan2(ANKLE_SIDE, k * LEG)) / RAD;
  // Вкорочена нога стискає й стопу (вона — дочірня): стопа впоперек ноги, тож розтягнути її навпаки.
  return { leg: k < 1 ? { rot: phi - 90, scale: { x: k, y: 1 } } : { rot: phi - 90 }, foot: k < 1 ? { rot: 90 - phi, scale: { x: 1, y: 1 / k } } : { rot: 90 - phi } };
}

/**
 * Ноги стоять, коли таз зсунуто на `hip`: ступні — на `near` і `far` від вихідних місць. Нога — пряма від стегна до кісточки
 * (довша не стає: не дістає — ступня трохи в повітрі; коротша — вкорочена вздовж себе), стопа — рівно (носок уперед).
 */
function stance(hip: Vec2, near: Vec2 = { x: 0, y: 0 }, far: Vec2 = near): Pose {
  const n = legTo(hip, near);
  const f = legTo(hip, far);
  return { pelvis: { pos: hip }, "leg-near": n.leg, "foot-near": n.foot, "leg-far": f.leg, "foot-far": f.foot };
}

/**
 * Ключі руху, де таз іде далеко, а ступні стоять (падіння, засинання): між сусідніми зупинками (числові параметри пози) —
 * проміжні ключі кожні ≈ `step` мс з позою, перерахованою для проміжних параметрів (поступ — за переходом зупинки, між
 * проміжними — рівно). Інакше на довгому відрізку кути ніг і зсув таза змішувалися б окремо, і ступні ковзали б.
 */
function through<P extends readonly number[]>(stops: readonly (readonly [t: number, p: P, ease?: Ease])[], make: (p: P) => Pose, step = 30): Beat[] {
  const out: Beat[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const [t0, a, ease] = stops[i]!;
    const [t1, b] = stops[i + 1]!;
    const n = Math.max(1, Math.round((t1 - t0) / step));
    for (let j = 0; j < n; j++) {
      const u = easeValue(ease ?? "inOut", j / n);
      out.push([Math.round(t0 + ((t1 - t0) * j) / n), make(a.map((v, k) => v + ((b[k] ?? v) - v) * u) as unknown as P), "linear"]);
    }
  }
  const last = stops[stops.length - 1];
  if (last) out.push(last[2] ? [last[0], make(last[1]), last[2]] : [last[0], make(last[1])]);
  return out;
}

/** Тіло: таз і нахил тулуба (ноги стоять на місці). */
function body(b: Body, near?: Vec2, far?: Vec2): Pose {
  return add(stance(b.hip, near, far), { torso: { rot: b.lean } });
}

/** Голова на шиї: нахил уперед (+) чи назад (−); шия бере третину. */
function nod(deg: number): Pose {
  return { neck: { rot: deg / 3 }, head: { rot: (deg * 2) / 3 } };
}

/** Кисть: поворот у зап'ястку (і річ у руці разом із нею). */
function wrist(side: Side, deg: number): Pose {
  return side === "near" ? { "hand-near": { rot: deg } } : { "hand-far": { rot: deg } };
}

/**
 * Річ у ближній руці рівно (нахилена на `tilt`): кисть повертається назад на все, на що повернулися корінь, таз, тулуб і рука.
 * Вкорочена рука стискає кисть уздовж себе, тож кут кисті — з поправкою на вкорочення.
 */
function level(pose: Pose, tilt = 0): Pose {
  const turned = (pose.root?.rot ?? 0) + (pose.pelvis?.rot ?? 0) + (pose.torso?.rot ?? 0) + (pose["arm-near"]?.rot ?? 0);
  const k = pose["arm-near"]?.scale?.x ?? 1;
  const psi = (tilt - turned) * RAD;
  return { ...pose, "hand-near": { rot: Math.atan2(Math.sin(psi), k * Math.cos(psi)) / RAD } };
}

/** Доріжки слотів, однакові в обох ракурсах (схований черевик сидячи). */
type Slots = Readonly<Partial<Record<Slot, SlotTracks>>>;

/** Стан довгого поділу — спідниці й верху (`art/STYLE.md`, «Довжина»). */
type HemState = "stand" | "sit" | "squat";

/**
 * Пороги стану поділу за згином у стегні (кут між тулубом і стегном, градуси): від `sit` — стегно поперек тулуба (сидить на
 * стільці чи на підлозі, глибоко зігнувся), від `squat` — присів чи нахилився, менше — тулуб і ноги в одну лінію (стоїть, лежить
 * на спині). Поділ іде за тулубом: `stand` на згині стирчав би назад чи йшов би під підлогу, а `sit` лежачи — догори.
 */
const HEM = { sit: 75, squat: 30 } as const;

function hemState(pose: Pose): HemState {
  const flex = (pose.torso?.rot ?? 0) - (pose["leg-near"]?.rot ?? 0);
  if (flex >= HEM.sit) return "sit";
  if (flex >= HEM.squat) return "squat";
  return "stand";
}

/**
 * Доріжка кадру поділу за позами справи: стан міняється стрибком посередині між ключами, де поза перейшла поріг (`HEM`). null —
 * увесь час `stand`. Так будь-який кадр зі станами (`skirt`, `top-hem`) стає правильно без правок справ.
 */
function hemFrames(beats: readonly Beat[]): StepKey<string>[] | null {
  const keys: StepKey<string>[] = [];
  let prev: { t: number; state: HemState } | null = null;
  for (const [t, pose] of beats) {
    const state = hemState(pose);
    if (!prev) keys.push({ t: 0, v: state });
    else if (state !== prev.state) keys.push({ t: Math.round((prev.t + t) / 2), v: state });
    prev = { t, state };
  }
  return keys.every((k) => k.v === "stand") ? null : keys;
}

/** Доріжки поділу спідниці й верху з однаковими кадрами. */
const hemSlots = (frame: readonly StepKey<string>[]): Slots => ({ skirt: { frame }, "top-hem": { frame } });

/**
 * Анімація з поз для кожного ракурсу: основні доріжки — ¾ спереду, а `views.back` — лише ті доріжки ¾ ззаду, що
 * відрізняються. Стан поділу — з поз (`hemFrames`), якщо `slots` не задають його самі.
 */
function anim(duration: number, loop: boolean, beats: (s: Space) => readonly Beat[], slots?: Slots) {
  const frontBeats = beats(SPACES.front);
  const backBeats = beats(SPACES.back);
  const front = bonesOf(frontBeats);
  const back = bonesOf(backBeats);
  const diff: Partial<Record<Bone, BoneTracks>> = {};
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const own = slots?.skirt !== undefined || slots?.["top-hem"] !== undefined;
  const hemFront = own ? null : hemFrames(frontBeats);
  const hemBack = own ? null : hemFrames(backBeats);
  const allSlots: Slots | undefined = hemFront ? { ...hemSlots(hemFront), ...slots } : slots;
  const backSlots: Slots | null = same(hemFront, hemBack) ? null : hemSlots(hemBack ?? [{ t: 0, v: "stand" }]);
  for (const id of BONES) {
    const a = front[id] ?? {};
    const b = back[id] ?? {};
    // Перевизначення замінює доріжку цілком, а доріжку, якої в ракурсі ззаду немає, — вихідним значенням.
    const track: BoneTracks = {
      ...(same(a.rot, b.rot) ? {} : { rot: b.rot ?? [{ t: 0, v: 0 }] }),
      ...(same(a.pos, b.pos) ? {} : { pos: b.pos ?? [{ t: 0, v: { x: 0, y: 0 } }] }),
      ...(same(a.scale, b.scale) ? {} : { scale: b.scale ?? [{ t: 0, v: { x: 1, y: 1 } }] }),
    };
    if (track.rot || track.pos || track.scale) diff[id] = track;
  }
  const views = {
    ...(Object.keys(diff).length > 0 ? { bones: diff } : {}),
    ...(backSlots ? { slots: backSlots } : {}),
  };
  return {
    duration,
    loop,
    bones: front,
    ...(allSlots ? { slots: allSlots } : {}),
    ...(Object.keys(views).length > 0 ? { views: { back: views } } : {}),
  };
}

// --- Спільні пози -------------------------------------------------------------------------------

const REST: Pose = {};
/** Тіло, нахилене на `lean`, таз — на `x`, `y`. */
const lean = (deg: number, x = 0, y = 0): Body => ({ hip: { x, y }, lean: deg });

/** Поза рук: кути відносно вихідної й наскільки рука коротша (зігнута до камери). */
interface Arms {
  near: number;
  far: number;
  nearScale?: number;
  farScale?: number;
}

/**
 * Пози накладок рук (`move.ts`, N4a): несе річ (`carry`) — ближня рука вперед із річчю на долоні, дальня підтримує знизу;
 * тримає кота (`holdCat`) — ближня рука навскіс під котом, дальня зігнута під ним з того боку (ззаду ближня коротка — до
 * камери). Справи, що починаються чи закінчуються з річчю або котом у руках, стикуються з ними саме в цих позах.
 */
const CARRY: Readonly<Record<ArtView, Arms>> = { front: personArmsPose("carry", "front"), back: personArmsPose("carry", "back") };
const HOLD: Readonly<Record<ArtView, Arms>> = { front: personArmsPose("holdCat", "front"), back: personArmsPose("holdCat", "back") };

/**
 * Руки в позі `a`, кисті — назад на кут руки з поправкою на вкорочення (`levelHand`: річ рівно, кіт на долонях), як у
 * накладках N4a.
 */
function arms(a: Arms): Pose {
  const part = (rot: number, k: number | undefined): Part => (k !== undefined && k !== 1 ? { rot, scale: { x: k, y: 1 } } : { rot });
  return {
    "arm-near": part(a.near, a.nearScale),
    "hand-near": { rot: levelHand(a.near, a.nearScale) },
    "arm-far": part(a.far, a.farScale),
    "hand-far": { rot: levelHand(a.far, a.farScale) },
  };
}

/** Ближня рука з пози `a` (дальня — як скаже справа). */
function nearOf(a: Arms): Pose {
  const all = arms(a);
  return { "arm-near": all["arm-near"] ?? {}, "hand-near": all["hand-near"] ?? {} };
}

/** Дальня рука з пози `a`. */
function farOf(a: Arms): Pose {
  const all = arms(a);
  return { "arm-far": all["arm-far"] ?? {}, "hand-far": all["hand-far"] ?? {} };
}

const C = PERSON_CONTACT_MS;

// --- Сидить -------------------------------------------------------------------------------------

/**
 * Сидить на стільці: таз опускається на сидіння (`PERSON_SEAT` над підлогою — як диван, `world/objects.ts`). Стільця скелет
 * не малює (його дає вигляд біля стола, T2/A4).
 */
export const PERSON_SEAT = 34;
/** На скільки таз сидячи нижче, ніж стоячи: низ таза (≈ 12 під його центром) — на сидінні. */
const SIT_DROP = -PELVIS_Y - 12 - PERSON_SEAT;
/** Таз сидячи — трохи назад (сідниці на сидінні, коліна попереду). */
const SIT_X = -2;
/**
 * Стегно сидячи — частка ноги (стегно ≈ половина ноги від стегна до кісточки) і де кульшовий суглоб (x у системі кореня: під
 * серединою тулуба, в обох ракурсах однаково). Гніздо `lap` (на ближній нозі, на 20 від стегна й 6 над нею) тоді — над
 * серединою стегна, ≈ 13 над сидінням, рівно.
 */
const THIGH = 0.52;
const SIT_HIP_X = 0;
/** Гомілка — від коліна (на стільки назад від краю стегна) до кісточки, ступня трохи попереду коліна. */
const KNEE_IN = 4;
const SHIN_FWD = 3;
/** Кісточка над підлогою у вихідній позі (ближня нога): там і гомілка сидячи ставить черевик. */
const ANKLE = -PELVIS_Y - setup("front", "leg-near").y - LEG;

/**
 * Ноги сидячи, таз зсунуто на `hip`: ближнє стегно горизонтально вперед від суглоба під серединою тулуба (вкорочене до
 * `THIGH`), а дальня нога висить від коліна до підлоги — гомілка з черевиком на підлозі. Ближній черевик схований
 * (`SIT_SLOTS`). Стегно лежить рівно, тож гніздо `lap` (кіт на колінах) не нахилене й на висоті колін.
 */
function sitLegs(view: ArtView, hip: Vec2): Pose {
  const near = setup(view, "leg-near");
  const far = setup(view, "leg-far");
  const thigh = LEG * THIGH;
  // Суглоб у системі таза; таз не повертається, тож вісі ті самі, що в кореня.
  const joint = { x: SIT_HIP_X - hip.x, y: near.y };
  const knee = { x: joint.x + thigh, y: near.y };
  const shin = { x: knee.x - KNEE_IN, y: near.y + 1 };
  // Гомілка: від кореня дальньої ноги (у системі кореня) до кісточки на підлозі.
  const top = { x: hip.x + shin.x, y: PELVIS_Y + hip.y + shin.y };
  const ankle = { x: top.x + SHIN_FWD, y: -ANKLE };
  const phi = Math.atan2(ankle.y - top.y, ankle.x - top.x) / RAD;
  const k = Math.hypot(ankle.x - top.x, ankle.y - top.y) / LEG;
  return {
    pelvis: { pos: hip },
    "leg-near": { rot: -90, pos: { x: joint.x - near.x, y: 0 }, scale: { x: THIGH, y: 1 } },
    "leg-far": { rot: phi - 90, pos: { x: shin.x - far.x, y: shin.y - far.y }, scale: { x: k, y: 1 } },
    "foot-far": { rot: 90 - phi, scale: { x: 1, y: 1 / k } },
  };
}

/**
 * Сидячи ближня нога — лише стегно: черевика, халяви й низу штанини на ній не видно; дальня — гомілка, і накладці штанини
 * (вона на стегні) там не місце. Спідниця й поділ верху — у стані `sit` (кадри без станів його не мають, `art/STYLE.md`).
 */
const SIT_SLOTS: Slots = {
  "shoe-near": { visible: [{ t: 0, v: false }] },
  "shaft-near": { visible: [{ t: 0, v: false }] },
  "hem-near": { visible: [{ t: 0, v: false }] },
  "legwear-far": { visible: [{ t: 0, v: false }] },
  skirt: { frame: [{ t: 0, v: "sit" }] },
  "top-hem": { frame: [{ t: 0, v: "sit" }] },
};

/**
 * Ближня рука над річчю в гнізді `held`: гніздо лежить над рукою (`PERSON_RIG`: тарілку, совок і страву несуть на кулаці), а
 * телефон біля вуха кулак тримає ззовні — з камери телефон визирає з-під руки на щоці.
 */
const OVER_HELD: Slots = { "arm-near": { z: [{ t: 0, v: 13 }] } };

/** Сидить, нахилений на `deg`: поза ніг і тіло (для рук). */
function seated(s: Space, deg: number): { pose: Pose; body: Body } {
  const b = lean(deg, SIT_X, SIT_DROP);
  return { pose: add(sitLegs(s.view, b.hip), { torso: { rot: b.lean } }), body: b };
}

/**
 * Речі перед персонажем (`world/objects.ts`: стоїть чи сидить у `use.at`, лицем за `use.facing`): скільки клітинок від нього до
 * ближньої грані сліду речі й до дальньої. null — біля речі персонаж не стоїть.
 */
function depthOf(id: string): { edge: number; far: number } | null {
  const look = isoObjectLook(id);
  const use = look.use;
  if (!use) return null;
  const box = look.footprint;
  const f = use.facing;
  const edge = f.x < 0 ? use.at.x - box.x1 : f.x > 0 ? box.x0 - use.at.x : f.y < 0 ? use.at.y - box.y1 : box.y0 - use.at.y;
  const far = f.x < 0 ? use.at.x - box.x0 : f.x > 0 ? box.x1 - use.at.x : f.y < 0 ? use.at.y - box.y0 : box.y1 - use.at.y;
  return { edge, far };
}

/** Одиниць простору анімації вперед на клітинку: клітинка вздовж осі плитки — пів ширини плитки праворуч на екрані. */
const PER_TILE = ISO_TILE.width / 2 / FWD_X;

/**
 * Стільниця 54 (`env/computer`, `env/table`). Клавіатура (A4: середина стола, 0,6 його глибини) і тарілка — за 0,3 клітинки за
 * лицьовою гранню стола (≈ 49 уперед): кулаки лягають на стіл, а не на його край. Дістає до них рука, лише коли той, хто
 * сидить, нахилився до стола.
 */
const DESK = 54;
const KEYS = (depthOf("computer")?.edge ?? 0.35) * PER_TILE + 0.3 * PER_TILE;
const PLATE = (depthOf("table")?.edge ?? 0.35) * PER_TILE + 0.3 * PER_TILE;
/** Лицьова грань стола — де лежить передпліччя, що спирається на стіл. */
const DESK_EDGE = (depthOf("computer")?.edge ?? 0.35) * PER_TILE;

/**
 * Працює за комп'ютером: друкує обома руками, зрідка тягнеться до миші й клацає, голова за екраном. У ¾ спереду (якщо вигляд
 * не розверне персонажа до стола) — ноутбук на колінах: дальня рука на клавішах, ближня — коло себе.
 */
function work(s: Space): readonly Beat[] {
  const front = s.view === "front";
  // До клавіатури за стільницею — нахилився до стола; з ноутбуком на колінах — майже рівно.
  const { pose: sit, body: b } = seated(s, front ? 6 : 16);
  const typing = (a: number): Pose =>
    add(
      sit,
      {
        "arm-near": front ? s.reach("near", b, 16, 52 + a, 10) : s.reach("near", b, KEYS, DESK + 3 + 2 * a, 2),
        "arm-far": front ? s.reach("far", b, 30, DESK - 2 - a, -8) : s.reach("far", b, KEYS, DESK + 3 - 2 * a, -8),
      },
      wrist("near", 6 * a),
      wrist("far", -6 * a),
      nod(3 + a * 0.5),
      { torso: { rot: 0.6 * a } },
    );
  const mouse = (click: number): Pose =>
    add(
      sit,
      {
        "arm-near": front ? s.reach("near", b, 18, 52, 14) : s.reach("near", b, KEYS + 4, DESK + 3 - click, 16),
        "arm-far": front ? s.reach("far", b, 30, DESK - 2, -8) : s.reach("far", b, KEYS, DESK + 3, -8),
      },
      wrist("near", 8 * click),
      nod(1),
      { torso: { rot: 1 } },
    );
  return [
    [0, typing(1)],
    [160, typing(-1)],
    [320, typing(1)],
    [480, typing(-1)],
    [640, typing(1)],
    [800, typing(-1)],
    [960, typing(1)],
    [1120, typing(-1)],
    // Перечитує написане: руки завмерли, голова ближче до екрана.
    [1400, add(typing(0), nod(5), { torso: { rot: 2 } })],
    [1650, mouse(0)],
    [1740, mouse(1)],
    [1830, mouse(0)],
    [1920, mouse(1)],
    [2080, mouse(0)],
    [2280, typing(-1)],
    [2400, typing(1)],
  ];
}

/**
 * Нарада: сидить рівніше й говорить у камеру — киває, ближня рука пояснює жестами перед грудьми, дальня лежить на столі
 * (у ¾ спереду — на колінах).
 */
function meeting(s: Space): readonly Beat[] {
  const { pose: sit, body: b } = seated(s, -1);
  const front = s.view === "front";
  // Дальня рука лежить передпліччям на краю стола (сидить рівно, далі не дістає).
  const far = front ? s.reach("far", b, 22, 52, -8) : s.reach("far", b, DESK_EDGE + 8, DESK + 3, -10);
  const say = (f: number, h: number, w: number, head: number, tilt: number): Pose =>
    add(sit, { torso: { rot: tilt } }, { "arm-near": s.reach("near", { ...b, lean: b.lean + tilt }, f, h, 6), "arm-far": far }, wrist("near", w), nod(head));
  const rest = add(sit, { "arm-near": front ? s.reach("near", b, 16, 52, 10) : s.reach("near", b, DESK_EDGE + 8, DESK + 3, 4), "arm-far": far });
  return [
    [0, rest],
    [300, say(26, 80, -20, -4, -2)],
    [520, say(32, 88, 18, 6, 1)],
    [760, say(24, 78, -14, -3, -1)],
    [1000, say(34, 90, 22, 7, 2)],
    [1260, say(28, 82, -6, 0, 0)],
    [1500, say(30, 84, 10, 4, 1)],
    [1800, add(rest, nod(4))],
    [2100, add(rest, nod(-2))],
    [2450, add(rest, nod(3))],
    [2800, rest],
  ];
}

/** Їсть за столом: набирає ложкою з тарілки, несе до рота (голова — назустріч), жує; дальня рука — на столі. */
function eat(s: Space): readonly Beat[] {
  const front = s.view === "front";
  // До тарілки за стільницею — нахилився до стола (як за комп'ютером); у ¾ спереду тарілка ближче, коло себе.
  const { pose: sit, body: b } = seated(s, front ? 8 : 14);
  const far = front ? s.reach("far", b, 24, DESK, -10) : s.reach("far", b, PLATE - 6, DESK + 3, -12);
  // Рот: у ¾ ззаду — перед обличчям, біля краю голови; у ¾ спереду ложка лише підходить під підборіддя (голова схиляється
  // назустріч): рука, піднята до самого рота, лягала б рукавом поперек обличчя.
  const chin = PELVIS_Y + SIT_DROP - 46;
  const mouth: Vec2 = front ? { x: 12, y: chin + 11 } : { x: 25, y: chin + 2 };
  // Дорогою до рота ложка йде коло грудей: рука вкорочена, кулак близько до тіла (інакше рука проходить пряма вперед).
  const chest: Vec2 = front ? { x: 6, y: chin + 26 } : { x: 18, y: chin + 22 };
  const at = (hand: Part, tilt: number, head: number, w: number): Pose => add(sit, { torso: { rot: tilt } }, { "arm-near": hand, "arm-far": far }, wrist("near", w), nod(head));
  // У ¾ спереду ближня рука до тарілки перетинала б груди навскіс — там вона коротка, коло себе.
  const plate = (df: number, dh: number, tilt = 0): Part =>
    front ? s.reach("near", { ...b, lean: b.lean + tilt }, 16 + df, 52 + dh, 10) : s.reach("near", { ...b, lean: b.lean + tilt }, PLATE + df, DESK + 4 + dh, 2);
  const lift = (tilt: number, to: Vec2 = mouth): Part => s.point("near", { ...b, lean: b.lean + tilt }, to);
  const tip = front ? 0 : -6;
  return [
    [0, at(plate(0, 0), 0, 6, 0)],
    [220, at(plate(3, -1, 2), 2, 9, 25)],
    [380, at(lift(tip + 2, chest), tip + 2, 10, 0)],
    [540, at(lift(tip), tip, front ? 18 : 10, -10), "out"],
    [680, at(lift(tip), tip, front ? 20 : 13, -10)],
    [900, at(plate(0, 1), 0, 3, 0)],
    [1100, at(plate(0, 0), 0, 5, 0)],
    [1260, at(plate(0, 0), 0, 1, 0)],
    [1420, at(plate(0, 0), 0, 5, 0)],
    [1580, at(plate(0, 0), 0, 1, 0)],
    [1780, at(plate(0, 0), 0, 4, 0)],
    [2000, at(plate(0, 0), 0, 6, 0)],
  ];
}

// --- Стоячи: швидкі разові ----------------------------------------------------------------------

/**
 * Ліки собі (біля умивальника): підносить таблетку до рота, закидає голову, ковтає. У ¾ ззаду кулак — перед обличчям, біля
 * краю голови; у ¾ спереду — знизу збоку підборіддя, не закриваючи обличчя.
 */
function meds(s: Space): readonly Beat[] {
  const front = s.view === "front";
  // У ¾ спереду кулак — під підборіддям (голова схиляється назустріч): піднята до рота рука лягала б рукавом поперек обличчя.
  const mouth: Vec2 = front ? { x: 13, y: PELVIS_Y - 40 } : { x: 27, y: PELVIS_Y - 46 };
  const swallowed: Vec2 = front ? { x: mouth.x + 1, y: mouth.y + 2 } : { x: mouth.x - 2, y: mouth.y - 4 };
  // Дорогою до рота таблетка йде коло грудей: рука вкорочена, кулак близько до тіла (інакше рука на мить пряма вперед, як
  // «показує пальцем»).
  const chest: Vec2 = front ? { x: 4, y: PELVIS_Y - 24 } : { x: 18, y: PELVIS_Y - 26 };
  // Від грудей до рота — угору коло тіла (між ключами кут і вкорочення змішуються окремо, і рука виходила б уперед).
  const up: Vec2 = front ? { x: 7, y: PELVIS_Y - 33 } : { x: 20, y: PELVIS_Y - 38 };
  return [
    [0, REST],
    [120, add(body(lean(2)), { "arm-near": s.point("near", lean(2), chest), "arm-far": { rot: 4 } }, nod(5))],
    [185, add(body(lean(3)), { "arm-near": s.point("near", lean(3), up), "arm-far": { rot: 5 } }, nod(front ? 10 : 7))],
    [250, add(body(lean(4)), { "arm-near": s.point("near", lean(4), mouth), "arm-far": { rot: 6 } }, nod(front ? 14 : 8))],
    [420, add(body(lean(-6)), { "arm-near": s.point("near", lean(-6), swallowed), "arm-far": { rot: 8 } }, nod(-22)), "out"],
    [560, add(body(lean(-4)), { "arm-near": s.reach("near", lean(-4), 14, 76, 10), "arm-far": { rot: 6 } }, nod(-16))],
    [700, add(body(lean(-1)), { "arm-near": { rot: -10 } }, nod(-3))],
    [900, REST],
  ];
}

/**
 * П'є каву біля кавомашини (§8.7): бере чашку з піддона, підносить до рота, двома ковтками закидає голову й опускає руку. Чашка —
 * у гнізді `held` (`heldFrame`, анімація `drink`), тож рука веде її, як таблетку в `meds`: у ¾ ззаду кулак — перед обличчям, у ¾
 * спереду — під підборіддям.
 */
function drink(s: Space): readonly Beat[] {
  const front = s.view === "front";
  const mouth: Vec2 = front ? { x: 13, y: PELVIS_Y - 40 } : { x: 27, y: PELVIS_Y - 46 };
  const sip: Vec2 = front ? { x: mouth.x + 1, y: mouth.y + 2 } : { x: mouth.x - 2, y: mouth.y - 4 };
  // Дорогою до рота чашка йде коло грудей і вгору коло тіла, як таблетка (інакше рука на мить пряма вперед).
  const chest: Vec2 = front ? { x: 4, y: PELVIS_Y - 24 } : { x: 18, y: PELVIS_Y - 26 };
  const up: Vec2 = front ? { x: 7, y: PELVIS_Y - 33 } : { x: 20, y: PELVIS_Y - 38 };
  const at = (tilt: number, to: Vec2, head: number): Pose => add(body(lean(tilt)), { "arm-near": s.point("near", lean(tilt), to), "arm-far": { rot: 5 } }, nod(head));
  return [
    [0, REST],
    [170, add(body(lean(6)), { "arm-near": s.reach("near", lean(6), 24, 72, 6), "arm-far": { rot: 3 } }, nod(8))],
    [330, at(2, chest, 5)],
    [430, at(3, up, front ? 10 : 7)],
    [540, at(4, mouth, front ? 14 : 8)],
    [720, at(-5, sip, -18), "out"],
    [900, at(-2, mouth, -6)],
    [1080, at(-6, sip, -22), "out"],
    [1260, at(-4, sip, -16)],
    [1400, at(-1, chest, -3)],
    [1500, REST],
  ];
}

/**
 * Перев'язується біля умивальника (пластир чи бинт): дальню руку виносить перед собою, ближня кілька разів обводить її
 * передпліччя — намотує бинт чи розгладжує пластир, — голова схилена до руки. Ліктів немає, тож «передпліччя» — кінець прямої
 * дальньої руки, а ближня обводить його колом на екрані. Дальня рука завжди за тулубом, тож її кулак має вийти за силует
 * уперед (у ¾ спереду — праворуч-униз, у ¾ ззаду — праворуч): там і крутиться ближня; цілі — точки екрана (`Space.point`).
 */
function dress(s: Space): readonly Beat[] {
  const front = s.view === "front";
  const b = lean(front ? 6 : 5);
  const far = s.point("far", b, front ? { x: 38, y: PELVIS_Y - 14 } : { x: 36, y: PELVIS_Y - 12 });
  // Середина кола — на передпліччі, трохи ближче до плеча за кулак.
  const wrap: Vec2 = front ? { x: 30, y: PELVIS_Y - 20 } : { x: 29, y: PELVIS_Y - 17 };
  const RX = 5;
  const RY = 6;
  const head = front ? 16 : 12;
  const pose = (deg: number, dy = 0): Pose =>
    add(
      body(b),
      { "arm-far": far, "arm-near": s.point("near", b, { x: wrap.x + RX * Math.cos(deg * RAD), y: wrap.y + dy - RY * Math.sin(deg * RAD) }) },
      nod(head),
    );
  const LOOPS = 3;
  const START = 200;
  const LOOP_MS = 240;
  const STEPS = 8;
  const loops: Beat[] = [];
  for (let i = 0; i < LOOPS * STEPS; i++) loops.push([START + Math.round((i * LOOP_MS) / STEPS), pose((360 * i) / STEPS), "linear"]);
  const end = START + LOOPS * LOOP_MS;
  return [
    [0, REST],
    ...loops,
    // Наприкінці — притискає кінець пов'язки й опускає руки.
    [end, pose(0, -2), "out"],
    [end + 110, add(pose(90, -3), nod(4))],
    [PERSON_ONE_SHOT_MS.dress, REST],
  ];
}

/**
 * Ближня рука тягнеться вперед до речі (полиця, стіл, смітник, кран). У ¾ спереду ближнє плече — по той бік тулуба, і рука до
 * точки за ¾ ззаду лягала навскіс через груди, а річ у ній — на груди («притискає до себе»). Тому там тіло нахиляється на
 * `FRONT_LEAN` більше, а кулак іде на `FRONT_F` далі вперед і на `FRONT_N` до дальнього боку — річ виходить за силует тулуба.
 */
const FRONT_LEAN = 6;
const FRONT_F = 8;
const FRONT_N = 10;
function forward(s: Space, b: Body, f: number, n: number): { b: Body; f: number; n: number } {
  return s.view === "front" ? { b: { ...b, lean: b.lean + FRONT_LEAN }, f: f + FRONT_F, n: n - FRONT_N } : { b, f, n };
}

/** Ближня рука вперед до точки «f, h, n» (`forward`) з річчю рівно; дальня — на `farRot`, голова — на `head`. */
function reaching(s: Space, b: Body, f: number, h: number, farRot: number, head: number, n = 8): Pose {
  const r = forward(s, b, f, n);
  return level(add(body(r.b), { "arm-near": s.reach("near", r.b, r.f, h, r.n), "arm-far": { rot: farRot } }, nod(head)));
}

/** Ближня рука вперед до точки «f, h, n» (`forward`) без вирівнювання речі; дальня — на `farRot`. */
function forwardArm(s: Space, b: Body, f: number, h: number, n: number, farRot: number): Pose {
  const r = forward(s, b, f, n);
  return add(body(r.b), { "arm-near": s.reach("near", r.b, r.f, h, r.n), "arm-far": { rot: farRot } });
}

/**
 * Бере (холодильник, плита, стіл, шафка): тягнеться вперед на висоті грудей, хапає (`PERSON_CONTACT_MS.take` — річ у руці) і
 * забирає до себе — у позу «несе» (`CARRY`), з якої далі тримає накладка `carry`. Річ — рівно.
 */
function take(s: Space): readonly Beat[] {
  const carry = arms(CARRY[s.view]);
  // Проміжні ключі — щоб річ лишалася рівно й між ними (кут кисті з вкороченою рукою не лінійний).
  return [
    [0, REST],
    [90, reaching(s, lean(6), 24, 74, 5, 4)],
    [C.take, reaching(s, lean(12, 1), 40, 92, 10, 8), "out"],
    [240, reaching(s, lean(12, 1), 38, 90, 10, 8)],
    [310, add(reaching(s, lean(7), 30, 84, 0, 5), farOf(CARRY[s.view]))],
    [380, add(reaching(s, lean(3), 24, 80, 0, 2), farOf(CARRY[s.view]))],
    [450, carry],
  ];
}

/**
 * Кладе: з пози «несе» нахиляється, ставить річ уперед і трохи вниз (`PERSON_CONTACT_MS.put` — річ лишила руку), відпускає й
 * випрямляється.
 */
function put(s: Space): readonly Beat[] {
  const low = lean(18, -2, 1);
  return [
    [0, arms(CARRY[s.view])],
    [180, reaching(s, low, 38, 72, 12, 10), "out"],
    [C.put, reaching(s, low, 40, 68, 12, 10)],
    [330, add(forwardArm(s, low, 36, 70, 8, 10), wrist("near", -24), nod(8))],
    [390, add(forwardArm(s, lean(6), 22, 70, 8, 5), wrist("near", -10), nod(4))],
    [450, REST],
  ];
}

/**
 * Викидає: з пози «несе» трохи підносить річ і кидає униз-уперед у смітник (до 46; `PERSON_CONTACT_MS.trash` — річ полетіла),
 * кисть струшує, дальня рука — навстріч для рівноваги.
 */
function trash(s: Space): readonly Beat[] {
  return [
    [0, arms(CARRY[s.view])],
    [150, add(reaching(s, lean(-4), 16, 90, 0, 0), farOf(CARRY[s.view]))],
    [C.trash, add(forwardArm(s, lean(16, 1), 44, 52, 6, 18), wrist("near", -30), nod(12)), "out"],
    [370, add(forwardArm(s, lean(13), 42, 56, 6, 12), wrist("near", -12), nod(10))],
    [500, REST],
  ];
}

/** Кран котові: тягнеться до крана умивальника (≈ 85), повертає його і забирає руку. */
function tap(s: Space): readonly Beat[] {
  const at = (w: number): Pose => add(forwardArm(s, lean(16, -1), 40, 86, 4, 8), wrist("near", w), nod(10));
  return [
    [0, REST],
    [180, at(0), "out"],
    [260, at(40)],
    [340, at(-8)],
    [500, REST],
  ];
}

/**
 * Двері: тягнеться до ручки, прочиняє (відхиляється назад), нахиляється по пакунок (чи кота) і випрямляється з ним. Біля
 * дверей персонаж дивиться до камери (`world/objects.ts`), тож у ¾ спереду до ручки тягнеться дальня рука (ближня
 * перетинала б груди й закривала тулуб), а ближня — коло себе; у ¾ ззаду — ближня.
 */
function door(s: Space): readonly Beat[] {
  const low = stoop(50, 9, 3);
  const up = lean(4);
  const open = lean(10, 1);
  const pull = lean(-6, -3);
  const front = s.view === "front";
  const handle = (b: Body, f: number, h: number, n: number, w: number): Pose =>
    front
      ? add({ "arm-far": s.reach("far", b, f, h, -n), "arm-near": s.reach("near", b, 8, 72, 16) }, wrist("far", w))
      : add({ "arm-near": s.reach("near", b, f, h, n), "arm-far": { rot: 8 } }, wrist("near", w));
  return [
    [0, REST],
    [170, add(body(open), handle(open, 44, 88, 8, 0), nod(4)), "out"],
    [320, add(body(pull), handle(pull, 22, 88, 10, -15), nod(-3))],
    [550, add(body(low), { "arm-near": s.reach("near", low, 36, 12, 6), "arm-far": s.reach("far", low, 34, 12, -6) }, nod(-10))],
    [730, add(body(up), { "arm-near": s.reach("near", up, 20, 80, 6), "arm-far": s.reach("far", up, 18, 78, -6) }, nod(2)), "out"],
    [900, REST],
  ];
}

/**
 * Доглядає кота на руках (ліки, нашийник): кіт у гнізді `arms`, дальня рука тримає його знизу (поза `holdCat`), ближня — з
 * пози «тримає кота» підносить таблетку до рота кота (чи застібає нашийник на шиї), натискає двічі й повертається під кота;
 * голова дивиться на кота, а коли кіт пручається — відхиляється. Починається й закінчується позою «тримає кота».
 */
function tend(s: Space): readonly Beat[] {
  const hold = arms(HOLD[s.view]);
  // Рот кота: корінь кота — у гнізді `arms` (тулуб, 20 над тазом і 9 уперед), рот у позі «на руках» (N1) — ≈ 21 уперед і
  // ≈ 23 над коренем; нашийник — трохи нижче. Тулуб відхиляється, тож і кіт — з ним.
  const mouth = (b: Body, dx = 0, dy = 0): Vec2 => {
    const root = torsoPoint(b, 20, 9);
    const t = b.lean * RAD;
    const mx = 20 + dx;
    const my = -23 + dy;
    return { x: root.x + mx * Math.cos(t) - my * Math.sin(t), y: root.y + mx * Math.sin(t) + my * Math.cos(t) };
  };
  const at = (b: Body, dx: number, dy: number, w: number, head: number): Pose =>
    add(body(b), farOf(HOLD[s.view]), { "arm-near": s.point("near", b, mouth(b, dx, dy)) }, wrist("near", w), nod(head));
  const back = lean(-5, -1);
  const still = lean(-2);
  return [
    [0, hold],
    [260, at(still, -2, 4, -20, 10), "out"],
    [380, at(still, 0, 0, 10, 12)],
    [460, at(back, -1, 2, -10, 4)],
    [560, at(back, 1, 0, 12, 6)],
    [700, add(body(lean(-1)), farOf(HOLD[s.view]), nearOf(HOLD[s.view]), nod(3))],
    [900, hold],
  ];
}

// --- Нахилившись до підлоги ---------------------------------------------------------------------

/** Нахилений до підлоги: тулуб уперед у стегнах, таз назад (рівновага) і трохи нижче. */
function stoop(deg: number, back: number, drop = 2): Body {
  return lean(deg, -back, drop);
}

/**
 * Руки напівзігнуті коло себе — посередині між вихідною позою й «несе» (`CARRY`), річ рівно. З неї починаються «миски»: корм
 * насипають совком із рук (до події персонаж ніс його — накладка `carry`), а воду й годівницю — з порожніми руками (вихідна
 * поза); з обох поз змішування приходить сюди за половину шляху, без злету порожніх рук у «несе».
 */
function halfCarry(view: ArtView): Pose {
  const c = CARRY[view];
  return arms({ near: c.near / 2, far: c.far / 2, nearScale: (1 + (c.nearScale ?? 1)) / 2, farScale: (1 + (c.farScale ?? 1)) / 2 });
}

/**
 * Миски: руки коло себе (`halfCarry`), нахиляється до миски, висипає совок (`PERSON_CONTACT_MS.bowl` — корм у мисці, кисть
 * перевертається) чи наливає воду, випрямляється; дальня рука спирається на коліно.
 */
function bowl(s: Space): readonly Beat[] {
  const low = stoop(56, 11, 3);
  const knee = s.reach("far", low, 14, 38, -8);
  const at = (f: number, h: number, w: number, head: number): Pose => add(body(low), { "arm-near": s.reach("near", low, f, h, 6), "arm-far": knee }, wrist("near", w), nod(head));
  return [
    [0, halfCarry(s.view)],
    [230, level(at(36, 14, 0, -10)), "out"],
    [C.bowl, at(36, 14, 70, -10)],
    [450, at(34, 18, 20, -8)],
    [700, REST],
  ];
}

/** Пралька: нахиляється до барабана (≈ 36), запускає чи виймає білизну обома руками й струшує її, випрямляється. */
function washer(s: Space): readonly Beat[] {
  const low = stoop(36, 7);
  const hands = (b: Body, f: number, h: number): Pose => ({ "arm-near": s.reach("near", b, f, h, 6), "arm-far": s.reach("far", b, f - 2, h, -6) });
  return [
    [0, REST],
    [240, add(body(low), hands(low, 42, 36), nod(-6)), "out"],
    [400, add(body(low), hands(low, 46, 34), wrist("near", 15), nod(-6))],
    [580, add(body(lean(6)), hands(lean(6), 26, 92), nod(-4))],
    [700, add(body(lean(4)), hands(lean(4), 28, 86), nod(-2))],
    [900, REST],
  ];
}

/**
 * Розпаковує: нахиляється над ящиком, розгортає клапани в боки — на висоті верху купи (`env/boxes`: ящики заввишки до 64,
 * персонаж стоїть перед ними й малюється поверх, тож кисті нижче верху лягали б на лицьову грань, а не на клапани), — сягає
 * всередину трохи нижче верху, дістає річ і підносить до грудей.
 */
function unpack(s: Space): readonly Beat[] {
  const low = stoop(26, 6);
  const lower = stoop(38, 8, 2);
  const up = lean(6);
  return [
    [0, REST],
    [220, add(body(low), { "arm-near": s.reach("near", low, 36, 60, 4), "arm-far": s.reach("far", low, 34, 60, -4) }, nod(-10))],
    [420, add(body(low), { "arm-near": s.reach("near", low, 32, 64, 24), "arm-far": s.reach("far", low, 32, 64, -24) }, wrist("near", -20), wrist("far", 20), nod(-8))],
    [620, add(body(lower), { "arm-near": s.reach("near", lower, 36, 48, 4), "arm-far": s.reach("far", lower, 34, 48, -4) }, nod(-14))],
    [850, add(body(up), { "arm-near": s.reach("near", up, 22, 90, 4), "arm-far": s.reach("far", up, 20, 88, -4) }, nod(4)), "out"],
    [1100, REST],
  ];
}

/**
 * Чистить лоток: присів над лотком (дальня рука — на коліні), гребе совком, піднімає й трусить — наповнювач просіюється, —
 * і висипає грудки в пакет збоку, відхилившись і задерши носа від запаху.
 */
function litter(s: Space): readonly Beat[] {
  const low = lean(34, -4, 22);
  const knee = (b: Body): Part => s.reach("far", b, 20, 26, -8);
  const at = (f: number, h: number, n: number, w: number, head: number, tilt = 0): Pose => {
    const b: Body = { ...low, lean: low.lean + tilt };
    return add(body(b, s.step(12), s.step(-8)), { "arm-near": s.reach("near", b, f, h, n), "arm-far": knee(b) }, wrist("near", w), nod(head));
  };
  return [
    [0, at(30, 16, 6, 10, -10)],
    [320, at(44, 10, 6, 30, -12, 4), "out"],
    [560, at(34, 30, 6, -10, -8, -2)],
    [650, at(34, 34, 6, 6, -8, -2)],
    [740, at(34, 29, 6, -8, -8, -2)],
    [830, at(34, 34, 6, 6, -8, -2)],
    [920, at(34, 30, 6, -4, -8, -2)],
    [1250, at(10, 30, 24, 70, -18, -10)],
    [1450, at(12, 28, 22, 20, -12, -6)],
    [1800, at(30, 16, 6, 10, -10)],
  ];
}

/** Прибирає безлад: глибоко нахилився, ближня рука широко витирає підлогу туди-сюди, дальня — на коліні, тулуб гойдається. */
function clean(s: Space): readonly Beat[] {
  const low = stoop(74, 14, 4);
  const at = (f: number, n: number, sway: number, w: number): Pose => {
    const b: Body = { ...low, lean: low.lean + sway };
    return add(body(b), { "arm-near": s.reach("near", b, f, 4, n), "arm-far": s.reach("far", b, 12, 34, -8) }, wrist("near", w), nod(-12));
  };
  return [
    [0, at(22, 2, -4, -20)],
    [400, at(50, 10, 4, 20)],
    [800, at(24, 14, -4, -20)],
    [1200, at(48, 0, 3, 20)],
    [1600, at(22, 2, -4, -20)],
  ];
}

/**
 * Лагодить дріт: сів на підлогу біля стола (ноги вперед, під стіл), згорбився, обидві руки крутять і обмотують дріт, ближня
 * зрідка відтягує стрічку.
 */
function fix(s: Space): readonly Beat[] {
  const drop = -PELVIS_Y - 9;
  const b = lean(18, -10, drop);
  // Ноги — уперед на всю довжину (під стіл), щоб силует читався «сидить на підлозі», а не «згорнувся».
  const legs = stance(b.hip, s.step(LEG - 6), s.step(LEG - 10));
  const at = (nf: number, nh: number, nn: number, ff: number, wn: number, wf: number, head: number): Pose =>
    add(legs, { torso: { rot: b.lean } }, { "arm-near": s.reach("near", b, nf, nh, nn), "arm-far": s.reach("far", b, ff, nh, -4) }, wrist("near", wn), wrist("far", wf), nod(head));
  return [
    [0, at(34, 24, 4, 32, 25, -25, 16)],
    [220, at(35, 26, 4, 32, -25, 25, 18)],
    [440, at(34, 24, 4, 32, 25, -25, 16)],
    [660, at(35, 26, 4, 32, -25, 25, 18)],
    [960, at(40, 44, 20, 32, 0, 0, 8)],
    [1160, at(42, 46, 22, 32, 10, 0, 8)],
    [1400, at(35, 25, 4, 32, -10, -10, 16)],
    [1600, at(34, 24, 4, 32, 25, -25, 16)],
  ];
}

/**
 * Купає кота в душі: нахилився над піддоном (не сильно: кіт у гнізді `arms` нахиляється з тулубом), кіт на руках — дальня
 * рука тримає його знизу (поза `holdCat`), а ближня, на виду поверх кота, намилює його кругами по боці й спинці; голова
 * дивиться на кота. Раз за цикл кіт хлюпає — персонаж відсахується, відвернувши голову, ближня рука прикриває, але кота не
 * відпускає, і миє далі.
 */
function bath(s: Space): readonly Beat[] {
  // Де купаючи ближня рука намилює кота — точка кота від його кореня. Не експортується: модуль анімацій експортує лише групу
  // (галерея й `tests/rig.test.ts` беруть кожен об'єкт-експорт за групу анімацій); тест має свою копію.
  const BATH_SPOT: Readonly<Record<ArtView, Vec2>> = { front: { x: 8, y: -14 }, back: { x: 26, y: -24 } };
  // Де ближня рука намилює кота: корінь кота (гніздо `arms`) + точка кота в позі «на руках» (N1): у ¾ спереду — бік (≈ 8
  // уперед, ≈ 14 над коренем), у ¾ ззаду кіт визирає з-за плеча — груди й шия під мордою (≈ 26 уперед, ≈ 24 над коренем:
  // ближче до плеча рука вже не вкорочується).
  const spot = BATH_SPOT[s.view];
  const flank = (b: Body, dx: number, dy: number): Vec2 => {
    const root = torsoPoint(b, 20, 9);
    const t = b.lean * RAD;
    const mx = spot.x + dx;
    const my = spot.y + dy;
    return { x: root.x + mx * Math.cos(t) - my * Math.sin(t), y: root.y + mx * Math.sin(t) + my * Math.cos(t) };
  };
  const hold = farOf(HOLD[s.view]);
  /** Намилює: кулак на колі довкола боку кота (кут `a`, градуси), тіло ледь гойдається в такт. */
  const scrub = (a: number): Pose => {
    const b = lean(12 + Math.sin(a * RAD), -2, 1);
    const target = flank(b, 8 * Math.cos(a * RAD), 6 * Math.sin(a * RAD));
    return add(body(b), hold, { "arm-near": s.point("near", b, target) }, wrist("near", 12 * Math.sin(a * RAD)), nod(12 + Math.cos(a * RAD)));
  };
  const flinch = (dx: number, dy: number, head: number): Pose => {
    const b = lean(2, -5, 0);
    return add(body(b), hold, { "arm-near": s.point("near", b, flank(b, dx, dy)) }, nod(head), { head: { rot: -6 } });
  };
  return [
    [0, scrub(0)],
    [180, scrub(90)],
    [360, scrub(180)],
    [540, scrub(270)],
    [700, scrub(360)],
    [820, flinch(-6, -8, -18), "out"],
    [1000, flinch(-4, -6, -12)],
    // Повертається до кота й домиває коло (трохи швидше) — до тієї самої фази, з якої цикл починається: стик без ривка.
    [1150, scrub(90)],
    [1300, scrub(180)],
    [1450, scrub(270)],
    [1600, scrub(360)],
  ];
}


/** Телефон: ближня рука тримає телефон біля вуха, дальня жестикулює, голова киває, вага з ноги на ногу. */
function phone(s: Space): readonly Beat[] {
  const front = s.view === "front";
  // Вухо ближнього боку: у ¾ спереду — ліворуч від обличчя, ззаду — праворуч, трохи попереду. Кулак — біля самого контуру
  // голови, щоб телефон (у гнізді `held`, T2/A6) визирав з-за неї, а не ховався за потилицею («чухає потилицю»).
  const ear: Vec2 = { x: front ? -15 : 17, y: PELVIS_Y - 58 };
  const at = (shift: number, f: number, h: number, wf: number, head: number): Pose => {
    const b = lean(-2 + shift * 0.6, shift);
    return add(body(b), { "arm-near": s.point("near", b, { x: ear.x + shift, y: ear.y }), "arm-far": s.reach("far", b, f, h, -10) }, wrist("far", wf), nod(head), { head: { rot: front ? -4 : 4 } });
  };
  return [
    [0, at(0, 6, 56, 0, 3)],
    [380, at(1.5, 26, 84, -20, -3)],
    [660, at(1.5, 32, 92, 18, 5)],
    [960, at(1, 24, 80, -10, -2)],
    [1320, at(-1, 8, 58, 0, 3)],
    [1660, at(-1, 6, 56, 0, -1)],
    [2000, at(0, 6, 56, 0, 3)],
  ];
}

// --- За поступом ----------------------------------------------------------------------------------

/** Тривалість анімацій за поступом: час — поступ × тривалість (`PERSON_BY_PROGRESS`). */
const PROGRESS_MS = 1000;

/**
 * Ліжко, на яке падає той, хто засинає (`world/objects.ts`: персонаж стоїть збоку, лицем до ліжка): на скільки одиниць екрана
 * попереду ближній край (від ступень уздовж осі плитки) і висота матраца. Вісь плитки на екрані — 2 : 1 (`ISO_TILE`).
 */
const BED = (() => {
  const look = isoObjectLook("bed");
  const use = look.use;
  const box = look.footprint;
  const tile = Math.hypot(ISO_TILE.width, ISO_TILE.height) / 2;
  if (!use) return { edge: 25, far: 97, top: look.top };
  const f = use.facing;
  const near = f.x < 0 ? use.at.x - box.x1 : f.x > 0 ? box.x0 - use.at.x : f.y < 0 ? use.at.y - box.y1 : box.y0 - use.at.y;
  const far = f.x < 0 ? use.at.x - box.x0 : f.x > 0 ? box.x1 - use.at.x : f.y < 0 ? use.at.y - box.y0 : box.y1 - use.at.y;
  return { edge: near * tile, far: far * tile, top: look.top };
})();
/** Нахил осі плитки на екрані: одиниць угору (ззаду) чи вниз (спереду) на одиницю праворуч. */
const TILE_SLOPE = ISO_TILE.height / ISO_TILE.width;

/**
 * Засинає в ліжку (§8.8, поступ — `FALL_ASLEEP.eyes` у `DayScene`): позіхає (голова назад, плечі вгору), голова повільно
 * хилиться й підводиться, — і, зламавшись у стегнах, падає вперед на ліжко: таз на краю матраца, тулуб лежить уздовж ліжка
 * (по осі плитки: у ¾ ззаду — угору праворуч), руки — уздовж тіла, ступні на підлозі. Кінцева поза тримається, поки екран
 * темніє.
 *
 * Обертається до ліжка (`SLEEP_TURN`) у вихідній позі, між двома ключами `REST`: ракурс міняється одним кадром і дзеркалить
 * персонажа, тож будь-який нахил у цю мить перекинув би голову на другий бік ривком.
 */
function fallAsleep(s: Space): readonly Beat[] {
  const back = s.view === "back";
  const dir = { x: 1 / Math.hypot(1, TILE_SLOPE), y: (back ? -TILE_SLOPE : TILE_SLOPE) / Math.hypot(1, TILE_SLOPE) };
  // Таз — над самим краєм матраца (трохи не доходячи), на висоті матраца й половини тіла.
  const lie = { x: dir.x * BED.edge * 0.85, y: dir.y * BED.edge * 0.85 - BED.top - 9 };
  const hip = { x: lie.x, y: lie.y - PELVIS_Y };
  // Тулуб уздовж ліжка: кут у світі — кут осі плитки, вихідний — −90.
  const along = Math.atan2(dir.y, dir.x) / RAD + 90;
  // Падіння від вихідної пози (u = 0) до «лежить» (u = 1): таз іде до краю ліжка, тулуб лягає, ступні стоять (`through`).
  const falling = (u: number): Pose =>
    add(stance({ x: hip.x * u, y: hip.y * u }), { torso: { rot: along * u } }, nod(-6 * u), { "arm-near": { rot: -10 * u }, "arm-far": { rot: -6 * u } });
  return [
    [0, REST],
    [180, add(body(lean(-5, 1)), nod(-16), { "arm-near": { rot: 7 }, "arm-far": { rot: 5 } }, { "hand-near": { rot: 10 }, "hand-far": { rot: 10 } })],
    [450, add(body(lean(4, 0, 1)), nod(22), { "arm-near": { rot: -4 }, "arm-far": { rot: -3 } })],
    [570, REST],
    ...through(
      [
        [630, [0], "in"],
        [1000, [1]],
      ],
      ([u = 1]) => falling(u),
    ),
  ];
}

/**
 * Падає від виснаження (§8.8): хитається, ноги підкошуються — сідає на підлогу (ступні на місці, таз їде назад і вниз, руки
 * назад — спертися), і завалюється на спину. Ступні не ковзають: кути ніг рахує `stance`.
 */
function collapse(s: Space): readonly Beat[] {
  // Таз опустився на `drop`: прямі ноги від ступень до кісточок — таз назад на стільки, щоб упасти за них.
  const back = (drop: number): number => {
    const rise = LEG - drop;
    return Math.sqrt(Math.max(0, LEG * LEG + ANKLE_SIDE * ANKLE_SIDE - rise * rise)) + ANKLE_SIDE;
  };
  /**
   * Поза падіння: таз (назад на `x`, нижче на `drop`), нахил тулуба, голова і де кисті — на `hx` від таза вздовж підлоги й на
   * `hh` над нею. Руки тягнуться до кистей (вкорочуються, як у лікті): спершу звисають, тоді шукають підлогу позаду й
   * спираються на неї, поки тулуб опускається, а лежачи — вздовж тіла. Кути рук замість точок проводили б кисть крізь підлогу.
   */
  type Fall = readonly [x: number, drop: number, deg: number, head: number, hx: number, hh: number];
  const fall = ([x, drop, deg, head, hx, hh]: Fall): Pose => {
    const b: Body = { hip: { x, y: drop }, lean: deg };
    const hand = (side: Side): Part => s.point(side, b, { x: x + hx + (side === "near" ? -3 : 3), y: -hh });
    return add(stance({ x, y: drop }), { torso: { rot: deg } }, nod(head), { "arm-near": hand("near"), "arm-far": hand("far") });
  };
  const floor = -PELVIS_Y - 9;
  return [
    [0, REST],
    [180, add(body(lean(-6, 2)), nod(-8), { "arm-near": { rot: 8 }, "arm-far": { rot: -6 } })],
    // Ноги підкошуються: таз іде назад і вниз (ступні стоять), руки шукають підлогу позаду; сів — і завалюється на спину: руки
    // лягають уздовж тіла на підлогу, а не стирчать над ним (`through`: ступні й кисті не ковзають між ключами).
    ...through(
      [
        [340, [-2, 1, 10, 24, 2, 52], "in"],
        [450, [-back(8), 8, 16, 26, -2, 46], "in"],
        [560, [-back(24), 24, 22, 26, -10, 24]],
        [660, [-back(40), 40, 18, 22, -14, 4]],
        [740, [-back(floor), floor, 8, 18, -12, 2], "out"],
        [1000, [-back(floor), floor, -80, -8, 4, 3]],
      ],
      fall,
    ),
  ];
}

// --- Група ----------------------------------------------------------------------------------------

const MS = PERSON_ONE_SHOT_MS;

export const PERSON_CHORES = defineAnims(PERSON_RIG, {
  work: anim(2400, true, work, SIT_SLOTS),
  meeting: anim(2800, true, meeting, SIT_SLOTS),
  eat: anim(2000, true, eat, SIT_SLOTS),
  meds: anim(MS.meds, false, meds),
  drink: anim(MS.drink, false, drink),
  dress: anim(MS.dress, false, dress),
  litter: anim(1800, true, litter),
  clean: anim(1600, true, clean),
  washer: anim(MS.washer, false, washer),
  bowl: anim(MS.bowl, false, bowl),
  unpack: anim(MS.unpack, false, unpack),
  door: anim(MS.door, false, door),
  phone: anim(2000, true, phone, OVER_HELD),
  fallAsleep: anim(PROGRESS_MS, false, fallAsleep),
  collapse: anim(PROGRESS_MS, false, collapse),
  take: anim(MS.take, false, take),
  put: anim(MS.put, false, put),
  trash: anim(MS.trash, false, trash),
  fix: anim(1600, true, fix),
  bath: anim(1600, true, bath),
  tap: anim(MS.tap, false, tap),
  tend: anim(MS.tend, false, tend),
});
