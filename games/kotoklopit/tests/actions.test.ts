import { describe, expect, it } from "vitest";

import { canEat, useProgress } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { onEvent, type GameEvent } from "../src/sim/events";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { answerCall } from "../src/sim/modifiers";
import { targetOf } from "../src/sim/targets";
import { MEAL_HOLD_MS, mealHold } from "../src/view/mealpress";
import { dash } from "../src/sim/body";
import { BURN_MINUTES, COOK_MINUTES, EAT_MINUTES, HOUSEHOLD, HYGIENE_PER_HOUR, MEAL_SATIETY, MINUTES_PER_HOUR, SATIETY_PER_HOUR, SHOWER_HYGIENE, SHOWER_MINUTES } from "../src/sim/config";
import { supplyCount } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import type { Difficulty, Save } from "../src/sim/types";
import { bodyMinutes, hours, recordEvents, standAt, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 1 }));

/** Кроки тіла — частки ігрової хвилини: їхня сума на округлення менша за тривалість дії, тож дія закінчується на цьому кроці. */
const LAST_STEP = 0.001;

/** Тримати дію стільки хвилин тіла. */
const holdFor = (save: Save, minutes: number): void => {
  advance(save, bodyMinutes(minutes), { move: { x: 0, y: 0 }, hold: true });
};

/** Приготувати страву й покласти її на стіл. */
const serveMeal = (save: Save): void => {
  standAt(save, "fridge");
  interact(save);
  standAt(save, "stove");
  interact(save);
  advance(save, COOK_MINUTES);
  interact(save);
  standAt(save, "table");
  interact(save);
  // Відпустити кнопку: утримання, що триває після натискання, яке поставило страву, їсти не починає (§10).
  advance(save, 0.001);
};

describe("холодильник (§6.4, §8.7)", () => {
  it("видає сиру порцію, спершу дорогу, і приймає її назад", () => {
    const save = game();
    const supplies = save.current.home.supplies;
    supplies.food.premium = 1;
    standAt(save, "fridge");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "raw", quality: "premium" });
    expect(supplies.food).toEqual({ cheap: 6, premium: 0 });
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(supplies.food).toEqual({ cheap: 6, premium: 1 });
  });

  it("порожній холодильник — відмова", () => {
    const save = game();
    save.current.home.supplies.food.cheap = 0;
    standAt(save, "fridge");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events).toContainEqual({ type: "refused", object: "fridge", reason: "empty", product: "food" });
  });
});

describe("плита (§8.7)", () => {
  it("підгорає за складністю: 45 / 30 / 15 хвилин після готовності", () => {
    for (const [difficulty, after] of [["easy", 45], ["normal", 30], ["hard", 15]] as const) {
      const save = newGame({ address: "she", difficulty, seed: 1 });
      const stove = save.current.home.stove;
      stove.item = { kind: "meal", quality: "cheap" };
      stove.minutes = COOK_MINUTES;
      advance(save, after - 1);
      expect(stove.item?.kind).toBe("meal");
      advance(save, 1);
      expect(stove.item?.kind).toBe("burnt");
    }
  });

  it("страва готова за 20 хвилин, підгорає ще через 30 на середній, а підгорілу викидають", () => {
    const save = game();
    standAt(save, "fridge");
    interact(save);
    standAt(save, "stove");
    interact(save);
    const stove = save.current.home.stove;
    expect(stove.item?.kind).toBe("raw");
    advance(save, COOK_MINUTES - 1);
    expect(stove.item?.kind).toBe("raw");
    advance(save, 1);
    expect(stove.item?.kind).toBe("meal");
    advance(save, BURN_MINUTES.normal - COOK_MINUTES - 1);
    expect(stove.item?.kind).toBe("meal");
    advance(save, 1);
    expect(stove.item?.kind).toBe("burnt");
    interact(save);
    expect(save.current.character.held?.kind).toBe("burnt");
    standAt(save, "trash");
    interact(save);
    expect(save.current.character.held).toBeNull();
  });

  it("зняту до готовності порцію кладуть назад — вона готується далі; через холодильник — знову сира", () => {
    const save = game();
    const onStove = (): string | undefined => save.current.home.stove.item?.kind;
    standAt(save, "fridge");
    interact(save);
    standAt(save, "stove");
    interact(save);
    advance(save, COOK_MINUTES / 2);
    interact(save);
    expect(save.current.character.held).toMatchObject({ kind: "raw" });
    standAt(save, "table");
    interact(save);
    advance(save, COOK_MINUTES);
    interact(save);
    standAt(save, "stove");
    interact(save);
    advance(save, COOK_MINUTES / 2 + 0.01);
    expect(onStove()).toBe("meal");

    // Та сама половина готування, але порцію поклали в холодильник: з нього вона — свіжа.
    save.current.home.stove.item = null;
    standAt(save, "fridge");
    interact(save);
    standAt(save, "stove");
    interact(save);
    advance(save, COOK_MINUTES / 2);
    interact(save);
    standAt(save, "fridge");
    interact(save);
    interact(save);
    standAt(save, "stove");
    interact(save);
    advance(save, COOK_MINUTES / 2 + 0.01);
    expect(onStove()).toBe("raw");
  });

  it("на зайняту плиту нічого не покласти", () => {
    const save = game();
    save.current.home.stove.item = { kind: "raw", quality: "cheap" };
    save.current.character.held = { kind: "raw", quality: "cheap" };
    standAt(save, "stove");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: "stove", reason: "occupied" });
  });

  it("страва, що лишилася на плиті на ніч, підгорає", () => {
    const save = game();
    save.current.home.stove = { item: { kind: "meal", quality: "cheap" }, minutes: COOK_MINUTES };
    save.current.minute = hours(22);
    standAt(save, "bed");
    interact(save);
    expect(save.current.home.stove.item?.kind).toBe("burnt");
  });

  it("уночі плита готує й підгорає своїм часом: свіжу страву голодний «Злодюжка» краде лише до того, як вона підгоріла (загальна ревізія 2026-10-29)", () => {
    /** Ніч із 22:00: на плиті готова страва чи сира порція, злодюжка з заданим голодом, миски порожні. */
    const night = (seed: number, item: "meal" | "raw", hunger: number) => {
      const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
      const cat = createCat(save.current, createRng(seed), { source: "shelter", ageWeeks: 10, at: { x: 5.5, y: 8.5 } });
      cat.traits = [{ group: "thief", level: 2, seen: 0, known: false }];
      cat.arrivedDay = -10;
      cat.needs.hunger = hunger;
      addCat(save.current, cat);
      for (const i of save.current.home.items) if (i.kind === "bowl") i.food = 0;
      save.current.home.stove = { item: { kind: item, quality: "cheap" }, minutes: item === "meal" ? COOK_MINUTES : 0 };
      save.current.minute = hours(22);
      const start = save.current.minute;
      let stoleAt: number | null = null;
      const stop = onEvent((e, state) => {
        if (e.type === "stole" && e.object === "stove") stoleAt = state.minute - start;
      });
      standAt(save, "bed");
      interact(save);
      stop();
      return { kind: save.current.home.stove.item?.kind ?? null, stoleAt: stoleAt as number | null };
    };
    let burnt = 0;
    for (let seed = 1; seed <= 20; seed++) {
      // Кіт ще не голодний: поки зголодніє, страва вже підгоріла (раніше її крали посеред ночі).
      if (night(seed, "meal", 40).kind === "burnt") burnt += 1;
      // Дуже голодний краде — але лише поки страва не підгоріла, як і вдень.
      const { kind, stoleAt } = night(seed, "meal", 90);
      if (kind !== "burnt") expect(stoleAt ?? Infinity).toBeLessThanOrEqual(BURN_MINUTES.normal - COOK_MINUTES);
      // Сира порція за ніч стає стравою, а потім підгорає.
      expect(night(seed, "raw", 40).kind).toBe("burnt");
    }
    expect(burnt).toBeGreaterThan(15);
  });
});

describe("їжа за столом (§8.7)", () => {
  /** Час іде без кнопки й без руху. */
  const wait = (save: Save, minutes: number): void => {
    advance(save, bodyMinutes(minutes));
  };

  it("натиснули дію біля страви — персонаж сідає й їсть сам, без утримання, 10 хвилин тіла", () => {
    const save = game();
    serveMeal(save);
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
    expect(canEat(save.current)).toBe(true);
    // Голодний персонаж: порція не впирається в стелю 100.
    save.current.character.stats.satiety = 30;
    const satiety = save.current.character.stats.satiety;
    const { events, stop } = recordEvents();
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "table" });
    wait(save, 5);
    expect(useProgress(save.current)).toBeCloseTo(0.5);
    wait(save, 5 + LAST_STEP);
    stop();
    expect(save.current.home.surfaces["table"]).toBeNull();
    expect(save.current.character.activity).toBeNull();
    expect(canEat(save.current)).toBe(false);
    // Ситість за час їжі трохи спала, але порція додала свою частку.
    expect(save.current.character.stats.satiety).toBeCloseTo(satiety + MEAL_SATIETY.cheap + (SATIETY_PER_HOUR * bodyMinutes(EAT_MINUTES)) / MINUTES_PER_HOUR);
    expect(events).toContainEqual({ type: "ate", satiety: MEAL_SATIETY.cheap, food: 5 });
  });

  it("тримати кнопку біля страви — теж сісти й їсти; відпущена кнопка їжі не спиняє", () => {
    const save = game();
    serveMeal(save);
    holdFor(save, 4);
    expect(useProgress(save.current)).toBeCloseTo(0.4);
    wait(save, 3);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "table" });
    expect(useProgress(save.current)).toBeCloseTo(0.7);
  });

  it("ситість приходить разом зі смугою: устали на половині — пів порції, решта лишається на столі й доїдається за решту часу", () => {
    const save = game();
    serveMeal(save);
    save.current.character.stats.satiety = 30;
    const decay = (minutes: number): number => (SATIETY_PER_HOUR * bodyMinutes(minutes)) / MINUTES_PER_HOUR;
    interact(save);
    wait(save, 5);
    expect(save.current.character.stats.satiety).toBeCloseTo(30 + MEAL_SATIETY.cheap / 2 + decay(5));
    // Рух піднімає з-за столу.
    advance(save, 0.1, { move: { x: 1, y: 0 }, hold: false });
    expect(save.current.character.activity).toBeNull();
    expect(save.current.home.surfaces["table"]).toMatchObject({ kind: "meal", eaten: expect.closeTo(0.5) });
    // Персонаж знову за столом: смуга продовжується з половини, а не з нуля.
    standAt(save, "table");
    const satiety = save.current.character.stats.satiety;
    const { events, stop } = recordEvents();
    interact(save);
    wait(save, 1);
    expect(useProgress(save.current)).toBeCloseTo(0.6);
    wait(save, 4 + LAST_STEP);
    stop();
    expect(save.current.home.surfaces["table"]).toBeNull();
    expect(save.current.character.stats.satiety).toBeCloseTo(satiety + MEAL_SATIETY.cheap / 2 + decay(5));
    expect(events.filter((e) => e.type === "ate")).toHaveLength(1);
  });

  it("страву на столі не взяти назад коротким натисканням", () => {
    const save = game();
    serveMeal(save);
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
  });

  it("натиснули дію ще раз — устали з-за столу; та сама кнопка, яку ще тримають, назад не садить", () => {
    const save = game();
    serveMeal(save);
    interact(save);
    wait(save, 2);
    interact(save);
    expect(save.current.character.activity).toBeNull();
    expect(save.current.home.surfaces["table"]).toMatchObject({ kind: "meal", eaten: expect.closeTo(0.2) });
    holdFor(save, 3);
    expect(save.current.character.activity).toBeNull();
    // Відпустили — і можна сісти знову.
    advance(save, 0.1);
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "table" });
  });

  it("напрям, затиснутий, коли сідали, не піднімає; відпустили й рушили — піднімає", () => {
    const save = game();
    serveMeal(save);
    interact(save);
    advance(save, bodyMinutes(1), { move: { x: 1, y: 0 }, hold: false });
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "table" });
    expect(useProgress(save.current)).toBeCloseTo(0.1);
    wait(save, 1);
    advance(save, 0.1, { move: { x: 1, y: 0 }, hold: false });
    expect(save.current.character.activity).toBeNull();
  });

  it("за столом без їжі персонаж не сидить: страву вкрали — устав; відповів мамі — устав", () => {
    const stolen = game();
    serveMeal(stolen);
    interact(stolen);
    wait(stolen, 2);
    stolen.current.home.surfaces["table"] = null;
    wait(stolen, 0.1);
    expect(stolen.current.character.activity).toBeNull();

    const called = game();
    serveMeal(called);
    interact(called);
    wait(called, 2);
    called.current.today.callPending = true;
    expect(answerCall(called.current)).toBe(true);
    expect(called.current.character.activity).toBeNull();
    expect(called.current.home.surfaces["table"]).toMatchObject({ kind: "meal", eaten: expect.closeTo(0.2) });
  });

  it("наситився до межі — устає сам, решта страви лишається на столі; кнопку ще тримають — назад не сідає", () => {
    const save = game();
    serveMeal(save);
    save.current.character.stats.satiety = 90;
    const { events, stop } = recordEvents();
    holdFor(save, EAT_MINUTES / 2);
    stop();
    expect(save.current.character.activity).toBeNull();
    expect(save.current.character.holdSpent).toBe(true);
    expect(save.current.character.stats.satiety).toBeCloseTo(100, 0);
    // До межі бракувало 10 із 40 — з'їдено чверть порції.
    expect(save.current.home.surfaces["table"]).toMatchObject({ kind: "meal", eaten: expect.closeTo(0.25, 1) });
    expect(events.some((e) => e.type === "ate")).toBe(false);
  });

  it("ривок перериває їжу, як рух, і нова дія не почнеться, поки кнопку не відпустили (§10, загальна ревізія 2026-10-29)", () => {
    const save = game();
    serveMeal(save);
    holdFor(save, 3);
    expect(save.current.character.activity?.kind).toBe("use");
    // Спиною до столу: ривок несе геть від страви.
    const body = save.current.character.body;
    body.facing = { x: -body.facing.x, y: -body.facing.y };
    const { events, stop } = recordEvents();
    expect(dash(save.current)).toBe(true);
    expect(save.current.character.activity).toBeNull();
    holdFor(save, EAT_MINUTES + 1);
    stop();
    expect(save.current.character.activity).toBeNull();
    expect(events.some((e) => e.type === "ate")).toBe(false);
    expect(save.current.home.surfaces["table"]?.kind).toBe("meal");
    // Відпустили кнопку — і знову можна діяти.
    advance(save, 0.1);
    expect(save.current.character.holdSpent).toBe(false);
  });
});

describe("страву поставили й тримають кнопку далі (§8.7, §10)", () => {
  it("кнопку тримають MEAL_HOLD_MS після того, як поставили страву, — це ще одне натискання: сісти їсти; відпустили раніше — лише поставили", () => {
    expect(mealHold(null, 1000, true)).toBe("idle");
    expect(mealHold(1000, 1000 + MEAL_HOLD_MS - 1, true)).toBe("wait");
    expect(mealHold(1000, 1000 + MEAL_HOLD_MS, true)).toBe("sit");
    expect(mealHold(1000, 1000 + 50, false)).toBe("idle");
    expect(mealHold(1000, 1000 + MEAL_HOLD_MS * 2, false)).toBe("idle");
    // Довше за звичайне коротке натискання, але не чекати довго.
    expect(MEAL_HOLD_MS).toBeGreaterThanOrEqual(200);
    expect(MEAL_HOLD_MS).toBeLessThanOrEqual(500);
  });

  it("щойно поставлену страву можна їсти: сцена знає, що натискання її поставило", () => {
    const save = game();
    standAt(save, "fridge");
    interact(save);
    standAt(save, "stove");
    interact(save);
    advance(save, COOK_MINUTES);
    interact(save);
    standAt(save, "table");
    expect(canEat(save.current)).toBe(false);
    interact(save);
    expect(canEat(save.current)).toBe(true);
    // Те саме натискання, що поставило страву, їсти не починає — доки сцена не натисне ще раз.
    holdFor(save, 2);
    expect(save.current.character.activity).toBeNull();
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "table" });
  });
});

describe("душ (§8.7)", () => {
  /** Зайти в кабіну з такою гігієною, засобами й чистим одягом. */
  const enter = (hygiene: number, supply: { cheap: number; premium: number } = { cheap: 2, premium: 0 }, clothes = 5, difficulty: Difficulty = "normal"): Save => {
    const save = withCatCorner(newGame({ address: "she", difficulty, seed: 1 }));
    save.current.character.stats.hygiene = hygiene;
    save.current.home.clothes = clothes;
    save.current.home.supplies.hygiene = { ...supply };
    standAt(save, "shower");
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "shower", inside: true });
    return save;
  };
  /** Стояти в кабіні, доки персонаж не вийде сам; скільки хвилин тіла це зайняло. */
  const wash = (save: Save): number => {
    let minutes = 0;
    while (save.current.character.activity !== null && minutes < 2 * SHOWER_MINUTES) {
      advance(save, bodyMinutes(0.25));
      minutes += 0.25;
    }
    return minutes;
  };
  /** Скільки гігієни спадає саме за стільки хвилин тіла. */
  const decay = (minutes: number): number => (HYGIENE_PER_HOUR * bodyMinutes(minutes)) / MINUTES_PER_HOUR;
  const AWAY = { move: { x: 0, y: 1 }, hold: false };
  const showered = (events: readonly GameEvent[]): GameEvent[] => events.filter((e) => e.type === "showered");

  it("натиснути — і 10 хвилин тіла в кабіні: гігієна росте залежно від засобів", () => {
    for (const [supply, hygiene] of [
      [{ cheap: 1, premium: 0 }, SHOWER_HYGIENE.cheap],
      [{ cheap: 1, premium: 1 }, SHOWER_HYGIENE.premium],
      [{ cheap: 0, premium: 0 }, SHOWER_HYGIENE.none],
    ] as const) {
      const save = game();
      const stats = save.current.character.stats;
      stats.hygiene = 20;
      save.current.home.supplies.hygiene = { ...supply };
      standAt(save, "shower");
      interact(save);
      advance(save, bodyMinutes(SHOWER_MINUTES) + LAST_STEP);
      expect(stats.hygiene).toBeCloseTo(20 + hygiene + (HYGIENE_PER_HOUR * bodyMinutes(SHOWER_MINUTES)) / MINUTES_PER_HOUR);
      expect(supplyCount(save.current, "hygiene")).toBe(Math.max(0, supply.cheap + supply.premium - 1));
    }
  });

  it("гігієна росте разом зі смугою; засіб діє від першої хвилини, а витрачається, щойно душ дав більше, ніж увесь душ без засобів", () => {
    const save = enter(20, { cheap: 1, premium: 0 });
    const stats = save.current.character.stats;
    const { events, stop } = recordEvents();
    // Хвилина з дешевим засобом — менше, ніж дає весь душ без засобів: засіб ще на полиці.
    expect(SHOWER_HYGIENE.cheap / SHOWER_MINUTES).toBeLessThan(SHOWER_HYGIENE.none);
    advance(save, bodyMinutes(1));
    expect(stats.hygiene).toBeCloseTo(20 + SHOWER_HYGIENE.cheap / SHOWER_MINUTES + decay(1));
    expect(supplyCount(save.current, "hygiene")).toBe(1);
    // Дві хвилини — уже більше: засіб витрачено.
    expect((2 * SHOWER_HYGIENE.cheap) / SHOWER_MINUTES).toBeGreaterThan(SHOWER_HYGIENE.none);
    advance(save, bodyMinutes(1));
    expect(supplyCount(save.current, "hygiene")).toBe(0);
    advance(save, bodyMinutes(SHOWER_MINUTES / 2 - 2));
    stop();
    expect(useProgress(save.current)).toBeCloseTo(0.5);
    expect(stats.hygiene).toBeCloseTo(20 + SHOWER_HYGIENE.cheap / 2 + decay(SHOWER_MINUTES / 2));
    expect(events.filter((e) => e.type === "supply-used")).toEqual([{ type: "supply-used", product: "hygiene", left: 0 }]);
  });

  it("рух виводить із кабіни: набране лишається, а засіб, що не встиг витратитися, — на полиці", () => {
    const save = enter(20);
    const { x, y } = save.current.character.body;
    const { events, stop } = recordEvents();
    advance(save, bodyMinutes(1));
    advance(save, bodyMinutes(0.5), { ...AWAY, hold: true });
    stop();
    expect(save.current.character.activity).toBeNull();
    expect(save.current.character.body).not.toMatchObject({ x, y });
    expect(save.current.character.stats.hygiene).toBeCloseTo(20 + SHOWER_HYGIENE.cheap / SHOWER_MINUTES, 0);
    expect(supplyCount(save.current, "hygiene")).toBe(2);
    expect(showered(events)).toEqual([{ type: "showered", hygiene: expect.closeTo(SHOWER_HYGIENE.cheap / SHOWER_MINUTES, 1), quality: null, left: 2 }]);
    // Кнопку ще тримають — нова дія не почнеться, поки її не відпустили (§10).
    expect(save.current.character.holdSpent).toBe(true);
  });

  it("напрям, затиснутий, коли заходили, не виводить; відпустили й рушили — виводить", () => {
    const save = enter(20);
    const { x, y } = save.current.character.body;
    advance(save, bodyMinutes(2), AWAY);
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true });
    expect(save.current.character.body).toMatchObject({ x, y });
    advance(save, 0.01);
    advance(save, 0.01, AWAY);
    expect(save.current.character.activity).toBeNull();
  });

  it("натиснули дію ще раз — вийшли з кабіни; наступне натискання заводить знову, і душ починається спочатку", () => {
    const save = enter(20);
    const { events, stop } = recordEvents();
    advance(save, bodyMinutes(1));
    interact(save);
    stop();
    expect(save.current.character.activity).toBeNull();
    expect(supplyCount(save.current, "hygiene")).toBe(2);
    expect(showered(events)).toHaveLength(1);
    advance(save, 0.01);
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", target: "shower", inside: true, progress: 0 });
  });

  it("гігієна дійшла до межі — персонаж виходить сам; засіб цілий, якщо душ дав не більше, ніж без засобів", () => {
    for (const [clothes, hygiene, used] of [[5, 95, 0], [0, 35, 0], [5, 80, 1], [0, 20, 1]] as const) {
      const save = enter(hygiene, { cheap: 2, premium: 0 }, clothes);
      const { events, stop } = recordEvents();
      const minutes = wash(save);
      stop();
      const label = `одягу ${clothes}, гігієна ${hygiene}`;
      expect(minutes, label).toBeLessThan(SHOWER_MINUTES / 2);
      expect(save.current.character.stats.hygiene, label).toBeCloseTo(clothes > 0 ? 100 : HOUSEHOLD.noClothesHygieneCeiling.normal, 0);
      expect(supplyCount(save.current, "hygiene"), label).toBe(2 - used);
      expect(showered(events), label).toHaveLength(1);
      expect(showered(events)[0], label).toMatchObject({ quality: used === 1 ? "cheap" : null, left: 2 - used });
    }
  });

  it("у брудному одязі душ не піднімає гігієну вище межі за складністю — на ній персонаж виходить сам, — а падає вона вдвічі швидше", () => {
    const ceilings: Record<Difficulty, number> = { easy: 50, normal: 40, hard: 30, ukro: 24 };
    expect(HOUSEHOLD.noClothesHygieneCeiling).toEqual(ceilings);
    for (const difficulty of Object.keys(ceilings) as Difficulty[]) {
      const save = enter(20, { cheap: 0, premium: 1 }, 0, difficulty);
      const stats = save.current.character.stats;
      expect(wash(save), difficulty).toBeLessThan(SHOWER_MINUTES);
      expect(stats.hygiene, difficulty).toBeCloseTo(ceilings[difficulty], 0);
      advance(save, 60);
      expect(stats.hygiene, difficulty).toBeCloseTo(ceilings[difficulty] - 3 * HOUSEHOLD.noClothesHygiene, 0);
    }
  });

  it("тримали кнопку, поки персонаж не вийшов на межі, — нова дія не почнеться, поки не відпустили", () => {
    const save = enter(95);
    for (let i = 0; i < 20 && save.current.character.activity !== null; i++) advance(save, bodyMinutes(0.25), { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity).toBeNull();
    expect(save.current.character.holdSpent).toBe(true);
  });

  it("душ зі збереження, де засіб узято ще на вході в кабіну, вдруге його не бере", () => {
    const save = game();
    save.current.character.stats.hygiene = 20;
    save.current.home.supplies.hygiene = { cheap: 1, premium: 0 };
    standAt(save, "shower");
    save.current.character.activity = { kind: "use", target: "shower", progress: 1, inside: true, wash: { hygiene: SHOWER_HYGIENE.cheap, quality: "cheap" } };
    const { events, stop } = recordEvents();
    expect(wash(save)).toBeCloseTo(SHOWER_MINUTES - 1, 0);
    stop();
    expect(supplyCount(save.current, "hygiene")).toBe(1);
    expect(showered(events)).toEqual([{ type: "showered", hygiene: SHOWER_HYGIENE.cheap, quality: "cheap", left: 1 }]);
  });

  it("сповільнення подовжує душ (§8.8)", () => {
    const save = game();
    save.current.minute = hours(22.5);
    // Брудний персонаж: за цей час гігієна не дійде до межі, і душ не скінчиться раніше.
    save.current.character.stats.hygiene = 20;
    standAt(save, "shower");
    interact(save);
    advance(save, bodyMinutes(SHOWER_MINUTES));
    expect(useProgress(save.current)).toBeCloseTo(0.8);
  });

  it("ривок у кабіні не діє", () => {
    const save = enter(20);
    advance(save, bodyMinutes(1));
    expect(dash(save.current)).toBe(false);
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true });
  });

  it("утриманням у душ не зайти", () => {
    const save = game();
    standAt(save, "shower");
    holdFor(save, 10);
    expect(save.current.character.activity).toBeNull();
  });

  it("з річчю в руках у душ не піти", () => {
    const save = game();
    save.current.character.held = { kind: "raw", quality: "cheap" };
    standAt(save, "shower");
    holdFor(save, 10);
    expect(save.current.character.activity).toBeNull();
  });
});

describe("ліжко (§8.8)", () => {
  it("зарано лягати — відмова; з порожніми руками у вікні сну — ніч", () => {
    const save = game();
    standAt(save, "bed");
    const { events, stop } = recordEvents();
    expect(interact(save)).toBeNull();
    save.current.minute = hours(21);
    save.current.character.held = { kind: "meal", quality: "cheap" };
    expect(interact(save)).toBeNull();
    save.current.character.held = null;
    const report = interact(save);
    stop();
    expect(report?.sleptHours).toBe(9);
    expect(events.filter((e) => e.type === "refused").map((e) => e.type === "refused" && e.reason)).toEqual([
      "too-early",
      "hands-full",
    ]);
    expect(events.some((e) => e.type === "night")).toBe(true);
  });

  it("падаючи без сил, персонаж упускає річ: сира порція — в холодильник; уранці він біля ліжка", () => {
    const save = game();
    save.current.character.held = { kind: "raw", quality: "premium" };
    standAt(save, "computer");
    save.current.minute = hours(23.9);
    advance(save, hours(1));
    const { held, body } = save.current.character;
    expect(held).toBeNull();
    expect(save.current.home.supplies.food.premium).toBe(1);
    expect(save.current.day).toBe(1);
    expect({ x: body.x, y: body.y }).toEqual({ x: 2.5, y: 2.5 });
  });
});

describe("робочі поверхні", () => {
  it("на поверхню кладуть і з неї беруть будь-яку річ", () => {
    const save = game();
    save.current.character.held = { kind: "meal", quality: "cheap" };
    standAt(save, "counter-right");
    interact(save);
    expect(save.current.home.surfaces["counter-right"]).toEqual({ kind: "meal", quality: "cheap" });
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "meal", quality: "cheap" });
  });
});

describe("безлад як ціль (§10)", () => {
  it("з річчю в руках безлад біля смітника не заступає його", () => {
    const save = game();
    standAt(save, "trash");
    const body = save.current.character.body;
    save.current.home.messes.push({ id: 1, kind: "vomit", x: body.x, y: body.y, cat: null });
    expect(targetOf(save.current)?.id).toBe("mess:1");
    save.current.character.held = { kind: "burnt", quality: "cheap" };
    expect(targetOf(save.current)?.id).toBe("trash");
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(save.current.home.messes).toHaveLength(1);
  });

  it("з річчю в руках іграшка перед плитою не заступає її", () => {
    const save = game();
    standAt(save, "stove");
    const body = save.current.character.body;
    const toy = save.current.home.items.find((i) => i.kind === "toy")!;
    Object.assign(toy, { x: body.x, y: body.y });
    body.facing = { x: 0, y: 1 };
    expect(targetOf(save.current)?.id).toBe(`item:${toy.id}`);
    save.current.character.held = { kind: "raw", quality: "cheap" };
    expect(targetOf(save.current)?.id).not.toBe(`item:${toy.id}`);
    body.facing = { x: 0, y: -1 };
    expect(targetOf(save.current)?.id).toBe("stove");
    interact(save);
    expect(save.current.home.stove.item?.kind).toBe("raw");
  });
});
