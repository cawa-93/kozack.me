import { describe, expect, it } from "vitest";

import { jumpTo, setTime, skipDays, skipToMonday, sleepNow } from "../src/dev/commands";
import { applyScenario, deepMerge, FILE_SCENARIOS, scenarioFromSave, scenarioId } from "../src/dev/scenarios";
import { describe as describeEvent } from "../src/dev/journal";
import { interact, newGame } from "../src/sim/game";
import { weekdayOf, weekOf } from "../src/sim/time";
import { hours } from "./helpers";

describe("сценарії (§11.5)", () => {
  it("зміни накладаються поверх нової гри: об'єкти зливаються, масиви й числа замінюються", () => {
    expect(deepMerge({ a: 1, b: { c: 2, d: 3 }, e: [1, 2] }, { b: { c: 5 }, e: [9] })).toEqual({
      a: 1,
      b: { c: 5, d: 3 },
      e: [9],
    });
  });

  it("усі файли сценаріїв мають назву й опис і дають гру, що йде", () => {
    const ids = Object.keys(FILE_SCENARIOS);
    expect(ids).toEqual(expect.arrayContaining(["sunday-evening", "sanity-29-evening"]));
    for (const [id, scenario] of Object.entries(FILE_SCENARIOS)) {
      expect(scenario.name, id).toBeTruthy();
      expect(scenario.description, id).toBeTruthy();
      const save = applyScenario(scenario);
      expect(save.current.end, id).toBeNull();
      expect(save.dayStart).toEqual(save.current);
    }
  });

  it("«Вечір неділі»: лягти спати — і вже понеділок другого тижня, комунальні сплачено", () => {
    const scenario = FILE_SCENARIOS["sunday-evening"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(6);
    const night = interact(save);
    expect(night?.weekly).toBe(true);
    expect(night?.utilities?.outcome).toBe("paid");
    expect(weekOf(save.current.day)).toBe(2);
    expect(weekdayOf(save.current.day)).toBe(0);
    expect(save.weekStart.day).toBe(7);
  });

  it("«Здоровий глузд 29 увечері»: уранці приходить кошеня з притулку", () => {
    const scenario = FILE_SCENARIOS["sanity-29-evening"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const night = interact(save);
    expect(night?.sanityEvening).toBe(29);
    expect(night?.newCats).toHaveLength(1);
    expect(save.current.cats[0]?.name).toBeTruthy();
    expect(save.current.character.stats.sanity).toBe(79);
  });

  it("поточний стан, збережений як сценарій, відтворюється", () => {
    const save = newGame({ sex: "male", difficulty: "hard", seed: 5 });
    save.current.character.money = 333;
    const restored = applyScenario(JSON.parse(JSON.stringify(scenarioFromSave(save, "Тест"))));
    expect(restored.current).toEqual(save.current);
  });

  it("сценарій, збережений до злиття груп рис, відкривається з рисами в нових групах (2026-10-25)", () => {
    const save = applyScenario({
      name: "Старий",
      cats: [{ ageWeeks: 10, traits: [{ group: "weather", level: 2, seen: 1, known: false }, { group: "toiletPaper", level: -1, seen: 0, known: false }] }],
    });
    expect(save.current.cats[0]?.traits).toEqual([
      { group: "warmth", level: 2, seen: 1, known: false },
      { group: "hunting", level: -1, seen: 0, known: false },
    ]);
  });

  it("id сценарію — латиницею з назви", () => {
    expect(scenarioId("Вечір неділі")).toBe("vechir-nedili");
    expect(scenarioId("Здоровий глузд 29")).toBe("zdorovyi-hluzd-29");
  });
});

describe("команди режиму розробки", () => {
  it("встановити день і годину; година до пробудження — ніч після цього дня", () => {
    const save = newGame({ sex: "male", difficulty: "normal", seed: 1 });
    setTime(save, 9, 1);
    expect(save.current.day).toBe(9);
    expect(save.current.minute).toBe(hours(25));
    expect(save.current.modifiers.day).toBeNull();
    expect(save.dayStart.day).toBe(9);
  });

  it("ранок, вечір, ніч; лягти спати зараз; пропустити день і тиждень", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    jumpTo(save, "evening");
    expect(save.current.minute).toBe(hours(18));
    jumpTo(save, "night");
    expect(save.current.minute).toBe(hours(20));
    jumpTo(save, "morning");
    sleepNow(save);
    expect(save.current.day).toBe(1);
    skipDays(save, 2);
    expect(save.current.day).toBe(3);
    skipToMonday(save);
    expect(save.current.day).toBe(7);
  });
});

describe("журнал", () => {
  it("описує приховані зміни й кидки", () => {
    const { current } = newGame({ sex: "female", difficulty: "normal", seed: 1 });
    expect(describeEvent({ type: "patience", level: "out" }, current)).toContain("«Х»");
    expect(describeEvent({ type: "glitch", chance: 0.32, angle: 112.4 }, current)).toContain("32%");
    expect(describeEvent({ type: "dash" }, current)).toBeNull();
  });
});

describe("сценарій «10 котів» (§8.5, §9.4)", () => {
  it("десять котів із друзями й ворогами живуть вечір: бійки, ігри друзів, вилизування", async () => {
    const { advance } = await import("../src/sim/game");
    const { onEvent } = await import("../src/sim/events");
    const { isEnemy, isFriend } = await import("../src/sim/relations");
    const scenario = FILE_SCENARIOS["ten-cats"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const cats = save.current.cats;
    expect(cats).toHaveLength(10);
    const [murka, barsyk, , sima, , , bonia, , ryzhyk] = cats;
    if (!murka || !barsyk || !sima || !bonia || !ryzhyk) throw new Error("немає котів");
    expect(isFriend(save.current, murka, sima)).toBe(true);
    expect(isEnemy(save.current, barsyk, ryzhyk)).toBe(true);
    const seen = new Set<string>();
    const stop = onEvent((e) => seen.add(e.type));
    for (let i = 0; i < 6 * 60; i++) advance(save, 1, { move: { x: 0, y: 0 }, hold: false });
    stop();
    expect(save.current.end).toBeNull();
    expect(seen.has("meow")).toBe(true);
  });
});
