// Анімації руху персонажа (крок 16, хвиля 2, пакет N4a; `src/view/rig/anims/person/move.ts`): стопи стоять на підлозі й не
// ковзають — у ході опорна стопа йде назад рівно з кроком (`PERSON_*_STRIDE`), у стоянні не зсувається; цикли без ривка на
// стику; разові закінчуються вихідною позою; накладки рухають лише руки й кисті; ззаду руки «в боки» — дзеркально.

import { describe, expect, it } from "vitest";

import { PERSON_OVERLAYS } from "../src/view/anim/ids";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import {
  PERSON_DASH_STRIDE,
  PERSON_LIMP_STRIDE,
  PERSON_MOVE,
  PERSON_TRUDGE_STRIDE,
  PERSON_WALK_STRIDE,
} from "../src/view/rig/anims/person/move";
import { Rig, sampleNumber, sampleVec } from "../src/view/rig/rigcore";
import type { ArtView } from "../src/view/art/types";
import type { BoneTracks, RigAnim } from "../src/view/rig/types";

type LooseAnim = RigAnim<string, string>;
type Name = keyof typeof PERSON_MOVE;
const ANIMS = PERSON_MOVE as unknown as Readonly<Record<Name, LooseAnim>>;
const VIEWS: readonly ArtView[] = ["front", "back"];

/** Кісточки (початок кістки стопи) у системі кореня. */
function ankles(rig: Rig<string, string, string>): { near: { x: number; y: number }; far: { x: number; y: number } } {
  const at = (id: string): { x: number; y: number } => {
    const m = rig.bone(id).world;
    return { x: m.tx, y: m.ty };
  };
  return { near: at("foot-near"), far: at("foot-far") };
}

function rigFor(view: ArtView, proportions: string[] = []): Rig<string, string, string> {
  return new Rig(PERSON_RIG, { facing: { view, flip: false }, proportions }) as unknown as Rig<string, string, string>;
}

/** Ходи: крок за цикл і ноги, що в опорі на початку циклу (частка циклу кінця опори ближньої ноги). */
const GAITS: readonly { name: Name; stride: number; nearStance: readonly [number, number]; farStance: readonly [number, number] }[] = [
  { name: "walk", stride: PERSON_WALK_STRIDE, nearStance: [0, 0.5], farStance: [0.5, 1] },
  { name: "dash", stride: PERSON_DASH_STRIDE, nearStance: [0, 0.3], farStance: [0.5, 0.8] },
  { name: "limp", stride: PERSON_LIMP_STRIDE, nearStance: [0, 0.36], farStance: [0.36, 1] },
  { name: "trudge", stride: PERSON_TRUDGE_STRIDE, nearStance: [0, 0.5], farStance: [0.5, 1] },
];

/** Стоїть на місці: обидві стопи не рухаються. */
const STANDING: readonly Name[] = ["idle", "pet", "rod", "sick", "exhausted", "refuse", "pickUp", "putDown"];

describe("рух персонажа: стопи", () => {
  for (const gait of GAITS) {
    it(`${gait.name}: опорна стопа на підлозі йде назад рівно з кроком (не ковзає), жодна не йде під підлогу`, () => {
      const anim = ANIMS[gait.name];
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.evaluate(0);
        const ground = ankles(rig);
        rig.play(anim, 0, { blend: 0 });
        const speed = gait.stride / anim.duration;
        for (const [leg, [from, to]] of [
          ["near", gait.nearStance],
          ["far", gait.farStance],
        ] as const) {
          // Усередині опори (без країв, де стопа стає й відривається).
          const a = (from + 0.04) * anim.duration;
          const b = (to - 0.04) * anim.duration;
          rig.evaluate(a);
          const start = ankles(rig)[leg];
          for (let t = a; t <= b; t += (b - a) / 12) {
            rig.evaluate(t);
            const ankle = ankles(rig)[leg];
            expect(Math.abs(ankle.x - (start.x - speed * (t - a))), `${view} ${leg} x @${t}`).toBeLessThan(0.6);
            expect(Math.abs(ankle.y - ground[leg].y), `${view} ${leg} y @${t}`).toBeLessThan(0.6);
          }
        }
        for (let t = 0; t < anim.duration; t += anim.duration / 50) {
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

  it("паморочиться: стопи на місці (переступає — нога лише піднімається), під підлогу не йдуть", () => {
    const anim = ANIMS.dizzy;
    const rig = rigFor("front");
    rig.evaluate(0);
    const ground = ankles(rig);
    rig.play(anim, 0, { blend: 0 });
    for (let t = 0; t < anim.duration; t += anim.duration / 60) {
      rig.evaluate(t);
      const now = ankles(rig);
      for (const leg of ["near", "far"] as const) {
        expect(Math.abs(now[leg].x - ground[leg].x)).toBeLessThan(0.8);
        expect(now[leg].y - ground[leg].y).toBeLessThan(0.6);
      }
      // Хоч одна стопа на підлозі.
      expect(Math.min(ground.near.y - now.near.y, ground.far.y - now.far.y)).toBeLessThan(0.6);
    }
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
        expect(last.map((v) => Math.round(v * 100) / 100 + 0), `${name} ${id}`).toEqual([0, 0, 0, 1, 1]);
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
