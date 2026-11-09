import { describe, expect, it } from "vitest";

import { courierNow, crashNow, jumpTo, setTime, skipDays, skipToMonday, sleepNow } from "../src/dev/commands";
import { applyScenario, deepMerge, FILE_SCENARIOS, scenarioFromSave, scenarioId } from "../src/dev/scenarios";
import { describe as describeEvent } from "../src/dev/journal";
import { drive, interact, newGame } from "../src/sim/game";
import { NO_RACE_INPUT, newRace } from "../src/sim/race";
import { weekdayOf, weekOf } from "../src/sim/time";
import { createCat, idleAct } from "../src/sim/cat";
import { dispatch } from "../src/sim/economy";
import { TRIPS } from "../src/sim/config";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { hours, recordEvents } from "./helpers";

const CHAOS_LOOK = { face: 0, skin: 1, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 1, bottom: 0, shoes: 0 };

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

  it("«Вечір неділі»: лягти спати — і вже понеділок другого тижня, прийшов рахунок за комунальні", () => {
    const scenario = FILE_SCENARIOS["sunday-evening"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(6);
    const night = interact(save);
    expect(night?.weekly).toBe(true);
    expect(night?.utilities?.outcome).toBe("billed");
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
    const save = newGame({ address: "he", difficulty: "hard", seed: 5 });
    save.current.character.money = 333;
    const restored = applyScenario(JSON.parse(JSON.stringify(scenarioFromSave(save, "Тест"))));
    expect(restored.current).toEqual(save.current);
  });

  it("«Вечірній хаос» — «він» і сова зі своєю зовнішністю", () => {
    const scenario = FILE_SCENARIOS["chaos-evening"];
    if (!scenario) throw new Error("немає сценарію");
    const { address, chronotype, look } = applyScenario(scenario).current.character;
    expect([address, chronotype, look]).toEqual(["he", "owl", CHAOS_LOOK]);
  });

  it("id сценарію — латиницею з назви", () => {
    expect(scenarioId("Вечір неділі")).toBe("vechir-nedili");
    expect(scenarioId("Здоровий глузд 29")).toBe("zdorovyi-hluzd-29");
  });
});

describe("команди режиму розробки", () => {
  it("встановити день і годину; година до пробудження — ніч після цього дня", () => {
    const save = newGame({ address: "he", difficulty: "normal", seed: 1 });
    setTime(save, 9, 1);
    expect(save.current.day).toBe(9);
    expect(save.current.minute).toBe(hours(25));
    expect(save.current.modifiers.day).toBeNull();
    expect(save.dayStart.day).toBe(9);
  });

  it("ранок, вечір, ніч; лягти спати зараз; пропустити день і тиждень", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
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

  it("кур'єр зараз дзвонить, як справжній: «Душа компанії» біжить до дверей (перевірка етапу 2026-10-26)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
    save.current.minute = hours(12);
    const host = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: 5.5, y: 8.5 } });
    host.traits = [{ group: "guests", level: 2, seen: 0, known: false }];
    host.arrivedDay = -10;
    host.act = idleAct(30);
    host.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
    addCat(save.current, host);
    save.current.character.money = 1000;
    dispatch(save.current, { product: "food" }, "cheap", 10);
    const { events, stop } = recordEvents();
    courierNow(save.current);
    stop();
    expect(save.current.home.porch).toHaveLength(1);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(host.act.target).toBe("guest");
  });

  it("«Аварія зараз» (§11.5, «Поїздки»): наступний кадр гонки — аварія на поточній швидкості, навіть на ×10 і посеред перестроювання; поза гонкою — нічого", () => {
    for (const [speed, lane] of [[1, 1], [4, 0.5], [10, 2]] as const) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
      save.current.day = 5;
      save.current.minute = 9 * 60;
      expect(crashNow(save.current)).toBe(false);
      save.current.trip = { destination: "shop", phase: "drive", cat: null, race: newRace(TRIPS.shop.road, 7), losses: [], visit: 0, seed: 7 };
      Object.assign(save.current.trip.race, { speed, lane, targetLane: Math.round(lane) });
      expect(crashNow(save.current)).toBe(true);
      const { events, stop } = recordEvents();
      expect(drive(save, 1 / 60, NO_RACE_INPUT).result, `×${speed}`).toBe("crash");
      stop();
      expect(save.current.trip.accident?.speed).toBeCloseTo(speed, 1);
      const crashed = events.find((e) => e.type === "trip-crashed");
      expect(crashed && describeEvent(crashed, save.current)).toContain(`Аварія на ×${speed}`);
    }
  });
});

describe("журнал", () => {
  it("описує приховані зміни й кидки", () => {
    const { current } = newGame({ address: "she", difficulty: "normal", seed: 1 });
    expect(describeEvent({ type: "patience", level: "out" }, current)).toContain("«Х»");
    expect(describeEvent({ type: "glitch", chance: 0.32, angle: 112.4 }, current)).toContain("32%");
    expect(describeEvent({ type: "dash" }, current)).toBeNull();
  });

  it("каже, де кіт подряпав: біля переноски, у ванні чи із засідки «Ніндзя»", () => {
    const { current } = newGame({ address: "she", difficulty: "normal", seed: 1 });
    expect(describeEvent({ type: "clawed", cat: 1, at: "carrier" }, current)).toContain("біля переноски");
    expect(describeEvent({ type: "clawed", cat: 1, at: "bath" }, current)).toContain("у ванні");
    const ambush = describeEvent({ type: "clawed", cat: 1, at: "ambush" }, current);
    expect(ambush).toContain("із засідки");
    expect(ambush).not.toContain("переноск");
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
