// Світло доби в квартирі (§8.9 «День і ніч», рішення автора 2026-11-02) — шоста частина світу: оновлюється останньою, коли
// глибини всього іншого вже відомі. Що й де — чисті модулі `light/*` (`lightmap.ts`, `sources.ts`, `sunstrips.ts`), тут —
// лише малювання:
//
// - карта світла — зображення з полотна (`CanvasTexture`) у координатах світу, 0,5 px на одиницю арту, множенням над усією
//   квартирою, меблями, котами й персонажем (`WORLD_LAYERS.light`, під позначками, баблами й панеллю): тон доби, світлі плями
//   ламп, бра, свічок і техніки й трохи світліші смуги сонця. Скла в ній немає: над склом, як і над котом на підвіконні перед
//   ним, — тон. Перемальовується лише за новим ключем (`lightmapKey`) і не частіше ніж `LIGHTMAP.minRedrawMs`;
// - скло вікон (лише видиме скло стулок, `paneGlass`) — просто над вікнами (`BACKDROP.window`), під усім, що стоїть: множенням
//   темніє, де скло темніше за тон, і додаванням світлішає, де тепле скло світліше за тон (`glassLayers`), — а кіт перед ним
//   ні;
// - смуги сонця — додаванням на підлозі (`BACKDROP.sun`), під стінами й меблями;
// - конуси від невидимих стельових світильників — додаванням, точки реєстру глибини під світильником: ближчі меблі, стіни, коти
//   й персонаж їх закривають;
// - сяйво бра, свічок на поличках і бойлера — на стіні (`BACKDROP.glow`), настільної лампи, газу, екрана й дисплея станції — у
//   проміжку глибини свого господаря (станції — над її точкою реєстру).
//
// Удень (`daylight` → null) і коли світло доби вимкнене (`WorldFrame.lightMinute` = null, режим розробки `?light=off`) усе
// сховано, а до першої ночі нічого й не створено: удень квартира до пікселя така, як без світла доби. Режими змішування
// MULTIPLY і ADD однаково працюють у WebGL і в запасному Canvas (`multiply`, `lighter`); tint, фільтри й Lights — ні, тож
// колір світла запечено в текстури (`lighttex.ts`).

import Phaser from "phaser";

import { powerOut } from "../../sim/modifiers";
import type { GameState } from "../../sim/types";
import { artEntry } from "../art/manifest";
import { CEILING_HEIGHT, CEILING_LAMPS, PANES, type Pane } from "../decor";
import { daylight, type Daylight } from "../light/daylight";
import {
  apartmentOutline,
  CELL_RX,
  cssColor,
  glassLayers,
  glassOf,
  lightAt,
  lightmapKey,
  lightmapPlan,
  paneGlass,
  POOL_FALLOFF,
  sourceLevel,
  stripsOf,
  sunColor,
  sunKey,
  toneOf,
  type LightmapPlan,
  type PoolPaint,
} from "../light/lightmap";
import { BOILER_LIGHT, CANDLE_LIGHT, CONE, DESK_LAMP_LIGHT, GAS_LIGHT, LIGHTMAP, luma, SCONCE_LIGHT, SCREEN_LIGHT, STATION_LIGHT, SUN, toHex } from "../light/lightlook";
import { CONE_BASE, softTexture } from "../light/lighttex";
import { lightSources, type LightKind, type LightSource } from "../light/sources";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { LightPart, Point, WorldFrame } from "../world/part";
import { ISO } from "../world/projection";
import { BACKDROP } from "./apartment";
import { isoDepth, type IsoDepth, type IsoPointHandle } from "./depth";

/** Скло — одразу над вікнами, під павутиною й усім, що стоїть у кімнаті: спершу множник, над ним — додаток. */
const GLASS_DEPTH = BACKDROP.window + 0.25;
const GLASS_ADD_DEPTH = GLASS_DEPTH + 0.05;

/** Полотно поза екраном для розмитих смуг (тінь фігури лягає на полотно, сама фігура — ні), px полотна. */
const SHADOW_SHIFT = 4096;

/** Сяйво джерела: кольори й розміри частин (сяйво й, у свічки, яскраве ядро), де воно — на стіні чи над господарем. */
interface GlowLook {
  readonly parts: readonly { readonly color: number; readonly radius: number; readonly alpha: number }[];
  /** На стіні — під усім, що стоїть (`BACKDROP.glow`); інакше — у проміжку глибини господаря. */
  readonly wall: boolean;
  /** Видно лише в темряві: сяйво дрібної техніки вдень-присмерку не світиться. */
  readonly needsDark: boolean;
}

const GLOWS: Record<Exclude<LightKind, "ceiling">, GlowLook> = {
  sconce: { parts: [{ color: SCONCE_LIGHT.color, ...SCONCE_LIGHT.glow }], wall: true, needsDark: false },
  // Настільна лампа — над столом (у його проміжку глибини): кіт на столі й персонаж за ним — над сяйвом.
  lamp: { parts: [{ color: DESK_LAMP_LIGHT.color, ...DESK_LAMP_LIGHT.glow }], wall: false, needsDark: false },
  boiler: { parts: [{ color: BOILER_LIGHT.color, ...BOILER_LIGHT.glow }], wall: true, needsDark: true },
  // Станція стоїть на підлозі (точка реєстру, не тло): сяйво дисплея — над її кадром (`POWER_STATION_POINT`), а не під нею.
  station: { parts: [{ color: STATION_LIGHT.color, ...STATION_LIGHT.glow }], wall: false, needsDark: true },
  // Свічки — на настінних поличках (рішення автора 2026-11-03): сяйво на стіні, під усім, що стоїть у кімнаті.
  candle: {
    parts: [
      { color: CANDLE_LIGHT.glowColor, ...CANDLE_LIGHT.glow },
      { color: CANDLE_LIGHT.coreColor, ...CANDLE_LIGHT.core },
    ],
    wall: true,
    needsDark: false,
  },
  gas: { parts: [{ color: GAS_LIGHT.glowColor, ...GAS_LIGHT.glow }], wall: false, needsDark: true },
  screen: { parts: [{ color: SCREEN_LIGHT.color, ...SCREEN_LIGHT.glow }], wall: false, needsDark: true },
};

/** Наскільки видно сяйво дрібної техніки за темряви `dark`. */
function darkVisibility(dark: number): number {
  const t = Math.min(1, Math.max(0, (dark - 0.15) / 0.55));
  return t * t * (3 - 2 * t);
}

interface Glow {
  readonly look: GlowLook;
  readonly images: Phaser.GameObjects.Image[];
  readonly point: IsoPointHandle | null;
}

interface Cone {
  readonly id: string;
  readonly image: Phaser.GameObjects.Image;
  readonly point: IsoPointHandle;
}

/** Що створено з першою ніччю. */
interface Parts {
  readonly map: Phaser.Textures.CanvasTexture;
  readonly mapImage: Phaser.GameObjects.Image;
  readonly sun: Phaser.Textures.CanvasTexture;
  readonly sunImage: Phaser.GameObjects.Image;
  readonly glass: Phaser.GameObjects.Graphics;
  readonly glassAdd: Phaser.GameObjects.Graphics;
  readonly cones: readonly Cone[];
}

let instances = 0;

export class IsoLightView implements LightPart {
  private readonly depth: IsoDepth;
  /** Вікна, чий малюнок є в маніфесті: кухонне з'являється разом зі своїм артом (до того — ні скла, ні смуги на голій стіні). */
  private readonly panes: readonly Pane[];
  /** Видиме скло цих вікон на екрані (`paneGlass`): тонується лише воно, не рама, укоси й фіранки. */
  private readonly glassPolys: readonly Point[][];
  private readonly outline: readonly Point[];
  private readonly keys: { map: string; sun: string };
  private parts: Parts | null = null;
  private readonly glows = new Map<string, Glow>();
  private readonly used = new Set<string>();
  private shown = false;
  private mapKey = "";
  private mapAt = Number.NEGATIVE_INFINITY;
  /**
   * План карти, намальованої останньою (null — ще не малювали): з нього — яскравість світла в точці, поки карту видно
   * (`lightLevel`).
   */
  private painted: LightmapPlan | null = null;
  private sunKeyShown = "";
  private glassKey = "";

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.panes = PANES.filter((pane) => artEntry(`env/window/${pane.room}`) !== undefined);
    this.glassPolys = this.panes.flatMap((pane) => paneGlass(pane));
    this.outline = apartmentOutline();
    const n = instances++;
    this.keys = { map: `light/map/${n}`, sun: `light/sun/${n}` };
  }

  update(state: GameState, frame: WorldFrame): void {
    const d = frame.lightMinute === null ? null : daylight(frame.lightMinute, !powerOut(state));
    if (!d) {
      this.hide();
      return;
    }
    const parts = this.ensure();
    this.shown = true;
    const sources = lightSources(state, d);
    this.drawMap(parts, d, sources, frame.time);
    this.drawGlass(parts, d);
    this.drawSun(parts, d);
    this.drawCones(parts, sources);
    this.drawGlows(d, sources, frame.time);
  }

  lateUpdate(): void {
    this.depth.solve();
  }

  /** Створити все для темного часу: карту світла, смуги сонця, скло й конуси (з першою ніччю, не раніше). */
  private ensure(): Parts {
    if (this.parts) return this.parts;
    const { scene, layer } = this.ctx;
    const world = this.ctx.projection.world;
    const canvas = (key: string): Phaser.Textures.CanvasTexture => {
      const w = Math.ceil(world.width * LIGHTMAP.scale);
      const h = Math.ceil(world.height * LIGHTMAP.scale);
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const texture = scene.textures.createCanvas(key, w, h);
      if (!texture) throw new Error(`Не вдалося створити полотно «${key}»`);
      return texture;
    };
    const image = (key: string, blend: Phaser.BlendModes, depth: number): Phaser.GameObjects.Image => {
      const img = new Phaser.GameObjects.Image(scene, 0, 0, key).setOrigin(0, 0).setScale(1 / LIGHTMAP.scale).setBlendMode(blend).setDepth(depth).setVisible(false);
      layer.add(img);
      return img;
    };
    const map = canvas(this.keys.map);
    const sun = canvas(this.keys.sun);
    const glassLayer = (blend: Phaser.BlendModes, depth: number): Phaser.GameObjects.Graphics =>
      scene.add.graphics().addToDisplayList(layer).setBlendMode(blend).setDepth(depth).setVisible(false);
    const glass = glassLayer(Phaser.BlendModes.MULTIPLY, GLASS_DEPTH);
    const glassAdd = glassLayer(Phaser.BlendModes.ADD, GLASS_ADD_DEPTH);
    const coneKey = softTexture(scene, "cone", CONE.color);
    const cones = CEILING_LAMPS.map((lamp, i): Cone => {
      const img = new Phaser.GameObjects.Image(scene, 0, 0, coneKey).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const apex = ISO.toScreen(lamp.at);
      const half = lamp.radius * CONE.spread * CELL_RX;
      img.setPosition(apex.x, apex.y - CEILING_HEIGHT).setDisplaySize(half * 2, CEILING_HEIGHT / CONE_BASE);
      layer.add(img);
      return { id: `ceiling:${i}`, image: img, point: this.depth.addPoint((depth) => img.setDepth(depth), { half: CONE.half }) };
    });
    this.parts = {
      map,
      mapImage: image(this.keys.map, Phaser.BlendModes.MULTIPLY, WORLD_LAYERS.light),
      sun,
      sunImage: image(this.keys.sun, Phaser.BlendModes.ADD, BACKDROP.sun),
      glass,
      glassAdd,
      cones,
    };
    return this.parts;
  }

  /** Карта світла: перемалювати за новим ключем, але не частіше ніж `LIGHTMAP.minRedrawMs` (поки видно стару). */
  private drawMap(parts: Parts, d: Daylight, sources: readonly LightSource[], time: number): void {
    const key = lightmapKey(d, sources, time);
    const visible = parts.mapImage.visible;
    if (key !== this.mapKey && (!visible || time - this.mapAt >= LIGHTMAP.minRedrawMs)) {
      this.mapKey = key;
      this.mapAt = time;
      this.painted = lightmapPlan(d, sources, this.panes, time);
      this.paintMap(parts.map, this.painted);
    }
    parts.mapImage.setVisible(true);
  }

  private paintMap(texture: Phaser.Textures.CanvasTexture, plan: LightmapPlan): void {
    const ctx = texture.context;
    const s = LIGHTMAP.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, texture.width, texture.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    trace(ctx, this.outline);
    ctx.clip();
    ctx.fillStyle = cssColor(plan.tone);
    ctx.fill();
    // Плями й смуги — найсвітліше з того, що вже є, і нового (`lighten`): перекриті плями не дають гарячих місць.
    ctx.globalCompositeOperation = "lighten";
    for (const pool of plan.pools) paintPool(ctx, pool);
    for (const strip of plan.strips) {
      softFill(ctx, strip.points, "#ffffff", cssColor(strip.color, strip.alpha), SUN.blur * s, s);
    }
    ctx.restore();
    texture.refresh();
  }

  /** Скло вікон просто над вікнами: множник, де скло темніше за тон, і додаток, де тепле скло світліше (`glassLayers`). */
  private drawGlass(parts: Parts, d: Daylight): void {
    const layers = glassLayers(toneOf(d), glassOf(d));
    const mul = toHex(layers.mul);
    const add = toHex(layers.add);
    const key = `${mul}|${add}`;
    if (key !== this.glassKey) {
      this.glassKey = key;
      this.fillGlass(parts.glass, mul);
      this.fillGlass(parts.glassAdd, add);
    }
    const any = this.panes.length > 0;
    parts.glass.setVisible(any && mul !== 0xffffff);
    parts.glassAdd.setVisible(any && add !== 0);
  }

  /** Залити видиме скло всіх вікон кольором `color`. */
  private fillGlass(g: Phaser.GameObjects.Graphics, color: number): void {
    g.clear();
    g.fillStyle(color, 1);
    for (const poly of this.glassPolys) {
      g.beginPath();
      poly.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillPath();
    }
  }

  /** Смуги сонця на підлозі: градієнт від вікна вглиб кімнати, м'які краї. */
  private drawSun(parts: Parts, d: Daylight): void {
    const key = sunKey(d);
    if (key === "-") {
      parts.sunImage.setVisible(false);
      return;
    }
    if (key !== this.sunKeyShown) {
      this.sunKeyShown = key;
      const texture = parts.sun;
      const ctx = texture.context;
      const s = LIGHTMAP.scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, texture.width, texture.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      for (const strip of stripsOf(d, this.panes, sunColor(d), SUN.add)) {
        const shift = SHADOW_SHIFT / s;
        const gradient = ctx.createLinearGradient(strip.near.x - shift, strip.near.y, strip.far.x - shift, strip.far.y);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${strip.alpha})`);
        gradient.addColorStop(0.55, `rgba(255, 255, 255, ${strip.alpha * 0.85})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${strip.alpha * 0.5})`);
        softFill(ctx, strip.points, gradient, cssColor(strip.color), SUN.blur * s, s);
      }
      texture.refresh();
    }
    parts.sunImage.setVisible(true);
  }

  /** Конуси невидимих стельових світильників: прозорість — за лампою кімнати, глибина — точка під світильником. */
  private drawCones(parts: Parts, sources: readonly LightSource[]): void {
    for (const cone of parts.cones) {
      const source = sources.find((s) => s.id === cone.id);
      if (!source) {
        cone.image.setVisible(false);
        cone.point.hide();
        continue;
      }
      cone.image.setAlpha(CONE.alpha * source.strength).setVisible(true);
      cone.point.place(source.at.x, source.at.y);
    }
  }

  /** Сяйво бра, бойлера, станції, свічок, газу й екрана (свічки мерехтять щокадру). */
  private drawGlows(d: Daylight, sources: readonly LightSource[], time: number): void {
    const used = this.used;
    used.clear();
    for (const source of sources) {
      if (source.kind === "ceiling") continue;
      const glow = this.glow(source);
      const level = sourceLevel(source, time) * (glow.look.needsDark ? darkVisibility(d.dark) : 1);
      glow.look.parts.forEach((part, i) => {
        glow.images[i]?.setPosition(source.screen.x, source.screen.y).setAlpha(part.alpha * level).setVisible(level > 0);
      });
      if (glow.point && source.host) glow.point.placeAbove(source.host);
      used.add(source.id);
    }
    for (const [id, glow] of this.glows) {
      if (used.has(id)) continue;
      for (const image of glow.images) image.setVisible(false);
      glow.point?.hide();
    }
  }

  /** Сяйво джерела: створюється з першою появою джерела. */
  private glow(source: LightSource): Glow {
    const existing = this.glows.get(source.id);
    if (existing) return existing;
    const { scene, layer } = this.ctx;
    const look = GLOWS[source.kind as Exclude<LightKind, "ceiling">];
    const images = look.parts.map((part) => {
      const img = new Phaser.GameObjects.Image(scene, 0, 0, softTexture(scene, "glow", part.color)).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      img.setDisplaySize(part.radius * 2, part.radius * 2);
      if (look.wall) img.setDepth(BACKDROP.glow);
      layer.add(img);
      return img;
    });
    const point = look.wall
      ? null
      : this.depth.addPoint((depth) => images.forEach((img, i) => img.setDepth(depth + i * 0.0001)));
    const glow = { look, images, point };
    this.glows.set(source.id, glow);
    return glow;
  }

  /** День чи світло доби вимкнене: сховати все (раз), нічого не перемальовувати. */
  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    const parts = this.parts;
    if (parts) {
      parts.mapImage.setVisible(false);
      parts.sunImage.setVisible(false);
      parts.glass.setVisible(false);
      parts.glassAdd.setVisible(false);
      for (const cone of parts.cones) {
        cone.image.setVisible(false);
        cone.point.hide();
      }
    }
    for (const glow of this.glows.values()) {
      for (const image of glow.images) image.setVisible(false);
      glow.point?.hide();
    }
  }

  reset(): void {
    this.painted = null;
    this.mapKey = "";
    this.mapAt = Number.NEGATIVE_INFINITY;
    this.sunKeyShown = "";
    this.glassKey = "";
  }

  destroy(): void {
    const parts = this.parts;
    if (parts) {
      parts.mapImage.destroy();
      parts.sunImage.destroy();
      parts.glass.destroy();
      parts.glassAdd.destroy();
      for (const cone of parts.cones) {
        cone.point.remove();
        cone.image.destroy();
      }
      const textures = this.ctx.scene.textures;
      for (const key of [this.keys.map, this.keys.sun]) if (textures.exists(key)) textures.remove(key);
    }
    for (const glow of this.glows.values()) {
      glow.point?.remove();
      for (const image of glow.images) image.destroy();
    }
    this.glows.clear();
    this.parts = null;
  }

  anchor(): Point | null {
    return null;
  }

  highlight(): boolean {
    return false;
  }

  /** Яскравість карти світла в точці `p` (px світу): тон і плями, які зараз видно (`lightAt`); карти немає — 1. */
  lightLevel(p: Point): number {
    const plan = this.painted;
    return plan && this.parts?.mapImage.visible ? luma(lightAt(plan, p)) : 1;
  }
}

/** Шлях многокутника (без заливки). */
function trace(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** М'яка пляма: еліпс із радіальним градієнтом — повне світло до `core`, далі рівно спадає до нуля. */
function paintPool(ctx: CanvasRenderingContext2D, pool: PoolPaint): void {
  const { x, y, rx, ry, core, color, alpha } = pool;
  if (rx <= 0 || ry <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  const tail = 1 - core;
  gradient.addColorStop(0, cssColor(color, alpha));
  // Спад від ядра до краю — той самий, за яким `lightAt` рахує яскравість у точці (`POOL_FALLOFF`).
  for (const [at, k] of POOL_FALLOFF) gradient.addColorStop(at >= 1 ? 1 : core + tail * at, cssColor(color, alpha * k));
  ctx.fillStyle = gradient;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/**
 * Залити многокутник (px світу) з розмитими краями: фігуру зсунуто за край полотна, а на полотно лягає лише її розмита тінь
 * (`shadowBlur`, px полотна) — працює в усіх браузерах, на відміну від `ctx.filter`. Тінь — кольору `color` з прозорістю
 * заливки `fill` (тож градієнт прозорості заливки переходить у тінь).
 */
function softFill(ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string | CanvasGradient, color: string, blur: number, scale: number): void {
  const shift = SHADOW_SHIFT / scale;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = SHADOW_SHIFT;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = fill;
  trace(
    ctx,
    points.map((p) => ({ x: p.x - shift, y: p.y })),
  );
  ctx.fill();
  ctx.restore();
}
