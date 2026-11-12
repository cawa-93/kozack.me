// Сторож завантаження (§2.1 «Малювання й завантаження»): атлас, що довго не приносить жодного байта (мережа зависла, запит не дає
// ні відповіді, ні помилки), вважається таким, що не завантажився, — гра показує «Спробувати ще», а не смугу, що стоїть вічно.
// Повільна, але жива лінія не обривається: кожен байт продовжує чекання. Час — підставний. Без Phaser.

import { describe, expect, it, vi } from "vitest";

import { cancelLoading, LOAD_STALL_MS, LoadWatchdog, type LoadingFile } from "../src/scenes/loadwatch";

describe("сторож завантаження (§2.1)", () => {
  it("без жодного байта ≈ 20 с — зависло", () => {
    expect(LOAD_STALL_MS).toBe(20_000);
    const watch = new LoadWatchdog(1000);
    expect(watch.stalled(1000 + LOAD_STALL_MS - 1)).toBe(false);
    expect(watch.stalled(1000 + LOAD_STALL_MS)).toBe(true);
  });

  it("повільна, але жива лінія: байти раз на 15 с — не обривається хоч п'ять хвилин", () => {
    const watch = new LoadWatchdog(0);
    for (let now = 0; now <= 5 * 60_000; now += 1000) {
      if (now % 15_000 === 0) watch.alive(now);
      expect(watch.stalled(now), `${now} мс`).toBe(false);
    }
    // Байти перестали йти — через 20 с від останнього зависло.
    expect(watch.stalled(5 * 60_000 + LOAD_STALL_MS)).toBe(true);
  });

  it("запізніла позначка часу чекання не вкорочує", () => {
    const watch = new LoadWatchdog(0);
    watch.alive(10_000);
    watch.alive(5000);
    expect(watch.stalled(10_000 + LOAD_STALL_MS - 1)).toBe(false);
  });

  it("зависле скасовується як помилка без повторів: файли, що качаються, — так, решта — ні", () => {
    const LOADING = 11;
    const order: string[] = [];
    const files = new Set<LoadingFile>();
    const file = (name: string, state: number): LoadingFile => ({
      state,
      retryAttempts: 2,
      xhrLoader: { abort: () => order.push(`${name}: abort`) },
      onError(this: LoadingFile) {
        order.push(`${name}: error, повторів ${this.retryAttempts}`);
        // Завантажувач прибирає файл із тих, що качаються, просто під час обходу.
        files.delete(this);
      },
    });
    files.add(file("index.json", LOADING));
    files.add(file("page-1", 20));
    files.add(file("page-2", LOADING));
    const noXhr = file("page-3", LOADING);
    noXhr.xhrLoader = null;
    files.add(noXhr);
    expect(cancelLoading(files, LOADING)).toBe(3);
    expect(order).toEqual(["index.json: abort", "index.json: error, повторів 0", "page-2: abort", "page-2: error, повторів 0", "page-3: error, повторів 0"]);
    expect([...files].map((f) => f.state)).toEqual([20]);
    const idle = vi.fn();
    expect(cancelLoading([{ state: 20, retryAttempts: 1, xhrLoader: null, onError: idle }], LOADING)).toBe(0);
    expect(idle).not.toHaveBeenCalled();
  });
});
