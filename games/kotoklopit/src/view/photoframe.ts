// Рамка фото титрів (§4.2): кадр задають герої (коти й бабли над ними), а речі знімка — у масштабі гри, тож велика (диван, шафа)
// у кадр цілком не входить. Речі розширюють кадр лише в межах найбільшої рамки довкола героїв — кіт лишається приблизно на половину
// фото. Без Phaser і DOM.

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Найбільша рамка довкола героїв, у яку ще входять речі, одиниці фото: сидячий дорослий кіт у ній — близько половини. */
export const PROP_FRAME = { w: 130, h: 130 } as const;

function union(a: Box | null, b: Box): Box {
  return a ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) } : b;
}

/** Спільна частина; порожня — null. */
function overlap(a: Box, b: Box): Box | null {
  const box = { minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY) };
  return box.minX < box.maxX && box.minY < box.maxY ? box : null;
}

/** Початок вікна завдовжки `size`, що вміщує відрізок героїв [min, max] і стоїть якнайближче серединою до `center`. */
function slide(min: number, max: number, size: number, center: number): number {
  return Math.min(min, Math.max(max - size, center - size / 2));
}

/**
 * Рамка фото: `core` — герої (вони в кадрі завжди й цілком), `soft` — речі. Вікно найбільшої рамки зсувається туди, де речі (під
 * котом — униз, над ним — угору), і речі входять у кадр лише в його межах; без героїв — рамка самих речей.
 */
export function photoFrame(core: Box | null, soft: readonly Box[]): Box | null {
  if (!core) return soft.reduce<Box | null>(union, null);
  const w = Math.max(PROP_FRAME.w, core.maxX - core.minX);
  const h = Math.max(PROP_FRAME.h, core.maxY - core.minY);
  // Усе, куди вікно взагалі дістає: речі далі за це кадру не зсувають.
  const reach: Box = { minX: core.maxX - w, minY: core.maxY - h, maxX: core.minX + w, maxY: core.minY + h };
  const near = soft.reduce<Box | null>((all, box) => {
    const part = overlap(box, reach);
    return part ? union(all, part) : all;
  }, null);
  if (!near) return core;
  const minX = slide(core.minX, core.maxX, w, (near.minX + near.maxX) / 2);
  const minY = slide(core.minY, core.maxY, h, (near.minY + near.maxY) / 2);
  const window: Box = { minX, minY, maxX: minX + w, maxY: minY + h };
  return soft.reduce<Box>((all, box) => {
    const part = overlap(box, window);
    return part ? union(all, part) : all;
  }, core);
}
