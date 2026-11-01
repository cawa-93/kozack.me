// Індикатор вмісту сховища (§6.4): ряд іконок запасів із кількістю над холодильником, шафкою тощо.
// Нуль — червоним.
//
// Два вигляди (`STORAGE_LOOKS`): старий і нової графіки (крок 16, T4) — паперова плашка в чорнильній рамці з тінню, кольори
// палітри арту (`art/STYLE.md`), більша на стільки, на скільки дрібніший масштаб камери в ізометрії (≈ 0,72 px CSS на одиницю
// замість ≈ 0,9–1), — тож на екрані вона така сама завбільшки. У новому вигляді плашка ще й не закриває голову персонажа:
// він стоїть біля сховища щоразу, коли її видно (вона лише для сховища в фокусі), а в ізометрії низькі сховища (ящики,
// пралька, шафка з кормом) нижчі за нього.

import type Phaser from "phaser";

import { PALETTE, SHADE } from "../../art/palette";
import type { StorageLine } from "../sim/storage";
import { COLORS } from "./colors";
import { iconTexture } from "./iconnames";
import { ANCHOR_GAP, PERSON_FIGURE } from "./iso/geometry";
import { BUBBLE_ROOM } from "./iso/markslayout";
import { PRODUCT_ICONS } from "./symbols";
import type { Point } from "./world/part";
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
  /** На скільки плашка вище за точку сховища, коли над ним висить бабл стану: місце бабла (`DayScene`). */
  bubbleLift: number;
  /** Плашка не закриває голову персонажа: коли він стоїть під нею, вона піднімається над його головою. */
  clearHead: boolean;
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
    bubbleLift: 56,
    clearHead: false,
  },
  // Нова графіка: папір, чорнильна рамка `LINE.inner` і тінь `shade` (`art/STYLE.md`, «ui»), нуль — червоний сенсу «ні»
  // (`red`, а не `redLo`: «…Lo» — лінії матеріалу, на папері вони майже як чорнило). Над баблом стану — на місце бабла
  // нового вигляду (`BUBBLE_ROOM`, T3).
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
    bubbleLift: BUBBLE_ROOM,
    clearHead: true,
  },
};

/** Проміжок між тінню плашки й маківкою персонажа (точкою його бабла), одиниці світу. */
const HEAD_GAP = 2;

/** Плашка над точкою (x, y) — низ посередині: ширина й висота без тіні. */
export interface StoragePlate {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Де низ плашки, щоб вона не закривала голову персонажа (`head` — точка над його головою, як для баблів): коли плашка й
 * персонаж (від маківки до ніг) перекриваються на екрані, плашка разом із тінню стає над його головою; інакше — де була.
 * Старий вигляд не піднімається.
 */
export function clearOfHead(look: StorageLook, plate: StoragePlate, head: Point | null): number {
  if (!look.clearHead || !head) return plate.y;
  const top = plate.y - plate.height;
  const bottom = plate.y + look.drop;
  const across = Math.abs(plate.x - head.x) < plate.width / 2 + PERSON_FIGURE.half;
  const along = top < head.y + ANCHOR_GAP + PERSON_FIGURE.height && bottom > head.y;
  return across && along ? Math.min(plate.y, head.y - look.drop - HEAD_GAP) : plate.y;
}

interface Indicator {
  container: Phaser.GameObjects.Container;
  key: string;
  width: number;
  height: number;
}

export class StorageIndicators {
  private readonly shown = new Map<string, Indicator>();

  /**
   * `head` — де зараз точка над головою персонажа (`World.person.head`): плашки нового вигляду її обходять (`clearOfHead`).
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    readonly look: StorageLook = STORAGE_LOOKS.oblique,
    private readonly head: () => Point | null = () => null,
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
      current.container.setPosition(x, this.lift(x, y, current));
      return;
    }
    current?.container.destroy();
    const size = this.size(lines);
    this.shown.set(id, { container: this.make(lines, x, this.lift(x, y, size), size), key, ...size });
  }

  /** Розмір плашки для цих рядків, без тіні. */
  private size(lines: readonly StorageLine[]): { width: number; height: number } {
    const look = this.look;
    const chip = lines.some((l) => l.limit !== undefined) ? look.wideChip : look.chip;
    return { width: lines.length * chip + look.pad, height: look.icon + look.pad * 2 };
  }

  /** Низ плашки: у точці (x, y), а в новому вигляді — над головою персонажа, якщо він під нею. */
  private lift(x: number, y: number, size: { width: number; height: number }): number {
    return this.look.clearHead ? clearOfHead(this.look, { x, y, ...size }, this.head()) : y;
  }

  private make(lines: readonly StorageLine[], x: number, y: number, size: { width: number; height: number }): Phaser.GameObjects.Container {
    const look = this.look;
    const chip = lines.some((l) => l.limit !== undefined) ? look.wideChip : look.chip;
    const { width, height } = size;
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
