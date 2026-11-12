// Що грає скелет кота в грі (`CatPlayer`, `catanim.ts`; показує `catview.ts`): час анімацій і змішування поз — на
// справжньому скелеті (`Rig`), без Phaser.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import { CatPlayer, type CatPlayFrame } from "../src/view/iso/catanim";
import { ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin } from "../src/view/iso/catrig";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { Rig } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";

type Loose = RigAnim<string, string>;

const FACE = { eyes: "open", mouth: "closed", ears: "up" } as const;

function catRig(): Rig<string, string, string> {
  const skin = isoCatSkin({ muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal" }, false);
  return new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, skin }) as unknown as Rig<string, string, string>;
}

function frame(over: Partial<CatPlayFrame> = {}): CatPlayFrame {
  return { face: FACE, restart: false, phase: 0, blendMs: null, ...over };
}

const anim = (id: keyof typeof CAT_ANIMS): Loose => CAT_ANIMS[id] as Loose;

describe("що грає кіт (`CatPlayer`)", () => {
  it("разова, почата, поки кота не рахували (за краєм камери), при появі грає з початку, а не вже скінчена", () => {
    const rig = catRig();
    const player = new CatPlayer();
    player.play(rig, anim("sit"), null, frame(), 0);
    rig.evaluate(0);
    // Кіт за краєм камери: позу не рахують (`evaluate`), а годинник кота йде.
    player.play(rig, anim("itch"), null, frame({ restart: true }), 5000);
    expect(rig.time(5100)).toBeCloseTo(100);
    expect(rig.done(5100)).toBe(false);
  });
});
