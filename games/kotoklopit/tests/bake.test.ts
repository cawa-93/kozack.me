// Запікання кадрів скелета (`bake.ts`, `bakecache.ts`, `rigsprite.ts`): що запікається наперед і чи вміщує бюджет
// власника те, що він показує.

import { describe, expect, it } from "vitest";

import { ISO_CAT_FIT, ISO_CAT_RIG } from "../src/view/iso/catrig";
import { artEntry } from "../src/view/art/manifest";
import { ART_VIEWS } from "../src/view/art/types";
import { CAT_ANIMS, PERSON_ANIMS } from "../src/view/rig/anims";
import { CAT_FIT, CAT_RIG } from "../src/view/rig/defs/cat";
import { PERSON_FIT, PERSON_RIG } from "../src/view/rig/defs/person";
import { Rig, slotViews } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";

type LooseDef = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

describe("запікання наперед — лише в ракурсах, де слот видно (`slotViews`)", () => {
  it("ззаду морди, очей і рота кота, очей і чубчика персонажа не видно: запікати їх там нема для чого", () => {
    for (const def of [CAT_RIG, ISO_CAT_RIG] as unknown as LooseDef[]) {
      for (const slot of ["muzzle", "eyes", "mouth"]) expect(slotViews(def, slot), slot).toEqual(["front"]);
      for (const slot of ["head", "body", "tail", "ear-far"]) expect(slotViews(def, slot), slot).toEqual([...ART_VIEWS]);
    }
    const person = PERSON_RIG as unknown as LooseDef;
    for (const slot of ["eyes", "hair-front"]) expect(slotViews(person, slot), slot).toEqual(["front"]);
    for (const slot of ["head", "hair-back", "torso", "skirt"]) expect(slotViews(person, slot), slot).toEqual([...ART_VIEWS]);
  });

  it("жодна анімація не показує слота в ракурсі, якого немає в `slotViews`", () => {
    const cases: [LooseDef, unknown, readonly LooseAnim[]][] = [
      [CAT_RIG as unknown as LooseDef, CAT_FIT, Object.values(CAT_ANIMS) as LooseAnim[]],
      [ISO_CAT_RIG as unknown as LooseDef, ISO_CAT_FIT, Object.values(CAT_ANIMS) as LooseAnim[]],
      [PERSON_RIG as unknown as LooseDef, PERSON_FIT, Object.values(PERSON_ANIMS) as LooseAnim[]],
    ];
    for (const [def, fit, anims] of cases) {
      for (const view of ART_VIEWS) {
        const rig = new Rig(def, { fit: fit as never, lookup: artEntry, facing: { view } });
        const hidden = rig.slots.filter((slot) => !slotViews(def, slot.id).includes(view)).map((slot) => slot.id);
        for (const anim of anims) {
          rig.play(anim, 0, { blend: 0, restart: true });
          for (const k of [0, 0.25, 0.5, 0.75, 1]) {
            rig.evaluate(anim.duration * k);
            for (const id of hidden) expect(rig.slot(id).visible, `${def.id}/${view}/${id}`).toBe(false);
          }
        }
      }
    }
  });
});
