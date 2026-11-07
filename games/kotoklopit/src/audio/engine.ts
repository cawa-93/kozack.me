// Єдиний AudioContext гри (§8.10, §11.4а). Він окремо від Phaser, бо звук потрібен і карткам (DOM); Phaser запущено з `noAudio`.

import { SAMPLE_RATE } from "./config";

/** Браузер дозволяє звук лише після дії гравця; `fullscreenOnFirstAction` для цього не годиться: на iPhone він одразу виходить. */
const GESTURES = ["pointerup", "keydown", "touchend"] as const;

/** Шини: музика радіо, звуки світу, інтерфейс. Кожна — свій GainNode просто до виходу. */
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
    context.addEventListener("statechange", () => this.sync());
    this.context = context;
    this.buses = { music: bus(), world: bus(), ui: bus() };
    this.sync();
  }

  /** Браузери по-різному повідомляють про запуск, тож перехід рахуємо самі: слухачі спрацьовують один раз на кожен запуск. */
  private sync(): void {
    const running = this.context?.state === "running";
    if (running && !this.running) for (const listener of this.listeners) listener();
    this.running = running;
  }
}
