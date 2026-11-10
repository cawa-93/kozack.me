// Титулка дня (§4, §8.8): що бачить гравець уранці.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { NightReport } from "../src/sim/types";
import { albumNote, dayTitle } from "../src/ui/cards";
import { removeCat } from "../src/sim/farewell";
import { diseaseTitle, farewellText, fill } from "../src/texts";

describe("титулка дня (§4)", () => {
  it("хто будив уночі — по рядку на кота, у роді кота", () => {
    const { current: state } = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const tom = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    const queen = createCat(state, createRng(2), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    Object.assign(tom, { name: "Мурчик", sex: "male" });
    Object.assign(queen, { name: "Мурка", sex: "female" });
    addCat(state, tom);
    addCat(state, queen);
    state.day = 1;
    const night = {
      wakeUps: [
        { cat: tom.id, reason: "night" },
        { cat: tom.id, reason: "night" },
        { cat: queen.id, reason: "morning" },
      ],
      newCats: [],
      givenCats: [],
      lostCats: [],
      utilities: null,
    } as unknown as NightReport;
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    expect(lines.filter((l) => l === "Мурчик не давав спати вночі.")).toHaveLength(1);
    expect(lines).toContain("Мурка вимагала сніданку о 05:00.");
  });

  it("у понеділок — гроші за тиждень: заробили, витратили й категорії від найбільшої, без порожніх (рішення автора 2026-10-27, Е4)", () => {
    const { current: state } = newGame({ address: "she", difficulty: "normal", seed: 3 });
    state.day = 7;
    const night = {
      wakeUps: [],
      newCats: [],
      givenCats: [],
      lostCats: [],
      utilities: { outcome: "billed", bill: 40 },
      ledger: { earned: 245.4, spent: { supplies: 210, delivery: 97, utilities: 40, health: 0 } },
    } as unknown as NightReport;
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    const at = lines.indexOf("Гроші за тиждень");
    expect(lines[at - 1]).toBe("Прийшов рахунок за комунальні: 40 ₴.");
    expect(lines[at + 1]).toBe("Заробили 245 ₴, витратили 347 ₴.");
    expect(lines[at + 2]).toBe("Корм і запаси — 210 ₴; доставка — 97 ₴; комунальні — 40 ₴.");
    // У будні підсумку немає.
    const weekday = dayTitle(state, { ...night, utilities: null, ledger: null }).flatMap((s) => s.blocks.flat());
    expect(weekday).not.toContain("Гроші за тиждень");
  });

  it("котячого тижня без котів титулка не показує, погоду — показує; кіт з'явився — котячий тиждень знову видно (§4.1, рецензія реалізації А14)", () => {
    const { current: state } = newGame({ address: "she", difficulty: "normal", seed: 3 });
    state.day = 8;
    state.modifiers.day = null;
    const night = { wakeUps: [], newCats: [], givenCats: [], lostCats: [], utilities: null, ledger: null } as unknown as NightReport;
    const lines = (week: string): string[] => {
      state.modifiers.week = week;
      return dayTitle(state, night).flatMap((s) => s.blocks.flat()).filter((l) => typeof l === "string");
    };
    expect(state.cats).toHaveLength(0);
    for (const [week, title] of [["cat-march", "Котячий березень"], ["calm-season", "Спокійний сезон"], ["cat-flu", "Котячий грип"], ["cat-prevention", "Тиждень котячої профілактики"]]) {
      expect(lines(week!)).not.toContain(title);
    }
    expect(lines("heat-wave")).toContain("Хвиля спеки");
    expect(lines("cold-snap")).toContain("Похолодання");
    expect(lines("human-flu")).toContain("Людський грип");
    addCat(state, createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } }));
    expect(lines("cat-flu")).toContain("Котячий грип");
    // Робочого тижня безробітному титулка, як і раніше, не показує.
    expect(lines("crunch")).toContain("Аврал");
    state.job.unemployed = true;
    expect(lines("crunch")).not.toContain("Аврал");
  });

  it("прощання на титулці — заголовок, причина й риси; рівня й опису життя тут немає — вони в альбомі й титрах (§9.7)", () => {
    const { current: state } = newGame({ address: "he", difficulty: "normal", seed: 3 });
    const lost = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    const given = createCat(state, createRng(2), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    for (const cat of [lost, given]) {
      addCat(state, cat);
      cat.moodHistory = [15];
      // Риси на титулці — чипами DOM (у Node їх не збудувати); тут важливі лише рядки тексту.
      cat.traits = [];
    }
    const lostEntry = removeCat(state, lost, { kind: "sorrow" }, state.day);
    const givenEntry = removeCat(state, given, { kind: "given" }, state.day);
    const night = { wakeUps: [], newCats: [], givenCats: [given.id], lostCats: [lost.id], utilities: null, ledger: null } as unknown as NightReport;
    const blocks = dayTitle(state, night).flatMap((s) => s.blocks);
    for (const [entry, heading] of [[lostEntry, `Прощання: ${lost.name}`], [givenEntry, fill("{кіт} [поїхав|поїхала] до нових господарів", given.sex, { кіт: given.name })]] as const) {
      const block = blocks.find((b) => b[0] === heading);
      expect(block, heading).toBeDefined();
      const text = farewellText(entry, diseaseTitle, state);
      const lines = (block ?? []).filter((l): l is string => typeof l === "string");
      expect(lines).toEqual([heading, text.cause]);
      for (const line of lines) {
        expect(line).not.toContain(`«${text.title}»`);
        expect(line).not.toContain(text.life);
      }
    }
  });

  it("альбом: під ім'ям, віком і причиною — опис життя без назви рівня в лапках: рівень уже в описі (§9.7)", () => {
    const { current: state } = newGame({ address: "he", difficulty: "normal", seed: 3 });
    const cat = createCat(state, createRng(1), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } });
    addCat(state, cat);
    cat.moodHistory = [15];
    const entry = removeCat(state, cat, { kind: "sorrow" }, state.day);
    const text = farewellText(entry, diseaseTitle, state);
    expect(albumNote(entry, state).text).toBe(text.life);
    expect(albumNote(entry, state).text).not.toContain(`«${text.title}»`);
  });
});
