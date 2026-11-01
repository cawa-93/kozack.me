// Кадр атласу, що тягнеться вшир «трьома частинами» (крок 16, пакет T3): смуга панелі `ui/hud/band` і рамки шкал
// `ui/hud/bar`. NineSlice Phaser обрізаних кадрів атласу не підтримує (`setTrim`), тож частини — три зображення того самого
// кадру з `setCrop`: кути в масштабі висоти (не сплющуються), середина розтягнута. Працює однаково з кадром атласу й із
// заглушкою (`addArt`).

import type Phaser from "phaser";

import { addArt, type ArtFrameOptions, type ArtParent } from "../art/atlas";
import type { ArtId, ArtSize } from "../art/types";
import { stretchSlices, type Rect } from "./hudlook";
import { uiEntry } from "./uilook";

export class StretchArt {
  private readonly parts: Phaser.GameObjects.Image[];
  /** Полотно запису й ширина кута, одиниці арту (для панелі — пікселі полотна гри). */
  readonly frame: ArtSize;
  private readonly cap: number;

  constructor(scene: Phaser.Scene, parent: ArtParent, id: ArtId, opts: ArtFrameOptions = {}) {
    const entry = uiEntry(id);
    this.frame = entry.size;
    this.cap = entry.points?.["slice"]?.x ?? 0;
    this.parts = [0, 1, 2].map(() => addArt(scene, parent, id, opts).setOrigin(0, 0));
  }

  /** Покласти полотно кадру в прямокутник `rect` (px): висота — масштаб усього кадру, ширину добирає середина. */
  place(rect: Rect): this {
    const scale = rect.h / this.frame.h;
    const slices = stretchSlices(this.frame.w, this.cap, rect.w, scale);
    this.parts.forEach((image, i) => {
      const slice = slices[i];
      image.setVisible(slice !== undefined);
      if (!slice) return;
      // Пікселів текстури на одиницю: в атласі — `res`, у заглушки — свої.
      const kx = image.width / this.frame.w;
      const ky = image.height / this.frame.h;
      const scaleX = slice.w / (slice.srcW * kx);
      image.setCrop(slice.src * kx, 0, slice.srcW * kx, image.height);
      image.setScale(scaleX, scale / ky);
      image.setPosition(rect.x + slice.x - slice.src * kx * scaleX, rect.y);
    });
    return this;
  }

  setDepth(depth: number): this {
    for (const image of this.parts) image.setDepth(depth);
    return this;
  }

  setAlpha(alpha: number): this {
    for (const image of this.parts) image.setAlpha(alpha);
    return this;
  }
}
