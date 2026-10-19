import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { endingText, fill, KITTEN_MESSAGE, POSITION_TITLES } from "../src/texts";

describe("тексти (TEXTS.md)", () => {
  it("підставляє значення й обирає форму за статтю", () => {
    expect(fill("{персонаж} [зробив|зробила]", "female", { персонаж: "Марта" })).toBe("Марта зробила");
    expect(fill("{персонаж} [зробив|зробила]", "male", { персонаж: "Тарас" })).toBe("Тарас зробив");
    expect(fill("[Він|Вона] {невідоме}", "male")).toBe("Він {невідоме}");
  });

  it("у текстах не лишається незаповнених місць", () => {
    const text = fill(KITTEN_MESSAGE, "female", { персонаж: "Марта", кошеня: "Мурка" });
    expect(text).not.toMatch(/[{}[\]|]/);
    expect(text).toContain("поїхала");
    expect(fill(POSITION_TITLES[0] ?? "", "female")).toBe("Стажерка");
  });

  it("екран кінця гри для кожної причини; пенсія стажера без котів — «Тихе життя» (§4.2)", () => {
    const state = newGame({ sex: "male", difficulty: "normal", seed: 1 }).current;
    for (const end of ["health", "satiety", "hygiene", "sanity", "eviction"] as const) {
      const { title, text } = endingText(state, end);
      expect(title).toBeTruthy();
      expect(text).not.toMatch(/[{}[\]|]/);
    }
    expect(endingText(state, "retirement").title).toBe("Тихе життя");
    state.job.position = 9;
    expect(endingText(state, "retirement").title).toBe("Кар'єрист");
  });
});
