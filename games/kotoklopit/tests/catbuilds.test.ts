// Статури кота (крок 16, A7 «Кіт — основа»): тулуби стрункої й кремезної статур — свої кадри з точками кріплення
// (`lib/cat.ts`, `art/cat/body/*`). Лапи в усіх статур ті самі (статура лише робить їх тоншими чи товщими), тож суглоби
// лап мусять стояти на тій самій висоті відносно таза, що й у звичайної, — інакше кіт висів би над підлогою чи провалювався.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import { CAT_FIT, CAT_RIG, catProportions, catSkin } from "../src/view/rig/defs/cat";
import { Rig } from "../src/view/rig/rigcore";
import type { Shape } from "../src/sim/types";

const LEGS = ["leg-front-far", "leg-front-near", "leg-back-far", "leg-back-near"] as const;

/** Кінець кістки (подушечка лапи) у системі кореня. */
function tip(rig: Rig<string, string, string>, id: string): { x: number; y: number } {
  const bone = rig.bone(id);
  const w = bone.world;
  return { x: w.a * bone.len + w.tx, y: w.b * bone.len + w.ty };
}

function catOf(build: Shape["build"], view: "front" | "back"): Rig<string, string, string> {
  const shape = { muzzle: "normal", ears: "normal", tail: "long", build, legs: "normal" } as const;
  const rig = new Rig(CAT_RIG, { fit: CAT_FIT, lookup: artEntry, skin: catSkin(shape), facing: { view }, proportions: catProportions(shape) });
  return rig.evaluate(0) as unknown as Rig<string, string, string>;
}

describe("статури кота", () => {
  for (const view of ["front", "back"] as const) {
    it(`${view}: лапи будь-якої статури стоять на підлозі, як у звичайної; струнка довша, кремезна коротша й з вищою спиною`, () => {
      const normal = catOf("normal", view);
      const slim = catOf("slim", view);
      const stocky = catOf("stocky", view);
      for (const rig of [slim, stocky]) {
        for (const leg of LEGS) expect(tip(rig, leg).y, leg).toBeCloseTo(tip(normal, leg).y, 6);
      }
      // Від стегна до плеча: у стрункої довше, у кремезної коротше.
      const span = (rig: Rig<string, string, string>): number => rig.bone("leg-front-near").world.tx - rig.bone("leg-back-near").world.tx;
      expect(span(slim)).toBeGreaterThan(span(normal) + 1);
      expect(span(stocky)).toBeLessThan(span(normal) - 1);
      // Шия (де сидить голова): у кремезної вища, у стрункої нижча — тулуб глибший чи тонший.
      const neck = (rig: Rig<string, string, string>): number => rig.bone("head").world.ty;
      expect(neck(stocky)).toBeLessThan(neck(normal));
      expect(neck(slim)).toBeGreaterThan(neck(normal));
    });
  }
});
