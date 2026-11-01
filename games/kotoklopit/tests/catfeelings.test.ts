// Анімації кота «хвороби й почуття» (крок 16, хвиля 2, пакет N3, `src/view/rig/anims/cat/feelings.ts`): по колу — без
// ривка на стику, разові — з пози в ту саму позу (накладки — з нуля в нуль), «попереджає» сильніше й частіше за «терпить»,
// пози, спільні з групою `basic`, — ті самі, а `catOverlayOn` підганяє накладку під основу (хвіст навколо корінця, кіт на
// спині, лапи, що не стоять на підлозі).

import { describe, expect, it } from "vitest";

import { CAT_OVERLAYS } from "../src/view/anim/ids";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { CAT_FEELINGS, catOverlayOn } from "../src/view/rig/anims/cat/feelings";
import { CAT_RIG } from "../src/view/rig/defs/cat";
import { animProblems, Rig, sampleNumber, sampleVec } from "../src/view/rig/rigcore";
import type { AnimOf, BoneTracks, Key, RigDef, Vec2 } from "../src/view/rig/types";

type CatAnim = AnimOf<typeof CAT_RIG>;
type View = "front" | "back";
const VIEWS: readonly View[] = ["front", "back"];
const BONES = CAT_RIG.bones.map((bone) => bone.id);
const SLOTS = CAT_RIG.slots.map((slot) => slot.id);
const FEELINGS = Object.entries(CAT_FEELINGS) as [keyof typeof CAT_FEELINGS, CatAnim][];
const DEG = Math.PI / 180;

/** Доріжки кістки в ракурсі: основні з перевизначеннями ракурсу (канал за каналом). */
function tracksOf(anim: CatAnim, view: View, bone: (typeof BONES)[number]): BoneTracks {
  return { ...anim.bones?.[bone], ...anim.views?.[view]?.bones?.[bone] };
}

/** Усі канали кісток анімації в момент `t`: «кістка.канал» → числа. */
function channels(anim: CatAnim, view: View, t: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const v: Vec2 = { x: 0, y: 0 };
  for (const bone of BONES) {
    const tracks = tracksOf(anim, view, bone);
    if (tracks.rot) out[`${bone}.rot`] = [sampleNumber(tracks.rot, t)];
    if (tracks.pos) out[`${bone}.pos`] = Object.values(sampleVec(tracks.pos, t, v));
    if (tracks.scale) out[`${bone}.scale`] = Object.values(sampleVec(tracks.scale, t, v));
  }
  return out;
}

/** Найбільша різниця двох наборів каналів. */
function gap(a: Record<string, number[]>, b: Record<string, number[]>): number {
  let worst = 0;
  for (const [key, list] of Object.entries(a)) list.forEach((x, i) => (worst = Math.max(worst, Math.abs(x - (b[key]?.[i] ?? NaN)))));
  return worst;
}

/** Поза скелета (без арту — числа визначення): світові перетворення кісток і z та видимість слотів. */
function poseOf(anim: CatAnim, view: View, t: number): number[] {
  const rig = new Rig(CAT_RIG, { facing: { view } });
  rig.play(anim, 0, { blend: 0, from: t });
  rig.evaluate(0);
  const out: number[] = [];
  for (const bone of BONES) {
    const w = rig.bone(bone).world;
    out.push(w.a, w.b, w.c, w.d, w.tx, w.ty);
  }
  for (const slot of SLOTS) out.push(rig.slot(slot).z, rig.slot(slot).visible ? 1 : 0);
  return out;
}

/** Основа й накладка в момент `t` — одна статична поза: rot і pos додаються, scale множиться (як у вигляді). */
function layered(base: CatAnim, overlay: CatAnim, view: View, t: number): CatAnim {
  const v: Vec2 = { x: 0, y: 0 };
  const bones: Partial<Record<(typeof BONES)[number], BoneTracks>> = {};
  for (const bone of BONES) {
    const a = tracksOf(base, view, bone);
    const b = tracksOf(overlay, view, bone);
    const rot = (a.rot ? sampleNumber(a.rot, 0) : 0) + (b.rot ? sampleNumber(b.rot, t) : 0);
    const pa = a.pos ? { ...sampleVec(a.pos, 0, v) } : { x: 0, y: 0 };
    const pb = b.pos ? { ...sampleVec(b.pos, t, v) } : { x: 0, y: 0 };
    const sa = a.scale ? { ...sampleVec(a.scale, 0, v) } : { x: 1, y: 1 };
    const sb = b.scale ? { ...sampleVec(b.scale, t, v) } : { x: 1, y: 1 };
    bones[bone] = { rot: [{ t: 0, v: rot }], pos: [{ t: 0, v: { x: pa.x + pb.x, y: pa.y + pb.y } }], scale: [{ t: 0, v: { x: sa.x * sb.x, y: sa.y * sb.y } }] };
  }
  return { duration: 1, loop: true, bones };
}

/**
 * Наскільки корінець хвоста (за `TAIL_ROOT` = (3,5; 0,5) від pivot у системі тулуба) відійшов від свого місця на тулубі:
 * поворот хвоста навколо самого pivot виніс би його за силует крупа.
 */
function tailRootDrift(anim: CatAnim, view: View): number {
  const rig = new Rig(CAT_RIG, { facing: { view } });
  rig.play(anim, 0, { blend: 0 });
  rig.evaluate(0);
  const setup = rig.boneSetup("tail");
  const root = { x: 3.5, y: 0.5 };
  const c = Math.cos(-setup.rot * DEG);
  const s = Math.sin(-setup.rot * DEG);
  const local = { x: root.x * c - root.y * s, y: root.x * s + root.y * c };
  const w = rig.bone("tail").world;
  const b = rig.bone("body").world;
  const at = { x: w.a * local.x + w.c * local.y + w.tx, y: w.b * local.x + w.d * local.y + w.ty };
  const want = { x: b.a * (setup.x + root.x) + b.c * (setup.y + root.y) + b.tx, y: b.b * (setup.x + root.x) + b.d * (setup.y + root.y) + b.ty };
  return Math.hypot(at.x - want.x, at.y - want.y);
}

const still = (t: number, v: number): Key<number>[] => [{ t, v }];
/** Хвіст основи під кутом `rot`, повернутий навколо корінця (як `catTail` групи `basic`). */
function tailAt(rot: number): BoneTracks {
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  return { rot: still(0, rot), pos: [{ t: 0, v: { x: 3.5 - (3.5 * c - 0.5 * s), y: 0.5 - (3.5 * s + 0.5 * c) } }] };
}
/** Основи для перевірки `catOverlayOn` (групи `basic` у цьому пакеті ще може не бути): сидить, на спині, звисає на руках. */
const SITS: CatAnim = {
  duration: 1000,
  loop: true,
  bones: {
    pelvis: { rot: still(0, -32), pos: [{ t: 0, v: { x: 0, y: 2 } }] },
    "leg-back-near": { scale: [{ t: 0, v: { x: 1.05, y: 1 } }] },
    "leg-back-far": { rot: still(0, 12) },
    "leg-front-near": { rot: still(0, 32), pos: [{ t: 0, v: { x: -4, y: 7 } }], scale: [{ t: 0, v: { x: 1.12, y: 1 } }] },
    "leg-front-far": { rot: still(0, 32), pos: [{ t: 0, v: { x: -5, y: 8.7 } }], scale: [{ t: 0, v: { x: 1.12, y: 1 } }] },
    tail: tailAt(-95),
  },
};
const ON_BACK: CatAnim = { duration: 1000, loop: true, bones: { pelvis: { scale: [{ t: 0, v: { x: 1, y: -1 } }], pos: [{ t: 0, v: { x: 4, y: 3 } }] }, tail: tailAt(-75) } };
const HANGS: CatAnim = { duration: 1000, loop: true, bones: { pelvis: { rot: still(0, -12), pos: [{ t: 0, v: { x: 0, y: 13 } }] }, tail: tailAt(-165) } };
const STANDS: CatAnim = { duration: 1000, loop: true };

describe("анімації «хвороби й почуття»", () => {
  it("по колу — перший і останній кадр збігаються; разові — з тієї самої пози в ту саму, накладки — з нуля в нуль", () => {
    for (const [name, anim] of FEELINGS) {
      for (const view of VIEWS) {
        const start = channels(anim, view, 0);
        const end = channels(anim, view, anim.duration);
        expect({ name, view, seam: gap(start, end) < 1e-9 }).toEqual({ name, view, seam: true });
        if (anim.loop || !CAT_OVERLAYS.has(name)) continue;
        for (const [key, list] of Object.entries(start)) {
          const neutral = key.endsWith(".scale") ? 1 : 0;
          expect({ name, key, neutral: list.every((x) => Math.abs(x - neutral) < 1e-9) }).toEqual({ name, key, neutral: true });
        }
      }
    }
  });

  it("«попереджає» б'є хвостом ширше й частіше, ніж «терпить» сіпає (рішення автора 2026-10-30, п. 4)", () => {
    const swing = (anim: CatAnim): { amp: number; perSecond: number } => {
      const rot = anim.bones?.tail?.rot ?? [];
      const amp = Math.max(...rot.map((k) => k.v));
      // Удар — ключ, де хвіст піднявся вище за половину розмаху й далі опускається.
      let beats = 0;
      rot.forEach((k, i) => {
        if (k.v > amp / 2 && (rot[i + 1]?.v ?? 0) < k.v && (rot[i - 1]?.v ?? 0) <= k.v) beats++;
      });
      return { amp, perSecond: (beats * 1000) / anim.duration };
    };
    const warn = swing(CAT_FEELINGS.warn);
    const reluctant = swing(CAT_FEELINGS.reluctant);
    expect(warn.amp).toBeGreaterThanOrEqual(3 * reluctant.amp);
    expect(warn.perSecond).toBeGreaterThan(reluctant.perSecond);
  });

  const basicReady = Object.keys(CAT_ANIMS.sit.bones ?? {}).length > 0 && Object.keys(CAT_ANIMS.sleep.bones ?? {}).length > 0;
  it.skipIf(!basicReady)("чухання й тертя очей починаються й закінчуються так, як кіт сидить; хропіння — той самий клубок, що й сон", () => {
    for (const view of VIEWS) {
      const sit = poseOf(CAT_ANIMS.sit, view, 0);
      const sleep = poseOf(CAT_ANIMS.sleep, view, 0);
      for (const [name, anim] of [
        ["itch", CAT_FEELINGS.itch],
        ["rubEyes", CAT_FEELINGS.rubEyes],
      ] as const) {
        for (const t of [0, anim.duration]) {
          const pose = poseOf(anim, view, t);
          expect({ name, view, t, gap: Math.max(...pose.map((x, i) => Math.abs(x - (sit[i] ?? NaN)))) < 1e-6 }).toEqual({ name, view, t, gap: true });
        }
      }
      const snore = poseOf(CAT_FEELINGS.snore, view, 0);
      expect({ view, gap: Math.max(...snore.map((x, i) => Math.abs(x - (sleep[i] ?? NaN)))) < 1e-6 }).toEqual({ view, gap: true });
    }
  });
});

describe("catOverlayOn: накладка, підігнана під основу", () => {
  const overlays = FEELINGS.filter(([name]) => CAT_OVERLAYS.has(name));

  it("та сама пара — той самий об'єкт; доріжки — за скелетом", () => {
    for (const [name, overlay] of overlays) {
      for (const base of [SITS, ON_BACK, HANGS, STANDS]) {
        const fitted = catOverlayOn(overlay, base);
        expect(catOverlayOn(overlay, base)).toBe(fitted);
        expect({ duration: fitted.duration, loop: fitted.loop }).toEqual({ duration: overlay.duration, loop: overlay.loop });
        expect(animProblems(CAT_RIG as unknown as RigDef<string, string, string>, fitted, name)).toEqual([]);
      }
    }
  });

  it("корінець хвоста лишається на місці, хоч би під яким кутом лежав хвіст основи", () => {
    for (const [name, overlay] of overlays) {
      const keys = overlay.bones?.tail?.rot;
      if (!keys) continue;
      for (const base of [SITS, ON_BACK, HANGS, STANDS]) {
        const fitted = catOverlayOn(overlay, base);
        for (const view of VIEWS) {
          for (const { t } of keys) expect({ name, view, t, drift: tailRootDrift(layered(base, fitted, view, t), view) < 1e-6 }).toEqual({ name, view, t, drift: true });
        }
      }
    }
  });

  it("на спині (таз віддзеркалено згори донизу) кістки під тазом повертаються навпаки — хвіст б'є над підлогою, а не крізь неї", () => {
    const warn = catOverlayOn(CAT_FEELINGS.warn, ON_BACK);
    const upright = catOverlayOn(CAT_FEELINGS.warn, SITS);
    for (const bone of ["neck", "head"] as const) {
      const a = warn.bones?.[bone]?.rot ?? [];
      const b = upright.bones?.[bone]?.rot ?? [];
      expect(a.length).toBeGreaterThan(0);
      expect(a.map((k) => k.v + 0)).toEqual(b.map((k) => -k.v + 0));
    }
    // Хвіст — навпаки й стиснутий до розмаху, що не заходить за силует, з тим самим ритмом (ключ у ключ).
    const a = warn.bones?.tail?.rot ?? [];
    const b = upright.bones?.tail?.rot ?? [];
    const peak = Math.max(...b.map((k) => Math.abs(k.v)));
    const gain = Math.max(...a.map((k) => Math.abs(k.v))) / peak;
    expect(gain).toBeLessThan(1);
    expect(gain * peak).toBeGreaterThanOrEqual(35);
    a.forEach((k, i) => expect(k.v).toBeCloseTo(-(b[i]?.v ?? NaN) * gain, 9));
  });

  it("на спині хвіст б'є збоку від кота: кінчик не заходить за круп до задніх лап і не пробиває підлогу", () => {
    for (const [name, overlay] of overlays) {
      const keys = overlay.bones?.tail?.rot;
      if (!keys) continue;
      const fitted = catOverlayOn(overlay, ON_BACK);
      for (const { t } of keys) {
        const rig = new Rig(CAT_RIG, { facing: { view: "front" } });
        rig.play(layered(ON_BACK, fitted, "front", t), 0, { blend: 0 });
        rig.evaluate(0);
        const tail = rig.bone("tail");
        const tip = { x: tail.world.a * tail.len + tail.world.tx, y: tail.world.b * tail.len + tail.world.ty };
        const hips = Math.min(rig.bone("leg-back-near").world.tx, rig.bone("leg-back-far").world.tx);
        expect({ name, t, beside: tip.x < hips - 6, above: tip.y < 0 }).toEqual({ name, t, beside: true, above: true });
      }
    }
  });

  it("на руках (хвіст звисає під тулуб) «терпить» сіпає ширше — кінчик вилітає з-за стегна; під рукою й ззаду — як був", () => {
    const peak = (anim: CatAnim, view: View): number => Math.max(...(tracksOf(anim, view, "tail").rot ?? []).map((k) => Math.abs(k.v)));
    const own = peak(CAT_FEELINGS.reluctant, "front");
    const held = catOverlayOn(CAT_FEELINGS.reluctant, HANGS);
    expect(peak(held, "front")).toBeGreaterThanOrEqual(40);
    expect(peak(held, "back")).toBeCloseTo(own, 9);
    expect(peak(catOverlayOn(CAT_FEELINGS.reluctant, SITS), "front")).toBeCloseTo(own, 9);
    // «Попереджає» й так б'є широко — не змінюється.
    expect(peak(catOverlayOn(CAT_FEELINGS.warn, HANGS), "front")).toBeCloseTo(peak(CAT_FEELINGS.warn, "front"), 9);
  });

  it("«пручається» під рукою: таз стоїть, тож лапи, що стоять на підлозі, не ковзають", () => {
    const fitted = catOverlayOn(CAT_FEELINGS.struggle, SITS);
    expect(fitted.bones?.pelvis).toBeUndefined();
    for (const view of VIEWS) {
      const paws = (t: number): Vec2[] => {
        const rig = new Rig(CAT_RIG, { facing: { view } });
        rig.play(layered(SITS, fitted, view, t), 0, { blend: 0 });
        rig.evaluate(0);
        return (["leg-back-near", "leg-back-far", "leg-front-far"] as const).map((leg) => {
          const bone = rig.bone(leg);
          return { x: bone.world.a * bone.len + bone.world.tx, y: bone.world.b * bone.len + bone.world.ty };
        });
      };
      const start = paws(0);
      let worst = 0;
      for (let t = 0; t <= fitted.duration; t += 10) {
        paws(t).forEach((p, i) => (worst = Math.max(worst, Math.hypot(p.x - (start[i]?.x ?? NaN), p.y - (start[i]?.y ?? NaN)))));
      }
      expect({ view, slide: worst < 0.8 }).toEqual({ view, slide: true });
    }
  });

  it("«пручається»: лапи, що стоять на підлозі, не брикаються; ті, що звисають на руках, — брикаються", () => {
    const standing = catOverlayOn(CAT_FEELINGS.struggle, STANDS);
    const hanging = catOverlayOn(CAT_FEELINGS.struggle, HANGS);
    expect(standing.bones?.["leg-back-near"]).toBeUndefined();
    expect(standing.bones?.["leg-back-far"]).toBeUndefined();
    for (const leg of ["leg-back-near", "leg-back-far"] as const) {
      const rot = hanging.bones?.[leg]?.rot ?? [];
      expect(Math.max(...rot.map((k) => Math.abs(k.v)))).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("хода, разові й обличчя «хвороб»", () => {
  /** Подушечка лапи в момент `t` анімації (ракурс `view`). */
  function paw(anim: CatAnim, view: View, leg: (typeof BONES)[number], t: number): Vec2 {
    const rig = new Rig(CAT_RIG, { facing: { view } });
    rig.play(anim, 0, { blend: 0, from: t });
    rig.evaluate(0);
    const bone = rig.bone(leg);
    return { x: bone.world.a * bone.len + bone.world.tx, y: bone.world.b * bone.len + bone.world.ty };
  }

  it("кульгання: передні лапи на підлозі не ковзають (ідуть назад зі швидкістю ходи) і не пірнають; здорова стоїть довше за половину циклу, хвора торкається", () => {
    const anim = CAT_FEELINGS.limp;
    // Швидкість ходи групи `basic`: за цикл кіт ступає 4 · 1,08 · sin 34° довжин лапи (20,5).
    const speed = (4 * 1.08 * Math.sin(34 * DEG) * 20.5) / anim.duration;
    for (const view of VIEWS) {
      for (const [leg, share] of [
        ["leg-front-far", 0.52],
        ["leg-front-near", 0.12],
      ] as const) {
        const rest = new Rig(CAT_RIG, { facing: { view } }).evaluate(0).bone(leg);
        const floor = rest.world.b * rest.len + rest.world.ty;
        let down = 0;
        let deepest = -Infinity;
        const dt = 2;
        let prev = paw(anim, view, leg, 0);
        for (let t = dt; t <= anim.duration; t += dt) {
          const now = paw(anim, view, leg, t);
          deepest = Math.max(deepest, now.y - floor);
          if (Math.abs(now.y - floor) < 0.02 && Math.abs(prev.y - floor) < 0.02) {
            down += dt;
            expect({ view, leg, t, slide: Math.abs((prev.x - now.x) / dt - speed) < 0.01 }).toEqual({ view, leg, t, slide: true });
          }
          prev = now;
        }
        expect({ view, leg, sinks: deepest > 0.05 }).toEqual({ view, leg, sinks: false });
        expect(down / anim.duration).toBeGreaterThanOrEqual(share);
      }
    }
  });

  it("чухання: лапа чеше голову за вухом — подушечка на потилиці, і спереду, і ззаду", () => {
    const anim = CAT_FEELINGS.itch;
    for (const view of VIEWS) {
      for (let t = 200; t < 1300; t += 45) {
        const rig = new Rig(CAT_RIG, { facing: { view } });
        rig.play(anim, 0, { blend: 0, from: t });
        rig.evaluate(0);
        const leg = rig.bone("leg-back-near");
        const p = { x: leg.world.a * leg.len + leg.world.tx, y: leg.world.b * leg.len + leg.world.ty };
        const h = rig.bone("head").world;
        const det = h.a * h.d - h.b * h.c;
        const local = { x: (h.d * (p.x - h.tx) - h.c * (p.y - h.ty)) / det, y: (-h.b * (p.x - h.tx) + h.a * (p.y - h.ty)) / det };
        // Потилиця за вухом: позаду pivot голови й вище за нього, нижче за основу вуха (−15,5).
        expect({ view, t, behindEar: local.x > -9 && local.x < 0 && local.y > -14 && local.y < -3 }).toEqual({ view, t, behindEar: true });
      }
    }
  });

  it("блювання починається й закінчується пригніченим: хвіст низько, а не «знаком питання»", () => {
    const rot = CAT_FEELINGS.vomit.bones?.tail?.rot ?? [];
    expect(rot.length).toBeGreaterThan(0);
    for (const t of [0, CAT_FEELINGS.vomit.duration]) expect(sampleNumber(rot, t)).toBeLessThanOrEqual(-60);
  });

  it("чхання не розплющує очей (кіт, що спить, чхає з заплющеними)", () => {
    const eyes = CAT_FEELINGS.sneeze.slots?.eyes?.frame ?? [];
    expect(eyes.length).toBeGreaterThan(0);
    expect(new Set(eyes.map((k) => k.v))).toEqual(new Set(["closed"]));
  });
});
