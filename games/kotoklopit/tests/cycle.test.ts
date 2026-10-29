// Цикл гри (§4.2, §5): статистика, фінал за котами й кар'єрою, збереження файлом, зовнішність.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { removeCat } from "../src/sim/farewell";
import { careerAxis, catsAxis, catsMood } from "../src/sim/finale";
import { advance, deserialize, interact, newGame, serialize } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { hours, standAt } from "./helpers";

describe("статистика (§4.2)", () => {
  it("час рахується за категоріями: робота, метушня", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
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
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    addCat(save.current, createCat(save.current, createRng(1), { source: "foundling", ageWeeks: 1 }));
    expect(save.current.stats.raised.foundling).toBe(1);
  });
});

describe("фінал (§4.2)", () => {
  it("вісь котів — за середнім настроєм усіх котів, і з альбому; без котів — звичайне життя; щасливі від 85%, страждали нижче 70% (Ц2)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    expect(catsAxis(save.current)).toBe("ordinary");
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, cat);
    cat.moodHistory = [90, 80];
    removeCat(save.current, cat, { kind: "old" }, 0);
    expect(catsAxis(save.current)).toBe("happy");
    // Ще кіт, що прожив стільки ж днів, із 70%: середнє 77,5 — звичайне життя; з 50% — 67,5, страждали.
    const second = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, second);
    second.moodHistory = [70, 70];
    expect(catsAxis(save.current)).toBe("ordinary");
    second.moodHistory = [50, 50];
    expect(catsAxis(save.current)).toBe("suffered");
  });

  it("вісь котів — середнє, зважене днями вдома: кіт, що прожив 70 днів із настроєм 90, і кіт, що прожив 3 дні з 40, дають ≈ 88, а не 65 (А11)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const old = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, old);
    old.moodHistory = new Array<number>(70).fill(90);
    removeCat(save.current, old, { kind: "old" }, 69);
    const late = createCat(save.current, createRng(2), { source: "shelter-forced", ageWeeks: 1 });
    addCat(save.current, late);
    late.moodHistory = [40, 40, 40];
    expect(catsMood(save.current)).toBeCloseTo((70 * 90 + 3 * 40) / 73);
    expect(catsMood(save.current)).toBeCloseTo(88, 0);
    // Просте середнє дало б 65 — «страждали»; зважене — «щасливі».
    expect(catsAxis(save.current)).toBe("happy");
    // Так само, коли короткий кіт уже в альбомі, а довгий живий: альбом пам'ятає, скільки днів кіт прожив удома.
    removeCat(save.current, late, { kind: "given" }, 72);
    expect(save.current.album.map((e) => e.days)).toEqual([70, 3]);
    expect(catsMood(save.current)).toBeCloseTo((70 * 90 + 3 * 40) / 73);
  });

  it("вісь котів — якість життя, а не кількість котів; кіт, що не прожив і дня, важить як один день (А11)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    expect(catsMood(save.current)).toBeNull();
    const first = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, first);
    first.moodHistory = [90, 90, 90, 90];
    const one = catsMood(save.current);
    for (let i = 2; i <= 6; i++) {
      const cat = createCat(save.current, createRng(i), { source: "shelter", ageWeeks: 3 });
      addCat(save.current, cat);
      cat.moodHistory = [90, 90, 90, 90];
    }
    expect(catsMood(save.current)).toBeCloseTo(one ?? NaN);
    // Узятий сьогодні: історії ще немає — береться поточний настрій із вагою одного дня.
    const today = createCat(save.current, createRng(9), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, today);
    today.mood = 40;
    expect(catsMood(save.current)).toBeCloseTo((6 * 4 * 90 + 40) / 25);
  });

  it("старе збереження: скільки днів кіт з альбому прожив удома — з дат появи й прощання; відданого забрали вранці (А11)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    for (const [i, cause] of [[1, { kind: "old" }], [2, { kind: "given" }]] as const) {
      const cat = createCat(save.current, createRng(i), { source: "shelter", ageWeeks: 3 });
      addCat(save.current, cat);
      cat.arrivedDay = 3;
      cat.moodHistory = [80];
      removeCat(save.current, cat, cause, 12);
    }
    const json = JSON.parse(serialize(save)) as { current: { album: Record<string, unknown>[] } };
    for (const entry of json.current.album) delete entry["days"];
    const loaded = deserialize(JSON.stringify(json));
    // Підсумок дня пишеться щоночі до прощання: дні 3–12 — 10 днів; відданого забрали вранці 12-го — 9.
    expect(loaded.current.album.map((e) => e.days)).toEqual([10, 9]);
  });

  it("кар'єра: 1–5 — низька, 6–9 — середня, лише директор — висока; безробітний — низька (Ц1)", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const at = (position: number): string => {
      save.current.job.position = position - 1;
      return careerAxis(save.current);
    };
    expect([1, 5, 6, 9, 10].map(at)).toEqual(["low", "low", "middle", "middle", "high"]);
    save.current.job.unemployed = true;
    expect(careerAxis(save.current)).toBe("low");
  });
});

describe("збереження й персонаж (§4.2, §5.1)", () => {
  it("збереження файлом відновлює ту саму гру, разом з ім'ям і зовнішністю", () => {
    const look = { face: 2, skin: 3, hair: 3, hairColor: 4, eyes: 2, build: 0, top: 4, bottom: 1, shoes: 2 };
    const save = newGame({ address: "he", difficulty: "hard", seed: 9, name: "  Остап ", look });
    advance(save, 30);
    const copy = deserialize(serialize(save));
    expect(copy).toEqual(save);
    expect(copy.current.character.name).toBe("Остап");
    expect(copy.current.character.look).toEqual(look);
  });

  it("стара версія збереження не завантажується", () => {
    const save = newGame({ address: "he", difficulty: "hard", seed: 9 });
    expect(() => deserialize(serialize({ ...save, version: 1 }))).toThrow();
  });
});
