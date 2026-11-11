// Фото виставки котів на титрах життя (§4.2): кіт на сходинці п'єдесталу свого місця.

import type { ShowPlace } from "../sim/types";
import { artEntry } from "./art/manifest";
import type { TraitShot } from "./traitphoto/types";

/** Точка малюнка п'єдесталу (`item/podium`), де сидить кіт, за місцем. */
const STEPS: Readonly<Record<ShowPlace, string>> = { 1: "first", 2: "second", 3: "third" };

/** Рамка, у яку входить майже весь п'єдестал, хоч би на якій сходинці сидів кіт. */
const PODIUM_FRAME = { w: 184, h: 160 } as const;

const IDEAS: Readonly<Record<ShowPlace, string>> = {
  1: "Кіт мружиться на найвищій сходинці п'єдесталу з цифрою 1.",
  2: "Кіт спокійно сидить на сходинці п'єдесталу з цифрою 2.",
  3: "Кіт спокійно сидить на найнижчій сходинці п'єдесталу з цифрою 3.",
};

function shot(place: ShowPlace): TraitShot {
  const podium = artEntry("item/podium");
  const top = podium?.points?.[STEPS[place]];
  // Корінь кота — у точці сходинки: п'єдестал зсунуто так, щоб вона стала під лапи; тіні на підлозі кіт не кидає.
  const at = podium && top ? { x: podium.pivot.x - top.x, y: podium.pivot.y - top.y } : { x: 0, y: 0 };
  return { idea: IDEAS[place], still: { shadow: false }, props: [{ art: "item/podium", state: null, ...at }], frame: PODIUM_FRAME };
}

// Ті самі об'єкти щоразу: кадр кота зі знімком кешується за знімком (`photoposes.ts`).
const SHOTS: Readonly<Record<ShowPlace, TraitShot>> = { 1: shot(1), 2: shot(2), 3: shot(3) };

/** Знімок призового місця: п'єдестал під котом. */
export function showShot(place: ShowPlace): TraitShot {
  return SHOTS[place];
}
