// Велика коробка (§4.1, `sim/bigbox.ts`) у вигляді — без нового арту: та сама одна велика коробка, що в купі ящиків біля входу
// (`env/boxes`, стан `pile-1`), і її передні стінки окремим кадром поверх кота в ній (`env/boxes/front`). Кіт у коробці лежить,
// як у ящиках: нижче за борт, без тіні. Стоїть на своєму місці (`BIG_BOX`), а коли воно зайняте, — там, куди її поставила гра
// (§8.7, «Що ставить гра»: `bigBoxAt` і решта — зі зсувом). Без Phaser (`tests/mod-big-box.test.ts`, `tests/displaced-view.test.ts`).

import { BIG_BOX } from "../../sim/home";
import type { Cat, GameState, Vec } from "../../sim/types";
import { isoObjectLook, thingPoint, type IsoFootprint } from "../world/objects";
import { BOXES_FRONT } from "./geometry";
import type { IsoFrame } from "./looks";

/** Коробка в реєстрі глибини: на неї ставлять кота, що в ній. */
export const BIG_BOX_ID = "big-box";

/** Слід — клітинка коробки; pivot кадру — точка підлоги під її серединою, як у речей квартири. На своєму місці. */
export const BIG_BOX_FOOTPRINT = { x0: BIG_BOX.x, y0: BIG_BOX.y, x1: BIG_BOX.x + 1, y1: BIG_BOX.y + 1 } as const;
export const BIG_BOX_AT: Vec = { x: BIG_BOX.x + 0.5, y: BIG_BOX.y + 0.5 };

export const BIG_BOX_FRAME: IsoFrame = { id: "env/boxes", state: "pile-1" };
export const BIG_BOX_FRONT_FRAME: IsoFrame = { id: "env/boxes/front", state: "pile-1" };

/** Передні стінки — точка на коробці в її передньому куті, як `BOXES_FRONT` у ящиків: найближча на ній, тож над котом. */
export const BIG_BOX_FRONT = { x: BIG_BOX.x + 0.99, y: BIG_BOX.y + 0.99, half: BOXES_FRONT.half } as const;

/** Висота лап кота в коробці — як у верхній коробці купи ящиків. */
export const BIG_BOX_PERCH = isoObjectLook("boxes").perch ?? 0;

/** Pivot кадру коробки там, де вона стоїть. */
export function bigBoxAt(state: Pick<GameState, "home">): Vec {
  return thingPoint(state, "big-box", BIG_BOX_AT);
}

/** Сліди коробки за її pivot: щоб щокадру не створювати нового. */
const FOOTPRINTS = new WeakMap<Vec, IsoFootprint>([[BIG_BOX_AT, BIG_BOX_FOOTPRINT]]);

/** Слід коробки там, де вона стоїть. */
export function bigBoxFootprint(state: Pick<GameState, "home">): IsoFootprint {
  const at = bigBoxAt(state);
  let f = FOOTPRINTS.get(at);
  if (!f) {
    f = { x0: at.x - 0.5, y0: at.y - 0.5, x1: at.x + 0.5, y1: at.y + 0.5 };
    FOOTPRINTS.set(at, f);
  }
  return f;
}

/** Точка передніх стінок там, де коробка стоїть. */
export function bigBoxFront(state: Pick<GameState, "home">): Vec {
  return thingPoint(state, "big-box", BIG_BOX_FRONT);
}

/** Де в коробці кіт: хто вже на місці — посередині, хто лише проходить крізь неї — там, де йде. */
export function bigBoxSeat(state: Pick<GameState, "home">, cat: Pick<Cat, "x" | "y" | "act">): Vec {
  return cat.act.goal === null ? bigBoxAt(state) : { x: cat.x, y: cat.y };
}
