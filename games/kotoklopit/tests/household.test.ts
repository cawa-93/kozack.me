// Побут і догляд (§7, §8.7, §9.10): ласощі, нашийник, купання, прання, шерсть і пилосос, техніка, поломки.

import { describe, expect, it } from "vitest";

import { bathe, giveTreat, nightlyCare, putCollar } from "../src/sim/care";
import { changeLove, createCat, idleAct } from "../src/sim/cat";
import { addSupply, discardAppliance, discardCarrier, discardLock, freeSlots, place, receivePackages, tickDeliveries, utilitiesDue } from "../src/sim/economy";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { bathMinutes, useProgress } from "../src/sim/actions";
import { annoyingMesses, discardFeeder, emptyFeeder, hygieneFactor, nightlyHousehold, robotProgress, tapWasher, tickHousehold, wearOut } from "../src/sim/household";
import { tickCats } from "../src/sim/catai";
import { stun } from "../src/sim/body";
import { tickModifiers } from "../src/sim/modifiers";
import { addCat, giveStarterPack } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { FEEDER_CAPACITY } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { checkout, room, unavailable } from "../src/sim/shop";
import type { BowlItem, Cat, Feeder, LitterItem, Quality, Save, TraitLevel } from "../src/sim/types";
import { careCard, hasCareSupplies } from "../src/ui/cards";
import { holdUntilDone, hours, recordEvents, standAt, walkTo, withCatCorner } from "./helpers";

const always = () => ({ ...createRng(1), chance: () => true });
const never = () => ({ ...createRng(1), chance: () => false });

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  return save;
}

function held(save: Save, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 3, at: { x: 9.5, y: 8.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  save.current.character.held = { kind: "cat", cat: cat.id };
  return cat;
}

function firstBowl(save: Save): BowlItem {
  const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
  if (!bowl) throw new Error("немає миски");
  return bowl;
}

describe("ласощі й нашийник (§7, §9.10)", () => {
  it("ласощі одразу після неприємного повертають половину втраченої любові", () => {
    const save = game();
    const cat = held(save);
    save.current.home.supplies.treats = { cheap: 5, premium: 0 };
    cat.love = 50;
    changeLove(save.current, cat, -4, "ліки");
    const after = cat.love;
    giveTreat(save.current, "cheap", never());
    expect(cat.love).toBeCloseTo(after + 2 + 2);
  });

  it("нашийник: дешевий іноді губиться", () => {
    const save = game();
    const cat = held(save);
    save.current.home.supplies.collar = { cheap: 1, premium: 0 };
    expect(putCollar(save.current, "cheap")).toBe(true);
    expect(cat.collar?.quality).toBe("cheap");
    nightlyCare(save.current, always());
    expect(cat.collar).toBeNull();
  });

  it("картка догляду — меню без головної дії, а такий самий нашийник не пропонується (загальна ревізія 2026-10-29)", () => {
    const save = game();
    const cat = held(save);
    save.current.home.supplies.pills = { cheap: 2, premium: 0 };
    save.current.home.supplies.treats = { cheap: 3, premium: 0 };
    const card = (): ReturnType<typeof careCard> => careCard(save.current, cat, () => undefined, () => undefined);
    // Пробіл чи Enter нічого не обирають за гравця: раніше таблетки були головною дією, і другий пробіл давав ліки здоровому коту.
    expect(card().actions.length).toBeGreaterThan(0);
    expect(card().actions.some((a) => a.primary)).toBe(false);
    // У дешевому нашийнику, а в запасі лише дешевий — варіанта немає; з'явився дорогий — є.
    save.current.home.supplies = { ...save.current.home.supplies, pills: { cheap: 0, premium: 0 }, treats: { cheap: 0, premium: 0 }, collar: { cheap: 1, premium: 0 } };
    cat.collar = { quality: "cheap", bell: false };
    expect(card().actions).toEqual([]);
    expect(hasCareSupplies(save.current, cat)).toBe(false);
    expect(putCollar(save.current, "cheap")).toBe(false);
    expect(save.current.home.supplies.collar.cheap).toBe(1);
    save.current.home.supplies.collar.premium = 1;
    expect(hasCareSupplies(save.current, cat)).toBe(true);
    expect(card().actions.map((a) => a.label)).toHaveLength(1);
    expect(putCollar(save.current, "premium")).toBe(true);
    expect(cat.collar?.quality).toBe("premium");
    // Тепер у дорогому — дешевий знову можна надягти (заміна за §9.10).
    expect(card().actions).toHaveLength(1);
  });
});

describe("купання (§8.7)", () => {
  it("кота несуть до душу; «Водолаз» радіє, інший ображається", () => {
    const save = game();
    const lover = held(save, { water: 2 });
    save.current.home.supplies.shampoo = { cheap: 5, premium: 0 };
    standAt(save, "shower");
    const mood = lover.mood;
    const sanity = save.current.character.stats.sanity;
    interact(save);
    // Купання займає час (рішення автора 2026-10-28): спершу кабіна, ефекти — наприкінці.
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true, bath: true });
    expect(save.current.home.supplies.shampoo.cheap).toBe(5);
    for (let i = 0; i < 60 && save.current.character.activity !== null; i++) advance(save, 0.5);
    expect(lover.mood).toBeGreaterThan(mood);
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    expect(save.current.home.supplies.shampoo.cheap).toBe(4);
    const other = held(save);
    const love = other.love;
    bathe(save.current, never());
    expect(other.love).toBeLessThan(love);
  });

  it("кіт, що пручається, посеред купання не виривається — купання завершується; смуга від тривалості купання; час — на котів (перевірка купання 2026-10-28)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      save.current.home.supplies.shampoo = { cheap: 5, premium: 0 };
      held(save, { lap: -2, water: -1 });
      standAt(save, "shower");
      const cats = save.current.stats.minutes.cats;
      const { events, stop } = recordEvents();
      interact(save);
      advance(save, 10);
      expect(useProgress(save.current)).toBeCloseTo(10 / 15, 1);
      for (let i = 0; i < 40 && save.current.character.activity !== null; i++) advance(save, 0.5);
      stop();
      expect(events).toContainEqual(expect.objectContaining({ type: "bathed" }));
      expect(save.current.home.supplies.shampoo.cheap).toBe(4);
      expect(save.current.stats.minutes.cats - cats).toBeGreaterThanOrEqual(14);
    }
  });

  it("купання триває 10 хвилин, «Водобоязнь» — удвічі довше; без шампуню не почати (рішення автора 2026-10-28)", () => {
    const save = game();
    save.current.home.supplies.shampoo = { cheap: 5, premium: 0 };
    held(save);
    expect(bathMinutes(save.current)).toBe(10);
    held(save, { water: -2 });
    expect(bathMinutes(save.current)).toBe(20);
    standAt(save, "shower");
    const start = save.current.minute;
    interact(save);
    for (let i = 0; i < 100 && save.current.character.activity !== null; i++) advance(save, 0.5);
    expect(save.current.minute - start).toBeGreaterThanOrEqual(19.5);
    save.current.home.supplies.shampoo = { cheap: 0, premium: 0 };
    held(save);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused" }));
    expect(save.current.character.activity).toBeNull();
  });
});

describe("прання (§8.7)", () => {
  it("спершу вигнати кота з барабана, потім прання 60 хвилин і розвісити", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.x = 10.5;
    cat.y = 1.5;
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    save.current.home.supplies.detergent.cheap = 4;
    expect(tapWasher(save.current)).toBe("cat");
    expect(tapWasher(save.current)).toBe("started");
    tickHousehold(save.current, 600, 61);
    expect(save.current.home.washer.state).toBe("done");
    save.current.home.clothes = 0;
    expect(hygieneFactor(save.current)).toBeGreaterThan(1);
    expect(tapWasher(save.current)).toBe("hung");
    expect(save.current.home.clothes).toBe(7);
  });
});

describe("прання з повною шафою (§8.7, загальна ревізія 2026-10-29)", () => {
  it("чистого одягу не менше, ніж дасть засіб, що береться першим, — відмова, засіб лишається, машина не запускається", () => {
    const save = game();
    save.current.home.clothes = 7;
    save.current.home.supplies.detergent = { cheap: 2, premium: 0 };
    standAt(save, "washer");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused", reason: "clothes-clean" }));
    expect(save.current.home.supplies.detergent).toEqual({ cheap: 2, premium: 0 });
    expect(save.current.home.washer.state).toBe("idle");
    // Дорогий засіб береться першим і дає 8 днів: при 7 прання ще корисне.
    save.current.home.supplies.detergent.premium = 1;
    expect(tapWasher(save.current)).toBe("started");
    expect(save.current.home.supplies.detergent).toEqual({ cheap: 2, premium: 0 });
    // З дорогим засобом відмова — від 8 днів.
    save.current.home.washer = { state: "idle", minutes: 0, quality: "cheap" };
    save.current.home.supplies.detergent.premium = 1;
    save.current.home.clothes = 8;
    expect(tapWasher(save.current)).toBe("clean");
    // Без засобу — як і раніше, «засобу немає».
    save.current.home.supplies.detergent = { cheap: 0, premium: 0 };
    expect(tapWasher(save.current)).toBe("empty");
  });
});

describe("перевірка побуту 2026-10-28", () => {
  it("кіт у барабані: натискання виганяє його, а не бере на руки; розвісити не зменшує чистого одягу", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.x = 10.5;
    cat.y = 1.5;
    cat.act = { kind: "sleep", target: "washer", goal: null, minutes: 300, elapsed: 0 };
    standAt(save, "washer");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: "laundry", stage: "cat" }));
    // Повна шафа: розвішене не зменшує запасу.
    save.current.home.clothes = 8;
    save.current.home.washer = { state: "done", minutes: 0, quality: "cheap" };
    tapWasher(save.current);
    expect(save.current.home.clothes).toBe(8);
  });

  it("душ: у кабіні персонажа не збити з ніг; тримали кнопку весь душ — нова дія не почнеться, поки не відпустили", () => {
    const save = game();
    standAt(save, "shower");
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true });
    expect(stun(save.current)).toBe(false);
    for (let i = 0; i < 40 && save.current.character.activity !== null; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity).toBeNull();
    expect(save.current.character.holdSpent).toBe(true);
  });

  it("кота в барабані не гладять утриманням за мить натискання; брудний лоток без наповнювача чистять без відмови (повторна перевірка 2026-10-28)", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.x = 10.5;
    cat.y = 1.5;
    cat.act = { kind: "sleep", target: "washer", goal: null, minutes: 300, elapsed: 0 };
    standAt(save, "washer");
    const { events, stop } = recordEvents();
    advance(save, 0.05, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.some((e) => e.type === "cat-mood")).toBe(false);
    expect(save.current.character.activity).toBeNull();

    const box = save.current.home.items.find((i): i is LitterItem => i.kind === "litter");
    if (!box) throw new Error("немає лотка");
    box.litter = null;
    box.uses = 1;
    save.current.home.supplies.litter = { cheap: 0, premium: 0 };
    walkTo(save, `item:${box.id}`);
    const refusals = recordEvents();
    interact(save);
    refusals.stop();
    expect(refusals.events.some((e) => e.type === "refused")).toBe(false);
  });

  it("кіт, що йшов спати в барабан, туди не лягає, коли машину запустили", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    cat.act = { kind: "sleep", target: "washer", goal: { x: 10, y: 1 }, minutes: 300, elapsed: 0 };
    save.current.home.washer = { state: "washing", minutes: 60, quality: "cheap" };
    tickCats(save.current, 1, { present: true });
    expect(cat.act.target).not.toBe("washer");
  });

  it("лоток порожній, а наповнювача в запасі немає — відмова, без −3 здорового глузду", () => {
    const save = game();
    const box = save.current.home.items.find((i): i is LitterItem => i.kind === "litter");
    if (!box) throw new Error("немає лотка");
    box.litter = null;
    box.uses = 0;
    save.current.home.supplies.litter = { cheap: 0, premium: 0 };
    const sanity = save.current.character.stats.sanity;
    walkTo(save, `item:${box.id}`);
    const { events, stop } = recordEvents();
    interact(save);
    holdUntilDone(save, 10);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused" }));
    expect(save.current.character.stats.sanity).toBeGreaterThanOrEqual(sanity - 0.5);
  });

  it("голодний кіт без жодної миски просить їсти там, де вона стояла", () => {
    const save = game();
    const cat = held(save);
    save.current.character.held = null;
    save.current.home.items = save.current.home.items.filter((i) => i.kind !== "bowl");
    cat.needs.hunger = 90;
    cat.act = idleAct(0);
    tickCats(save.current, 1, { present: false });
    expect([cat.act.kind, cat.act.target]).toEqual(["beg", "bowl"]);
  });

  it("стартовий пакет притулку не займає місця, на яке вже їдуть поїлки; є місце — дає свою; кіт, чий лоток зник дорогою, іде до іншого", () => {
    const save = game();
    save.current.home.items = save.current.home.items.filter((i) => i.kind !== "water");
    const slots = freeSlots(save.current, "water");
    for (let i = 0; i < slots; i++) save.current.home.deliveries.push({ id: 900 + i, quality: "cheap", at: 99999, thing: "water" });
    const newcomer = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3 });
    giveStarterPack(save.current, newcomer);
    expect(save.current.home.items.some((i) => i.kind === "water")).toBe(false);
    // Їде лише одна — місце є, і новий кіт не чекає доставки (повторна перевірка 2026-10-28).
    save.current.home.deliveries = [{ id: 900, quality: "cheap", at: 99999, thing: "water" }];
    giveStarterPack(save.current, newcomer);
    expect(save.current.home.items.some((i) => i.kind === "water")).toBe(true);

    const cat = held(save);
    save.current.character.held = null;
    const box = save.current.home.items.find((i) => i.kind === "litter");
    if (!box) throw new Error("немає лотка");
    cat.needs.toilet = 90;
    cat.act = { kind: "toilet", target: "item:9999", goal: null, minutes: 1, elapsed: 1 };
    const messes = save.current.home.messes.length;
    tickCats(save.current, 1, { present: false });
    expect(save.current.home.messes.length).toBe(messes);
    expect(cat.act.target).toBe(`item:${box.id}`);
  });

  it("техніку й автогодівницю можна викинути: комунальні зменшуються, корм із бункера — у сховище, а купити можна знову", () => {
    const save = game();
    save.current.home.appliances.robot = "cheap";
    const withRobot = utilitiesDue(save.current);
    expect(freeSlots(save.current, "robot")).toBe(0);
    expect(discardAppliance(save.current, "robot")).toBe(true);
    expect(utilitiesDue(save.current)).toBeLessThan(withRobot);
    expect(freeSlots(save.current, "robot")).toBe(1);
    const bowl = firstBowl(save);
    save.current.home.feeders = [{ slot: bowl.slot, quality: "cheap", food: 5, foodQuality: "premium", sterile: false }];
    const before = save.current.home.supplies.catFood.premium;
    expect(discardFeeder(save.current, bowl.slot)).toBe(true);
    expect(save.current.home.feeders).toEqual([]);
    expect(save.current.home.supplies.catFood.premium).toBe(before + 5);
  });

  it("переноску й замок можна викинути й купити дорожчі; кіт, що спав у переносці, вилазить (загальна ревізія 2026-10-29)", () => {
    const save = game();
    const state = save.current;
    state.character.money = 1000;
    state.home.carrier = "cheap";
    state.home.lock = "cheap";
    expect(unavailable(state, { thing: "carrier" })).toBe("owned");
    expect(unavailable(state, { thing: "lock" })).toBe("owned");
    const cat = held(save);
    state.character.held = null;
    cat.act = { kind: "sleep", target: "carrier", goal: null, minutes: 300, elapsed: 0 };
    // Переноску, в якій інший кіт у поїздці, не викинути.
    state.trip = { destination: "vet", cat: 999 } as Save["current"]["trip"];
    expect(discardCarrier(state)).toBe(false);
    expect(state.home.carrier).toBe("cheap");
    state.trip = null;
    expect(discardCarrier(state)).toBe(true);
    expect(state.home.carrier).toBeNull();
    expect(cat.act.kind).toBe("idle");
    expect(discardLock(state)).toBe(true);
    expect(state.home.lock).toBeUndefined();
    expect(discardLock(state)).toBe(false);
    // Тепер магазин пропонує обидві якості, і дорожча стає на місце дешевої.
    for (const thing of ["carrier", "lock"] as const) {
      expect(unavailable(state, { thing })).toBeNull();
      expect(room(state, [], { thing }, "premium")).toBe(1);
    }
    const cart = (["carrier", "lock"] as const).map((thing) => ({ goods: { thing }, quality: "premium" as const, count: 1 }));
    expect(checkout(state, cart, "delivery")).toBe(true);
    for (const d of state.home.deliveries) d.at = 0;
    tickDeliveries(state);
    receivePackages(state);
    expect(state.home.carrier).toBe("premium");
    expect(state.home.lock).toBe("premium");
  });

  it("лише надкльована половинка під автогодівницею — спорожнити нічого, і миску не чіпають", () => {
    const save = game();
    const bowl = firstBowl(save);
    bowl.food = 1;
    bowl.half = true;
    bowl.foodQuality = "cheap";
    const feeder: Feeder = { quality: "cheap", bowl: bowl.id, food: 0, foodQuality: null, sterile: false } as unknown as Feeder;
    expect(emptyFeeder(save.current, bowl, feeder)).toEqual([]);
    expect([bowl.food, bowl.half]).toEqual([1, true]);
  });
});

describe("шерсть і техніка (§8.7)", () => {
  it("пилососять утриманням дії біля шафи: шерсті немає", () => {
    const save = game();
    save.current.minute = hours(19);
    save.current.home.fur = 70;
    standAt(save, "vacuum");
    holdUntilDone(save);
    expect(save.current.home.fur).toBe(0);
  });

  it("фонтанчик доливає воду; техніка й автогодівниці додають комунальних", () => {
    const save = game();
    save.current.home.appliances.fountain = "cheap";
    const bowl = firstBowl(save);
    save.current.home.feeders = [{ slot: bowl.slot, quality: "premium", food: 0, foodQuality: null, sterile: false }];
    const water = save.current.home.items.find((i) => i.kind === "water");
    if (water?.kind === "water") water.water = 0;
    tickHousehold(save.current, 7 * 60 + 59, 2);
    expect(water?.kind === "water" && water.water).toBe(8);
    expect(utilitiesDue(save.current)).toBe(40 + 8 + 6);
  });

  it("одне утримання — одна дія: після пилососа, що тримають далі, новий не починається (§10)", () => {
    const save = game();
    save.current.home.fur = 80;
    standAt(save, "vacuum");
    const { events, stop } = recordEvents();
    for (let i = 0; i < 60; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(events.filter((e) => e.type === "vacuumed")).toHaveLength(1);
    // Відпустили й знову тримають — пилосос знову працює.
    advance(save, 0.1, { move: { x: 0, y: 0 }, hold: false });
    for (let i = 0; i < 30; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.filter((e) => e.type === "vacuumed")).toHaveLength(2);
  });

  it("робот-пилосос о 12:00 годину їздить і прибирає шерсть поступово (§8.7)", () => {
    const save = game();
    save.current.home.appliances.robot = "cheap";
    save.current.home.fur = 60;
    save.current.minute = 11 * 60 + 50;
    expect(robotProgress(save.current)).toBeNull();
    tickHousehold(save.current, 11 * 60 + 50, 40);
    save.current.minute = 12 * 60 + 30;
    expect(robotProgress(save.current)).toBeCloseTo(0.5);
    expect(save.current.home.fur).toBeGreaterThan(20);
    expect(save.current.home.fur).toBeLessThan(40);
    tickHousehold(save.current, 12 * 60 + 30, 35);
    save.current.minute = 13 * 60 + 5;
    expect(save.current.home.fur).toBe(0);
    expect(robotProgress(save.current)).toBeNull();
  });

  it("дешева річ може зламатися від використання, дорога — ні", () => {
    const save = game();
    const bowl = save.current.home.items.find((i) => i.kind === "bowl");
    if (!bowl) throw new Error("немає миски");
    wearOut(save.current, { ...bowl, quality: "premium" }, always());
    expect(save.current.home.items).toContain(bowl);
    wearOut(save.current, bowl, always());
    expect(save.current.home.items).not.toContain(bowl);
    // На місці зламаної речі — уламки.
    expect(save.current.home.messes.some((m) => m.kind === "broken")).toBe(true);
  });
});

describe("безлад дратує (§9.12, правка 2026-10-23)", () => {
  const annoyed = (count: number, at: { x: number; y: number }): number => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    const state = save.current;
    state.day = 8;
    state.character.body.x = 9.5;
    state.character.body.y = 8.5;
    for (let i = 0; i < count; i++) state.home.messes.push({ id: 100 + i, kind: "vomit", x: at.x + i * 0.5, y: at.y, cat: null });
    const before = state.character.stats.sanity;
    annoyingMesses(state, 60);
    return state.character.stats.sanity - before;
  };

  it("кожен безлад у полі зору — −1 за годину, разом не більше −4", () => {
    expect(annoyed(1, { x: 4.5, y: 8.5 })).toBeCloseTo(-1);
    expect(annoyed(3, { x: 4.5, y: 8.5 })).toBeCloseTo(-3);
    expect(annoyed(6, { x: 3.5, y: 8.5 })).toBeCloseTo(-4);
  });

  it("безлад в іншій кімнаті не дратує", () => {
    expect(annoyed(2, { x: 15.5, y: 2.5 })).toBe(0);
  });
});

describe("друг досипає миски (§4.1, правка 2026-10-24)", () => {
  function friendVisit(save: Save): void {
    save.current.modifiers.day = "friend-help";
    tickModifiers(save.current, hours(10) + 59, 2, false);
  }

  it("порожню миску — доверху зі сховища, без дарової порції; надкушену — досипає", () => {
    const save = game();
    const supplies = save.current.home.supplies.catFood;
    Object.assign(supplies, { cheap: 5, premium: 0 });
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
    Object.assign(bowl, { food: 0, foodQuality: null, sterile: false });
    friendVisit(save);
    expect(bowl.food).toBe(2);
    expect(supplies.cheap).toBe(3);
    bowl.food = 1;
    friendVisit(save);
    expect(bowl.food).toBe(2);
    expect(supplies.cheap).toBe(2);
  });

  it("корми не змішує: дорогого немає — миску з дорогим не досипає", () => {
    const save = game();
    const supplies = save.current.home.supplies.catFood;
    Object.assign(supplies, { cheap: 5, premium: 0 });
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
    Object.assign(bowl, { food: 1, foodQuality: "premium", sterile: false });
    friendVisit(save);
    expect(bowl.food).toBe(1);
    expect(supplies.cheap).toBe(5);
  });

  it("вдома лише корм для стерилізованих, а стерилізованого кота немає — досипає ним (загальна ревізія 2026-10-29)", () => {
    const save = game();
    Object.assign(save.current.home.supplies.catFood, { cheap: 0, premium: 0 });
    Object.assign(save.current.home.supplies.sterileFood, { cheap: 5, premium: 0 });
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl")!;
    Object.assign(bowl, { food: 0, foodQuality: null, sterile: false });
    friendVisit(save);
    expect(bowl.food).toBe(2);
    expect(bowl.sterile).toBe(true);
    expect(save.current.home.supplies.sterileFood.cheap).toBe(3);
  });
});

describe("автогодівниці (§9.12, правка автора 2026-10-23)", () => {
  /** Годівниця над першою миской; миска порожня, у сховищі — стільки дешевого корму. */
  function withFeeder(quality: Quality, stock: number): { save: Save; bowl: BowlItem; feeder: Feeder } {
    const save = game();
    addSupply(save.current, "catFood", "cheap", 0);
    save.current.home.supplies.catFood = { cheap: stock, premium: 0 };
    const bowl = firstBowl(save);
    Object.assign(bowl, { food: 0, foodQuality: null, sterile: false });
    const feeder: Feeder = { slot: bowl.slot, quality, food: 0, foodQuality: null, sterile: false };
    save.current.home.feeders = [feeder];
    return { save, bowl, feeder };
  }

  function pour(save: Save, bowl: BowlItem): GameEvent[] {
    walkTo(save, "cat-cabinet");
    interact(save);
    walkTo(save, `item:${bowl.id}`);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    return events;
  }

  it("корм у руках — і миска, і порожня годівниця наповнюються доверху одним заходом", () => {
    const { save, bowl, feeder } = withFeeder("cheap", 30);
    pour(save, bowl);
    expect(bowl.food).toBe(2);
    expect(feeder).toMatchObject({ food: FEEDER_CAPACITY.cheap, foodQuality: "cheap", sterile: false });
    expect(save.current.home.supplies.catFood.cheap).toBe(30 - 2 - FEEDER_CAPACITY.cheap);
    expect(save.current.character.held).toBeNull();
    // Дорога вміщує більше.
    const premium = withFeeder("premium", 30);
    pour(premium.save, premium.bowl);
    expect(premium.feeder.food).toBe(FEEDER_CAPACITY.premium);
  });

  it("корму менше, ніж влазить, — насипається все: спершу миска, решта в годівницю", () => {
    const { save, bowl, feeder } = withFeeder("premium", 5);
    pour(save, bowl);
    expect(bowl.food).toBe(2);
    expect(feeder.food).toBe(3);
    expect(save.current.home.supplies.catFood.cheap).toBe(0);
  });

  it("змішувати не можна: у годівниці дешевий — дорогим її не наповнити", () => {
    const { save, bowl, feeder } = withFeeder("cheap", 0);
    Object.assign(feeder, { food: 3, foodQuality: "cheap" });
    save.current.home.supplies.catFood.premium = 10;
    const events = pour(save, bowl);
    expect(events).toContainEqual(expect.objectContaining({ type: "refused", reason: "mixed" }));
    expect(save.current.home.supplies.catFood.premium).toBe(10);
    // Поки персонаж ходив, годівниця сама насипала свій корм у миску — і більше нічого не додалося.
    expect(feeder.food + bowl.food).toBe(3);
  });

  it("з порожніми руками біля годівниці — її корм і корм із миски повертаються у сховище", () => {
    const { save, bowl, feeder } = withFeeder("premium", 0);
    Object.assign(feeder, { food: 12, foodQuality: "cheap", sterile: false });
    Object.assign(bowl, { food: 2, foodQuality: "cheap", sterile: false });
    walkTo(save, `item:${bowl.id}`);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "feeder-emptied", item: bowl.id, products: ["catFood"] });
    expect(save.current.home.supplies.catFood.cheap).toBe(14);
    expect(feeder).toMatchObject({ food: 0, foodQuality: null });
    expect(bowl).toMatchObject({ food: 0, foodQuality: null });
    // Тепер можна насипати інший корм.
    save.current.home.supplies.catFood = { cheap: 0, premium: 30 };
    pour(save, bowl);
    expect(feeder).toMatchObject({ food: FEEDER_CAPACITY.premium, foodQuality: "premium" });
    // Порожня годівниця з порожньою миской — нічого спорожняти.
    Object.assign(feeder, { food: 0, foodQuality: null });
    Object.assign(bowl, { food: 0, foodQuality: null });
    const again = recordEvents();
    interact(save);
    again.stop();
    expect(again.events).toContainEqual({ type: "refused", object: `item:${bowl.id}`, reason: "need", need: "catfood" });
  });

  it("годівниця не за годинами, а завжди тримає миску повною, доки в ній є корм", () => {
    const { save, bowl, feeder } = withFeeder("cheap", 0);
    Object.assign(feeder, { food: 3, foodQuality: "cheap" });
    const { events, stop } = recordEvents();
    tickHousehold(save.current, 3 * 60, 1);
    expect(bowl).toMatchObject({ food: 2, foodQuality: "cheap" });
    expect(feeder.food).toBe(1);
    bowl.food = 0;
    tickHousehold(save.current, 3 * 60 + 1, 1);
    stop();
    expect(bowl.food).toBe(1);
    expect(feeder.food).toBe(0);
    expect(events).toContainEqual({ type: "feeder", bowls: [bowl.id] });
    // Порожня годівниця нічого не сипле, а миску з іншим кормом не досипає.
    Object.assign(feeder, { food: 3, foodQuality: "premium" });
    tickHousehold(save.current, 3 * 60 + 2, 1);
    expect(bowl.food).toBe(1);
    expect(feeder.food).toBe(3);
  });

  it("одна годівниця на миску: купити можна стільки, скільки мисок без годівниці", () => {
    const save = game();
    save.current.home.feeders = [];
    const bowls = save.current.home.items.filter((i) => i.kind === "bowl").length;
    expect(freeSlots(save.current, "feeder")).toBe(bowls);
    for (let i = 0; i < bowls; i++) place(save.current, "feeder", "cheap");
    expect(freeSlots(save.current, "feeder")).toBe(0);
    expect(unavailable(save.current, { thing: "feeder" })).toBe("no-bowl");
    expect(new Set(save.current.home.feeders.map((f) => f.slot)).size).toBe(bowls);
  });

  it("дешева годівниця ламається разом із кормом і лишає уламки; миска зламалася — годівниця чекає нову", () => {
    const { save, bowl, feeder } = withFeeder("premium", 0);
    feeder.food = 5;
    bowl.quality = "cheap";
    wearOut(save.current, bowl, always());
    expect(save.current.home.items).not.toContain(bowl);
    expect(save.current.home.feeders).toContain(feeder);
    // Нова миска стає під годівницю, і та одразу її наповнює.
    const fresh = place(save.current, "bowl", "cheap");
    if (fresh?.kind !== "bowl") throw new Error("миска не стала");
    expect(fresh.slot).toBe(feeder.slot);
    feeder.foodQuality = "cheap";
    save.current.home.items.push(fresh);
    tickHousehold(save.current, 3 * 60, 1);
    expect(fresh.food).toBe(2);
    // Дешева ламається вранці: корм пропадає, на її місці уламки.
    feeder.quality = "cheap";
    const broken = save.current.home.messes.filter((m) => m.kind === "broken").length;
    nightlyHousehold(save.current, always());
    expect(save.current.home.feeders).toHaveLength(0);
    expect(save.current.home.messes.filter((m) => m.kind === "broken")).toHaveLength(broken + 1);
  });

  it("старе збереження: одна годівниця на дім стає порожньою годівницею над першою миской", () => {
    const save = game();
    delete save.current.home.feeders;
    (save.current.home.appliances as Record<string, unknown>)["feeder"] = "premium";
    const loaded = deserialize(serialize(save));
    expect(loaded.current.home.appliances).not.toHaveProperty("feeder");
    expect(loaded.current.home.feeders).toEqual([{ slot: firstBowl(loaded).slot, quality: "premium", food: 0, foodQuality: null, sterile: false }]);
  });
});
