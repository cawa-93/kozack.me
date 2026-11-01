// Індикатор вмісту сховища (§6.4): ряд іконок запасів із кількістю над холодильником, шафкою тощо.
// Нуль — червоним.
//
// Два вигляди (`STORAGE_LOOKS`): старий і нової графіки (крок 16, T4) — паперова плашка в чорнильній рамці з тінню, кольори
// палітри арту (`art/STYLE.md`), більша на стільки, на скільки дрібніший масштаб камери в ізометрії (≈ 0,72 px CSS на одиницю
// замість ≈ 0,9–1), — тож на екрані вона така сама завбільшки.

import type Phaser from "phaser";

import { PALETTE, SHADE } from "../../art/palette";
import type { StorageLine } from "../sim/storage";
import { COLORS } from "./colors";
import { iconTexture } from "./iconnames";
import { PRODUCT_ICONS } from "./symbols";
import type { Projection } from "./world/projection";
import { WORLD_LAYERS } from "./world/layers";

const DEPTH = WORLD_LAYERS.storage;
const FONT = "system-ui, sans-serif";

/** Як виглядає індикатор: розміри (px світу) і кольори. */
export interface StorageLook {
  /** Розмір іконки запасу в індикаторі й крок між ними. */
  icon: number;
  chip: number;
  /** Ширша клітинка, коли поруч із кількістю ліміт («12/42»). */
  wideChip: number;
  pad: number;
  radius: number;
  /** Тло плашки. */
  fill: number;
  fillAlpha: number;
  /** Рамка: товщина, колір, непрозорість. */
  line: number;
  lineColor: number;
  lineAlpha: number;
  /** Падаюча тінь плашки: на скільки нижче й якої непрозорості (0 — без тіні). */
  drop: number;
  dropColor: number;
  dropAlpha: number;
  /** Кількість: розмір шрифту, відступ від іконки, колори числа й нуля. */
  fontSize: number;
  gap: number;
  text: string;
  zero: string;
}

/** Колір палітри арту `#rrggbb` як число для Phaser. */
const hex = (color: string): number => Number.parseInt(color.slice(1), 16);
/** Ізометрія дрібніша за старий вигляд: стільки одиниць арту на піксель старого індикатора. */
const ISO_SCALE = 1.3;

export const STORAGE_LOOKS: Record<Projection["kind"], StorageLook> = {
  oblique: {
    icon: 26,
    chip: 50,
    wideChip: 76,
    pad: 5,
    radius: 8,
    fill: 0xffffff,
    fillAlpha: 0.95,
    line: 2,
    lineColor: COLORS.ink,
    lineAlpha: 0.6,
    drop: 0,
    dropColor: 0,
    dropAlpha: 0,
    fontSize: 15,
    gap: 2,
    text: "#1f1a24",
    zero: "#d8483b",
  },
  // Нова графіка: папір, чорнильна рамка `LINE.inner` і тінь `shade` (`art/STYLE.md`, «ui»), нуль — червоний сенсу «ні»
  // (`red`, а не `redLo`: «…Lo» — лінії матеріалу, на папері вони майже як чорнило).
  iso: {
    icon: Math.round(26 * ISO_SCALE),
    chip: Math.round(50 * ISO_SCALE),
    wideChip: Math.round(76 * ISO_SCALE),
    pad: Math.round(5 * ISO_SCALE),
    radius: 10,
    fill: hex(PALETTE.paper),
    fillAlpha: 1,
    line: 3.5,
    lineColor: hex(PALETTE.ink),
    lineAlpha: 1,
    drop: 4,
    dropColor: hex(PALETTE.shade),
    dropAlpha: SHADE.base,
    fontSize: Math.round(15 * ISO_SCALE),
    gap: 3,
    text: PALETTE.ink,
    zero: PALETTE.red,
  },
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
    private readonly look: StorageLook = STORAGE_LOOKS.oblique,
  ) {}

  /** Показати вміст над сховищем; порожній список прибирає індикатор. Викликати щокадру. */
  set(id: string, lines: readonly StorageLine[], x: number, y: number): void {
    const current = this.shown.get(id);
    const key = lines.map((l) => `${l.product}:${l.count}/${l.limit ?? ""}`).join(",");
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
    const look = this.look;
    const chip = lines.some((l) => l.limit !== undefined) ? look.wideChip : look.chip;
    const width = lines.length * chip + look.pad;
    const height = look.icon + look.pad * 2;
    const bg = this.scene.add.graphics();
    if (look.drop > 0) bg.fillStyle(look.dropColor, look.dropAlpha).fillRoundedRect(-width / 2, -height + look.drop, width, height, look.radius);
    bg.fillStyle(look.fill, look.fillAlpha).fillRoundedRect(-width / 2, -height, width, height, look.radius);
    bg.lineStyle(look.line, look.lineColor, look.lineAlpha).strokeRoundedRect(-width / 2, -height, width, height, look.radius);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    lines.forEach((line, i) => {
      const left = -width / 2 + look.pad + i * chip;
      parts.push(this.scene.add.image(left + look.icon / 2, -height / 2, iconTexture(PRODUCT_ICONS[line.product])).setDisplaySize(look.icon, look.icon));
      parts.push(
        this.scene.add
          .text(left + look.icon + look.gap, -height / 2, line.limit === undefined ? String(line.count) : `${line.count}/${line.limit}`, {
            fontFamily: FONT,
            fontSize: `${look.fontSize}px`,
            fontStyle: "bold",
            color: line.count === 0 ? look.zero : look.text,
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
