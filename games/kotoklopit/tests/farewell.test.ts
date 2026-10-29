// Смерть кота й прощання (§9.2, §9.5, §9.7).

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { DIFFICULTY } from "../src/sim/config";
import { giveAwayLoss, lifeLevel, oldAgeChance, oldAgeDeaths, recentlyArrived, removeCat, zeroHealthCause, zeroHealthDeaths } from "../src/sim/farewell";
import { goToSleep, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { AlbumEntry, Cat, Save, TraitLevel } from "../src/sim/types";
import { diseaseTitle, farewellText, GIVE_AWAY_LATER, GIVE_AWAY_RECENT } from "../src/texts";
import { albumCause } from "../src/ui/cards";

function game(): Save {
  return newGame({ sex: "female", difficulty: "normal", seed: 7 });
}

function withCat(save: Save, ageWeeks = 3, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 3), { source: "shelter", ageWeeks, at: { x: 9.5, y: 8.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("смерть від нульового здоров'я (§9.5)", () => {
  it("щовечора з шансом 60%, поки здоров'я на нулі", () => {
    let died = 0;
    for (let seed = 0; seed < 500; seed++) {
      const save = game();
      const cat = withCat(save);
      cat.health = 0;
      died += zeroHealthDeaths(save.current, createRng(seed)).length;
    }
    expect(died / 500).toBeGreaterThan(0.53);
    expect(died / 500).toBeLessThan(0.67);
  });

  it("причина — джерело найбільшої шкоди за тиждень: хвороба чи туга", () => {
    const save = game();
    const cat = withCat(save);
    cat.healthLog = [
      { day: 0, source: "mood", amount: 10 },
      { day: 1, source: "disease:cold", amount: 6 },
      { day: 2, source: "disease:cold", amount: 6 },
    ];
    expect(zeroHealthCause(cat)).toEqual({ kind: "disease", disease: "cold" });
    cat.healthLog = [{ day: 0, source: "mood", amount: 10 }];
    expect(zeroHealthCause(cat)).toEqual({ kind: "sorrow" });
  });

  it("уночі кіт помирає, іде в альбом пам'яті, а здоровий глузд уранці падає", () => {
    for (let seed = 1; seed < 40; seed++) {
      const save = newGame({ sex: "female", difficulty: "normal", seed });
      const cat = withCat(save);
      cat.health = 0;
      cat.healthLog = [{ day: 0, source: "mood", amount: 50 }];
      save.current.character.stats.sanity = 80;
      save.current.minute = 23 * 60;
      const report = goToSleep(save);
      if (report?.lostCats.length !== 1) continue;
      expect(save.current.cats).toHaveLength(0);
      expect(save.current.album[0]?.name).toBe(cat.name);
      expect(save.current.album[0]?.cause).toEqual({ kind: "sorrow" });
      expect(save.current.character.stats.sanity).toBeLessThan(80);
      return;
    }
    throw new Error("за 40 ночей кіт так і не помер");
  });
});

describe("старість (§9.2)", () => {
  it("30% у шостому тижні, +10% за тиждень, −5% за одиницю «Довголіття»", () => {
    const save = game();
    // Безпородний кіт має «Довголіття» +1 від породи (§9.11).
    expect(oldAgeChance(withCat(save, 5))).toBe(0);
    expect(oldAgeChance(withCat(save, 6))).toBeCloseTo(0.25);
    expect(oldAgeChance(withCat(save, 8))).toBeCloseTo(0.45);
    expect(oldAgeChance(withCat(save, 6, { longevity: 2 }))).toBeCloseTo(0.15);
    expect(oldAgeChance(withCat(save, 14))).toBe(1);
  });

  it("перевірка — у ніч, коли кіт старшає, тож і посеред тижня (§9.1, рішення автора 2026-10-27)", () => {
    const save = game();
    const old = withCat(save, 14);
    // З'явився в четвер (день 3): старшає в ночі на четвер — 9, 16…
    old.arrivedDay = 3;
    const always = { ...createRng(1), chance: () => true };
    save.current.day = 6;
    expect(oldAgeDeaths(save.current, always)).toEqual([]);
    save.current.day = 9;
    expect(oldAgeDeaths(save.current, always).map((e) => e.id)).toEqual([old.id]);
  });
});

describe("прощання (§9.7)", () => {
  it("десять рівнів опису життя за середнім настроєм", () => {
    expect(lifeLevel(0)).toBe(0);
    expect(lifeLevel(9.9)).toBe(0);
    expect(lifeLevel(55)).toBe(5);
    expect(lifeLevel(100)).toBe(9);
  });

  it("причина й опис життя — у роді кота", () => {
    const save = game();
    const cat = withCat(save);
    cat.sex = "female";
    cat.moodHistory = [95, 92];
    const entry = removeCat(save.current, cat, { kind: "disease", disease: "cold" }, 0);
    const text = farewellText(entry, diseaseTitle);
    expect(text.title).toBe("Легенда");
    expect(text.cause).toContain("недугу — застуда");
    expect(text.cause).toContain("здолала");
    expect(text.life).toContain("богиня");
  });

  it("загальна ревізія 2026-10-29: хвороба на прощанні й в альбомі — назва з малої, без «хворобу «Хвороба серця»»", () => {
    const save = game();
    const cat = withCat(save);
    cat.sex = "male";
    const entry = removeCat(save.current, cat, { kind: "disease", disease: "heart" }, 0);
    const { cause } = farewellText(entry, diseaseTitle);
    expect(cause).toBe(`${entry.name} не здолав недугу — хвороба серця. Цього разу дев'ятого життя не вистачило.`);
    expect(cause).not.toMatch(/хворобу «|«Хвороба/);
    expect(albumCause(entry)).toBe("хвороба серця");
    expect(albumCause({ ...entry, cause: { kind: "disease", disease: "cold" } })).toBe("застуда");
    expect(albumCause({ ...entry, cause: { kind: "old" } })).toBe("старість");
  });

  describe("рішення автора 2026-10-29 (GENERAL_REVIEW.md, А18): варіанти найчастіших прощань — за котом", () => {
    /** Кіт, що пішов від старості з «Котячим раєм» (настрій 85), — із заданим номером. */
    function paradise(sex: "male" | "female" = "male"): (id: number) => AlbumEntry {
      const save = game();
      const cat = withCat(save);
      cat.sex = sex;
      cat.moodHistory = [85, 85];
      const entry = removeCat(save.current, cat, { kind: "old" }, 0);
      return (id) => ({ ...entry, id });
    }
    const ids = Array.from({ length: 9 }, (_, i) => 30 + i);

    it("старість і «Котячий рай» мають по кілька варіантів: кошенята одного виводку (номери поспіль) дістають різні, а причина й опис поєднуються по-різному", () => {
      const entryOf = paradise();
      const texts = ids.map((id) => farewellText(entryOf(id), diseaseTitle));
      for (const text of texts) expect(text.title).toBe("Котячий рай");
      // Троє з виводку — три різні причини й три різні описи.
      expect(new Set(texts.slice(0, 3).map((t) => t.cause)).size).toBe(3);
      expect(new Set(texts.slice(0, 3).map((t) => t.life)).size).toBe(3);
      // Дев'ять котів поспіль — дев'ять різних пар, а не лише «другий варіант із другим».
      expect(new Set(texts.map((t) => `${t.cause}|${t.life}`)).size).toBe(9);
    });

    it("той самий кіт — той самий текст: на прощанні, в альбомі після збереження й на переграванні", () => {
      const entryOf = paradise("female");
      for (const id of ids) {
        const entry = entryOf(id);
        const first = farewellText(entry, diseaseTitle);
        expect(farewellText(entry, diseaseTitle)).toEqual(first);
        // Збереження (JSON) і перегравання повертають той самий запис — з тим самим номером.
        expect(farewellText(JSON.parse(JSON.stringify(entry)) as AlbumEntry, diseaseTitle)).toEqual(first);
        // Варіант не залежить від ночі смерті: на переграванні кіт може піти іншого дня.
        expect(farewellText({ ...entry, day: entry.day + 7 }, diseaseTitle)).toEqual(first);
      }
    });

    it("усі варіанти заповнені в обох родах і починаються з імені (називний відмінок, TEXTS.md)", () => {
      for (const sex of ["male", "female"] as const) {
        const entryOf = paradise(sex);
        for (const id of ids) {
          const entry = entryOf(id);
          const { cause, life } = farewellText(entry, diseaseTitle);
          for (const text of [cause, life]) {
            expect(text).not.toMatch(/[{}[\]|]/);
            expect(text.startsWith(entry.name)).toBe(true);
          }
        }
      }
    });

    it("решта причин і рівнів, як і опис відданого кота, — по одному тексту", () => {
      const entryOf = paradise();
      const count = (make: (id: number) => AlbumEntry, part: "cause" | "life"): number => new Set(ids.map((id) => farewellText(make(id), diseaseTitle)[part])).size;
      // Причини, крім старості: опис «Котячого раю» й тут має варіанти, а причина — одна.
      expect(count((id) => ({ ...entryOf(id), cause: { kind: "sorrow" } }), "cause")).toBe(1);
      expect(count((id) => ({ ...entryOf(id), cause: { kind: "disease", disease: "cold" } }), "cause")).toBe(1);
      // Відданий кіт: і причина, і опис «жив у вас» — по одному.
      expect(count((id) => ({ ...entryOf(id), cause: { kind: "given" } }), "cause")).toBe(1);
      expect(count((id) => ({ ...entryOf(id), cause: { kind: "given" } }), "life")).toBe(1);
      // Інші рівні: «Щасливе життя» (75) і «Легенда» (95) — один опис.
      expect(count((id) => ({ ...entryOf(id), lifeMood: 75 }), "life")).toBe(1);
      expect(count((id) => ({ ...entryOf(id), lifeMood: 95 }), "life")).toBe(1);
    });
  });
});

describe("віддати кота (§9.8)", () => {
  it("«щойно взятий» — перші 7 днів після появи: тоді й весь бонус, і підпис «тільки-но звикли» в оголошенні (загальна ревізія 2026-10-29)", () => {
    const save = game();
    const cat = withCat(save);
    cat.arrivedDay = 10;
    for (let day = 10; day <= 16; day++) {
      expect(recentlyArrived(cat, day)).toBe(true);
      expect(giveAwayLoss(save.current, cat, day)).toBe(-DIFFICULTY.normal.newCatSanity);
    }
    expect(recentlyArrived(cat, 17)).toBe(false);
    expect(giveAwayLoss(save.current, cat, 17)).toBe(DIFFICULTY.normal.givenCatSanity);
    // Підписи без чисел (§11.3а).
    for (const text of [GIVE_AWAY_RECENT, GIVE_AWAY_LATER]) expect(text).not.toMatch(/\d/);
  });
});
