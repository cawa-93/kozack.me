import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { TRAIT_GROUPS } from "../src/sim/traits";
import { endingText, fill, KITTEN_MESSAGE, POSITION_TITLES, TRAIT_ABOUT } from "../src/texts";

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

describe("опис рис для картки кота (§9.9)", () => {
  it("у кожної групи є опис для «+» і для «−», без незаповнених форм", () => {
    for (const group of TRAIT_GROUPS) {
      const about = TRAIT_ABOUT[group.id];
      expect(about, group.id).toBeDefined();
      for (const text of about ?? []) {
        for (const sex of ["male", "female"] as const) {
          const filled = fill(text, sex);
          expect(filled.length, group.id).toBeGreaterThan(5);
          expect(filled, group.id).not.toMatch(/[[\]|]/);
        }
      }
    }
  });

  it("опис і підказки про кішку — у жіночому роді: без «сам» і «голодним» (перевірка 2026-10-25: «Образливість +» казала «сам не приходить», «Злодійство −» — «навіть голодним»)", () => {
    const masculine = /(^|[^а-яіїєґ'])(сам|голодним)(?![а-яіїєґ'])/iu;
    for (const group of TRAIT_GROUPS) {
      const texts: (string | null)[] = [...(TRAIT_ABOUT[group.id] ?? []), ...(group.signs ?? [])];
      for (const text of texts) if (text !== null) expect(fill(text, "female"), group.id).not.toMatch(masculine);
    }
  });
});
