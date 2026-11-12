// Фігура змінної ширини з кадру атласу «трьома частинами»: лівий край, середина, що тягнеться, правий край. Так нерухомі
// плашки й шкали — звичайні зображення зі спільного атласу, а не `Graphics`, який Phaser розбиває на трикутники щокадру.
// `NineSlice` Phaser у запасному Canvas не малюється. Лише розрахунок, без Phaser; зображення — `slice3art.ts`.
//
// На відміну від `stretchSlices` (`iso/hudlook.ts`), рахує від тіла фігури, а не від полотна: вужча за два краї фігура
// лишається в межах цілі (заливка шкали малого показника), а поле полотна в неї не стискається.

import type { ArtEntry, ArtSize } from "./art/types";

/** Поле полотна, одиниці арту: ближче до краю кадру нічого не намальовано (`art/STYLE.md` §2). */
const FIELD = 4;

/** Кадр фігури, одиниці арту від лівого верхнього кута полотна. */
export interface Slice3Frame {
  size: ArtSize;
  /** Тіло: прямокутник, що лягає рівно на ціль. */
  body: { left: number; top: number; right: number; bottom: number };
  /** Ширина краю від боку тіла всередину: заокруглення, яке не тягнеться. */
  cap: number;
  /** На скільки намальоване виходить за тіло з боків (обвідка, тінь): іде разом із краєм. */
  bleed: number;
}

/** Частина кадру: звідки (`src`, `srcW`, одиниці арту від лівого краю полотна) і куди (`x`, `w`, px цілі). */
export interface Slice3Part {
  src: number;
  srcW: number;
  x: number;
  w: number;
}

export interface Slice3Layout {
  /** px цілі на одиницю арту — за висотою тіла. */
  scale: number;
  /** Верх полотна кадру, px цілі. */
  y: number;
  /** Лівий край, середина, правий край; null — частини немає. */
  parts: [Slice3Part | null, Slice3Part | null, Slice3Part | null];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Розкласти кадр так, щоб його тіло лягло на `target`: масштаб — за висотою, краї — у ньому ж, ширину добирає середина. Ціль,
 * вужча за два краї, — самі краї, стиснуті навпіл.
 */
export function slice3(frame: Slice3Frame, target: Rect): Slice3Layout {
  const { body, cap, bleed } = frame;
  const scale = target.h / (body.bottom - body.top);
  const y = target.y - body.top * scale;
  if (target.w <= 0) return { scale, y, parts: [null, null, null] };
  const side = Math.min(cap * scale, target.w / 2);
  const out = bleed * scale;
  const middle = target.w - 2 * side;
  const srcW = bleed + cap;
  return {
    scale,
    y,
    parts: [
      { src: body.left - bleed, srcW, x: target.x - out, w: out + side },
      middle > 0 ? { src: body.left + cap, srcW: body.right - body.left - 2 * cap, x: target.x + side, w: middle } : null,
      { src: body.right - cap, srcW, x: target.x + target.w - side, w: side + out },
    ],
  };
}

/**
 * Кадр фігури за записом маніфесту: тіло — між точками `body` і `body-end`, край — `cap.x`; усе, що намальовано за тілом
 * (від поля полотна), іде разом із краями.
 */
export function slice3Frame(entry: Pick<ArtEntry, "id" | "size" | "points">): Slice3Frame {
  const from = entry.points?.["body"];
  const to = entry.points?.["body-end"];
  const cap = entry.points?.["cap"];
  if (!from || !to || !cap) throw new Error(`у записі «${entry.id}» немає точок body, body-end і cap`);
  return { size: entry.size, body: { left: from.x, top: from.y, right: to.x, bottom: to.y }, cap: cap.x, bleed: from.x - FIELD };
}
