// Індикатор вмісту сховища (§6.4): ряд іконок запасів із кількістю над холодильником, шафкою тощо.
// Нуль — червоним.
//
// Паперова плашка в чорнильній рамці з тінню, кольори палітри арту (`art/STYLE.md`; крок 16, T4), у масштабі камери
// ізометрії (≈ 0,72 px CSS на одиницю на телефоні). Плашка не закриває голову персонажа: він стоїть біля сховища щоразу,
// коли її видно (вона лише для сховища в фокусі), а в ізометрії низькі сховища (ящики, пралька, шафка з кормом) нижчі за
// нього.

import type Phaser from "phaser";

import { PALETTE, SHADE } from "../../art/palette";
import type { StorageLine } from "../sim/storage";
import { iconTexture } from "./iconnames";
import { ANCHOR_GAP, PERSON_FIGURE } from "./iso/geometry";
import { BUBBLE_ROOM } from "./iso/markslayout";
import { PRODUCT_ICONS } from "./symbols";
import { withMetrics } from "./textmetrics";
import type { Point } from "./world/part";
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
}

/** Колір палітри арту `#rrggbb` як число для Phaser. */
const hex = (color: string): number => Number.parseInt(color.slice(1), 16);
/** Одиниця світу ізометрії дрібна: стільки одиниць арту на піксель індикатора першої чернетки (іконка 26, шрифт 15). */
const ISO_SCALE = 1.3;

/**
 * Папір, чорнильна рамка `LINE.inner` і тінь `shade` (`art/STYLE.md`, «ui»), нуль — червоний сенсу «ні» (`red`, а не
 * `redLo`: «…Lo» — лінії матеріалу, на папері вони майже як чорнило). Над баблом стану — на місце бабла (`BUBBLE_ROOM`, T3).
 */
export const STORAGE_LOOK: StorageLook = {
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
 */
export function clearOfHead(look: StorageLook, plate: StoragePlate, head: Point | null): number {
  if (!head) return plate.y;
  const top = plate.y - plate.height;
  const bottom = plate.y + look.drop;
  const across = Math.abs(plate.x - head.x) < plate.width / 2 + PERSON_FIGURE.half;
  const along = top < head.y + ANCHOR_GAP + PERSON_FIGURE.height && bottom > head.y;
  return across && along ? Math.min(plate.y, head.y - look.drop - HEAD_GAP) : plate.y;
}

/**
 * Ширина фішки плашки (§6.4): іконка, відступ, текст і поле після нього (`pad`), але не менша за сталу фішку (`chip`, з лімітом —
 * `wideChip`), щоб звичайні плашки лишилися, як були; ширший текст (корм 110/110) розсуває фішку, а не вилазить за плашку.
 */
export function storageChipWidth(look: StorageLook, withLimit: boolean, textWidth: number): number {
  return Math.max(withLimit ? look.wideChip : look.chip, Math.ceil(look.icon + look.gap + textWidth + look.pad));
}

interface Indicator {
  container: Phaser.GameObjects.Container;
  /** Що показано: запаси з кількостями. */
  key: string;
  /** Склад плашки (`plateKey`): той самий — нова кількість лише міняє тексти. */
  plate: string;
  /** Числа в рядках, по одному на рядок. */
  texts: Phaser.GameObjects.Text[];
  width: number;
  height: number;
}

/** Що показують рядки: запаси й кількості. */
const linesKey = (lines: readonly StorageLine[]): string => lines.map((l) => `${l.product}:${l.count}/${l.limit ?? ""}`).join(",");

/**
 * Склад плашки: запаси й ширина кожної фішки, що від нього залежить (`make`) — з лімітом за лімітом, без нього (ящики) — за самим
 * числом. Той самий склад — та сама плашка з рамкою й іконками, інша лише кількість.
 */
const plateKey = (lines: readonly StorageLine[]): string => lines.map((l) => (l.limit === undefined ? `${l.product}#${l.count}` : `${l.product}/${l.limit}`)).join(",");

/** Число в рядку: з лімітом — «кількість/ліміт». */
const lineText = (line: StorageLine): string => (line.limit === undefined ? String(line.count) : `${line.count}/${line.limit}`);

export class StorageIndicators {
  private readonly shown = new Map<string, Indicator>();

  /** Як виглядає індикатор: місце бабла стану над сховищем (`bubbleLift`) бере й сцена. */
  readonly look: StorageLook = STORAGE_LOOK;

  /** `head` — де зараз точка над головою персонажа (`World.person.head`): плашки її обходять (`clearOfHead`). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly head: () => Point | null = () => null,
  ) {}

  /**
   * Показати вміст над сховищем; порожній список ховає індикатор (не знищує: персонаж повернеться — та сама плашка). Викликати
   * щокадру.
   */
  set(id: string, lines: readonly StorageLine[], x: number, y: number): void {
    const current = this.shown.get(id);
    if (lines.length === 0) {
      current?.container.setVisible(false);
      return;
    }
    const key = linesKey(lines);
    if (current && current.key !== key && current.plate === plateKey(lines)) {
      lines.forEach((line, i) => current.texts[i]?.setText(lineText(line)).setColor(line.count === 0 ? this.look.zero : this.look.text));
      current.key = key;
    }
    if (current && current.key === key) {
      current.container.setPosition(x, this.lift(x, y, current)).setVisible(true);
      return;
    }
    current?.container.destroy();
    const made = this.make(lines);
    made.container.setPosition(x, this.lift(x, y, made));
    this.shown.set(id, { ...made, key, plate: plateKey(lines) });
  }

  /** Низ плашки: у точці (x, y) чи над головою персонажа, якщо він під нею. */
  private lift(x: number, y: number, size: { width: number; height: number }): number {
    return clearOfHead(this.look, { x, y, ...size }, this.head());
  }

  /**
   * Плашка в точці (0, 0) — низ посередині; розмір — без тіні. Ширина кожної фішки — за найширшим, що вона може показати
   * («ліміт/ліміт», а без ліміту — саме число): текст не вилазить за плашку (корм 110/110 не вміщався в сталу фішку), а плашка не
   * стрибає, коли кількість міняється.
   */
  private make(lines: readonly StorageLine[]): { container: Phaser.GameObjects.Container; texts: Phaser.GameObjects.Text[]; width: number; height: number } {
    const look = this.look;
    const texts = lines.map((line) => {
      const widest = line.limit === undefined ? String(line.count) : `${line.limit}/${line.limit}`;
      const text = this.scene.add
        .text(0, 0, widest, withMetrics({ fontFamily: FONT, fontSize: `${look.fontSize}px`, fontStyle: "bold", color: line.count === 0 ? look.zero : look.text, resolution: 2 }))
        .setOrigin(0, 0.5);
      const measured = text.width;
      text.setText(lineText(line));
      return { text, measured };
    });
    const chips = lines.map((line, i) => storageChipWidth(look, line.limit !== undefined, texts[i]?.measured ?? 0));
    const width = chips.reduce((sum, w) => sum + w, 0) + look.pad;
    const height = look.icon + look.pad * 2;
    const bg = this.scene.add.graphics();
    if (look.drop > 0) bg.fillStyle(look.dropColor, look.dropAlpha).fillRoundedRect(-width / 2, -height + look.drop, width, height, look.radius);
    bg.fillStyle(look.fill, look.fillAlpha).fillRoundedRect(-width / 2, -height, width, height, look.radius);
    bg.lineStyle(look.line, look.lineColor, look.lineAlpha).strokeRoundedRect(-width / 2, -height, width, height, look.radius);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    let left = -width / 2 + look.pad;
    lines.forEach((line, i) => {
      parts.push(this.scene.add.image(left + look.icon / 2, -height / 2, iconTexture(PRODUCT_ICONS[line.product])).setDisplaySize(look.icon, look.icon));
      const text = texts[i]?.text;
      if (text) parts.push(text.setPosition(left + look.icon + look.gap, -height / 2));
      left += chips[i] ?? 0;
    });
    const container = this.scene.add.container(0, 0, parts).setDepth(DEPTH).addToDisplayList(this.layer);
    return { container, texts: texts.map((t) => t.text), width, height };
  }

  clear(): void {
    for (const indicator of this.shown.values()) indicator.container.destroy();
    this.shown.clear();
  }
}
