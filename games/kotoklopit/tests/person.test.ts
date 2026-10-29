// Персонаж без статі (§5.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4): звертання «він / вона» — лише граматика.

import { describe, expect, it } from "vitest";

import { dash } from "../src/sim/body";
import { changeStat } from "../src/sim/character";
import { createCat } from "../src/sim/cat";
import { DASH_COOLDOWN_MINUTES } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, DEFAULT_LOOK, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { hoursUntilWake } from "../src/sim/sleep";
import { createRng } from "../src/sim/rng";
import { fallIllPerson } from "../src/sim/illness";
import { fill } from "../src/texts";
import type { GameState, Save } from "../src/sim/types";
import { callImpression } from "../src/sim/work";
import { chronotypeCard } from "../src/ui/cards";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

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
      const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
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
    const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { cycleStart: -12 });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("cycleStart");
  });
});

describe("бороди немає (рішення автора 2026-10-29, А4)", () => {
  it("враження на відеодзвінку щодня однакове для обох персонажів: ні бонусу за охайність, ні штрафу за щетину", () => {
    for (const address of ["she", "he"] as const) {
      const save = newGame({ address, difficulty: "normal", seed: 1 });
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
    const save = newGame({ address: "he", difficulty: "normal", seed: 1 });
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
    const save = newGame({ address: "he", difficulty: "normal", seed: 1 });
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

describe("звертання «він / вона» — лише граматика (рішення автора 2026-10-29, А4)", () => {
  it("тексти обирають форму за звертанням: «він» — чоловічу, «вона» — жіночу", () => {
    expect(fill("{персонаж} [звільнений|звільнена]", "he", { персонаж: "Саша" })).toBe("Саша звільнений");
    expect(fill("{персонаж} [звільнений|звільнена]", "she", { персонаж: "Саша" })).toBe("Саша звільнена");
  });

  it("з тим самим seed і вибором чотири дні гри з котом однакові для «він» і «вона» — відрізняється лише звертання", () => {
    const week = (address: "he" | "she"): GameState => {
      const save = withCatCorner(newGame({ address, difficulty: "normal", seed: 21, name: "Саша", look: DEFAULT_LOOK.she, chronotype: "owl" }));
      addCat(save.current, createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 }));
      // Як liveDay, але й здоровий глузд підтримано: кіт без догляду лишає безлад, а гра не має закінчитися. Довше — скінчиться
      // чистий одяг, і гігієна обвалиться.
      const freshen = (): void => {
        for (const stat of ["satiety", "hygiene", "sanity"] as const) changeStat(save.current, stat, 100);
      };
      for (let day = 0; day < 4; day++) {
        freshen();
        advance(save, hours(8));
        freshen();
        advance(save, hours(hoursUntilWake(save.current) - 8));
        goToSleep(save);
      }
      return { ...save.current, character: { ...save.current.character, address: "she" } };
    };
    const he = week("he");
    expect(he.end).toBeNull();
    expect(he.day).toBe(4);
    expect(he.cats.length).toBeGreaterThan(0);
    expect(he).toEqual(week("she"));
  });

  it("стара гра: стать персонажа стає звертанням (чоловіча — «він», жіноча — «вона»), а хронотип лишається, який був", () => {
    for (const [sex, address] of [["male", "he"], ["female", "she"]] as const) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 1, chronotype: "owl" });
      const old = save.current.character as unknown as Record<string, unknown>;
      delete old["address"];
      old["sex"] = sex;
      const loaded = deserialize(serialize(save)).current.character;
      expect(loaded.address).toBe(address);
      expect(loaded).not.toHaveProperty("sex");
      expect(loaded.chronotype).toBe("owl");
    }
  });
});
