// Фігура змінної ширини з кадру атласу в Phaser: три зображення того самого кадру з `setCrop` (розкладку рахує `slice3.ts`).
// Кадр беруть прямо з атласу, без `art/atlas.ts`: модулі, що складають плашки, лишаються без Phaser і тестуються в Node з
// підробною сценою.

import type Phaser from "phaser";

import { frameNameFor } from "./art/placement";
import { ART_TEXTURE, type ArtEntry, type ArtId } from "./art/types";
import { uiEntry } from "./iso/uilook";
import { slice3, slice3Frame, type Slice3Frame } from "./slice3";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Slice3Art {
  /** Лівий край, середина, правий край: той, хто складає фігуру, кладе їх у свій контейнер. */
  readonly images: readonly Phaser.GameObjects.Image[];
  private readonly entry: ArtEntry;
  private readonly frame: Slice3Frame;
  private state: string | undefined;
  /** Куди фігуру поклали востаннє: новий кадр (`setState`) лягає туди ж. */
  private target: Rect | null = null;

  constructor(scene: Phaser.Scene, id: ArtId, state?: string) {
    this.entry = uiEntry(id);
    this.frame = slice3Frame(this.entry);
    this.state = state;
    const name = frameNameFor(id, this.entry, { state });
    this.images = [0, 1, 2].map(() => scene.add.image(0, 0, ART_TEXTURE, name).setOrigin(0, 0));
  }

  /** Покласти тіло фігури на `target`: висота — масштаб кадру, ширину добирає середина. */
  place(target: Rect): this {
    this.target = target;
    const { scale, y, parts } = slice3(this.frame, target);
    const { w, h } = this.frame.size;
    this.images.forEach((image, i) => {
      const part = parts[i];
      image.setVisible(part != null);
      if (!part) return;
      // Пікселів текстури на одиницю арту (`res` запису).
      const kx = image.width / w;
      const scaleX = part.w / (part.srcW * kx);
      image.setCrop(part.src * kx, 0, part.srcW * kx, image.height);
      image.setScale(scaleX, (scale * h) / image.height);
      // Обрізане зображення лишається на місці свого полотна: зсунути полотно так, щоб частина стала в `part.x`.
      image.setPosition(part.x - part.src * kx * scaleX, y);
    });
    return this;
  }

  /** Інший стан кадру (колір) на тому самому місці. */
  setState(state: string): this {
    if (state === this.state) return this;
    this.state = state;
    const name = frameNameFor(this.entry.id, this.entry, { state });
    for (const image of this.images) image.setFrame(name).setOrigin(0, 0);
    if (this.target) this.place(this.target);
    return this;
  }
}
