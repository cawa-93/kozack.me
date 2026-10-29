import { describe, expect, it } from "vitest";

import { FIRST_DAY_MODIFIER, TOTAL_DAYS } from "../src/sim/config";
import {
  advance,
  deserialize,
  goToSleep,
  newGame,
  replayDay,
  replayWeek,
  SAVE_VERSION,
  serialize,
} from "../src/sim/game";
import { createCat } from "../src/sim/cat";
import { createRng, stateRng } from "../src/sim/rng";
import { TRAIT_GROUPS, traitGroup } from "../src/sim/traits";
import { weekdayOf, weekOf } from "../src/sim/time";
import type { Address, AlbumEntry, CatDisease, NightReport, Save, Trait } from "../src/sim/types";
import { hours, liveDay } from "./helpers";

const game = (address: Address = "she", seed = 1) => newGame({ address, difficulty: "normal", seed });

const draws = (save: Save, stream: "conditions" | "behavior", count = 5): number[] => {
  const rng = stateRng(save.current, stream);
  return Array.from({ length: count }, () => rng.next());
};

describe("нова гра", () => {
  it("починається в понеділок першого тижня з «Першого дня» без котів (§8.3)", () => {
    const save = game();
    const state = save.current;
    expect(state.day).toBe(0);
    expect(weekOf(state.day)).toBe(1);
    expect(weekdayOf(state.day)).toBe(0);
    expect(state.modifiers.day).toBe(FIRST_DAY_MODIFIER);
    expect(state.cats).toEqual([]);
    expect(state.end).toBeNull();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.dayStart).toEqual(state);
    expect(save.weekStart).toEqual(state);
  });

  it("хронотип обирає гравець, незалежно від звертання; без вибору — жайворонок (§5.1; рішення автора 2026-10-29, А4)", () => {
    expect(game("she").current.character.chronotype).toBe("lark");
    expect(game("he").current.character.chronotype).toBe("lark");
    const owl = newGame({ address: "she", difficulty: "normal", chronotype: "owl", seed: 1 }).current;
    expect(owl.character.chronotype).toBe("owl");
    const lark = newGame({ address: "he", difficulty: "normal", chronotype: "lark", seed: 1 }).current;
    expect(lark.character.chronotype).toBe("lark");
    // Жайворонок прокидається о 06:00, сова — о 08:00 (§8.8).
    expect(lark.minute).toBe(6 * 60);
    expect(owl.minute).toBe(8 * 60);
  });
});

describe("тиждень гри без графіки", () => {
  for (const [address, chronotype] of [["she", "lark"], ["he", "owl"]] as const) {
    it(`${chronotype === "lark" ? "жайворонок" : "сова"} («${address === "she" ? "вона" : "він"}») проживає тиждень`, () => {
      const save = newGame({ address, difficulty: "normal", seed: 1, chronotype });
      const nights: NightReport[] = [];
      for (let day = 0; day < 7; day++) {
        const report = liveDay(save);
        if (report === null) throw new Error(`ніч ${day} не настала`);
        nights.push(report);
      }
      const state = save.current;
      expect(state.end).toBeNull();
      expect(state.day).toBe(7);
      expect(weekOf(state.day)).toBe(2);
      expect(weekdayOf(state.day)).toBe(0);
      expect(nights.map((night) => night.weekly)).toEqual([false, false, false, false, false, false, true]);
      expect(nights.every((night) => night.sleptHours === 8 && !night.collapsed)).toBe(true);
      // Без роботи й котів здоровий глузд не змінюється, тож кошеня не приходить.
      expect(state.character.stats.sanity).toBe(40);
      expect(state.cats).toEqual([]);
      expect(state.character.sleepSpeed).toBe(0);
      expect(save.weekStart.day).toBe(7);
      expect(save.dayStart.day).toBe(7);
    });
  }

  it("та сама гра з тим самим seed відтворюється до біта", () => {
    const play = (): string => {
      const save = game("he", 123);
      for (let day = 0; day < 7; day++) liveDay(save);
      draws(save, "behavior");
      return serialize(save);
    };
    expect(play()).toEqual(play());
  });
});

describe("знімки й перегравання (§6.1)", () => {
  it("знімок дня оновлюється щоранку, знімок тижня — щопонеділка", () => {
    const save = game();
    liveDay(save);
    liveDay(save);
    expect(save.dayStart.day).toBe(2);
    expect(save.weekStart.day).toBe(0);
  });

  it("переграти день: стан з початку дня, ті самі умови, нова поведінка котів", () => {
    const save = game();
    liveDay(save);
    const conditions = draws(save, "conditions");
    const behavior = draws(save, "behavior");
    advance(save, hours(5));

    replayDay(save);
    expect(save.current.day).toBe(1);
    expect(save.current.minute).toBe(save.dayStart.minute);
    expect(save.current.character).toEqual(save.dayStart.character);
    expect(save.current.replays).toBe(1);
    expect(draws(save, "conditions")).toEqual(conditions);
    const firstReplay = draws(save, "behavior");
    expect(firstReplay).not.toEqual(behavior);

    replayDay(save);
    expect(save.current.replays).toBe(2);
    expect(draws(save, "conditions")).toEqual(conditions);
    const secondReplay = draws(save, "behavior");
    expect(secondReplay).not.toEqual(firstReplay);
    expect(secondReplay).not.toEqual(behavior);
  });

  it("переграти тиждень: з понеділка, і решта тижня теж отримує нову поведінку", () => {
    const save = game();
    liveDay(save);
    liveDay(save);
    const wednesday = draws(save, "behavior");
    advance(save, hours(3));

    replayWeek(save);
    expect(save.current.day).toBe(0);
    expect(save.current.minute).toBe(save.weekStart.minute);
    expect(save.dayStart.day).toBe(0);
    expect(save.current.replays).toBe(1);
    liveDay(save);
    liveDay(save);
    expect(draws(save, "behavior")).not.toEqual(wednesday);
  });
});

describe("збереження в JSON (§6.1)", () => {
  it("завантажене збереження таке саме й продовжує ту саму випадковість", () => {
    const save = game();
    liveDay(save);
    advance(save, hours(3));
    draws(save, "behavior", 2);
    const loaded = deserialize(serialize(save));
    expect(loaded).toEqual(save);
    expect(draws(loaded, "behavior")).toEqual(draws(save, "behavior"));
  });

  it("злиті групи рис переходять у нові: той самий рівень і прояви, а якщо риса там уже є — сильніша (2026-10-25)", () => {
    const save = game();
    const trait = (group: string, level: Trait["level"], seen = 0): Trait => ({ group, level, seen, known: false });
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 5 });
    cat.traits = [trait("toiletPaper", 2, 3), trait("energy", -1), trait("toyHiding", 1, 1), trait("gifts", -2), trait("warmth", 1, 2), trait("weather", -1, 4)];
    save.current.cats.push(cat);
    const shelterCat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 2 });
    shelterCat.traits = [trait("weather", 2)];
    save.current.shelter = { week: 0, cats: [shelterCat] };
    save.current.album.push({ id: 99, traits: [trait("hunting", -1), trait("toiletPaper", 1)] } as unknown as AlbumEntry);
    const loaded = deserialize(serialize(save));
    const loadedCat = loaded.current.cats.find((c) => c.id === cat.id);
    expect(loadedCat?.traits).toEqual([trait("hunting", 2, 3), trait("energy", -1), trait("gifts", -2), trait("warmth", 1, 2)]);
    expect(loaded.current.shelter?.cats[0]?.traits).toEqual([trait("warmth", 2)]);
    // За рівності сили лишається та риса, що вже була в групі.
    expect(loaded.current.album.at(-1)?.traits).toEqual([trait("hunting", -1)]);
    for (const t of loadedCat?.traits ?? []) expect(() => traitGroup(t.group)).not.toThrow();
    for (const id of ["toiletPaper", "toyHiding", "weather"]) expect(TRAIT_GROUPS.some((g) => g.id === id)).toBe(false);
  });

  it("«старечих болячок» немає: зі старого збереження їх знято з котів і журналу здоров'я, а смерть від них в альбомі — старість (рішення автора 2026-10-29, А13)", () => {
    const save = game();
    const senior = { id: "senior", day: 0, doses: 0, diet: 0, calm: 0, controlled: null, known: true } as unknown as CatDisease;
    const cold: CatDisease = { id: "cold", day: 0, doses: 0, diet: 0, calm: 0, controlled: null, known: false };
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 9 });
    cat.diseases = [senior, cold];
    cat.healthLog = [
      { day: 0, source: "disease:senior", amount: 1 },
      { day: 0, source: "disease:cold", amount: 2 },
    ];
    save.current.cats.push(cat);
    const shelterCat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 9 });
    shelterCat.diseases = [senior];
    save.current.shelter = { week: 0, cats: [shelterCat] };
    save.current.album.push({ id: 98, traits: [], cause: { kind: "disease", disease: "senior" } } as unknown as AlbumEntry);
    save.current.album.push({ id: 99, traits: [], cause: { kind: "disease", disease: "heart" } } as unknown as AlbumEntry);
    const loaded = deserialize(serialize(save));
    const loadedCat = loaded.current.cats.find((c) => c.id === cat.id);
    expect(loadedCat?.diseases).toEqual([cold]);
    expect(loadedCat?.healthLog).toEqual([{ day: 0, source: "disease:cold", amount: 2 }]);
    expect(loaded.current.shelter?.cats[0]?.diseases).toEqual([]);
    expect(loaded.current.album.map((e) => e.cause)).toEqual([{ kind: "old" }, { kind: "disease", disease: "heart" }]);
  });

  it("зі старого збереження прибрано час дорогого корму (`premiumAt`) — заздрості до нього більше немає (рішення автора 2026-10-29, А16)", () => {
    const save = game();
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 5 });
    Object.assign(cat, { premiumAt: 600 });
    save.current.cats.push(cat);
    const loaded = deserialize(serialize(save));
    expect(loaded.current.cats.find((c) => c.id === cat.id)).not.toHaveProperty("premiumAt");
  });

  it("«Одужання» злито з «Витривалістю»: риса переходить туди з рівнем і проявами, а коли там уже є — лишається сильніша (рішення автора 2026-10-29, А16)", () => {
    const save = game();
    const trait = (group: string, level: Trait["level"], seen = 0): Trait => ({ group, level, seen, known: false });
    const lone = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 5 });
    lone.traits = [trait("energy", 1), trait("recovery", -2, 1)];
    const weaker = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 5 });
    weaker.traits = [trait("hardiness", -1), trait("recovery", 2)];
    const tie = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 5 });
    tie.traits = [trait("recovery", -1), trait("hardiness", 1)];
    save.current.cats.push(lone, weaker, tie);
    save.current.album.push({ id: 98, traits: [trait("recovery", 1)] } as unknown as AlbumEntry);
    const loaded = deserialize(serialize(save)).current;
    const traitsOf = (id: number): Trait[] | undefined => loaded.cats.find((c) => c.id === id)?.traits;
    expect(traitsOf(lone.id)).toEqual([trait("energy", 1), trait("hardiness", -2, 1)]);
    expect(traitsOf(weaker.id)).toEqual([trait("hardiness", 2)]);
    // За рівності сили лишається та, що вже була у «Витривалості».
    expect(traitsOf(tie.id)).toEqual([trait("hardiness", 1)]);
    expect(loaded.album.at(-1)?.traits).toEqual([trait("hardiness", 1)]);
    expect(TRAIT_GROUPS.some((g) => g.id === "recovery")).toBe(false);
    expect(TRAIT_GROUPS).toHaveLength(57);
  });

  it("збереження іншої версії не завантажується", () => {
    const save = game();
    expect(() => deserialize(JSON.stringify({ ...save, version: SAVE_VERSION + 1 }))).toThrow();
    expect(() => deserialize("null")).toThrow();
  });
});

describe("пенсія (§4.2)", () => {
  it("сон у неділю 50-го тижня закінчує гру без обробки ночі", () => {
    const save = game();
    save.current.day = TOTAL_DAYS - 1;
    save.current.minute = hours(22);
    expect(goToSleep(save)).toBeNull();
    expect(save.current.end).toBe("retirement");
    expect(save.current.day).toBe(TOTAL_DAYS - 1);
  });

  it("падіння без сил в останній день — теж пенсія", () => {
    const save = game();
    save.current.day = TOTAL_DAYS - 1;
    save.current.minute = hours(23);
    expect(advance(save, hours(2))).toBeNull();
    expect(save.current.end).toBe("retirement");
  });
});
