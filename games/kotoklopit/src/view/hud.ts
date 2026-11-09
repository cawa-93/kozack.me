// Інтерфейс рівня (§8.4): настільний годинник, календарик, шкали показників, гроші, планові комунальні, стани персонажа й короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.
// Смуга, кружечки показників, рамки шкал, телефон і кнопка повного екрана — кадри атласу `ui/hud/*` (крок 16, A13), іконки —
// `icon/*`, а кольори й написи — з палітри арту (`iso/hudlook.ts`, `iso/uilook.ts`); заливку шкал малює код у рамках арту.

import Phaser from "phaser";

import { addArt, setArt } from "./art/atlas";
import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { statCeiling } from "../sim/character";
import { LOW_STAT, SLEEP_SPEED_MAX_BONUS } from "../sim/config";
import { utilitiesPlanned } from "../sim/economy";
import { powerOut } from "../sim/modifiers";
import { isDrowsy } from "../sim/sleep";
import { onSickLeave } from "../sim/work";
import { absoluteMinute, formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, Product, StatName } from "../sim/types";
import { BILL_WHEN, fill, ILLNESS_TITLES, PANEL_STATES } from "../texts";
import { DeskCalendar } from "./deskcalendar";
import { DeskClock } from "./deskclock";
import { iconArt, type IconName } from "./iconnames";
import { StretchArt } from "./iso/hudart";
import {
  bandRect,
  CALENDAR_LIFT,
  HUD_ART,
  HUD_BAND,
  HUD_LAYOUT,
  HUD_STATES,
  hudColumns,
  hudLayout,
  hudTextScale,
  isoBarRects,
  STAT_BLINK,
  STAT_FILL,
  statDisc,
  type HudColumns,
  type HudLayout,
} from "./iso/hudlook";
import { UI_FILL, UI_FONT, UI_TEXT, uiEntry } from "./iso/uilook";
import { scheduleOf } from "./schedule";
import { PRODUCT_ICONS, STAT_ICONS, UTILITIES_ICON } from "./symbols";
import { canvasNow, type Frame } from "./viewport";
import { BASE_WIDTH, textResolution } from "./zoom";
import { UI_LAYERS } from "./world/layers";

/** Шкали показників (§6): іконка замість назви (§11.4) — сердечко, тарілка, мило, думка. */
const STATS: readonly { name: StatName; icon: IconName }[] = [
  { name: "health", icon: STAT_ICONS.health },
  { name: "satiety", icon: STAT_ICONS.satiety },
  { name: "hygiene", icon: STAT_ICONS.hygiene },
  { name: "sanity", icon: STAT_ICONS.sanity },
];

/** Просвіти в ряду показників: від грошей до квитанції, від кружечка до суми, від суми до розкладу. */
const ROW_GAP = { bill: 26, amount: 4, schedule: 12 } as const;
/** Неділя: цієї ночі комунальні й знімуть (§6.4). */
const SUNDAY = 6;
/** Штрихування частини шкали над межею (§6.3): крок смужок. */
const HATCH_STEP = 6;
/** Кнопки праворуч: відстань від правого краю до їхнього центру. */
const BUTTONS_INSET = 44;
/** Скільки лишити вільним ліворуч від центру телефона: він пульсує, коли є підказка. */
const PHONE_CLEARANCE = 36;
/**
 * Поле дотику кнопок праворуч, одиниці кадру: більше за малюнок (телефон 60, повний екран 48), бо на телефоні набік і
 * збільшені (`hudTextScale`) вони менші за палець (ревізія інтерфейсу: ≈26 і ≈22 px CSS на 844 × 390).
 */
const TOUCH = { phone: 72, fullscreen: 64 } as const;
/** Кнопка повного екрана — під телефоном, на стільки нижче за смугу (одиниці кадру, до масштабу кнопок). */
const FULLSCREEN_DROP = 34;
/**
 * «Балакучий» бабл телефона (§9.9, правка автора 2026-10-25): ширина тексту, відступи, скільки висить —
 * основа й за кожен символ, найдовше, — і як довго згасає, мс.
 */
const NEWS = { width: 340, pad: 12, baseMs: 2500, perCharMs: 45, maxMs: 8000, fadeMs: 400 } as const;
const DEPTH = UI_LAYERS.hud;
/** Підказка на телефоні (§6.4): кружечок під іконкою запасу — центр від центру телефона й радіус кружечка. */
const HINT = { x: 19, y: 19, r: 15 } as const;
/**
 * Підказка на зменшеному полотні (телефон, `hudTextScale` > 1): кружечок більший — радіус × масштаб написів — і ближче до
 * середини телефона, щоб не вилазив за смугу панелі.
 */
const HINT_BIG = { x: 15, y: 14 } as const;
/** Дрібні написи панелі: розмір шрифту на полотні до збільшення (`hudTextScale`). Гроші й комунальні — одного розміру. */
const SMALL_TEXT = { billWhen: 18, effects: 18, schedule: 18, news: 17, amount: 20 } as const;
/** Кружечок підказки (`statDisc`, `HINT.r` з контуром 2): іконка менша за папір — довкола неї лишається просвіт. */
const HINT_DISC = statDisc(2 * HINT.r + 2);

type EventData = Phaser.Types.Input.EventData;

/** Шкала на панелі: прямокутник заливки, px від лівого краю панелі. */
interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Як малювати шкали: доріжка, колір блимання, штрихування понад межею; контур дає рамка арту. */
interface BarLook {
  trough: number;
  blink: number;
  hatch: number;
  radius: number;
}

/** Заливка — під рамкою арту, тож її кінці — півкола: радіус — половина висоти заливки (`isoBarRects`). */
const BAR_LOOK: Omit<BarLook, "radius"> = { trough: UI_FILL.trough, blink: STAT_BLINK, hatch: UI_FILL.hatch };

/** Місце шкали показника `i` за розкладом панелі (праворуч від кружечка); рамку й заливку в ньому розкладає `isoBarRects`. */
const barSlot = (i: number, layout: HudLayout, columns: HudColumns): BarRect => ({
  x: layout.stats + i * columns.step + layout.bar.x,
  y: layout.bar.y,
  w: columns.bar,
  h: layout.bar.h,
});

export class Hud {
  /** Смуга панелі: розтягнути на ширину екрана й висоту панелі з безпечною зоною. */
  private readonly band: (width: number, height: number) => void;
  /** Усе, що ліворуч: годинник, календарик, шкали, гроші, розклад. */
  private readonly left: Phaser.GameObjects.Container;
  private readonly calendar: DeskCalendar;
  private readonly clock: DeskClock;
  /** Хвилина гри, яку показують годинник, календарик і квитанція: щокадру їх не перераховують. */
  private shownAt: number | null = null;
  private readonly bars: Phaser.GameObjects.Graphics;
  /** Кружечки показників: паперове кільце й іконка. */
  private readonly discs: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image }[];
  /** Рамки шкал — «три частини» над заливкою. */
  private readonly barFrames: StretchArt[];
  /** Де заливка шкал і як її малювати (за розкладом панелі, `arrange`). */
  private barRects: BarRect[] = [];
  private readonly barLook: BarLook = { ...BAR_LOOK, radius: 0 };
  /** Розклад панелі зараз: десктоп чи низький екран (`hudLayout`); null — ще не розкладено. */
  private shape: HudLayout | null = null;
  /** Ширина панелі зараз і колонки за нею (`hudColumns`). */
  private room = 0;
  private columns: HudColumns | null = null;
  /** Власні гроші: гаманець на кружечку й сума. */
  private readonly wallet: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image };
  private readonly money: Phaser.GameObjects.Text;
  /** Планові комунальні: квитанція на кружечку, сума й під ними — коли її знімуть. */
  private readonly bill: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; amount: Phaser.GameObjects.Text; when: Phaser.GameObjects.Text };
  private readonly effects: Phaser.GameObjects.Text;
  /**
   * Розклад — два рядки на лініях панелі: перший — посередині ряду показників і грошей, другий — на рядку станів і підпису
   * квитанції (ревізія інтерфейсу: одним блоком розклад «плив» на власній сітці).
   */
  private readonly schedule: readonly [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly phone: Phaser.GameObjects.Container;
  /** Кадр телефона (стан `hint`, коли є підказка). */
  private readonly phoneArt: Phaser.GameObjects.Image;
  /** Підказка на телефоні (§6.4): іконка запасу, що вперше закінчився. */
  private readonly hint: Phaser.GameObjects.Container;
  private readonly hintIcon: Phaser.GameObjects.Image;
  /** Запас, який зараз показує підказка (`undefined` — підказки немає, як на початку). */
  private hinted: Product | undefined = undefined;
  /** Кнопка повного екрана (§10); на iPhone її немає. `show` — намалювати значок: увімкнути чи вийти. */
  private readonly fullscreen: { button: Phaser.GameObjects.Container; show: (active: boolean) => void } | null = null;
  private fullscreenDrawn: boolean | null = null;
  /** «Балакучий» бабл телефона: що стало відомо про кота (§9.9). */
  private readonly news: Phaser.GameObjects.Container;
  private readonly newsBg: Phaser.GameObjects.Graphics;
  private readonly newsTitle: Phaser.GameObjects.Text;
  private readonly newsText: Phaser.GameObjects.Text;
  /** Коли бабл почне згасати (час сцени, мс); null — бабла немає. */
  private newsUntil: number | null = null;
  /** Підкладка під іконкою підказки. */
  private readonly hintUnder: Phaser.GameObjects.Image;
  /** У скільки разів зараз збільшені дрібні написи й підказка (`hudTextScale`); 1 — як на десктопі. */
  private textScale = 1;
  /** Масштаб кнопок праворуч (телефон, повний екран): той самий, що в дрібних написів (`hudTextScale`). */
  private buttonScale = 1;
  /** Усі написи панелі: їхню роздільність веде зум камери інтерфейсу (`textResolution`). */
  private readonly texts: Phaser.GameObjects.Text[] = [];
  /** Роздільність написів зараз. */
  private resolution: number;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    onPhone: () => void,
  ) {
    // Написи — паперовим на темній панелі з чорнильною обвідкою (`iso/uilook.ts`), піксель у піксель полотна.
    const resolution = textResolution(canvasNow().ui);
    this.resolution = resolution;
    const keep = (made: Phaser.GameObjects.Text): Phaser.GameObjects.Text => {
      this.texts.push(made);
      return made;
    };
    const text = (x: number, y: number, size: number, color: string = UI_TEXT.main) =>
      keep(scene.add.text(x, y, "", { fontFamily: UI_FONT, fontSize: `${size}px`, color, stroke: UI_TEXT.stroke, strokeThickness: size >= 30 ? 4 : 3, resolution }));
    // Шрифти великі: на телефоні полотно зменшується майже вдвічі.
    // Поле полотна смуги — за екраном, чорнильний край — у межах панелі (`HUD_BAND`).
    const band = new StretchArt(scene, layer, HUD_ART.band).setDepth(DEPTH - 1).setAlpha(HUD_BAND.alpha);
    this.band = (width, height) => band.place(bandRect(band.frame, width, height));
    this.calendar = new DeskCalendar(scene, (size, color) => text(0, 0, size, color));
    this.clock = new DeskClock(scene);
    // Іконки намальовані чорнилом для світлого бабла: на темній панелі їм потрібна світла підкладка. Місце й розмір — `arrange`.
    this.discs = STATS.map((stat) => ({ ring: addArt(scene, null, HUD_ART.stat), icon: addArt(scene, null, iconArt(stat.icon)) }));
    this.bars = scene.add.graphics();
    this.effects = text(0, 0, SMALL_TEXT.effects, UI_TEXT.warning);
    this.wallet = { ring: addArt(scene, null, HUD_ART.stat), icon: addArt(scene, null, HUD_ART.purse) };
    this.money = text(0, 0, SMALL_TEXT.amount).setFontStyle("bold").setOrigin(0, 0.5);
    this.bill = {
      ring: addArt(scene, null, HUD_ART.stat),
      icon: addArt(scene, null, iconArt(UTILITIES_ICON)),
      amount: text(0, 0, SMALL_TEXT.amount).setFontStyle("bold").setOrigin(0, 0.5),
      when: text(0, 0, SMALL_TEXT.billWhen, UI_TEXT.muted),
    };
    this.schedule = [text(0, 0, SMALL_TEXT.schedule, UI_TEXT.muted).setOrigin(0, 0.5), text(0, 0, SMALL_TEXT.schedule, UI_TEXT.muted)];
    this.left = scene.add
      .container(0, 0, [this.calendar.root, this.clock.root, ...this.discs.flatMap((disc) => [disc.ring, disc.icon]), this.bars])
      .setDepth(DEPTH)
      .addToDisplayList(layer);
    // Рамки шкал — «три частини» над заливкою.
    this.barFrames = STATS.map(() => new StretchArt(scene, this.left, HUD_ART.bar));
    this.left.add([this.effects, this.wallet.ring, this.wallet.icon, this.money, this.bill.ring, this.bill.icon, this.bill.amount, this.bill.when, ...this.schedule]);
    this.arrange(HUD_LAYOUT.desktop, BASE_WIDTH);

    // Телефон персонажа: доставка (§6.4).
    this.phoneArt = addArt(scene, null, HUD_ART.phone, { state: HUD_STATES.phone.idle });
    const { ring, icon } = HINT_DISC;
    this.hintIcon = addArt(scene, null, iconArt("food")).setPosition(HINT.x, HINT.y).setDisplaySize(icon, icon);
    const under = addArt(scene, null, HUD_ART.stat).setPosition(HINT.x, HINT.y).setDisplaySize(ring, ring);
    this.hintUnder = under;
    this.hint = scene.add.container(0, 0, [under, this.hintIcon]).setVisible(false);
    this.phone = scene.add.container(0, 0, [this.phoneArt, this.hint]).setSize(TOUCH.phone, TOUCH.phone).setDepth(DEPTH).addToDisplayList(layer);
    this.phone.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onPhone();
    });

    // Бабл телефона: мовна хмаринка під панеллю, хвостиком до телефона; натиснути — сховати. Папір і чорнило палітри арту.
    this.newsBg = scene.add.graphics();
    this.newsTitle = keep(scene.add.text(0, 0, "", { fontFamily: UI_FONT, fontSize: "17px", fontStyle: "bold", color: UI_TEXT.onPaper, resolution }));
    this.newsText = keep(scene.add.text(0, 0, "", { fontFamily: UI_FONT, fontSize: "17px", color: UI_TEXT.onPaper, resolution, wordWrap: { width: NEWS.width } }));
    this.news = scene.add.container(0, 0, [this.newsBg, this.newsTitle, this.newsText]).setDepth(DEPTH).setVisible(false).addToDisplayList(layer);
    this.news.on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      this.hideNews();
    });

    if (canFullscreen()) {
      const icon = addArt(scene, null, HUD_ART.fullscreen, { state: HUD_STATES.fullscreen.enter });
      const show = (active: boolean): void => {
        setArt(icon, HUD_ART.fullscreen, { state: active ? HUD_STATES.fullscreen.exit : HUD_STATES.fullscreen.enter });
      };
      const button = scene.add.container(0, 0, [icon]).setSize(TOUCH.fullscreen, TOUCH.fullscreen).setDepth(DEPTH).addToDisplayList(layer);
      button
        .setInteractive({ useHandCursor: true })
        // Дотик до кнопки не запускає джойстик; а повний екран браузер вмикає, лише коли палець відпустили.
        .on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => event.stopPropagation())
        .on("pointerup", () => toggleFullscreen());
      this.fullscreen = { button, show };
    }
  }

  /** Розкласти інтерфейс по екрану: ні ліва частина, ні кнопки праворуч не заходять під виріз камери. */
  layout({ width, safe, ui }: Frame): void {
    const cssPerUnit = 1 / canvasNow().unit;
    const k = hudTextScale(cssPerUnit);
    this.scaleSmall(k);
    // Кнопки праворуч — у тому самому масштабі, що й дрібні написи: на телефоні набік інакше вони менші за палець.
    this.buttonScale = k;
    const shape = this.arrange(hudLayout(cssPerUnit), width - safe.left - safe.right - (BUTTONS_INSET + PHONE_CLEARANCE) * k);
    this.sharpen(textResolution(ui));
    const height = shape.height;
    this.band(width, safe.top + height);
    this.left.setPosition(safe.left, safe.top);
    const x = width - safe.right - BUTTONS_INSET * k;
    this.phone.setPosition(x, safe.top + height / 2 - 1).setScale(k);
    // Під телефоном, уже над квартирою: у смузі інтерфейсу на екрані 16:9 місця немає.
    this.fullscreen?.button.setPosition(x, safe.top + height + FULLSCREEN_DROP * k).setScale(k);
    // Бабл телефона — правим верхнім кутом під телефоном, лівіше кнопки повного екрана.
    this.news.setPosition(x - 30 * k, safe.top + height + 10);
  }

  /**
   * Розкласти панель за `layout` (десктоп чи низький екран, `hudLayout`) на ширину `room` — лише коли щось із них змінилося:
   * годинник, календарик, кружечки показників, рамки й заливка шкал, рядок станів, гроші й розклад. Повертає розклад, що діє.
   */
  private arrange(layout: HudLayout, room: number): HudLayout {
    if (layout === this.shape && room === this.room) return layout;
    this.shape = layout;
    this.room = room;
    const columns = hudColumns(layout, room);
    this.columns = columns;
    this.clock.root.setPosition(layout.clock.x, layout.height / 2).setScale(layout.clock.scale);
    this.calendar.root.setPosition(layout.calendarX, layout.height / 2 - CALENDAR_LIFT * layout.clock.scale).setScale(layout.clock.scale);
    const { ring, icon } = statDisc(layout.disc.outer, layout.disc.fill);
    this.discs.forEach((disc, i) => {
      const x = layout.stats + i * columns.step + layout.disc.x;
      disc.ring.setPosition(x, layout.disc.y).setDisplaySize(ring, ring);
      disc.icon.setPosition(x, layout.disc.y).setDisplaySize(icon, icon);
    });
    const frame = uiEntry(HUD_ART.bar).size;
    this.barRects = this.barFrames.map((art, i) => {
      const bar = isoBarRects(barSlot(i, layout, columns), frame);
      art.place(bar.frame);
      return bar.fill;
    });
    // Заливка — під рамкою арту, тож її кінці — півкола.
    this.barLook.radius = (this.barRects[0]?.h ?? 0) / 2;
    this.effects.setPosition(layout.stats, layout.effectsY);
    const radius = layout.disc.outer / 2;
    this.wallet.ring.setPosition(columns.money + radius, layout.disc.y).setDisplaySize(ring, ring);
    this.wallet.icon.setPosition(columns.money + radius, layout.disc.y).setDisplaySize(icon, icon);
    this.money.setPosition(columns.money + layout.disc.outer + ROW_GAP.amount, layout.disc.y);
    this.bill.ring.setDisplaySize(ring, ring);
    this.bill.icon.setDisplaySize(icon, icon);
    this.schedule[0].setY(layout.disc.y);
    this.schedule[1].setY(layout.effectsY);
    this.placeBill();
    return layout;
  }

  /** Квитанція — за грошима, підпис — під нею від лівого краю кружечка, а розклад — на своєму місці, хіба що довгі суми дійшли до нього. */
  private placeBill(): void {
    const { shape, columns } = this;
    if (!shape || !columns) return;
    const y = shape.disc.y;
    const r = shape.disc.outer / 2;
    const disc = this.money.x + this.money.width + ROW_GAP.bill + r;
    this.bill.ring.setPosition(disc, y);
    this.bill.icon.setPosition(disc, y);
    this.bill.amount.setPosition(disc + r + ROW_GAP.amount, y);
    // На рядку станів: той самий кегль і та сама лінія.
    this.bill.when.setPosition(disc - r, shape.effectsY);
    const right = Math.max(this.bill.amount.x + this.bill.amount.width, this.bill.when.x + this.bill.when.width);
    const x = Math.max(columns.schedule, right + ROW_GAP.schedule);
    // Довгий розклад не заходить під телефон: стискається вшир — обидва рядки однаково.
    const scale = Math.min(1, (this.room - x) / Math.max(1, ...this.schedule.map((line) => line.width)));
    for (const line of this.schedule) line.setX(x).setScale(scale, 1);
    this.fitEffects();
  }

  /** Довгий рядок станів не заходить під підпис квитанції: стискається вшир. */
  private fitEffects(): void {
    const room = this.bill.when.x - ROW_GAP.schedule - this.effects.x;
    this.effects.setScale(Math.min(1, room / Math.max(1, this.effects.width)), 1);
  }

  /**
   * Дрібні написи (стани, розклад, суми, підпис квитанції, бабл телефона) і підказка на телефоні — у `k` разів більші, коли полотно на
   * екрані зменшене (телефон, `hudTextScale`); лише коли масштаб змінився.
   */
  private scaleSmall(k: number): void {
    if (k === this.textScale) return;
    this.textScale = k;
    const px = (size: number): number => Math.round(size * k);
    this.effects.setFontSize(px(SMALL_TEXT.effects));
    for (const line of this.schedule) line.setFontSize(px(SMALL_TEXT.schedule));
    this.money.setFontSize(px(SMALL_TEXT.amount));
    this.bill.amount.setFontSize(px(SMALL_TEXT.amount));
    this.bill.when.setFontSize(px(SMALL_TEXT.billWhen));
    this.newsTitle.setFontSize(px(SMALL_TEXT.news));
    this.newsText.setFontSize(px(SMALL_TEXT.news)).setWordWrapWidth(px(NEWS.width));
    const at = k > 1 ? HINT_BIG : HINT;
    const { ring, icon } = statDisc(2 * HINT.r * k + 2);
    this.hintUnder.setPosition(at.x, at.y).setDisplaySize(ring, ring);
    this.hintIcon.setPosition(at.x, at.y).setDisplaySize(icon, icon);
    this.placeBill();
  }

  /**
   * Роздільність написів — за зумом камери інтерфейсу (`textResolution`): лише коли він змінився (розмір вікна, DPR), бо
   * кожна зміна перемальовує текстуру напису.
   */
  private sharpen(resolution: number): void {
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    for (const text of this.texts) text.setResolution(resolution);
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
    g.fillStyle(UI_FILL.paper).fillRoundedRect(-width, 0, width, height, 14);
    g.lineStyle(3, UI_FILL.ink).strokeRoundedRect(-width, 0, width, height, 14);
    // Хвостик угору праворуч — до телефона.
    g.fillStyle(UI_FILL.paper).fillTriangle(-34, 1.5, -12, 1.5, 4, -14);
    g.lineStyle(3, UI_FILL.ink).lineBetween(-34, 0, 4, -14).lineBetween(4, -14, -12, 0);
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
    this.clock.blink(time);
    const shownAt = absoluteMinute(state.day, Math.floor(state.minute));
    if (shownAt !== this.shownAt) {
      this.shownAt = shownAt;
      this.showMinute(state);
    }

    const g = this.bars.clear();
    const look = this.barLook;
    STATS.forEach((stat, i) => {
      const bar = this.barRects[i];
      if (!bar) return;
      const value = stats[stat.name];
      const blink = value < LOW_STAT && Math.floor(time / 400) % 2 === 0;
      g.fillStyle(look.trough).fillRoundedRect(bar.x, bar.y, bar.w, bar.h, look.radius);
      g.fillStyle(blink ? look.blink : STAT_FILL[stat.name]).fillRoundedRect(bar.x, bar.y, Math.max(0, (bar.w * value) / 100), bar.h, look.radius);
      // Вище межі показник зараз не росте (брудний одяг, «Пригніченість»): цю частину шкали заштриховано.
      const ceiling = Math.max(value, statCeiling(state, stat.name));
      if (ceiling < 100) hatch(g, bar, bar.x + (bar.w * ceiling) / 100, bar.x + bar.w, look.hatch);
    });
    // Гаманець уже каже, що це гроші (§11.4): без символу гривні.
    const cash = String(Math.floor(money));
    if (cash !== this.money.text) {
      this.money.setText(cash);
      this.placeBill();
    }

    const effects: string[] = [];
    if (isDrowsy(state)) effects.push(PANEL_STATES.drowsy);
    if (sleepSpeed < 0) effects.push(PANEL_STATES.sleepDebt);
    if (sleepSpeed > 0) effects.push(fill(sleepSpeed >= SLEEP_SPEED_MAX_BONUS ? PANEL_STATES.wellRested : PANEL_STATES.rested, state.character.address));
    // Знесилення й голод видно з самих шкал: вони блимають (§11.4), тож слово не повторює їх.
    const job = state.job;
    if (job.unemployed) effects.push(PANEL_STATES.jobSearch);
    if (onSickLeave(state)) effects.push(PANEL_STATES.sickLeave);
    // День «Планового відключення» (§4.1, рішення автора 2026-11-02): світла немає весь день — у розкладі події немає, тож тут.
    if (powerOut(state)) effects.push(PANEL_STATES.noPower);
    for (const illness of state.character.illnesses) effects.push(ILLNESS_TITLES[illness.id]);
    const line = effects.join(" · ");
    if (line !== this.effects.text) {
      this.effects.setText(line);
      this.fitEffects();
    }
    // Запас уперше закінчився (§6.4): телефон пульсує з його іконкою, доки його не відкриють.
    const hints = state.home.phoneHints ?? [];
    const product = hints[hints.length - 1];
    if (product !== this.hinted) this.showHint(product);
    if (product !== undefined) this.phone.setScale(this.buttonScale * (1 + 0.1 * (0.5 + 0.5 * Math.sin(time / 160))));
    else this.phone.setScale(this.buttonScale);
  }

  /** Те, що змінюється не частіше за хвилину гри: годинник, календарик, планові комунальні й розклад. */
  private showMinute(state: GameState): void {
    this.clock.show(formatClock(state.minute));
    const weekday = weekdayOf(state.day);
    const name = WEEKDAY_NAMES[weekday] ?? "";
    this.calendar.show(`Тиждень ${weekOf(state.day)}`, name.charAt(0).toUpperCase() + name.slice(1));
    const planned = utilitiesPlanned(state);
    this.bill.amount.setText(planned > 0 ? `−${planned} ₴` : "0 ₴");
    this.bill.when.setText(planned > 0 ? (weekday === SUNDAY ? BILL_WHEN.sunday : BILL_WHEN.other) : "");
    // Два найважливіші пункти (§8.4): на телефоні третій рядок дрібнішим шрифтом уже не прочитати.
    const [first = "", second = ""] = scheduleOf(state);
    this.schedule[0].setText(first);
    this.schedule[1].setText(second);
    this.placeBill();
  }

  /** Підказка на телефоні — лише коли змінився запас (`undefined` — підказки немає): без перемальовування щокадру. */
  private showHint(product: Product | undefined): void {
    this.hinted = product;
    this.hint.setVisible(product !== undefined);
    setArt(this.phoneArt, HUD_ART.phone, { state: product !== undefined ? HUD_STATES.phone.hint : HUD_STATES.phone.idle });
    if (product === undefined) return;
    setArt(this.hintIcon, iconArt(PRODUCT_ICONS[product]));
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
