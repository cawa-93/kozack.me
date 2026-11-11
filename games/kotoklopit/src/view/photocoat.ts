// Кіт в іконці бабла на фото титрів (§4.2) — шерстю того, над ким бабл: іконки гри малюють рудого кота, і поруч із сірим героєм
// сліпі глядачі бачили в баблі «іншого, рудого кота». Без Phaser і DOM.

import { coatOf } from "../sim/genetics";
import type { Cat } from "../sim/types";
import { COAT_WHITE, PIGMENT_LOOK } from "./art/recipes";
import type { IconName } from "./iconnames";

/** Іконки з рудим котом, які знімки рис ставлять у бабли (перелік стереже тест). */
export const COAT_ICONS: ReadonlySet<string> = new Set<IconName>([
  "aloof",
  "attention",
  "bored",
  "cat-box",
  "cat-high",
  "cat-laptop",
  "chew-wire",
  "door-ask",
  "lick",
  "lick-nervous",
  "meow",
  "meow-silent",
  "picky",
  "pounce-leg",
  "stolen",
  "sulk",
  "table",
]);

/** Колір шерсті для кота в іконці; у рудого — немає: іконка вже руда. */
export function iconCoat(cat: Pick<Cat, "genes" | "shape">): number | undefined {
  const coat = coatOf(cat.genes, cat.shape);
  if (coat.base === "orange") return undefined;
  if (coat.white >= 3) return COAT_WHITE;
  const look = PIGMENT_LOOK[coat.base];
  return coat.pointed ? look.pointBody : coat.tabby ? look.ground : look.solid;
}

/** Найяскравіший канал рудого іконок (`orange` палітри): від нього — наскільки піксель світліший чи темніший. */
const ORANGE_MAX = 0xd9;

/** Руді пікселі RGBA (тон рудого кота іконок, з тінню й світлим) — у колір шерсті з тією самою світлотою; решта — як була. */
export function recolorCoat(data: Uint8ClampedArray, coat: number): void {
  const cr = (coat >> 16) & 0xff;
  const cg = (coat >> 8) & 0xff;
  const cb = coat & 0xff;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Рудий: червоний найбільший, синій найменший, тон 14–40°, насичений.
    const span = r - b;
    if (r < g || g < b || span < 60 || span < r * 0.4) continue;
    const hue = (60 * (g - b)) / span;
    if (hue < 14 || hue > 40) continue;
    const k = Math.min(1.3, r / ORANGE_MAX);
    data[i] = Math.min(255, Math.round(cr * k));
    data[i + 1] = Math.min(255, Math.round(cg * k));
    data[i + 2] = Math.min(255, Math.round(cb * k));
  }
}
