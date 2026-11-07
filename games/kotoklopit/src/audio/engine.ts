// Єдиний AudioContext гри (§8.10). Він окремо від Phaser, бо звук потрібен і карткам (DOM); Phaser запущено з `noAudio`.

import { SAMPLE_RATE } from "./config";

/** Браузер дозволяє звук лише після дії гравця; `fullscreenOnFirstAction` для цього не годиться: на iPhone він одразу виходить. */
const GESTURES = ["pointerup", "keydown", "touchend"] as const;

export class AudioEngine {
  context: AudioContext | null = null;
  /** Шина музики; поруч згодом стануть шини ефектів, ембієнту й інтерфейсу. */
  music: GainNode | null = null;
  private listener: (() => void) | null = null;
  private running = false;

  /** Викликати один раз: далі кожна дія гравця відновлює контекст, якщо той зупинився (на iOS — після дзвінка). */
  start(): void {
    const wake = (): void => this.wake();
    for (const type of GESTURES) window.addEventListener(type, wake, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.context?.suspend();
      else void this.context?.resume();
    });
  }

  /** Контекст знову звучить: його годинник стояв, тож радіо має наздогнати трансляцію. */
  onRunning(listener: () => void): void {
    this.listener = listener;
  }

  private wake(): void {
    if (document.visibilityState === "hidden") return;
    if (this.context === null) this.create();
    const context = this.context;
    if (context && context.state !== "running") void context.resume().then(() => this.sync());
  }

  private create(): void {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const music = context.createGain();
    music.connect(context.destination);
    context.addEventListener("statechange", () => this.sync());
    this.context = context;
    this.music = music;
    this.sync();
  }

  /** Браузери по-різному повідомляють про запуск, тож перехід рахуємо самі: слухач спрацьовує один раз на кожен запуск. */
  private sync(): void {
    const running = this.context?.state === "running";
    if (running && !this.running) this.listener?.();
    this.running = running;
  }
}
