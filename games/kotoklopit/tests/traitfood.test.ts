// Етап «Їжа й гігієна» (§9.12 «Їжа й гігієна», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як риси їжі, лотка
// й шерсті видно з поведінки — «Апетит», «Швидкість їжі», «Перебірливість», «Жебракування», «Злодійство», «Пиття»,
// «Розкидання наповнювача», «Вибагливість до лотка», «Мітки», «Шерстяні грудки», «Догляд за шерстю», «Любов до води».

import { describe, expect, it } from "vitest";

import { pickUpCat } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { giveTreat, nightlyCare } from "../src/sim/care";
import { bowlEaten, decide, dirtyFor, eatMinutes, envy, markTriggered, stonesFactor, tickCats } from "../src/sim/catai";
import { APPETITE, BEGGING, CAT_ACT_MINUTES, DRINKING, ENVY, GULPING, HAIRBALL, THIEF, WAKE_UP } from "../src/sim/config";
import { coughWakes } from "../src/sim/night";
import { interact } from "../src/sim/game";
import { relation } from "../src/sim/relations";
import { emptyFeeder } from "../src/sim/household";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, LitterItem, NightReport, Save, TraitLevel, WaterItem } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  // Персонаж на кухні, біля мисок: бачить, як коти їдять.
  Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 17.5, y: 3.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const bowlOf = (save: Save): BowlItem => {
  const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
  if (!bowl) throw new Error("немає миски");
  return bowl;
};

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Кіт сідає до миски (дві порції дешевого корму) й їсть, поки не скінчить трапезу. */
function meal(save: Save, cat: Cat, food = 2): BowlItem {
  const bowl = bowlOf(save);
  bowl.food = food;
  bowl.foodQuality = "cheap";
  cat.needs.hunger = 90;
  cat.x = 17.5;
  cat.y = 3.5;
  cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0 };
  for (let i = 0; i < 40 && cat.act.kind === "eat"; i++) tickCats(save.current, 0.5, { present: true });
  return bowl;
}

describe("«Апетит» (рішення автора 2026-10-25)", () => {
  it("«Малоїжка» клює пів порції й лишає половину в мисці — її доїдає наступний", () => {
    let nibbled = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { appetite: -2 });
      const bowl = meal(save, cat);
      if (bowl.half !== true) {
        expect(bowl.food, `seed ${seed}`).toBe(1);
        continue;
      }
      nibbled += 1;
      expect(bowl.food).toBe(2);
      expect(cat.needs.hunger).toBeGreaterThan(39);
      expect(cat.needs.hunger).toBeLessThan(42);
      expect(seen(cat, "appetite")).toBe(1);
      // Наступний кіт доїдає надкльовану половинку: порцію знято, але ситий він лише наполовину.
      const next = withCat(save);
      meal(save, next, bowl.food);
      expect(bowl.food).toBe(1);
      expect(bowl.half).toBeUndefined();
      expect(next.needs.hunger).toBeGreaterThan(39);
      expect(next.needs.hunger).toBeLessThan(42);
    }
    expect(nibbled).toBeGreaterThan(15);
    expect(nibbled).toBeLessThan(30);
  });

  it("«Ненаситний» інколи спустошує дві порції за раз, кіт без риси — ніколи", () => {
    let both = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { appetite: 2 });
      const bowl = meal(save, cat);
      if (bowl.food === 0) {
        both += 1;
        expect(seen(cat, "appetite"), `seed ${seed}`).toBe(1);
      } else expect(seen(cat, "appetite"), `seed ${seed}`).toBe(0);
      const plain = game();
      plain.current.rng.behavior = seed;
      expect(meal(plain, withCat(plain)).food).toBe(1);
    }
    expect(both).toBeGreaterThan(3);
    expect(both).toBeLessThan(60 * APPETITE.secondMax);
  });

  it("надкльовану половинку годівниця назад у сховище не повертає", () => {
    const save = game();
    const bowl = bowlOf(save);
    Object.assign(bowl, { food: 2, foodQuality: "cheap", half: true });
    const feeder = { slot: bowl.slot, quality: "cheap" as const, food: 3, foodQuality: "cheap" as const, sterile: false };
    const before = save.current.home.supplies.catFood.cheap;
    emptyFeeder(save.current, bowl, feeder);
    expect(save.current.home.supplies.catFood.cheap + (save.current.home.boxes?.catFood?.cheap ?? 0)).toBe(before + 4);
    expect(bowl.half).toBeUndefined();
  });
});

describe("«Швидкість їжі» (рішення автора 2026-10-25)", () => {
  it("порція їсться 3 × 0,7^рівень хвилин, від 1,5 до 6", () => {
    const save = game();
    const minutes = (level: number): number => eatMinutes(withCat(save, level === 0 ? {} : { gulping: level as TraitLevel }));
    expect(minutes(0)).toBe(3);
    expect(minutes(1)).toBeCloseTo(2.1);
    expect(minutes(2)).toBe(GULPING.min);
    expect(minutes(-1)).toBeCloseTo(3 / 0.7);
    expect(minutes(-2)).toBe(GULPING.max);
  });

  it("корм меншає поступово, а тривалість трапези — прояв, раз на годину", () => {
    const save = game();
    const cat = withCat(save, { gulping: -2 });
    const bowl = bowlOf(save);
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    cat.needs.hunger = 90;
    cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0 };
    tickCats(save.current, 3, { present: true });
    expect(cat.act.kind).toBe("eat");
    expect(bowlEaten(save.current, bowl)).toBeCloseTo(0.5, 1);
    tickCats(save.current, 3.5, { present: true });
    expect(bowl.food).toBe(1);
    expect(seen(cat, "gulping")).toBe(1);
    meal(save, cat, 2);
    expect(seen(cat, "gulping")).toBe(1);
  });

  it("«Пилосос» зригує частіше, коли поруч їсть інший кіт, і рідше з керамічної миски", () => {
    const vomits = (crowded: boolean, premium: boolean): number => {
      let count = 0;
      for (let seed = 0; seed < 200; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = withCat(save, { gulping: 1 });
        if (premium) bowlOf(save).quality = "premium";
        if (crowded) {
          const other = withCat(save, {}, { x: 16.5, y: 3.5 });
          other.act = { kind: "eat", target: null, goal: null, minutes: 60, elapsed: 0 };
        }
        meal(save, cat, 1);
        count += save.current.home.messes.filter((m) => m.kind === "vomit").length;
      }
      return count;
    };
    const alone = vomits(false, false);
    expect(alone).toBeGreaterThan(20);
    expect(vomits(true, false)).toBeGreaterThan(alone);
    expect(vomits(false, true)).toBeLessThan(alone);
  });
});

describe("«Перебірливість» (рішення автора 2026-10-25)", () => {
  it("«Гурман» нюхає простий корм, хвилину гребе лапою й іде просити кращого", () => {
    for (let seed = 0; seed < 20; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { picky: 2 });
      const { events, stop } = recordEvents();
      const bowl = bowlOf(save);
      Object.assign(bowl, { food: 2, foodQuality: "cheap" });
      cat.needs.hunger = 90;
      cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.1, elapsed: 0 };
      tickCats(save.current, 0.2, { present: true });
      stop();
      if (cat.act.kind !== "bury") continue;
      expect(events.some((e) => e.type === "cat-refused-food")).toBe(true);
      expect(bowl.food).toBe(2);
      expect(seen(cat, "picky")).toBe(1);
      tickCats(save.current, 1, { present: true });
      expect(cat.act.kind).toBe("beg");
      expect(cat.act.target).toBe(`item:${bowl.id}`);
      return;
    }
    throw new Error("«Гурман» так і не відмовився від простого корму");
  });

  it("від голоду 95 «Гурман» відмовляється вдвічі рідше", () => {
    const refusals = (hunger: number): number => {
      let count = 0;
      for (let seed = 0; seed < 300; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = withCat(save, { picky: 1 });
        const bowl = bowlOf(save);
        Object.assign(bowl, { food: 2, foodQuality: "cheap" });
        cat.needs.hunger = hunger;
        cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 0.1, elapsed: 0 };
        tickCats(save.current, 0.2, { present: true });
        if (cat.act.kind === "bury") count += 1;
      }
      return count;
    };
    const fed = refusals(85);
    const starving = refusals(97);
    expect(fed).toBeGreaterThan(80);
    expect(starving).toBeLessThan(fed * 0.7);
    expect(starving).toBeGreaterThan(fed * 0.3);
  });

  it("«Їсть усе» тішиться простим кормом, кіт без риси — ні", () => {
    const save = game();
    const plain = withCat(save);
    plain.mood = 50;
    meal(save, plain, 1);
    const glutton = withCat(save, { picky: -2 });
    glutton.mood = 50;
    meal(save, glutton, 1);
    expect(plain.mood).toBeLessThanOrEqual(50);
    expect(glutton.mood).toBeGreaterThan(51);
    expect(seen(glutton, "picky")).toBe(1);
  });
});

describe("«Жебракування» (рішення автора 2026-10-25)", () => {
  /** Узяти на руки кота, що просить їсти біля миски, і дати ласощі. */
  function treatBeggar(save: Save, cat: Cat): void {
    const bowl = bowlOf(save);
    cat.act = { kind: "beg", target: `item:${bowl.id}`, goal: null, minutes: CAT_ACT_MINUTES.beg, elapsed: 0 };
    save.current.home.supplies.treats.cheap = 5;
    pickUpCat(save.current, cat);
    giveTreat(save.current, "cheap", createRng(9));
    save.current.character.held = null;
  }

  it("ласощі котові, що просить їсти, привчають жебракувати — навіть без риси; «Не випрошує» — ні; щоночі звичка згасає", () => {
    const save = game();
    const cat = withCat(save);
    for (let i = 0; i < 5; i++) treatBeggar(save, cat);
    expect(cat.begHabit).toBeCloseTo(BEGGING.habitMax);
    nightlyCare(save.current, createRng(1));
    expect(cat.begHabit).toBeCloseTo(BEGGING.habitMax - BEGGING.habitDecay);
    // Ласощі котові, що нічого не просив, — не привчають.
    const calm = withCat(save);
    save.current.home.supplies.treats.cheap = 5;
    pickUpCat(save.current, calm);
    giveTreat(save.current, "cheap", createRng(9));
    save.current.character.held = null;
    expect(calm.begHabit).toBeUndefined();
    const modest = withCat(save, { begging: -2 });
    treatBeggar(save, modest);
    expect(modest.begHabit).toBeUndefined();
  });

  it("привчений кіт без риси після їди інколи просить ще, а без звички — ніколи", () => {
    let begged = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save);
      cat.begHabit = BEGGING.habitMax;
      meal(save, cat, 1);
      if (cat.act.kind === "beg") begged += 1;
      expect(seen(cat, "begging")).toBe(0);
      const fresh = game();
      fresh.current.rng.behavior = seed;
      const plain = withCat(fresh);
      meal(fresh, plain, 1);
      expect(plain.act.kind).not.toBe("beg");
    }
    expect(begged).toBeGreaterThan(5);
    expect(begged).toBeLessThan(40);
  });

  it("«Знає міру» поїв і вмивається; голодний «Не випрошує» чекає біля миски, а не йде до персонажа", () => {
    const save = game();
    const cat = withCat(save, { begging: -1 });
    meal(save, cat, 1);
    expect(cat.act).toMatchObject({ kind: "groom", target: "wash" });
    expect(seen(cat, "begging")).toBe(1);
    for (let seed = 0; seed < 20; seed++) {
      const hungry = withCat(save, { begging: -2 });
      bowlOf(save).food = 0;
      hungry.needs.hunger = 95;
      decide(save.current, hungry, createRng(seed), { present: true });
      expect(hungry.act.kind, `seed ${seed}`).toBe("beg");
    }
  });

  it("«Артист голоду» після ласощів одразу нявчить, просячи ще", () => {
    let asked = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game();
      const cat = withCat(save, { begging: 2 });
      save.current.home.supplies.treats.cheap = 5;
      pickUpCat(save.current, cat);
      const { events, stop } = recordEvents();
      giveTreat(save.current, "cheap", createRng(seed));
      stop();
      if (events.some((e) => e.type === "meow" && e.cat === cat.id)) {
        asked += 1;
        expect(seen(cat, "begging")).toBe(1);
      } else expect(seen(cat, "begging")).toBe(0);
    }
    expect(asked).toBeGreaterThan(8);
    expect(asked).toBeLessThan(30);
  });
});

describe("«Злодійство» (рішення автора 2026-10-25)", () => {
  it("«Злодюжка» відтісняє іншого кота від миски: шипить, той відходить голодний, стосунки псуються", () => {
    for (let seed = 0; seed < 30; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const eater = withCat(save, { gulping: -2 });
      const thief = withCat(save, { thief: 2 }, { x: 14.5, y: 2.5 });
      thief.needs.hunger = 50;
      const bowl = bowlOf(save);
      Object.assign(bowl, { food: 2, foodQuality: "cheap" });
      eater.needs.hunger = 90;
      eater.mood = 60;
      eater.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(eater), elapsed: 0 };
      const before = relation(save.current, eater, thief);
      const { events, stop } = recordEvents();
      tickCats(save.current, 0.1, { present: true });
      if (thief.act.kind !== "steal") {
        stop();
        continue;
      }
      expect(thief.act.victim).toBe(eater.id);
      for (let i = 0; i < 40 && thief.act.kind === "steal"; i++) {
        thief.act.minutes = Math.max(thief.act.minutes, 0.05);
        tickCats(save.current, 0.1, { present: true });
      }
      stop();
      expect(thief.act).toMatchObject({ kind: "eat", target: `item:${bowl.id}` });
      expect(eater.act.kind).toBe("wander");
      expect(eater.needs.hunger).toBeGreaterThan(80);
      expect(eater.mood).toBeLessThan(60);
      expect(relation(save.current, eater, thief)).toBeLessThanOrEqual(before + THIEF.relation);
      expect(events.some((e) => e.type === "hissed" && e.cat === thief.id && e.at === eater.id)).toBe(true);
      expect(seen(thief, "thief")).toBe(1);
      return;
    }
    throw new Error("злодій так і не пішов до миски");
  });

  it("«Шляхетний» не краде й голодуючи, а сідає біля їжі на столі й не чіпає її", () => {
    let waited = 0;
    for (let seed = 0; seed < 40; seed++) {
      const save = game();
      save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      const cat = withCat(save, { thief: -2 }, { x: 14.5, y: 2.5 });
      bowlOf(save).food = 0;
      cat.needs.hunger = 99;
      decide(save.current, cat, createRng(seed), { present: false });
      expect(cat.act.kind, `seed ${seed}`).not.toBe("steal");
      if (cat.act.kind !== "beg" || cat.act.target !== "table") continue;
      waited += 1;
      for (let i = 0; i < 20 && cat.act.target === "table"; i++) tickCats(save.current, 0.5, { present: true });
      expect(save.current.home.surfaces["table"]).not.toBeNull();
      expect(seen(cat, "thief"), `seed ${seed}`).toBe(1);
    }
    expect(waited).toBeGreaterThan(5);
  });
});

describe("«Заздрісність»: тригер (рішення автора 2026-10-25)", () => {
  function pair(save: Save): { lucky: Cat; envious: Cat } {
    const lucky = withCat(save);
    const envious = withCat(save, { envy: 2 }, { x: 16.5, y: 3.5 });
    envious.mood = 60;
    return { lucky, envious };
  }

  it("дорогому корму не заздрить, коли він є в домі чи заздрісник сам їв його за останні 6 годин", () => {
    const save = game();
    const { lucky, envious } = pair(save);
    save.current.home.supplies.catFood.premium = 3;
    envy(save.current, lucky, "premium");
    expect(envious.mood).toBe(60);
    save.current.home.supplies.catFood.premium = 0;
    envious.premiumAt = (save.current.day * 24 + 10) * 60;
    envy(save.current, lucky, "premium");
    expect(envious.mood).toBe(60);
    envious.premiumAt = (save.current.day * 24 + 12) * 60 - ENVY.premiumMinutes - 1;
    envy(save.current, lucky, "premium");
    expect(envious.mood).toBeLessThan(60);
  });

  it("ласощі всім котам поруч протягом 2 хвилин заздрощів не викликають", () => {
    const treat = (both: boolean): { mood: number; relation: number } => {
      const save = game();
      const { lucky, envious } = pair(save);
      const before = relation(save.current, envious, lucky);
      save.current.home.supplies.treats.cheap = 5;
      for (const cat of both ? [lucky, envious] : [lucky]) {
        save.current.character.held = { kind: "cat", cat: cat.id };
        giveTreat(save.current, "cheap", createRng(1));
        save.current.character.held = null;
        tickCats(save.current, 1, { present: true });
        save.current.minute += 1;
      }
      for (let i = 0; i < 4; i++) {
        tickCats(save.current, 1, { present: true });
        save.current.minute += 1;
      }
      return { mood: envious.mood, relation: relation(save.current, envious, lucky) - before };
    };
    expect(treat(false).relation).toBeLessThan(0);
    expect(treat(true).relation).toBe(0);
  });
});

describe("«Пиття» (рішення автора 2026-10-25)", () => {
  const waterOf = (save: Save): WaterItem => save.current.home.items.find((i): i is WaterItem => i.kind === "water") as WaterItem;

  it("спраглий «Фонтанолюб» без фонтанчика сідає на умивальник, з фонтанчиком — п'є з миски", () => {
    let sink = 0;
    for (let seed = 0; seed < 20; seed++) {
      const save = game();
      const cat = withCat(save, { drinking: 2 });
      cat.needs.thirst = 70;
      decide(save.current, cat, createRng(seed), { present: false });
      if (cat.act.kind === "beg" && cat.act.target === "sink") sink += 1;
      save.current.home.appliances.fountain = "cheap";
      decide(save.current, cat, createRng(seed), { present: false });
      expect(cat.act.kind).toBe("drink");
    }
    expect(sink).toBeGreaterThan(10);
  });

  it("натискання на кота на умивальнику відкриває кран, навіть коли ліків не треба; це видно", () => {
    const save = game();
    standAt(save, "sink");
    const cat = withCat(save, { drinking: 1 }, { x: 11.5, y: 1.5 });
    cat.needs.thirst = 80;
    cat.mood = 50;
    cat.act = { kind: "beg", target: "sink", goal: null, minutes: CAT_ACT_MINUTES.beg, elapsed: 0 };
    tickCats(save.current, 0.1, { present: true });
    expect(seen(cat, "drinking")).toBe(1);
    tickCats(save.current, 0.1, { present: true });
    expect(seen(cat, "drinking")).toBe(1);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.some((e) => e.type === "tap-opened" && e.cat === cat.id)).toBe(true);
    expect(events.some((e) => e.type === "refused")).toBe(false);
    expect(save.current.character.held).toBeNull();
    tickCats(save.current, 2, { present: true });
    expect(cat.needs.thirst).toBeLessThan(5);
    expect(cat.mood).toBeGreaterThan(50);
  });

  it("кран так і не відкрили — «Фонтанолюб» іде до миски без радості", () => {
    const save = game();
    const cat = withCat(save, { drinking: 1 }, { x: 11.5, y: 1.5 });
    cat.needs.thirst = 70;
    cat.mood = 50;
    cat.act = { kind: "beg", target: "sink", goal: null, minutes: 0.1, elapsed: 0 };
    tickCats(save.current, 0.2, { present: false });
    expect(cat.mood).toBeLessThan(50);
    expect(cat.act).toMatchObject({ kind: "drink", target: `item:${waterOf(save).id}` });
  });

  it("+2 інколи перекидає миску з водою — калюжа", () => {
    let spilled = 0;
    for (let seed = 0; seed < 40; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { drinking: 2 }, { x: 17.5, y: 6.5 });
      const water = waterOf(save);
      cat.needs.thirst = 70;
      cat.act = { kind: "drink", target: `item:${water.id}`, goal: null, minutes: 0.1, elapsed: 0 };
      tickCats(save.current, 0.2, { present: false });
      if (save.current.home.messes.some((m) => m.kind === "puddle")) {
        spilled += 1;
        expect(water.water).toBe(0);
      }
    }
    expect(spilled).toBeGreaterThan(3);
    expect(spilled).toBeLessThan(40 * DRINKING.spill * 2);
  });

  it("«Зразковий поїльник» іде пити, щойно воду долили", () => {
    const save = game();
    const water = waterOf(save);
    water.water = 2;
    standAt(save, `item:${water.id}`);
    const cat = withCat(save, { drinking: -1 }, { x: 15.5, y: 7.5 });
    cat.needs.thirst = 30;
    const plain = withCat(save, {}, { x: 14.5, y: 7.5 });
    plain.needs.thirst = 30;
    interact(save);
    expect(cat.act).toMatchObject({ kind: "drink", target: `item:${water.id}` });
    expect(plain.act.kind).toBe("idle");
    expect(seen(cat, "drinking")).toBe(1);
  });

  it("сечокам'яна: «Фонтанолюб» без фонтанчика ризикує більше, «Зразковий поїльник» — менше", () => {
    const save = game();
    expect(stonesFactor(save.current, withCat(save, { drinking: 2 }))).toBeCloseTo(1.5);
    expect(stonesFactor(save.current, withCat(save, { drinking: -2 }))).toBeCloseTo(0.5);
    save.current.home.appliances.fountain = "cheap";
    expect(stonesFactor(save.current, withCat(save, { drinking: 2 }))).toBe(1);
  });
});

describe("лоток: «Розкидання наповнювача» й «Вибагливість до лотка» (рішення автора 2026-10-25)", () => {
  const boxOf = (save: Save): LitterItem => save.current.home.items.find((i): i is LitterItem => i.kind === "litter") as LitterItem;

  /** Кіт сходив у лоток на очах персонажа (у ванній). */
  function visit(save: Save, cat: Cat): LitterItem {
    const box = boxOf(save);
    Object.assign(save.current.character.body, { x: 9.5, y: 2.5 });
    cat.x = 8.5;
    cat.y = 3.5;
    cat.needs.toilet = 90;
    cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.05, elapsed: 0 };
    tickCats(save.current, 0.1, { present: true });
    return box;
  }

  it("шанс розкидати — 20% × (1 + 0,75 × рівень), із закритого лотка — удвічі рідше", () => {
    const share = (level: number, premium = false): number => {
      let count = 0;
      for (let seed = 0; seed < 300; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = withCat(save, level === 0 ? {} : { scatter: level as TraitLevel });
        if (premium) boxOf(save).quality = "premium";
        visit(save, cat);
        if (save.current.home.messes.some((m) => m.kind === "litter")) count += 1;
      }
      return count / 300;
    };
    expect(share(2)).toBeGreaterThan(0.4);
    expect(share(2)).toBeLessThan(0.6);
    expect(share(2, true)).toBeLessThan(0.33);
    expect(share(-1)).toBeLessThan(0.1);
    expect(share(-2)).toBe(0);
  });

  it("«Ювелір» ще хвилину акуратно загрібає за собою — це видно", () => {
    const save = game();
    const cat = withCat(save, { scatter: -2 });
    const box = visit(save, cat);
    expect(cat.act).toMatchObject({ kind: "bury", target: `item:${box.id}` });
    expect(seen(cat, "scatter")).toBe(1);
    tickCats(save.current, 1.2, { present: true });
    expect(cat.act.kind).not.toBe("bury");
  });

  it("«Принц на горошині» вважає лоток брудним на одне відвідування раніше", () => {
    const save = game();
    const box = boxOf(save);
    box.uses = 2;
    expect(dirtyFor(withCat(save, { litterPicky: 2 }), box)).toBe(true);
    expect(dirtyFor(withCat(save, { litterPicky: 1 }), box)).toBe(false);
    expect(dirtyFor(withCat(save), box)).toBe(false);
  });

  it("чистюля нюхає брудний лоток і йде шукати інше місце — «сюрприз» там, куди дійшов", () => {
    for (let seed = 0; seed < 20; seed++) {
      const save = game();
      save.current.rng.behavior = seed;
      const cat = withCat(save, { litterPicky: 1 });
      boxOf(save).uses = 3;
      const { events, stop } = recordEvents();
      const box = visit(save, cat);
      stop();
      if (!events.some((e) => e.type === "litter-refused")) continue;
      expect(seen(cat, "litterPicky")).toBe(1);
      expect(cat.act).toMatchObject({ kind: "toilet", target: null });
      expect(save.current.home.messes).toHaveLength(0);
      for (let i = 0; i < 30 && cat.act.kind === "toilet"; i++) tickCats(save.current, 0.5, { present: false });
      expect(save.current.home.messes.filter((m) => m.kind === "surprise")).toHaveLength(1);
      expect(box.uses).toBe(3);
      expect(cat.needs.toilet).toBeLessThan(5);
      return;
    }
    throw new Error("чистюля жодного разу не відмовився від брудного лотка");
  });
});

describe("«Мітки» (рішення автора 2026-10-25)", () => {
  it("тригери: поганий настрій, новий кіт, гості, від 4 котів, брудний лоток, тічка", () => {
    const save = game();
    const cat = withCat(save, { marking: 1 });
    cat.mood = 80;
    expect(markTriggered(save.current, cat)).toBe(false);
    cat.mood = 40;
    expect(markTriggered(save.current, cat)).toBe(true);
    cat.mood = 80;
    save.current.modifiers.day = "guests";
    expect(markTriggered(save.current, cat)).toBe(true);
    save.current.modifiers.day = null;
    const box = save.current.home.items.find((i): i is LitterItem => i.kind === "litter") as LitterItem;
    box.uses = 3;
    expect(markTriggered(save.current, cat)).toBe(true);
    box.uses = 0;
    const newcomer = withCat(save);
    newcomer.arrivedDay = save.current.day;
    expect(markTriggered(save.current, cat)).toBe(true);
    newcomer.arrivedDay = -10;
    withCat(save);
    expect(markTriggered(save.current, cat)).toBe(false);
    withCat(save);
    expect(markTriggered(save.current, cat)).toBe(true);
    const queen = game();
    const female = withCat(queen, { marking: 1 });
    female.mood = 80;
    female.sex = "female";
    female.heatUntil = queen.current.day;
    expect(markTriggered(queen.current, female)).toBe(true);
  });

  it("мітка — коротка дія: кіт задкує до верхнього кута кімнати, тремтить хвостом, і мітка лишається там", () => {
    const save = game();
    save.current.minute = hours(14);
    Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
    const cat = withCat(save, { marking: 2 }, { x: 8.5, y: 8.5 });
    cat.sterilized = true;
    cat.sex = "female";
    for (let i = 0; i < 3 * 24 * 60 * 4 && cat.act.kind !== "mark"; i++) {
      cat.mood = 10;
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      if (cat.act.kind !== "idle") cat.act = idleAct(30);
      Object.assign(cat, { x: 8.5, y: 8.5 });
      tickCats(save.current, 0.25, { present: true });
    }
    expect(cat.act.kind).toBe("mark");
    expect(cat.act.goal?.y).toBe(6);
    for (let i = 0; i < 40 && cat.act.kind === "mark"; i++) tickCats(save.current, 0.5, { present: true });
    const mark = save.current.home.messes.find((m) => m.kind === "mark");
    expect(mark?.cat).toBe(cat.id);
    expect(Math.floor(mark?.y ?? 0)).toBe(6);
    expect(seen(cat, "marking")).toBe(1);
  });
});

describe("«Шерстяні грудки» (рішення автора 2026-10-25)", () => {
  it("перед грудкою кіт хвилину кахикає — це чути й видно", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
    const cat = withCat(save, { hairballs: 2 }, { x: 8.5, y: 8.5 });
    const { events, stop } = recordEvents();
    for (let i = 0; i < 5 * 24 * 60 * 4 && cat.act.kind !== "cough"; i++) {
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      if (cat.act.kind !== "idle") cat.act = idleAct(30);
      Object.assign(cat, { x: 8.5, y: 8.5 });
      tickCats(save.current, 0.25, { present: true });
    }
    stop();
    expect(cat.act.kind).toBe("cough");
    expect(events.some((e) => e.type === "coughing" && e.cat === cat.id)).toBe(true);
    expect(save.current.home.messes.some((m) => m.kind === "hairball")).toBe(false);
    tickCats(save.current, HAIRBALL.coughMinutes + 0.1, { present: true });
    expect(save.current.home.messes.filter((m) => m.kind === "hairball")).toHaveLength(1);
    expect(seen(cat, "hairballs")).toBe(1);
  });

  it("уночі кахикання будить персонажа: зі спальні — частіше, не більше двох побудок за ніч", () => {
    const wakes = (at: { x: number; y: number }): number => {
      let count = 0;
      for (let seed = 0; seed < 400; seed++) {
        const save = game();
        const cat = withCat(save, { hairballs: 1 }, at);
        const since = save.current.nextId;
        save.current.home.messes.push({ id: save.current.nextId++, kind: "hairball", x: at.x, y: at.y, cat: cat.id });
        const report = { wakeUps: [] } as unknown as NightReport;
        if (coughWakes(save.current, report, createRng(seed), since) > 0) {
          count += 1;
          expect(report.wakeUps).toEqual([{ cat: cat.id, reason: "hairball" }]);
          expect(seen(cat, "hairballs")).toBe(1);
        }
      }
      return count / 400;
    };
    expect(wakes({ x: 3.5, y: 2.5 })).toBeGreaterThan(0.12);
    expect(wakes({ x: 3.5, y: 2.5 })).toBeLessThan(0.28);
    expect(wakes({ x: 8.5, y: 8.5 })).toBeLessThan(0.1);
    // Спільна стеля нічних побудок.
    const save = game();
    const cat = withCat(save, {}, { x: 3.5, y: 2.5 });
    const report = { wakeUps: [{ cat: cat.id, reason: "night" }, { cat: cat.id, reason: "night" }] } as unknown as NightReport;
    save.current.home.messes.push({ id: save.current.nextId++, kind: "hairball", x: 3.5, y: 2.5, cat: cat.id });
    expect(coughWakes(save.current, report, { next: () => 0, int: () => 0, chance: () => true } as never, 0)).toBe(0);
    expect(report.wakeUps).toHaveLength(WAKE_UP.maxPerNight);
  });
});
