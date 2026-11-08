// Гудіння мотора в поїздці (§8.5): петля холостих, яку веде сцена гонки сама (день у поїздці спить) — щокадру висота за
// швидкістю машини й гучність (тихіше на паузі й у темряві катсцени). Мотор вимкнено — петля згасає.

import type { SceneLoop } from "../sounds";

/**
 * Висота петлі: холості — `idleRate`, кожна одиниця швидкості гонки додає `perSpeed`, вище за `maxRate` мотор не тягне; на
 * виїзді й дорогою додому гудіння починається за `startDelayMs` — після звуку запуску (`trip`, `engine-start`).
 */
export const ENGINE = { idleRate: 0.85, perSpeed: 0.09, maxRate: 1.8, startDelayMs: 1200 } as const;

/** Висота гудіння на швидкості `speed` гонки. */
export function engineRate(speed: number): number {
  return Math.min(ENGINE.maxRate, ENGINE.idleRate + Math.max(0, speed) * ENGINE.perSpeed);
}

export class EngineHum {
  private loop: SceneLoop | null = null;

  /** `open` вмикає петлю; поки звуку немає (аудіо ще не запущено), повертає null — тоді спробуємо наступного кадру. */
  constructor(private readonly open: () => SceneLoop | null) {}

  /** Кадр: мотор гуде з висотою `rate` і гучністю `gain` (множник звуку). */
  run(rate: number, gain: number): void {
    this.loop ??= this.open();
    this.loop?.set(gain, rate);
  }

  /** Мотор заглушили (чи сцени вже немає): петля згасає. */
  stop(): void {
    this.loop?.stop();
    this.loop = null;
  }
}
