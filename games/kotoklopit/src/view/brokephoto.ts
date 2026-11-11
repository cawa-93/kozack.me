// Фото поломки на титрах життя (§4.2): кіт, що зламав річ, задоволено мружиться поруч з уламками й тим, що від неї лишилося.

import type { Quality, StoryBroken } from "../sim/types";
import type { TraitProp, TraitShot } from "./traitphoto/types";

const SHARDS = (x: number, y: number): TraitProp => ({ art: "mess/broken", state: null, x, y, scale: 0.6, front: true });

const carrier = (quality: Quality): TraitShot => ({
  idea: "Кіт задоволено мружиться біля уламків переноски, яку прогриз.",
  props: [{ art: `mess/carrier/${quality}`, state: null, x: -56, y: 10, scale: 0.75, front: true }],
});

const house = (quality: Quality): TraitShot => ({
  idea: "Кіт задоволено мружиться біля будиночка, перекинутого на бік, а поруч — уламки.",
  props: [{ art: `item/house/${quality}`, state: null, x: -54, y: 2, scale: 0.55, rot: -90 }, SHARDS(38, 14)],
});

const scratcher = (quality: Quality): TraitShot => ({
  idea: "Кіт задоволено мружиться біля кігтеточки, що лежить на боці, а поруч — уламки.",
  props: [{ art: `item/scratcher/${quality}`, state: null, x: -44, y: -6, scale: 0.6, rot: -80 }, SHARDS(38, 14)],
});

// Ті самі об'єкти щоразу: кадр кота з поломкою кешується за знімком (`photoposes.ts`).
const SHOTS: Readonly<Record<StoryBroken, Readonly<Record<Quality, TraitShot>>>> = {
  carrier: { cheap: carrier("cheap"), premium: carrier("premium") },
  house: { cheap: house("cheap"), premium: house("premium") },
  scratcher: { cheap: scratcher("cheap"), premium: scratcher("premium") },
};

export function brokeShot(thing: StoryBroken, quality: Quality): TraitShot {
  return SHOTS[thing][quality];
}
