// Інтерфейс рівня (§8.4): настільний годинник, календарик, шкали показників, гроші, несплачений рахунок, іконки станів і короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.
// Смуга, кружечки показників, шкали (рамка, доріжка, заливка, штрихування), телефон і кнопка повного екрана — кадри атласу
// `ui/hud/*`, іконки — `icon/*`, а кольори й написи — з палітри арту (`iso/hudlook.ts`, `iso/uilook.ts`). Код малює лише тло
// бабла телефона: воно змінне й вшир, і ввись, а видно його кілька секунд.

import Phaser from "phaser";

import { addArt, setArt } from "./art/atlas";
import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { statCeiling } from "../sim/character";
import { hasUnpaidUtilities } from "../sim/economy";
import { LOW_STAT } from "../sim/config";
import { absoluteMinute, formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, Product, StatName } from "../sim/types";
import { DeskCalendar } from "./deskcalendar";
import { DeskClock } from "./deskclock";
import { barDraw, barsKey, hatchCrop, type BarDraw } from "./hudbars";
import { newsHitArea } from "./hudnews";
import { iconArt, markArt, type IconName } from "./iconnames";
import { personStates } from "./personstates";
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
  BAR_FILL_STATES,
  barFillState,
  statDisc,
  type HudColumns,
  type HudLayout,
} from "./iso/hudlook";
import { UI_FILL, UI_FONT, UI_TEXT, uiEntry } from "./iso/uilook";
import { scheduleOf } from "./schedule";
import { slice3Frame } from "./slice3";
import { Slice3Art } from "./slice3art";
import { PERSON_STATE_ICONS, PRODUCT_ICONS, STAT_ICONS, UTILITIES_ICON } from "./symbols";
import { setFontSize, withMetrics } from "./textmetrics";
import { canvasNow, type Frame } from "./viewport";
import { BASE_WIDTH, textResolution } from "./zoom";
import { UI_LAYERS } from "./world/layers";

/** Шкали показників (§6): іконка замість назви (§11.4) — сердечко, тарілка, мило, думка. */
/** Показники — дві колонки по два (§8.4): `column`, `row` — місце в сітці. */
const STATS: readonly { name: StatName; icon: IconName; column: 0 | 1; row: 0 | 1 }[] = [
  { name: "health", icon: STAT_ICONS.health, column: 0, row: 0 },
  { name: "sanity", icon: STAT_ICONS.sanity, column: 0, row: 1 },
  { name: "satiety", icon: STAT_ICONS.satiety, column: 1, row: 0 },
  { name: "hygiene", icon: STAT_ICONS.hygiene, column: 1, row: 1 },
];

/** Просвіти в ряду показників: від кружечка до суми, від суми до квитанції, від суми до розкладу. */
const ROW_GAP = { amount: 4, bill: 10, schedule: 12 } as const;
/**
 * Аркуш розкладу (`ui/hud/note`): `pad` — відступ за рядками, одиниці кадру (у Caveat хвости літер виходять за виміряну ширину
 * рядка); `gap` — від аркуша до телефона, одиниці панелі. Лівий край рядків — точки запису.
 */
const NOTE = { pad: 28, gap: 14 } as const;
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
/** Дрібні написи панелі: розмір шрифту на полотні до збільшення (`hudTextScale`). */
const SMALL_TEXT = { schedule: 19, news: 17, amount: 20 } as const;
/** Іконки станів персонажа (§8.4): кружечок — така частка кружечка показника, просвіт між ними; найбільше станів разом. */
const STATE_DISC = { share: 0.8, gap: 4, max: 8 } as const;
/** Запис від руки на аркуші розкладу (`theme.css`): Caveat вужчий і дрібніший за системний того самого кегля. */
const HANDWRITING = { family: "Caveat, system-ui, sans-serif", weight: "600" } as const;
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

/** Шкала під рамкою арту — кадри атласу: доріжка й заливка «трьома частинами» (`slice3.ts`) і штрихування над межею (§6.3). */
interface BarArt {
  trough: Slice3Art;
  fill: Slice3Art;
  hatch: Phaser.GameObjects.Image;
}

/** Місце шкали показника за розкладом панелі (праворуч від кружечка, посередині ряду); рамку й заливку розкладає `isoBarRects`. */
const barSlot = (stat: (typeof STATS)[number], layout: HudLayout, columns: HudColumns): BarRect => ({
  x: layout.stats + stat.column * columns.step + layout.bar.x,
  y: layout.rows[stat.row] - layout.bar.h / 2,
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
  /** Хвилина гри, яку показують годинник, календарик і розклад: щокадру їх не перераховують. */
  private shownAt: number | null = null;
  private readonly bars: BarArt[];
  private readonly hatchFrame = slice3Frame(uiEntry(HUD_ART.barHatch));
  /** Кружечки показників: паперове кільце й іконка. */
  private readonly discs: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image }[];
  /** Рамки шкал — «три частини» над заливкою. */
  private readonly barFrames: StretchArt[];
  /** Де заливка шкал (за розкладом панелі, `arrange`). */
  private barRects: BarRect[] = [];
  /** Що шкали показують цього кадру (`barDraw`, той самий масив) і ключ того, що вже намальовано (`barsKey`; null — малювати). */
  private readonly barShown: BarDraw[] = [];
  private barsDrawn: string | null = null;
  /** Розклад панелі зараз: десктоп чи низький екран (`hudLayout`); null — ще не розкладено. */
  private shape: HudLayout | null = null;
  /** Ширина панелі зараз і колонки за нею (`hudColumns`). */
  private room = 0;
  private columns: HudColumns | null = null;
  /** Власні гроші: гаманець на кружечку й сума. */
  private readonly wallet: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image };
  private readonly money: Phaser.GameObjects.Text;
  /** Несплачений рахунок за комунальні (§6.4): квитанція на червоному кружечку одразу за сумою; натиснути — «Дім» у телефоні. */
  private readonly bill: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image };
  private billShown = false;
  /** Стани персонажа (§8.4): іконки на паперових кружечках у другому ряду, під грошима; `mark` — ✓ «чудово виспався». */
  private readonly states: { ring: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; mark: Phaser.GameObjects.Image }[];
  /** Які стани показано зараз (`personStates` через кому): іконки міняються, лише коли змінилися. */
  private statesShown = "";
  private statesCount = 0;
  /** Поле натискання над іконками станів: відкриває профіль у телефоні. */
  private readonly statesZone: Phaser.GameObjects.Zone;
  /** Розклад дня (§8.4): два рядки чорнилом на аркуші записника (`note`), що тягнеться вшир за довшим. */
  private readonly schedule: readonly [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly note: StretchArt;
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
    onProfile: () => void,
    onBill: () => void,
  ) {
    // Написи — паперовим на темній панелі з чорнильною обвідкою (`iso/uilook.ts`), піксель у піксель полотна.
    const resolution = textResolution(canvasNow().ui);
    this.resolution = resolution;
    const keep = (made: Phaser.GameObjects.Text): Phaser.GameObjects.Text => {
      this.texts.push(made);
      return made;
    };
    // Накреслення й обвідка — одразу в стилі: `setFontStyle` і `setStroke` готового напису міряють шрифт наново (`textmetrics.ts`).
    const text = (size: number, color: string = UI_TEXT.main, look: { bold?: boolean; plain?: boolean | undefined } = {}) =>
      keep(
        scene.add.text(
          0,
          0,
          "",
          withMetrics({
            fontFamily: UI_FONT,
            fontSize: `${size}px`,
            color,
            resolution,
            ...(look.bold ? { fontStyle: "bold" } : {}),
            ...(look.plain ? {} : { stroke: UI_TEXT.stroke, strokeThickness: size >= 30 ? 4 : 3 }),
          }),
        ),
      );
    // Шрифти великі: на телефоні полотно зменшується майже вдвічі.
    // Поле полотна смуги — за екраном, чорнильний край — у межах панелі (`HUD_BAND`).
    const band = new StretchArt(scene, layer, HUD_ART.band).setDepth(DEPTH - 1).setAlpha(HUD_BAND.alpha);
    this.band = (width, height) => band.place(bandRect(band.frame, width, height));
    this.calendar = new DeskCalendar(scene, (size, color, plain) => text(size, color, { plain }));
    this.clock = new DeskClock(scene);
    // Іконки намальовані чорнилом для світлого бабла: на темній панелі їм потрібна світла підкладка. Місце й розмір — `arrange`.
    this.discs = STATS.map((stat) => ({ ring: addArt(scene, null, HUD_ART.stat), icon: addArt(scene, null, iconArt(stat.icon)) }));
    // Натиснути на стани — профіль у телефоні (§8.4): там кожен із назвою й описом.
    // Нульова зона не стає інтерактивною (`setHitAreaFromTexture`): спершу 1 × 1, розмір — у `placeStates`.
    this.statesZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0.5);
    this.statesZone.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onProfile();
    });
    this.states = Array.from({ length: STATE_DISC.max }, () => ({
      ring: addArt(scene, null, HUD_ART.stat).setVisible(false),
      icon: addArt(scene, null, iconArt("zz")).setVisible(false),
      mark: addArt(scene, null, markArt("ok")).setVisible(false),
    }));
    this.wallet = { ring: addArt(scene, null, HUD_ART.stat), icon: addArt(scene, null, HUD_ART.purse) };
    this.money = text(SMALL_TEXT.amount, UI_TEXT.main, { bold: true }).setOrigin(0, 0.5);
    this.bill = { ring: addArt(scene, null, HUD_ART.alert).setVisible(false), icon: addArt(scene, null, iconArt(UTILITIES_ICON)).setVisible(false) };
    this.bill.ring.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onBill();
    });
    const handwriting = (): Phaser.GameObjects.Text =>
      keep(scene.add.text(0, 0, "", withMetrics({ fontFamily: HANDWRITING.family, fontStyle: HANDWRITING.weight, fontSize: `${SMALL_TEXT.schedule}px`, color: UI_TEXT.onPaper, resolution }))).setOrigin(0, 0.5);
    this.schedule = [handwriting(), handwriting()];
    // Шрифт вантажить браузер, а полотно малює рядок одразу: щойно шрифт готовий — перемалювати рядки (з метриками вже цього
    // шрифту, а не запасного) й розкласти аркуш наново.
    // Зразок — і з кирилицею: інакше браузер довантажує лише латинську частину (`unicode-range` у `theme.css`).
    void document.fonts?.load(`${HANDWRITING.weight} ${SMALL_TEXT.schedule}px Caveat`, "09:00 робота").then(() => {
      for (const line of this.schedule) setFontSize(line, Math.round(SMALL_TEXT.schedule * this.textScale));
      this.placeRight();
    });
    this.left = scene.add
      .container(0, 0, [this.calendar.root, this.clock.root, ...this.discs.flatMap((disc) => [disc.ring, disc.icon])])
      .setDepth(DEPTH)
      .addToDisplayList(layer);
    this.bars = STATS.map((stat) => {
      const bar: BarArt = {
        trough: new Slice3Art(scene, HUD_ART.barFill, BAR_FILL_STATES.trough),
        fill: new Slice3Art(scene, HUD_ART.barFill, barFillState(stat.name, false)),
        hatch: addArt(scene, null, HUD_ART.barHatch).setOrigin(0, 0).setVisible(false),
      };
      this.left.add([...bar.trough.images, ...bar.fill.images, bar.hatch]);
      return bar;
    });
    // Рамки шкал — «три частини» над заливкою.
    this.barFrames = STATS.map(() => new StretchArt(scene, this.left, HUD_ART.bar));
    // Аркуш розкладу — до рядків, щоб вони лягли поверх нього.
    this.note = new StretchArt(scene, this.left, HUD_ART.note);
    this.left.add([...this.states.flatMap((s) => [s.ring, s.icon, s.mark]), this.wallet.ring, this.wallet.icon, this.money, this.bill.ring, this.bill.icon, this.statesZone, ...this.schedule]);
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
    const news = { fontFamily: UI_FONT, fontSize: `${SMALL_TEXT.news}px`, color: UI_TEXT.onPaper, resolution };
    this.newsTitle = keep(scene.add.text(0, 0, "", withMetrics({ ...news, fontStyle: "bold" })));
    this.newsText = keep(scene.add.text(0, 0, "", withMetrics({ ...news, wordWrap: { width: NEWS.width } })));
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
      const stat = STATS[i];
      if (!stat) return;
      const x = layout.stats + stat.column * columns.step + layout.disc.x;
      disc.ring.setPosition(x, layout.rows[stat.row]).setDisplaySize(ring, ring);
      disc.icon.setPosition(x, layout.rows[stat.row]).setDisplaySize(icon, icon);
    });
    const frame = uiEntry(HUD_ART.bar).size;
    this.barRects = this.barFrames.map((art, i) => {
      const bar = isoBarRects(barSlot(STATS[i] ?? STATS[0]!, layout, columns), frame);
      art.place(bar.frame);
      this.bars[i]?.trough.place(bar.fill);
      return bar.fill;
    });
    this.barsDrawn = null;
    const radius = layout.disc.outer / 2;
    this.wallet.ring.setPosition(columns.money + radius, layout.rows[0]).setDisplaySize(ring, ring);
    this.wallet.icon.setPosition(columns.money + radius, layout.rows[0]).setDisplaySize(icon, icon);
    this.money.setPosition(columns.money + layout.disc.outer + ROW_GAP.amount, layout.rows[0]);
    this.placeRight();
    return layout;
  }

  /** Квитанція — за сумою, іконки станів — під грошима; розклад — праворуч біля телефона, але не лівіше за них. */
  private placeRight(): void {
    const { shape, columns } = this;
    if (!shape || !columns) return;
    const r = shape.disc.outer / 2;
    const { ring, icon } = statDisc(shape.disc.outer, shape.disc.fill);
    const x = this.money.x + this.money.width + ROW_GAP.bill + r;
    this.bill.ring.setPosition(x, shape.rows[0]).setDisplaySize(ring, ring);
    this.bill.icon.setPosition(x, shape.rows[0]).setDisplaySize(icon, icon);
    const money = this.billShown ? x + r : this.money.x + this.money.width;
    const states = this.placeStates();
    this.placeNote(Math.max(columns.schedule, money + ROW_GAP.schedule, states + ROW_GAP.schedule));
  }

  /** Квитанція видна, лише поки є що сплачувати (§6.4); розклад може відсунутися. */
  private showBill(state: GameState): void {
    const unpaid = hasUnpaidUtilities(state);
    if (unpaid === this.billShown) return;
    this.billShown = unpaid;
    this.bill.ring.setVisible(unpaid);
    this.bill.icon.setVisible(unpaid);
    this.placeRight();
  }

  /** Іконки станів (§8.4): у другому ряду від лівого краю грошей, кружечки трохи менші за кружечки показників; повертає їхній правий край. */
  private placeStates(): number {
    const { shape, columns } = this;
    if (!shape || !columns) return 0;
    const outer = shape.disc.outer * STATE_DISC.share;
    const { ring, icon } = statDisc(outer, shape.disc.fill);
    this.states.forEach((s, i) => {
      const x = columns.money + outer / 2 + i * (outer + STATE_DISC.gap);
      s.ring.setPosition(x, shape.rows[1]).setDisplaySize(ring, ring);
      s.icon.setPosition(x, shape.rows[1]).setDisplaySize(icon, icon);
      s.mark.setPosition(x, shape.rows[1]).setDisplaySize(icon, icon);
    });
    const width = this.statesCount === 0 ? 0 : this.statesCount * (outer + STATE_DISC.gap) - STATE_DISC.gap;
    // Поле натискання — над показаними іконками, із запасом на палець; без станів — нульове.
    const pad = this.statesCount === 0 ? 0 : STATE_DISC.gap * 2;
    this.statesZone.setPosition(columns.money - pad, shape.rows[1]).setSize(width + 2 * pad, width === 0 ? 0 : outer + 2 * pad);
    return columns.money + width;
  }

  /** Показати стани (§8.4): кадр іконки й позначки — лише коли набір станів змінився. */
  private showStates(state: GameState): void {
    const ids = personStates(state).slice(0, STATE_DISC.max);
    const key = ids.join(",");
    if (key === this.statesShown) return;
    this.statesShown = key;
    this.statesCount = ids.length;
    this.states.forEach((s, i) => {
      const id = ids[i];
      const look = id === undefined ? undefined : PERSON_STATE_ICONS[id];
      s.ring.setVisible(look !== undefined);
      s.icon.setVisible(look !== undefined);
      s.mark.setVisible(look?.mark !== undefined);
      if (!look) return;
      setArt(s.icon, iconArt(look.icon));
      if (look.mark) setArt(s.mark, markArt(look.mark));
    });
    // `setArt` ставить масштаб кадру заново: розмір — знову з розкладу; більше станів — розклад може відсунутися.
    this.placeRight();
  }

  /**
   * Аркуш розкладу праворуч, не лівіше за `min` (§8.4): заввишки й на тій самій висоті, що календарик, завширшки — за довшим
   * рядком; довгий розклад не заходить під телефон — рядки стискаються вшир однаково. Розкладу немає — немає й аркуша.
   */
  private placeNote(min: number): void {
    const { shape } = this;
    if (!shape) return;
    const shown = this.schedule[0].text !== "";
    this.note.setVisible(shown);
    if (!shown) return;
    const entry = uiEntry(HUD_ART.note);
    const s = shape.clock.scale;
    const left = (entry.points?.["line1"]?.x ?? 0) * s;
    const pad = NOTE.pad * s;
    const right = this.room - NOTE.gap * this.textScale;
    const widest = Math.max(1, ...this.schedule.map((line) => line.width));
    const squeeze = Math.min(1, (right - min - left - pad) / widest);
    const w = left + widest * squeeze + pad;
    const x = Math.max(min, right - w);
    const top = shape.height / 2 - CALENDAR_LIFT * s - (entry.size.h / 2) * s;
    this.note.place({ x, y: top, w, h: entry.size.h * s });
    this.schedule.forEach((line, i) => {
      const at = entry.points?.[i === 0 ? "line1" : "line2"]?.y ?? 0;
      line.setPosition(x + left, top + at * s).setScale(squeeze, 1);
    });
  }

  /**
   * Дрібні написи (розклад, гроші, бабл телефона) і підказка на телефоні — у `k` разів більші, коли полотно на
   * екрані зменшене (телефон, `hudTextScale`); лише коли масштаб змінився.
   */
  private scaleSmall(k: number): void {
    if (k === this.textScale) return;
    this.textScale = k;
    const px = (size: number): number => Math.round(size * k);
    for (const line of this.schedule) setFontSize(line, px(SMALL_TEXT.schedule));
    setFontSize(this.money, px(SMALL_TEXT.amount));
    setFontSize(this.newsTitle, px(SMALL_TEXT.news));
    setFontSize(this.newsText, px(SMALL_TEXT.news));
    this.newsText.setWordWrapWidth(px(NEWS.width));
    const at = k > 1 ? HINT_BIG : HINT;
    const { ring, icon } = statDisc(2 * HINT.r * k + 2);
    this.hintUnder.setPosition(at.x, at.y).setDisplaySize(ring, ring);
    this.hintIcon.setPosition(at.x, at.y).setDisplaySize(icon, icon);
    this.placeRight();
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
    // Без тексту — лише заголовок: у відкритої риси, чия назва каже все сама, опису немає (§9.9).
    const body = text === "" ? 0 : this.newsText.height + 2;
    const width = Math.max(this.newsTitle.width, this.newsText.width) + pad * 2;
    const height = this.newsTitle.height + body + pad * 2;
    // Контейнер стоїть у правому верхньому куті бабла: усе всередині — ліворуч і нижче.
    this.newsTitle.setPosition(-width + pad, pad);
    this.newsText.setPosition(-width + pad, pad + this.newsTitle.height + 2);
    const g = this.newsBg.clear();
    g.fillStyle(UI_FILL.paper).fillRoundedRect(-width, 0, width, height, 14);
    g.lineStyle(3, UI_FILL.ink).strokeRoundedRect(-width, 0, width, height, 14);
    // Хвостик угору праворуч — до телефона.
    g.fillStyle(UI_FILL.paper).fillTriangle(-34, 1.5, -12, 1.5, 4, -14);
    g.lineStyle(3, UI_FILL.ink).lineBetween(-34, 0, 4, -14).lineBetween(4, -14, -12, 0);
    // Зона дотику — за розміром цього бабла (`newsHitArea`): повторний `setInteractive` старої зони не міняє.
    const { size, area } = newsHitArea(width, height);
    this.news.setSize(size.width, size.height);
    const hit = this.news.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    if (hit) hit.setTo(area.x, area.y, area.width, area.height);
    else this.news.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
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
    const { money } = state.character;
    this.clock.blink(time);
    const shownAt = absoluteMinute(state.day, Math.floor(state.minute));
    if (shownAt !== this.shownAt) {
      this.shownAt = shownAt;
      this.showMinute(state);
    }

    this.drawBars(state, time);
    // Гаманець уже каже, що це гроші (§11.4): без символу гривні.
    const cash = String(Math.floor(money));
    if (cash !== this.money.text) {
      this.money.setText(cash);
      this.placeRight();
    }

    this.showStates(state);
    this.showBill(state);
    // Запас уперше закінчився (§6.4): телефон пульсує з його іконкою, доки його не відкриють.
    const hints = state.home.phoneHints ?? [];
    const product = hints[hints.length - 1];
    if (product !== this.hinted) this.showHint(product);
    if (product !== undefined) this.phone.setScale(this.buttonScale * (1 + 0.1 * (0.5 + 0.5 * Math.sin(time / 160))));
    else this.phone.setScale(this.buttonScale);
  }

  /**
   * Шкали показників (`barDraw`): заливка, блимання низького показника й штрихування над межею — показник вище неї зараз не росте
   * (брудний одяг, «Пригніченість»). Перемальовуються, лише коли змінилося видиме (`barsKey`), а не щокадру.
   */
  private drawBars(state: GameState, time: number): void {
    const ui = canvasNow().ui;
    const stats = state.character.stats;
    const shown = this.barShown;
    STATS.forEach((stat, i) => {
      const value = stats[stat.name];
      const blink = value < LOW_STAT && Math.floor(time / 400) % 2 === 0;
      shown[i] = barDraw(this.barRects[i]?.w ?? 0, value, Math.max(value, statCeiling(state, stat.name)), blink, ui);
    });
    const key = barsKey(shown);
    if (key === this.barsDrawn) return;
    this.barsDrawn = key;
    const hatch = this.hatchFrame;
    STATS.forEach((stat, i) => {
      const bar = this.barRects[i];
      const draw = shown[i];
      const art = this.bars[i];
      if (!bar || !draw || !art) return;
      art.fill.setState(barFillState(stat.name, draw.blink)).place({ x: bar.x, y: bar.y, w: draw.fill, h: bar.h });
      const crop = draw.hatch === null ? null : hatchCrop(hatch, bar, draw.hatch);
      art.hatch.setVisible(crop !== null);
      if (!crop) return;
      // Пікселів текстури на одиницю арту; обрізане зображення лишається на місці свого полотна.
      const k = art.hatch.width / hatch.size.w;
      art.hatch.setCrop(crop.src * k, 0, crop.srcW * k, art.hatch.height).setScale(crop.scale / k).setPosition(crop.x, crop.y);
    });
  }

  /** Те, що змінюється не частіше за хвилину гри: годинник, календарик і розклад. */
  private showMinute(state: GameState): void {
    this.clock.show(formatClock(state.minute));
    const weekday = weekdayOf(state.day);
    const name = WEEKDAY_NAMES[weekday] ?? "";
    this.calendar.show(`Тиждень ${weekOf(state.day)}`, name.charAt(0).toUpperCase() + name.slice(1));
    // Два найважливіші пункти (§8.4): на телефоні третій рядок дрібнішим шрифтом уже не прочитати.
    const [first = "", second = ""] = scheduleOf(state);
    this.schedule[0].setText(first);
    this.schedule[1].setText(second);
    this.placeRight();
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
