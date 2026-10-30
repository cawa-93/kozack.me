// Анімації руху персонажа (крок 16, хвиля 2, пакет N4a; `src/view/rig/anims/person/move.ts`): стопи стоять на підлозі й не
// ковзають — у ході опорна стопа йде назад рівно з кроком (`personGait`), у стоянні не зсувається; темп ходи
// (`personGaitSpeed`) — зі швидкості на екрані, і виснажений чи травмований не дрібочить частіше за здорового; цикли без
// ривка на стику; разові закінчуються вихідною позою; накладки рухають лише руки й кисті; ззаду руки «в боки» — дзеркально.

import { describe, expect, it } from "vitest";

import { ILLNESS_EFFECTS } from "../src/sim/config";
import { PERSON_OVERLAYS } from "../src/view/anim/ids";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import { PERSON_MOVE, personGait, personGaitSpeed, type PersonGait } from "../src/view/rig/anims/person/move";
import { Rig, sampleNumber, sampleVec } from "../src/view/rig/rigcore";
import type { ArtView } from "../src/view/art/types";
import type { BoneTracks, RigAnim } from "../src/view/rig/types";

type LooseAnim = RigAnim<string, string>;
type Name = keyof typeof PERSON_MOVE;
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

  it("разові закінчуються вихідною позою (з неї м'яко повертається основна)", () => {
    for (const [name, anim] of Object.entries(ANIMS)) {
      if (anim.loop) continue;
      for (const [id, track] of allTracks(anim)) {
        const { last } = ends(track, anim.duration);
        expect(roundAll(last), `${name} ${id}`).toEqual([0, 0, 0, 1, 1]);
      }
    }
  });

  it("накладки рук (несе річ, тримає кота) рухають лише руки й кисті", () => {
    for (const name of PERSON_OVERLAYS) {
      const anim = ANIMS[name as Name];
      for (const [id] of allTracks(anim)) expect(id.replace(/^\w+:/, "")).toMatch(/^(arm|hand)-(near|far)$/);
    }
  });

  it("ззаду руки «в боки» (відмова, посковзнувся, вкусили) — дзеркально: ближня рука не йде навскіс через спину", () => {
    for (const name of ["refuse", "slip", "bitten"] as const) {
      const anim = ANIMS[name];
      for (const id of ["arm-near", "arm-far"]) {
        const front = anim.bones?.[id]?.rot ?? [];
        const back = anim.views?.back?.bones?.[id]?.rot ?? [];
        expect(back.map((key) => key.v + 0), `${name} ${id}`).toEqual(front.map((key) => -key.v + 0));
      }
    }
  });
});
