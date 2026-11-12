// Частота кадрів (§2.1 «Малювання й завантаження»): гра малює не частіше 60 кадрів на секунду, і на екрані з більшою частотою
// теж — телефон зі 120 Гц інакше рахує й малює вдвічі більше.
//
// Обмеження самого Phaser (`fps.limit`, `TimeStep.stepLimitFPS`) не годиться: кадр без жодного допуску — позначки часу кадрів
// браузера тремтять, і кадр екрана 60 Гц, що прийшов на 16,5 мс, воно пропускало б (до 30 кадрів на секунду), а крокові гри
// віддає накопичений час разом із залишком — гра йшла б швидше за годинник.

import type Phaser from "phaser";

/** Найкоротший крок між намальованими кадрами, мс: 60 кадрів на секунду (§2.1). */
export const FRAME_MS = 1000 / 60;
/**
 * На скільки мс раніше за `FRAME_MS` кадр ще малюється: позначки часу кадрів тремтять (і округлюються до 1 мс), а кадр
 * 120 Гц (8,3 мс) мусить лишитися пропущеним, тож допуск — посередині між ними: тремтіння до ±1,6 мс.
 */
const EARLY_MS = 5;
/**
 * Скільки мс запізнення переходить на наступний кадр: на 90 Гц кадри стають 2 з 3, а не 1 з 2 (60 на секунду, а не 45); більше
 * — після довгого кадру екран 120 Гц малював би кадри поспіль, надолужуючи.
 */
const LATE_MS = 2;
/**
 * Екран, чий кадр не коротший за `FRAME_MS` мінус стільки мс (до ≈ 62,6 Гц), — «60 Гц»: на ньому малюється кожен кадр. Інакше
 * екран 60,5 Гц пропускав би кадр раз на дві секунди, а знімки гри (кадри рівно по 16 мс) — кожен десятий.
 */
const SAME_RATE_MS = 0.7;
/** Частка нового кадру в середньому кроці екрана: середнє ≈ 10 кадрів, як згладжування кроку в Phaser. */
const PERIOD_EMA = 0.1;

/** Чи малювати кадр браузера (`frame`): чиста логіка обмеження, без Phaser. */
export class FrameLimiter {
  private last: number | null = null;
  /** Час, накопичений з останнього намальованого кадру, мінус `FRAME_MS` на кожен намальований, мс. */
  private owed = 0;
  /** Середній крок кадрів екрана, мс. */
  private period = FRAME_MS;

  /** Кадр браузера з позначкою часу `time` (мс, як у requestAnimationFrame): чи малювати його. */
  frame(time: number): boolean {
    const last = this.last;
    this.last = time;
    if (last === null) return true;
    const step = Math.max(0, time - last);
    // Довгий кадр (запинка, вкладка у фоні) про частоту екрана нічого не каже.
    if (step < 2 * FRAME_MS) this.period += (step - this.period) * PERIOD_EMA;
    if (this.period >= FRAME_MS - SAME_RATE_MS) {
      this.owed = 0;
      return true;
    }
    this.owed += step;
    if (this.owed < FRAME_MS - EARLY_MS) return false;
    this.owed = Math.min(LATE_MS, this.owed - FRAME_MS);
    return true;
  }
}

/**
 * Обмежити кадри гри (`callbacks.postBoot` конфігу Phaser: далі Phaser запускає цикл кадрів із `game.step`). Пропущений кадр не
 * кличе кроку гри зовсім, а його час іде наступному: і в аргумент кроку, і в `game.loop.delta`.
 */
export function limitFrames(game: Phaser.Game): void {
  const step = game.step.bind(game);
  const limiter = new FrameLimiter();
  let skipped = 0;
  game.step = (time: number, delta: number): void => {
    if (!limiter.frame(time)) {
      skipped += delta;
      return;
    }
    const total = skipped + delta;
    skipped = 0;
    game.loop.delta = total;
    step(time, total);
  };
}
