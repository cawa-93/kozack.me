// Портрет кота для DOM-картки (§9.7): ті самі частини скелета, що в грі, у позі «сидить», з розплющеними очима. Малює `composeFigure`
// (`art/compose.ts`) без Phaser. Без Phaser і DOM: перевіряє `tests/catintro.test.ts`.

import type { Cat } from "../../sim/types";
import type { PortraitPart } from "../art/compose";
import { artEntry } from "../art/manifest";
import { CAT_ANIMS } from "../rig/anims";
import { CAT_FAR_SLOTS } from "../rig/defs/cat";
import { Rig } from "../rig/rigcore";
import { composeCatAnim } from "./catanim";
import { ISO_CAT_FIT, ISO_CAT_RIG, isoCatProportions, isoCatSkin } from "./catrig";

const FAR: ReadonlySet<string> = new Set<string>(CAT_FAR_SLOTS);

/** Частини кота знизу догори, кожна — у місці, куди її ставить скелет; схованих слотів немає. */
export function catPortraitParts(cat: Cat): PortraitPart[] {
  const rig = new Rig(ISO_CAT_RIG, {
    fit: ISO_CAT_FIT,
    lookup: artEntry,
    skin: isoCatSkin(cat.shape, false),
    proportions: isoCatProportions(cat),
    facing: { view: "front", flip: false },
  });
  rig.play(composeCatAnim(CAT_ANIMS.sit, null, { eyes: "open", mouth: "closed", ears: "up" }) as Parameters<typeof rig.play>[0], 0);
  rig.evaluate(0);
  const parts: PortraitPart[] = [];
  for (const item of rig.order) {
    if (item.kind !== "slot") continue;
    const pose = rig.slots[item.index];
    if (!pose || !pose.visible || pose.art === null) continue;
    parts.push({
      id: pose.art,
      state: pose.state,
      view: "front",
      x: pose.x,
      y: pose.y,
      rot: pose.rot,
      scaleX: pose.sx,
      scaleY: pose.sy,
      ...(FAR.has(pose.id) ? { far: true } : {}),
    });
  }
  return parts;
}
