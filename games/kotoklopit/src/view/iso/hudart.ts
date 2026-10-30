// Кадр атласу, що тягнеться вшир «трьома частинами» (крок 16, пакет T3): смуга панелі `ui/hud/band`. NineSlice Phaser
// обрізаних кадрів атласу не підтримує (`setTrim`), тож частини — три зображення того самого кадру з `setCrop`: кути як є,
// середина розтягнута. Працює однаково з кадром атласу й із заглушкою (`addArt`).

import type Phaser from "phaser";

import { addArt, type ArtFrameOptions, type ArtParent } from "../art/atlas";
import { artEntry } from "../art/manifest";
import type { ArtId } from "../art/types";
import { stretchSlices } from "./hudlook";

export class StretchArt {
  private readonly parts: Phaser.GameObjects.Image[];
  /** Полотно запису й ширина кута, одиниці арту (для панелі — пікселі полотна гри). */
  private readonly frame: { w: number; h: number };
  private readonly cap: number;

  constructor(scene: Phaser.Scene, parent: ArtParent, id: ArtId, opts: ArtFrameOptions = {}) {
    const entry = artEntry(id);
    this.frame = entry?.size ?? { w: 64, h: 64 };
    this.cap = entry?.points?.["slice"]?.x ?? 0;
    this.parts = [0, 1, 2].map(() => addArt(scene, parent, id, opts).setOrigin(0, 0));
  }

  /** Лівий верхній кут (x, y), ширина й висота на екрані. */
  place(x: number, y: number, width: number, height: number): this {
    const slices = stretchSlices(this.frame.w, this.cap, width);
    this.parts.forEach((image, i) => {
      const slice = slices[i];
      image.setVisible(slice !== undefined);
      if (!slice) return;
      // Пікселів текстури на одиницю: в атласі — `res`, у заглушки — свої.
      const kx = image.width / this.frame.w;
      const ky = image.height / this.frame.h;
      const scaleX = slice.w / (slice.srcW * kx);
      const scaleY = height / (this.frame.h * ky);
      image.setCrop(slice.src * kx, 0, slice.srcW * kx, image.height);
      image.setScale(scaleX, scaleY);
      image.setPosition(x + slice.x - slice.src * kx * scaleX, y);
    });
    return this;
  }

  setDepth(depth: number): this {
    for (const image of this.parts) image.setDepth(depth);
    return this;
  }

  /** Зображення частин — щоб додати їх до шару чи контейнера. */
  get images(): readonly Phaser.GameObjects.Image[] {
    return this.parts;
  }
}
