// Гудіння мотора в поїздці (§8.5): дві петлі одного запису — холості й високі оберти, — які веде сцена гонки сама (день у
// поїздці спить). Щокадру оберти йдуть за швидкістю машини: шари переходять один в один, кожен грає з висотою, що дає ці
// оберти, — тож розгін звучить наростанням, а гальмування спадом. Гучність — тихіше на паузі й у темряві катсцени. Мотор
// вимкнено — петлі згасають.

import { RACE } from "../../../sim/config";
import type { SceneLoop } from "../sounds";

/**
 * Висота шарів у записі (`trip/sources.json`): холості `idleHz`, високі оберти `highHz`. На місці мотор на холостих, на
 * `RACE.maxSpeed` — на високих. На виїзді й дорогою додому гудіння починається за `startDelayMs` — після звуку запуску
 * (`trip`, `engine-start`).
 */
export const ENGINE = { idleHz: 46.5, highHz: 141, startDelayMs: 1200 } as const;

/** Оберти на швидкості `speed` гонки — у разах від холостих: 1 на місці, `highHz / idleHz` на `RACE.maxSpeed` і вище. */
export function engineRate(speed: number): number {
  const load = Math.min(1, Math.max(0, speed) / RACE.maxSpeed);
  return 1 + load * (ENGINE.highHz / ENGINE.idleHz - 1);
}

/** Частка високих обертів у суміші (0 — самі холості, 1 — самі високі) для обертів `rate` (`engineRate`). */
export function engineMix(rate: number): number {
  return Math.min(1, Math.max(0, (rate - 1) / (ENGINE.highHz / ENGINE.idleHz - 1)));
}

export class EngineHum {
  private idle: SceneLoop | null = null;
  private high: SceneLoop | null = null;

  /** `open` вмикає петлю шару; поки звуку немає (аудіо ще не запущено), повертає null — тоді спробуємо наступного кадру. */
  constructor(private readonly open: (sound: "engine" | "engine-high") => SceneLoop | null) {}

  /** Кадр: мотор на обертах `rate` (`engineRate`) з гучністю `gain` (множник звуку). Шари — за рівною потужністю. */
  run(rate: number, gain: number): void {
    this.idle ??= this.open("engine");
    this.high ??= this.open("engine-high");
    const angle = (engineMix(rate) * Math.PI) / 2;
    this.idle?.set(gain * Math.cos(angle), rate);
    this.high?.set(gain * Math.sin(angle), (rate * ENGINE.idleHz) / ENGINE.highHz);
  }

  /** Мотор заглушили (чи сцени вже немає): петлі згасають. */
  stop(): void {
    this.idle?.stop();
    this.high?.stop();
    this.idle = null;
    this.high = null;
  }
}
