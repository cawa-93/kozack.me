// Інтерфейс рівня (§8.4): годинник, шкали показників, гроші, стани персонажа й короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.

import Phaser from "phaser";

import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { statCeiling } from "../sim/character";
import { LOW_STAT } from "../sim/config";
import { isDrowsy } from "../sim/sleep";
import { onSickLeave } from "../sim/work";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, StatName } from "../sim/types";
import { fill, ILLNESS_TITLES } from "../texts";
import { BASE_WIDTH, COLORS } from "./geometry";
import type { IconName } from "./icons";
import { scheduleOf } from "./schedule";
import { PRODUCT_ICONS } from "./symbols";
import { HUD_HEIGHT, type Frame } from "./viewport";

const FONT = "system-ui, sans-serif";
const TEXT = "#f3e9dc";
const MUTED = "#c9b9a8";

/** Шкали показників (§6): іконка замість назви (§11.4) — сердечко, тарілка, мило, думка. */
const STATS: readonly { name: StatName; icon: IconName; color: number }[] = [
  { name: "health", icon: "heart", color: 0xd8574a },
  { name: "satiety", icon: "food", color: 0xe0893a },
  { name: "hygiene", icon: "soap", color: 0x5fa8d3 },
  { name: "sanity", icon: "mind", color: 0x9b7fd1 },
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
const DEPTH = 20_000;

type EventData = Phaser.Types.Input.EventData;

export class Hud {
  private readonly band: Phaser.GameObjects.Rectangle;
  /** Усе, що ліворуч: дата, годинник, шкали, гроші, розклад. */
  private readonly left: Phaser.GameObjects.Container;
  private readonly date: Phaser.GameObjects.Text;
  private readonly clock: Phaser.GameObjects.Text;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly money: Phaser.GameObjects.Text;
  private readonly effects: Phaser.GameObjects.Text;
  private readonly schedule: Phaser.GameObjects.Text;
  private readonly phone: Phaser.GameObjects.Container;
  /** Підказка на телефоні (§6.4): іконка запасу, що вперше закінчився. */
  private readonly hint: Phaser.GameObjects.Container;
  private readonly hintIcon: Phaser.GameObjects.Image;
  /** Кнопка повного екрана (§10); на iPhone її немає. */
  private readonly fullscreen: { button: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Graphics } | null = null;
  private fullscreenDrawn: boolean | null = null;
  /** «Балакучий» бабл телефона: що стало відомо про кота (§9.9). */
  private readonly news: Phaser.GameObjects.Container;
  private readonly newsBg: Phaser.GameObjects.Graphics;
  private readonly newsTitle: Phaser.GameObjects.Text;
  private readonly newsText: Phaser.GameObjects.Text;
  /** Коли бабл почне згасати (час сцени, мс); null — бабла немає. */
  private newsUntil: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    onPhone: () => void,
  ) {
    const text = (x: number, y: number, size: number, color = TEXT) =>
      scene.add.text(x, y, "", { fontFamily: FONT, fontSize: `${size}px`, color, resolution: 2 });
    // Шрифти великі: на телефоні полотно зменшується майже вдвічі.
    this.band = scene.add
      .rectangle(0, 0, BASE_WIDTH, HUD_HEIGHT, COLORS.background, 0.92)
      .setOrigin(0)
      .setDepth(DEPTH - 1)
      .addToDisplayList(layer);
    this.date = text(20, 5, 17, MUTED);
    this.clock = text(20, 26, 36).setFontStyle("bold");
    // Іконки намальовані чорнилом для світлого бабла: на темній панелі їм потрібна світла підкладка.
    const labels = STATS.flatMap((stat, i) => {
      const x = STATS_X + i * STATS_STEP + ICON_SIZE / 2;
      const y = BAR_Y + BAR_HEIGHT / 2;
      return [
        scene.add.circle(x, y, ICON_SIZE / 2 + 2, COLORS.paper).setStrokeStyle(2, COLORS.ink),
        scene.add.image(x, y, `icon-${stat.icon}`).setDisplaySize(ICON_SIZE - 2, ICON_SIZE - 2),
      ];
    });
    this.bars = scene.add.graphics();
    this.effects = text(STATS_X, 44, 18, "#e8a33a");
    this.money = text(866, 20, 30).setFontStyle("bold");
    this.schedule = text(990, 4, 18, MUTED);
    this.left = scene.add
      .container(0, 0, [this.date, this.clock, ...labels, this.bars, this.effects, this.money, this.schedule])
      .setDepth(DEPTH)
      .addToDisplayList(layer);

    // Телефон персонажа: доставка (§6.4).
    const g = scene.add.graphics();
    g.fillStyle(0x4a3f52).fillCircle(0, 0, 26).lineStyle(2, COLORS.ink).strokeCircle(0, 0, 26);
    g.fillStyle(0x222026).fillRoundedRect(-9, -15, 18, 30, 4);
    g.fillStyle(0x79a6c2).fillRect(-6, -11, 12, 19);
    this.hintIcon = scene.add.image(19, 19, "icon-food").setDisplaySize(22, 22);
    this.hint = scene.add.container(0, 0, [scene.add.circle(19, 19, 15, COLORS.paper).setStrokeStyle(2, COLORS.ink), this.hintIcon]).setVisible(false);
    this.phone = scene.add.container(0, 0, [g, this.hint]).setSize(56, 56).setDepth(DEPTH).addToDisplayList(layer);
    this.phone.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onPhone();
    });

    // Бабл телефона: мовна хмаринка під панеллю, хвостиком до телефона; натиснути — сховати.
    this.newsBg = scene.add.graphics();
    this.newsTitle = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "17px", fontStyle: "bold", color: "#1f1a24", resolution: 2 });
    this.newsText = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "17px", color: "#1f1a24", resolution: 2, wordWrap: { width: NEWS.width } });
    this.news = scene.add.container(0, 0, [this.newsBg, this.newsTitle, this.newsText]).setDepth(DEPTH).setVisible(false).addToDisplayList(layer);
    this.news.on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      this.hideNews();
    });

    if (canFullscreen()) {
      const icon = scene.add.graphics();
      const button = scene.add.container(0, 0, [icon]).setSize(48, 48).setDepth(DEPTH).addToDisplayList(layer);
      button
        .setInteractive({ useHandCursor: true })
        // Дотик до кнопки не запускає джойстик; а повний екран браузер вмикає, лише коли палець відпустили.
        .on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => event.stopPropagation())
        .on("pointerup", () => toggleFullscreen());
      this.fullscreen = { button, icon };
    }
  }

  /** Розкласти інтерфейс по екрану: ні ліва частина, ні кнопки праворуч не заходять під виріз камери. */
  layout({ width, safe }: Frame): void {
    this.band.setSize(width, safe.top + HUD_HEIGHT);
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
    g.fillStyle(0xffffff).fillRoundedRect(-width, 0, width, height, 14);
    g.lineStyle(3, COLORS.ink).strokeRoundedRect(-width, 0, width, height, 14);
    // Хвостик угору праворуч — до телефона.
    g.fillStyle(0xffffff).fillTriangle(-34, 1.5, -12, 1.5, 4, -14);
    g.lineStyle(3, COLORS.ink).lineBetween(-34, 0, 4, -14).lineBetween(4, -14, -12, 0);
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
    STATS.forEach((stat, i) => {
      const x = STATS_X + i * STATS_STEP + BAR_X;
      const value = stats[stat.name];
      const blink = value < LOW_STAT && Math.floor(time / 400) % 2 === 0;
      g.fillStyle(0x1a1520).fillRoundedRect(x, BAR_Y, BAR_WIDTH, BAR_HEIGHT, 5);
      g.fillStyle(blink ? 0xffffff : stat.color).fillRoundedRect(x, BAR_Y, Math.max(0, (BAR_WIDTH * value) / 100), BAR_HEIGHT, 5);
      // Вище межі показник зараз не росте (брудний одяг, «Пригніченість»): цю частину шкали заштриховано.
      const ceiling = Math.max(value, statCeiling(state, stat.name));
      if (ceiling < 100) hatch(g, x + (BAR_WIDTH * ceiling) / 100, x + BAR_WIDTH);
      g.lineStyle(2, COLORS.ink).strokeRoundedRect(x, BAR_Y, BAR_WIDTH, BAR_HEIGHT, 5);
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
    if (product !== undefined) {
      this.hintIcon.setTexture(`icon-${PRODUCT_ICONS[product]}`).setDisplaySize(22, 22);
      this.phone.setScale(1 + 0.1 * (0.5 + 0.5 * Math.sin(time / 160)));
    } else this.phone.setScale(1);
    // Два найважливіші пункти (§8.4): на телефоні третій рядок дрібнішим шрифтом уже не прочитати.
    this.schedule.setText(scheduleOf(state).slice(0, 2).join("\n"));
  }

  /** Кутики назовні — увімкнути повний екран, усередину — вийти з нього. */
  private drawFullscreen(): void {
    if (!this.fullscreen) return;
    const active = isFullscreen();
    if (active === this.fullscreenDrawn) return;
    this.fullscreenDrawn = active;
    const g = this.fullscreen.icon.clear();
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
}

/** Косі смужки між x0 і x1 по висоті шкали; кожна смужка обрізана краями ділянки. */
function hatch(g: Phaser.GameObjects.Graphics, x0: number, x1: number): void {
  const top = BAR_Y + 1;
  const bottom = BAR_Y + BAR_HEIGHT - 1;
  const height = bottom - top;
  g.lineStyle(2, HATCH_COLOR);
  for (let start = x0 - height; start < x1; start += HATCH_STEP) {
    // Смужка під 45°: від (start, низ) до (start + висота, верх).
    const ax = Math.max(start, x0);
    const bx = Math.min(start + height, x1);
    if (bx > ax) g.lineBetween(ax, bottom - (ax - start), bx, bottom - (bx - start));
  }
}
