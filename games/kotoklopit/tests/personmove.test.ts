// Анімації руху персонажа (крок 16, хвиля 2, пакет N4a; `src/view/rig/anims/person/move.ts`): стопи стоять на підлозі й не
// ковзають — у ході опорна стопа йде назад рівно з кроком (`personGait`), у стоянні не зсувається; темп ходи
// (`personGaitSpeed`) — зі швидкості на екрані, і виснажений чи травмований не дрібочить частіше за здорового; цикли без
// ривка на стику; разові закінчуються вихідною позою (бере кота — позою «тримає кота»); накладки рук заміняють руки основної
// (`personWithArms`): річ рівно, кіт у руках не підстрибує; присівши, взуття рівно; ззаду руки «в боки» — дзеркально.

import { describe, expect, it } from "vitest";

import { ILLNESS_EFFECTS } from "../src/sim/config";
import { PERSON_OVERLAYS } from "../src/view/anim/ids";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import { PERSON_MOVE, PERSON_OWN_ARMS, personGait, personGaitSpeed, personWithArms, type PersonGait } from "../src/view/rig/anims/person/move";
import { Rig, animProblems, sampleNumber, sampleVec } from "../src/view/rig/rigcore";
import type { ArtView } from "../src/view/art/types";
import type { BoneTracks, RigAnim, RigDef } from "../src/view/rig/types";

type LooseAnim = RigAnim<string, string>;
type Name = keyof typeof PERSON_MOVE;
type PersonAnim = (typeof PERSON_MOVE)[Name];
const ANIMS = PERSON_MOVE as unknown as Readonly<Record<Name, LooseAnim>>;
const VIEWS: readonly ArtView[] = ["front", "back"];
type LooseRig = Rig<string, string, string>;

/** Кісточки (початок кістки стопи) у системі кореня. */
function ankles(rig: LooseRig): { near: { x: number; y: number }; far: { x: number; y: number } } {
  const at = (id: string): { x: number; y: number } => {
    const m = rig.bone(id).world;
    return { x: m.tx, y: m.ty };
  };
  return { near: at("foot-near"), far: at("foot-far") };
}

function rigFor(view: ArtView, proportions: string[] = []): LooseRig {
  return new Rig(PERSON_RIG, { facing: { view, flip: false }, proportions }) as unknown as LooseRig;
}

/** Кут осі x кістки у світі, градуси, і перекіс її осей (відхилення кута між ними від 90°). */
function axes(rig: LooseRig, id: string): { rot: number; skew: number } {
  const m = rig.bone(id).world;
  const rot = Math.atan2(m.b, m.a) / (Math.PI / 180);
  const skew = Math.abs(Math.acos((m.a * m.c + m.b * m.d) / (Math.hypot(m.a, m.b) * Math.hypot(m.c, m.d))) / (Math.PI / 180) - 90);
  return { rot, skew };
}

const GAITS: readonly PersonGait[] = ["walk", "dash", "limp", "trudge", "dizzy"];

/** Стоїть на місці: обидві стопи не рухаються. */
const STANDING: readonly Name[] = ["idle", "pet", "rod", "sick", "exhausted", "refuse", "pickUp", "putDown"];

describe("рух персонажа: стопи", () => {
  for (const gait of GAITS) {
    it(`${gait}: опорна стопа на підлозі йде назад рівно з кроком (не ковзає), жодна не йде під підлогу`, () => {
      const anim = ANIMS[gait];
      const info = personGait(gait);
      expect(info.ms).toBe(anim.duration);
      const cycle = anim.duration / info.cycles;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.evaluate(0);
        const ground = ankles(rig);
        rig.play(anim, 0, { blend: 0 });
        const speed = info.stride / anim.duration;
        for (const leg of ["near", "far"] as const) {
          const [from, to] = info[leg];
          // Усередині опори першого циклу (без країв, де стопа стає й відривається).
          const a = (from + 0.04) * cycle;
          const b = (to - 0.04) * cycle;
          rig.evaluate(a);
          const start = ankles(rig)[leg];
          for (let t = a; t <= b; t += (b - a) / 12) {
            rig.evaluate(t);
            const ankle = ankles(rig)[leg];
            expect(Math.abs(ankle.x - (start.x - speed * (t - a))), `${view} ${leg} x @${t}`).toBeLessThan(0.6);
            expect(Math.abs(ankle.y - ground[leg].y), `${view} ${leg} y @${t}`).toBeLessThan(0.6);
          }
        }
        for (let t = 0; t < anim.duration; t += anim.duration / (50 * info.cycles)) {
          rig.evaluate(t);
          const now = ankles(rig);
          expect(now.near.y - ground.near.y).toBeLessThan(0.6);
          expect(now.far.y - ground.far.y).toBeLessThan(0.6);
        }
      }
    });
  }

  it("стоячи (стоїть, гладить, вудочка, хворий, виснажений, відмова, бере й опускає кота) стопи не зсуваються й не йдуть під підлогу", () => {
    for (const name of STANDING) {
      const anim = ANIMS[name];
      for (const view of VIEWS) {
        for (const proportions of [[], ["stocky"], ["slim"]]) {
          const rig = rigFor(view, proportions);
          rig.evaluate(0);
          const ground = ankles(rig);
          rig.play(anim, 0, { blend: 0 });
          for (let t = 0; t <= anim.duration; t += anim.duration / 40) {
            rig.evaluate(t);
            const now = ankles(rig);
            for (const leg of ["near", "far"] as const) {
              expect(Math.abs(now[leg].x - ground[leg].x), `${name} ${view} ${leg} x @${t}`).toBeLessThan(0.8);
              expect(Math.abs(now[leg].y - ground[leg].y), `${name} ${view} ${leg} y @${t}`).toBeLessThan(0.8);
            }
          }
        }
      }
    }
  });

  it("присівши (гладить, бере й опускає кота) взуття стоїть рівно, без перекосу", () => {
    for (const name of ["pet", "pickUp", "putDown"] as const) {
      const anim = ANIMS[name];
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(anim, 0, { blend: 0 });
        for (let t = 0; t <= anim.duration; t += anim.duration / 20) {
          rig.evaluate(t);
          for (const foot of ["foot-near", "foot-far"]) {
            const { rot, skew } = axes(rig, foot);
            expect(Math.abs(rot), `${name} ${view} ${foot} кут @${t}`).toBeLessThan(1);
            expect(skew, `${name} ${view} ${foot} перекіс @${t}`).toBeLessThan(1);
          }
        }
      }
    }
  });
});

describe("рух персонажа: темп ходи", () => {
  /** Швидкість кореня на екрані за швидкості відтворення `speed`, одиниць арту за секунду. */
  const rootSpeed = (gait: PersonGait, speed: number): number => (speed * personGait(gait).stride * 1000) / personGait(gait).ms;

  it("по горизонталі стопи не ковзають: хода проходить рівно стільки, скільки персонаж по екрану", () => {
    for (const gait of GAITS) {
      expect(rootSpeed(gait, personGaitSpeed(gait, 362, 0))).toBeCloseTo(362, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, -362, 0))).toBeCloseTo(362, 6);
      // Уздовж осі клітинки: 4 клітинки за секунду — 256 по горизонталі й 128 по вертикалі.
      expect(rootSpeed(gait, personGaitSpeed(gait, 256, 128))).toBeCloseTo(256, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, -256, -128))).toBeCloseTo(256, 6);
      expect(personGaitSpeed(gait, 0, 0)).toBe(0);
    }
  });

  it("угору й униз екрана ноги не стоять: темп — 0,7 від швидкості по підлозі (вертикаль ромба стиснута вдвічі)", () => {
    for (const gait of GAITS) {
      expect(rootSpeed(gait, personGaitSpeed(gait, 0, -181))).toBeCloseTo(0.7 * 362, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, 0, 181))).toBeCloseTo(0.7 * 362, 6);
      // Навскіс між віссю клітинки й вертикаллю — не повільніше.
      expect(rootSpeed(gait, personGaitSpeed(gait, 100, -160))).toBeGreaterThanOrEqual(0.7 * Math.hypot(100, 320) - 1e-9);
    }
  });

  it("за швидкості 1 ходьба — номінальна швидкість сима вздовж осі клітинки (≈ 256 од./с по горизонталі)", () => {
    expect(rootSpeed("walk", 1)).toBeGreaterThan(250);
    expect(rootSpeed("walk", 1)).toBeLessThan(262);
    expect(rootSpeed("trudge", 1)).toBeCloseTo(rootSpeed("walk", 1), -1);
    expect(rootSpeed("limp", 1)).toBeCloseTo(rootSpeed("walk", 1) * ILLNESS_EFFECTS.slow, -1);
  });

  it("плететься (виснаження не сповільнює) і кульгає (травма — ×0,8) не дрібніше за ходьбу: кроків за секунду не більше", () => {
    const walk = personGait("walk").stride / personGait("walk").cycles;
    expect(personGait("trudge").stride).toBeGreaterThanOrEqual(walk);
    expect(personGait("limp").stride).toBeGreaterThanOrEqual(ILLNESS_EFFECTS.slow * walk);
    // Паморочиться — та сама хода, що й ходьба.
    expect(personGait("dizzy").stride / personGait("dizzy").ms).toBeCloseTo(personGait("walk").stride / personGait("walk").ms, 3);
    // Ходьба — довгий крок: за 4 клітинки за секунду вправо (362 од./с) — не більше 6,5 кроку за секунду.
    expect((362 / walk) * 2).toBeLessThan(6.5);
  });
});

/** Значення доріжки кістки на початку й наприкінці. */
function ends(track: BoneTracks, duration: number): { first: number[]; last: number[] } {
  const v = { x: 0, y: 0 };
  const pick = (t: number): number[] => [
    track.rot ? sampleNumber(track.rot, t) : 0,
    ...(track.pos ? Object.values(sampleVec(track.pos, t, v)) : [0, 0]),
    ...(track.scale ? Object.values(sampleVec(track.scale, t, v)) : [1, 1]),
  ];
  return { first: pick(0), last: pick(duration) };
}

function allTracks(anim: LooseAnim): [string, BoneTracks][] {
  const list: [string, BoneTracks][] = Object.entries(anim.bones ?? {}).map(([id, t]) => [id, t ?? {}]);
  for (const [view, set] of Object.entries(anim.views ?? {})) for (const [id, t] of Object.entries(set?.bones ?? {})) list.push([`${view}:${id}`, t ?? {}]);
  return list;
}

const roundAll = (values: number[]): number[] => values.map((v) => Math.round(v * 100) / 100 + 0);

describe("рух персонажа: цикли, разові й накладки", () => {
  it("по колу — без ривка на стику: кожна доріжка починається й закінчується тим самим", () => {
    for (const [name, anim] of Object.entries(ANIMS)) {
      if (!anim.loop) continue;
      for (const [id, track] of allTracks(anim)) {
        const { first, last } = ends(track, anim.duration);
        expect(last, `${name} ${id}`).toEqual(first);
      }
    }
  });

  it("разові закінчуються вихідною позою (з неї м'яко повертається основна), а «бере кота» — позою «тримає кота»", () => {
    const hold = ANIMS.holdCat;
    for (const [name, anim] of Object.entries(ANIMS)) {
      if (anim.loop) continue;
      for (const [id, track] of allTracks(anim)) {
        const { last } = ends(track, anim.duration);
        const bone = id.replace(/^\w+:/, "");
        const view = id.includes(":") ? id.split(":")[0] : "front";
        if (name === "pickUp" && /^(arm|hand)-/.test(bone)) {
          const holdTrack = (view === "back" ? hold.views?.back?.bones?.[bone] : undefined) ?? hold.bones?.[bone] ?? {};
          const want = ends(holdTrack, hold.duration).first;
          // Рука: кут і масштаб уздовж (pos у накладці — нуль, у разовій його немає).
          expect([roundAll(last)[0], roundAll(last)[3]], `${name} ${id}`).toEqual([roundAll(want)[0], roundAll(want)[3]]);
          continue;
        }
        expect(roundAll(last), `${name} ${id}`).toEqual([0, 0, 0, 1, 1]);
      }
    }
  });

  it("накладки рук (несе річ, тримає кота) мають лише руки й кисті", () => {
    for (const name of PERSON_OVERLAYS) {
      const anim = ANIMS[name as Name];
      for (const [id] of allTracks(anim)) expect(id.replace(/^\w+:/, "")).toMatch(/^(arm|hand)-(near|far)$/);
    }
  });

  it("ззаду руки «в боки» (відмова, посковзнувся) — дзеркально: ближня рука не йде навскіс через спину", () => {
    for (const name of ["refuse", "slip"] as const) {
      const anim = ANIMS[name];
      for (const id of ["arm-near", "arm-far"]) {
        const front = anim.bones?.[id]?.rot ?? [];
        const back = anim.views?.back?.bones?.[id]?.rot ?? [];
        expect(back.map((key) => key.v + 0), `${name} ${id}`).toEqual(front.map((key) => -key.v + 0));
      }
    }
  });

  it("вкусили ззаду: ближню руку не тягне вперед до кота — притиснута до грудей", () => {
    const rig = rigFor("back");
    rig.evaluate(0);
    const shoulder = rig.bone("arm-near").world;
    const rest = rig.anchor("hands", { x: 0, y: 0 }, false);
    rig.play(ANIMS.bitten, 0, { blend: 0 });
    for (let t = 0; t <= ANIMS.bitten.duration; t += 30) {
      rig.evaluate(t);
      const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
      // Кисть не далі вперед, ніж у вихідній позі (рука висить), і не вище за плече.
      expect(hand?.x ?? 0, `@${t}`).toBeLessThanOrEqual((rest?.x ?? 0) + 0.5);
      expect(hand?.y ?? 0, `@${t}`).toBeGreaterThan(shoulder.ty);
    }
  });

  it("бере кота: у присіді обидві кисті внизу біля підлоги перед собою, наприкінці — там, де тримає кота", () => {
    const rig = rigFor("front");
    rig.play(ANIMS.pickUp, 0, { blend: 0 });
    rig.evaluate(150);
    const low = rig.anchor("hands", { x: 0, y: 0 }, false);
    expect(low?.x ?? 0).toBeGreaterThan(20);
    expect(low?.y ?? 0).toBeGreaterThan(-45);
    for (const view of VIEWS) {
      const pick = rigFor(view);
      pick.play(ANIMS.pickUp, 0, { blend: 0 });
      pick.evaluate(ANIMS.pickUp.duration);
      const end = pick.anchor("hands", { x: 0, y: 0 }, false);
      const hold = rigFor(view);
      hold.play(ANIMS.holdCat, 0, { blend: 0 });
      hold.evaluate(0);
      const held = hold.anchor("hands", { x: 0, y: 0 }, false);
      expect(end?.x, view).toBeCloseTo(held?.x ?? NaN, 1);
      expect(end?.y, view).toBeCloseTo(held?.y ?? NaN, 1);
    }
  });
});

describe("рух персонажа: основна з накладкою рук (personWithArms)", () => {
  const BASES: readonly Name[] = ["idle", "walk", "dash", "trudge", "limp", "exhausted", "sick", "dizzy", "bitten", "refuse", "trip", "slip"];
  const anim = (name: Name): PersonAnim => PERSON_MOVE[name];

  it("та сама пара — той самий об'єкт; без накладки й для анімацій, що самі ведуть руки, — основна як є", () => {
    expect(personWithArms(anim("walk"), "carry")).toBe(personWithArms(anim("walk"), "carry"));
    expect(personWithArms(anim("walk"), "carry")).not.toBe(personWithArms(anim("walk"), "holdCat"));
    expect(personWithArms(anim("walk"), null)).toBe(anim("walk"));
    expect([...PERSON_OWN_ARMS].sort()).toEqual(["pickUp", "putDown", "rod"]);
    for (const own of PERSON_OWN_ARMS) for (const overlay of PERSON_OVERLAYS) expect(personWithArms(anim(own), overlay)).toBe(anim(own));
  });

  it("решта доріжок — від основної, тривалість і повтор — її; доріжки за скелетом", () => {
    for (const name of BASES) {
      for (const overlay of PERSON_OVERLAYS) {
        const base = ANIMS[name];
        const made = personWithArms(anim(name), overlay) as LooseAnim;
        expect({ duration: made.duration, loop: made.loop }).toEqual({ duration: base.duration, loop: base.loop });
        for (const [id, track] of Object.entries(base.bones ?? {})) if (!/^(arm|hand)-/.test(id)) expect(made.bones?.[id], `${name} ${id}`).toBe(track);
        expect(made.slots).toBe(base.slots);
        expect(animProblems(PERSON_RIG as unknown as RigDef<string, string, string>, made, `${name}+${overlay}`)).toEqual([]);
      }
    }
  });

  it("несе річ: річ у руці рівно (кут гнізда held у світі ≈ 0) за будь-якої основної й ракурсу", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "carry") as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          expect(Math.abs(rig.socket("held", undefined, false)?.rot ?? NaN), `${name} ${view} @${t}`).toBeLessThan(0.5);
        }
      }
    }
  });

  it("несе річ: розмах рук ходи й ривка річ не підкидає — кисть нерухома відносно плеча", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "carry") as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        const offsets: { x: number; y: number }[] = [];
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          const shoulder = rig.bone("arm-near").world;
          offsets.push({ x: (hand?.x ?? 0) - shoulder.tx, y: (hand?.y ?? 0) - shoulder.ty });
        }
        const spread = (pick: (o: { x: number; y: number }) => number): number => Math.max(...offsets.map(pick)) - Math.min(...offsets.map(pick));
        expect(spread((o) => o.x), `${name} ${view} x`).toBeLessThan(0.5);
        expect(spread((o) => o.y), `${name} ${view} y`).toBeLessThan(0.5);
      }
    }
  });

  it("тримає кота: кисті нерухомі відносно кота в гнізді arms (не тицяють і не проходять крізь нього)", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "holdCat") as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        let first: { x: number; y: number } | null = null;
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          const arms = rig.socket("arms", undefined, false);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          if (!arms || !hand) throw new Error("немає гнізда чи якоря");
          // Кисть у системі гнізда (він повертається з тулубом).
          const a = (-arms.rot * Math.PI) / 180;
          const dx = hand.x - arms.x;
          const dy = hand.y - arms.y;
          const local = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
          first ??= local;
          expect(Math.hypot(local.x - first.x, local.y - first.y), `${name} ${view} @${t}`).toBeLessThan(0.5);
        }
      }
    }
  });
});
