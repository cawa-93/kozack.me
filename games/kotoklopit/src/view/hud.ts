// Інтерфейс рівня (§8.4): годинник, шкали показників, гроші, стани персонажа й короткий
// розклад дня. Приховані числа (терпіння, репутація) тут не показуються.

import Phaser from "phaser";

import { canFullscreen, isFullscreen, toggleFullscreen } from "../screen";
import { STANDUP_MINUTE, STANDUP_MINUTES, WORK_END_MINUTE, WORK_START_MINUTE } from "../sim/config";
import { isDrowsy } from "../sim/sleep";
import { absoluteMinute, formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { GameState, StatName } from "../sim/types";
import { isWorkday } from "../sim/work";
import { fill } from "../texts";
import { BASE_WIDTH, COLORS } from "./geometry";
import { HUD_HEIGHT, type Frame } from "./viewport";

const FONT = "system-ui, sans-serif";
const TEXT = "#f3e9dc";
const MUTED = "#c9b9a8";

const STATS: readonly { name: StatName; label: string; color: number }[] = [
  { name: "health", label: "Здоров'я", color: 0xd8574a },
  { name: "satiety", label: "Ситість", color: 0xe0893a },
  { name: "hygiene", label: "Гігієна", color: 0x5fa8d3 },
  { name: "sanity", label: "Здоровий глузд", color: 0x9b7fd1 },
];

const BAR_WIDTH = 134;
const BAR_HEIGHT = 12;
const STATS_X = 238;
const STATS_STEP = 158;
const LOW = 25;
/** Кнопки праворуч: відстань від правого краю до їхнього центру. */
const BUTTONS_INSET = 44;
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
  /** Кнопка повного екрана (§10); на iPhone її немає. */
  private readonly fullscreen: { button: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Graphics } | null = null;
  private fullscreenDrawn: boolean | null = null;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, onPhone: () => void) {
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
    const labels = STATS.map((stat, i) => text(STATS_X + i * STATS_STEP, 4, 18, MUTED).setText(stat.label));
    this.bars = scene.add.graphics();
    this.effects = text(STATS_X, 50, 18, "#e8a33a");
    this.money = text(892, 20, 30).setFontStyle("bold");
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
    this.phone = scene.add.container(0, 0, [g]).setSize(56, 56).setDepth(DEPTH).addToDisplayList(layer);
    this.phone.setInteractive({ useHandCursor: true }).on("pointerdown", (_p: unknown, _x: number, _y: number, event: EventData) => {
      event.stopPropagation();
      onPhone();
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
  }

  update(state: GameState, time: number): void {
    this.drawFullscreen();
    const { stats, money, sleepSpeed } = state.character;
    this.date.setText(`Тиждень ${weekOf(state.day)} · ${WEEKDAY_NAMES[weekdayOf(state.day)]}`);
    this.clock.setText(formatClock(state.minute));

    const g = this.bars.clear();
    STATS.forEach((stat, i) => {
      const x = STATS_X + i * STATS_STEP;
      const value = stats[stat.name];
      const blink = value < LOW && Math.floor(time / 400) % 2 === 0;
      g.fillStyle(0x1a1520).fillRoundedRect(x, 32, BAR_WIDTH, BAR_HEIGHT, 5);
      g.fillStyle(blink ? 0xffffff : stat.color).fillRoundedRect(x, 32, Math.max(0, (BAR_WIDTH * value) / 100), BAR_HEIGHT, 5);
      g.lineStyle(2, COLORS.ink).strokeRoundedRect(x, 32, BAR_WIDTH, BAR_HEIGHT, 5);
    });
    // Монетка.
    g.fillStyle(0xe8b93a).fillCircle(874, 38, 11).lineStyle(2, COLORS.ink).strokeCircle(874, 38, 11);
    this.money.setText(String(Math.floor(money)));

    const effects: string[] = [];
    if (state.modifiers.day === "first-day") effects.push("Перший день");
    if (isDrowsy(state)) effects.push("Сонливість");
    if (sleepSpeed < 0) effects.push("Недосип");
    if (sleepSpeed > 0) effects.push(fill(sleepSpeed >= 0.1 ? "Добре [виспався|виспалася]" : "[Виспався|Виспалася]", state.character.sex));
    if (stats.health < LOW) effects.push("Знесилення");
    if (stats.satiety < LOW) effects.push("Голод");
    const job = state.job;
    if (job.unemployed) effects.push(`Пошук роботи ${Math.floor(job.searchHours)}/24 год`);
    if (state.day <= job.sickLeaveUntil) effects.push("Лікарняний");
    this.effects.setText(effects.join(" · "));
    const schedule = scheduleOf(state).slice(0, 3);
    // Три рядки вміщуються лише дрібнішим шрифтом.
    this.schedule.setFontSize(schedule.length > 2 ? 15 : 18).setText(schedule.join("\n"));
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

/** Короткий розклад: заплановані події, про які персонаж знає (§8.4). */
export function scheduleOf(state: GameState): string[] {
  const items: string[] = [];
  const minute = state.minute;
  if (isWorkday(state) && minute < WORK_END_MINUTE) {
    items.push(`${formatClock(WORK_START_MINUTE)}–${formatClock(WORK_END_MINUTE)} робота`);
    if (minute < STANDUP_MINUTE + STANDUP_MINUTES) items.push(`${formatClock(STANDUP_MINUTE)} летучка`);
  }
  if (state.home.porch.length > 0) items.push("пакунок під дверима");
  const today = absoluteMinute(state.day, 0);
  for (const delivery of state.home.deliveries) {
    // Кур'єр приїде «приблизно»: час округлено до чверті години.
    const at = Math.round((delivery.at - today) / 15) * 15;
    items.push(`≈${formatClock(at)} кур'єр`);
  }
  return items;
}
