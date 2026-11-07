// Стан думками й настрій з поведінки (§11.4, правка автора 2026-10-25): про що й як часто думають кіт
// і персонаж, коли кіт повільно моргає й коли сумує.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { LOVE_BEHAVIOR, MOOD_LOOK, NEED_PER_HOUR, NEED_THRESHOLD, REAL_SECONDS_PER_GAME_HOUR, THOUGHTS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, CatActKind, Difficulty, Save, Vec } from "../src/sim/types";
import { catAsk } from "../src/view/symbols";
import { blinkAmount, catLook, catThought, personThought, ThoughtClock } from "../src/view/thoughts";
import { withCatCorner } from "./helpers";

function game(difficulty: Difficulty = "normal"): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty, seed: 11 }));
  save.current.modifiers.day = null;
  save.current.day = 8;
  save.current.minute = 14 * 60;
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

/** Кіт поруч із персонажем, без потреб, у доброму настрої, сидить. */
function withCat(save: Save, at = { x: 8.5, y: 8.5 }, seed = 4): Cat {
  const cat = createCat(save.current, createRng(seed), { source: "shelter", ageWeeks: 3, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  cat.mood = 60;
  cat.love = 50;
  cat.act = act("idle");
  return cat;
}

const free = (): boolean => false;

const act = (kind: CatActKind, goal: Vec | null = null): CatAct => ({ kind, target: null, goal, minutes: 10, elapsed: 0 });

/** Скільки думок покаже годинник за стільки секунд гри (кроками по 0,5 с). */
function count(save: Save, seconds: number, clock = new ThoughtClock(), taken: (owner: string) => boolean = free): string[] {
  const shown: string[] = [];
  for (let t = 0; t < seconds; t += 0.5) for (const b of clock.tick(save.current, 0.5, taken)) shown.push(`${b.at}:${b.icon}`);
  return shown;
}

describe("про що думає кіт (§11.4)", () => {
  it("голод, спрага, смуток, гра, увага — верхнє зі списку", () => {
    const save = game();
    const cat = withCat(save);
    expect(catThought(save.current, cat)).toBeNull();
    cat.needs.attention = THOUGHTS.attention;
    expect(catThought(save.current, cat)).toBe("attention");
    cat.needs.play = THOUGHTS.play;
    expect(catThought(save.current, cat)).toBe("toy");
    cat.mood = THOUGHTS.sad - 1;
    expect(catThought(save.current, cat)).toBe("sad");
    cat.needs.thirst = THOUGHTS.thirst;
    expect(catThought(save.current, cat)).toBe("drink");
    cat.needs.hunger = NEED_THRESHOLD.hunger - THOUGHTS.hungerLead;
    expect(catThought(save.current, cat)).toBe("kibble");
  });

  it("спрага й голод думкою — ті самі іконки, що й у проханні вголос: той самий випадок (правило автора 2026-10-30, §11.4)", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.thirst = THOUGHTS.thirst;
    const thirst = catThought(save.current, cat);
    const water = save.current.home.items.find((i) => i.kind === "water");
    if (!water) throw new Error("немає миски для води");
    // Кіт просить пити біля миски для води, на умивальнику й там, де миска стояла.
    for (const target of [`item:${water.id}`, "sink", "water"]) {
      cat.act = { ...act("beg"), target };
      expect(catAsk(save.current, cat), target).toEqual({ kind: "say", icon: thirst });
    }
    // Не крапля (вода в душі й з крана) і не перекреслена крапля (порожня миска для води) — інші випадки.
    expect(thirst).toBe("drink");
    cat.needs.thirst = 0;
    cat.needs.hunger = NEED_THRESHOLD.hunger;
    cat.act = act("idle");
    const hunger = catThought(save.current, cat);
    const bowl = save.current.home.items.find((i) => i.kind === "bowl");
    if (!bowl) throw new Error("немає миски");
    cat.act = { ...act("beg"), target: `item:${bowl.id}` };
    expect(catAsk(save.current, cat)).toEqual({ kind: "say", icon: hunger });
    // «Терплячий зранку» біля ліжка чекає сніданку мовчки — думкою, тим самим кормом.
    cat.act = { ...act("beg"), target: "bed" };
    expect(catAsk(save.current, cat)).toEqual({ kind: "think", icon: hunger });
  });

  it("думку видно раніше, ніж кіт сам піде пити, їсти чи по увагу — навіть на важкій", () => {
    // Найдовше чекання першої думки — на важкій, з розкидом угору.
    const longest = (THOUGHTS.catSeconds / THOUGHTS.frequency.hard) * (1 + THOUGHTS.jitter);
    const window = (from: number, to: number, perHour: number): number => ((to - from) / perHour) * REAL_SECONDS_PER_GAME_HOUR;
    expect(window(THOUGHTS.thirst, NEED_THRESHOLD.thirst, NEED_PER_HOUR.thirst)).toBeGreaterThanOrEqual(longest);
    expect(window(NEED_THRESHOLD.hunger - THOUGHTS.hungerLead, NEED_THRESHOLD.hunger, NEED_PER_HOUR.hunger)).toBeGreaterThanOrEqual(longest);
    expect(window(THOUGHTS.attention, NEED_THRESHOLD.attention, NEED_PER_HOUR.attention)).toBeGreaterThanOrEqual(longest);
  });

  it("кіт, що сам грається, не думає про гру", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.play = 90;
    cat.act = { ...act("wander", { x: 5, y: 8 }), target: "play" };
    expect(catThought(save.current, cat)).toBeNull();
    cat.act = act("wander", { x: 5, y: 8 });
    expect(catThought(save.current, cat)).toBe("toy");
  });

  it("уві сні, за їжею, на руках чи поза домом кіт не думає", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.hunger = 90;
    for (const kind of ["sleep", "eat", "toy", "hide", "fight", "lap", "beg"] as const) {
      cat.act = act(kind);
      expect(catThought(save.current, cat), kind).toBeNull();
    }
    cat.act = act("idle");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(catThought(save.current, cat)).toBeNull();
    save.current.character.held = null;
    cat.away = "stairs";
    expect(catThought(save.current, cat)).toBeNull();
  });
});

describe("про що думає персонаж (§11.4)", () => {
  it("про найнижчий показник під межею — іконкою з панелі", () => {
    const save = game();
    const stats = save.current.character.stats;
    Object.assign(stats, { health: 100, satiety: 100, hygiene: 100, sanity: 100 });
    expect(personThought(save.current)).toBeNull();
    stats.satiety = THOUGHTS.personLow - 5;
    expect(personThought(save.current)).toBe("food");
    stats.hygiene = THOUGHTS.personLow - 10;
    expect(personThought(save.current)).toBe("soap");
    stats.sanity = 5;
    expect(personThought(save.current)).toBe("mind");
  });
});

describe("як часто думають (§11.4, множники складності ×1,25 / ×1 / ×0,8)", () => {
  it("голодний кіт поруч думає про корм раз на ~хвилину, і не одразу", () => {
    const save = game();
    withCat(save).needs.hunger = 70;
    const clock = new ThoughtClock();
    const low = THOUGHTS.catSeconds * (1 - THOUGHTS.jitter);
    expect(count(save, low - 1, clock)).toEqual([]);
    const shown = count(save, 600);
    expect(shown.length).toBeGreaterThanOrEqual(Math.floor(600 / (THOUGHTS.catSeconds * (1 + THOUGHTS.jitter))));
    expect(shown.length).toBeLessThanOrEqual(Math.ceil(600 / low));
    expect(new Set(shown)).toEqual(new Set([`cat:${save.current.cats[0]?.id}:kibble`]));
  });

  it("на легкій кіт думає частіше, ніж на важкій", () => {
    const thoughts = (difficulty: Difficulty): number => {
      const save = game(difficulty);
      withCat(save).needs.play = 80;
      return count(save, 1200).length;
    };
    expect(thoughts("easy")).toBeGreaterThan(thoughts("normal"));
    expect(thoughts("normal")).toBeGreaterThan(thoughts("hard"));
  });

  it("десять котів не думають хором: між думками різних котів — проміжок", () => {
    const save = game();
    for (let i = 0; i < 10; i++) withCat(save, { x: 8.5, y: 8.5 }, i + 1).needs.attention = 70;
    const shown = count(save, 300);
    expect(shown.length).toBeLessThanOrEqual(Math.ceil(300 / THOUGHTS.catGapSeconds) + 1);
    // Ніхто не забутий: думає той, хто найдовше чекає, тож за кілька хвилин подумали всі десять.
    expect(new Set(shown).size).toBe(10);
  });

  it("думки кота й персонажа не разом", () => {
    const save = game();
    save.current.character.stats.satiety = 20;
    withCat(save).needs.hunger = 70;
    const clock = new ThoughtClock();
    let last = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 900; t += 0.5) {
      const shown = clock.tick(save.current, 0.5, free);
      expect(shown.length).toBeLessThanOrEqual(1);
      if (shown.length === 0) continue;
      expect(t - last).toBeGreaterThanOrEqual(THOUGHTS.apartSeconds);
      last = t;
    }
  });

  it("кіт в іншій кімнаті й кіт, над яким уже висить бабл, не думають", () => {
    const save = game();
    const far = withCat(save, { x: 2.5, y: 2.5 });
    far.needs.hunger = 70;
    expect(count(save, 300)).toEqual([]);
    const near = withCat(save, { x: 8.5, y: 8.5 }, 7);
    near.needs.hunger = 70;
    expect(count(save, 300, new ThoughtClock(), (owner) => owner === `cat:${near.id}`)).toEqual([]);
  });

  it("персонаж думає про голод раз на ~хвилину, на всіх складностях однаково", () => {
    for (const difficulty of ["easy", "hard"] as const) {
      const save = game(difficulty);
      save.current.character.stats.satiety = 20;
      const shown = count(save, 600);
      expect(shown.length, difficulty).toBeGreaterThanOrEqual(Math.floor(600 / (THOUGHTS.personSeconds * (1 + THOUGHTS.jitter))));
      expect(shown.length, difficulty).toBeLessThanOrEqual(Math.ceil(600 / (THOUGHTS.personSeconds * (1 - THOUGHTS.jitter))));
      expect(new Set(shown)).toEqual(new Set(["person:food"]));
    }
  });

  it("у поїздці ніхто не думає", () => {
    const save = game();
    save.current.character.stats.satiety = 20;
    withCat(save).needs.hunger = 70;
    save.current.trip = { destination: "shop", stage: "race", minutes: 0 } as unknown as NonNullable<typeof save.current.trip>;
    expect(count(save, 300)).toEqual([]);
  });
});

describe("настрій з поведінки (§11.4)", () => {
  it("щасливий відданий кіт поруч повільно моргає; далеко, без любові чи в ході — ні", () => {
    const save = game();
    const cat = withCat(save);
    cat.mood = MOOD_LOOK.blinkMood;
    cat.love = LOVE_BEHAVIOR.devoted;
    expect(catLook(save.current, cat)).toBe("blink");
    cat.love = LOVE_BEHAVIOR.devoted - 1;
    expect(catLook(save.current, cat)).toBeNull();
    cat.love = 90;
    cat.act = act("wander", { x: 5, y: 8 });
    expect(catLook(save.current, cat)).toBeNull();
    cat.act = act("idle");
    Object.assign(cat, { x: 9.5 - MOOD_LOOK.blinkDistance - 1 });
    expect(catLook(save.current, cat)).toBeNull();
  });

  it("сумний кіт — сумна поза, але не вві сні", () => {
    const save = game();
    const cat = withCat(save);
    cat.mood = THOUGHTS.sad - 1;
    expect(catLook(save.current, cat)).toBe("sad");
    cat.act = act("sleep");
    expect(catLook(save.current, cat)).toBeNull();
  });

  it("моргання: раз на період очі повільно заплющуються й розплющуються", () => {
    const period = MOOD_LOOK.blinkSeconds * 1000;
    const samples = Array.from({ length: period / 50 }, (_, i) => blinkAmount(i * 50, 3));
    expect(Math.max(...samples)).toBe(1);
    expect(samples.filter((v) => v === 0).length).toBeGreaterThan(samples.length * 0.7);
    // Різні коти моргають не разом: коли перший заплющує очі, другий дивиться.
    const t = period - 2333 + 200;
    expect(blinkAmount(t, 1)).toBeGreaterThan(0);
    expect(blinkAmount(t, 2)).toBe(0);
  });
});
