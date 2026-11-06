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
import { stateRng } from "../src/sim/rng";
import { weekdayOf, weekOf } from "../src/sim/time";
import type { Address, NightReport, Save } from "../src/sim/types";
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

  it("збереження іншої версії не завантажується", () => {
    const save = game();
    expect(() => deserialize(JSON.stringify({ ...save, version: SAVE_VERSION + 1 }))).toThrow();
    expect(() => deserialize("null")).toThrow();
  });
});

describe("пенсія (§4.2)", () => {
  it("сон у неділю 20-го тижня закінчує гру без обробки ночі", () => {
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
