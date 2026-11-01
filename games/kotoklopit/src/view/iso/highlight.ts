// Підсвітка цілі дії в ізометричному світі (§8.2, крок 16): сяйво (Glow, фільтр Phaser 4) довкола малюнка цілі — лише на
// одній цілі за раз. Фільтри Phaser 4 є лише у WebGL; у режимі Canvas (`Phaser.AUTO` без WebGL) — запасний варіант: кутик
// сліду цілі на підлозі — два передні ребра (T4), смуга кольору підсвітки в чорнильній облямівці, щоб читалася і на світлій
// підлозі, і на темній. Каркаса на висоті цілі немає: висота — найвища точка (монітор, узголів'я, кран), і коробка на ній
// над усім слідом обводила б порожнечу, а задні ребра сліду йшли б крізь саму річ. Кутик лежить на глибині цілі, як сяйво
// на її малюнку: той, хто стоїть перед ціллю (персонаж за столом), його закриває. Колір — токен `highlight` палітри арту
// (`art/STYLE.md`: лише для інтерфейсу).
//
// Як ходить: частина в `update` починає кадр (`begin`), позначки кличуть `highlight` частини, а та — `request`; у своєму
// `lateUpdate` частина кличе `apply`: сяйво переходить на нову ціль, зі старої знімається. Ціль, якої цього кадру не
// просили, гасне сама — окремого «зняти підсвітку» частинам світу не кажуть.

import Phaser from "phaser";

import { PALETTE } from "../../../art/palette";
import type { IsoFootprint } from "../world/objects";
import { footprintCorners } from "./geometry";

/** Сила сяйва: від слабкого до сильного за пульсом позначок (`alpha` 0–1). */
const GLOW_MIN = 2;
const GLOW_PULSE = 4;
/** Скільки вибірок і на яку відстань (px текстури): досить для чіткого обрису, не дорого для однієї цілі. */
const GLOW_QUALITY = 8;
const GLOW_DISTANCE = 10;
/**
 * Контур Canvas — над малюнком цілі, у її проміжку глибини (`ISO_DEPTH_SLOT` 0,01), нижче за те, що лежить на ній: кутик на
 * підлозі перед ціллю закриває лише те, що стоїть перед нею.
 */
const OUTLINE_ABOVE = 0.0005;
/** Колір сяйва й контуру — токен `highlight` палітри арту; облямівка контуру — `ink`. */
const HIGHLIGHT = Number.parseInt(PALETTE.highlight.slice(1), 16);
const INK = Number.parseInt(PALETTE.ink.slice(1), 16);
/** Контур Canvas: смуга підсвітки й чорнильна облямівка під нею (одиниці арту). */
const OUTLINE = { band: 4, ink: 7 } as const;
/** Передні ребра сліду: лівий, нижній і правий кути (`footprintCorners`). */
const FRONT_CORNERS = [3, 2, 1] as const;

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
      this.glowing = { image, glow: filters.internal.addGlow(HIGHLIGHT, GLOW_MIN, 0, 1, false, GLOW_QUALITY, GLOW_DISTANCE) };
    }
    this.glowing.glow.outerStrength = GLOW_MIN + GLOW_PULSE * wanted.alpha;
  }

  private drawOutline(wanted: Request | null): void {
    const g = (this.outline ??= this.scene.add.graphics().addToDisplayList(this.layer));
    g.clear();
    if (!wanted || !wanted.image.visible) return;
    g.setDepth(wanted.image.depth + OUTLINE_ABOVE);
    const corners = footprintCorners(wanted.footprint);
    const front = FRONT_CORNERS.map((i) => new Phaser.Math.Vector2(corners[i]!.x, corners[i]!.y));
    // Спершу чорнильна облямівка, поверх — смуга підсвітки: пульс міняє яскравість обох.
    for (const [width, color] of [
      [OUTLINE.ink, INK],
      [OUTLINE.band, HIGHLIGHT],
    ] as const) {
      g.lineStyle(width, color, wanted.alpha);
      g.strokePoints(front, false, false);
    }
  }

  destroy(): void {
    const current = this.glowing;
    if (current?.image.active) current.image.filters?.internal.remove(current.glow);
    this.glowing = null;
    this.outline?.destroy();
    this.outline = null;
  }
}
