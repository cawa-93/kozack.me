// Настрій кота сердечками (§9.12): зміна настрою — зелені сердечка, що злітають і тануть довкола кота,
// падіння — червоні розбиті. Що більша зміна, то більше сердечок.

import Phaser from "phaser";

import { iconTexture } from "./iconnames";
import { WORLD_LAYERS } from "./world/layers";

const DEPTH = WORLD_LAYERS.hearts;
/** Одне сердечко — на таку зміну настрою; за раз — не більше трьох. */
const STEP = 1;
const MAX_AT_ONCE = 3;
const SIZE = 34;

export class MoodHearts {
  /** Накопичена зміна настрою кожного кота, ще не показана сердечками. */
  private readonly pending = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly anchor: (cat: number) => { x: number; y: number } | null,
  ) {}

  add(cat: number, delta: number): void {
    this.pending.set(cat, (this.pending.get(cat) ?? 0) + delta);
  }

  /** Забути непоказане: після ночі чи перезапуску дня старі зміни вже нічого не кажуть. */
  clear(): void {
    this.pending.clear();
  }

  /** Щокадру: випустити сердечка за накопичену зміну. */
  update(): void {
    for (const [cat, total] of this.pending) {
      const count = Math.min(MAX_AT_ONCE, Math.floor(Math.abs(total) / STEP));
      if (count === 0) continue;
      const at = this.anchor(cat);
      if (at) for (let i = 0; i < count; i++) this.spawn(at, total > 0, i);
      // Понад три за раз не накопичуємо: інакше ласощі сипали б сердечками ще довго.
      this.pending.set(cat, Math.abs(total) > MAX_AT_ONCE * STEP ? 0 : total - Math.sign(total) * count * STEP);
    }
  }

  private spawn(at: { x: number; y: number }, good: boolean, index: number): void {
    const x = at.x + (Math.random() - 0.5) * 36;
    const image = this.scene.add
      .image(x, at.y + 6, iconTexture(good ? "mood-up" : "mood-down"))
      .setDisplaySize(SIZE, SIZE)
      .setAlpha(0)
      .setDepth(DEPTH)
      .addToDisplayList(this.layer);
    this.scene.tweens.add({
      targets: image,
      y: at.y - 50 - Math.random() * 16,
      x: x + (Math.random() - 0.5) * 20,
      alpha: { from: 1, to: 0 },
      duration: 1100,
      delay: index * 140,
      ease: "Sine.easeOut",
      onComplete: () => image.destroy(),
    });
  }
}
