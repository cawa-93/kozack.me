import { describe, expect, it } from "vitest";

import { START_MONEY } from "../src/sim/config";
import { deliveryCost, hasUnpaidUtilities, landFlying, order, payUtilities, productPrice, seePhoneHints, supplyCount, unpack, useSupply, utilitiesBill, utilitiesDue } from "../src/sim/economy";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { absoluteMinute } from "../src/sim/time";
import type { Save } from "../src/sim/types";
import { hours, recordEvents, standAt, waitUntil, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 1 }));

describe("стартові запаси (§6.4)", () => {
  it("6 порцій дешевої їжі й 3 душі засобів гігієни, без ліків", () => {
    const save = game();
    // Решта запасів на старті порожні; сховища показують лише те, що вже бувало вдома.
    expect(save.current.home.supplies).toMatchObject({
      food: { cheap: 6, premium: 0 },
      humanMeds: { cheap: 0, premium: 0 },
      dressing: { cheap: 0, premium: 0 },
      hygiene: { cheap: 3, premium: 0 },
      catFood: { cheap: 0, premium: 0 },
      litter: { cheap: 0, premium: 0 },
      detergent: { cheap: 0, premium: 0 },
    });
    expect(save.current.home.acquired).toEqual(["food", "hygiene"]);
  });
});

describe("підказка телефоном (§6.4)", () => {
  it("запас уперше закінчився — підказка, доки телефон не відкриють; удруге — ні", () => {
    const { current: state } = game();
    state.home.supplies.hygiene = { cheap: 1, premium: 0 };
    useSupply(state, "hygiene");
    expect(state.home.phoneHints).toEqual(["hygiene"]);
    seePhoneHints(state);
    expect(state.home.phoneHints).toEqual([]);
    state.home.supplies.hygiene = { cheap: 1, premium: 0 };
    useSupply(state, "hygiene");
    expect(state.home.phoneHints).toEqual([]);
  });

  it("без підказки, якщо запас уже їде, і для нашийника", () => {
    const { current: state } = game();
    state.character.money = 1000;
    state.home.supplies.food = { cheap: 1, premium: 0 };
    order(state, "food", "cheap");
    useSupply(state, "food");
    state.home.supplies.collar = { cheap: 1, premium: 0 };
    useSupply(state, "collar");
    expect(state.home.phoneHints).toEqual([]);
  });
});

describe("доставка (§6.4)", () => {
  it("ціна — базова, доставка окремо: 10% бази й надбавка за складністю (правка 2026-10-23)", () => {
    for (const [difficulty, fee] of [["easy", 12], ["normal", 15], ["hard", 18]] as const) {
      const state = newGame({ address: "she", difficulty, seed: 1 }).current;
      expect(productPrice(state, "food", "cheap")).toBe(60);
      expect(productPrice(state, "hygiene", "premium")).toBe(75);
      expect(deliveryCost(state, 40)).toBe(4 + fee);
      // 10% від 15 — 1,5, округлено до 2.
      expect(deliveryCost(state, 15)).toBe(2 + fee);
    }
  });

  it("пакунок прибуває через 6 годин і чекає під дверима, доки їх не відчинять", () => {
    const save = game();
    const { events, stop } = recordEvents();
    const delivery = order(save.current, "food", "premium");
    expect(delivery?.at).toBe(absoluteMinute(0, hours(12)));
    // Окреме замовлення: 180 за товар, 18 — 10% бази й 15 — надбавка.
    expect(save.current.character.money).toBe(START_MONEY - 213);
    advance(save, hours(6) - 1);
    expect(save.current.home.porch).toEqual([]);
    advance(save, 1);
    expect(save.current.home.porch).toHaveLength(1);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    advance(save, hours(2));
    standAt(save, "door");
    interact(save);
    stop();
    expect(save.current.home.porch).toEqual([]);
    // Пакунки — у ящиках біля входу; розпакувати — і запаси в холодильнику (§6.4).
    expect(save.current.home.boxes?.food).toEqual({ cheap: 0, premium: 20 });
    unpack(save.current);
    landFlying(save.current);
    expect(save.current.home.supplies.food).toEqual({ cheap: 6, premium: 20 });
    expect(events.some((e) => e.type === "received")).toBe(true);
  });

  it("кожне замовлення — окремий пакунок", () => {
    const save = game();
    order(save.current, "food", "cheap");
    advance(save, hours(1));
    order(save.current, "hygiene", "cheap");
    advance(save, hours(6));
    standAt(save, "door");
    interact(save);
    unpack(save.current);
    landFlying(save.current);
    expect(supplyCount(save.current, "food")).toBe(6 + 20);
    expect(supplyCount(save.current, "hygiene")).toBe(3 + 15);
  });

  it("без грошей замовити не можна", () => {
    const save = game();
    save.current.character.money = 43;
    expect(order(save.current, "food", "cheap")).toBeNull();
    expect(save.current.character.money).toBe(43);
    expect(save.current.home.deliveries).toEqual([]);
  });

  it("якщо персонаж спатиме, коли прибуде пакунок, його привезуть о 09:00 наступного дня", () => {
    const save = game();
    waitUntil(save, hours(19));
    order(save.current, "food", "cheap");
    save.current.minute = hours(21);
    save.current.character.stats.satiety = 100;
    goToSleep(save);
    expect(save.current.home.deliveries[0]?.at).toBe(absoluteMinute(1, hours(9)));
    waitUntil(save, hours(9));
    expect(save.current.home.porch).toHaveLength(1);
  });

  it("пакунок, що прибуде, коли персонаж уже прокинувся (хоч і до 09:00), привозять своєї хвилини", () => {
    const save = withCatCorner(newGame({ address: "she", difficulty: "normal", chronotype: "lark", seed: 1 }));
    save.current.modifiers.day = null;
    waitUntil(save, hours(19));
    order(save.current, "food", "cheap");
    // Довга доставка («Кур'єри не встигають», §4.1): прибуде завтра о 07:00.
    const delivery = save.current.home.deliveries[0]!;
    delivery.at = absoluteMinute(1, hours(7));
    save.current.minute = hours(21);
    save.current.character.stats.satiety = 100;
    const report = goToSleep(save)!;
    expect(report.wokeMinute).toBeLessThan(hours(7));
    expect(save.current.home.deliveries[0]?.at).toBe(absoluteMinute(1, hours(7)));
  });
});

describe("рахунок за комунальні (§6.4)", () => {
  /** Прожити до неділі ввечері з такими грошима й лягти спати. */
  const sundayNight = (save: Save, money: number) => {
    save.current.day = 6;
    save.current.minute = hours(22);
    save.current.character.money = money;
    return goToSleep(save);
  };

  it("у ніч на понеділок приходить рахунок, гроші самі не знімаються", () => {
    const save = game();
    const report = sundayNight(save, 100);
    expect(report?.utilities).toEqual({ outcome: "billed", bill: 61 });
    expect(save.current.character.money).toBe(100);
    expect(utilitiesBill(save.current)).toBe(61);
    expect(hasUnpaidUtilities(save.current)).toBe(true);
  });

  it("у будні рахунку немає", () => {
    const save = game();
    save.current.minute = hours(22);
    expect(goToSleep(save)?.utilities).toBeNull();
    expect(save.current.character.money).toBe(START_MONEY);
    expect(hasUnpaidUtilities(save.current)).toBe(false);
  });

  it("сплатити в телефоні: гроші знімаються, рахунку більше немає, оплата — у гроші тижня", () => {
    const save = game();
    sundayNight(save, 100);
    const { events, stop } = recordEvents();
    expect(payUtilities(save.current)).toBe(true);
    stop();
    expect(save.current.character.money).toBe(39);
    expect(hasUnpaidUtilities(save.current)).toBe(false);
    expect(events).toContainEqual({ type: "utilities-paid", amount: 61 });
    expect(save.current.ledger?.spent.utilities).toBe(61);
    // Сплачувати більше нічого.
    expect(payUtilities(save.current)).toBe(false);
    expect(save.current.character.money).toBe(39);
  });

  it("лише всю суму: грошей менше — нічого не сплачено", () => {
    const save = game();
    sundayNight(save, 60);
    expect(payUtilities(save.current)).toBe(false);
    expect([save.current.character.money, utilitiesBill(save.current)]).toEqual([60, 61]);
  });

  it("гроші тижня — у звіт ночі на понеділок, у будні звіту немає", () => {
    const save = game();
    expect(order(save.current, "food", "cheap")).not.toBeNull();
    save.current.minute = hours(22);
    expect(goToSleep(save)?.ledger).toBeNull();
    // 60 за їжу, 6 — 10% бази й 15 — надбавка за окреме замовлення; рахунок цієї ночі ще не сплачено.
    const report = sundayNight(save, 100);
    expect(report?.ledger).toEqual({ earned: 0, spent: { supplies: 60, delivery: 21 } });
    expect(save.current.ledger).toEqual({ earned: 0, spent: {} });
  });

  it("сплачено протягом тижня — наступного понеділка просто новий рахунок", () => {
    const save = game();
    sundayNight(save, 100);
    expect(payUtilities(save.current)).toBe(true);
    expect(sundayNight(save, 0)?.utilities).toEqual({ outcome: "billed", bill: 61 });
    expect(save.current.end).toBeNull();
  });

  it("новий рахунок прийшов, а старий не сплачено, — виселення, хоч гроші й є; решта ночі не обробляється", () => {
    const save = game();
    sundayNight(save, 0);
    const dayStart = save.dayStart.day;
    const report = sundayNight(save, 1000);
    expect(report?.utilities?.outcome).toBe("evicted");
    expect(save.current.end).toBe("eviction");
    expect(report?.steps.at(-1)).toBe("utilities");
    expect(report?.steps).not.toContain("new-day");
    expect(save.dayStart.day).toBe(dayStart);
  });

  it("знижка перерахунку й ремонт — у рахунок; знижка більша за тиждень — рахунку немає, і виселяти нема за що", () => {
    const save = game();
    const state = save.current;
    const due = utilitiesDue(state);
    state.today.utilitiesDiscount = 10;
    state.home.repairs = 5;
    expect(sundayNight(save, 0)?.utilities).toEqual({ outcome: "billed", bill: due + 5 - 10, recalculated: true });
    expect([state.home.repairs, state.today.utilitiesDiscount]).toEqual([0, 0]);
    state.home.utilitiesBill = 0;
    state.today.utilitiesDiscount = due + 100;
    expect(sundayNight(save, 0)?.utilities).toEqual({ outcome: "billed", bill: 0, recalculated: true });
    expect(hasUnpaidUtilities(state)).toBe(false);
    expect(sundayNight(save, 0)?.utilities?.outcome).toBe("billed");
  });

  it("у збереженні, де комунальні знімалися самі, рахунку немає", () => {
    const state = game().current;
    delete state.home.utilitiesBill;
    expect([utilitiesBill(state), hasUnpaidUtilities(state), payUtilities(state)]).toEqual([0, false, false]);
  });
});
