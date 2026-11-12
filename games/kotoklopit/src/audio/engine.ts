// Єдиний AudioContext гри (§8.10, §11.4а). Він окремо від Phaser, бо звук потрібен і карткам (DOM); Phaser запущено з `noAudio`.

import { SAMPLE_RATE, SFX, VOLUME_GLIDE } from "./config";

/** Браузер дозволяє звук лише після дії гравця; `fullscreenOnFirstAction` для цього не годиться: на iPhone він одразу виходить. */
const GESTURES = ["pointerup", "keydown", "touchend"] as const;

/** Шини: музика радіо, звуки світу, інтерфейс. Кожна — свій GainNode до виходу; шина світу — через `farTone`. */
export interface Buses {
  music: GainNode;
  world: GainNode;
  ui: GainNode;
}

export class AudioEngine {
  context: AudioContext | null = null;
  buses: Buses | null = null;
  private readonly listeners: (() => void)[] = [];
  private running = false;

  /** Шина музики (радіо). */
  get music(): GainNode | null {
    return this.buses?.music ?? null;
  }

  /** Викликати один раз: далі кожна дія гравця відновлює контекст, якщо той зупинився (на iOS — після дзвінка). */
  start(): void {
    const wake = (): void => this.wake();
    for (const type of GESTURES) window.addEventListener(type, wake, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.context?.suspend();
      else void this.context?.resume();
    });
  }

  /** Контекст знову звучить: його годинник стояв, тож радіо має наздогнати трансляцію, а звуки — довантажитись. */
  onRunning(listener: () => void): void {
    this.listeners.push(listener);
  }

  private wake(): void {
    if (document.visibilityState === "hidden") return;
    if (this.context === null) this.create();
    const context = this.context;
    if (context && context.state !== "running") void context.resume().then(() => this.sync());
  }

  private create(): void {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const bus = (): GainNode => {
      const gain = context.createGain();
      gain.connect(context.destination);
      return gain;
    };
    const world = context.createGain();
    world.connect(farTone(context)).connect(context.destination);
    context.addEventListener("statechange", () => this.sync());
    this.context = context;
    this.buses = { music: bus(), world, ui: bus() };
    this.sync();
  }

  /** Браузери по-різному повідомляють про запуск, тож перехід рахуємо самі: слухачі спрацьовують один раз на кожен запуск. */
  private sync(): void {
    const running = this.context?.state === "running";
    if (running && !this.running) for (const listener of this.listeners) listener();
    this.running = running;
  }
}

/**
 * Гучність шини з повзунка — плавно (`VOLUME_GLIDE`). `smooth: false` — щойно звук запустився: шина починає з повної, і
 * ковзання від неї дало б першому звуку гучність, вищу за повзунок (вимкненим звукам — чутну).
 */
export function glide(param: AudioParam, value: number, context: BaseAudioContext, smooth = true): void {
  if (smooth) param.setTargetAtTime(value, context.currentTime, VOLUME_GLIDE);
  else {
    param.cancelScheduledValues(context.currentTime);
    param.value = value;
  }
}

/**
 * Коли семпл контексту на мить `time` (с) буде чути, мс `performance.now()`: з урахуванням затримки виходу. Під це підлаштовує
 * рух те, що йде в такт звуку (стрічка титрів, §4.2). Без `getOutputTimestamp` (старі Safari) — із затримки, яку каже контекст.
 */
export function heardAt(context: AudioContext, time: number): number {
  const stamp = typeof context.getOutputTimestamp === "function" ? context.getOutputTimestamp() : null;
  if (stamp?.performanceTime && stamp.contextTime !== undefined) return stamp.performanceTime + (time - stamp.contextTime) * 1000;
  return performance.now() + (time - context.currentTime + (context.outputLatency || context.baseLatency || 0)) * 1000;
}

/** Приглушені верхи шини світу (§11.4а): квартира звучить здалеку, а не над вухом. Той самий фільтр — у каталозі звуків. */
export function farTone(context: BaseAudioContext): BiquadFilterNode {
  const shelf = context.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = SFX.worldShelfHz;
  shelf.gain.value = SFX.worldShelfDb;
  return shelf;
}
