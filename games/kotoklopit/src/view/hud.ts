// Інтерфейс рівня (§8.4): годинник, шкали показників, гроші, стани персонажа й короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.
// Смуга, кружечки показників, рамки шкал, телефон і кнопка повного екрана — кадри атласу `ui/hud/*` (крок 16, A13), іконки —
// `icon/*`, а кольори й написи — з палітри арту (`iso/hudlook.ts`, `iso/uilook.ts`); заливку шкал малює код у рамках арту.

import Phaser from "phaser";

import { addArt, setArt } from "./art/atlas";
import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { statCeiling } from "../sim/character";
import { LOW_STAT } from "../sim/config";
import { isDrowsy } from "../sim/sleep";
import { onSickLeave } from "../sim/work";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, Product, StatName } from "../sim/types";
import { fill, ILLNESS_TITLES } from "../texts";
import { iconArt, type IconName } from "./iconnames";
import { StretchArt } from "./iso/hudart";
import { bandRect, HUD_ART, HUD_BAND, HUD_STATES, hudTextScale, isoBarRects, STAT_BLINK, STAT_FILL, statDisc } from "./iso/hudlook";
import { UI_FILL, UI_FONT, UI_TEXT, uiEntry } from "./iso/uilook";
import { scheduleOf } from "./schedule";
import { PRODUCT_ICONS, STAT_ICONS } from "./symbols";
import { canvasNow, HUD_HEIGHT, type Frame } from "./viewport";
import { textResolution } from "./zoom";
import { UI_LAYERS } from "./world/layers";

/** Шкали показників (§6): іконка замість назви (§11.4) — сердечко, тарілка, мило, думка. */
const STATS: readonly { name: StatName; icon: IconName }[] = [
  { name: "health", icon: STAT_ICONS.health },
  { name: "satiety", icon: STAT_ICONS.satiety },
  { name: "hygiene", icon: STAT_ICONS.hygiene },
  { name: "sanity", icon: STAT_ICONS.sanity },
];

const ICON_SIZE = 30;
const BAR_X = 34;
const BAR_Y = 20;
const BAR_WIDTH = 116;
const BAR_HEIGHT = 12;
const STATS_X = 238;
const STATS_STEP = 158;
/** Штрихування частини шкали над межею (§6.3): крок смужок. */
const HATCH_STEP = 6;
/** Кнопки праворуч: відстань від правого краю до їхнього центру. */
const BUTTONS_INSET = 44;
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
/** Дрібні написи панелі: розмір шрифту на полотні до збільшення (`hudTextScale`) і де годинник під датою. */
const SMALL_TEXT = { date: 17, effects: 18, schedule: 18, news: 17, clockY: 26 } as const;
/**
 * Найширша дата, px полотна: від лівого краю (20) до кружечка першого показника з просвітом. Збільшена на телефоні дата
 * «Тиждень 12 · п'ятниця» інакше налазила б на нього — тоді вона стискається вшир.
 */
const DATE_MAX_WIDTH = STATS_X - 20 - 14;
/**
 * Кружечки (`statDisc`): чорнильне кільце показника (радіус `ICON_SIZE / 2 + 2` разом із контуром 2) і підказки (`HINT.r`),
 * а іконка менша — так, щоб довкола неї лишався папір.
 */
const STAT_DISC = statDisc(2 * (ICON_SIZE / 2 + 2) + 2);
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

/** Місце шкали показника `i`: 116 × 12 праворуч від іконки; рамку й заливку в ньому розкладає `isoBarRects`. */
const barSlot = (i: number): BarRect => ({ x: STATS_X + i * STATS_STEP + BAR_X, y: BAR_Y, w: BAR_WIDTH, h: BAR_HEIGHT });

export class Hud {
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
    this.date = text(20, 5, 17, UI_TEXT.muted);
    this.clock = text(20, 26, 36).setFontStyle("bold");
    // Іконки намальовані чорнилом для світлого бабла: на темній панелі їм потрібна світла підкладка.
    const labels = STATS.flatMap((stat, i) => {
      const x = STATS_X + i * STATS_STEP + ICON_SIZE / 2;
      const y = BAR_Y + BAR_HEIGHT / 2;
      const { ring, icon } = STAT_DISC;
      return [
        addArt(scene, null, HUD_ART.stat).setPosition(x, y).setDisplaySize(ring, ring),
        addArt(scene, null, iconArt(stat.icon)).setPosition(x, y).setDisplaySize(icon, icon),
      ];
    });
    this.bars = scene.add.graphics();
    const bars = STATS.map((_, i) => isoBarRects(barSlot(i), uiEntry(HUD_ART.bar).size));
    this.barLook = { ...BAR_LOOK, radius: (bars[0]?.fill.h ?? 0) / 2 };
    this.barRects = bars.map((bar) => bar.fill);
    this.effects = text(STATS_X, 44, 18, UI_TEXT.warning);
    this.money = text(866, 20, 30).setFontStyle("bold");
    this.schedule = text(990, 4, 18, UI_TEXT.muted);
    this.left = scene.add
      .container(0, 0, [this.date, this.clock, ...labels, this.bars])
      .setDepth(DEPTH)
      .addToDisplayList(layer);
    // Рамки шкал — «три частини» над заливкою.
    for (const bar of bars) new StretchArt(scene, this.left, HUD_ART.bar).place(bar.frame);
    this.left.add([this.effects, this.money, this.schedule]);

    // Телефон персонажа: доставка (§6.4).
    this.phoneArt = addArt(scene, null, HUD_ART.phone, { state: HUD_STATES.phone.idle });
    const { ring, icon } = HINT_DISC;
    this.hintIcon = addArt(scene, null, iconArt("food")).setPosition(HINT.x, HINT.y).setDisplaySize(icon, icon);
    const under = addArt(scene, null, HUD_ART.stat).setPosition(HINT.x, HINT.y).setDisplaySize(ring, ring);
    this.hintUnder = under;
    this.hint = scene.add.container(0, 0, [under, this.hintIcon]).setVisible(false);
    const size = uiEntry(HUD_ART.phone).size;
    this.phone = scene.add.container(0, 0, [this.phoneArt, this.hint]).setSize(size.w, size.h).setDepth(DEPTH).addToDisplayList(layer);
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
  layout({ width, safe, ui }: Frame): void {
    this.scaleSmall(hudTextScale(1 / canvasNow().unit));
    this.sharpen(textResolution(ui));
    this.band(width, safe.top + HUD_HEIGHT);
    this.left.setPosition(safe.left, safe.top);
    const x = width - safe.right - BUTTONS_INSET;
    this.phone.setPosition(x, safe.top + HUD_HEIGHT / 2 - 1);
    // Під телефоном, уже над квартирою: у смузі інтерфейсу на екрані 16:9 місця немає.
    this.fullscreen?.button.setPosition(x, safe.top + HUD_HEIGHT + 34);
    // Бабл телефона — правим верхнім кутом під телефоном, лівіше кнопки повного екрана.
    this.news.setPosition(x - 30, safe.top + HUD_HEIGHT + 10);
  }

  /**
   * Дрібні написи (дата, стани, розклад, бабл телефона) і підказка на телефоні — у `k` разів більші, коли полотно на екрані
   * зменшене (телефон, `hudTextScale`); лише коли масштаб змінився. Годинник опускається під більшу дату.
   */
  private scaleSmall(k: number): void {
    if (k === this.textScale) return;
    this.textScale = k;
    const px = (size: number): number => Math.round(size * k);
    this.date.setFontSize(px(SMALL_TEXT.date));
    this.clock.setY(SMALL_TEXT.clockY + px(SMALL_TEXT.date) - SMALL_TEXT.date);
    this.effects.setFontSize(px(SMALL_TEXT.effects));
    this.schedule.setFontSize(px(SMALL_TEXT.schedule));
    this.newsTitle.setFontSize(px(SMALL_TEXT.news));
    this.newsText.setFontSize(px(SMALL_TEXT.news)).setWordWrapWidth(px(NEWS.width));
    const at = k > 1 ? HINT_BIG : HINT;
    const { ring, icon } = statDisc(2 * HINT.r * k + 2);
    this.hintUnder.setPosition(at.x, at.y).setDisplaySize(ring, ring);
    this.hintIcon.setPosition(at.x, at.y).setDisplaySize(icon, icon);
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
    this.date.setText(`Тиждень ${weekOf(state.day)} · ${WEEKDAY_NAMES[weekdayOf(state.day)]}`);
    this.date.setScale(Math.min(1, DATE_MAX_WIDTH / Math.max(1, this.date.width)), 1);
    this.clock.setText(formatClock(state.minute));

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
    if (product !== this.hinted) this.showHint(product);
    if (product !== undefined) this.phone.setScale(1 + 0.1 * (0.5 + 0.5 * Math.sin(time / 160)));
    else this.phone.setScale(1);
    // Два найважливіші пункти (§8.4): на телефоні третій рядок дрібнішим шрифтом уже не прочитати.
    this.schedule.setText(scheduleOf(state).slice(0, 2).join("\n"));
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
