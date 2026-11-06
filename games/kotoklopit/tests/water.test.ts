// Вода (§8.7, §9.12): бак простого фонтанчика, автоматичний дорогий, місткість поїлок і хто їх перекидає.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, stonesFactor, tickCats } from "../src/sim/catai";
import { DRINKING, FOUNTAIN, MODIFIERS, WATER_CAPACITY } from "../src/sim/config";
import { cleanHome } from "../src/sim/cleaner";
import { discardAppliance, place } from "../src/sim/economy";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { tickHousehold } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { fountainWorks, waterCapacity } from "../src/sim/resources";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, Quality, Save, TraitLevel, WaterItem } from "../src/sim/types";
import { fountainFrame, waterFrame } from "../src/view/iso/looks";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  return save;
}

const waterOf = (state: GameState): WaterItem => state.home.items.find((i): i is WaterItem => i.kind === "water") as WaterItem;

/** Поставити фонтанчик, як із пакунка. */
function buyFountain(state: GameState, quality: Quality): void {
  place(state, "fountain", quality);
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 17.5, y: 6.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

/** Скільки разів із `runs` кіт перекинув поїлку якості `quality`, попивши. */
function spills(traits: Record<string, TraitLevel>, quality: Quality, setup: (state: GameState) => void = () => {}, runs = 200): number {
  let spilled = 0;
  for (let seed = 0; seed < runs; seed++) {
    const save = game();
    const state = save.current;
    state.rng.behavior = seed;
    const water = waterOf(state);
    water.quality = quality;
    setup(state);
    const cat = withCat(save, traits);
    cat.needs.thirst = 70;
    cat.act = { kind: "drink", target: `item:${water.id}`, goal: null, minutes: 0.1, elapsed: 0 };
    tickCats(state, 0.2, { present: false });
    if (state.home.messes.some((m) => m.kind === "puddle")) {
      spilled += 1;
      expect(water.water).toBe(0);
    }
  }
  return spilled;
}

describe("простий фонтанчик (§8.7)", () => {
  it("новий бак порожній: фонтанчик стоїть, поки його не наповнять", () => {
    const { current: state } = game();
    buyFountain(state, "cheap");
    expect(state.home.fountainTank).toBe(0);
    expect(fountainWorks(state)).toBe(false);
    const water = waterOf(state);
    water.water = 3;
    tickHousehold(state, state.minute, 1);
    expect(water.water).toBe(3);
  });

  it("дія біля поїлки наповнює й поїлку, і бак, а відмова — лише коли повні обидва", () => {
    const save = game();
    const state = save.current;
    buyFountain(state, "cheap");
    const water = waterOf(state);
    water.water = WATER_CAPACITY.cheap;
    standAt(save, `item:${water.id}`);
    interact(save);
    expect(state.home.fountainTank).toBe(FOUNTAIN.tank);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: `item:${water.id}`, reason: "full", what: "water" });
    water.water = 1;
    interact(save);
    expect(water.water).toBe(WATER_CAPACITY.cheap);
  });

  it("доливає постійно й витрачає бак ковток за ковтком, на всі поїлки разом", () => {
    const { current: state } = game();
    buyFountain(state, "cheap");
    state.home.fountainTank = 10;
    const first = waterOf(state);
    const second: WaterItem = { id: 900, kind: "water", quality: "premium", slot: "water-2", water: 0 };
    state.home.items.push(second);
    first.water = 5;
    tickHousehold(state, state.minute, 1);
    expect(first.water).toBe(WATER_CAPACITY.cheap);
    expect(second.water).toBe(7);
    expect(state.home.fountainTank).toBe(0);
    expect(fountainWorks(state)).toBe(false);
  });

  it("з порожнім баком для рис фонтанчика немає: «Фонтанолюб» знову йде до крана", () => {
    const sink = (tank: number): number => {
      let count = 0;
      for (let seed = 0; seed < 40; seed++) {
        const save = game();
        buyFountain(save.current, "cheap");
        save.current.home.fountainTank = tank;
        const cat = withCat(save, { drinking: 2 });
        cat.needs.thirst = 70;
        decide(save.current, cat, createRng(seed), { present: false });
        if (cat.act.kind === "beg" && cat.act.target === "sink") count += 1;
      }
      return count;
    };
    expect(sink(0)).toBeGreaterThan(10);
    expect(sink(5)).toBe(0);
  });

  it("сечокам'яна: порожній бак не рахується, як і в рис", () => {
    const save = game();
    const cat = withCat(save, { drinking: 2 });
    buyFountain(save.current, "cheap");
    expect(stonesFactor(save.current, cat)).toBeGreaterThan(1);
    save.current.home.fountainTank = 5;
    expect(stonesFactor(save.current, cat)).toBe(1);
  });

  it("бак наповнює прибиральниця", () => {
    const { current: state } = game();
    buyFountain(state, "cheap");
    expect(cleanHome(state).watered).toBe(true);
    expect(state.home.fountainTank).toBe(FOUNTAIN.tank);
  });

  it("бак наповнює й друг, що приходить доглядати котів", () => {
    const save = game();
    const state = save.current;
    buyFountain(state, "cheap");
    state.modifiers.day = "friend-help";
    state.minute = MODIFIERS.friend.from - 1;
    advance(save, 2);
    expect(state.home.fountainTank).toBeGreaterThan(FOUNTAIN.tank - 3);
  });

  it("викинули й купили знову — бак новий, порожній", () => {
    const { current: state } = game();
    buyFountain(state, "cheap");
    state.home.fountainTank = FOUNTAIN.tank;
    discardAppliance(state, "fountain");
    buyFountain(state, "cheap");
    expect(state.home.fountainTank).toBe(0);
  });

  it("старе збереження: бака тоді не було, тож він повний", () => {
    const save = game();
    save.current.home.appliances.fountain = "cheap";
    delete save.current.home.fountainTank;
    expect(deserialize(serialize(save)).current.home.fountainTank).toBe(FOUNTAIN.tank);
  });

  it("порожній бак видно: кадр без води, хоч у поїлці ще є вода", () => {
    const { current: state } = game();
    buyFountain(state, "cheap");
    const water = waterOf(state);
    expect(fountainFrame(state, "cheap", water).state).toBe("dry");
    state.home.fountainTank = 5;
    expect(fountainFrame(state, "cheap", water).state).toBe("on");
  });
});

describe("дорогий фонтанчик (§8.7)", () => {
  it("автоматичний: бака не потребує й доливає без міри", () => {
    const { current: state } = game();
    buyFountain(state, "premium");
    expect(fountainWorks(state)).toBe(true);
    const water = waterOf(state);
    for (let i = 0; i < 50; i++) {
      water.water = 0;
      tickHousehold(state, state.minute, 1);
      expect(water.water).toBe(WATER_CAPACITY.cheap);
    }
    expect(fountainFrame(state, "premium", water).state).toBe("on");
  });

  it("бака немає: дія біля повної поїлки — відмова", () => {
    const save = game();
    buyFountain(save.current, "premium");
    const water = waterOf(save.current);
    standAt(save, `item:${water.id}`);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: `item:${water.id}`, reason: "full", what: "water" });
  });

  it("усім котам рідша сечокам'яна, простий цього не дає", () => {
    const save = game();
    const plain = withCat(save);
    const lover = withCat(save, { drinking: 2 });
    const model = withCat(save, { drinking: -2 });
    buyFountain(save.current, "cheap");
    save.current.home.fountainTank = 5;
    expect(stonesFactor(save.current, plain)).toBe(1);
    buyFountain(save.current, "premium");
    expect(stonesFactor(save.current, plain)).toBeCloseTo(DRINKING.premiumStones);
    expect(stonesFactor(save.current, lover)).toBeCloseTo(DRINKING.premiumStones);
    expect(stonesFactor(save.current, model)).toBeCloseTo(0.5 * DRINKING.premiumStones);
  });
});

describe("поїлка (§9.12)", () => {
  it("керамічна вміщує більше, і кадри рахуються від її місткості", () => {
    const save = game();
    const state = save.current;
    const made = place(state, "water", "premium") as WaterItem;
    expect(made.water).toBe(WATER_CAPACITY.premium);
    expect(WATER_CAPACITY.premium).toBeGreaterThan(WATER_CAPACITY.cheap);
    made.water = WATER_CAPACITY.cheap;
    expect(waterFrame(made).state).toBe("half");
    const water = waterOf(state);
    water.quality = "premium";
    water.water = 1;
    standAt(save, `item:${water.id}`);
    interact(save);
    expect(water.water).toBe(waterCapacity(water));
  });

  it("пластикову інколи перекидає й кіт без риси, «Фонтанолюб» — частіше", () => {
    const plain = spills({}, "cheap");
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(200 * DRINKING.cheapSpill * 2);
    expect(spills({ drinking: 2 }, "cheap")).toBeGreaterThan(plain * 2);
  });

  it("«+» перекинув пластикову — риса ще не видна: це лише легка поїлка", () => {
    for (let seed = 0; seed < 200; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const water = waterOf(save.current);
      const cat = withCat(save, { drinking: 1 });
      cat.needs.thirst = 70;
      cat.act = { kind: "drink", target: `item:${water.id}`, goal: null, minutes: 0.1, elapsed: 0 };
      tickCats(save.current, 0.2, { present: true });
      if (save.current.home.messes.some((m) => m.kind === "puddle")) {
        expect(cat.traits[0]?.seen ?? 0).toBe(0);
        return;
      }
    }
    throw new Error("Жоден кіт не перекинув поїлку");
  });

  it("керамічну не перекидає ніхто, навіть «Фонтанолюб»", () => {
    expect(spills({}, "premium")).toBe(0);
    expect(spills({ drinking: 2 }, "premium")).toBe(0);
  });

  it("поїлку з працюючим фонтанчиком не перекидають, з порожнім баком — так", () => {
    const fountain = (tank: number) => (state: GameState): void => {
      state.home.appliances.fountain = "cheap";
      state.home.fountainTank = tank;
    };
    expect(spills({ drinking: 2 }, "cheap", fountain(5))).toBe(0);
    expect(spills({ drinking: 2 }, "cheap", fountain(0))).toBeGreaterThan(0);
  });
});
