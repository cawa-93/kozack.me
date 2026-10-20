// Індикатор вмісту сховища (§6.4): ряд іконок запасів із кількістю над холодильником, шафкою тощо.
// Нуль — червоним.

import Phaser from "phaser";

import type { Product } from "../sim/types";
import type { StorageLine } from "../sim/storage";
import { COLORS } from "./geometry";
import type { IconName } from "./icons";

const DEPTH = 10_000;
const FONT = "system-ui, sans-serif";
/** Розмір іконки запасу в індикаторі й крок між ними. */
const ICON = 26;
const CHIP = 50;
const PAD = 5;

/** Іконка кожного запасу: над сховищем і над персонажем, коли запас витрачено. */
export const PRODUCT_ICONS: Record<Product, IconName> = {
  food: "food",
  hygiene: "soap",
  catFood: "kibble",
  sterileFood: "kibble-sterile",
  litter: "litter",
  pills: "pills",
  drops: "drops",
  humanMeds: "human-meds",
  treats: "treats",
  collar: "collar",
  bell: "bell",
  shampoo: "shampoo",
  detergent: "detergent",
};

interface Indicator {
  container: Phaser.GameObjects.Container;
  key: string;
}

export class StorageIndicators {
  private readonly shown = new Map<string, Indicator>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  /** Показати вміст над сховищем; порожній список прибирає індикатор. Викликати щокадру. */
  set(id: string, lines: readonly StorageLine[], x: number, y: number): void {
    const current = this.shown.get(id);
    const key = lines.map((l) => `${l.product}:${l.count}`).join(",");
    if (lines.length === 0) {
      current?.container.destroy();
      this.shown.delete(id);
      return;
    }
    if (current && current.key === key) {
      current.container.setPosition(x, y);
      return;
    }
    current?.container.destroy();
    this.shown.set(id, { container: this.make(lines, x, y), key });
  }

  private make(lines: readonly StorageLine[], x: number, y: number): Phaser.GameObjects.Container {
    const width = lines.length * CHIP + PAD;
    const height = ICON + PAD * 2;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.95).fillRoundedRect(-width / 2, -height, width, height, 8);
    bg.lineStyle(2, COLORS.ink, 0.6).strokeRoundedRect(-width / 2, -height, width, height, 8);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    lines.forEach((line, i) => {
      const left = -width / 2 + PAD + i * CHIP;
      parts.push(this.scene.add.image(left + ICON / 2, -height / 2, `icon-${PRODUCT_ICONS[line.product]}`).setDisplaySize(ICON, ICON));
      parts.push(
        this.scene.add
          .text(left + ICON + 2, -height / 2, String(line.count), {
            fontFamily: FONT,
            fontSize: "15px",
            fontStyle: "bold",
            color: line.count === 0 ? "#d8483b" : "#1f1a24",
            resolution: 2,
          })
          .setOrigin(0, 0.5),
      );
    });
    return this.scene.add.container(x, y, parts).setDepth(DEPTH).addToDisplayList(this.layer);
  }

  clear(): void {
    for (const indicator of this.shown.values()) indicator.container.destroy();
    this.shown.clear();
  }
}
