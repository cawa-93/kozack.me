// Розмноження й спадковість (§9.8, §9.10, §9.11): вагітність, пологи, новонароджені, «природа й
// виховання», стерилізація, віддати кота, притулок і розплідник.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { breedById, isPurebred, MIXED } from "../src/sim/breeds";
import { addTrait, createCat } from "../src/sim/cat";
import { highPlaceOf, tickCats } from "../src/sim/catai";
import { breederCats, canSterilize, shelterCats } from "../src/sim/destinations";
import { objectById } from "../src/sim/home";
import { tripBlocker } from "../src/sim/trips";
import { advertise, cancelAd, collectAds, giveAway } from "../src/sim/farewell";
import { goToSleep, newGame } from "../src/sim/game";
import { coatOf, inheritGenes } from "../src/sim/genetics";
import { addCat } from "../src/sim/night";
import { conceive, giveBirth } from "../src/sim/reproduction";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, Sex } from "../src/sim/types";
import { recordEvents, withCatCorner } from "./helpers";

function game(): Save {
  return withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 12 }));
}

function withCat(save: Save, sex: Sex, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 21), { source: "shelter", ageWeeks, sex, at: { x: 9.5, y: 8.5 } });
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("генетика (§9.10)", () => {
  it("кіт отримує рудий алель лише від матері, кішка — від обох", () => {
    const save = game();
    const mother = withCat(save, "female");
    const father = withCat(save, "male");
    mother.genes.orange = [true, true];
    father.genes.orange = [false];
    for (let seed = 0; seed < 20; seed++) {
      // Кіт — від матері (зрідка, 1 на 3000, ще й X від батька: кіт-калико).
      expect(inheritGenes(createRng(seed), "male", mother.genes, father.genes).orange).toEqual(expect.arrayContaining([true]));
      expect(inheritGenes(createRng(seed), "male", mother.genes, father.genes).orange[0]).toBe(true);
      expect(inheritGenes(createRng(seed), "female", mother.genes, father.genes).orange).toEqual([true, false]);
    }
  });

  it("риса кошеняти з шансом 50% — від батьків, знак — від догляду", () => {
    let inherited = 0;
    for (let seed = 0; seed < 200; seed++) {
      const kitten = createCat(game().current, createRng(seed), { source: "born", ageWeeks: 0 });
      addTrait(kitten, createRng(seed + 1000), 1, [{ group: "zoomies", level: -2, seen: 0, known: false }]);
      if (kitten.traits[0]?.group === "zoomies") inherited += 1;
    }
    expect(inherited / 200).toBeGreaterThan(0.4);
    expect(inherited / 200).toBeLessThan(0.65);
  });
});

describe("породи й зовнішність: перевірка розмноження 2026-10-28", () => {
  it("абіссинська без білого й не блакитноока; британська — короткошерста, суцільна, з мідними очима; безшерстий не зригує грудок", () => {
    for (let seed = 0; seed < 60; seed++) {
      const save = game();
      const aby = createCat(save.current, createRng(seed), { source: "breeder", ageWeeks: 2, breed: ["abissynska", "abissynska"] });
      expect(coatOf(aby.genes, aby.shape).white).toBe(0);
      expect(coatOf(aby.genes, aby.shape).eyes).not.toBe("blue");
      const brit = createCat(save.current, createRng(seed + 100), { source: "breeder", ageWeeks: 2, breed: ["brytanska-korotkoshersta", "brytanska-korotkoshersta"] });
      const coat = coatOf(brit.genes, brit.shape);
      expect([coat.long, coat.white, coat.eyes]).toEqual([false, 0, "copper"]);
      const sphynx = createCat(save.current, createRng(seed + 200), { source: "breeder", ageWeeks: 10, breed: ["sfinks", "sfinks"] });
      expect(sphynx.traits.some((t) => t.group === "hairballs")).toBe(false);
    }
  });

  it("кіт-калико можливий: зрідка кіт отримує X і від батька", () => {
    const always = { ...createRng(1), chance: () => true };
    const genes = inheritGenes(always, "male", { ...createCat(game().current, createRng(1), { source: "born", ageWeeks: 0, sex: "female" }).genes, orange: [true, false] }, { ...createCat(game().current, createRng(2), { source: "born", ageWeeks: 0, sex: "male" }).genes, orange: [false] });
    expect(genes.orange).toHaveLength(2);
  });
});

describe("вагітність і пологи (§9.8)", () => {
  it("кішка вагітніє з шансом 30% від кота, що їй не ворог; стерилізована — ні", () => {
    let pregnant = 0;
    for (let seed = 0; seed < 300; seed++) {
      const save = game();
      const she = withCat(save, "female");
      withCat(save, "male");
      conceive(save.current, createRng(seed));
      if (she.pregnancy) pregnant += 1;
    }
    expect(pregnant / 300).toBeGreaterThan(0.24);
    expect(pregnant / 300).toBeLessThan(0.36);
    const save = game();
    const she = withCat(save, "female");
    she.sterilized = true;
    withCat(save, "male");
    for (let seed = 0; seed < 50; seed++) conceive(save.current, createRng(seed));
    expect(she.pregnancy).toBeNull();
  });

  it("уночі на понеділок — пологи: кошенята від батьків, новонароджені лежать біля матері", () => {
    const scenario = FILE_SCENARIOS["birth-tomorrow"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const [murka, barsyk] = save.current.cats;
    if (!murka || !barsyk) throw new Error("немає котів");
    const report = goToSleep(save);
    const kittens = save.current.cats.filter((c) => c.source === "born");
    expect(kittens.length).toBeGreaterThanOrEqual(1);
    expect(kittens.length).toBeLessThanOrEqual(3);
    expect(report?.newCats).toEqual(kittens.map((k) => k.id));
    expect(kittens.every((k) => k.parents.mother === murka.id && k.parents.father === barsyk.id && k.ageWeeks === 0)).toBe(true);
    expect(murka.pregnancy).toBeNull();
    expect(murka.litters).toBe(1);
    murka.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
    tickCats(save.current, 5, { present: true });
    const kitten = kittens[0];
    expect(kitten && Math.hypot(kitten.x - murka.x, kitten.y - murka.y)).toBeLessThan(0.5);
    expect(kitten?.needs.hunger).toBe(0);
  });
});

describe("вагітність і пологи: перевірка розмноження 2026-10-28", () => {
  it("відпочинок після пологів — 2 тижні: у ніч на третій понеділок кішка вже може завагітніти", () => {
    const save = game();
    const she = withCat(save, "female");
    withCat(save, "male");
    // Пологи в ніч із дня 6 на день 7: restUntil = 6 + 1 + 14.
    she.restUntil = 21;
    const always = { next: () => 0, chance: () => true, int: (a: number) => a } as unknown as Parameters<typeof conceive>[1];
    save.current.day = 13;
    conceive(save.current, always);
    expect(she.pregnancy).toBeNull();
    save.current.day = 20;
    conceive(save.current, always);
    expect(she.pregnancy).not.toBeNull();
  });

  it("дві матері тієї ж ночі: кожна подія «birth» рахує лише своїх кошенят; порода кошенят — за складністю", () => {
    const save = game();
    save.current.difficulty = "hard";
    const a = withCat(save, "female");
    const b = withCat(save, "female");
    const father = withCat(save, "male");
    a.breedKnown = [true, true];
    father.breedKnown = [true, true];
    for (const mother of [a, b]) mother.pregnancy = { father: father.id, due: save.current.day + 1, known: false };
    const { events, stop } = recordEvents();
    const born = giveBirth(save.current, createRng(3));
    stop();
    const counts = events.filter((e) => e.type === "birth").map((e) => (e.type === "birth" ? e.kittens : 0));
    expect(counts.reduce((x, y) => x + y, 0)).toBe(born.length);
    // Важка складність: породи кошенят не видно, хоч у батьків вона відома.
    expect(born.every((k) => !k.breedKnown[0] && !k.breedKnown[1])).toBe(true);
  });
});

describe("новонароджені: перевірка розмноження 2026-10-28", () => {
  it("мати спить на холодильнику — кошенята лежать біля неї на підлозі; новонароджене не в переноску, а оперують з 2 тижнів", () => {
    const save = game();
    const mother = withCat(save, "female");
    const baby = createCat(save.current, createRng(1), { source: "born", ageWeeks: 0 });
    baby.parents = { mother: mother.id, father: null };
    addCat(save.current, baby);
    const fridge = objectById("fridge");
    if (!fridge) throw new Error("немає холодильника");
    mother.x = fridge.x + 0.5;
    mother.y = fridge.y + 0.5;
    mother.act = { kind: "sleep", target: "high", goal: null, minutes: 300, elapsed: 0 };
    tickCats(save.current, 1, { present: true });
    expect(highPlaceOf(save.current, baby)).toBeNull();
    save.current.character.held = { kind: "cat", cat: baby.id };
    expect(tripBlocker(save.current, "vet")).toBe("newborn");
    expect(canSterilize(baby)).toBe(false);
    expect(canSterilize(mother)).toBe(true);
  });
});

describe("віддати кота (§9.8)", () => {
  it("за 7 днів після появи — весь бонус, пізніше — −15", () => {
    const save = game();
    save.current.character.stats.sanity = 90;
    const fresh = withCat(save, "female");
    fresh.arrivedDay = save.current.day;
    expect(giveAway(save.current, fresh, 0)?.cause).toEqual({ kind: "given" });
    expect(save.current.character.stats.sanity).toBe(40);
    const old = withCat(save, "male");
    old.arrivedDay = -10;
    giveAway(save.current, old, 0);
    expect(save.current.character.stats.sanity).toBe(25);
  });

  it("за оголошенням кота забирають уранці; новонароджених не віддають", () => {
    const save = game();
    const cat = withCat(save, "female");
    expect(advertise(save.current, cat)).toBe(true);
    expect(collectAds(save.current).map((e) => e.id)).toEqual([cat.id]);
    expect(save.current.cats).toHaveLength(0);
    const baby = createCat(save.current, createRng(1), { source: "born", ageWeeks: 0 });
    addCat(save.current, baby);
    expect(advertise(save.current, baby)).toBe(false);
  });

  it("матір новонароджених не віддають; оголошення можна зняти; «тиждень після появи» — від ранку, коли забирають (перевірка розмноження 2026-10-28)", () => {
    const save = game();
    const mother = withCat(save, "female");
    const baby = createCat(save.current, createRng(1), { source: "born", ageWeeks: 0 });
    baby.parents = { mother: mother.id, father: null };
    addCat(save.current, baby);
    expect(advertise(save.current, mother)).toBe(false);
    expect(giveAway(save.current, mother, save.current.day)).toBeNull();

    const other = game();
    other.current.character.stats.sanity = 80;
    const cat = withCat(other, "male");
    cat.arrivedDay = 0;
    other.current.day = 6;
    expect(advertise(other.current, cat)).toBe(true);
    cancelAd(other.current, cat);
    expect(other.current.ads).toEqual([]);
    advertise(other.current, cat);
    // Забирають уранці дня 7: минув тиждень — −15, а не весь бонус.
    collectAds(other.current);
    expect(other.current.character.stats.sanity).toBe(65);
  });
});

describe("притулок і розплідник (§8.5, §9.11)", () => {
  it("у притулку дорослі коти бувають стерилізовані, і про це відомо", () => {
    let sterilized = 0;
    let adults = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = newGame({ sex: "female", difficulty: "normal", seed });
      for (const cat of shelterCats(save.current)) {
        expect(cat.sterilizedKnown).toBe(true);
        if (cat.ageWeeks >= 3) adults += 1;
        if (cat.sterilized) sterilized += 1;
      }
    }
    expect(sterilized / adults).toBeGreaterThan(0.35);
    expect(sterilized / adults).toBeLessThan(0.65);
  });

  it("розплідник тижня — три чистокровні кошенята однієї породи з відомою породою", () => {
    const save = game();
    const { breed, cats } = breederCats(save.current);
    expect(breed).not.toBe(MIXED);
    expect(breedById(breed).name).toBeTruthy();
    expect(cats).toHaveLength(3);
    expect(cats.every((c) => isPurebred(c.breed) && c.ageWeeks === 2 && c.breedKnown[0])).toBe(true);
  });
});
