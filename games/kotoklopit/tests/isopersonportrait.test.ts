// Портрет персонажа нового вигляду в картках створення (крок 16, T2, `src/view/iso/personportrait.ts`): ті самі частини
// скелета, що в грі, у вихідній позі ракурсу `front`, з обвісом і пропорціями за виглядом і затіненими дальніми частинами.

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { personPortraitParts } from "../src/view/iso/personportrait";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin } from "../src/view/rig/defs/person";
import { Rig } from "../src/view/rig/rigcore";

describe("personPortraitParts: фігура для портрета", () => {
  it("частини — у порядку малювання ракурсу `front`, на місцях вихідної пози скелета гри", () => {
    const look: Look = { ...DEFAULT_LOOK };
    const parts = personPortraitParts(look);
    const rig = new Rig(PERSON_RIG, { fit: PERSON_FIT, lookup: artEntry, skin: personSkin(look), proportions: personProportions(look) }).evaluate(0);
    const visible = rig.order.filter((item) => item.kind === "slot").map((item) => rig.slots[item.index]!).filter((s) => s.visible && s.art !== null);
    expect(parts.map((p) => p.id)).toEqual(visible.map((s) => s.art));
    for (const [i, part] of parts.entries()) {
      const slot = visible[i]!;
      expect(part).toMatchObject({ view: "front", x: slot.x, y: slot.y, rot: slot.rot, scaleX: slot.sx, scaleY: slot.sy, state: slot.state });
    }
    // Зачіска ззаду — найнижче, ближня рука — найвище; очі — розплющені.
    expect(parts[0]?.id).toBe(`person/hair-back/${look.hair}`);
    expect(parts.at(-1)?.id).toBe("person/arm");
    expect(parts.find((p) => p.id === "person/eyes")?.state).toBe("open");
    // Торс — таз над підлогою (еталон F1b: (0, −64)).
    const torso = parts.find((p) => p.id === `person/torso/${look.build}`);
    expect(torso?.x).toBeCloseTo(0);
    expect(torso?.y).toBeCloseTo(-64);
  });

  it("дальні рука, нога й черевик — затінені (`far`), ближні — ні; порожніх слотів гардеробу у фігурі немає", () => {
    const parts = personPortraitParts({ ...DEFAULT_LOOK });
    const skin = personSkin(DEFAULT_LOOK);
    expect(parts.filter((p) => p.far === true)).toHaveLength(PERSON_FAR_SLOTS.filter((slot) => skin[slot] !== null).length);
    const far = parts.filter((p) => p.far === true).map((p) => p.id);
    expect(far.sort()).toEqual(["person/arm-far", "person/leg", "person/shoe"]);
    expect(parts.filter((p) => p.id === "person/leg" && p.far !== true)).toHaveLength(1);
  });

  it("вигляд: обличчя, зачіска й статура — свої частини; кремезний — товщі руки й ноги (упоперек кадру), стрункий — тонші", () => {
    const look: Look = { ...DEFAULT_LOOK, face: 2, hair: 3, build: 2 };
    const ids = personPortraitParts(look).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["person/head/2", "person/hair-back/3", "person/hair-front/3", "person/torso/2"]));
    const leg = (build: number): number => personPortraitParts({ ...DEFAULT_LOOK, build }).find((p) => p.id === "person/leg")?.scaleX ?? 0;
    expect(leg(2)).toBeGreaterThan(leg(1));
    expect(leg(0)).toBeLessThan(leg(1));
  });
});
