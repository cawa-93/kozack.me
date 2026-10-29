import { describe, expect, it } from "vitest";

import { actionSpeed, canDash, dash, glitchChance } from "../src/sim/body";
import { targetOf } from "../src/sim/targets";
import { createCat } from "../src/sim/cat";
import { BODY_RADIUS, FIRST_WEEK_PROTECTION } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { fallIllPerson } from "../src/sim/illness";
import { OBJECTS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Save, Vec } from "../src/sim/types";
import { hours, recordEvents, walkTo } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 1 });

const place = (save: Save, x: number, y: number, facing: Vec = { x: 0, y: 1 }): void => {
  Object.assign(save.current.character.body, { x, y, facing });
};

const walk = (save: Save, move: Vec, minutes: number): void => {
  advance(save, minutes, { move, hold: false });
};

describe("рух (§8.4)", () => {
  it("ходьба — 3 клітинки за ігрову хвилину", () => {
    const save = game();
    place(save, 4.5, 8.5);
    walk(save, { x: 1, y: 0 }, 1);
    expect(save.current.character.body.x).toBeCloseTo(7.5);
    expect(save.current.character.body.facing).toEqual({ x: 1, y: 0 });
  });

  it("стіни й речі не пропускають, а вздовж стіни персонаж ковзає", () => {
    const save = game();
    // Не під підвіконням спальні (4, 1): воно теж річ (§9.12, «Вікно»).
    place(save, 3.5, 2.5);
    walk(save, { x: 0, y: -1 }, 3);
    expect(save.current.character.body.y).toBeCloseTo(1 + BODY_RADIUS, 4);
    walk(save, { x: -1, y: 0 }, 3);
    // Ліжко займає клітинку x 1: персонаж зупиняється біля нього.
    expect(save.current.character.body.x).toBeCloseTo(2 + BODY_RADIUS, 4);
    // Наискіс уздовж ліжка: уліво не пускає ліжко, а вниз персонаж ковзає.
    walk(save, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, 0.5);
    expect(save.current.character.body.x).toBeCloseTo(2 + BODY_RADIUS, 4);
    expect(save.current.character.body.y).toBeCloseTo(1 + BODY_RADIUS + 3 * Math.SQRT1_2 * 0.5);
  });

  it("ривок утричі швидший, потім перезаряджається", () => {
    const save = game();
    place(save, 2.5, 8.5);
    const { events, stop } = recordEvents();
    expect(dash(save.current)).toBe(true);
    walk(save, { x: 1, y: 0 }, 0.25);
    expect(save.current.character.body.x).toBeCloseTo(2.5 + 3 * 3 * 0.25);
    expect(dash(save.current)).toBe(false);
    walk(save, { x: 0, y: 0 }, 1.25);
    expect(canDash(save.current)).toBe(true);
    stop();
    expect(events.filter((e) => e.type === "dash")).toHaveLength(1);
  });

  it("ривок несе вперед і без керування", () => {
    const save = game();
    place(save, 2.5, 8.5, { x: 1, y: 0 });
    dash(save.current);
    walk(save, { x: 0, y: 0 }, 0.25);
    expect(save.current.character.body.x).toBeCloseTo(2.5 + 9 * 0.25);
  });

  it("ривок — «біганина»: ситість −0,25, у чоловічого персонажа ×1,1 (§6.3)", () => {
    for (const [sex, cost] of [["female", 0.25], ["male", 0.275]] as const) {
      const save = newGame({ sex, difficulty: "normal", seed: 1 });
      const stats = save.current.character.stats;
      const before = stats.satiety;
      expect(dash(save.current)).toBe(true);
      expect(stats.satiety).toBeCloseTo(before - cost);
      // Ривок на перезарядці не вдається й ситості не забирає.
      expect(dash(save.current)).toBe(false);
      expect(stats.satiety).toBeCloseTo(before - cost);
    }
  });

  it("з низьким здоров'ям ривка немає, а низькі здоров'я й ситість уповільнюють (§6.3)", () => {
    const save = game();
    const stats = save.current.character.stats;
    stats.health = 24;
    expect(canDash(save.current)).toBe(false);
    expect(actionSpeed(save.current)).toBeCloseTo(0.8);
    stats.satiety = 10;
    expect(actionSpeed(save.current)).toBeCloseTo(0.64);
    stats.health = 25;
    stats.satiety = 25;
    expect(canDash(save.current)).toBe(true);
    expect(actionSpeed(save.current)).toBe(1);
  });

  it("ривка немає через застуду чи слабкість — відмова з причиною; на перезарядці, за роботою й у кабіні — тиша (§11.4)", () => {
    const refusals = (save: Save): unknown[] => {
      const { events, stop } = recordEvents();
      expect(dash(save.current)).toBe(false);
      stop();
      return events.filter((e) => e.type === "refused").map((e) => (e.type === "refused" ? e.reason : null));
    };
    const cold = game();
    fallIllPerson(cold.current, "cold");
    expect(refusals(cold)).toEqual(["cold"]);
    const weak = game();
    weak.current.character.stats.health = 24;
    expect(refusals(weak)).toEqual(["weak"]);
    // Перезарядка — ривок от-от повернеться: без відмови, щоб бабл не спамив.
    const cooldown = game();
    expect(dash(cooldown.current)).toBe(true);
    expect(refusals(cooldown)).toEqual([]);
    // За комп'ютером і в душовій кабіні персонаж і так не рухається.
    const work = game();
    work.current.character.stats.health = 24;
    work.current.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
    expect(refusals(work)).toEqual([]);
    const shower = game();
    fallIllPerson(shower.current, "cold");
    shower.current.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    expect(refusals(shower)).toEqual([]);
  });

  it("«Сонливість» уповільнює ходьбу (§8.8)", () => {
    const save = game();
    save.current.minute = hours(23);
    place(save, 4.5, 8.5);
    walk(save, { x: 1, y: 0 }, 1);
    expect(save.current.character.body.x).toBeCloseTo(4.5 + 3 * 0.8);
  });
});

describe("збої керування від низького здорового глузду (§6.3)", () => {
  /** Гра без захисту першого тижня (§8.3): восьмий день — збої діють. */
  const unprotected = (): Save => {
    const save = game();
    save.current.day = FIRST_WEEK_PROTECTION.days;
    return save;
  };

  it("шанс росте від 0 при 25 до 40% при 0", () => {
    const save = unprotected();
    const stats = save.current.character.stats;
    for (const [sanity, chance] of [[40, 0], [25, 0], [12.5, 0.2], [0, 0.4]] as const) {
      stats.sanity = sanity;
      expect(glitchChance(save.current)).toBeCloseTo(chance);
    }
  });

  it("з низьким здоровим глуздом напрямок руху іноді зсувається", () => {
    const save = unprotected();
    save.current.modifiers.day = null;
    save.current.character.stats.sanity = 1;
    place(save, 9.5, 8.5);
    const { events, stop } = recordEvents();
    const directions: Vec[] = [];
    for (let i = 0; i < 2000; i++) {
      walk(save, { x: i % 400 < 200 ? 1 : -1, y: 0 }, 0.02);
      directions.push({ ...save.current.character.body.facing });
    }
    stop();
    const glitches = events.filter((e) => e.type === "glitch");
    expect(glitches.length).toBeGreaterThan(0);
    expect(directions.some((d) => Math.abs(d.y) > 0.5)).toBe(true);
  });

  it("зі здоровим глуздом від 25 збоїв немає", () => {
    const save = game();
    place(save, 9.5, 8.5);
    const { events, stop } = recordEvents();
    for (let i = 0; i < 500; i++) walk(save, { x: i % 200 < 100 ? 1 : -1, y: 0 }, 0.02);
    stop();
    expect(events.some((e) => e.type === "glitch")).toBe(false);
  });

  it("поки діє захист першого тижня, збоїв немає навіть при здоровому глузді 1; кіт чи восьмий день знімає захист (§8.3, рішення автора 2026-10-29, А2)", () => {
    const save = game();
    save.current.modifiers.day = null;
    save.current.character.stats.sanity = 1;
    expect(glitchChance(save.current)).toBe(0);
    place(save, 9.5, 8.5);
    const { events, stop } = recordEvents();
    // Дві години руху туди й назад: напрямок ні разу не зсунувся.
    let swerved = false;
    for (let i = 0; i < 6000; i++) {
      walk(save, { x: i % 400 < 200 ? 1 : -1, y: 0 }, 0.02);
      if (Math.abs(save.current.character.body.facing.y) > 0.5) swerved = true;
    }
    stop();
    expect(events.some((e) => e.type === "glitch")).toBe(false);
    expect(swerved).toBe(false);

    // Той самий стан, але в домі вже є кіт.
    const withCat = game();
    withCat.current.character.stats.sanity = 1;
    addCat(withCat.current, createCat(withCat.current, createRng(4), { source: "shelter", ageWeeks: 3, at: { x: 4.5, y: 8.5 } }));
    expect(glitchChance(withCat.current)).toBeGreaterThan(0);

    // Той самий стан на восьмий день, без котів.
    const later = unprotected();
    later.current.character.stats.sanity = 1;
    expect(glitchChance(later.current)).toBeGreaterThan(0);
  });
});

describe("квартира", () => {
  it("до кожної речі можна дійти від ліжка", () => {
    for (const o of OBJECTS.filter((o) => o.interactive)) {
      const save = game();
      // Усі сховища вже з'явилися (§6.4).
      save.current.home.acquired = ["food", "hygiene", "catFood", "sterileFood", "litter", "pills", "drops", "humanMeds", "treats", "collar", "bell", "shampoo", "detergent"];
      // Ящики біля входу стоять, лише коли в них щось є (§6.4).
      save.current.home.boxes = { food: { cheap: 1, premium: 0 } };
      walkTo(save, o.id);
      expect(targetOf(save.current)?.id).toBe(o.id);
    }
  });

  it("з двох речей поруч ціль — та, на яку персонаж дивиться", () => {
    const save = game();
    place(save, 14, 2.35, { x: -1, y: 0 });
    expect(targetOf(save.current)?.id).toBe("fridge");
    place(save, 14, 2.35, { x: 1, y: 0 });
    expect(targetOf(save.current)?.id).toBe("counter-left");
  });

  it("далеко від речей цілі немає", () => {
    const save = game();
    place(save, 9.5, 8.5);
    expect(targetOf(save.current)).toBeNull();
  });
});
