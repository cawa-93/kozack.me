// Портрет персонажа нового вигляду (крок 16, T2): фігура на весь зріст для DOM-портрета в картках створення (§5.1,
// `ui/portrait.ts`) — ті самі частини скелета, що в грі, у вихідній позі ракурсу `front` (ліворуч — дзеркало не потрібне):
// обвіс і пропорції за виглядом (`personSkin`, `personProportions`), суглоби з точок кадрів (`PERSON_FIT`), дальні частини
// затінені (`PERSON_FAR_SLOTS`). Малює `composePortrait` (`art/compose.ts`) без Phaser. Без Phaser і DOM: перевіряє
// `tests/isopersonportrait.test.ts`.

import type { Look } from "../../sim/types";
import type { PortraitPart } from "../art/compose";
import { artEntry } from "../art/manifest";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin } from "../rig/defs/person";
import { Rig } from "../rig/rigcore";

const FAR: ReadonlySet<string> = new Set<string>(PERSON_FAR_SLOTS);

/**
 * Частини фігури знизу догори (порядок z ракурсу `front`), кожна — у місці, куди її ставить скелет у вихідній позі: pivot,
 * поворот і масштаб кістки (статура товщає руки й ноги). Схованих слотів (і слотів без запису) немає.
 */
export function personPortraitParts(look: Look): PortraitPart[] {
  const rig = new Rig(PERSON_RIG, {
    fit: PERSON_FIT,
    lookup: artEntry,
    skin: personSkin(look),
    proportions: personProportions(look),
    facing: { view: "front", flip: false },
  });
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
