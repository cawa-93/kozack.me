// Анімації персонажа — справи (крок 16, хвиля 2, пакет N4b; назви й що кожна означає — `anim/ids.ts`, `PERSON_ANIM_GROUPS.chores`;
// де й коли їх обирають — `anim/personanim.ts`, де персонаж стоїть чи сидить біля речі — `world/objects.ts`).
//
// Формат — `rig/types.ts`: доріжки відносно вихідної пози ракурсу (кут у градусах за годинниковою, y донизу). Тут анімації
// задано позами в ключові моменти (`Beat`): поза — поправки кісток, а з послідовності поз збираються доріжки. Між ключами —
// м'який перехід (`inOut`), тож рух розганяється й гальмує, як живий.
//
// Скелет персонажа не має ліктів і колін: рука й нога — один кадр. Тому:
// - сидить — нога пряма від стегна до кісточки, навскіс уперед до підлоги;
// - тягнеться до близького — рука вкорочена вздовж себе (рука, що йде вглиб чи до камери, у ракурсі ¾ і так коротшає);
// - до підлоги — нахиляється в стегнах, а ноги стоять прямо (присісти без колін не можна).
//
// Ракурс ¾ має глибину: руки тягнуться до точки «на f попереду, на висоті h, на n убік» (`Space.at`, `Space.reach`), а
// проєкція ракурсу кладе її на екран — у ¾ ззаду те, що попереду, вище на екрані, у ¾ спереду — нижче. Тому доріжки рук і ніг
// рахуються для кожного ракурсу окремо: основні — для ¾ спереду, перевизначення — для ¾ ззаду (`views.back`). Більшість справ
// персонаж робить спиною до камери (комп'ютер, стіл, кухня, ванна), тож їх підганяли передусім за ¾ ззаду; у ¾ спереду
// ближня рука, що тягнеться вперед, перетинає груди — тому там уперед частіше тягнеться дальня, а ближня — на рівні грудей.
//
// Ноги стоять: де таз зсувається (нахил, сидіння, падіння), кути ніг рахує `stance` — ступні лишаються на своїх місцях на
// підлозі, а стопи — рівно. Річ у руках (гніздо `held` на кисті ближньої руки) кисть тримає рівно (`level`): тарілка не
// перекидається, пилосос стоїть. Разові починаються й закінчуються у вихідній позі (з неї м'яко повертається основна), по
// колу — перший і останній ключі однакові, за поступом (засинання, падіння) — від вихідної пози до кінцевої.

import { PERSON_ONE_SHOT_MS } from "../../../anim/ids";
import type { ArtView } from "../../../art/types";
import { PERSON_RIG } from "../../defs/person";
import { defineAnims, type BoneOf, type BoneTracks, type Ease, type Key, type RigTracks, type SlotOf, type Vec2 } from "../../types";

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
      const torso = (-90 + body.lean) * RAD;
      const sx = body.hip.x + s.x * Math.cos(torso) - s.y * Math.sin(torso);
      const sy = PELVIS_Y + body.hip.y + s.x * Math.sin(torso) + s.y * Math.cos(torso);
      return armPart(body, target.x - sx, target.y - sy);
    },
  };
}

const SPACES: Readonly<Record<ArtView, Space>> = { front: space("front"), back: space("back") };

/**
 * Ноги стоять, коли таз зсунуто на `hip`: ступні — на `near` і `far` від вихідних місць. Нога — пряма від стегна до кісточки
 * (довша не стає: не дістає — ступня трохи в повітрі; коротша — вкорочена вздовж себе), стопа — рівно (носок уперед).
 */
function stance(hip: Vec2, near: Vec2 = { x: 0, y: 0 }, far: Vec2 = near): Pose {
  const leg = (foot: Vec2): { leg: Part; foot: Part } => {
    const dx = foot.x - hip.x;
    const dy = LEG + foot.y - hip.y;
    const phi = Math.atan2(dy, dx) / RAD;
    const k = Math.min(1, Math.hypot(dx, dy) / LEG);
    // Вкорочена нога стискає й стопу (вона — дочірня): стопа впоперек ноги, тож розтягнути її навпаки.
    return { leg: k < 1 ? { rot: phi - 90, scale: { x: k, y: 1 } } : { rot: phi - 90 }, foot: k < 1 ? { rot: 90 - phi, scale: { x: 1, y: 1 / k } } : { rot: 90 - phi } };
  };
  const n = leg(near);
  const f = leg(far);
  return { pelvis: { pos: hip }, "leg-near": n.leg, "foot-near": n.foot, "leg-far": f.leg, "foot-far": f.foot };
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

/**
 * Анімація з поз для кожного ракурсу: основні доріжки — ¾ спереду, а `views.back` — лише ті доріжки ¾ ззаду, що
 * відрізняються.
 */
function anim(duration: number, loop: boolean, beats: (s: Space) => readonly Beat[]) {
  const front = bonesOf(beats(SPACES.front));
  const back = bonesOf(beats(SPACES.back));
  const diff: Partial<Record<Bone, BoneTracks>> = {};
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
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
  return { duration, loop, bones: front, ...(Object.keys(diff).length > 0 ? { views: { back: { bones: diff } } } : {}) };
}

// --- Спільні пози -------------------------------------------------------------------------------

const REST: Pose = {};
/** Тіло, нахилене на `lean`, таз — на `x`, `y`. */
const lean = (deg: number, x = 0, y = 0): Body => ({ hip: { x, y }, lean: deg });

/**
 * Сидить на стільці: таз опускається на сидіння (`PERSON_SEAT` над підлогою — як диван, `world/objects.ts`), ноги — навскіс
 * уперед до підлоги. Стільця скелет не малює (його дає вигляд біля стола, T2) — поза читається й без нього: таз низько,
 * ступні попереду.
 */
export const PERSON_SEAT = 34;
/** На скільки таз сидячи нижче, ніж стоячи: низ таза (≈ 12 під його центром) — на сидінні. */
const SIT_DROP = -PELVIS_Y - 12 - PERSON_SEAT;
/**
 * Ступні сидячи — попереду стегон (уперед по підлозі). У ¾ ззаду — під краєм стола; у ¾ спереду коліна йдуть до камери, тож
 * ступні ближче до тіла, а ноги коротші й круті (довга нога навскіс донизу читалася як «стоїть, відхилившись»).
 */
const SIT_FEET: Readonly<Record<ArtView, number>> = { back: 30, front: 14 };

/** Сидить, нахилений на `deg`: поза ніг і тіло (для рук). */
function seated(s: Space, deg: number): { pose: Pose; body: Body } {
  const b = lean(deg, -2, SIT_DROP);
  const feet = SIT_FEET[s.view];
  return { pose: body(b, s.step(feet), s.step(feet - 4)), body: b };
}

/** Стіл і клавіатура: стільниця 54 (`env/computer`, `env/table`), клавіатура й тарілка — за ≈ 40 перед тим, хто сидить. */
const DESK = 54;
const KEYS = 38;

// --- Стіл ---------------------------------------------------------------------------------------

/**
 * Працює за комп'ютером: друкує обома руками, зрідка тягнеться до миші й клацає, голова за екраном. У ¾ спереду (якщо вигляд
 * не розверне персонажа до стола) — ноутбук на колінах: дальня рука на клавішах, ближня — коло себе.
 */
function work(s: Space): readonly Beat[] {
  const { pose: sit, body: b } = seated(s, 6);
  const front = s.view === "front";
  const typing = (a: number): Pose =>
    add(
      sit,
      {
        "arm-near": front ? s.reach("near", b, 16, 46 + a, 10) : s.reach("near", b, KEYS, DESK + 3 + 2 * a, 2),
        "arm-far": front ? s.reach("far", b, 30, DESK - 6 - a, -8) : s.reach("far", b, KEYS, DESK + 3 - 2 * a, -8),
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
        "arm-near": front ? s.reach("near", b, 18, 46, 14) : s.reach("near", b, KEYS + 4, DESK + 3 - click, 16),
        "arm-far": front ? s.reach("far", b, 30, DESK - 6, -8) : s.reach("far", b, KEYS, DESK + 3, -8),
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
  const far = front ? s.reach("far", b, 22, 46, -8) : s.reach("far", b, KEYS - 4, DESK + 3, -10);
  const say = (f: number, h: number, w: number, head: number, tilt: number): Pose =>
    add(sit, { torso: { rot: tilt } }, { "arm-near": s.reach("near", { ...b, lean: b.lean + tilt }, f, h, 6), "arm-far": far }, wrist("near", w), nod(head));
  const rest = add(sit, { "arm-near": front ? s.reach("near", b, 16, 46, 10) : s.reach("near", b, KEYS - 4, DESK + 3, 4), "arm-far": far });
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
  const { pose: sit, body: b } = seated(s, 8);
  const front = s.view === "front";
  const far = front ? s.reach("far", b, 24, DESK - 4, -10) : s.reach("far", b, 34, DESK + 3, -12);
  // Рот: перед обличчям, трохи нижче середини голови (голова нахилена назустріч ложці).
  const chin = PELVIS_Y + SIT_DROP - 46;
  const mouth: Vec2 = front ? { x: 12, y: chin - 4 } : { x: 25, y: chin + 2 };
  const at = (hand: Part, tilt: number, head: number, w: number): Pose => add(sit, { torso: { rot: tilt } }, { "arm-near": hand, "arm-far": far }, wrist("near", w), nod(head));
  // У ¾ спереду ближня рука до тарілки перетинала б груди навскіс — там вона коротка, коло себе.
  const plate = (df: number, dh: number, tilt = 0): Part =>
    front ? s.reach("near", { ...b, lean: b.lean + tilt }, 16 + df, 48 + dh, 10) : s.reach("near", { ...b, lean: b.lean + tilt }, 34 + df, DESK + 4 + dh, 2);
  const lift = (tilt: number): Part => s.point("near", { ...b, lean: b.lean + tilt }, mouth);
  return [
    [0, at(plate(0, 0), 0, 6, 0)],
    [220, at(plate(3, -1, 2), 2, 9, 25)],
    [520, at(lift(6), 6, 10, -10), "out"],
    [680, at(lift(6), 6, 13, -10)],
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

/** Ліки: підносить таблетку до рота, закидає голову, ковтає (коту — та сама рука до рота кота на руках). */
function meds(s: Space): readonly Beat[] {
  // У ¾ ззаду обличчя праворуч від потилиці: кулак — перед ним, біля краю голови.
  const mouth: Vec2 = s.view === "front" ? { x: 8, y: PELVIS_Y - 54 } : { x: 27, y: PELVIS_Y - 46 };
  const swallowed: Vec2 = { x: mouth.x - 2, y: mouth.y - 4 };
  return [
    [0, REST],
    [250, add(body(lean(4)), { "arm-near": s.point("near", lean(4), mouth), "arm-far": { rot: 6 } }, nod(8))],
    [420, add(body(lean(-6)), { "arm-near": s.point("near", lean(-6), swallowed), "arm-far": { rot: 8 } }, nod(-22)), "out"],
    [560, add(body(lean(-4)), { "arm-near": s.reach("near", lean(-4), 14, 76, 10), "arm-far": { rot: 6 } }, nod(-16))],
    [700, add(body(lean(-1)), { "arm-near": { rot: -10 } }, nod(-3))],
    [900, REST],
  ];
}

/** Бере: тягнеться вперед на висоті грудей (холодильник, плита, стіл, шафка), хапає й забирає до себе; річ — рівно. */
function take(s: Space): readonly Beat[] {
  const reach = (b: Body, f: number, h: number, farRot: number, head: number): Pose =>
    level(add(body(b), { "arm-near": s.reach("near", b, f, h, 8), "arm-far": { rot: farRot } }, nod(head)));
  // Проміжні ключі — щоб річ лишалася рівно й між ними (кут кисті з вкороченою рукою не лінійний).
  return [
    [0, REST],
    [90, reach(lean(6), 24, 74, 5, 4)],
    [170, reach(lean(12, 1), 40, 92, 10, 8), "out"],
    [240, reach(lean(12, 1), 38, 90, 10, 8)],
    [300, reach(lean(7), 28, 86, 7, 5)],
    [360, reach(lean(3), 18, 80, 4, 3)],
    [410, reach(lean(1), 10, 66, 2, 1)],
    [450, REST],
  ];
}

/** Кладе: нахиляється, ставить річ уперед і трохи вниз, відпускає й випрямляється. */
function put(s: Space): readonly Beat[] {
  return [
    [0, REST],
    [180, add(body(lean(18, -2, 1)), { "arm-near": s.reach("near", lean(18, -2, 1), 38, 72, 8), "arm-far": { rot: 12 } }, wrist("near", 8), nod(10)), "out"],
    [260, add(body(lean(18, -2, 1)), { "arm-near": s.reach("near", lean(18, -2, 1), 40, 68, 8), "arm-far": { rot: 12 } }, wrist("near", -20), nod(10))],
    [360, add(body(lean(6)), { "arm-near": s.reach("near", lean(6), 22, 70, 8), "arm-far": { rot: 5 } }, wrist("near", -8), nod(4))],
    [450, REST],
  ];
}

/** Викидає: замах назад і кидок униз-уперед у смітник (до 46), дальня рука — навстріч для рівноваги. */
function trash(s: Space): readonly Beat[] {
  return [
    [0, REST],
    [150, add(body(lean(-5)), { "arm-near": { rot: 32 }, "arm-far": { rot: -10 } }, wrist("near", 15), nod(2))],
    [280, add(body(lean(16, 1)), { "arm-near": s.reach("near", lean(16, 1), 44, 52, 6), "arm-far": { rot: 18 } }, wrist("near", -30), nod(12)), "out"],
    [370, add(body(lean(13)), { "arm-near": s.reach("near", lean(13), 42, 56, 6), "arm-far": { rot: 12 } }, wrist("near", -12), nod(10))],
    [500, REST],
  ];
}

/** Кран котові: тягнеться до крана умивальника (≈ 85), повертає його і забирає руку. */
function tap(s: Space): readonly Beat[] {
  const at = (w: number): Pose => add(body(lean(16, -1)), { "arm-near": s.reach("near", lean(16, -1), 40, 86, 4), "arm-far": { rot: 8 } }, wrist("near", w), nod(10));
  return [
    [0, REST],
    [180, at(0), "out"],
    [260, at(40)],
    [340, at(-8)],
    [500, REST],
  ];
}

// --- Нахилившись до підлоги ---------------------------------------------------------------------

/** Нахилений до підлоги: тулуб уперед у стегнах, таз назад (рівновага) і трохи нижче. */
const stoop = (deg: number, back: number, drop = 2): Body => lean(deg, -back, drop);

/** Миски: нахиляється до миски, висипає совок (кисть перевертається), випрямляється; дальня рука спирається на коліно. */
function bowl(s: Space): readonly Beat[] {
  const low = stoop(56, 11, 3);
  const knee = s.reach("far", low, 14, 38, -8);
  const at = (f: number, h: number, w: number, head: number): Pose => add(body(low), { "arm-near": s.reach("near", low, f, h, 6), "arm-far": knee }, wrist("near", w), nod(head));
  return [
    [0, REST],
    [230, at(36, 14, 0, -10), "out"],
    [330, at(36, 14, 70, -10)],
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

/** Розпаковує: нахиляється над ящиком, розгортає клапани в боки, дістає річ і підносить до грудей. */
function unpack(s: Space): readonly Beat[] {
  const low = stoop(42, 8);
  const lower = stoop(54, 10, 3);
  const up = lean(6);
  return [
    [0, REST],
    [220, add(body(low), { "arm-near": s.reach("near", low, 38, 44, 4), "arm-far": s.reach("far", low, 36, 44, -4) }, nod(-8))],
    [420, add(body(low), { "arm-near": s.reach("near", low, 34, 50, 26), "arm-far": s.reach("far", low, 34, 50, -26) }, wrist("near", -20), wrist("far", 20), nod(-8))],
    [620, add(body(lower), { "arm-near": s.reach("near", lower, 36, 30, 4), "arm-far": s.reach("far", lower, 34, 30, -4) }, nod(-12))],
    [850, add(body(up), { "arm-near": s.reach("near", up, 22, 90, 4), "arm-far": s.reach("far", up, 20, 88, -4) }, nod(4)), "out"],
    [1100, REST],
  ];
}

/** Двері: тягнеться до ручки, прочиняє (відхиляється назад), нахиляється по пакунок (чи кота) і випрямляється з ним. */
function door(s: Space): readonly Beat[] {
  const low = stoop(50, 9, 3);
  const up = lean(4);
  return [
    [0, REST],
    [170, add(body(lean(10, 1)), { "arm-near": s.reach("near", lean(10, 1), 44, 88, 8), "arm-far": { rot: 8 } }, nod(4)), "out"],
    [320, add(body(lean(-6, -3)), { "arm-near": s.reach("near", lean(-6, -3), 22, 88, 10), "arm-far": { rot: 10 } }, wrist("near", -15), nod(-3))],
    [550, add(body(low), { "arm-near": s.reach("near", low, 36, 12, 6), "arm-far": s.reach("far", low, 34, 12, -6) }, nod(-10))],
    [730, add(body(up), { "arm-near": s.reach("near", up, 20, 80, 6), "arm-far": s.reach("far", up, 18, 78, -6) }, nod(2)), "out"],
    [900, REST],
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
 * Пилососить: ступні розставлені, ближня рука водить ручкою пилососа (`env/vacuum/cleaner` у гнізді `held`, кулак ≈ 76 над
 * підлогою — щітка на підлозі) вперед-назад, вага переходить з ноги на ногу, пилосос стоїть рівно.
 */
function vacuum(s: Space): readonly Beat[] {
  const near = s.step(16);
  const far = s.step(-12);
  // Ближня рука тримає ручку збоку (у ¾ спереду так вона менше перетинає груди), дальня — шланг біля стегна.
  const side = s.view === "front" ? 14 : 8;
  const at = (shift: number, f: number, tilt: number, head: number, bob = 1): Pose => {
    const b = lean(6 + shift * 0.8, shift, bob);
    return level(add(body(b, near, far), { "arm-near": s.reach("near", b, f, 76, side), "arm-far": s.reach("far", b, f - 30, 56, -14) }, nod(head)), tilt);
  };
  return [
    [0, at(-5, 22, -8, 6)],
    [560, at(8, 54, 8, 12, 3), "out"],
    [800, at(7, 50, 6, 11, 2)],
    [1400, at(-5, 22, -8, 6)],
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
 * Купає кота в душі: нахилився над піддоном (не сильно: кіт у гнізді `arms` нахиляється з тулубом), руки по черзі намилюють;
 * раз за цикл кіт хлюпає — персонаж відсахується, відвернувши голову, і миє далі.
 */
function bath(s: Space): readonly Beat[] {
  const at = (a: number): Pose => {
    const b = lean(16 + 2 * a, -3, 1);
    return add(body(b), { "arm-near": s.reach("near", b, 30 + 6 * a, 58 - 4 * a, 6), "arm-far": s.reach("far", b, 30 - 6 * a, 58 + 4 * a, -6) }, wrist("near", 15 * a), wrist("far", -15 * a), nod(10));
  };
  const splash = lean(4, -5, 0);
  return [
    [0, at(1)],
    [350, at(-1)],
    [700, at(1)],
    [820, add(body(splash), { "arm-near": s.reach("near", splash, 26, 70, 8), "arm-far": s.reach("far", splash, 24, 72, -8) }, nod(-16)), "out"],
    [1000, add(body(splash), { "arm-near": s.reach("near", splash, 27, 66, 8), "arm-far": s.reach("far", splash, 25, 68, -8) }, nod(-12))],
    [1280, at(-1)],
    [1600, at(1)],
  ];
}

/** Телефон: ближня рука тримає телефон біля вуха, дальня жестикулює, голова киває, вага з ноги на ногу. */
function phone(s: Space): readonly Beat[] {
  const front = s.view === "front";
  // Вухо ближнього боку: у ¾ спереду — на потилиці ліворуч від обличчя, ззаду — праворуч.
  const ear: Vec2 = { x: front ? -12 : 9, y: PELVIS_Y - 57 };
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
 * Засинає в ліжку (§8.8): біля ліжка позіхає й потягується, голова клює, і падає вперед на ліжко, як підкошений (опора —
 * носки). Кінцева поза тримається, поки екран темніє.
 */
function fallAsleep(s: Space): readonly Beat[] {
  // Падіння вперед навколо носків: корінь повертається, а зсув кореня тримає носки на місці.
  const toe = 12;
  const tip = (deg: number): Pose => ({ root: { rot: deg, pos: { x: toe - toe * Math.cos(deg * RAD), y: -toe * Math.sin(deg * RAD) } } });
  const stretch = lean(-6, 0, -1);
  return [
    [0, REST],
    [230, add(body(stretch), { "arm-near": s.reach("near", stretch, 8, 175, 10), "arm-far": s.reach("far", stretch, 6, 175, -10) }, nod(-20))],
    [390, add(body(lean(6, 0, 1)), { "arm-near": { rot: 6 }, "arm-far": { rot: 4 } }, nod(22))],
    [500, add(body(lean(2)), nod(4))],
    [660, add(body(lean(10, 0, 1)), { "arm-near": { rot: 8 }, "arm-far": { rot: 6 } }, nod(30)), "in"],
    [1000, add(tip(62), { torso: { rot: 4 } }, { "arm-near": { rot: -150 }, "arm-far": { rot: -160 } }, nod(-10), { "foot-near": { rot: 30 }, "foot-far": { rot: 30 } })],
  ];
}

/**
 * Падає від виснаження (§8.8): хитається, ноги підкошуються — сідає на підлогу (ступні на місці, таз їде назад і вниз, руки
 * назад — спертися), і завалюється на спину. Ступні не ковзають: кути ніг рахує `stance`.
 */
function collapse(_s: Space): readonly Beat[] {
  // Таз опускається на `drop`: прямі ноги від ступень — назад, щоб таз упав за них.
  const sink = (drop: number, deg: number, head: number, armsBack: number): Pose => {
    const rise = LEG - drop;
    const back = drop >= LEG ? LEG : Math.sqrt(LEG * LEG - rise * rise);
    return add(stance({ x: -back, y: drop }), { torso: { rot: deg } }, nod(head), { "arm-near": { rot: armsBack }, "arm-far": { rot: armsBack * 0.8 } });
  };
  const floor = -PELVIS_Y - 9;
  return [
    [0, REST],
    [180, add(body(lean(-6, 2)), nod(-8), { "arm-near": { rot: 8 }, "arm-far": { rot: -6 } })],
    [340, add(body(lean(10, -2, 1)), nod(24), { "arm-near": { rot: -6 }, "arm-far": { rot: 8 } })],
    [450, sink(8, 16, 26, 4), "in"],
    [560, sink(24, 22, 26, 14)],
    [660, sink(40, 18, 22, 26)],
    [740, sink(floor, 8, 18, 30), "out"],
    [1000, add(sink(floor, -80, -8, 0), { "arm-near": { rot: 8 }, "arm-far": { rot: -24 } })],
  ];
}

// --- Група ----------------------------------------------------------------------------------------

const MS = PERSON_ONE_SHOT_MS;

export const PERSON_CHORES = defineAnims(PERSON_RIG, {
  work: anim(2400, true, work),
  meeting: anim(2800, true, meeting),
  eat: anim(2000, true, eat),
  meds: anim(MS.meds, false, meds),
  litter: anim(1800, true, litter),
  clean: anim(1600, true, clean),
  vacuum: anim(1400, true, vacuum),
  washer: anim(MS.washer, false, washer),
  bowl: anim(MS.bowl, false, bowl),
  unpack: anim(MS.unpack, false, unpack),
  door: anim(MS.door, false, door),
  phone: anim(2000, true, phone),
  fallAsleep: anim(PROGRESS_MS, false, fallAsleep),
  collapse: anim(PROGRESS_MS, false, collapse),
  take: anim(MS.take, false, take),
  put: anim(MS.put, false, put),
  trash: anim(MS.trash, false, trash),
  fix: anim(1600, true, fix),
  bath: anim(1600, true, bath),
  tap: anim(MS.tap, false, tap),
});
