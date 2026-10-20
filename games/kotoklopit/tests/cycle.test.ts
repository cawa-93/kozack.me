// Цикл гри (§4.2, §5): статистика, фінал за котами й кар'єрою, збереження файлом, зовнішність.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { removeCat } from "../src/sim/farewell";
import { careerAxis, catsAxis } from "../src/sim/finale";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { hours, standAt } from "./helpers";

describe("статистика (§4.2)", () => {
  it("час рахується за категоріями: робота, метушня", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    save.current.minute = hours(9);
    standAt(save, "computer");
    interact(save);
    advance(save, 60);
    expect(save.current.stats.minutes.work).toBeCloseTo(60);
    interact(save);
    advance(save, 5, { move: { x: 1, y: 0 }, hold: false });
    expect(save.current.stats.minutes.bustle).toBeCloseTo(5);
  });

  it("виховані коти рахуються за тим, звідки вони", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    addCat(save.current, createCat(save.current, createRng(1), { source: "foundling", ageWeeks: 1 }));
    expect(save.current.stats.raised.foundling).toBe(1);
  });
});

describe("фінал (§4.2)", () => {
  it("вісь котів — за середнім настроєм усіх котів, і з альбому; без котів — звичайне життя", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    expect(catsAxis(save.current)).toBe("ordinary");
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, cat);
    cat.moodHistory = [90, 80];
    removeCat(save.current, cat, { kind: "old" }, 0);
    expect(catsAxis(save.current)).toBe("happy");
  });

  it("безробітний на пенсії — низька кар'єра", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    save.current.job.position = 8;
    expect(careerAxis(save.current)).toBe("high");
    save.current.job.unemployed = true;
    expect(careerAxis(save.current)).toBe("low");
  });
});

describe("збереження й персонаж (§4.2, §5.1)", () => {
  it("збереження файлом відновлює ту саму гру, разом з ім'ям і зовнішністю", () => {
    const look = { face: 2, skin: 3, hair: 3, hairColor: 4, eyes: 2, build: 0, top: 4, bottom: 1, shoes: 2 };
    const save = newGame({ sex: "male", difficulty: "hard", seed: 9, name: "  Остап ", look });
    advance(save, 30);
    const copy = deserialize(serialize(save));
    expect(copy).toEqual(save);
    expect(copy.current.character.name).toBe("Остап");
    expect(copy.current.character.look).toEqual(look);
  });

  it("стара версія збереження не завантажується", () => {
    const save = newGame({ sex: "male", difficulty: "hard", seed: 9 });
    expect(() => deserialize(serialize({ ...save, version: 1 }))).toThrow();
  });
});
