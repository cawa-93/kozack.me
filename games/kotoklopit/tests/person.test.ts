// Персонаж без статевих механік (§5.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4).

import { describe, expect, it } from "vitest";

import { dash } from "../src/sim/body";
import { DASH_COOLDOWN_MINUTES } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import { fallIllPerson } from "../src/sim/illness";
import type { Save } from "../src/sim/types";
import { callImpression } from "../src/sim/work";
import { chronotypeCard } from "../src/ui/cards";
import { recordEvents, standAt } from "./helpers";

/** Що відповів умивальник на дію: причина відмови чи undefined. */
function sinkRefusal(save: Save): unknown {
  standAt(save, "sink");
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  const event = events.find((e) => e.type === "refused");
  return event?.type === "refused" ? event.reason : undefined;
}

/** Хвилина ходьби праворуч із середини вітальні: скільки клітинок пройдено. */
function walkMinute(save: Save): number {
  Object.assign(save.current.character.body, { x: 4.5, y: 8.5, facing: { x: 1, y: 0 } });
  advance(save, 1, { move: { x: 1, y: 0 }, hold: false });
  return save.current.character.body.x - 4.5;
}

describe("жіночого циклу немає (рішення автора 2026-10-29, А4)", () => {
  it("будь-якого дня 28-денного «циклу» жіночий персонаж ходить, робить ривок і втрачає гігієну, як завжди", () => {
    for (let day = 0; day < 28; day++) {
      const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
      const state = save.current;
      state.day = day;
      state.modifiers = { day: null, week: null };
      expect(walkMinute(save)).toBeCloseTo(3);
      expect(hygieneFactor(state)).toBe(1);
      expect(dash(state)).toBe(true);
      expect(state.character.body.dashCooldown).toBe(DASH_COOLDOWN_MINUTES);
    }
  });

  it("зі старого збереження зникає день початку циклу", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { cycleStart: -12 });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("cycleStart");
  });
});

describe("бороди немає (рішення автора 2026-10-29, А4)", () => {
  it("враження на відеодзвінку щодня однакове для обох персонажів: ні бонусу за охайність, ні штрафу за щетину", () => {
    for (const sex of ["female", "male"] as const) {
      const save = newGame({ sex, difficulty: "normal", seed: 1 });
      const state = save.current;
      state.character.stats.hygiene = 50;
      for (let day = 0; day < 10; day++) {
        state.day = day;
        expect(callImpression(state)).toBe(0);
      }
      // Відчутне лишається: гігієна від 75 — бонус, брудний одяг — штраф (§8.6).
      state.character.stats.hygiene = 75;
      expect(callImpression(state)).toBe(0.5);
      state.home.clothes = 0;
      expect(callImpression(state)).toBe(0);
    }
  });

  it("умивальник у чоловічого персонажа — як у жіночого: ліки для себе або відмова, ні гоління, ні підрівнювання", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    save.current.modifiers.day = null;
    save.current.day = 6;
    expect(sinkRefusal(save)).toBe("healthy");
    fallIllPerson(save.current, "cold");
    expect(sinkRefusal(save)).toBe("empty");
    addSupply(save.current, "humanMeds", "cheap", 5);
    expect(sinkRefusal(save)).toBeUndefined();
    expect(sinkRefusal(save)).toBe("dose-taken");
  });

  it("зі старого збереження зникають дні гоління й підрівнювання", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { beard: { shaved: 0, trimmed: -100 } });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("beard");
  });
});

describe("хронотип — лише час пробудження (рішення автора 2026-10-29, А4)", () => {
  it("картка хронотипу називає час пробудження й не обіцяє бадьорості в якісь години", () => {
    const card = chronotypeCard(() => undefined, () => undefined);
    expect(card.body).toEqual(["Жайворонок прокидається о 06:00.", "Сова прокидається о 08:00."]);
  });
});
