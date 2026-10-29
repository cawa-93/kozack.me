// Хвороби котів (§9.5): перебіг, шкода після «безпечного» терміну, ліки вдома, дієта, спокій,
// контроль хронічної, зараження й симптоми.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { climbWeight, decide, eatMinutes, tickCats } from "../src/sim/catai";
import { bathe, nightlyCare } from "../src/sim/care";
import { BATH, BREED_RISK, CAT_AGE_LIMIT, DISEASES, ILLNESS, KITTEN_MAX_AGE, LOW_HEALTH, MEDICINE, RELATIONS, SYMPTOMS, WEIGHT } from "../src/sim/config";
import { afterMeal, agingDiseases, fallIll, fatigueFactor, giveMedicine, hasDisease, hungerFactor, illnessChance, nightlyDiseases, walkFactor } from "../src/sim/diseases";
import { MIXED } from "../src/sim/breeds";
import { newGame } from "../src/sim/game";
import { addCat, runNight } from "../src/sim/night";
import { changeRelation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { GameEvent } from "../src/sim/events";
import type { BowlItem, Cat, DiseaseId, LitterItem, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

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

/** Минуло 6 годин — наступна доза ліків подіє (рішення автора 2026-10-27, Х3). Лише годинник: інше не рухається. */
const nextDose = (save: Save): void => {
  save.current.minute += MEDICINE.doseMinutes;
};

/** Ніч без нових хвороб: шанси нульові для цього rng. */
const quietRng = () => ({ ...createRng(1), chance: () => false });

describe("ще п'ять хвороб (рішення автора 2026-10-28, Д1)", () => {
  /** Тижневі шанси, які кинула ніч, коли кіт постаршав. */
  function agingChances(save: Save, cat: Cat): number[] {
    const chances: number[] = [];
    agingDiseases(save.current, cat, { ...createRng(1), chance: (p: number) => (chances.push(p), false) });
    return chances;
  }

  it("кошеня не хворіє ними; дорослому — серце й гінгівіт, старому ще суглоби; хребет і дихання — лише від породи", () => {
    const save = game();
    const cat = withCat(save);
    cat.breed = [MIXED, MIXED];
    cat.ageWeeks = KITTEN_MAX_AGE;
    expect(agingChances(save, cat)).toHaveLength(0);
    cat.ageWeeks = KITTEN_MAX_AGE + 1;
    const adult = agingChances(save, cat);
    expect(adult).toHaveLength(2);
    cat.ageWeeks = CAT_AGE_LIMIT + 1;
    // Серце, суглоби, гінгівіт; «старечих болячок» немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А13).
    expect(agingChances(save, cat)).toHaveLength(3);
    cat.ageWeeks = KITTEN_MAX_AGE + 1;
    cat.breed = ["menks", "menks"];
    expect(agingChances(save, cat)).toHaveLength(3); // + хребет
    cat.breed = ["perska", MIXED];
    expect(agingChances(save, cat)).toHaveLength(3); // + дихання
  });

  it("схильність породи множить шанс: мейнкун частіше хворіє серцем", () => {
    const save = game();
    const cat = withCat(save);
    cat.ageWeeks = KITTEN_MAX_AGE + 1;
    cat.breed = ["shartrez", "shartrez"];
    const plain = agingChances(save, cat)[0] ?? 0;
    cat.breed = ["meinkun", "meinkun"];
    expect((agingChances(save, cat)[0] ?? 0) / plain).toBeCloseTo(1 + 2 * BREED_RISK.step);
  });

  it("симптоми: серце — втомлюється, суглоби — не лізе нагору й повільніший, хребет — повільніший, гінгівіт — їсть довше", () => {
    const save = game();
    const cat = withCat(save);
    const eat = eatMinutes(cat);
    fallIll(save.current, cat, "heart");
    expect(fatigueFactor(cat)).toBe(SYMPTOMS.tired);
    fallIll(save.current, cat, "joints");
    expect(climbWeight(cat)).toBe(0);
    expect(walkFactor(cat)).toBeCloseTo(SYMPTOMS.jointsWalk);
    fallIll(save.current, cat, "spine");
    expect(walkFactor(cat)).toBeCloseTo(SYMPTOMS.jointsWalk * SYMPTOMS.spineWalk);
    fallIll(save.current, cat, "gingivitis");
    expect(eatMinutes(cat)).toBeCloseTo(eat * SYMPTOMS.gingivitisEat);
  });

  it("дихання в спеку шкодить удвічі; таблетка того дня рятує", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "breathing");
    const ill = cat.diseases[0];
    if (ill) ill.day = save.current.day - DISEASES.breathing.safe;
    save.current.modifiers.day = null;
    save.current.modifiers.week = null;
    let health = cat.health;
    nightlyDiseases(save.current, quietRng());
    expect(health - cat.health).toBe(DISEASES.breathing.damage);
    save.current.modifiers.day = "heat";
    health = cat.health;
    nightlyDiseases(save.current, quietRng());
    expect(health - cat.health).toBe(DISEASES.breathing.damage * ILLNESS.breathingHeat);
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    health = cat.health;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health);
  });

  it("із зайвою вагою хворіють суглоби", () => {
    const save = game();
    const cat = withCat(save);
    cat.weight = WEIGHT.obese;
    fallIll(save.current, cat, "obesity");
    nightlyDiseases(save.current, { ...createRng(1), chance: () => true });
    expect(hasDisease(cat, "joints")).toBe(true);
  });
});

describe("тригери хвороб (рішення автора 2026-10-28, Д2)", () => {
  /** Шанси, які ніч кидала для кота: перший — застуда. */
  function nightChances(save: Save): number[] {
    const chances: number[] = [];
    nightlyDiseases(save.current, { ...createRng(1), chance: (p: number) => (chances.push(p), false) });
    return chances;
  }

  it("у «Холод» і «Похолодання» застуда котів частіша ×1,5", () => {
    const save = game();
    withCat(save);
    save.current.modifiers.day = null;
    save.current.modifiers.week = null;
    const warm = nightChances(save)[0] ?? 0;
    save.current.modifiers.day = "cold";
    expect((nightChances(save)[0] ?? 0) / warm).toBeCloseTo(ILLNESS.coldWeather);
    save.current.modifiers.day = null;
    save.current.modifiers.week = "cold-snap";
    expect((nightChances(save)[0] ?? 0) / warm).toBeCloseTo(ILLNESS.coldWeather);
  });

  it("блохи кілька днів — глисти (з 3-го дня) і дерматит (з 5-го)", () => {
    const sure = () => ({ ...createRng(1), chance: () => true });
    const withFleas = (days: number): Cat => {
      const save = game();
      const cat = withCat(save);
      fallIll(save.current, cat, "fleas");
      const fleas = cat.diseases[0];
      if (fleas) fleas.day = save.current.day - days;
      nightlyDiseases(save.current, sure());
      return cat;
    };
    expect(hasDisease(withFleas(ILLNESS.fleasWormsDays - 1), "worms")).toBe(false);
    expect(hasDisease(withFleas(ILLNESS.fleasWormsDays), "worms")).toBe(true);
    expect(hasDisease(withFleas(ILLNESS.fleasDermatitisDays - 1), "dermatitis")).toBe(false);
    expect(hasDisease(withFleas(ILLNESS.fleasDermatitisDays), "dermatitis")).toBe(true);
  });
});

describe("зараження лише між друзями (§9.5, рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А13)", () => {
  it("друзям — застуда, кон'юнктивіт і блохи, іншим котам — нічого, хоч скільки їх удома; глисти — через лоток", () => {
    const friendly = (Object.keys(DISEASES) as DiseaseId[]).filter((id) => DISEASES[id].contagious === "friends");
    expect(friendly.sort()).toEqual(["cold", "conjunctivitis", "fleas"]);
    expect((Object.keys(DISEASES) as DiseaseId[]).filter((id) => DISEASES[id].contagious === "litter")).toEqual(["worms"]);
    const save = game();
    const s = save.current;
    const [sick, friend, ...others] = Array.from({ length: 6 }, () => withCat(save));
    // Блохи самі вночі не з'являються — нових бліх дає лише зараження.
    fallIll(s, sick!, "fleas");
    // Усі нейтральні, лише одна пара — друзі.
    s.relations = {};
    changeRelation(s, sick!, friend!, RELATIONS.friend);
    const always = { ...createRng(1), chance: () => true };
    nightlyDiseases(s, always);
    expect(hasDisease(friend!, "fleas")).toBe(true);
    // Хворий друг заражає далі лише своїх друзів: решта нейтральні до обох.
    expect(others.filter((c) => hasDisease(c, "fleas")).map((c) => c.name)).toEqual([]);
  });
});

describe("зараження через лоток (перевірка розмноження 2026-10-28)", () => {
  it("новонароджені в лоток не ходять: їх не рахують у нестачу лотків і через лоток вони не заражаються", () => {
    const save = game();
    const mother = withCat(save);
    fallIll(save.current, mother, "worms");
    const kittens = [withCat(save), withCat(save)];
    for (const kitten of kittens) {
      kitten.source = "born";
      kitten.ageWeeks = 0;
    }
    // Лоток один, але вдома лише одна доросла кішка — лотків досить, а новонароджених не заражає й нестача.
    const always = { ...createRng(1), chance: () => true };
    nightlyDiseases(save.current, always);
    expect(kittens.every((k) => !hasDisease(k, "worms"))).toBe(true);
  });

  it("лотків бракує — як для сварок (Р3, Р4): від 7 котів шести чистих лотків досить, а брудний лоток — нестача (загальна ревізія 2026-10-29)", () => {
    const save = game();
    const s = save.current;
    const cats = Array.from({ length: 7 }, () => withCat(save));
    fallIll(s, cats[0]!, "worms");
    s.home.items = s.home.items.filter((it) => it.kind !== "litter");
    const boxes = Array.from({ length: 6 }, (_, i): LitterItem => ({ id: 900 + i, kind: "litter", quality: "cheap", slot: `litter-${i + 1}`, litter: "cheap", uses: 0 }));
    s.home.items.push(...boxes);
    const always = { ...createRng(1), chance: () => true };
    // Усі шість місць зайняті чистими лотками — більше купити не можна, і через лоток ніхто не заражається.
    nightlyDiseases(s, always);
    expect(cats.slice(1).some((c) => hasDisease(c, "worms"))).toBe(false);
    // Один лоток брудний — лотків бракує, і глисти йдуть далі.
    boxes[0]!.uses = 99;
    nightlyDiseases(s, always);
    expect(cats.slice(1).every((c) => hasDisease(c, "worms"))).toBe(true);
  });
});

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

  it("гострі минають самі, остання ніч ще шкодить; блохи без лікування — ні (рішення автора 2026-10-27, Х1)", () => {
    const save = game();
    const cold = withCat(save);
    const fleas = withCat(save);
    fallIll(save.current, cold, "cold");
    fallIll(save.current, fleas, "fleas");
    const start = save.current.day;
    const days = DISEASES.cold.recovers ?? 0;
    for (let night = 0; night < days - 1; night++) {
      save.current.day = start + night;
      nightlyDiseases(save.current, quietRng());
    }
    expect(hasDisease(cold, "cold")).toBe(true);
    const health = cold.health;
    save.current.day = start + days - 1;
    nightlyDiseases(save.current, quietRng());
    expect(hasDisease(cold, "cold")).toBe(false);
    expect(cold.health).toBe(health - DISEASES.cold.damage);
    for (let night = days; night < 40; night++) {
      save.current.day = start + night;
      nightlyDiseases(save.current, quietRng());
    }
    expect(hasDisease(fleas, "fleas")).toBe(true);
  });

  it("кон'юнктивіт після застуди — один кидок, коли вона минає (рішення автора 2026-10-27, Х2)", () => {
    // Кидки з шансом понад 10% вдаються, менші — ні: лишається лише «після застуди» (30%, з «Витривалістю» безпородного — 27%).
    const afterColdRng = () => ({ ...createRng(1), chance: (p: number) => p > ILLNESS.afterCold / 3 });
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "cold");
    const start = save.current.day;
    const days = DISEASES.cold.recovers ?? 0;
    for (let night = 0; night < days - 1; night++) {
      save.current.day = start + night;
      nightlyDiseases(save.current, afterColdRng());
    }
    expect(hasDisease(cat, "conjunctivitis")).toBe(false);
    save.current.day = start + days - 1;
    nightlyDiseases(save.current, afterColdRng());
    expect(hasDisease(cat, "cold")).toBe(false);
    expect(hasDisease(cat, "conjunctivitis")).toBe(true);
    // Вилікували таблетками — так само.
    const other = withCat(save);
    fallIll(save.current, other, "cold");
    hold(save, other);
    for (let i = 0; i < 4; i++) {
      giveMedicine(save.current, "pills", afterColdRng());
      nextDose(save);
    }
    expect(hasDisease(other, "cold")).toBe(false);
    expect(hasDisease(other, "conjunctivitis")).toBe(true);
  });

  it("поки хвороба шкодить, гарний настрій здоров'я не відновлює; у «безпечні» дні й під контролем — відновлює (рішення автора 2026-10-27, Х5)", () => {
    const gain = (setup: (save: Save, cat: Cat) => void): number => {
      const save = game();
      const cat = withCat(save);
      save.current.day = 10;
      cat.health = 50;
      // Гарний настрій і вдень, і вночі.
      cat.mood = 100;
      cat.moodToday = { sum: 100 * 600, minutes: 600 };
      setup(save, cat);
      runNight(save.current, false);
      return cat.health - 50;
    };
    const healthy = gain(() => {});
    expect(healthy).toBeGreaterThan(0);
    // Застуда третій день — уже шкодить: −2 і без відновлення.
    expect(gain((save, cat) => fallIll(save.current, cat, "cold") && void (cat.diseases[0]!.day = save.current.day - 3))).toBe(-DISEASES.cold.damage);
    // Ще «безпечний» день — відновлення, як у здорового.
    expect(gain((save, cat) => fallIll(save.current, cat, "cold") && void (cat.diseases[0]!.day = save.current.day - 1))).toBe(healthy);
    // Хронічна (суглоби) після «безпечних» днів, але під контролем — не шкодить, відновлення є (старий — ×0,5, тут кіт молодий).
    const controlled = (save: Save, cat: Cat): void => {
      fallIll(save.current, cat, "joints");
      Object.assign(cat.diseases[0]!, { day: save.current.day - DISEASES.joints.safe, controlled: save.current.day });
    };
    expect(gain(controlled)).toBe(healthy);
  });

  it("поки кіт хворіє, настрій щоночі −3", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "fleas");
    const mood = cat.mood;
    nightlyDiseases(save.current, quietRng());
    expect(cat.mood).toBe(mood - 3);
  });

  it("хронічна під контролем настрою не псує (рішення автора 2026-10-27, Х9)", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "joints");
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    const mood = cat.mood;
    nightlyDiseases(save.current, quietRng());
    expect(cat.mood).toBe(mood);
    save.current.day += 1;
    nightlyDiseases(save.current, quietRng());
    expect(cat.mood).toBeLessThan(mood);
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
    for (let i = 0; i < 3; i++) {
      giveMedicine(save.current, "pills", createRng(i));
      nextDose(save);
    }
    expect(hasDisease(cat, "cold")).toBe(true);
    giveMedicine(save.current, "pills", createRng(9));
    expect(hasDisease(cat, "cold")).toBe(false);
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    expect(cat.love).toBe(love - 4);
    expect(save.current.home.supplies.pills.premium).toBe(16);
  });

  it("та сама доза раніше ніж за 6 годин — кіт випльовує: ліки витрачено, неприємно, але не діє (рішення автора 2026-10-27, Х3)", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "conjunctivitis");
    hold(save, cat);
    giveMedicine(save.current, "drops", createRng(1));
    const sanity = save.current.character.stats.sanity;
    const love = cat.love;
    save.current.minute += MEDICINE.doseMinutes - 1;
    const log = recordEvents();
    expect(giveMedicine(save.current, "drops", createRng(1))).toBe(true);
    log.stop();
    expect(log.events).toContainEqual({ type: "medicine-spat", cat: cat.id, medicine: "drops" });
    expect(save.current.home.supplies.drops.premium).toBe(8);
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    expect(cat.love).toBe(love - 1);
    expect(hasDisease(cat, "conjunctivitis")).toBe(true);
    // Таблетки — інший вид ліків: їх можна одразу.
    const pills = recordEvents();
    giveMedicine(save.current, "pills", createRng(1));
    pills.stop();
    expect(pills.events.some((e) => e.type === "medicine-spat")).toBe(false);
    // Минуло 6 годин від першої дози — друга крапля діє, кон'юнктивіт минає.
    save.current.minute += 1;
    giveMedicine(save.current, "drops", createRng(1));
    expect(hasDisease(cat, "conjunctivitis")).toBe(false);
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

  it("дешева таблетка бере хронічну під контроль лише з шансом 70%", () => {
    let worked = 0;
    for (let seed = 0; seed < 200; seed++) {
      const save = game();
      save.current.home.supplies.pills = { cheap: 1, premium: 0 };
      const cat = withCat(save);
      fallIll(save.current, cat, "joints");
      hold(save, cat);
      giveMedicine(save.current, "pills", createRng(seed));
      if (cat.diseases[0]?.controlled === save.current.day) worked += 1;
    }
    expect(worked / 200).toBeGreaterThan(MEDICINE.cheapWorks - 0.1);
    expect(worked / 200).toBeLessThan(MEDICINE.cheapWorks + 0.1);
  });

  it("хронічна (суглоби): таблетка того дня рятує від шкоди", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "joints");
    cat.diseases[0]!.day = save.current.day - DISEASES.joints.safe;
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    const health = cat.health;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health);
    expect(hasDisease(cat, "joints")).toBe(true);
    save.current.day += 1;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health - DISEASES.joints.damage);
  });

  it("таблетка вдома не скорочує тиждень контролю від ветеринара", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "joints");
    const joints = cat.diseases[0];
    if (!joints) throw new Error("немає хвороби");
    joints.controlled = save.current.day + 7;
    hold(save, cat);
    giveMedicine(save.current, "pills", createRng(1));
    expect(joints.controlled).toBe(save.current.day + 7);
    const health = cat.health;
    save.current.day += 3;
    nightlyDiseases(save.current, quietRng());
    expect(cat.health).toBe(health);
  });
});

describe("схильності порід (§9.5, рішення автора 2026-10-27, Х10)", () => {
  it("«очі» — кон'юнктивіт, «шкіра» — дерматит: чистокровному ×2, напівкровці ×1,5; інші хвороби — як у всіх", () => {
    const save = game();
    const cat = withCat(save);
    const chance = (breed: [string, string], id: DiseaseId): number => {
      cat.breed = breed;
      return illnessChance(save.current, cat, id, 0.1);
    };
    // Бірманська — без схильностей і без «Витривалості» породи.
    const plain = chance(["birmanska", "birmanska"], "conjunctivitis");
    expect(chance(["perska", "perska"], "conjunctivitis") / plain).toBeCloseTo(2);
    expect(chance(["perska", "birmanska"], "conjunctivitis") / plain).toBeCloseTo(1.5);
    expect(chance(["sfinks", "sfinks"], "dermatitis") / chance(["birmanska", "birmanska"], "dermatitis")).toBeCloseTo(2);
    expect(chance(["perska", "perska"], "cold")).toBeCloseTo(chance(["birmanska", "birmanska"], "cold"));
  });
});

describe("дерматит безшерстих (§8.7)", () => {
  it("без купання тиждень — дерматит, і «Витривалість» його рідшає; дорогий шампунь лікує", () => {
    const sick = (hardiness: TraitLevel | 0, seed: number): Cat => {
      const save = game();
      const cat = withCat(save);
      cat.shape.coat = "hairless";
      if (hardiness !== 0) cat.traits = [{ group: "hardiness", level: hardiness, seen: 0, known: false }];
      cat.bathedDay = save.current.day - BATH.hairlessDays;
      nightlyCare(save.current, createRng(seed));
      return cat;
    };
    const count = (hardiness: TraitLevel | 0): number => Array.from({ length: 400 }, (_, seed) => sick(hardiness, seed)).filter((c) => hasDisease(c, "dermatitis")).length;
    // Шанс 30% за ніч; «Витривалість» +2 — ×0,8 (§9.5).
    expect(count(0) / 400).toBeCloseTo(BATH.dermatitis, 1);
    expect(count(2)).toBeLessThan(count(0) * 0.9);
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "dermatitis");
    save.current.home.supplies.shampoo = { cheap: 0, premium: 1 };
    hold(save, cat);
    const log = recordEvents();
    bathe(save.current, createRng(1));
    log.stop();
    expect(hasDisease(cat, "dermatitis")).toBe(false);
    expect(log.events).toContainEqual({ type: "cat-cured", cat: cat.id, disease: "dermatitis" });
  });
});

describe("симптоми (§9.5)", () => {
  it("свербіж видно, поки кіт не спить; уві сні — ні", () => {
    const itches = (sleeping: boolean): number => {
      const save = game();
      const cat = withCat(save);
      fallIll(save.current, cat, "fleas");
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: sleeping ? 100 : 0, attention: 0, play: 0 };
      cat.act = sleeping ? { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0 } : idleAct(600);
      const log = recordEvents();
      for (let i = 0; i < 180; i++) tickCats(save.current, 1, { present: true });
      log.stop();
      return log.events.filter((e) => e.type === "symptom").length;
    };
    expect(itches(true)).toBe(0);
    expect(itches(false)).toBeGreaterThan(0);
  });
});

describe("низьке здоров'я видно з поведінки (§9.5, рішення автора 2026-10-27, Х4)", () => {
  it("нижче 50 — гра ×0,7, нижче 25 — ×0,3", () => {
    const playGain = (health: number): number => {
      const save = game();
      const cat = withCat(save);
      cat.health = health;
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      cat.act = idleAct(600);
      tickCats(save.current, 60, { present: true });
      return cat.needs.play;
    };
    const full = playGain(100);
    expect(full).toBeGreaterThan(0);
    expect(playGain(LOW_HEALTH.low - 1) / full).toBeCloseTo(LOW_HEALTH.lowPlay, 2);
    expect(playGain(LOW_HEALTH.weak - 1) / full).toBeCloseTo(LOW_HEALTH.weakPlay, 2);
  });

  it("нижче 25 — коли нічого не треба, сидить у схованці; з миски — пів порції без прояву «Апетиту»", () => {
    const save = withCatCorner(game());
    const cat = withCat(save);
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 80, play: 90 };
    cat.health = LOW_HEALTH.weak;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).not.toBe("hide");
    cat.health = LOW_HEALTH.weak - 1;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).toBe("hide");
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
    if (!bowl) throw new Error("немає миски");
    bowl.food = 2;
    bowl.foodQuality = "cheap";
    cat.traits = [{ group: "appetite", level: -1, seen: 0, known: false }];
    cat.needs.hunger = 90;
    cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0 };
    for (let i = 0; i < 40 && cat.act.kind === "eat"; i++) tickCats(save.current, 0.5, { present: true });
    expect(bowl.half).toBe(true);
    expect(bowl.food).toBe(2);
    expect(cat.traits[0]?.seen).toBe(0);
  });
});

describe("помітніші симптоми (§9.5, рішення автора 2026-10-27, Х6)", () => {
  it("з травмою нагору не лізе, як і з ожирінням", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits = [{ group: "climbing", level: 2, seen: 0, known: false }];
    expect(climbWeight(cat)).toBeGreaterThan(0);
    fallIll(save.current, cat, "injury");
    expect(climbWeight(cat)).toBe(0);
  });

  it("дерматит свербить, як блохи", () => {
    const save = game();
    const cat = withCat(save);
    fallIll(save.current, cat, "dermatitis");
    cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
    cat.act = idleAct(600);
    const log = recordEvents();
    for (let i = 0; i < 180; i++) tickCats(save.current, 1, { present: true });
    log.stop();
    expect(log.events.filter((e) => e.type === "symptom" && e.symptom === "itch").length).toBeGreaterThan(0);
  });

  it("сечокам'яна — кричить у лотку щоразу, як сходив", () => {
    const save = withCatCorner(game());
    const cat = withCat(save);
    const box = save.current.home.items.find((i) => i.kind === "litter");
    if (!box) throw new Error("немає лотка");
    const visit = (): GameEvent[] => {
      cat.needs.toilet = 90;
      cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.05, elapsed: 0 };
      const log = recordEvents();
      tickCats(save.current, 0.1, { present: true });
      log.stop();
      return log.events.filter((e) => e.type === "symptom");
    };
    expect(visit()).toEqual([]);
    fallIll(save.current, cat, "urolithiasis");
    expect(visit()).toEqual([{ type: "symptom", cat: cat.id, symptom: "pain" }]);
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

  it("«старечих болячок» немає: старий кіт від старості не повільніший і не втомлюється вдруге, а хворіє лише серцем, суглобами й гінгівітом (рішення автора 2026-10-29, А13)", () => {
    const save = game();
    const cat = withCat(save);
    cat.ageWeeks = CAT_AGE_LIMIT + 1;
    expect(walkFactor(cat)).toBe(1);
    expect(fatigueFactor(cat)).toBe(1);
    agingDiseases(save.current, cat, { ...createRng(1), chance: () => true });
    expect(cat.diseases.map((d) => d.id).sort()).toEqual(["gingivitis", "heart", "joints"]);
    expect(Object.keys(DISEASES)).not.toContain("senior");
  });

  /** Кіт «Малоїжка» (чи «Ненаситний») їсть з миски на очах персонажа: скільки лишилося й чи відкрилася риса. */
  function meal(disease: DiseaseId | null, opts: { appetite: TraitLevel; quality?: "cheap" | "premium"; half?: boolean; nibble?: boolean; diet?: number; seed?: number }): { cat: Cat; bowl: BowlItem } {
    const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: opts.seed ?? 9 }));
    const cat = withCat(save);
    if (disease) fallIll(save.current, cat, disease);
    const ill = cat.diseases[0];
    if (ill && opts.diet !== undefined) ill.diet = opts.diet;
    save.current.character.body.x = 9.5;
    save.current.character.body.y = 9.5;
    const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
    if (!bowl) throw new Error("немає миски");
    bowl.food = 2;
    bowl.foodQuality = opts.quality ?? "cheap";
    if (opts.half) bowl.half = true;
    cat.traits = [{ group: "appetite", level: opts.appetite, seen: 0, known: false }];
    cat.needs = { hunger: 90, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
    cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: eatMinutes(cat), elapsed: 0, ...(opts.nibble ? { nibble: true } : {}) };
    for (let i = 0; i < 80 && cat.act.kind === "eat"; i++) tickCats(save.current, 0.5, { present: true });
    return { cat, bowl };
  }

  it("застуда й розлад шлунка — з миски пів порції без прояву «Апетиту», навіть коли дієта щойно вилікувала шлунок", () => {
    // Контроль: «Малоїжка» поклювала на очах персонажа — риса відкривається.
    expect(meal(null, { appetite: -1, nibble: true }).cat.traits[0]?.seen).toBeGreaterThan(0);
    const cold = meal("cold", { appetite: -1 });
    expect(cold.bowl.half).toBe(true);
    expect(cold.cat.traits[0]?.seen).toBe(0);
    // Остання порція дієти лікує шлунок наприкінці трапези — а клював кіт однаково через хворобу.
    const diet = DISEASES.stomach.cure.kind === "diet" ? DISEASES.stomach.cure.portions : 0;
    const sick = meal("stomach", { appetite: -1, quality: "premium", diet: diet - 1 });
    expect(hasDisease(sick.cat, "stomach")).toBe(false);
    expect(sick.bowl.half).toBe(true);
    expect(sick.cat.traits[0]?.seen).toBe(0);
  });

  it("хворий «Ненаситний» не їсть другої порції", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { bowl } = meal("cold", { appetite: 2, half: true, seed });
      expect(bowl.food).toBe(1);
    }
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
