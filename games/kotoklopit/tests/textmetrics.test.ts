// Метрики шрифту написів Phaser (`src/view/textmetrics.ts`): шрифт міряють раз, а не для кожного напису; метрики, зняті до
// завантаження вебшрифту, не запам'ятовуються.

import { describe, expect, it } from "vitest";

import { fontString, MetricsCache, textMetrics, withMetrics, type FontMetrics } from "../src/view/textmetrics";

const metrics = (ascent: number): FontMetrics => ({ ascent, descent: 4, fontSize: ascent + 4 });

describe("метрики шрифту написів", () => {
  it("рядок шрифту — як у Phaser: накреслення, розмір, родина", () => {
    expect(fontString({ fontFamily: "system-ui, sans-serif", fontSize: "19px", fontStyle: "bold" })).toBe("bold 19px system-ui, sans-serif");
    expect(fontString({ fontFamily: "system-ui, sans-serif", fontSize: "19px" })).toBe("19px system-ui, sans-serif");
    // Число — пікселі.
    expect(fontString({ fontFamily: "Caveat", fontSize: 24, fontStyle: "600" })).toBe("600 24px Caveat");
  });

  it("той самий шрифт міряють раз, інший розмір чи накреслення — окремо", () => {
    const measured: string[] = [];
    const cache = new MetricsCache(
      (font) => {
        measured.push(font);
        return metrics(measured.length);
      },
      () => true,
    );
    expect(cache.get("bold 19px a")).toEqual(metrics(1));
    expect(cache.get("bold 19px a")).toEqual(metrics(1));
    expect(cache.get("bold 20px a")).toEqual(metrics(2));
    expect(cache.get("19px a")).toEqual(metrics(3));
    expect(cache.get("bold 20px a")).toEqual(metrics(2));
    expect(measured).toEqual(["bold 19px a", "bold 20px a", "19px a"]);
  });

  it("шрифт ще не завантажено — метрики віддаються, але не запам'ятовуються; завантажився — міряють наново й запам'ятовують", () => {
    let loaded = false;
    let calls = 0;
    const cache = new MetricsCache(
      () => {
        calls++;
        return metrics(loaded ? 20 : 10);
      },
      () => loaded,
    );
    expect(cache.get("600 19px Caveat")).toEqual(metrics(10));
    expect(cache.get("600 19px Caveat")).toEqual(metrics(10));
    expect(calls).toBe(2);
    loaded = true;
    expect(cache.get("600 19px Caveat")).toEqual(metrics(20));
    expect(cache.get("600 19px Caveat")).toEqual(metrics(20));
    expect(calls).toBe(3);
  });

  it("виміряти не вдалося — метрик немає (Phaser міряє сам), і це не запам'ятовується", () => {
    let fail = true;
    const cache = new MetricsCache(
      () => (fail ? null : metrics(7)),
      () => true,
    );
    expect(cache.get("19px a")).toBeUndefined();
    fail = false;
    expect(cache.get("19px a")).toEqual(metrics(7));
  });

  it("без браузера (Node) стиль лишається без метрик", () => {
    const style = { fontFamily: "system-ui, sans-serif", fontSize: "19px", color: "#fff" };
    expect(textMetrics(style)).toBeUndefined();
    expect(withMetrics(style)).toEqual(style);
    expect("metrics" in withMetrics(style)).toBe(false);
  });
});
