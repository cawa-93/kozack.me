// Змішування анімацій персонажа нового вигляду (крок 16, T2): основна + накладка рук + поправки вигляду — одна анімація
// скелета (`src/view/iso/personmix.ts`). Накладка за контрактом `anim/ids.ts` додається до основної (rot і pos — сума,
// scale — добуток) зі своїм часом, доріжки слотів накладки й поправок перекривають основну.

import { describe, expect, it } from "vitest";

import { PERSON_ANIM_IDS, PERSON_OVERLAYS } from "../src/view/anim/ids";
import { mixAnims, mixRepeats } from "../src/view/iso/personmix";
import { PERSON_ANIMS } from "../src/view/rig/anims/index";
import { PERSON_FIT, PERSON_RIG } from "../src/view/rig/defs/person";
import { Rig, sampleNumber, sampleStep, sampleVec } from "../src/view/rig/rigcore";
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
  },
  slots: { eyes: { frame: [{ t: 0, v: "open" }, { t: 600, v: "closed" }] } },
};

/** Несе: рука вперед (стала), ледь гойдається кисть за 1000 мс. */
const CARRY: Anim = {
  duration: 1000,
  loop: true,
  bones: {
    "arm-near": { rot: [{ t: 0, v: -60 }] },
    "hand-near": { rot: [{ t: 0, v: 0 }, { t: 500, v: 6 }, { t: 1000, v: 0 }] },
    "leg-near": { scale: [{ t: 0, v: { x: 1, y: 1.1 } }] },
  },
};

const rot = (anim: Anim, bone: string, t: number): number => sampleNumber(anim.bones?.[bone]?.rot ?? [], t);

describe("mixAnims: основна й накладка", () => {
  it("без накладки й поправок — сама основна; ті самі входи — той самий об'єкт", () => {
    expect(mixAnims(WALK, null)).toBe(WALK);
    expect(mixAnims(WALK, null, {})).toBe(WALK);
    const a = mixAnims(WALK, CARRY, { frames: { eyes: "half" } });
    expect(mixAnims(WALK, CARRY, { frames: { eyes: "half" } })).toBe(a);
    expect(mixAnims(WALK, CARRY)).not.toBe(a);
  });

  it("повороти й положення складаються, масштаби множаться — у кожен момент, з часом кожної", () => {
    const mixed = mixAnims(WALK, CARRY);
    const repeats = mixRepeats(WALK, CARRY as never);
    expect(mixed.duration).toBe(WALK.duration * repeats);
    expect(mixed.loop).toBe(true);
    for (const t of [0, 100, 350, 500, 699, 900, 1400, 2100, 3499]) {
      if (t > mixed.duration) continue;
      const walk = t % WALK.duration;
      const carry = t % CARRY.duration;
      expect(rot(mixed, "arm-near", t)).toBeCloseTo(rot(WALK, "arm-near", walk) + rot(CARRY, "arm-near", carry), 0);
      expect(rot(mixed, "hand-near", t)).toBeCloseTo(rot(CARRY, "hand-near", carry), 0);
      const scale = sampleVec(mixed.bones?.["leg-near"]?.scale ?? [], t, { x: 0, y: 0 });
      const walkScale = sampleVec(WALK.bones?.["leg-near"]?.scale ?? [], walk, { x: 0, y: 0 });
      expect(scale.x).toBeCloseTo(walkScale.x, 1);
      expect(scale.y).toBeCloseTo(walkScale.y * 1.1, 2);
    }
  });

  it("накладка, що рухається по колу, не рветься на стику: зведена — кілька циклів основної, поки обидві не замкнуться", () => {
    // 700 × 10 = 7000 = 1000 × 7, але більше 6 циклів не беремо — тоді з найменшим стиком.
    expect(mixRepeats({ duration: 500, loop: true }, CARRY as never)).toBe(2);
    expect(mixRepeats({ duration: 1000, loop: true }, CARRY as never)).toBe(1);
    expect(mixRepeats({ duration: 500, loop: false }, CARRY as never)).toBe(1);
    // Стала накладка — один цикл.
    expect(mixRepeats(WALK, { duration: 1000, loop: true, bones: { "arm-near": { rot: [{ t: 0, v: -60 }] } } })).toBe(1);
    const mixed = mixAnims({ ...WALK, duration: 500 }, CARRY);
    expect(mixed.duration).toBe(1000);
  });

  it("стала накладка на доріжці основної — ті самі ключі й переходи, зсунуті на сталу", () => {
    const mixed = mixAnims(WALK, { duration: 1000, loop: true, bones: { "arm-near": { rot: [{ t: 0, v: -60 }] } } });
    expect(mixed.bones?.["arm-near"]?.rot).toEqual(WALK.bones?.["arm-near"]?.rot?.map((k) => ({ ...k, v: k.v - 60 })));
    // Кістки лише основної — ті самі доріжки.
    expect(mixed.bones?.["leg-near"]).toEqual(WALK.bones?.["leg-near"]);
  });

  it("доріжки слотів накладки й поправок перекривають основну; кадр очей і сховані слоти — весь час", () => {
    const mixed = mixAnims(WALK, CARRY, { frames: { eyes: "closed" }, hidden: ["arm-near"] });
    for (const t of [0, 300, 650]) {
      expect(sampleStep(mixed.slots?.["eyes"]?.frame ?? [], t)).toBe("closed");
      expect(sampleStep(mixed.slots?.["arm-near"]?.visible ?? [], t)).toBe(false);
    }
  });

  it("наростання повороту (голова хилиться, засинаючи) — від 0 до значення наприкінці, поверх анімації за поступом", () => {
    const sleep: Anim = { duration: 1000, loop: false };
    const mixed = mixAnims(sleep, null, { ramp: { head: 18 } });
    expect(mixed.loop).toBe(false);
    expect(rot(mixed, "head", 0)).toBe(0);
    expect(rot(mixed, "head", 500)).toBeCloseTo(9);
    expect(rot(mixed, "head", 1000)).toBe(18);
  });

  it("перевизначення ракурсу: зведена доріжка ракурсу — з доріжок цього ракурсу обох (решта — з основних)", () => {
    const main: Anim = { ...WALK, views: { back: { bones: { "arm-near": { rot: [{ t: 0, v: 5 }] } } } } };
    const mixed = mixAnims(main, CARRY);
    expect(rot(mixed, "arm-near", 0)).toBeCloseTo(-80);
    expect(sampleNumber(mixed.views?.back?.bones?.["arm-near"]?.rot ?? [], 0)).toBeCloseTo(-55);
    expect(sampleNumber(mixed.views?.back?.bones?.["arm-near"]?.rot ?? [], 777)).toBeCloseTo(-55);
    expect(mixed.views?.front).toBeUndefined();
  });

  it("зведене з анімаціями реєстру грається скелетом персонажа: кожна основна з кожною накладкою рук", () => {
    const rig = new Rig(PERSON_RIG, { fit: PERSON_FIT });
    let now = 0;
    for (const id of PERSON_ANIM_IDS) {
      for (const overlay of [null, ...PERSON_OVERLAYS]) {
        const mixed = mixAnims(PERSON_ANIMS[id], overlay ? PERSON_ANIMS[overlay] : null, { frames: { eyes: "half" } });
        expect(mixed.duration).toBeGreaterThan(0);
        rig.play(mixed, now);
        rig.evaluate((now += 16));
        expect(rig.slot("eyes").state).toBe("half");
      }
    }
  });
});
