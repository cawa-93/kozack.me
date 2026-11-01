// Іконки під ключами текстур (крок 16, пакет T3): `iconTexture(name)` — «вікно» на кадр атласу `icon/<назва>`: той самий
// WebGL-текстур сторінки атласу, без копії пікселів і без ще однієї сторінки у відеопам'яті. Так кожне місце, що бере іконку
// за ключем (індикатори запасів, політ запасів), показує арт A11/A12 — і нічого не знає про атлас. Розмір на екрані всі
// задають `setDisplaySize`; origin за замовчуванням — центр полотна, а pivot іконки й є центр (`ICON` маніфесту).
//
// Такі текстури НЕ можна видаляти (`textures.remove`): Phaser тоді видалив би й спільний WebGL-текстур — сторінку атласу.
// Їх і не видаляють: іконки створює `createIconTextures` один раз на гру.

import type Phaser from "phaser";

import { ART_TEXTURE } from "../art/types";

/** Назва єдиного кадру текстури-вікна: його Phaser і показує, коли кадр не вказано (`Texture.firstFrame`). */
export const ALIAS_FRAME = "art";

/** Що з кадру Phaser треба, щоб відтворити його в іншій текстурі. */
export interface FrameLike {
  readonly sourceIndex: number;
  readonly cutX: number;
  readonly cutY: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly realWidth: number;
  readonly realHeight: number;
  readonly trimmed: boolean;
  /** Де вирізка на повному полотні (для обрізаного кадру — `destX`, `destY` з `setTrim`). */
  readonly x: number;
  readonly y: number;
}

/** Вирізка кадру на сторінці атласу й обрізка полотна (`Frame.setTrim`): повне полотно й де на ньому вирізка. */
export interface FrameCut {
  source: number;
  x: number;
  y: number;
  w: number;
  h: number;
  trim: { width: number; height: number; x: number; y: number } | null;
}

/** Вирізка й обрізка кадру — щоб текстура-вікно показувала рівно те саме полотно, що й кадр атласу. */
export function frameCut(frame: FrameLike): FrameCut {
  return {
    source: frame.sourceIndex,
    x: frame.cutX,
    y: frame.cutY,
    w: frame.cutWidth,
    h: frame.cutHeight,
    trim: frame.trimmed ? { width: frame.realWidth, height: frame.realHeight, x: frame.x, y: frame.y } : null,
  };
}

/**
 * Текстура `key` — вікно на кадр атласу `frameName`. false — не вийшло (атласу чи кадру немає, ключ зайнятий, малює не
 * WebGL): тоді той, хто кличе, копіює кадр на своє полотно (`icons.ts`).
 */
export function aliasArtFrame(textures: Phaser.Textures.TextureManager, key: string, frameName: string): boolean {
  if (textures.exists(key) || !textures.exists(ART_TEXTURE)) return false;
  const atlas = textures.get(ART_TEXTURE);
  if (!atlas.has(frameName)) return false;
  const cut = frameCut(atlas.get(frameName));
  const page = atlas.source[cut.source]?.glTexture;
  if (!page) return false;
  const texture = textures.addGLTexture(key, page);
  if (!texture) return false;
  const frame = texture.add(ALIAS_FRAME, 0, cut.x, cut.y, cut.w, cut.h);
  if (frame && cut.trim) frame.setTrim(cut.trim.width, cut.trim.height, cut.trim.x, cut.trim.y, cut.w, cut.h);
  return frame !== null;
}
