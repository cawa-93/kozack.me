// Шкали показників на панелі (§6, §8.4): заливка й штрихування над межею — в одиницях панелі, але до цілих px полотна, і панель
// перемальовує шкали лише тоді, коли змінилося те, що видно (`barsKey`): ширина в цілих px, блимання, межа. Показник, що плавно
// спадає, не перемальовує шкал щокадру. Без Phaser.

import { describe, expect, it } from "vitest";

import { barDraw, barsKey } from "../src/view/hudbars";

describe("шкали панелі — за ключем (§8.4)", () => {
  // Шкала 150 одиниць панелі, 2 px полотна на одиницю.
  const width = 150;
  const ui = 2;

  it("заливка — частка ширини, до цілого px полотна", () => {
    expect(barDraw(width, 50, 100, false, ui).fill).toBe(75);
    // 75,15 одиниці = 150,3 px → 150 px; 75,6 одиниці = 151,2 px → 151 px.
    expect(barDraw(width, 50.1, 100, false, ui).fill).toBe(75);
    expect(barDraw(width, 50.4, 100, false, ui).fill).toBe(75.5);
    expect(barDraw(width, 0, 100, false, ui).fill).toBe(0);
    expect(barDraw(width, 100, 100, false, ui).fill).toBe(width);
    expect(barDraw(width, -3, 100, false, ui).fill).toBe(0);
  });

  it("штрихування — лише під межею нижче 100, з того самого цілого px", () => {
    expect(barDraw(width, 40, 100, false, ui).hatch).toBeNull();
    expect(barDraw(width, 40, 80, false, ui).hatch).toBe(120);
    expect(barDraw(width, 40, 80.1, false, ui).hatch).toBe(120);
  });

  it("ключ: той самий видимий стан — той самий ключ; ширина в цілих px, блимання й межа — інший", () => {
    const shown = [barDraw(width, 50, 100, false, ui), barDraw(width, 70, 90, false, ui)];
    const key = barsKey(shown);
    expect(barsKey([barDraw(width, 50.1, 100, false, ui), barDraw(width, 70.05, 90, false, ui)])).toBe(key);
    expect(barsKey([barDraw(width, 50.4, 100, false, ui), shown[1]!])).not.toBe(key);
    expect(barsKey([barDraw(width, 50, 100, true, ui), shown[1]!])).not.toBe(key);
    expect(barsKey([shown[0]!, barDraw(width, 70, 100, false, ui)])).not.toBe(key);
    expect(barsKey([shown[0]!, barDraw(width, 70, 80, false, ui)])).not.toBe(key);
    // Порядок шкал — теж: інша шкала з тим самим станом — інше на екрані.
    expect(barsKey([shown[1]!, shown[0]!])).not.toBe(key);
  });
});
