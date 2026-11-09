// Велика коробка (§4.1, `sim/bigbox.ts`) у вигляді — без нового арту: та сама одна велика коробка, що в купі ящиків біля входу
// (`env/boxes`, стан `pile-1`), і її передні стінки окремим кадром поверх кота в ній (`env/boxes/front`). Кіт у коробці лежить,
// як у ящиках: нижче за борт, без тіні. Без Phaser (`tests/mod-big-box.test.ts`).

import { BIG_BOX } from "../../sim/home";
import type { Cat, Vec } from "../../sim/types";
import { isoObjectLook } from "../world/objects";
import { BOXES_FRONT } from "./geometry";
import type { IsoFrame } from "./looks";

/** Коробка в реєстрі глибини: на неї ставлять кота, що в ній. */
export const BIG_BOX_ID = "big-box";

/** Слід — клітинка коробки; pivot кадру — точка підлоги під її серединою, як у речей квартири. */
export const BIG_BOX_FOOTPRINT = { x0: BIG_BOX.x, y0: BIG_BOX.y, x1: BIG_BOX.x + 1, y1: BIG_BOX.y + 1 } as const;
export const BIG_BOX_AT: Vec = { x: BIG_BOX.x + 0.5, y: BIG_BOX.y + 0.5 };

export const BIG_BOX_FRAME: IsoFrame = { id: "env/boxes", state: "pile-1" };
export const BIG_BOX_FRONT_FRAME: IsoFrame = { id: "env/boxes/front", state: "pile-1" };

/** Передні стінки — точка на коробці в її передньому куті, як `BOXES_FRONT` у ящиків: найближча на ній, тож над котом. */
export const BIG_BOX_FRONT = { x: BIG_BOX.x + 0.99, y: BIG_BOX.y + 0.99, half: BOXES_FRONT.half } as const;

/** Висота лап кота в коробці — як у верхній коробці купи ящиків. */
export const BIG_BOX_PERCH = isoObjectLook("boxes").perch ?? 0;

/** Де в коробці кіт: хто вже на місці — посередині, хто лише проходить крізь неї — там, де йде. */
export function bigBoxSeat(cat: Pick<Cat, "x" | "y" | "act">): Vec {
  return cat.act.goal === null ? BIG_BOX_AT : { x: cat.x, y: cat.y };
}
