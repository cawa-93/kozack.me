// Підсвітка цілі дії в ізометричному світі (§8.2, крок 16): сяйво довкола малюнка цілі — лише на одній цілі за раз. Ореол
// кадру речі пораховано під час збирання атласу (карта сяйва, `art/glowmap.ts`), тож тут він — звичайні зображення під
// річчю, без фільтра: пульс і підсилення в темряві — кількістю й прозорістю шарів карти (`glowLayerAlpha`), колір — тоном.
// Річ, накладаючись на карту, сама лишає від неї лише ореол довкола силуету (і трохи — крізь напівпрозоре, як скло душу).
// Без WebGL чи без карти кадру (атласу немає, кадр — заглушка) — запасний варіант: кутик
// сліду цілі на підлозі — два передні ребра (T4), смуга кольору підсвітки в чорнильній облямівці, щоб читалася і на світлій
// підлозі, і на темній. Каркаса на висоті цілі немає: висота — найвища точка (монітор, узголів'я, кран), і коробка на ній
// над усім слідом обводила б порожнечу, а задні ребра сліду йшли б крізь саму річ. Сяйво й кутик лежать на глибині цілі:
// той, хто стоїть перед ціллю (персонаж за столом), їх закриває. Колір — токен `highlight` палітри арту
// (`art/STYLE.md`: лише для інтерфейсу). Сяйво й кутик — під картою світла доби, тож у темряві вони сильніші й світліші
// (`HIGHLIGHT_DARK`, за яскравістю карти на цілі — `WorldQuery.lightLevel`): інакше множення гасить їх до ледь помітної лінії.
//
// Як ходить: частина в `update` починає кадр (`begin`), позначки кличуть `highlight` частини, а та — `request`; у своєму
// `lateUpdate` частина кличе `apply`: сяйво переходить на нову ціль, зі старої знімається. Ціль, якої цього кадру не
// просили, гасне сама — окремого «зняти підсвітку» частинам світу не кажуть.

import Phaser from "phaser";

import { PALETTE } from "../../../art/palette";
import { loadedArtIndex } from "../art/atlasload";
import { GLOW_LAYERS, GLOW_MAP, TARGET_GLOW, glowFrameName, glowLayerAlpha, glowPlacement } from "../art/glowmap";
import { ART_TEXTURE } from "../art/types";
import { highlightBoost, whitened, type HighlightBoost } from "../light/lightmap";
import type { IsoFootprint } from "../world/objects";
import type { Point, WorldQuery } from "../world/part";
import { footprintCorners } from "./geometry";

/**
 * Шари сяйва — одразу під малюнком цілі: нижче за нього, але вище за все, що за ціллю (сусідній елемент реєстру глибини
 * закінчується щонайменше за `ISO_DEPTH_SLOT` до неї).
 */
const GLOW_UNDER = 0.0001;
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

/** Карта сяйва кадру: назва її кадру в текстурі атласу й те, як вона лягає на зображення речі (`glowPlacement`). */
interface GlowLook {
  name: string;
  originX: number;
  originY: number;
  scale: number;
}

export class IsoHighlight {
  private wanted: Request | null = null;
  /** Шари карти сяйва: створюються, коли вперше потрібні, і живуть до кінця сцени. */
  private readonly layers: Phaser.GameObjects.Image[] = [];
  /** Карта кадру, який ціль показувала востаннє (null — карти немає): шукаємо її лише тоді, коли кадр змінився. */
  private look: { frame: Phaser.Textures.Frame; originX: number; originY: number; glow: GlowLook | null } | null = null;
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

  /** Кінець кадру: сяйво (чи контур) — лише на тій цілі, яку цього кадру просили, і лише поки її видно. */
  apply(): void {
    const wanted = this.wanted && this.wanted.image.visible ? this.wanted : null;
    const glow = wanted && this.webgl ? this.glowOf(wanted.image) : null;
    this.drawGlow(wanted, glow);
    const outlined = glow ? null : wanted;
    if (outlined || this.outline) this.drawOutline(outlined);
  }

  /** Карта сяйва кадру, який зараз показує `image`; null — її немає (кадр не з атласу, заглушка, старий `index.json`). */
  private glowOf(image: Phaser.GameObjects.Image): GlowLook | null {
    const frame = image.frame;
    const look = this.look;
    if (look && look.frame === frame && look.originX === image.originX && look.originY === image.originY) return look.glow;
    this.look = { frame, originX: image.originX, originY: image.originY, glow: this.findGlow(image) };
    return this.look.glow;
  }

  private findGlow(image: Phaser.GameObjects.Image): GlowLook | null {
    const frame = image.frame;
    if (frame.texture.key !== ART_TEXTURE) return null;
    const index = loadedArtIndex(this.scene);
    const rect = index && Object.hasOwn(index.frames, frame.name) ? index.frames[frame.name as keyof typeof index.frames]?.glow : undefined;
    if (!rect) return null;
    const name = glowFrameName(frame.name);
    // Кадр карти додаємо в текстуру атласу при першій підсвітці: карти потрібні лише тут.
    if (!frame.texture.has(name) && !frame.texture.add(name, rect.page, rect.x, rect.y, rect.w, rect.h)) return null;
    return { name, ...glowPlacement(rect, { w: frame.realWidth, h: frame.realHeight }, { x: image.originX, y: image.originY }) };
  }

  /** Шари карти під ціллю: скільки й наскільки прозорі — за силою сяйва (пульс × підсилення в темряві), тон — за темрявою. */
  private drawGlow(wanted: Request | null, glow: GlowLook | null): void {
    if (!wanted || !glow) {
      for (const layer of this.layers) if (layer.visible) layer.setVisible(false);
      return;
    }
    const image = wanted.image;
    const boost = this.boost(image);
    const strength = ((TARGET_GLOW.min + TARGET_GLOW.pulse * wanted.alpha) * boost.strength) / GLOW_MAP.gain;
    const color = whitened(HIGHLIGHT, boost.whiten);
    const depth = image.depth - GLOW_UNDER;
    for (let k = 0; k < GLOW_LAYERS; k++) {
      const alpha = glowLayerAlpha(strength, k) * image.alpha;
      let layer = this.layers[k];
      if (alpha <= 0) {
        if (layer?.visible) layer.setVisible(false);
        continue;
      }
      if (!layer) {
        layer = new Phaser.GameObjects.Image(this.scene, 0, 0, ART_TEXTURE, glow.name);
        this.layer.add(layer);
        this.layers[k] = layer;
      }
      if (layer.frame.name !== glow.name) layer.setFrame(glow.name);
      layer.setOrigin(glow.originX, glow.originY);
      layer.setScale(image.scaleX * glow.scale, image.scaleY * glow.scale);
      layer.setPosition(image.x, image.y);
      layer.setAlpha(alpha);
      if (layer.tintTopLeft !== color) layer.setTint(color);
      // Глибину ставимо лише нову: кожне присвоєння змушує шар світу сортуватися заново.
      if (layer.depth !== depth) layer.setDepth(depth);
      if (!layer.visible) layer.setVisible(true);
    }
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
    if (!wanted) return;
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
    for (const layer of this.layers) layer.destroy();
    this.layers.length = 0;
    this.look = null;
    this.outline?.destroy();
    this.outline = null;
  }
}
