// Кавомашина (§8.7): одна дорога річ на стільниці кухні; чашка кави знімає «Недосип» до кінця дня (§8.8).

import { describe, expect, it } from "vitest";

import { dropEverything } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { standingTrinkets } from "../src/sim/catai";
import { coffeeStage, coffeeSurface, discardCoffee } from "../src/sim/coffee";
import { COFFEE, THINGS } from "../src/sim/config";
import { freeSlots, orderThing, place, receivePackages, utilitiesDue } from "../src/sim/economy";
import type { GameEvent } from "../src/sim/events";
import { advance, interact, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { catalog, unavailable, variants } from "../src/sim/shop";
import { lifeStory } from "../src/sim/story";
import { targetOf } from "../src/sim/targets";
import type { Dish, Save } from "../src/sim/types";
import { PERSON_ONE_SHOT_MS } from "../src/view/anim/ids";
import { personEventAnim } from "../src/view/anim/personanim";
import { COFFEE_CUP_FRAME, coffeeLook } from "../src/view/iso/looks";
import { coffeeBar } from "../src/view/iso/markslayout";
import { heldFrame } from "../src/view/iso/personlook";
import { shotPlace } from "../src/view/iso/personspot";
import { personStates } from "../src/view/personstates";
import { coffeeIcon, THING_ICONS } from "../src/view/symbols";
import { storyCaption } from "../src/texts";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

const MEAL: Dish = { kind: "meal", quality: "cheap" };

/** Гра з котом удома: речі в магазині вже є (§11.3а). */
function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 }));
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 30, at: { x: 5.5, y: 8.5 } });
  cat.traits = [];
  addCat(save.current, cat);
  return save;
}

/** Гра з кавомашиною на правій стільниці й «Недосипом»; персонаж стоїть біля машини. */
function sleepy(debt = -0.2): Save {
  const save = game();
  place(save.current, "coffee", "cheap");
  save.current.character.sleepSpeed = debt;
  standAt(save, "counter-right");
  return save;
}

/** Події кавомашини. */
const coffeeEvents = (events: readonly GameEvent[]): GameEvent[] => events.filter((e) => e.type === "coffee");

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

  it("вигляд: машина на своїй стільниці; чашка під носиком — поки кава вариться й коли готова; смуга — поки вариться; бабл — коли готова", () => {
    const save = sleepy();
    const state = save.current;
    expect(coffeeLook(state)).toEqual({ surface: "counter-right", cup: false });
    expect(coffeeBar(state)).toBeNull();
    expect(coffeeIcon(state, "counter-right")).toBeNull();
    interact(save);
    advance(save, COFFEE.brewMinutes / 2);
    expect(coffeeLook(state)).toEqual({ surface: "counter-right", cup: true });
    expect(coffeeBar(state)).toEqual({ surface: "counter-right", value: expect.closeTo(0.5) });
    expect(coffeeIcon(state, "counter-right")).toBeNull();
    advance(save, COFFEE.brewMinutes);
    expect(coffeeLook(state)).toEqual({ surface: "counter-right", cup: true });
    expect(coffeeBar(state)).toBeNull();
    // «Кава готова» — іконкою самої машини з чашкою під носиком, над її стільницею; над іншою — нічого.
    expect(coffeeIcon(state, "counter-right")).toBe(THING_ICONS.coffee);
    expect(coffeeIcon(state, "counter-left")).toBeNull();
    expect(coffeeLook(game().current)).toBeNull();
  });
});

describe("кава — як страва на плиті (§8.7, §8.8)", () => {
  it("натиснули дію — машина варить сама, без персонажа; готова чашка чекає скільки завгодно", () => {
    const save = sleepy();
    const state = save.current;
    expect(coffeeStage(state)).toBe("idle");
    const { events, stop } = recordEvents();
    interact(save);
    expect(coffeeStage(state)).toBe("brewing");
    // Персонаж вільний: нічого не тримає й ніде не зайнятий.
    expect(state.character.activity).toBeNull();
    expect(state.character.held).toBeNull();
    standAt(save, "bed");
    advance(save, COFFEE.brewMinutes - 1);
    expect(coffeeStage(state)).toBe("brewing");
    advance(save, 1);
    expect(coffeeStage(state)).toBe("ready");
    advance(save, hours(3));
    stop();
    expect(coffeeStage(state)).toBe("ready");
    expect(state.character.sleepSpeed).toBe(-0.2);
    expect(coffeeEvents(events)).toEqual([
      { type: "coffee", stage: "started", object: "counter-right" },
      { type: "coffee", stage: "ready", object: "counter-right" },
    ]);
  });

  it("натиснули біля готової чашки — персонаж її випив: «Недосипу» немає до кінця дня, машина знову вільна", () => {
    const save = sleepy();
    const state = save.current;
    interact(save);
    advance(save, COFFEE.brewMinutes);
    expect(personStates(state)).toContain("sleepDebt");
    expect(targetOf(state)?.id).toBe("counter-right");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(coffeeEvents(events)).toEqual([{ type: "coffee", stage: "drunk", object: "counter-right" }]);
    expect(state.character.sleepSpeed).toBe(0);
    expect(personStates(state)).not.toContain("sleepDebt");
    expect(coffeeStage(state)).toBe("idle");
    advance(save, hours(3));
    expect(state.character.sleepSpeed).toBe(0);
  });

  it("поки кава вариться, машина не ціль дії: натискання її не чіпає", () => {
    const save = sleepy();
    const state = save.current;
    interact(save);
    advance(save, 1);
    expect(targetOf(state)?.id).not.toBe("counter-right");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    // Натискання дістається сусідній речі (плиті), а не машині: кава вариться далі.
    expect(coffeeEvents(events)).toEqual([]);
    expect(events.every((e) => e.type !== "refused" || e.object !== "counter-right")).toBe(true);
    expect(coffeeStage(state)).toBe("brewing");
  });

  it("варити й пити можна й без «Недосипу»: бонус сну кава не чіпає", () => {
    for (const speed of [0, 0.05]) {
      const save = sleepy(speed);
      const state = save.current;
      expect(targetOf(state)?.id, String(speed)).toBe("counter-right");
      interact(save);
      advance(save, COFFEE.brewMinutes);
      interact(save);
      expect(coffeeStage(state), String(speed)).toBe("idle");
      expect(state.character.sleepSpeed, String(speed)).toBe(speed);
    }
  });

  it("утримання кнопки нічого не варить і не п'є вдруге: одне натискання — одна дія", () => {
    const save = sleepy();
    const state = save.current;
    interact(save);
    // Кнопку тримають далі, доки кава не звариться, і ще довго: чашку не випито.
    advance(save, COFFEE.brewMinutes + 30, { move: { x: 0, y: 0 }, hold: true });
    expect(coffeeStage(state)).toBe("ready");
    expect(state.character.sleepSpeed).toBe(-0.2);
  });

  it("без світла машина не варить: відмова «немає світла», почата кава чекає, а готову чашку випити можна", () => {
    const save = sleepy();
    const state = save.current;
    state.modifiers.day = "outage";
    const { events, stop } = recordEvents();
    interact(save);
    expect(events.filter((e) => e.type === "refused")).toEqual([{ type: "refused", object: "counter-right", reason: "no-power" }]);
    expect(coffeeStage(state)).toBe("idle");
    // Почата до відключення кава без світла не вариться далі.
    state.home.coffee = { surface: "counter-right", brewing: 2 };
    advance(save, COFFEE.brewMinutes * 3);
    expect(state.home.coffee).toEqual({ surface: "counter-right", brewing: 2 });
    // Готову чашку випити можна й без світла.
    state.home.coffee = { surface: "counter-right", ready: true };
    interact(save);
    stop();
    expect(coffeeEvents(events)).toEqual([{ type: "coffee", stage: "drunk", object: "counter-right" }]);
    expect(state.character.sleepSpeed).toBe(0);
  });

  it("викинули машину з готовою чашкою — нова варить спочатку", () => {
    const save = sleepy();
    const state = save.current;
    interact(save);
    advance(save, COFFEE.brewMinutes);
    discardCoffee(state);
    place(state, "coffee", "cheap");
    expect(coffeeStage(state)).toBe("idle");
  });

  it("разові анімації: запустив машину — тягнеться до кнопки; випив — підносить чашку до рота, і чашка в руці", () => {
    const started = personEventAnim({ type: "coffee", stage: "started", object: "counter-right" });
    expect(started?.anim).toBe("tap");
    expect(personEventAnim({ type: "coffee", stage: "ready", object: "counter-right" })).toBeNull();
    const drunk = personEventAnim({ type: "coffee", stage: "drunk", object: "counter-right" });
    expect(drunk).toEqual({ anim: "drink", ms: PERSON_ONE_SHOT_MS.drink });
    // Обидві — біля стільниці з машиною: персонаж повертається до неї.
    expect(shotPlace({ type: "coffee", stage: "started", object: "counter-left" })).toEqual({ object: "counter-left" });
    expect(shotPlace({ type: "coffee", stage: "drunk", object: "counter-right" })).toEqual({ object: "counter-right" });
    expect(shotPlace({ type: "coffee", stage: "ready", object: "counter-right" })).toBeNull();
    // Поки п'є, у руці — чашка (без тіні піддона); з річчю в руках каву не п'ють, тож руки порожні.
    expect(heldFrame(null, "drink")).toMatchObject({ socket: "held", frame: { id: COFFEE_CUP_FRAME.id, state: "hand" } });
    expect(COFFEE_CUP_FRAME.state).toBe("tray");
    expect(heldFrame(null, "tap")).toBeNull();
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
