// Реєстр анімацій скелетів (крок 16, шов хвилі 2, `src/view/rig/anims/index.ts`): кожна назва з `anim/ids.ts` має анімацію
// з правильними тривалістю й повтором, і всі доріжки — за скелетом. Перевіряє й заглушки, і групи пакетів N1–N4b.

import { describe, expect, it } from "vitest";

import { CAT_ANIM_IDS, CAT_ONE_SHOT_MS, PERSON_ANIM_IDS, PERSON_BY_PROGRESS, PERSON_ONE_SHOT_MS } from "../src/view/anim/ids";
import { CAT_RIG } from "../src/view/rig/defs/cat";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import { CAT_ANIMS, PERSON_ANIMS } from "../src/view/rig/anims";
import { animProblems } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";

type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

const ONE_SHOT: Readonly<Record<string, number>> = { ...CAT_ONE_SHOT_MS };
const PERSON_ONE_SHOT: Readonly<Record<string, number>> = { ...PERSON_ONE_SHOT_MS };

describe("реєстр анімацій", () => {
  it("кіт: кожна назва має анімацію; разові — без повтору й рівно своєї тривалості, решта — по колу", () => {
    expect(Object.keys(CAT_ANIMS).sort()).toEqual([...CAT_ANIM_IDS].sort());
    for (const id of CAT_ANIM_IDS) {
      const anim: LooseAnim = CAT_ANIMS[id];
      const ms = ONE_SHOT[id];
      expect({ id, loop: anim.loop }).toEqual({ id, loop: ms === undefined });
      if (ms !== undefined) expect({ id, duration: anim.duration }).toEqual({ id, duration: ms });
      expect(animProblems(CAT_RIG as unknown as LooseRig, anim, id)).toEqual([]);
    }
  });

  it("персонаж: разові — рівно своєї тривалості, за поступом — без повтору, решта — по колу", () => {
    expect(Object.keys(PERSON_ANIMS).sort()).toEqual([...PERSON_ANIM_IDS].sort());
    for (const id of PERSON_ANIM_IDS) {
      const anim: LooseAnim = PERSON_ANIMS[id];
      const ms = PERSON_ONE_SHOT[id];
      expect({ id, loop: anim.loop }).toEqual({ id, loop: ms === undefined && !PERSON_BY_PROGRESS.has(id) });
      if (ms !== undefined) expect({ id, duration: anim.duration }).toEqual({ id, duration: ms });
      expect(animProblems(PERSON_RIG as unknown as LooseRig, anim, id)).toEqual([]);
    }
  });
});
