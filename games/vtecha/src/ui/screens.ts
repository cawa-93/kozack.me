// Екрани поза грою (§12.2–12.6): стартовий, налаштування/пауза, смерть, перемога.
// Кнопки — іконками (§1.3); текст лише там, де іконка не передасть зміст.

import type { Settings } from "../game/settings";
import { ICON } from "./icons";

export interface ScreenHandlers {
  onStart(): void;
  onContinue(): void;
  onSettingsChanged(key: keyof Settings, channelSample?: "master" | "effects" | "ambient"): void;
  onResetTutorial(): void;
  onResultDone(): void;
}

export class Screens {
  private readonly start: HTMLElement;
  private readonly settingsEl: HTMLElement;
  private readonly death: HTMLElement;
  private readonly victory: HTMLElement;
  private readonly continueBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private continueReadyAt = 0;
  private settingsFromStart = true;
  private resultShownAt = 0;
  private readonly resumeHint: HTMLElement;
  private resumeReadyAt = 0;

  constructor(
    parent: HTMLElement,
    settings: Settings,
    private readonly h: ScreenHandlers,
  ) {
    // Стартовий екран (§12.5): назва й дві кнопки-іконки.
    this.start = el("div", "screen start");
    const title = el("h1", "title");
    title.textContent = "Втеча";
    const row = el("div", "btn-row");
    const play = iconButton(ICON.play, "Почати гру", "big");
    play.addEventListener("click", () => this.h.onStart());
    const gear = iconButton(ICON.gear, "Налаштування", "big");
    gear.addEventListener("click", () => this.openSettings(true));
    row.append(play, gear);
    this.start.append(title, row);

    // Налаштування / пауза (§12.6).
    this.settingsEl = el("div", "screen settings");
    const panel = el("div", "panel");
    panel.append(
      slider(ICON.speaker, "vol-master", settings.master, 0, 1, (v) => {
        settings.master = v;
        this.h.onSettingsChanged("master", "master");
      }),
      slider(ICON.speaker, "vol-effects", settings.effects, 0, 1, (v) => {
        settings.effects = v;
        this.h.onSettingsChanged("effects", "effects");
      }),
      slider(ICON.speaker, "vol-ambient", settings.ambient, 0, 1, (v) => {
        settings.ambient = v;
        this.h.onSettingsChanged("ambient", "ambient");
      }),
      slider(ICON.mouse, "sens", settings.mouseSensitivity, 0.2, 3, (v) => {
        settings.mouseSensitivity = v;
        this.h.onSettingsChanged("mouseSensitivity");
      }),
      toggle(ICON.eyeWave, "Дублювати звуки картинкою", settings.visualAudioCues, (v) => {
        settings.visualAudioCues = v;
        this.h.onSettingsChanged("visualAudioCues");
      }),
      toggle(ICON.spiderOff, "Режим арахнофобії", settings.arachnophobiaMode, (v) => {
        settings.arachnophobiaMode = v;
        this.h.onSettingsChanged("arachnophobiaMode");
      }),
    );
    const reset = iconButton(ICON.resetKeys, "Скинути навчання", "small");
    reset.classList.add("reset");
    reset.addEventListener("click", () => {
      this.h.onResetTutorial();
      reset.classList.add("done");
      setTimeout(() => reset.classList.remove("done"), 600);
    });
    const resetRow = el("div", "row");
    const resetLabel = el("span", "label");
    resetLabel.textContent = "Скинути навчання";
    resetRow.append(reset, resetLabel);
    panel.append(resetRow);
    const nav = el("div", "btn-row");
    this.backBtn = iconButton(ICON.back, "Назад", "big");
    this.backBtn.addEventListener("click", () => this.showStart());
    this.continueBtn = iconButton(ICON.play, "Продовжити", "big");
    this.continueBtn.addEventListener("click", () => {
      if (performance.now() < this.continueReadyAt) return;
      this.h.onContinue();
    });
    nav.append(this.backBtn, this.continueBtn);
    this.settingsEl.append(panel, nav);

    this.death = el("div", "screen death");
    this.victory = el("div", "screen victory");
    for (const s of [this.death, this.victory]) {
      s.addEventListener("click", () => {
        if (performance.now() - this.resultShownAt > 1500) this.h.onResultDone();
      });
    }
    // Іконка «клацни, щоб продовжити» після закриття меню паузи через Esc (§12.6).
    this.resumeHint = el("div", "resume-hint");
    this.resumeHint.innerHTML = ICON.mouse;
    parent.append(this.start, this.settingsEl, this.death, this.victory, this.resumeHint);
    this.showStart();
  }

  private hideAll(): void {
    for (const s of [this.start, this.settingsEl, this.death, this.victory, this.resumeHint]) s.classList.remove("visible");
  }

  showResumeHint(readyAt: number): void {
    this.hideAll();
    this.resumeReadyAt = readyAt;
    this.resumeHint.classList.add("visible");
    this.resumeHint.classList.toggle("ready", performance.now() >= readyAt);
    const wait = Math.max(0, readyAt - performance.now());
    setTimeout(() => this.resumeHint.classList.add("ready"), wait);
  }

  /** Браузер уже дозволяє повторно захопити мишу (минула ~1 с після Esc). */
  get resumeReady(): boolean {
    return this.resumeHint.classList.contains("visible") && performance.now() >= this.resumeReadyAt;
  }

  showStart(): void {
    this.hideAll();
    this.start.classList.add("visible");
  }

  openSettings(fromStart: boolean): void {
    this.hideAll();
    this.settingsFromStart = fromStart;
    this.backBtn.style.display = fromStart ? "" : "none";
    this.continueBtn.style.display = fromStart ? "none" : "";
    this.settingsEl.classList.add("visible");
  }

  /** Меню паузи; кнопка «Продовжити» ~1 с неактивна після виходу з Pointer Lock (§12.6, §18). */
  showPause(unlockTime: number): void {
    this.openSettings(false);
    this.continueReadyAt = unlockTime + 1100;
    this.continueBtn.disabled = true;
    const wait = Math.max(0, this.continueReadyAt - performance.now());
    setTimeout(() => (this.continueBtn.disabled = false), wait);
  }

  hide(): void {
    this.hideAll();
  }

  get inSettings(): boolean {
    return this.settingsEl.classList.contains("visible") && this.settingsFromStart;
  }

  /** Екран смерті (§12.2). */
  showDeath(reason: "spider" | "web", time: string, level: number): void {
    this.hideAll();
    const why = reason === "web" ? "Ви не встигли вирватись із павутини." : "Вас наздогнав павук.";
    this.death.innerHTML = `
      <div class="silhouette">${SPIDER_SILHOUETTE}</div>
      <h2 class="tremble">СМЕРТЬ</h2>
      <p class="tremble d1">Причина смерті: ${why}</p>
      <p class="tremble d2">Протримались: ${time}</p>
      <p class="tremble d3">Рівень: ${level} / 5</p>
      <div class="result-back d4">${ICON.back}</div>`;
    this.resultShownAt = performance.now();
    this.death.classList.add("visible");
  }

  /** Екран перемоги (§12.3): перший кадр, повністю залитий денним світлом. */
  showVictory(time: string): void {
    this.hideAll();
    this.victory.innerHTML = `
      <h2>ВТЕЧА</h2>
      <p>Час: ${time}</p>
      <div class="result-back">${ICON.back}</div>`;
    this.resultShownAt = performance.now();
    this.victory.classList.add("visible");
  }
}

const SPIDER_SILHOUETTE = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linecap="round">
<ellipse cx="100" cy="120" rx="30" ry="38"/><circle cx="100" cy="75" r="20"/>
<path d="M88 70 L50 40 L30 60 M85 80 L40 70 L15 95 M85 90 L45 105 L25 140 M88 100 L60 130 L50 175 M112 70 L150 40 L170 60 M115 80 L160 70 L185 95 M115 90 L155 105 L175 140 M112 100 L140 130 L150 175" fill="none"/></svg>`;

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function iconButton(icon: string, label: string, size: "big" | "small"): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `icon-btn ${size}`;
  b.innerHTML = icon;
  b.setAttribute("aria-label", label);
  b.title = label;
  return b;
}

function slider(icon: string, cls: string, value: number, min: number, max: number, onInput: (v: number) => void): HTMLElement {
  const row = el("div", `row ${cls}`);
  const ic = el("div", "row-icon");
  ic.innerHTML = icon;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = "0.01";
  input.value = String(value);
  input.addEventListener("input", () => onInput(Number(input.value)));
  row.append(ic, input);
  return row;
}

function toggle(icon: string, label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = el("label", "row toggle");
  const ic = el("div", "row-icon");
  ic.innerHTML = icon;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  const text = el("span", "label");
  text.textContent = label;
  row.append(ic, input, text);
  return row;
}
