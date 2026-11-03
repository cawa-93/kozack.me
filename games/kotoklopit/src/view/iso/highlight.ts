// Підсвітка цілі дії в ізометричному світі (§8.2, крок 16): сяйво (Glow, фільтр Phaser 4) довкола малюнка цілі — лише на
// одній цілі за раз. Фільтри Phaser 4 є лише у WebGL; у режимі Canvas (`Phaser.AUTO` без WebGL) — запасний варіант: кутик
// сліду цілі на підлозі — два передні ребра (T4), смуга кольору підсвітки в чорнильній облямівці, щоб читалася і на світлій
// підлозі, і на темній. Каркаса на висоті цілі немає: висота — найвища точка (монітор, узголів'я, кран), і коробка на ній
// над усім слідом обводила б порожнечу, а задні ребра сліду йшли б крізь саму річ. Кутик лежить на глибині цілі, як сяйво
// на її малюнку: той, хто стоїть перед ціллю (персонаж за столом), його закриває. Колір — токен `highlight` палітри арту
// (`art/STYLE.md`: лише для інтерфейсу). Сяйво й кутик — під картою світла доби, тож у темряві вони сильніші й світліші
// (`HIGHLIGHT_DARK`, за яскравістю карти на цілі — `WorldQuery.lightLevel`): інакше множення гасить їх до ледь помітної лінії.
//
// Як ходить: частина в `update` починає кадр (`begin`), позначки кличуть `highlight` частини, а та — `request`; у своєму
// `lateUpdate` частина кличе `apply`: сяйво переходить на нову ціль, зі старої знімається. Ціль, якої цього кадру не
// просили, гасне сама — окремого «зняти підсвітку» частинам світу не кажуть.

import Phaser from "phaser";

import { PALETTE } from "../../../art/palette";
import { highlightBoost, whitened, type HighlightBoost } from "../light/lightmap";
import type { IsoFootprint } from "../world/objects";
import type { Point, WorldQuery } from "../world/part";
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
  /** Середина малюнка цілі цього кадру (`boost`): одна точка на всі кадри. */
  private readonly center: Point = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    /** Світ: яскравість карти світла на цілі (`lightLevel`). */
    private readonly world: Pick<WorldQuery, "lightLevel">,
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
    const boost = this.boost(wanted.image);
    const glow = this.glowing.glow;
    glow.outerStrength = (GLOW_MIN + GLOW_PULSE * wanted.alpha) * boost.strength;
    const color = whitened(HIGHLIGHT, boost.whiten);
    if (glow.color !== color) glow.color = color;
  }

  /** Підсилення підсвітки за яскравістю карти світла посередині малюнка цілі (`HIGHLIGHT_DARK`). */
  private boost(image: Phaser.GameObjects.Image): HighlightBoost {
    const c = this.center;
    c.x = image.x + (0.5 - image.originX) * image.displayWidth;
    c.y = image.y + (0.5 - image.originY) * image.displayHeight;
    return highlightBoost(this.world.lightLevel(c));
  }

  private drawOutline(wanted: Request | null): void {
    const g = (this.outline ??= this.scene.add.graphics().addToDisplayList(this.layer));
    g.clear();
    if (!wanted || !wanted.image.visible) return;
    g.setDepth(wanted.image.depth + OUTLINE_ABOVE);
    const corners = footprintCorners(wanted.footprint);
    const front = FRONT_CORNERS.map((i) => new Phaser.Math.Vector2(corners[i]!.x, corners[i]!.y));
    // Спершу чорнильна облямівка, поверх — смуга підсвітки: пульс міняє яскравість обох. У темряві смуга світліша (`boost`).
    for (const [width, color] of [
      [OUTLINE.ink, INK],
      [OUTLINE.band, whitened(HIGHLIGHT, this.boost(wanted.image).whiten)],
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
