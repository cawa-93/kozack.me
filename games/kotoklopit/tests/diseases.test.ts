// Хвороби котів (§9.5): перебіг, шкода після «безпечного» терміну, ліки вдома, дієта, спокій,
// контроль хронічної, зараження й симптоми.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { afterMeal, fallIll, giveMedicine, hasDisease, hungerFactor, nightlyDiseases, walkFactor } from "../src/sim/diseases";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save } from "../src/sim/types";

function game(): Save {
  const save = newGame({ sex: "female", difficulty: "normal", seed: 9 });
  save.current.home.supplies.pills = { cheap: 0, premium: 20 };
  save.current.home.supplies.drops = { cheap: 0, premium: 10 };
  return save;
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 11), { source: "shelter", ageWeeks: 3, at: { x: 9.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.moodHistory = [60];
  addCat(save.current, cat);
  return cat;
}

const hold = (save: Save, cat: Cat): void => {
  save.current.character.held = { kind: "cat", cat: cat.id };
};

/** Ніч без нових хвороб: шанси нульові для цього rng. */
const quietRng = () => ({ ...createRng(1), chance: () => false });

describe("перебіг хвороби (§9.5)", () => {
  it("«безпечні» дні без шкоди, потім щоночі шкода з джерелом-хворобою", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "cold");
    const health = cat.health;
    save.current.day = 2;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health);
    save.current.day = 3;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health - 2);
    expect(cat.healthLog.at(-1)?.source).toBe("disease:cold");
  });

  it("поки кіт хворіє, настрій щоночі −3", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "fleas");
    const mood = cat.mood;
    nightlyDiseases(save.current, quietRng());
    expect(cat.mood).toBe(mood - 3);
  });
});

describe("ліки вдома (§9.5)", () => {
  it("застуду лікують 4 таблетки; дати ліки — неприємно й любов −1", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "cold");
    hold(save, cat);
    const sanity = save.current.character.stats.sanity;
    const love = cat.love;
    for (let i = 0; i < 3; i++) giveMedicine(save.current, "pills", createRng(i));
    expect(hasDisease(cat, "cold")).toBe(true);
    giveMedicine(save.current, "pills", createRng(9));
    expect(hasDisease(cat, "cold")).toBe(false);
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    expect(cat.love).toBe(love - 4);
    expect(save.current.home.supplies.pills.premium).toBe(16);
  });

  it("таблетки не лікують бліх, а краплі — лікують", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "fleas");
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    expect(hasDisease(cat, "fleas")).toBe(true);
    giveMedicine(save.current, "drops", createRng(1));
    expect(hasDisease(cat, "fleas")).toBe(false);
  });

  it("дешева доза іноді не діє", () => {
    let worked = 0;
    for (let seed = 0; seed < 200; seed++) {
      const save = game();
      save.current.home.supplies.drops = { cheap: 1, premium: 0 };
      const cat = withCat(save);
      fallIll(save.current, cat, "fleas");
      hold(save, cat);
      giveMedicine(save.current, "drops", createRng(seed));
      if (!hasDisease(cat, "fleas")) worked += 1;
    }
    expect(worked / 200).toBeGreaterThan(0.6);
    expect(worked / 200).toBeLessThan(0.8);
  });

  it("старечі болячки — хронічні: таблетка того дня рятує від шкоди", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "senior");
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    const health = cat.health;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health);
    expect(hasDisease(cat, "senior")).toBe(true);
    save.current.day += 1;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health - 1);
  });
});

describe("дієта, спокій і травма (§9.5)", () => {
  it("розлад шлунка минає після 4 порцій дорогого корму", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "stomach");
    for (let i = 0; i < 3; i++) afterMeal(save.current, cat, true, quietRng());
    expect(hasDisease(cat, "stomach")).toBe(true);
    afterMeal(save.current, cat, true, quietRng());
    expect(hasDisease(cat, "stomach")).toBe(false);
  });

  it("цистит від стресу минає після двох спокійних днів", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "cystitis");
    cat.moodHistory = [70];
    nightlyDiseases(save.current, quietRng());
    expect(hasDisease(cat, "cystitis")).toBe(true);
    nightlyDiseases(save.current, quietRng());
    expect(hasDisease(cat, "cystitis")).toBe(false);
  });

  it("цистит не починається, поки новий кіт адаптується", () => {
    const save = game();
    const cat = withCat(save);
    const sure = () => ({ ...createRng(1), chance: () => true });
    cat.moodHistory = [10];
    cat.arrivedDay = save.current.day;
    nightlyDiseases(save.current, sure());
    expect(hasDisease(cat, "cystitis")).toBe(false);
    cat.arrivedDay = -10;
    nightlyDiseases(save.current, sure());
    expect(hasDisease(cat, "cystitis")).toBe(true);
  });

  it("травма — кіт кульгає; глисти — їсть більше", () => {
    const save = game();
    const cat = withCat(save);
    expect(walkFactor(cat)).toBe(1);
    fallIll(save.current, cat, "injury");
    fallIll(save.current, cat, "worms");
    expect(walkFactor(cat)).toBeLessThan(1);
    expect(hungerFactor(cat)).toBeGreaterThan(1);
  });
});

describe("зараження (§9.5)", () => {
  it("застуда передається другу частіше, ніж іншому котові", () => {
    let friend = 0;
    let other = 0;
    for (let seed = 0; seed < 300; seed++) {
      const save = game();
      const sick = withCat(save);
      const buddy = withCat(save);
      const stranger = withCat(save);
      save.current.relations[`${Math.min(sick.id, buddy.id)}-${Math.max(sick.id, buddy.id)}`] = 80;
      fallIll(save.current, sick, "cold");
      nightlyDiseases(save.current, createRng(seed));
      if (hasDisease(buddy, "cold")) friend += 1;
      if (hasDisease(stranger, "cold")) other += 1;
    }
    expect(friend).toBeGreaterThan(other * 2);
  });
});
