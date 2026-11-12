// Частота кадрів (§2.1 «Малювання й завантаження»): гра малює не частіше 60 кадрів на секунду, і на екрані з більшою частотою
// теж. Позначки часу кадрів браузера тремтять: кадр екрана 60 Гц, що прийшов на 16,5 мс, а не на 16,67, — однаково кадр, і гра
// не має падати до 30 кадрів на секунду; на 120 Гц — рівно кожен другий кадр. Без Phaser.

import type Phaser from "phaser";
import { describe, expect, it } from "vitest";

import { FrameLimiter, limitFrames } from "../src/framerate";

/** Сталі псевдовипадкові числа 0–1 (mulberry32): тремтіння позначок часу однакове від прогону до прогону. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Run {
  /** Чи малювали кожен кадр екрана (після розгону). */
  drawn: boolean[];
  /** Скільки кадрів на секунду намальовано (після розгону). */
  fps: number;
}

/**
 * Кадри екрана `hz` протягом `seconds` с: позначка кожного — на сітці екрана плюс тремтіння до ±`jitter` мс (як у справжніх
 * позначок rAF, що не накопичують похибки); `round` — ще й округлені до 1 мс (браузери, що загрублюють час). Перша секунда —
 * розгін, у підсумок не входить.
 */
function run(hz: number, { jitter = 0, round = false, seconds = 20, seed = 1 } = {}): Run {
  const limiter = new FrameLimiter();
  const noise = random(seed);
  const period = 1000 / hz;
  const drawn: boolean[] = [];
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) {
    let time = 5000 + i * period + (noise() * 2 - 1) * jitter;
    if (round) time = Math.round(time);
    const draw = limiter.frame(time);
    if (i >= hz) drawn.push(draw);
  }
  return { drawn, fps: drawn.filter(Boolean).length / (seconds - 1) };
}

/** Найдовша серія намальованих кадрів поспіль і найдовша серія пропущених. */
function streaks(drawn: readonly boolean[]): { drawn: number; skipped: number } {
  let best = { drawn: 0, skipped: 0 };
  let run = 0;
  let last: boolean | null = null;
  for (const d of drawn) {
    run = d === last ? run + 1 : 1;
    last = d;
    if (d) best = { ...best, drawn: Math.max(best.drawn, run) };
    else best = { ...best, skipped: Math.max(best.skipped, run) };
  }
  return best;
}

describe("частота кадрів: не частіше 60 на секунду (§2.1)", () => {
  it("перший кадр малюється одразу", () => {
    expect(new FrameLimiter().frame(123.4)).toBe(true);
  });

  it("екран 60 Гц: малюється кожен кадр, і той, що прийшов на 16,5 мс, — теж", () => {
    const limiter = new FrameLimiter();
    let time = 1000;
    expect(limiter.frame(time)).toBe(true);
    for (let i = 0; i < 120; i++) {
      time += i % 2 === 0 ? 16.5 : 16.84;
      expect(limiter.frame(time), `кадр ${i}`).toBe(true);
    }
    for (const seed of [1, 2, 3]) {
      for (const jitter of [0, 0.5, 1, 1.5]) expect(run(60, { jitter, seed }).drawn.every(Boolean), `±${jitter} мс`).toBe(true);
      expect(run(60, { jitter: 0.5, round: true, seed }).drawn.every(Boolean), "округлені до 1 мс").toBe(true);
    }
  });

  it("екрани «60 Гц», що трохи швидші чи повільніші, і кадри по 16 мс (знімки гри) — теж кожен кадр, без запинок", () => {
    for (const hz of [59.94, 60.05, 60.5]) expect(run(hz, { jitter: 1 }).drawn.every(Boolean), `${hz} Гц`).toBe(true);
    // Скрипт знімків дає кадри рівно через 16 мс (62,5 Гц): пропуск кадру змінив би знімки.
    expect(run(62.5).drawn.every(Boolean)).toBe(true);
  });

  it("екран 120 Гц: рівно кожен другий кадр, і з тремтінням", () => {
    for (const [jitter, round] of [[0, false], [1, false], [0.5, true]] as const) {
      for (const seed of [1, 2, 3]) {
        const { drawn } = run(120, { jitter, round, seed });
        const where = `±${jitter} мс${round ? ", округлені" : ""}, зерно ${seed}`;
        expect(drawn.slice(1).every((d, i) => d !== drawn[i]), where).toBe(true);
      }
    }
    expect(run(119.88, { jitter: 1 }).fps).toBeCloseTo(59.94, 1);
  });

  it("екрани 90 і 144 Гц (і швидші): не більше 60 кадрів на секунду, але й не набагато менше; двох кадрів поспіль немає", () => {
    for (const hz of [90, 144, 165, 240]) {
      for (const seed of [1, 2, 3]) {
        const result = run(hz, { jitter: 1, seed });
        expect(result.fps, `${hz} Гц`).toBeLessThanOrEqual(60);
        expect(result.fps, `${hz} Гц`).toBeGreaterThan(56);
        if (hz > 120) expect(streaks(result.drawn).drawn, `${hz} Гц`).toBe(1);
      }
    }
    // 90 Гц: два кадри з трьох — 60 на секунду, а не 45.
    expect(run(90).fps).toBeGreaterThan(58);
  });

  it("після довгого кадру (вкладка у фоні, запинка) — без надолужування: на 120 Гц далі знову кожен другий", () => {
    const limiter = new FrameLimiter();
    const period = 1000 / 120;
    let time = 1000;
    for (let i = 0; i < 240; i++) limiter.frame((time += period));
    expect(limiter.frame((time += 250))).toBe(true);
    const after = Array.from({ length: 60 }, () => limiter.frame((time += period)));
    expect(after.slice(1).every((d, i) => d !== after[i])).toBe(true);
  });

  it("повільний екран (30, 50 Гц) — кожен кадр", () => {
    for (const hz of [30, 50]) expect(run(hz, { jitter: 1 }).drawn.every(Boolean), `${hz} Гц`).toBe(true);
  });
});

describe("частота кадрів у грі (`limitFrames`)", () => {
  /** Гра, як її бачить обмеження: крок кадру й цикл кадрів Phaser (`loop.delta`). */
  function fakeGame(): { game: Phaser.Game; steps: { time: number; delta: number; loop: number }[] } {
    const steps: { time: number; delta: number; loop: number }[] = [];
    const loop = { delta: 0 };
    const game = {
      loop,
      step(time: number, delta: number): void {
        steps.push({ time, delta, loop: loop.delta });
      },
    };
    return { game: game as unknown as Phaser.Game, steps };
  }

  it("пропущений кадр не губить часу: наступний крок гри отримує час обох, і `game.loop.delta` — той самий", () => {
    const { game, steps } = fakeGame();
    limitFrames(game);
    const period = 1000 / 120;
    for (let i = 0; i < 40; i++) {
      game.loop.delta = period;
      game.step(1000 + i * period, period);
    }
    // Перший кадр — одразу; далі кожен другий, з часом двох кадрів екрана.
    const steady = steps.slice(-10);
    expect(steady).toHaveLength(10);
    for (const step of steady) {
      expect(step.delta).toBeCloseTo(2 * period, 6);
      expect(step.loop).toBeCloseTo(2 * period, 6);
    }
    const total = steps.reduce((sum, step) => sum + step.delta, 0);
    expect(total).toBeGreaterThan(39 * period - 1e-6);
    expect(total).toBeLessThanOrEqual(40 * period + 1e-6);
  });

  it("на 60 Гц кожен крок гри — як без обмеження: той самий час кадру", () => {
    const { game, steps } = fakeGame();
    limitFrames(game);
    const deltas = [16, 16.7, 16.5, 16.9, 16.6];
    let time = 1000;
    for (const delta of deltas) {
      game.loop.delta = delta;
      game.step((time += delta), delta);
    }
    expect(steps.map((step) => step.delta)).toEqual(deltas);
    expect(steps.map((step) => step.loop)).toEqual(deltas);
  });
});
