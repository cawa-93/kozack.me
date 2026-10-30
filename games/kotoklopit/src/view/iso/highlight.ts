// Підсвітка цілі дії в ізометричному світі (§8.2, крок 16): сяйво (Glow, фільтр Phaser 4) довкола малюнка цілі — лише на
// одній цілі за раз. Фільтри Phaser 4 є лише у WebGL; у режимі Canvas (`Phaser.AUTO` без WebGL) — запасний варіант: контур
// сліду цілі на підлозі й на її висоті (каркас), як рамка старого вигляду.
//
// Як ходить: частина в `update` починає кадр (`begin`), позначки кличуть `highlight` частини, а та — `request`; у своєму
// `lateUpdate` частина кличе `apply`: сяйво переходить на нову ціль, зі старої знімається. Ціль, якої цього кадру не
// просили, гасне сама — окремого «зняти підсвітку» частинам світу не кажуть.

import Phaser from "phaser";

import { COLORS } from "../colors";
import { WORLD_LAYERS } from "../world/layers";
import type { IsoFootprint } from "../world/objects";
import { footprintCorners } from "./geometry";

/** Сила сяйва: від слабкого до сильного за пульсом позначок (`alpha` 0–1). */
const GLOW_MIN = 2;
const GLOW_PULSE = 4;
/** Скільки вибірок і на яку відстань (px текстури): досить для чіткого обрису, не дорого для однієї цілі. */
const GLOW_QUALITY = 8;
const GLOW_DISTANCE = 10;
/** Контур Canvas: над квартирою, під позначками старого вигляду. */
const OUTLINE_DEPTH = WORLD_LAYERS.marks - 0.5;

/** Що підсвітити цього кадру. */
interface Request {
  image: Phaser.GameObjects.Image;
  footprint: IsoFootprint;
  height: number;
  alpha: number;
}

export class IsoHighlight {
  private wanted: Request | null = null;
  private glowing: { image: Phaser.GameObjects.Image; glow: Phaser.Filters.Glow } | null = null;
  /** Запасний контур (лише без WebGL). */
  private outline: Phaser.GameObjects.Graphics | null = null;
  private readonly webgl: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.webgl = scene.sys.game.renderer.type === Phaser.WEBGL;
  }

  /** Новий кадр: що підсвічували минулого, забуто. */
  begin(): void {
    this.wanted = null;
  }

  /** Підсвітити малюнок `image` цілі зі слідом `footprint` (клітинки) заввишки `height` (одиниці арту). */
  request(image: Phaser.GameObjects.Image, footprint: IsoFootprint, height: number, alpha: number): void {
    this.wanted = { image, footprint, height, alpha };
  }

  /** Кінець кадру: сяйво (чи контур) — лише на тій цілі, яку цього кадру просили. */
  apply(): void {
    const wanted = this.wanted;
    if (this.webgl) this.glow(wanted);
    else this.drawOutline(wanted);
  }

  private glow(wanted: Request | null): void {
    const current = this.glowing;
    if (current && (current.image !== wanted?.image || !current.image.active)) {
      // Зображення, яке знищили разом із фільтрами, вже без сяйва.
      if (current.image.active) current.image.filters?.internal.remove(current.glow);
      this.glowing = null;
    }
    if (!wanted || !wanted.image.visible) return;
    if (!this.glowing) {
      const image = wanted.image;
      if (!image.filters) image.enableFilters();
      const filters = image.filters;
      if (!filters) return;
      this.glowing = { image, glow: filters.internal.addGlow(COLORS.highlight, GLOW_MIN, 0, 1, false, GLOW_QUALITY, GLOW_DISTANCE) };
    }
    this.glowing.glow.outerStrength = GLOW_MIN + GLOW_PULSE * wanted.alpha;
  }

  private drawOutline(wanted: Request | null): void {
    const g = (this.outline ??= this.scene.add.graphics().setDepth(OUTLINE_DEPTH).addToDisplayList(this.layer));
    g.clear();
    if (!wanted || !wanted.image.visible) return;
    const floor = footprintCorners(wanted.footprint).map((p) => new Phaser.Math.Vector2(p.x, p.y));
    const top = floor.map((p) => new Phaser.Math.Vector2(p.x, p.y - wanted.height));
    g.lineStyle(4, COLORS.highlight, wanted.alpha);
    g.strokePoints(floor, true, true);
    g.strokePoints(top, true, true);
    // Видимі ребра: ліве, переднє й праве.
    for (const i of [1, 2, 3]) g.lineBetween(floor[i]!.x, floor[i]!.y, top[i]!.x, top[i]!.y);
  }

  destroy(): void {
    const current = this.glowing;
    if (current?.image.active) current.image.filters?.internal.remove(current.glow);
    this.glowing = null;
    this.outline?.destroy();
    this.outline = null;
  }
}
