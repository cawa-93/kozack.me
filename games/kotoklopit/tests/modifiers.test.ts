// Модифікатори дня й тижня (§4.1, `DAY_MODIFIERS.md`): вибір, обмеження й ефекти.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat } from "../src/sim/cat";
import { GUESTS, MODIFIERS, PRODUCTS, STORAGE_LIMITS } from "../src/sim/config";
import { unpack } from "../src/sim/economy";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { active, chooseDayModifier, chooseWeekModifier, decideFoundling, patienceDecayFactor, startModifiers, tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { boxesShown } from "../src/sim/storage";
import type { Save } from "../src/sim/types";
import { weekdayOf } from "../src/sim/time";
import { isWorkday } from "../src/sim/work";
import { hours, recordEvents, walkTo } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 14 });

describe("вибір модифікаторів (§4.1)", () => {
  it("приблизно третина днів без модифікатора; котячі — лише коли є кіт", () => {
    const save = game();
    let none = 0;
    const seen = new Set<string>();
    for (let seed = 0; seed < 600; seed++) {
      save.current.modifiers.day = null;
      const id = chooseDayModifier(save.current, 2, createRng(seed));
      if (id === null) none += 1;
      else seen.add(id);
    }
    expect(none / 600).toBeGreaterThan(0.25);
    expect(none / 600).toBeLessThan(0.42);
    for (const catOnly of ["full-moon", "rain", "heat", "festival", "food-price-up"]) expect(seen.has(catOnly)).toBe(false);
  });

  it("той самий модифікатор не повторюється два дні поспіль", () => {
    const save = game();
    for (let seed = 0; seed < 300; seed++) {
      save.current.modifiers.day = "deadline";
      expect(chooseDayModifier(save.current, 2, createRng(seed))).not.toBe("deadline");
    }
  });

  it("модифікатор тижня — приблизно в половині тижнів; у відпустку робочих модифікаторів немає", () => {
    const save = game();
    let some = 0;
    for (let week = 1; week <= 200; week++) if (chooseWeekModifier(save.current, week)) some += 1;
    expect(some / 200).toBeGreaterThan(0.38);
    expect(some / 200).toBeLessThan(0.62);
    save.current.modifiers.week = "vacation";
    for (let seed = 0; seed < 300; seed++) {
      save.current.modifiers.day = null;
      const id = chooseDayModifier(save.current, 2, createRng(seed));
      expect(["deadline", "lull", "meeting", "lunch", "bonus", "pay-delay", "reprimand", "praise"]).not.toContain(id);
    }
  });

  it("щоночі обирається модифікатор нового дня", () => {
    const save = game();
    save.current.minute = 22 * 60;
    goToSleep(save);
    expect(save.current.modifiers.day).not.toBe("first-day");
  });
});

describe("ефекти (§4.1)", () => {
  it("дедлайн — терпіння спадає вдвічі швидше; обідня перерва — не спадає", () => {
    const save = game();
    save.current.modifiers.day = "deadline";
    expect(patienceDecayFactor(save.current)).toBe(2);
    save.current.modifiers.day = "lunch";
    save.current.minute = 12.5 * 60;
    expect(patienceDecayFactor(save.current)).toBe(0);
  });

  it("робоча субота й вихідний посеред тижня змінюють робочий день", () => {
    const save = game();
    save.current.day = 5;
    expect(isWorkday(save.current)).toBe(false);
    save.current.modifiers.day = "work-saturday";
    expect(isWorkday(save.current)).toBe(true);
    save.current.day = 2;
    save.current.modifiers.day = "midweek-off";
    expect(isWorkday(save.current)).toBe(false);
  });

  it("важлива нарада: відсутність б'є по репутації", () => {
    const save = game();
    save.current.day = 1;
    save.current.modifiers.day = "meeting";
    const reputation = save.current.job.reputation;
    tickModifiers(save.current, 14 * 60 - 1, 62, false);
    expect(save.current.job.reputation).toBeLessThan(reputation);
  });

  it("гості: безлад — сором", () => {
    const save = game();
    save.current.modifiers.day = "guests";
    save.current.home.messes.push({ id: 900, kind: "vomit", x: 5, y: 8, cat: null }, { id: 901, kind: "hairball", x: 6, y: 8, cat: null });
    const sanity = save.current.character.stats.sanity;
    tickModifiers(save.current, 19 * 60 - 1, 2, false);
    expect(save.current.character.stats.sanity).toBe(sanity - 6);
  });

  it("спека — тижнева теж; знайда — нове кошеня", () => {
    const save = game();
    save.current.modifiers.week = "heat-wave";
    expect(active(save.current, "heat")).toBe(true);
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, cat);
    save.current.today.foundling = true;
    const kitten = decideFoundling(save.current, true, createRng(2));
    expect(kitten?.source).toBe("foundling");
    expect(save.current.cats).toHaveLength(2);
  });

  /** День «Мама привезла гостинців» з порожніми кухонними поверхнями; повертає, коли мама подзвонить. */
  function momDay(save: Save): number {
    save.current.day = 3;
    for (let seed = 0; seed < 2000; seed++) {
      save.current.modifiers.day = null;
      save.current.home.surfaces["counter-left"] = null;
      save.current.home.surfaces["counter-right"] = null;
      startModifiers(save.current, createRng(seed));
      if (save.current.modifiers.day === "mom-food") break;
    }
    expect(save.current.modifiers.day).toBe("mom-food");
    return save.current.today.mom?.at ?? -1;
  }
  /** Мамині судочки (§6.4, рішення автора 2026-10-26): скільки в холодильнику й скільки в ящиках біля входу. */
  const inFridge = (save: Save): number => save.current.home.supplies.momMeal.cheap;
  const inBoxes = (save: Save): number => save.current.home.boxes?.momMeal?.cheap ?? 0;
  const away = (save: Save): void => {
    save.current.trip = { destination: "shop" } as unknown as NonNullable<Save["current"]["trip"]>;
  };

  it("мама привезла гостинців — удень дзвонить у двері, за 2 хвилини заходить і ставить два судочки в холодильник (рішення автора 2026-10-26)", () => {
    const save = game();
    const at = momDay(save);
    // Зранку ще нічого: мама приїде вдень.
    expect(at).toBeGreaterThanOrEqual(MODIFIERS.mom.from);
    expect(at).toBeLessThan(MODIFIERS.mom.to);
    expect(inFridge(save)).toBe(0);
    const { events, stop } = recordEvents();
    tickModifiers(save.current, at - 0.5, 1, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(inFridge(save)).toBe(0);
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead, false);
    stop();
    expect(inFridge(save)).toBe(PRODUCTS.momMeal.units.cheap);
    expect(inFridge(save)).toBe(2);
    expect(inBoxes(save)).toBe(0);
    // На кухні — нічого: судочки в холодильнику, і холодильник їх показує.
    expect(save.current.home.surfaces["counter-left"]).toBeNull();
    expect(save.current.home.acquired).toContain("momMeal");
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 1)).toBe(true);
    expect(save.current.today.mom).toBeUndefined();
  });

  it("обидві кухонні поверхні зайняті — судочки однаково є: вони в холодильнику (раніше їх не було зовсім)", () => {
    const save = game();
    const at = momDay(save);
    const dish = { kind: "raw", quality: "cheap" } as const;
    save.current.home.surfaces["counter-left"] = { ...dish };
    save.current.home.surfaces["counter-right"] = { ...dish };
    tickModifiers(save.current, at - 0.5, 1, false);
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead, false);
    expect(inFridge(save)).toBe(2);
    expect(save.current.home.surfaces["counter-left"]).toEqual(dish);
  });

  it("холодильник повний — що не влізло, мама лишає в ящиках біля входу, нічого не пропадає", () => {
    const save = game();
    const at = momDay(save);
    save.current.home.supplies.momMeal.cheap = STORAGE_LIMITS.momMeal - 1;
    tickModifiers(save.current, at - 0.5, 1, false);
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead, false);
    expect(inFridge(save)).toBe(STORAGE_LIMITS.momMeal);
    expect(inBoxes(save)).toBe(1);
  });

  it("персонажа немає — мама приходить, щойно він повернувся (до 20:00), а пізніше лишає пакет під дверима: він у ящиках біля входу", () => {
    const back = game();
    const at = momDay(back);
    away(back);
    const { events, stop } = recordEvents();
    tickModifiers(back.current, at - 0.5, 1, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    back.current.trip = null;
    tickModifiers(back.current, hours(19), 0.5, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    tickModifiers(back.current, hours(19) + 0.5, GUESTS.ringLead, false);
    expect(inFridge(back)).toBe(2);
    events.length = 0;

    const late = game();
    momDay(late);
    away(late);
    tickModifiers(late.current, MODIFIERS.mom.until - 0.5, 1, false);
    expect(late.current.today.mom?.porch).toBe(true);
    expect(inBoxes(late)).toBe(0);
    late.current.trip = null;
    tickModifiers(late.current, hours(21), 0.5, false);
    stop();
    // Пакет — у ящиках, як покупка; у холодильник судочки кладе «Розпакувати».
    expect(inBoxes(late)).toBe(2);
    expect(inFridge(late)).toBe(0);
    expect(boxesShown(late.current)).toBe(1);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 0)).toBe(true);
    unpack(late.current);
    expect(inFridge(late)).toBe(2);
    expect(inBoxes(late)).toBe(0);
  });

  it("ніч застала персонажа в поїздці чи він ліг, не дочекавшись мами після дзвінка, — пакет однаково в ящиках біля входу зранку (перевірка 2026-10-26)", () => {
    for (const rang of [false, true]) {
      const save = game();
      const at = momDay(save);
      if (rang) tickModifiers(save.current, at - 0.5, 1, false);
      else {
        away(save);
        tickModifiers(save.current, MODIFIERS.mom.until - 0.5, 1, false);
      }
      expect(save.current.today.mom?.[rang ? "rang" : "porch"], `rang ${rang}`).toBe(true);
      save.current.minute = hours(23);
      goToSleep(save);
      expect(inBoxes(save), `rang ${rang}`).toBe(2);
      expect(inFridge(save), `rang ${rang}`).toBe(0);
    }
  });

  it("сценарій «Мама з гостинцями»: о 12:03 дзвінок — «Душа компанії» біжить до дверей, сором'язлива ховається; за 2 хвилини судочки в холодильнику", () => {
    const scenario = FILE_SCENARIOS["mom-visit"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(5);
    const [host, shy] = save.current.cats;
    const { events, stop } = recordEvents();
    advance(save, 4);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(host?.act.target).toBe("guest");
    expect(shy?.act.kind).toBe("hide");
    expect(inFridge(save)).toBe(0);
    advance(save, GUESTS.ringLead);
    stop();
    expect(inFridge(save)).toBe(2);
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 1)).toBe(true);
    // Першим із холодильника — судочок (§6.4).
    walkTo(save, "fridge");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "meal", quality: "cheap", mom: true });
  });

  it("сценарій «Гостинці від мами під дверима»: пакет одразу в ящиках біля входу, «Розпакувати» — судочки в холодильнику", () => {
    const scenario = FILE_SCENARIOS["mom-porch"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(5);
    expect(save.current.cats[0]?.traits).toContainEqual(expect.objectContaining({ group: "chewing", level: 2 }));
    const { events, stop } = recordEvents();
    advance(save, 0.1);
    stop();
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 0)).toBe(true);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    expect(inBoxes(save)).toBe(2);
    expect(inFridge(save)).toBe(0);
    save.current.cats = [];
    walkTo(save, "boxes");
    interact(save);
    expect(inFridge(save)).toBe(2);
    expect(inBoxes(save)).toBe(0);
  });
});
