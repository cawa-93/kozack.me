// Кавомашина (§8.7): одна дорога річ на стільниці кухні; чашка кави знімає «Недосип» до кінця дня (§8.8).

import { describe, expect, it } from "vitest";

import { dropEverything, useProgress } from "../src/sim/actions";
import { actionSpeed } from "../src/sim/body";
import { createCat } from "../src/sim/cat";
import { standingTrinkets } from "../src/sim/catai";
import { coffeeSurface, discardCoffee } from "../src/sim/coffee";
import { COFFEE, THINGS } from "../src/sim/config";
import { freeSlots, orderThing, place, receivePackages, utilitiesDue } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { catalog, unavailable, variants } from "../src/sim/shop";
import { lifeStory } from "../src/sim/story";
import { targetOf } from "../src/sim/targets";
import type { Dish, GameState, Save } from "../src/sim/types";
import { coffeeLook } from "../src/view/iso/looks";
import { personStates } from "../src/view/personstates";
import { storyCaption } from "../src/texts";
import { bodyMinutes, hours, recordEvents, standAt, withCatCorner } from "./helpers";

const MEAL: Dish = { kind: "meal", quality: "cheap" };

/** Кроки тіла — частки ігрової хвилини: їхня сума на округлення менша за тривалість дії, тож дія закінчується на цьому кроці. */
const LAST_STEP = 0.001;

/** Гра з котом удома: речі в магазині вже є (§11.3а). */
function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 }));
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 5.5, y: 8.5 } });
  cat.traits = [];
  addCat(save.current, cat);
  return save;
}

/** Гра з кавомашиною на правій стільниці й «Недосипом». */
function sleepy(debt = -0.2): Save {
  const save = game();
  place(save.current, "coffee", "cheap");
  save.current.character.sleepSpeed = debt;
  return save;
}

/** Тримати дію стільки хвилин тіла. */
const holdFor = (save: Save, minutes: number): void => {
  advance(save, bodyMinutes(minutes), { move: { x: 0, y: 0 }, hold: true });
};

/** Скільки хвилин тіла вариться чашка зараз: «Недосип» сповільнює й каву (§8.8). */
const cupMinutes = (state: GameState): number => COFFEE.minutes / actionSpeed(state);

describe("кавомашина в магазині (§6.4, §8.7)", () => {
  it("одна картка — найдорожча річ у грі; до першого кота її, як і решти речей, немає", () => {
    const state = game().current;
    const shown = catalog(state, "delivery").some((g) => "thing" in g && g.thing === "coffee");
    expect(shown).toBe(true);
    expect(variants({ thing: "coffee" })).toEqual(["cheap"]);
    const prices = Object.entries(THINGS).flatMap(([thing, t]) => (thing === "coffee" ? [] : Object.values(t.price)));
    expect(THINGS.coffee.price.cheap).toBeGreaterThan(Math.max(...prices));
    const fresh = newGame({ address: "she", difficulty: "normal", seed: 5 }).current;
    expect(catalog(fresh, "delivery").some((g) => "thing" in g && g.thing === "coffee")).toBe(false);
  });

  it("лише одна: їде чи вже вдома — другої не взяти; викинули — можна купити знову", () => {
    const state = game().current;
    state.character.money = 100_000;
    expect(freeSlots(state, "coffee")).toBe(1);
    expect(unavailable(state, { thing: "coffee" })).toBeNull();
    expect(orderThing(state, "coffee", "cheap")).not.toBeNull();
    expect(freeSlots(state, "coffee")).toBe(0);
    expect(orderThing(state, "coffee", "cheap")).toBeNull();
    // Картка в магазині каже чому: «уже їде», а коли машина вдома — «уже є».
    expect(unavailable(state, { thing: "coffee" })).toBe("ordered");
    // Пакунок під дверима — забрали: машина вдома.
    state.home.porch.push(...state.home.deliveries.splice(0));
    receivePackages(state);
    expect(coffeeSurface(state)).toBe("counter-right");
    expect(freeSlots(state, "coffee")).toBe(0);
    expect(unavailable(state, { thing: "coffee" })).toBe("owned");
    expect(discardCoffee(state)).toBe(true);
    expect(coffeeSurface(state)).toBeNull();
    expect(freeSlots(state, "coffee")).toBe(1);
    expect(discardCoffee(state)).toBe(false);
  });

  it("комунальні — з внеском машини, і поки вона чекає стільниці; викинули — менше", () => {
    const state = game().current;
    const before = utilitiesDue(state);
    state.home.surfaces["counter-left"] = { ...MEAL };
    state.home.surfaces["counter-right"] = { ...MEAL };
    place(state, "coffee", "cheap");
    expect(coffeeSurface(state)).toBeNull();
    expect(utilitiesDue(state)).toBe(before + THINGS.coffee.utilities);
    discardCoffee(state);
    expect(utilitiesDue(state)).toBe(before);
  });
});

describe("де стоїть кавомашина (§8.7)", () => {
  it("на вільній стільниці: спершу права, права зі стравою — ліва; стола не займає", () => {
    const right = game().current;
    place(right, "coffee", "cheap");
    expect(coffeeSurface(right)).toBe("counter-right");
    const left = game().current;
    left.home.surfaces["counter-right"] = { ...MEAL };
    place(left, "coffee", "cheap");
    expect(coffeeSurface(left)).toBe("counter-left");
    expect(left.home.surfaces["counter-right"]).toEqual(MEAL);
  });

  it("обидві стільниці зі стравами — чекає, хоч стіл і вільний, і стає на першу, що звільнилася", () => {
    const save = game();
    const state = save.current;
    state.home.surfaces["counter-left"] = { ...MEAL };
    state.home.surfaces["counter-right"] = { ...MEAL };
    place(state, "coffee", "cheap");
    expect(state.home.surfaces["table"]).toBeNull();
    expect(coffeeSurface(state)).toBeNull();
    expect(coffeeLook(state)).toBeNull();
    advance(save, 5);
    expect(coffeeSurface(state)).toBeNull();
    // Страву з лівої стільниці забрали — машина стає туди.
    standAt(save, "counter-left");
    interact(save);
    expect(state.character.held?.kind).toBe("meal");
    advance(save, 0.1);
    expect(coffeeSurface(state)).toBe("counter-left");
  });

  it("стільницю з машиною страва не займає: відмова «зайнято»", () => {
    const save = game();
    const state = save.current;
    place(state, "coffee", "cheap");
    state.character.held = { ...MEAL };
    standAt(save, "counter-right");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: "counter-right", reason: "occupied" });
    expect(state.character.held).toEqual(MEAL);
    expect(state.home.surfaces["counter-right"]).toBeNull();
  });

  it("падаючи без сил зі стравою в руках, персонаж кладе її не на стільницю з машиною", () => {
    const state = game().current;
    // Права стільниця зі стравою — машина на лівій, першій у переліку поверхонь.
    state.home.surfaces["counter-right"] = { ...MEAL };
    place(state, "coffee", "cheap");
    expect(coffeeSurface(state)).toBe("counter-left");
    state.character.held = { ...MEAL };
    dropEverything(state);
    expect(state.character.held).toBeNull();
    expect(state.home.surfaces["counter-left"]).toBeNull();
    expect(state.home.surfaces["table"]).toEqual(MEAL);
    expect(coffeeSurface(state)).toBe("counter-left");
  });

  it("на стільницю з машиною коти не вилазять: телефона з неї не скидають", () => {
    const right = game().current;
    place(right, "coffee", "cheap");
    expect(standingTrinkets(right).map((t) => t.kind)).toContain("phone");
    const left = game().current;
    left.home.surfaces["counter-right"] = { ...MEAL };
    place(left, "coffee", "cheap");
    expect(coffeeSurface(left)).toBe("counter-left");
    expect(standingTrinkets(left).map((t) => t.kind)).not.toContain("phone");
    expect(standingTrinkets(left).map((t) => t.kind)).toContain("mug");
  });

  it("вигляд: машина на своїй стільниці, поки вариться кава — з чашкою", () => {
    const save = sleepy();
    const state = save.current;
    expect(coffeeLook(state)).toEqual({ surface: "counter-right", brewing: false });
    standAt(save, "counter-right");
    holdFor(save, 1);
    expect(coffeeLook(state)).toEqual({ surface: "counter-right", brewing: true });
    expect(coffeeLook(game().current)).toBeNull();
  });
});

describe("чашка кави (§8.7, §8.8)", () => {
  it("утримання дії біля машини — і «Недосипу» немає до кінця дня", () => {
    const save = sleepy();
    const state = save.current;
    expect(personStates(state)).toContain("sleepDebt");
    standAt(save, "counter-right");
    const total = cupMinutes(state);
    const { events, stop } = recordEvents();
    holdFor(save, total / 2);
    expect(useProgress(state)).toBeCloseTo(0.5);
    expect(state.character.sleepSpeed).toBe(-0.2);
    holdFor(save, total / 2 + LAST_STEP);
    stop();
    expect(state.character.sleepSpeed).toBe(0);
    expect(state.character.activity).toBeNull();
    expect(personStates(state)).not.toContain("sleepDebt");
    expect(events.filter((e) => e.type === "coffee")).toEqual([{ type: "coffee" }]);
    // До кінця дня: час іде, а «Недосип» не вертається.
    advance(save, hours(3));
    expect(state.character.sleepSpeed).toBe(0);
  });

  it("без «Недосипу» машина не ціль дії — ні звичайного дня, ні коли персонаж виспався", () => {
    for (const speed of [0, 0.05]) {
      const save = sleepy(speed);
      standAt(save, "counter-right");
      expect(targetOf(save.current)?.id, String(speed)).not.toBe("counter-right");
      holdFor(save, COFFEE.minutes * 2);
      expect(save.current.character.sleepSpeed, String(speed)).toBe(speed);
    }
    const save = sleepy();
    standAt(save, "counter-right");
    expect(targetOf(save.current)?.id).toBe("counter-right");
  });

  it("коротке натискання каву не варить і нічого не бере", () => {
    const save = sleepy();
    const state = save.current;
    standAt(save, "counter-right");
    const { events, stop } = recordEvents();
    interact(save);
    advance(save, 0.1);
    stop();
    expect(state.character.held).toBeNull();
    expect(state.character.activity).toBeNull();
    expect(state.character.sleepSpeed).toBe(-0.2);
    expect(events.filter((e) => e.type === "refused" || e.type === "coffee")).toEqual([]);
  });

  it("одне утримання — одна чашка: друга не вариться, поки кнопку не відпустили", () => {
    const save = sleepy();
    const state = save.current;
    standAt(save, "counter-right");
    const { events, stop } = recordEvents();
    holdFor(save, cupMinutes(state) + LAST_STEP);
    expect(state.character.sleepSpeed).toBe(0);
    // Знову недоспаний (наче наступного ранку), а кнопку досі тримають.
    state.character.sleepSpeed = -0.2;
    holdFor(save, cupMinutes(state) * 2);
    expect(state.character.sleepSpeed).toBe(-0.2);
    expect(events.filter((e) => e.type === "coffee")).toHaveLength(1);
    // Відпустили й затисли знову — друга чашка.
    advance(save, 0.1);
    holdFor(save, cupMinutes(state) + LAST_STEP);
    stop();
    expect(state.character.sleepSpeed).toBe(0);
    expect(events.filter((e) => e.type === "coffee")).toHaveLength(2);
  });

  it("рух перериває, і наступна чашка вариться спочатку", () => {
    const save = sleepy();
    const state = save.current;
    standAt(save, "counter-right");
    const total = cupMinutes(state);
    holdFor(save, total / 2);
    advance(save, 0.1, { move: { x: 0, y: 1 }, hold: true });
    expect(state.character.activity).toBeNull();
    expect(state.character.sleepSpeed).toBe(-0.2);
    advance(save, 0.1);
    standAt(save, "counter-right");
    holdFor(save, total / 4);
    expect(useProgress(state)).toBeCloseTo(0.25);
  });

  it("без світла машина не працює: відмова «немає світла», кава не вариться", () => {
    const save = sleepy();
    const state = save.current;
    state.modifiers.day = "outage";
    standAt(save, "counter-right");
    expect(targetOf(state)?.id).toBe("counter-right");
    const { events, stop } = recordEvents();
    interact(save);
    holdFor(save, cupMinutes(state) * 2);
    stop();
    expect(events.filter((e) => e.type === "refused")).toEqual([{ type: "refused", object: "counter-right", reason: "no-power" }]);
    expect(state.character.sleepSpeed).toBe(-0.2);
    expect(state.character.activity).toBeNull();
  });

  it("час за кавою — «собі»", () => {
    const save = sleepy();
    const state = save.current;
    standAt(save, "counter-right");
    // Категорію часу крок бере на своєму початку: перший крок дію лише починає.
    holdFor(save, 0.01);
    const self = state.stats.minutes.self;
    holdFor(save, 2);
    expect(state.stats.minutes.self).toBeCloseTo(self + bodyMinutes(2));
  });
});

describe("кавомашина в титрах життя (§4.2)", () => {
  it("перша кавомашина — полароїд із назвою й текстом; куплена вдруге — без нового запису", () => {
    const state = game().current;
    place(state, "coffee", "cheap");
    discardCoffee(state);
    state.day += 3;
    place(state, "coffee", "cheap");
    const items = lifeStory(state).filter((i) => i.kind === "thing");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "thing", thing: "coffee", day: 0 });
    const caption = storyCaption(items[0]!, state);
    expect(caption.title.length).toBeGreaterThan(0);
    expect(caption.text).toContain("Кавомашина");
  });
});
