// Інтерфейс рівня (§8.4): годинник, шкали показників, гроші, стани персонажа й короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.
// У новому вигляді (крок 16, `?gfx=iso`) той самий розклад, але смуга, кружечки показників, рамки шкал, телефон і кнопка
// повного екрана — кадри атласу `ui/hud/*` (A13), іконки — `icon/*`, а кольори й написи — з палітри арту
// (`iso/hudlook.ts`, `iso/uilook.ts`); заливку шкал малює код у рамках арту.

import Phaser from "phaser";

import { addArt, setArt } from "./art/atlas";
import { artEntry } from "./art/manifest";
import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { statCeiling } from "../sim/character";
import { LOW_STAT } from "../sim/config";
import { isDrowsy } from "../sim/sleep";
import { onSickLeave } from "../sim/work";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, StatName } from "../sim/types";
import { fill, ILLNESS_TITLES } from "../texts";
import { COLORS } from "./colors";
import { currentGfx } from "./gfx";
import { iconArt, iconTexture, type IconName } from "./iconnames";
import { StretchArt } from "./iso/hudart";
import { HUD_ART, HUD_BAR, HUD_STATES, STAT_BLINK, STAT_FILL } from "./iso/hudlook";
import { UI_FILL, UI_FONT, UI_TEXT } from "./iso/uilook";
import { scheduleOf } from "./schedule";
import { PRODUCT_ICONS, STAT_ICONS } from "./symbols";
import { BASE_WIDTH, HUD_HEIGHT, type Frame } from "./viewport";
import { UI_LAYERS } from "./world/layers";

const FONT = "system-ui, sans-serif";
const TEXT = "#f3e9dc";
const MUTED = "#c9b9a8";

/** Шкали показників (§6): іконка замість назви (§11.4) — сердечко, тарілка, мило, думка. */
const STATS: readonly { name: StatName; icon: IconName; color: number }[] = [
  { name: "health", icon: STAT_ICONS.health, color: 0xd8574a },
  { name: "satiety", icon: STAT_ICONS.satiety, color: 0xe0893a },
  { name: "hygiene", icon: STAT_ICONS.hygiene, color: 0x5fa8d3 },
  { name: "sanity", icon: STAT_ICONS.sanity, color: 0x9b7fd1 },
];

const ICON_SIZE = 30;
const BAR_X = 34;
const BAR_Y = 20;
const BAR_WIDTH = 116;
const BAR_HEIGHT = 12;
const STATS_X = 238;
const STATS_STEP = 158;
/** Штрихування частини шкали над межею (§6.3): крок і колір смужок. */
const HATCH_STEP = 6;
const HATCH_COLOR = 0x6b5f73;
/** Кнопки праворуч: відстань від правого краю до їхнього центру. */
const BUTTONS_INSET = 44;
/**
 * «Балакучий» бабл телефона (§9.9, правка автора 2026-10-25): ширина тексту, відступи, скільки висить —
 * основа й за кожен символ, найдовше, — і як довго згасає, мс.
 */
const NEWS = { width: 340, pad: 12, baseMs: 2500, perCharMs: 45, maxMs: 8000, fadeMs: 400 } as const;
const DEPTH = UI_LAYERS.hud;
/** Підказка на телефоні (§6.4): кружечок під іконкою запасу — центр від центру телефона, радіус і сторона іконки. */
const HINT = { x: 19, y: 19, r: 15, icon: 22 } as const;

type EventData = Phaser.Types.Input.EventData;

/** Шкала на панелі: прямокутник заливки, px від лівого краю панелі. */
interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Як малювати шкали: доріжка, колір блимання, штрихування понад межею, контур (null — контур дає рамка арту). */
interface BarLook {
  trough: number;
  blink: number;
  hatch: number;
  outline: number | null;
  radius: number;
}

const LEGACY_BAR: BarLook = { trough: 0x1a1520, blink: 0xffffff, hatch: HATCH_COLOR, outline: COLORS.ink, radius: 5 };
const ISO_BAR: BarLook = { trough: UI_FILL.trough, blink: STAT_BLINK, hatch: UI_FILL.hatch, outline: null, radius: HUD_BAR.radius };

/** Шкала показника `i` старого вигляду: 116 × 12 праворуч від іконки. */
const legacyBarRect = (i: number): BarRect => ({ x: STATS_X + i * STATS_STEP + BAR_X, y: BAR_Y, w: BAR_WIDTH, h: BAR_HEIGHT });

/**
 * Шкала `i` нового вигляду: центр рамки `ui/hud/bar` (по центру старої шкали) і заливка в рамці з відступом
 * `HUD_BAR.inset` від її краю.
 */
function isoBar(i: number): { center: { x: number; y: number }; fill: BarRect } {
  const old = legacyBarRect(i);
  const size = artEntry(HUD_ART.bar)?.size ?? { w: old.w + 4, h: old.h + 8 };
  const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 };
  const inset = HUD_BAR.inset;
  const fill = { x: center.x - size.w / 2 + inset, y: center.y - size.h / 2 + inset, w: size.w - 2 * inset, h: size.h - 2 * inset };
  return { center, fill };
}

export class Hud {
  /** Новий вигляд (крок 16): кадри атласу й палітра арту; інакше — старий, як був. */
  private readonly iso: boolean;
  /** Смуга панелі: розтягнути на ширину екрана й висоту панелі з безпечною зоною. */
  private readonly band: (width: number, height: number) => void;
  /** Усе, що ліворуч: дата, годинник, шкали, гроші, розклад. */
  private readonly left: Phaser.GameObjects.Container;
  private readonly date: Phaser.GameObjects.Text;
  private readonly clock: Phaser.GameObjects.Text;
  private readonly bars: Phaser.GameObjects.Graphics;
  /** Де шкали й як їх малювати. */
  private readonly barRects: readonly BarRect[];
  private readonly barLook: BarLook;
  private readonly money: Phaser.GameObjects.Text;
  private readonly effects: Phaser.GameObjects.Text;
  private readonly schedule: Phaser.GameObjects.Text;
  private readonly phone: Phaser.GameObjects.Container;
  /** Кадр телефона нового вигляду (стан `hint`, коли є підказка); у старому — null. */
  private readonly phoneArt: Phaser.GameObjects.Image | null = null;
  /** Підказка на телефоні (§6.4): іконка запасу, що вперше закінчився. */
  private readonly hint: Phaser.GameObjects.Container;
  private readonly hintIcon: Phaser.GameObjects.Image;
  /** Кнопка повного екрана (§10); на iPhone її немає. `show` — намалювати значок: увімкнути чи вийти. */
  private readonly fullscreen: { button: Phaser.GameObjects.Container; show: (active: boolean) => void } | null = null;
  private fullscreenDrawn: boolean | null = null;
  /** «Балакучий» бабл телефона: що стало відомо про кота (§9.9). */
  private readonly news: Phaser.GameObjects.Container;
  private readonly newsBg: Phaser.GameObjects.Graphics;
  private readonly newsTitle: Phaser.GameObjects.Text;
  private readonly newsText: Phaser.GameObjects.Text;
  /** Кольори бабла телефона: тло, контур. */
  private readonly newsLook: { fill: number; line: number };
  /** Коли бабл почне згасати (час сцени, мс); null — бабла немає. */
  private newsUntil: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    onPhone: () => void,
    gfx = currentGfx(),
  ) {
    const iso = gfx === "iso";
    this.iso = iso;
    // Написи нового вигляду — паперовим на темній панелі з чорнильною обвідкою (`iso/uilook.ts`).
    const text = iso
      ? (x: number, y: number, size: number, color: string = UI_TEXT.main) =>
          scene.add.text(x, y, "", { fontFamily: UI_FONT, fontSize: `${size}px`, color, stroke: UI_TEXT.stroke, strokeThickness: size >= 30 ? 4 : 3, resolution: 2 })
      : (x: number, y: number, size: number, color = TEXT) => scene.add.text(x, y, "", { fontFamily: FONT, fontSize: `${size}px`, color, resolution: 2 });
    // Шрифти великі: на телефоні полотно зменшується майже вдвічі.
    if (iso) {
      const band = new StretchArt(scene, layer, HUD_ART.band).setDepth(DEPTH - 1);
      // Полотно смуги вище за панель на чорнильний край під нею.
      const edge = Math.max(0, (artEntry(HUD_ART.band)?.size.h ?? HUD_HEIGHT) - HUD_HEIGHT);
      this.band = (width, height) => band.place(0, 0, width, height + edge);
    } else {
      const band = scene.add
        .rectangle(0, 0, BASE_WIDTH, HUD_HEIGHT, COLORS.background, 0.92)
        .setOrigin(0)
        .setDepth(DEPTH - 1)
        .addToDisplayList(layer);
      this.band = (width, height) => band.setSize(width, height);
    }
    this.date = text(20, 5, 17, iso ? UI_TEXT.muted : MUTED);
    this.clock = text(20, 26, 36).setFontStyle("bold");
    // Іконки намальовані чорнилом для світлого бабла: на темній панелі їм потрібна світла підкладка.
    const labels = STATS.flatMap((stat, i) => {
      const x = STATS_X + i * STATS_STEP + ICON_SIZE / 2;
      const y = BAR_Y + BAR_HEIGHT / 2;
      if (iso) {
        return [
          addArt(scene, null, HUD_ART.stat).setPosition(x, y),
          addArt(scene, null, iconArt(stat.icon)).setPosition(x, y).setDisplaySize(ICON_SIZE - 2, ICON_SIZE - 2),
        ];
      }
      return [
        scene.add.circle(x, y, ICON_SIZE / 2 + 2, COLORS.paper).setStrokeStyle(2, COLORS.ink),
        scene.add.image(x, y, iconTexture(stat.icon)).setDisplaySize(ICON_SIZE - 2, ICON_SIZE - 2),
      ];
    });
    this.bars = scene.add.graphics();
    this.barLook = iso ? ISO_BAR : LEGACY_BAR;
    this.barRects = STATS.map((_, i) => (iso ? isoBar(i).fill : legacyBarRect(i)));
    // Рамки шкал нового вигляду — над заливкою.
    const frames = iso ? STATS.map((_, i) => addArt(scene, null, HUD_ART.bar).setPosition(isoBar(i).center.x, isoBar(i).center.y)) : [];
    this.effects = text(STATS_X, 44, 18, iso ? UI_TEXT.warning : "#e8a33a");
    this.money = text(866, 20, 30).setFontStyle("bold");
    this.schedule = text(990, 4, 18, iso ? UI_TEXT.muted : MUTED);
    this.left = scene.add
      .container(0, 0, [this.date, this.clock, ...labels, this.bars, ...frames, this.effects, this.money, this.schedule])
      .setDepth(DEPTH)
      .addToDisplayList(layer);

    // Телефон персонажа: доставка (§6.4).
    if (iso) {
      this.phoneArt = addArt(scene, null, HUD_ART.phone, { state: HUD_STATES.phone.idle });
      this.hintIcon = addArt(scene, null, iconArt("food")).setPosition(HINT.x, HINT.y).setDisplaySize(HINT.icon, HINT.icon);
      const under = addArt(scene, null, HUD_ART.stat).setPosition(HINT.x, HINT.y).setDisplaySize(HINT.r * 2, HINT.r * 2);
      this.hint = scene.add.container(0, 0, [under, this.hintIcon]).setVisible(false);
      const size = artEntry(HUD_ART.phone)?.size ?? { w: 56, h: 56 };
      this.phone = scene.add.container(0, 0, [this.phoneArt, this.hint]).setSize(size.w, size.h).setDepth(DEPTH).addToDisplayList(layer);
    } else {
      const g = scene.add.graphics();
      g.fillStyle(0x4a3f52).fillCircle(0, 0, 26).lineStyle(2, COLORS.ink).strokeCircle(0, 0, 26);
      g.fillStyle(0x222026).fillRoundedRect(-9, -15, 18, 30, 4);
      g.fillStyle(0x79a6c2).fillRect(-6, -11, 12, 19);
      this.hintIcon = scene.add.image(19, 19, iconTexture("food")).setDisplaySize(22, 22);
      this.hint = scene.add.container(0, 0, [scene.add.circle(19, 19, 15, COLORS.paper).setStrokeStyle(2, COLORS.ink), this.hintIcon]).setVisible(false);
      this.phone = scene.add.container(0, 0, [g, this.hint]).setSize(56, 56).setDepth(DEPTH).addToDisplayList(layer);
    }
    this.phone.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onPhone();
    });

    // Бабл телефона: мовна хмаринка під панеллю, хвостиком до телефона; натиснути — сховати. У новому вигляді — папір і
    // чорнило палітри арту.
    this.newsLook = iso ? { fill: UI_FILL.paper, line: UI_FILL.ink } : { fill: 0xffffff, line: COLORS.ink };
    const newsFont = iso ? UI_FONT : FONT;
    const newsColor = iso ? UI_TEXT.onPaper : "#1f1a24";
    this.newsBg = scene.add.graphics();
    this.newsTitle = scene.add.text(0, 0, "", { fontFamily: newsFont, fontSize: "17px", fontStyle: "bold", color: newsColor, resolution: 2 });
    this.newsText = scene.add.text(0, 0, "", { fontFamily: newsFont, fontSize: "17px", color: newsColor, resolution: 2, wordWrap: { width: NEWS.width } });
    this.news = scene.add.container(0, 0, [this.newsBg, this.newsTitle, this.newsText]).setDepth(DEPTH).setVisible(false).addToDisplayList(layer);
    this.news.on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      this.hideNews();
    });

    if (canFullscreen()) {
      let icon: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
      let show: (active: boolean) => void;
      if (iso) {
        const art = addArt(scene, null, HUD_ART.fullscreen, { state: HUD_STATES.fullscreen.enter });
        show = (active) => setArt(art, HUD_ART.fullscreen, { state: active ? HUD_STATES.fullscreen.exit : HUD_STATES.fullscreen.enter });
        icon = art;
      } else {
        const g = scene.add.graphics();
        show = (active) => drawFullscreenIcon(g, active);
        icon = g;
      }
      const button = scene.add.container(0, 0, [icon]).setSize(48, 48).setDepth(DEPTH).addToDisplayList(layer);
      button
        .setInteractive({ useHandCursor: true })
        // Дотик до кнопки не запускає джойстик; а повний екран браузер вмикає, лише коли палець відпустили.
        .on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => event.stopPropagation())
        .on("pointerup", () => toggleFullscreen());
      this.fullscreen = { button, show };
    }
  }

  /** Розкласти інтерфейс по екрану: ні ліва частина, ні кнопки праворуч не заходять під виріз камери. */
  layout({ width, safe }: Frame): void {
    this.band(width, safe.top + HUD_HEIGHT);
    this.left.setPosition(safe.left, safe.top);
    const x = width - safe.right - BUTTONS_INSET;
    this.phone.setPosition(x, safe.top + HUD_HEIGHT / 2 - 1);
    // Під телефоном, уже над квартирою: у смузі інтерфейсу на екрані 16:9 місця немає.
    this.fullscreen?.button.setPosition(x, safe.top + HUD_HEIGHT + 34);
    // Бабл телефона — правим верхнім кутом під телефоном, лівіше кнопки повного екрана.
    this.news.setPosition(x - 30, safe.top + HUD_HEIGHT + 10);
  }

  /** Чи показує телефон зараз бабл. */
  get saying(): boolean {
    return this.newsUntil !== null;
  }

  /**
   * Телефон «каже» (§9.9, правка автора 2026-10-25): мовна хмаринка під ним із заголовком і текстом. Висить
   * тим довше, чим довший текст; натиснути — сховати.
   */
  say(title: string, text: string, time: number): void {
    this.scene.tweens.killTweensOf(this.news);
    const pad = NEWS.pad;
    this.newsTitle.setText(title);
    this.newsText.setText(text);
    const width = Math.max(this.newsTitle.width, this.newsText.width) + pad * 2;
    const height = this.newsTitle.height + this.newsText.height + pad * 2 + 2;
    // Контейнер стоїть у правому верхньому куті бабла: усе всередині — ліворуч і нижче.
    this.newsTitle.setPosition(-width + pad, pad);
    this.newsText.setPosition(-width + pad, pad + this.newsTitle.height + 2);
    const g = this.newsBg.clear();
    const look = this.newsLook;
    g.fillStyle(look.fill).fillRoundedRect(-width, 0, width, height, 14);
    g.lineStyle(3, look.line).strokeRoundedRect(-width, 0, width, height, 14);
    // Хвостик угору праворуч — до телефона.
    g.fillStyle(look.fill).fillTriangle(-34, 1.5, -12, 1.5, 4, -14);
    g.lineStyle(3, look.line).lineBetween(-34, 0, 4, -14).lineBetween(4, -14, -12, 0);
    this.news.setSize(width * 2, height * 2).setInteractive(new Phaser.Geom.Rectangle(-width, 0, width, height), Phaser.Geom.Rectangle.Contains);
    this.news.setVisible(true).setAlpha(1).setScale(0.85);
    this.scene.tweens.add({ targets: this.news, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.newsUntil = time + Math.min(NEWS.maxMs, NEWS.baseMs + NEWS.perCharMs * (title.length + text.length));
  }

  private hideNews(): void {
    if (this.newsUntil === null) return;
    this.newsUntil = null;
    this.scene.tweens.killTweensOf(this.news);
    this.scene.tweens.add({ targets: this.news, alpha: 0, duration: NEWS.fadeMs, onComplete: () => this.news.setVisible(false) });
  }

  update(state: GameState, time: number): void {
    this.drawFullscreen();
    if (this.newsUntil !== null && time >= this.newsUntil) this.hideNews();
    const { stats, money, sleepSpeed } = state.character;
    this.date.setText(`Тиждень ${weekOf(state.day)} · ${WEEKDAY_NAMES[weekdayOf(state.day)]}`);
    this.clock.setText(formatClock(state.minute));

    const g = this.bars.clear();
    const look = this.barLook;
    STATS.forEach((stat, i) => {
      const bar = this.barRects[i];
      if (!bar) return;
      const value = stats[stat.name];
      const blink = value < LOW_STAT && Math.floor(time / 400) % 2 === 0;
      const color = this.iso ? STAT_FILL[stat.name] : stat.color;
      g.fillStyle(look.trough).fillRoundedRect(bar.x, bar.y, bar.w, bar.h, look.radius);
      g.fillStyle(blink ? look.blink : color).fillRoundedRect(bar.x, bar.y, Math.max(0, (bar.w * value) / 100), bar.h, look.radius);
      // Вище межі показник зараз не росте (брудний одяг, «Пригніченість»): цю частину шкали заштриховано.
      const ceiling = Math.max(value, statCeiling(state, stat.name));
      if (ceiling < 100) hatch(g, bar, bar.x + (bar.w * ceiling) / 100, bar.x + bar.w, look.hatch);
      if (look.outline !== null) g.lineStyle(2, look.outline).strokeRoundedRect(bar.x, bar.y, bar.w, bar.h, look.radius);
    });
    // Гроші — символом гривні (§11.4).
    this.money.setText(`${Math.floor(money)} ₴`);

    const effects: string[] = [];
    if (isDrowsy(state)) effects.push("Сонливість");
    if (sleepSpeed < 0) effects.push("Недосип");
    if (sleepSpeed > 0) effects.push(fill(sleepSpeed >= 0.1 ? "Добре [виспався|виспалася]" : "[Виспався|Виспалася]", state.character.address));
    // Знесилення й голод видно з самих шкал: вони блимають (§11.4), тож слово не повторює їх.
    const job = state.job;
    if (job.unemployed) effects.push("Пошук роботи");
    if (onSickLeave(state)) effects.push("Лікарняний");
    for (const illness of state.character.illnesses) effects.push(ILLNESS_TITLES[illness.id]);
    this.effects.setText(effects.join(" · "));
    // Запас уперше закінчився (§6.4): телефон пульсує з його іконкою, доки його не відкриють.
    const hints = state.home.phoneHints ?? [];
    const product = hints[hints.length - 1];
    this.hint.setVisible(product !== undefined);
    if (this.phoneArt) setArt(this.phoneArt, HUD_ART.phone, { state: product !== undefined ? HUD_STATES.phone.hint : HUD_STATES.phone.idle });
    if (product !== undefined) {
      if (this.iso) setArt(this.hintIcon, iconArt(PRODUCT_ICONS[product]));
      else this.hintIcon.setTexture(iconTexture(PRODUCT_ICONS[product])).setDisplaySize(22, 22);
      this.phone.setScale(1 + 0.1 * (0.5 + 0.5 * Math.sin(time / 160)));
    } else this.phone.setScale(1);
    // Два найважливіші пункти (§8.4): на телефоні третій рядок дрібнішим шрифтом уже не прочитати.
    this.schedule.setText(scheduleOf(state).slice(0, 2).join("\n"));
  }

  /** Значок кнопки повного екрана — лише коли режим змінився. */
  private drawFullscreen(): void {
    if (!this.fullscreen) return;
    const active = isFullscreen();
    if (active === this.fullscreenDrawn) return;
    this.fullscreenDrawn = active;
    this.fullscreen.show(active);
  }
}

/** Старий вигляд: кутики назовні — увімкнути повний екран, усередину — вийти з нього. */
function drawFullscreenIcon(icon: Phaser.GameObjects.Graphics, active: boolean): void {
  const g = icon.clear();
  g.fillStyle(0x4a3f52, 0.85).fillCircle(0, 0, 22).lineStyle(2, COLORS.ink).strokeCircle(0, 0, 22);
  g.lineStyle(3, COLORS.paper);
  // Вершина кутика й напрямок його плечей.
  const corner = active ? 4 : 11;
  const arm = active ? 6 : -6;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * corner;
      const y = sy * corner;
      g.lineBetween(x, y, x + sx * arm, y).lineBetween(x, y, x, y + sy * arm);
    }
  }
}

/** Косі смужки між x0 і x1 по висоті шкали; кожна смужка обрізана краями ділянки. */
function hatch(g: Phaser.GameObjects.Graphics, bar: BarRect, x0: number, x1: number, color: number): void {
  const top = bar.y + 1;
  const bottom = bar.y + bar.h - 1;
  const height = bottom - top;
  g.lineStyle(2, color);
  for (let start = x0 - height; start < x1; start += HATCH_STEP) {
    // Смужка під 45°: від (start, низ) до (start + висота, верх).
    const ax = Math.max(start, x0);
    const bx = Math.min(start + height, x1);
    if (bx > ax) g.lineBetween(ax, bottom - (ax - start), bx, bottom - (bx - start));
  }
}
