// Розпорядок і потреби котів, догляд персонажа, ніч із котами, кошеня й «Пригніченість»
// (§6.2, §8.8, §9.3, §9.12).

import { describe, expect, it } from "vitest";

import { catFeeling, petOver, petResting, petTolerance, pickUpCat } from "../src/sim/actions";
import { changeMood, closeCatDay, createCat, idleAct, offend } from "../src/sim/cat";
import { nightlyCare } from "../src/sim/care";
import { activityAt, beggingFood, carryBiteChance, decide, envy, isDirty, lapChance, tickCats } from "../src/sim/catai";
import { changeStat } from "../src/sim/character";
import { COLLAR, LOVE_BEHAVIOR, PET, PETTING } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, LitterItem, Save, TraitLevel, WaterItem } from "../src/sim/types";
import { holdUntilDone, hours, recordEvents, walkTo, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  return save;
}

function withCat(save: Save, place?: { x: number; y: number }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at: place ?? { x: 4.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

const item = <T>(save: Save, kind: string): T => save.current.home.items.find((i) => i.kind === kind) as T;

/** Прожити хвилини лише котам, без персонажа. */
function live(save: Save, minutes: number, present = false): void {
  for (let i = 0; i < minutes; i++) {
    tickCats(save.current, 1, { present });
    save.current.minute += 1;
  }
}

describe("сутінковий ритм (§9.12)", () => {
  it("найактивніші світанок і вечір, удень коти сплять", () => {
    const save = game();
    const cat = withCat(save);
    expect(activityAt(cat, hours(6))).toBe(1);
    expect(activityAt(cat, hours(13))).toBe(0.25);
    expect(activityAt(cat, hours(20))).toBe(1);
    expect(activityAt(cat, hours(2))).toBe(0.3);
    cat.traits.push({ group: "nocturnal", level: 2, seen: 0, known: false });
    expect(activityAt(cat, hours(2))).toBeCloseTo(0.7);
  });
});

describe("їжа, вода й лоток (§9.12)", () => {
  it("голодний кіт іде до миски з кормом і з'їдає порцію", () => {
    const save = game();
    const cat = withCat(save);
    const bowl = item<BowlItem>(save, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "premium";
    cat.needs.hunger = 90;
    decide(save.current, cat, createRng(1), { present: false });
    expect(cat.act.kind).toBe("eat");
    const mood = cat.mood;
    live(save, 30);
    expect(bowl.food).toBe(1);
    expect(cat.needs.hunger).toBeLessThan(10);
    expect(cat.mood).toBeGreaterThan(mood);
  });

  it("з порожньою мискою голодний кіт просить їсти", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.hunger = 95;
    decide(save.current, cat, createRng(2), { present: false });
    expect(cat.act.kind).toBe("beg");
  });

  it("перебірливий кіт відмовляється від дешевого корму (§9.12)", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "picky", level: 2, seen: 0, known: false });
    const bowl = item<BowlItem>(save, "bowl");
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    cat.needs.hunger = 90;
    const { events, stop } = recordEvents();
    decide(save.current, cat, createRng(1), { present: false });
    live(save, 30);
    stop();
    expect(events.some((e) => e.type === "cat-refused-food")).toBe(true);
  });

  it("кіт п'є з миски для води", () => {
    const save = game();
    const cat = withCat(save);
    const water = item<WaterItem>(save, "water");
    cat.needs.thirst = 70;
    decide(save.current, cat, createRng(1), { present: false });
    live(save, 20);
    expect(water.water).toBe(7);
    expect(cat.needs.thirst).toBeLessThan(10);
  });

  it("лоток брудніє після 3 відвідин дешевого наповнювача, у брудний кіт іде неохоче", () => {
    const save = game();
    const cat = withCat(save);
    const box = item<LitterItem>(save, "litter");
    for (let i = 0; i < 3; i++) {
      cat.needs.toilet = 90;
      decide(save.current, cat, createRng(i), { present: false });
      live(save, 15);
    }
    expect(box.uses).toBe(3);
    expect(isDirty(box)).toBe(true);
    const mood = cat.mood;
    cat.needs.toilet = 90;
    decide(save.current, cat, createRng(7), { present: false });
    live(save, 15);
    expect(cat.mood).toBeLessThan(mood);
  });

  it("вибагливий кіт лишає «сюрприз», якщо лоток брудний", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "litterPicky", level: 2, seen: 0, known: false });
    const box = item<LitterItem>(save, "litter");
    box.uses = 3;
    let surprises = 0;
    for (let i = 0; i < 20; i++) {
      cat.needs.toilet = 90;
      decide(save.current, cat, createRng(100 + i), { present: false });
      live(save, 20);
      box.uses = 3;
      surprises = save.current.home.messes.filter((m) => m.kind === "surprise").length;
    }
    expect(surprises).toBeGreaterThan(5);
  });

  it("брудний лоток — мінус настрій і любов; грязнулі ображаються менше й через нього не відмовляються", () => {
    const visit = (level: number, seed?: number): { mood: number; love: number; surprises: number } => {
      const save = game();
      if (seed !== undefined) save.current.rng.behavior = seed;
      const cat = withCat(save);
      if (level !== 0) cat.traits.push({ group: "litterPicky", level: level as -2 | -1 | 1 | 2, seen: 0, known: false });
      const box = item<LitterItem>(save, "litter");
      box.uses = 3;
      cat.mood = 50;
      cat.love = 50;
      cat.needs.toilet = 90;
      decide(save.current, cat, createRng(3), { present: false });
      live(save, 15);
      return { mood: 50 - cat.mood, love: 50 - cat.love, surprises: save.current.home.messes.filter((m) => m.kind === "surprise").length };
    };
    // Кіт без риси теж інколи (15%) іде лишити «сюрприз» деінде — беремо похід, коли він сходив у лоток.
    const usual = [0, 1, 2, 3, 4, 5].map((seed) => visit(0, seed)).find((v) => v.surprises === 0);
    if (!usual) throw new Error("кіт без риси жодного разу не сходив у брудний лоток");
    const slob = visit(-1);
    expect(usual.love).toBeGreaterThan(0);
    expect(slob.love).toBeGreaterThan(0);
    expect(slob.love).toBeLessThan(usual.love);
    expect(slob.surprises).toBe(0);
    // «Спартанець» (−2) не ображається зовсім (рішення автора 2026-10-25).
    const spartan = visit(-2);
    expect(spartan.love).toBe(0);
    expect(spartan.mood).toBeLessThanOrEqual(0.5);
  });
});

describe("заздрісність і мстивість (§9.12)", () => {
  it("заздрісний кіт дметься й свариться, коли іншому дали ласощі; добряк радіє", () => {
    const save = game();
    const lucky = withCat(save, { x: 4.5, y: 8.5 });
    const envious = withCat(save, { x: 5.5, y: 8.5 });
    envious.traits = [{ group: "envy", level: 2, seen: 0, known: false }];
    envious.act = { kind: "idle", target: null, goal: null, minutes: 10, elapsed: 0 };
    const mood = envious.mood;
    const before = relation(save.current, envious, lucky);
    envy(save.current, lucky, "collar");
    expect(envious.mood).toBeLessThan(mood);
    expect(relation(save.current, envious, lucky)).toBeLessThan(before);
    envious.traits = [{ group: "envy", level: -2, seen: 0, known: false }];
    const calm = envious.mood;
    envy(save.current, lucky, "collar");
    expect(envious.mood).toBeGreaterThan(calm);
  });

  it("мстивий кіт після образи залишає «сюрприз» біля ліжка, і образа минає", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 8.5 });
    cat.traits = [{ group: "vengeful", level: 2, seen: 0, known: false }];
    cat.act = { kind: "idle", target: null, goal: null, minutes: 600, elapsed: 0 };
    offend(save.current, cat, -5, "прогнали з місця");
    expect(cat.offense).toBeDefined();
    let walked = false;
    for (let i = 0; i < 240 && cat.offense !== undefined; i++) {
      // Поки не пішов мститися, кіт спокійно сидить; потім іде сам.
      if (cat.act.kind === "revenge") walked = true;
      else cat.act = { kind: "idle", target: null, goal: null, minutes: 600, elapsed: 0 };
      live(save, 1);
    }
    expect(walked).toBe(true);
    expect(cat.offense).toBeUndefined();
    expect(cat.hurt).toBeNull();
    expect(Math.hypot(cat.x - 2.5, cat.y - 2.5)).toBeLessThan(1.5);
    const bed = save.current.home.messes.find((m) => m.kind === "surprise");
    expect(bed && bed.x < 4 && bed.y < 4).toBe(true);
  });
});

describe("сон і увага (§9.12)", () => {
  it("опівдні втомлений кіт спить і відпочиває", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(12);
    cat.needs.fatigue = 60;
    decide(save.current, cat, createRng(3), { present: false });
    expect(cat.act.kind).toBe("sleep");
    live(save, 6 * 60);
    expect(cat.needs.fatigue).toBeLessThan(40);
  });

  it("схований кіт, як і сплячий, увагу не просить: штрафу «увагу не дають» немає; поза схованкою — −1 за годину (загальна ревізія 2026-10-29)", () => {
    const moodAfter = (hidden: boolean): number => {
      const save = game();
      const cat = withCat(save, { x: 1.5, y: 9.5 });
      save.current.minute = hours(12);
      // Слабкий кіт (Х4) з увагою на 100, персонаж удома.
      cat.health = 20;
      cat.mood = 50;
      for (let t = 0; t < 2 * 60; t += 0.25) {
        cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 100, play: 0 };
        cat.act = { kind: hidden ? "hide" : "idle", target: null, goal: null, minutes: 60, elapsed: 0 };
        tickCats(save.current, 0.25, { present: true });
      }
      return cat.mood;
    };
    expect(moodAfter(true)).toBeCloseTo(50, 5);
    expect(moodAfter(false)).toBeCloseTo(48, 5);
  });

  it("коли бракує уваги, кіт іде до персонажа", () => {
    const save = game();
    const cat = withCat(save, { x: 16.5, y: 8.5 });
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.5;
    save.current.minute = hours(19);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 80, play: 0 };
    decide(save.current, cat, createRng(3), { present: true });
    expect(cat.act.kind).toBe("attention");
    live(save, 8, true);
    expect(Math.hypot(cat.x - 4.5, cat.y - 8.5)).toBeLessThan(1.6);
  });
});

describe("поведінка котів: пошук багів 2026-10-25 (§9.12)", () => {
  const sleeping = (cat: Cat): void => {
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 8 * 60, elapsed: 60 };
  };

  it("сплячий кіт прокидається від спраги, а не спить годинами зі спрагою на 100", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(13);
    sleeping(cat);
    cat.needs = { hunger: 0, thirst: 96, toilet: 0, fatigue: 80, attention: 0, play: 0 };
    live(save, 1);
    expect(cat.act.kind).toBe("drink");
  });

  it("спраглий кіт без жодної миски для води просить пити, а не засинає щохвилини (перевірка стосунків 2026-10-26)", () => {
    const save = game();
    save.current.home.items = save.current.home.items.filter((i) => i.kind !== "water");
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    save.current.minute = hours(13);
    cat.needs = { hunger: 0, thirst: 96, toilet: 0, fatigue: 70, attention: 0, play: 0 };
    const { events, stop } = recordEvents();
    let naps = 0;
    for (let i = 0; i < 120; i++) {
      const before = cat.act;
      live(save, 1, true);
      if (cat.act !== before && cat.act.kind === "sleep") naps++;
    }
    stop();
    expect(naps).toBe(0);
    expect(cat.act).toMatchObject({ kind: "beg", target: "water" });
    expect(events.filter((e) => e.type === "meow" && e.cat === cat.id).length).toBeGreaterThan(0);
  });

  it("кіт, що просить пити біля порожньої миски для води, — не жебрак; біля порожньої миски для корму — жебрак (§9.4, Р6)", () => {
    const save = game();
    const water = save.current.home.items.find((i): i is WaterItem => i.kind === "water")!;
    water.water = 0;
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    save.current.minute = hours(13);
    cat.needs = { hunger: 0, thirst: 96, toilet: 0, fatigue: 0, attention: 0, play: 0 };
    decide(save.current, cat, createRng(1), { present: false });
    expect(cat.act).toMatchObject({ kind: "beg", target: `item:${water.id}` });
    expect(beggingFood(save.current, cat)).toBe(false);
    for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 0;
    cat.needs = { hunger: 96, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
    decide(save.current, cat, createRng(1), { present: false });
    expect(cat.act.kind).toBe("beg");
    expect(cat.act.target?.startsWith("item:")).toBe(true);
    expect(beggingFood(save.current, cat)).toBe(true);
  });

  it("сплячий кіт без уваги не сумує: він нічого не просить", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(13);
    sleeping(cat);
    cat.mood = 50;
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 90, attention: 100, play: 0 };
    live(save, 60, true);
    expect(cat.act.kind).toBe("sleep");
    expect(cat.mood).toBe(50);
  });

  it("просто побродити гри не знімає — лише прогулянка заради гри", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(13);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 50 };
    cat.act = { kind: "wander", target: null, goal: null, minutes: 0.5, elapsed: 0 };
    live(save, 1);
    expect(cat.needs.play).toBeGreaterThanOrEqual(50);
    cat.act = { kind: "wander", target: "play", goal: null, minutes: 0.5, elapsed: 0 };
    live(save, 1);
    expect(cat.needs.play).toBeLessThan(20);
  });
});

describe("догляд персонажа (§9.12)", () => {
  it("дзвіночка немає: полохливий і нестресостійкий кіт у нашийнику вночі не сумнішає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17)", () => {
    const lost = (traits: Record<string, TraitLevel>): number => {
      const save = game();
      const cat = withCat(save);
      cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
      cat.collar = { quality: "premium" };
      cat.mood = 50;
      nightlyCare(save.current, createRng(1));
      return 50 + COLLAR.mood.premium - cat.mood;
    };
    // Раніше дзвіночок щоночі забирав 1 настрою в полохливого й нестресостійкого — мовчки й без змоги його зняти.
    expect(lost({ bravery: -1 })).toBeCloseTo(0);
    expect(lost({ stress: -1 })).toBeCloseTo(0);
    expect(lost({ bravery: 1 })).toBeCloseTo(0);
  });

  it("старе збереження: дзвіночок зникає з нашийника, з аптечки, з ящиків і з пакунків (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17)", () => {
    const save = game();
    const cat = withCat(save);
    const home = save.current.home as unknown as Record<string, unknown> & typeof save.current.home;
    cat.collar = { quality: "cheap", bell: true } as unknown as Cat["collar"];
    (home.supplies as Record<string, unknown>)["bell"] = { cheap: 2, premium: 1 };
    home.boxes = { food: { cheap: 3, premium: 0 }, ...({ bell: { cheap: 1, premium: 0 } } as object) };
    home.acquired.push("bell" as never);
    home.porch.push({ id: 90, quality: "cheap", at: 0, product: "bell" as never }, { id: 91, quality: "cheap", at: 0, product: "food" });
    home.deliveries.push({ id: 92, quality: "premium", at: 10_000, product: "bell" as never });
    const loaded = deserialize(serialize(save)).current;
    expect(loaded.cats[0]?.collar).toEqual({ quality: "cheap" });
    expect(loaded.home.supplies).not.toHaveProperty("bell");
    expect(loaded.home.boxes).toEqual({ food: { cheap: 3, premium: 0 } });
    expect(loaded.home.acquired).not.toContain("bell");
    expect(loaded.home.porch.map((d) => d.id)).toEqual([91]);
    expect(loaded.home.deliveries.map((d) => d.id)).not.toContain(92);
  });

  it("корм із шафки — у миску одразу доверху, вода доливається одним натисканням", () => {
    const save = game();
    addSupply(save.current, "catFood", "cheap", 0); // шафку видно, коли корм уже бував удома
    const supplies = save.current.home.supplies.catFood;
    supplies.cheap = 5;
    supplies.premium = 0;
    walkTo(save, "cat-cabinet");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "catfood", quality: "cheap", sterile: false });
    // Узяти в руки — ще не витратити: корм зі сховища списується, коли його насипають.
    expect(supplies.cheap).toBe(5);
    const bowl = item<BowlItem>(save, "bowl");
    walkTo(save, `item:${bowl.id}`);
    interact(save);
    expect(bowl.food).toBe(2);
    expect(supplies.cheap).toBe(3);
    expect(save.current.character.held).toBeNull();
    const water = item<WaterItem>(save, "water");
    water.water = 1;
    walkTo(save, `item:${water.id}`);
    interact(save);
    expect(water.water).toBe(8);
  });

  it("корму менше, ніж влазить, — насипається все, що є; змішувати корми не можна", () => {
    const save = game();
    addSupply(save.current, "catFood", "cheap", 0); // шафку видно, коли корм уже бував удома
    const supplies = save.current.home.supplies.catFood;
    supplies.cheap = 1;
    supplies.premium = 0;
    const bowl = item<BowlItem>(save, "bowl");
    walkTo(save, "cat-cabinet");
    interact(save);
    walkTo(save, `item:${bowl.id}`);
    interact(save);
    expect(bowl.food).toBe(1);
    expect(supplies.cheap).toBe(0);
    // Дорогий у миску з дешевим не досипають: відмова, корм лишається в руках.
    supplies.premium = 3;
    walkTo(save, "cat-cabinet");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "catfood", quality: "premium", sterile: false });
    walkTo(save, `item:${bowl.id}`);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused", reason: "mixed" }));
    expect(bowl.food).toBe(1);
    expect(supplies.premium).toBe(3);
    // Покласти назад — нічого не втрачається.
    walkTo(save, "cat-cabinet");
    interact(save);
    expect(save.current.character.held).toBeNull();
    expect(supplies.premium).toBe(3);
  });

  it("у миску з дешевим досипають дешевий, хоч шафка й дає спершу дорогий", () => {
    const save = game();
    addSupply(save.current, "catFood", "cheap", 0);
    const supplies = save.current.home.supplies.catFood;
    Object.assign(supplies, { cheap: 5, premium: 5 });
    const bowl = item<BowlItem>(save, "bowl");
    Object.assign(bowl, { food: 1, foodQuality: "cheap", sterile: false });
    walkTo(save, "cat-cabinet");
    interact(save);
    walkTo(save, `item:${bowl.id}`);
    interact(save);
    expect(bowl).toMatchObject({ food: 2, foodQuality: "cheap" });
    expect(supplies).toEqual({ cheap: 4, premium: 5 });
    expect(save.current.character.held).toBeNull();
  });

  it("чистка лотка: 3 хвилини, −3 здорового глузду, новий наповнювач із запасу", () => {
    const save = game();
    save.current.home.supplies.litter.premium = 2;
    const box = item<LitterItem>(save, "litter");
    box.uses = 4;
    walkTo(save, `item:${box.id}`);
    const sanity = save.current.character.stats.sanity;
    holdUntilDone(save);
    expect(box.uses).toBe(0);
    expect(box.litter).toBe("premium");
    expect(save.current.home.supplies.litter.premium).toBe(1);
    expect(save.current.character.stats.sanity).toBeCloseTo(sanity - 3 * 0.9, 0);
  });

  it("пестощі: здоровий глузд, поки кіт хоче уваги; «Пастка на животику» кусає", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.needs.attention = 90;
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    const sanity = save.current.character.stats.sanity;
    advance(save, 2, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 3);
    expect(cat.interacted).toBe(true);

    cat.traits.push({ group: "petting", level: -2, seen: 0, known: false });
    expect(petTolerance(cat)).toBe(PET.minToleranceMinutes);
    const { events, stop } = recordEvents();
    advance(save, 3, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.some((e) => e.type === "bite")).toBe(true);
  });

  it("після укусу кіт відходить, а утримання не починає пестощі знову", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.needs.attention = 90;
    cat.traits.push({ group: "petting", level: -2, seen: 0, known: false });
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    const { events, stop } = recordEvents();
    const feelings = new Set<string | null>();
    for (let i = 0; i < 20; i++) {
      advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
      if (events.some((e) => e.type === "bite")) feelings.add(catFeeling(save.current, cat));
    }
    stop();
    expect(events.filter((e) => e.type === "bite")).toHaveLength(1);
    expect(feelings.has("content")).toBe(false);
    expect(cat.act.kind).toBe("wander");
  });

  it("кота беруть на руки й опускають; сонного це ображає", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 100, elapsed: 0 };
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    const love = cat.love;
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "cat", cat: cat.id, offended: true, disturbed: true });
    expect(cat.love).toBeLessThan(love);
    interact(save);
    expect(save.current.character.held).toBeNull();
  });

  it("кіт, що лише йде спати, ще не спить: на руки чи пестощі — не «розбудили» й не проти волі (загальна ревізія 2026-10-29)", () => {
    const setup = (): { save: Save; cat: Cat } => {
      const save = game();
      const cat = withCat(save, { x: 4.5, y: 7.6 });
      cat.needs.attention = 60;
      cat.act = { kind: "sleep", target: null, goal: { x: 1, y: 7 }, minutes: 100, elapsed: 0 };
      Object.assign(save.current.character.body, { x: 4.5, y: 8.2, facing: { x: 0, y: -1 } });
      return { save, cat };
    };
    const woken = (events: readonly { type: string; reason?: string }[]): boolean => events.some((e) => e.type === "cat-mood" && e.reason?.startsWith("розбудили") === true);
    const carried = setup();
    const love = carried.cat.love;
    const taken = recordEvents();
    interact(carried.save);
    taken.stop();
    expect(carried.save.current.character.held).toEqual({ kind: "cat", cat: carried.cat.id });
    expect(woken(taken.events)).toBe(false);
    expect(carried.cat.love).toBeGreaterThanOrEqual(love);

    const petted = setup();
    const stroked = recordEvents();
    advance(petted.save, 0.05, { move: { x: 0, y: 0 }, hold: true });
    stroked.stop();
    expect(petted.save.current.character.activity).toMatchObject({ kind: "pet", cat: petted.cat.id });
    expect(woken(stroked.events)).toBe(false);
  });

  it("на руках: «Коліночний» радіє, без риси — терпить, «Не чіпай мене» пручається", () => {
    const moodAfter = (lap: TraitLevel | 0): { mood: number; attention: number; feeling: string | null } => {
      const save = game();
      const cat = withCat(save);
      if (lap !== 0) cat.traits.push({ group: "lap", level: lap, seen: 0, known: false });
      cat.mood = 50;
      cat.needs.attention = 60;
      save.current.character.held = { kind: "cat", cat: cat.id };
      const feeling = catFeeling(save.current, cat);
      tickCats(save.current, 1, { present: true });
      return { mood: cat.mood, attention: cat.needs.attention, feeling };
    };
    const lover = moodAfter(2);
    const neutral = moodAfter(0);
    const hater = moodAfter(-2);
    expect(lover.feeling).toBe("content");
    expect(neutral.feeling).toBe("reluctant");
    expect(hater.feeling).toBe("struggling");
    expect(lover.mood).toBeCloseTo(neutral.mood + 1);
    expect(hater.mood).toBeCloseTo(neutral.mood - 1);
    expect(lover.attention).toBeLessThan(neutral.attention);
  });

  it("хто пручається — кусає тим частіше, чим менше любить руки; іноді вирветься й утече", () => {
    const bites = (lap: TraitLevel | 0): { bites: number; escapes: number } => {
      let bites = 0;
      let escapes = 0;
      for (let seed = 0; seed < 60; seed++) {
        const save = game();
        save.current.rng.behavior = seed;
        const cat = withCat(save);
        if (lap !== 0) cat.traits.push({ group: "lap", level: lap, seen: 0, known: false });
        save.current.character.held = { kind: "cat", cat: cat.id, offended: true };
        const { events, stop } = recordEvents();
        for (let i = 0; i < 5 && save.current.character.held !== null; i++) tickCats(save.current, 1, { present: true });
        stop();
        bites += events.filter((e) => e.type === "bite").length;
        if (events.some((e) => e.type === "cat-broke-free")) {
          escapes += 1;
          expect(save.current.character.held).toBeNull();
          expect(cat.act.kind).toBe("hide");
        }
      }
      return { bites, escapes };
    };
    const offended = bites(0);
    const hater = bites(-2);
    expect(hater.bites).toBeGreaterThan(offended.bites);
    expect(hater.escapes).toBeGreaterThan(0);
    expect(hater.escapes).toBeLessThan(hater.bites);
  });

  it("кожна зміна настрою — подія для сердечок, навіть коли настрій уже на межі (§9.12)", () => {
    const save = game();
    const cat = withCat(save);
    cat.mood = 100;
    const { events, stop } = recordEvents();
    changeMood(save.current, cat, 2);
    changeMood(save.current, cat, -1);
    stop();
    expect(events).toContainEqual({ type: "cat-felt", cat: cat.id, delta: 2 });
    expect(events.some((e) => e.type === "cat-felt" && e.delta < 0)).toBe(true);
  });

  it("чистюля, від якого раз у раз тягнуться руки в брудному одязі, — один прояв за годину (загальна ревізія 2026-10-29)", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.traits.push({ group: "litterPicky", level: 1, seen: 0, known: false });
    save.current.home.clothes = 0;
    const { events, stop } = recordEvents();
    for (let i = 0; i < 10; i++) {
      Object.assign(cat, { x: 4.5, y: 7.6, act: { kind: "idle", target: null, goal: null, minutes: 100, elapsed: 0 } });
      Object.assign(save.current.character.body, { x: 4.5, y: 8.2, facing: { x: 0, y: -1 } });
      interact(save);
      advance(save, 0.5);
    }
    stop();
    expect(events.filter((e) => e.type === "cat-dodged" && e.cat === cat.id)).toHaveLength(10);
    expect(cat.traits.find((t) => t.group === "litterPicky")?.seen).toBe(1);
  });

  it("чистюля не йде на руки в брудному одязі й відходить", () => {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.traits.push({ group: "litterPicky", level: 1, seen: 0, known: false });
    cat.act = { kind: "idle", target: null, goal: null, minutes: 100, elapsed: 0 };
    save.current.character.body.x = 4.5;
    save.current.character.body.y = 8.2;
    save.current.character.body.facing = { x: 0, y: -1 };
    save.current.home.clothes = 0;
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events).toContainEqual({ type: "cat-dodged", cat: cat.id, issue: "clothes" });
    expect(cat.act.kind).toBe("wander");
    expect(cat.act.goal?.y).toBeLessThan(7);
    // Поблажливий кіт іде на руки й у брудному одязі.
    cat.traits = [{ group: "litterPicky", level: -1, seen: 0, known: false }];
    cat.act = { kind: "idle", target: null, goal: null, minutes: 100, elapsed: 0 };
    interact(save);
    expect(save.current.character.held?.kind).toBe("cat");
  });
});

describe("ніч із котами (§4, §8.8, §9.12)", () => {
  it("коти живуть ніч: голод росте, настрій записується за добу", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(22);
    const hunger = cat.needs.hunger;
    goToSleep(save);
    expect(cat.moodHistory).toHaveLength(1);
    expect(save.current.cats[0]?.needs.hunger ?? 0).toBeGreaterThan(hunger);
  });

  it("«Живий будильник» з порожньою мискою будить о 05:00 — день починається раніше", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits.push({ group: "morning", level: 2, seen: 0, known: false });
    cat.needs.hunger = 70;
    save.current.minute = hours(22);
    let woke = false;
    for (let seed = 0; seed < 10 && !woke; seed++) {
      const copy = structuredClone(save);
      copy.current.seed = seed;
      const report = goToSleep(copy);
      if (report?.wakeUps.some((w) => w.reason === "morning")) {
        woke = true;
        expect(report.wokeMinute).toBe(hours(5));
        expect(copy.current.minute).toBe(hours(5));
        expect(report.sleptHours).toBeCloseTo(7);
      }
    }
    expect(woke).toBe(true);
  });

  it("ритуальна побудка «Живого будильника» з повною мискою — пів години сну, сова встає о 08:00 (загальна ревізія 2026-10-29)", () => {
    let rituals = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = withCatCorner(newGame({ sex: "male", difficulty: "normal", seed: 11 }));
      save.current.modifiers.day = null;
      const cat = withCat(save);
      cat.traits.push({ group: "morning", level: 2, seen: 0, known: false });
      // Ситий кіт і повна миска: голодної побудки не буде, лише ритуал.
      cat.needs.hunger = 0;
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 2;
      save.current.seed = seed;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      if (!report?.wakeUps.some((w) => w.reason === "morning")) continue;
      rituals += 1;
      const nights = report.wakeUps.filter((w) => w.reason === "night").length;
      expect(report.wokeMinute).toBe(hours(8));
      expect(save.current.minute).toBe(hours(8));
      expect(report.sleptHours).toBeCloseTo(10 - 0.5 - nights);
    }
    expect(rituals).toBeGreaterThan(0);
  });

  it("голодний «Живий будильник» з порожньою мискою будить сову о 05:00, як і раніше", () => {
    let woke = false;
    for (let seed = 0; seed < 10 && !woke; seed++) {
      const save = withCatCorner(newGame({ sex: "male", difficulty: "normal", seed: 11 }));
      save.current.modifiers.day = null;
      const cat = withCat(save);
      cat.traits.push({ group: "morning", level: 2, seen: 0, known: false });
      cat.needs.hunger = 70;
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 0;
      save.current.seed = seed;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      if (!report?.wakeUps.some((w) => w.reason === "morning")) continue;
      woke = true;
      expect(report.wokeMinute).toBe(hours(5));
    }
    expect(woke).toBe(true);
  });
});

describe("нічні побудки й «Галасливі сусіди» (§8.8)", () => {
  it("нічна побудка забирає годину сну й не починає день", () => {
    let woken = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      const cat = withCat(save);
      cat.traits.push({ group: "nocturnal", level: 2, seen: 0, known: false });
      // Миски повні: ранкової побудки не буде.
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 2;
      save.current.seed = seed;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      const nights = report?.wakeUps.filter((w) => w.reason === "night").length ?? 0;
      if (nights > 0) woken += 1;
      expect(report?.wokeMinute).toBe(hours(6));
      expect(report?.sleptHours).toBeCloseTo(8 - nights);
    }
    expect(woken).toBeGreaterThan(0);
  });

  it("побудка до півночі не починає день: персонаж засинає знову", () => {
    let early = 0;
    for (let seed = 0; seed < 100; seed++) {
      const save = game();
      const cat = withCat(save);
      cat.traits.push({ group: "nocturnal", level: 2, seen: 0, known: false });
      save.current.seed = seed;
      // Сусіди будять на 2 години раніше: до пробудження менше 6 годин уже о 22:00.
      save.current.today.earlyWake = 120;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      if (report?.wakeUps.some((w) => w.reason === "night")) early += 1;
      expect(report?.wokeMinute).toBeGreaterThanOrEqual(0);
      expect(save.current.minute).toBeGreaterThanOrEqual(0);
    }
    expect(early).toBeGreaterThan(0);
  });
});

describe("після попередження чи укусу кіт чверть години не дається гладити (§9.12, рішення автора 2026-10-29, А8)", () => {
  const HOLD = { move: { x: 0, y: 0 }, hold: true };

  /** Кіт, що хоче уваги, просто перед персонажем. */
  function petting(): { save: Save; cat: Cat } {
    const save = game();
    const cat = withCat(save, { x: 4.5, y: 7.6 });
    cat.needs.attention = 90;
    Object.assign(save.current.character.body, { x: 4.5, y: 8.2, facing: { x: 0, y: -1 } });
    return { save, cat };
  }

  /** Кіт знову під рукою й нікуди не йде. */
  function backUnderHand(cat: Cat): void {
    Object.assign(cat, { x: 4.5, y: 7.6, act: idleAct(30) });
  }

  /** Утримувати дію `minutes` хвилин дрібними кроками. */
  function hold(save: Save, minutes: number): void {
    for (let spent = 0; spent < minutes - 1e-9; spent += 0.05) advance(save, 0.05, HOLD);
  }

  it("відпустити кнопку на попередженні й натиснути знову — кіт іде з-під руки: одна відмова на утримання, без здорового глузду й укусу", () => {
    const { save, cat } = petting();
    // Гладити, доки кіт не попередив: б'є хвостом і притискає вуха.
    hold(save, petTolerance(cat) - PETTING.warnMinutes + 0.25);
    expect(catFeeling(save.current, cat)).toBe("reluctant");
    // Відпустили на мить — і тримають знову дві хвилини.
    advance(save, 0.05);
    expect(save.current.character.activity).toBeNull();
    backUnderHand(cat);
    const sanity = save.current.character.stats.sanity;
    const mood = cat.mood;
    const { events, stop } = recordEvents();
    hold(save, 2);
    stop();
    expect(events.filter((e) => e.type === "refused")).toEqual([{ type: "refused", object: `cat:${cat.id}`, reason: "cat-annoyed" }]);
    expect(events.some((e) => e.type === "purr" || e.type === "bite")).toBe(false);
    // Пестощі за дві хвилини дали б +3,6; лишається хіба «кіт у полі зору».
    expect(save.current.character.stats.sanity).toBeLessThan(sanity + 0.5);
    expect(cat.mood).toBeLessThanOrEqual(mood);
    expect(cat.act.kind).toBe("wander");
    // Утримання — одна дія: нові пестощі не почнуться, поки кнопку не відпустили.
    const activity = save.current.character.activity;
    expect(activity === null ? save.current.character.holdSpent : activity.kind === "pet" && petOver(activity)).toBe(true);
  });

  it("після укусу — те саме; а через 15 хвилин кіт знову дається гладити", () => {
    const { save, cat } = petting();
    cat.traits.push({ group: "petting", level: -2, seen: 0, known: false });
    const { events, stop } = recordEvents();
    for (let i = 0; i < 200 && !events.some((e) => e.type === "bite"); i++) advance(save, 0.05, HOLD);
    expect(events.some((e) => e.type === "bite")).toBe(true);
    advance(save, 0.05);
    backUnderHand(cat);
    hold(save, 0.5);
    expect(events.filter((e) => e.type === "refused" && e.reason === "cat-annoyed")).toHaveLength(1);
    // Відпустили й чекають чверть години.
    advance(save, 0.05);
    advance(save, PETTING.restMinutes);
    backUnderHand(cat);
    const sanity = save.current.character.stats.sanity;
    hold(save, 1);
    stop();
    expect(events.filter((e) => e.type === "refused")).toHaveLength(1);
    expect(save.current.character.activity).toMatchObject({ kind: "pet", cat: cat.id });
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 1);
  });

  it("відпустили ще до попередження — паузи немає: кіт одразу дається гладити знову", () => {
    const { save, cat } = petting();
    hold(save, petTolerance(cat) - PETTING.warnMinutes - 0.5);
    expect(catFeeling(save.current, cat)).toBe("content");
    advance(save, 0.05);
    backUnderHand(cat);
    const sanity = save.current.character.stats.sanity;
    const { events, stop } = recordEvents();
    hold(save, 0.5);
    stop();
    expect(events.some((e) => e.type === "refused")).toBe(false);
    expect(save.current.character.activity).toMatchObject({ kind: "pet", cat: cat.id });
    expect(save.current.character.stats.sanity).toBeGreaterThan(sanity + 0.5);
  });

  it("стара гра без поля паузи — кіт дається гладити", () => {
    const { save, cat } = petting();
    delete cat.petWarnedAt;
    const restored = deserialize(serialize(save));
    const again = restored.current.cats.find((c) => c.id === cat.id)!;
    expect(petResting(restored.current, again)).toBe(false);
  });
});

describe("новонароджене кошеня (§7, §9.8; загальна ревізія 2026-10-29)", () => {
  /** Новонароджене спить на підлозі перед персонажем. */
  function newborn(save: Save): Cat {
    const baby = createCat(save.current, createRng(7), { source: "born", ageWeeks: 0, at: { x: 4.5, y: 7.6 } });
    addCat(save.current, baby);
    tickCats(save.current, 0.01, { present: true });
    Object.assign(save.current.character.body, { x: 4.5, y: 8.2, facing: { x: 0, y: -1 } });
    return baby;
  }

  it("утримання біля новонародженого — одна відмова зі своєю іконкою: не гладять і настрій не падає; натискання бере на руки", () => {
    const save = game();
    const baby = newborn(save);
    expect(baby.act.kind).toBe("sleep");
    const idle = deserialize(serialize(save));
    for (let i = 0; i < 60; i++) advance(idle, 0.05);
    const { events, stop } = recordEvents();
    for (let i = 0; i < 60; i++) {
      advance(save, 0.05, { move: { x: 0, y: 0 }, hold: true });
      expect(save.current.character.activity).toBeNull();
    }
    stop();
    expect(events.filter((e) => e.type === "refused")).toEqual([{ type: "refused", object: `cat:${baby.id}`, reason: "newborn" }]);
    expect(baby.mood).toBeCloseTo(idle.current.cats.find((c) => c.id === baby.id)!.mood, 6);
    expect(baby.act.kind).toBe("sleep");
    // Відпустили — і натиснули: кошеня на руках, як сонний кіт.
    advance(save, 0.05);
    interact(save);
    expect(save.current.character.held).toMatchObject({ kind: "cat", cat: baby.id, disturbed: true });
  });

  it("тиждень без взаємодії любові новонародженого не забирає; дорослому — забирає", () => {
    const save = game();
    const baby = newborn(save);
    const adult = withCat(save, { x: 6.5, y: 8.5 });
    const love = { baby: baby.love, adult: adult.love };
    for (let day = 0; day < 7; day++) for (const cat of [baby, adult]) closeCatDay(save.current, cat);
    expect(baby.love).toBe(love.baby);
    expect(adult.love).toBeLessThan(love.adult);
  });
});

describe("кошеня й «Пригніченість» (§6.2)", () => {
  it("кошеня приходить зі стартовим пакетом корму й наповнювача", () => {
    const save = game();
    save.current.character.stats.sanity = 20;
    save.current.minute = hours(22);
    goToSleep(save);
    expect(save.current.cats).toHaveLength(1);
    expect(save.current.home.supplies.catFood.cheap).toBe(8);
    expect(save.current.home.supplies.litter.cheap).toBe(10);
  });

  it("без котів і нижче 35% уранці — «Пригніченість»: здоровий глузд між 10 і 35", () => {
    const save = game();
    const state = save.current;
    state.character.depressed = true;
    state.character.stats.sanity = 20;
    changeStat(state, "sanity", 50);
    expect(state.character.stats.sanity).toBe(35);
    changeStat(state, "sanity", -50);
    expect(state.character.stats.sanity).toBe(10);
    withCat(save);
    expect(state.character.depressed).toBe(false);
  });

  it("пригнічений без кота забирає кошеня й тоді, коли здоровий глузд дійшов рівно до 35 (перевірка розмноження 2026-10-28)", () => {
    const save = game();
    const state = save.current;
    state.cats = [];
    state.character.depressed = true;
    state.character.stats.sanity = 35;
    state.minute = 22 * 60;
    goToSleep(save);
    expect(state.cats.map((c) => c.source)).toEqual(["shelter-forced"]);
  });
});

describe("кіт чує корм (§9.12)", () => {
  const feed = (save: Save, quality: "cheap" | "premium" = "cheap"): BowlItem => {
    save.current.home.supplies.catFood[quality] = 5;
    if (quality === "premium") save.current.home.supplies.catFood.cheap = 0;
    walkTo(save, "cat-cabinet");
    interact(save);
    const bowl = item<BowlItem>(save, "bowl");
    walkTo(save, `item:${bowl.id}`);
    interact(save);
    return bowl;
  };
  const prepare = (save: Save): Cat => {
    save.current.home.acquired.push("catFood");
    const cat = withCat(save, { x: 3.5, y: 9.5 });
    cat.needs.hunger = 60;
    cat.act = { kind: "idle", target: null, goal: null, minutes: 30, elapsed: 0 };
    return cat;
  };

  it("голодний кіт кидає справи й біжить до миски", () => {
    const save = game();
    const cat = prepare(save);
    const bowl = feed(save);
    expect(cat.act).toMatchObject({ kind: "eat", target: `item:${bowl.id}` });
  });

  it("ситий кіт не біжить", () => {
    const save = game();
    const cat = prepare(save);
    cat.needs.hunger = 20;
    feed(save);
    expect(cat.act.kind).toBe("idle");
  });

  it("гурман не біжить на простий корм, а на дорогий — біжить", () => {
    const save = game();
    const cat = prepare(save);
    cat.traits = [{ group: "picky", level: 2, seen: 0, known: false }];
    feed(save, "cheap");
    expect(cat.act.kind).toBe("idle");
    const other = game();
    const gourmet = prepare(other);
    gourmet.traits = [{ group: "picky", level: 2, seen: 0, known: false }];
    feed(other, "premium");
    expect(gourmet.act.kind).toBe("eat");
  });

  it("соня спить далі, а чуйний кіт прокидається", () => {
    const save = game();
    const cat = prepare(save);
    cat.traits = [{ group: "sleep", level: 2, seen: 0, known: false }];
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 120, elapsed: 0 };
    feed(save);
    expect(cat.act.kind).toBe("sleep");
    const other = game();
    const light = prepare(other);
    light.traits = [{ group: "sleep", level: -1, seen: 0, known: false }];
    light.act = { kind: "sleep", target: null, goal: null, minutes: 120, elapsed: 0 };
    feed(other);
    expect(light.act.kind).toBe("eat");
  });
});

describe("що відчуває кіт (§9.12)", () => {
  it("видно з нього самого: подобається, терпить, пручається", () => {
    const save = game();
    const state = save.current;
    const cat = withCat(save, { x: 4.5, y: 8.5 });
    cat.needs.attention = 90;
    state.character.activity = { kind: "pet", cat: cat.id, minutes: 0.5 };
    expect(catFeeling(state, cat)).toBe("content");
    cat.needs.attention = 10;
    expect(catFeeling(state, cat)).toBe("reluctant");
    state.character.activity = { kind: "pet", cat: cat.id, minutes: 30 };
    expect(catFeeling(state, cat)).toBe("struggling");
    state.character.activity = null;
    expect(catFeeling(state, cat)).toBeNull();
    // Сплячого кота взяли на руки — пручається.
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 60, elapsed: 0 };
    pickUpCat(state, cat);
    expect(catFeeling(state, cat)).toBe("struggling");
  });
});

describe("любов змінює поведінку (§9.12, правка автора 2026-10-25)", () => {
  it("хто любить, довше терпить пестощі, частіше лягає на коліна й рідше кусає на руках", () => {
    const save = game();
    const cat = withCat(save);
    cat.love = 50;
    const tolerance = petTolerance(cat);
    const lap = lapChance(cat);
    const bite = carryBiteChance(cat);
    cat.love = 100;
    expect(petTolerance(cat)).toBeCloseTo(tolerance * 1.5);
    expect(lapChance(cat)).toBeCloseTo(lap + LOVE_BEHAVIOR.lapBonus);
    expect(carryBiteChance(cat)).toBeCloseTo(bite * LOVE_BEHAVIOR.biteFactor);
  });

  it("хто не любить, сам по увагу не йде — до нього треба підійти", () => {
    const save = game();
    const cat = withCat(save);
    save.current.minute = hours(19);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
    cat.love = 10;
    decide(save.current, cat, createRng(3), { present: true });
    expect(cat.act.kind).not.toBe("attention");
    cat.love = 50;
    decide(save.current, cat, createRng(3), { present: true });
    expect(cat.act.kind).toBe("attention");
  });

  it("хто не любить, на руках пручається сильніше: терплячий пручається, любитель рук лише терпить", () => {
    const save = game();
    const state = save.current;
    const cat = withCat(save, { x: 4.5, y: 8.5 });
    state.character.held = { kind: "cat", cat: cat.id };
    cat.love = 50;
    expect(catFeeling(state, cat)).toBe("reluctant");
    cat.love = 10;
    expect(catFeeling(state, cat)).toBe("struggling");
    cat.traits = [{ group: "lap", level: 1, seen: 0, known: false }];
    expect(catFeeling(state, cat)).toBe("reluctant");
    cat.love = 50;
    expect(catFeeling(state, cat)).toBe("content");
  });
});
