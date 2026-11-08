// Анімація аварії (§8.5, рішення автора 2026-11-02: «аварію показано, як засинання: камера наїжджає на машину й екран темніє — а
// тоді картка аварії»; `src/view/racecrash.ts`): час, наїзд камери на свою машину й темніння до чорного — без Phaser.

import { describe, expect, it } from "vitest";

import { RACE_PLAYER_Y } from "../src/view/racelook";
import { CRASH_FX, crashView } from "../src/view/racecrash";

/** Кадр гонки 1280 × 720 і телефона набік (вищий кадр), своя машина — у середній, лівій і правій смугах. */
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1558, height: 720 },
  { width: 1280, height: 960 },
];
const focuses = (size: { width: number; height: number }): { x: number; y: number }[] =>
  [-96, 0, 96].map((dx) => ({ x: size.width / 2 + (dx * size.height) / 720, y: size.height * RACE_PLAYER_Y }));

/** Де точка кадру `p` на екрані (одиниці кадру) за кадром анімації. */
const onScreen = (view: ReturnType<typeof crashView>, p: { x: number; y: number }): { x: number; y: number } => ({
  x: (p.x - view.scroll.x) * view.zoom,
  y: (p.y - view.scroll.y) * view.zoom,
});

describe("анімація аварії: час", () => {
  it("коротка, як засинання (наїзд, потім темрява), але коротша за його 2,3 с; спершу наїзд, темрява — пізніше", () => {
    expect(CRASH_FX.total).toBeGreaterThanOrEqual(1200);
    expect(CRASH_FX.total).toBeLessThan(2300);
    expect(CRASH_FX.zoomMs).toBeLessThanOrEqual(CRASH_FX.total);
    expect(CRASH_FX.darkFrom).toBeGreaterThan(0);
    expect(CRASH_FX.darkFrom).toBeLessThan(CRASH_FX.total);
    expect(CRASH_FX.shakeMs).toBeLessThan(CRASH_FX.darkFrom);
  });

  it("скінчилася рівно в `total`, не раніше; і далі — скінчилася", () => {
    const size = SIZES[0]!;
    const focus = focuses(size)[1]!;
    expect(crashView(0, focus, size).done).toBe(false);
    expect(crashView(CRASH_FX.total - 1, focus, size).done).toBe(false);
    expect(crashView(CRASH_FX.total, focus, size).done).toBe(true);
    expect(crashView(CRASH_FX.total * 3, focus, size).done).toBe(true);
  });
});

describe("анімація аварії: наїзд камери", () => {
  it("на початку — звичайний кадр гонки: без наїзду й без прокрутки, і для від'ємного часу", () => {
    for (const size of SIZES) {
      for (const focus of focuses(size)) {
        for (const ms of [-50, 0]) {
          const view = crashView(ms, focus, size);
          expect(view.zoom).toBe(1);
          expect(view.scroll.x).toBeCloseTo(0);
          expect(view.scroll.y).toBeCloseTo(0);
        }
      }
    }
  });

  it("масштаб плавно більшає до 1 + zoom за `zoomMs` і далі стоїть", () => {
    const size = SIZES[0]!;
    const focus = focuses(size)[1]!;
    let previous = 0;
    for (let ms = 0; ms <= CRASH_FX.total; ms += 50) {
      const { zoom } = crashView(ms, focus, size);
      expect(zoom).toBeGreaterThanOrEqual(previous);
      previous = zoom;
    }
    expect(crashView(CRASH_FX.zoomMs, focus, size).zoom).toBeCloseTo(1 + CRASH_FX.zoom);
    expect(crashView(CRASH_FX.total, focus, size).zoom).toBeCloseTo(1 + CRASH_FX.zoom);
    expect(CRASH_FX.zoom).toBeGreaterThanOrEqual(0.5);
    // Плавно: перші й останні 10% наїзду — менше за рівномірний рух.
    const at = (t: number): number => (crashView(CRASH_FX.zoomMs * t, focus, size).zoom - 1) / CRASH_FX.zoom;
    expect(at(0.1)).toBeLessThan(0.1);
    expect(at(0.9)).toBeGreaterThan(0.9);
  });

  it("наїжджає на свою машину: вона весь час у кадрі й наприкінці ближча до середини, ніж була", () => {
    for (const size of SIZES) {
      for (const focus of focuses(size)) {
        const center = { x: size.width / 2, y: size.height / 2 };
        const start = onScreen(crashView(0, focus, size), focus);
        expect(start.x).toBeCloseTo(focus.x);
        expect(start.y).toBeCloseTo(focus.y);
        for (let ms = 0; ms <= CRASH_FX.total; ms += 100) {
          const p = onScreen(crashView(ms, focus, size), focus);
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(size.width);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(size.height);
        }
        const end = onScreen(crashView(CRASH_FX.total, focus, size), focus);
        expect(Math.hypot(end.x - center.x, end.y - center.y)).toBeLessThan(Math.hypot(start.x - center.x, start.y - center.y));
      }
    }
  });

  it("камера не заглядає за край кадру: видно лише намальовану дорогу", () => {
    for (const size of SIZES) {
      for (const focus of [...focuses(size), { x: 0, y: 0 }, { x: size.width, y: size.height }]) {
        for (let ms = 0; ms <= CRASH_FX.total; ms += 100) {
          const view = crashView(ms, focus, size);
          expect(view.scroll.x).toBeGreaterThanOrEqual(-1e-9);
          expect(view.scroll.y).toBeGreaterThanOrEqual(-1e-9);
          expect(view.scroll.x + size.width / view.zoom).toBeLessThanOrEqual(size.width + 1e-9);
          expect(view.scroll.y + size.height / view.zoom).toBeLessThanOrEqual(size.height + 1e-9);
        }
      }
    }
  });
});

describe("анімація аварії: темніння", () => {
  it("до `darkFrom` темряви немає, далі вона рівно густішає до чорного в `total`", () => {
    const size = SIZES[0]!;
    const focus = focuses(size)[1]!;
    expect(crashView(0, focus, size).dark).toBe(0);
    expect(crashView(CRASH_FX.darkFrom, focus, size).dark).toBe(0);
    const middle = crashView((CRASH_FX.darkFrom + CRASH_FX.total) / 2, focus, size).dark;
    expect(middle).toBeCloseTo(0.5);
    expect(crashView(CRASH_FX.total, focus, size).dark).toBe(1);
    expect(crashView(CRASH_FX.total + 500, focus, size).dark).toBe(1);
    let previous = 0;
    for (let ms = 0; ms <= CRASH_FX.total; ms += 25) {
      const { dark } = crashView(ms, focus, size);
      expect(dark).toBeGreaterThanOrEqual(previous);
      previous = dark;
    }
  });

  it("коли анімація скінчилася, екран чорний: картка аварії — на чорному", () => {
    const size = SIZES[0]!;
    for (const ms of [CRASH_FX.total, CRASH_FX.total + 16]) {
      const view = crashView(ms, focuses(size)[0]!, size);
      expect(view.done).toBe(true);
      expect(view.dark).toBe(1);
    }
  });
});
