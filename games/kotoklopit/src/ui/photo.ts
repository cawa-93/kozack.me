// Малюнок фото титрів життя (§4.2) на полотні: нерухомий кадр частин скелета з гри, без тла. Стрічка — до 60 фото, тож кожне
// малюється один раз, без циклу анімації (`liveportrait.ts` для котів у картках — інша річ). Canvas 2D, без Phaser.

import { clothIds } from "../view/art/cloth";
import { composeFrame, createCtx, figureState, inkOf, loadFigure, partCloth, partMatrix, portraitFrame, type Canvas2D, type FigureInk } from "../view/art/compose";
import { artLayerSource, type FrameLayers } from "../view/art/sources";
import { recolorCoat } from "../view/photocoat";
import { photoFrame, type Box } from "../view/photoframe";
import type { FrameId } from "../view/art/types";
import type { Photo } from "../view/photo";
import { photoLayout, type PhotoLayout, type PhotoPiece } from "../view/photoposes";

/** Поле довкола героїв, частка меншої сторони полотна. */
const PADDING = 0.06;
/** Скільки силуетів кадрів пам'ятати: на всю стрічку з запасом. */
const INKS_MAX = 4000;

/**
 * Намальоване кадру частини (пікселі полотна кадру) за кадром і рецептом: місце героя на фото — за силуетом, а не за полотнами
 * частин (під котом і з боку хвоста в них порожньо — кіт висів би вгорі). Читати пікселі дорого — раз на кадр і рецепт.
 */
const inks = new Map<string, FigureInk | null>();
/** Спільне полотно, на якому складається частина перед тим, як лягти на фото; росте під найбільший кадр. */
let partCtx: Canvas2D | null = null;
/** Яке фото чекає атласу на кожному полотні: діє лише останнє. */
const waiting = new WeakMap<HTMLCanvasElement, Photo>();

/** Намалювати фото на полотні; атлас ще вантажиться — домалювати, щойно він готовий. */
export function drawPhoto(canvas: HTMLCanvasElement, photo: Photo): void {
  const layout = photoLayout(photo);
  const frames = layout.pieces.map((piece) => portraitFrame(piece.part));
  const cloth = [...new Set(layout.pieces.flatMap((piece) => clothIds(piece.recipe)))];
  const state = figureState(frames, cloth);
  if (state === "missing") return;
  if (state === "loading") {
    waiting.set(canvas, photo);
    void loadFigure(frames, cloth).then((ok) => {
      if (!ok || waiting.get(canvas) !== photo) return;
      waiting.delete(canvas);
      paint(canvas, layout, frames);
    });
    return;
  }
  waiting.delete(canvas);
  paint(canvas, layout, frames);
}

/**
 * Усі частини на полотно: вписано за силуетом героїв із полем, не менше за рамку фото (`span`), донизу й посередині. Речі знімка
 * (`soft`) входять у кадр лише в межах найбільшої рамки довкола героїв (`photoFrame`), решту обрізає край фото.
 */
function paint(canvas: HTMLCanvasElement, layout: PhotoLayout, frames: readonly FrameId[]): void {
  const sources: FrameLayers[] = [];
  for (const frame of frames) {
    const source = artLayerSource(frame);
    if (!source) return;
    sources.push(source);
  }
  let core: Box | null = null;
  const soft: Box[] = [];
  for (const [i, piece] of layout.pieces.entries()) {
    if (piece.bleed) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const source = sources[i]!;
    // Лише напівпрозоре (тінь під ногами) — межами полотна кадру: інакше тінь обрізало б дно фото.
    const ink = inkFor(`${frames[i]}|${piece.recipe.key}`, source, piece) ?? { minX: 0, minY: 0, maxX: source.w, maxY: source.h };
    const m = partMatrix(piece.part, source.frame.pivot);
    const fx = source.frame.size.w / source.w;
    const fy = source.frame.size.h / source.h;
    for (const [px, py] of [
      [ink.minX, ink.minY],
      [ink.maxX, ink.minY],
      [ink.minX, ink.maxY],
      [ink.maxX, ink.maxY],
    ] as const) {
      const x = m.a * px * fx + m.c * py * fy + m.e;
      const y = m.b * px * fx + m.d * py * fy + m.f;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (piece.soft) soft.push({ minX, minY, maxX, maxY });
    else core = core ? { minX: Math.min(core.minX, minX), minY: Math.min(core.minY, minY), maxX: Math.max(core.maxX, maxX), maxY: Math.max(core.maxY, maxY) } : { minX, minY, maxX, maxY };
  }
  const frame = photoFrame(core, soft);
  if (!frame) return;
  const { minX, minY, maxX, maxY } = frame;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.min(W, H) * PADDING;
  const k = Math.max(0, Math.min((W - pad * 2) / Math.max(maxX - minX, layout.span.w, 1), (H - pad * 2) / Math.max(maxY - minY, layout.span.h, 1)));
  const ox = W / 2 - ((minX + maxX) / 2) * k;
  const oy = H - pad - maxY * k;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const [i, piece] of layout.pieces.entries()) {
    const source = sources[i]!;
    const part = tinted(source, piece);
    if (!part) continue;
    const m = partMatrix(piece.part, source.frame.pivot);
    const sx = source.frame.size.w / source.w;
    const sy = source.frame.size.h / source.h;
    ctx.setTransform(m.a * k * sx, m.b * k * sx, m.c * k * sy, m.d * k * sy, m.e * k + ox, m.f * k + oy);
    ctx.drawImage(part.canvas, 0, 0, source.w, source.h, 0, 0, source.w, source.h);
  }
  ctx.restore();
}

function inkFor(key: string, source: FrameLayers, piece: PhotoPiece): FigureInk | null {
  const have = inks.get(key);
  if (have !== undefined) return have;
  const part = tinted(source, piece);
  const ink = part ? inkOf(part, source.w, source.h) : null;
  if (inks.size >= INKS_MAX) inks.clear();
  inks.set(key, ink);
  return ink;
}

/** Частина, складена рецептом на спільному полотні (дійсна до наступного виклику); null — полотна немає. */
function tinted(source: FrameLayers, piece: PhotoPiece): Canvas2D | null {
  if (!partCtx || partCtx.canvas.width < source.w || partCtx.canvas.height < source.h) {
    partCtx = createCtx(Math.max(source.w, partCtx?.canvas.width ?? 0), Math.max(source.h, partCtx?.canvas.height ?? 0));
  }
  const part = partCtx;
  if (!part) return null;
  // Полотно більше за кадр і пам'ятає попередні частини: зі згладжуванням `drawImage` бере й пікселі за межею кадру.
  part.setTransform(1, 0, 0, 1, 0, 0);
  part.clearRect(0, 0, part.canvas.width, part.canvas.height);
  const view = piece.part.view;
  composeFrame(part, source.source, piece.recipe, { w: source.w, h: source.h, cloth: partCloth(clothIds(piece.recipe), source, view === undefined ? "front" : view) });
  if (piece.coat !== undefined) {
    const image = part.getImageData(0, 0, source.w, source.h);
    recolorCoat(image.data, piece.coat);
    part.putImageData(image, 0, 0);
  }
  return part;
}
