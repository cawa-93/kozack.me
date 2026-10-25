// Етап «Їжа й гігієна» (§9.12 «Їжа й гігієна», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як риси їжі, лотка
// й шерсті видно з поведінки — «Апетит», «Швидкість їжі», «Перебірливість», «Жебракування», «Злодійство», «Пиття»,
// «Розкидання наповнювача», «Вибагливість до лотка», «Мітки», «Шерстяні грудки», «Догляд за шерстю», «Любов до води».

import { describe, expect, it } from "vitest";

import { pickUpCat } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { giveTreat, nightlyCare } from "../src/sim/care";
import { bowlEaten, decide, eatMinutes, envy, tickCats } from "../src/sim/catai";
import { APPETITE, BEGGING, CAT_ACT_MINUTES, ENVY, GULPING, THIEF } from "../src/sim/config";
import { relation } from "../src/sim/relations";
import { emptyFeeder } from "../src/sim/household";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, withCatCorner } from "./helpers";

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
