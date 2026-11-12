// З чого й на якому полотні запікається тонований кадр (`bake.ts`): шари кадру зі сторінок атласу (`sources.ts`) і рамка
// вмісту — частина полотна кадру, де щось намальовано (`art/STYLE.md` §15). Текстура запеченого кадру — лише рамка: складати,
// вантажити у відеопам'ять і тримати в бюджеті порожнє поле довкола частини нема для чого. Без Phaser і DOM.

import type { LayerImage, LayerSource } from "./compose";
import { unionBox } from "./placement";
import { artLayerSource, type FrameLayers } from "./sources";
import type { ArtLayer, ArtSize, FrameBox, FrameId, TintRecipe } from "./types";

/** Шари кадру для запікання: джерело (зсуви — у полотні кадру), полотно кадру й рамка вмісту в ньому, пікселі атласу. */
export interface BakeLayers {
  source: LayerSource;
  canvas: ArtSize;
  box: FrameBox;
}

/**
 * Шари кадру `frame` для рецепта: кожен крок — свій шар; накладки `extra-*` — з кадру накладок `extras` (те саме полотно,
 * інший запис). Рамка — рамка вмісту кадру з `index.json`, а якщо рецепт кладе накладку, — разом із рамкою кадру накладок.
 * null — атласу чи кадру немає, він заглушка конвеєра або жодного шару рецепта в ньому немає: тоді запікається заглушка.
 */
export function bakeLayers(frame: FrameId, extras: FrameId | null, recipe: TintRecipe, lookup: (frame: FrameId) => FrameLayers | null = artLayerSource): BakeLayers | null {
  const own = lookup(frame);
  const extra = extras ? lookup(extras) : null;
  const found = new Map<ArtLayer, LayerImage>();
  let box: FrameBox | null = null;
  let canvas: ArtSize | null = null;
  for (const { layer } of recipe.steps) {
    if (found.has(layer)) continue;
    const from = layer.startsWith("extra-") && extras ? extra : own;
    const image = from?.source(layer);
    if (!from || !image) continue;
    found.set(layer, image);
    canvas ??= { w: from.w, h: from.h };
    // Рамка кадру накладок — лише якщо рецепт справді кладе з нього щось намальоване: решті рецептів вона розтягла б
    // текстуру дарма.
    if (isBlank(image) || isBlank(from.box)) continue;
    box = box ? unionBox(box, from.box) : from.box;
  }
  if (!canvas || found.size === 0) return null;
  return { source: (layer) => found.get(layer) ?? null, canvas, box: box ?? BLANK };
}

/** Рамка кадру, в якому нічого не намальовано: один піксель. */
const BLANK: FrameBox = { x: 0, y: 0, w: 1, h: 1 };

/** Порожній шар чи кадр: спільний прозорий піксель атласу в (0, 0) — рамки він не розтягує. */
function isBlank(at: LayerImage | FrameBox): boolean {
  if ("sw" in at) return at.sw === 1 && at.sh === 1 && (at.dx ?? 0) === 0 && (at.dy ?? 0) === 0;
  return at.w === 1 && at.h === 1 && at.x === 0 && at.y === 0;
}
