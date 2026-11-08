// Поправки вигляду персонажа поверх анімації (крок 16, T2): очі засинання, схована рука, голова, що хилиться, — одна анімація
// скелета (`src/view/iso/personmix.ts`). Накладку рук кладе `personWithArms` (N4a) ще до поправок; поправки додаються, а
// доріжки слотів поправок перекривають анімацію.

import { describe, expect, it } from "vitest";

import { PERSON_ANIM_IDS, PERSON_OVERLAYS } from "../src/view/anim/ids";
import { armsOverlay } from "../src/view/iso/personlook";
import { mixAnims, NO_EXTRAS } from "../src/view/iso/personmix";
import { PERSON_ANIMS } from "../src/view/rig/anims/index";
import { personWithArms } from "../src/view/rig/anims/person/move";
import { PERSON_FIT, PERSON_RIG } from "../src/view/rig/defs/person";
import { Rig, sampleNumber, sampleStep } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";

type Anim = RigAnim<string, string>;

/** Ходьба: рука ходить туди-сюди за 700 мс, нога — теж, з переходами. */
const WALK: Anim = {
  duration: 700,
  loop: true,
  bones: {
    "arm-near": {
      rot: [
        { t: 0, v: -20, ease: "inOut" },
        { t: 350, v: 20, ease: "inOut" },
        { t: 700, v: -20 },
      ],
    },
    "leg-near": { rot: [{ t: 0, v: 10 }, { t: 350, v: -10 }, { t: 700, v: 10 }], scale: [{ t: 0, v: { x: 1, y: 1 } }, { t: 350, v: { x: 0.9, y: 1 } }, { t: 700, v: { x: 1, y: 1 } }] },
    head: { rot: [{ t: 0, v: 2 }, { t: 350, v: -2 }, { t: 700, v: 2 }] },
  },
  slots: { eyes: { frame: [{ t: 0, v: "open" }, { t: 600, v: "closed" }] } },
};

const rot = (anim: Anim, bone: string, t: number): number => sampleNumber(anim.bones?.[bone]?.rot ?? [], t);

describe("mixAnims: поправки вигляду", () => {
  it("без поправок — сама анімація; ті самі входи — той самий об'єкт", () => {
    expect(mixAnims(WALK)).toBe(WALK);
    expect(mixAnims(WALK, NO_EXTRAS)).toBe(WALK);
    expect(mixAnims(WALK, {})).toBe(WALK);
    const extras = { frames: { eyes: "half" } };
    const a = mixAnims(WALK, extras);
    expect(mixAnims(WALK, extras)).toBe(a);
    expect(mixAnims(WALK, { frames: { eyes: "half" } })).toBe(a);
    expect(mixAnims(WALK, { frames: { eyes: "closed" } })).not.toBe(a);
    expect(a.duration).toBe(WALK.duration);
    expect(a.loop).toBe(true);
  });

  it("поправки додаються до анімації (голова хилиться поверх свого руху)", () => {
    const mixed = mixAnims(WALK, { ramp: { head: 14 } });
    for (const t of [0, 175, 350, 525, 700]) expect(rot(mixed, "head", t)).toBeCloseTo(rot(WALK, "head", t) + (14 * t) / 700, 0);
  });

  it("кістки, яких не рухають поправки, — ті самі доріжки анімації (ключі й переходи)", () => {
    const mixed = mixAnims(WALK, { ramp: { "leg-far": 5 } });
    expect(mixed.bones?.["arm-near"]?.rot).toBe(WALK.bones?.["arm-near"]?.rot);
    expect(mixed.bones?.["leg-near"]).toEqual(WALK.bones?.["leg-near"]);
  });

  it("доріжки слотів поправок перекривають анімацію; кадр очей і сховані слоти — весь час", () => {
    const mixed = mixAnims(WALK, { frames: { eyes: "closed" }, hidden: ["arm-near"] });
    for (const t of [0, 300, 650]) {
      expect(sampleStep(mixed.slots?.["eyes"]?.frame ?? [], t)).toBe("closed");
      expect(sampleStep(mixed.slots?.["arm-near"]?.visible ?? [], t)).toBe(false);
    }
  });

  it("наростання повороту (голова хилиться, засинаючи) — від 0 до значення наприкінці, поверх анімації за поступом", () => {
    const sleep: Anim = { duration: 1000, loop: false };
    const mixed = mixAnims(sleep, { ramp: { head: 18 } });
    expect(mixed.loop).toBe(false);
    expect(rot(mixed, "head", 0)).toBe(0);
    expect(rot(mixed, "head", 500)).toBeCloseTo(9);
    expect(rot(mixed, "head", 1000)).toBe(18);
  });

  it("перевизначення ракурсу анімації лишаються; поправки діють і в ньому", () => {
    const main: Anim = { ...WALK, views: { back: { bones: { head: { rot: [{ t: 0, v: 5 }] }, "leg-near": { rot: [{ t: 0, v: 3 }] } } } } };
    const mixed = mixAnims(main, { ramp: { head: 10 } });
    expect(sampleNumber(mixed.views?.back?.bones?.["leg-near"]?.rot ?? [], 0)).toBeCloseTo(3);
    expect(sampleNumber(mixed.views?.back?.bones?.head?.rot ?? [], 700)).toBeCloseTo(15);
    expect(mixed.views?.front).toBeUndefined();
  });

  it("з анімаціями реєстру й накладкою рук `personWithArms` грається скелетом персонажа: кожна анімація з кожною накладкою", () => {
    const rig = new Rig(PERSON_RIG, { fit: PERSON_FIT });
    let now = 0;
    for (const id of PERSON_ANIM_IDS) {
      for (const overlay of [null, ...PERSON_OVERLAYS]) {
        const armed = personWithArms(PERSON_ANIMS[id], armsOverlay(id, overlay), id);
        const mixed = mixAnims(armed, { frames: { eyes: "half" } });
        expect(mixed.duration).toBe(PERSON_ANIMS[id].duration);
        rig.play(mixed, now);
        rig.evaluate((now += 16));
        expect(rig.slot("eyes").state).toBe("half");
      }
    }
  });
});
