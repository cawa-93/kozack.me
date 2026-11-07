// Підлога під ногами персонажа — для звуку кроків (§11.4а). Матеріали — як намальовано плити кімнат
// (`src/view/art/manifest/a01-build.ts`): ванна — плитка, спальня — дошки, вітальня — паркет із килимом, кухня — лінолеум.

import { RUG, roomAt, type Rect } from "../../../sim/home";
import type { Vec } from "../../../sim/types";

export type Floor = "tile" | "wood" | "rug";

/** Килимок перед вхідними дверима: його малює лише плита вітальні, у симуляції його немає. */
const DOOR_MAT: Rect = { x: 10, y: 10, w: 2, h: 1 };

const inside = (p: Vec, r: Rect): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/** Яка підлога в точці (клітинки). Прохід між кімнатами (ряд 5) — підлога кімнати над ним: так його малює плита. */
export function floorAt(p: Vec): Floor {
  if (inside(p, RUG) || inside(p, DOOR_MAT)) return "rug";
  const room = roomAt(p) ?? roomAt({ x: p.x, y: p.y - 1 });
  // Лінолеум кухні звучить глухо, як дерево: окремого запису для нього немає.
  return room === "bathroom" ? "tile" : "wood";
}
