import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { TRAIT_GROUPS } from "../src/sim/traits";
import { BREEDS, MIXED } from "../src/sim/breeds";
import { createCat } from "../src/sim/cat";
import { createRng } from "../src/sim/rng";
import type { Cat } from "../src/sim/types";
import { breedAbout, breedText } from "../src/ui/cards";
import { traitAbout } from "../src/ui/traits";
import { DISEASES } from "../src/sim/config";
import { BREED_ABOUT, BREED_HALF, endingText, fill, homeVetText, KITTEN_MESSAGE, POSITION_TITLES, TRAIT_ABOUT, VET_ADVICE } from "../src/texts";

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

  it("загальна ревізія 2026-10-29: без котів текст кінця гри котів не згадує, з котом — звичайний текст; заголовок «Поповнення в зграї» без котів — свій", () => {
    const state = newGame({ sex: "female", difficulty: "normal", seed: 1 }).current;
    expect(state.cats).toHaveLength(0);
    const ends = ["health", "satiety", "hygiene", "sanity", "eviction"] as const;
    const lonely = ends.map((end) => endingText(state, end));
    for (const [i, { title, text }] of lonely.entries()) {
      expect(text, ends[i]).not.toMatch(/кот|кіт/iu);
      expect(title, ends[i]).not.toMatch(/кот|зграї/iu);
      expect(text, ends[i]).not.toMatch(/[{}[\]|]/);
    }
    expect(lonely[1]?.text).toContain("забула нагодувати себе");
    state.cats.push(createCat(state, createRng(1), { source: "shelter", ageWeeks: 3 }));
    for (const [i, end] of ends.entries()) {
      const { title, text } = endingText(state, end);
      // Заголовок той самий, крім «Поповнення в зграї»: без котів «зграї» немає (загальна ревізія 2026-10-29).
      if (end === "sanity") expect([lonely[i]?.title, title]).toEqual(["Нявкіт без відповіді", "Поповнення в зграї"]);
      else expect(title).toBe(lonely[i]?.title);
      expect(text, end).toMatch(/кот/iu);
    }
    expect(endingText(state, "eviction").text).toContain("Котів забрали до притулку");
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

  it("загальна ревізія 2026-10-29: «Стрункий» і «Не мерзне» (−1) мають свій опис, без «ніколи» рівня −2", () => {
    const about = (group: string, level: -1 | -2): string => traitAbout({ group, level }, "female");
    expect(about("chubby", -2)).toBe("Тримає форму, хоч скільки їсть.");
    expect(about("chubby", -1)).not.toBe(about("chubby", -2));
    expect(about("chubby", -1)).toContain("набирає вагу");
    expect(about("warmth", -2)).toContain("не шукає зовсім");
    expect(about("warmth", -1)).toContain("шукає рідко");
  });

  it("опис і підказки про кішку — у жіночому роді: без «сам» і «голодним» (перевірка 2026-10-25: «Образливість +» казала «сам не приходить», «Злодійство −» — «навіть голодним»)", () => {
    const masculine = /(^|[^а-яіїєґ'])(сам|голодним)(?![а-яіїєґ'])/iu;
    for (const group of TRAIT_GROUPS) {
      const texts: (string | null)[] = [...(TRAIT_ABOUT[group.id] ?? []), ...(group.signs ?? [])];
      for (const text of texts) if (text !== null) expect(fill(text, "female"), group.id).not.toMatch(masculine);
    }
  });
});

describe("опис порід і поради ветеринара (рішення автора 2026-10-28, Д4, Д2)", () => {
  it("загальна ревізія 2026-10-29: у напівкровки перед описом кожної відомої половини — рамка «Наполовину…», у чистокровного й безпородного — ні", () => {
    const state = newGame({ sex: "female", difficulty: "easy", seed: 1 }).current;
    const cat = (breed: [string, string], known: [boolean, boolean]): Cat => {
      const c = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, breed });
      c.breedKnown = known;
      return c;
    };
    expect(breedAbout(cat(["sfinks", MIXED], [true, true]))).toEqual([fill(BREED_HALF, "female", { порода: "сфінкс" }), BREED_ABOUT["sfinks"]]);
    expect(breedAbout(cat(["sfinks", MIXED], [true, true]))[0]).toMatch(/^Наполовину сфінкс:/);
    const two = breedAbout(cat(["siamska", "perska"], [true, true]));
    expect(two).toHaveLength(4);
    expect(two.filter((line) => line.startsWith("Наполовину"))).toHaveLength(2);
    expect(breedAbout(cat(["siamska", "perska"], [false, true]))).toEqual([fill(BREED_HALF, "female", { порода: "перська" }), BREED_ABOUT["perska"]]);
    expect(breedAbout(cat(["sfinks", "sfinks"], [true, true]))).toEqual([BREED_ABOUT["sfinks"]]);
    expect(breedAbout(cat([MIXED, MIXED], [true, true]))).toEqual([BREED_ABOUT[MIXED]]);
    expect(BREED_HALF).not.toMatch(/\d/);
  });

  it("загальна ревізія 2026-10-29: безпородна половина в рядку породи — за статтю кота, як і решта рядка", () => {
    const half: [string, string] = ["brytanska-korotkoshersta", MIXED];
    expect(breedText(half, [true, true], "female")).toBe("британська короткошерста × безпородна");
    expect(breedText(half, [true, true], "male")).toBe("британська короткошерста × безпородний");
    expect(breedText([MIXED, "perska"], [true, false], "female")).toBe("безпородна × ?");
    expect(breedText(["perska", "perska"], [true, true], "female")).toBe("перська, чистокровна");
  });

  it("у кожної породи є опис, у кожної хвороби — порада; без чисел і незаповнених місць", () => {
    for (const breed of BREEDS) {
      const about = BREED_ABOUT[breed.id];
      expect(about, breed.id).toBeTruthy();
      expect(about).not.toMatch(/[{}[\]|\d]/);
    }
    for (const id of Object.keys(DISEASES)) {
      const advice = VET_ADVICE[id];
      expect(advice, id).toBeTruthy();
      expect(advice).not.toMatch(/[{}[\]|\d]/);
    }
  });

  it("«Заходила ветеринарка»: порада до кожної знайденої хвороби, однакова — один раз; «оглянула котів», а не «всіх» (загальна ревізія 2026-10-29)", () => {
    const text = homeVetText([
      { name: "Мурчик", sex: "male", diseases: ["heart", "gingivitis"], manner: null },
      { name: "Ромашка", sex: "female", diseases: ["heart"], manner: null },
      { name: "Пушок", sex: "male", diseases: [], manner: null },
    ]);
    expect(text).toContain("Мурчик — хвороба серця, гінгівіт; Ромашка — хвороба серця. Решта здорові.");
    expect(text.split(VET_ADVICE["heart"] ?? "?").length - 1).toBe(1);
    expect(text).toContain(VET_ADVICE["gingivitis"]);
    expect(text).not.toContain("всіх");
    const one = homeVetText([{ name: "Мурчик", sex: "male", diseases: ["joints"], manner: null }]);
    expect(one).toBe(`Мурчик: знайшла — хвороба суглобів. ${VET_ADVICE["joints"]}`);
    const healthy = [{ name: "Мурчик", sex: "male", diseases: [], manner: null }, { name: "Пушок", sex: "male", diseases: [], manner: null }] as const;
    expect(homeVetText(healthy)).toBe("Оглянула котів (2): хвороб не знайшла.");
  });
});
