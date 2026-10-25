// Етап «Столи, двері, переноска» — бешкет (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): як
// «Скидання речей», «Дряпання» й «Допитливість» видно на речах квартири.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { decide, standingTrinkets, startScratch, tickCats } from "../src/sim/catai";
import { KNOCKING, SCRATCH, SOFA_REPAIR } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { trinketTile } from "../src/sim/home";
import { nightlyHousehold } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel, TrinketKind } from "../src/sim/types";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  // Персонаж на кухні: бачить кухонний стіл.
  Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 15.5, y: 3.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Кіт уже на столі біля дрібнички й скидає її (чи обнюхує). */
function knockAt(save: Save, cat: Cat, kind: TrinketKind): void {
  const tile = trinketTile(kind);
  cat.x = tile.x + 0.5;
  cat.y = tile.y + 0.5;
  cat.act = { kind: "knock", target: `trinket:${kind}`, goal: null, minutes: KNOCKING.sniffMinutes, elapsed: 0 };
  for (let i = 0; i < 4 && cat.act.kind === "knock"; i++) tickCats(save.current, 0.25, { present: true });
}

describe("«Скидання речей»: дрібнички на столах (§9.12, рішення автора 2026-10-25)", () => {
  it("кухоль, телефон і ручка стоять на місцях; скинуту видно на підлозі до ранку, а вранці вона знову на столі", () => {
    const save = game();
    const cat = withCat(save, { knocking: 1 });
    expect(standingTrinkets(save.current).map((t) => t.kind).sort()).toEqual(["mug", "pen", "phone"]);
    knockAt(save, cat, "phone");
    const fallen = save.current.home.trinkets?.phone;
    expect(fallen).toBeDefined();
    expect(fallen?.broken).toBeUndefined();
    expect(standingTrinkets(save.current).map((t) => t.kind)).not.toContain("phone");
    // Скинув на очах персонажа — прояв «+».
    expect(seen(cat, "knocking")).toBe(1);
    nightlyHousehold(save.current, createRng(1));
    expect(standingTrinkets(save.current)).toHaveLength(3);
  });

  it("кухоль розбивається з шансом 50%: уламки, гуркіт і +2 до ремонту", () => {
    let broken = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const save = game(seed);
      const cat = withCat(save, { knocking: 2 });
      const repairs = save.current.home.repairs;
      const { events, stop } = recordEvents();
      knockAt(save, cat, "mug");
      stop();
      const mug = save.current.home.trinkets?.mug;
      expect(mug).toBeDefined();
      if (mug?.broken === true) {
        broken += 1;
        expect(save.current.home.repairs).toBe(repairs + KNOCKING.repair);
        expect(save.current.home.messes.some((m) => m.kind === "broken")).toBe(true);
        expect(events.some((e) => e.type === "trinket-fell" && e.broken)).toBe(true);
      } else expect(save.current.home.repairs).toBe(repairs);
    }
    expect(broken).toBeGreaterThan(4);
    expect(broken).toBeLessThan(20);
  });

  it("«Делікатний» (−2) лише обнюхує дрібничку й обходить її — прояв «−»", () => {
    const save = game();
    const cat = withCat(save, { knocking: -2 });
    const { events, stop } = recordEvents();
    knockAt(save, cat, "mug");
    stop();
    expect(save.current.home.trinkets?.mug).toBeUndefined();
    expect(events.some((e) => e.type === "trinket-sniffed" && e.cat === cat.id)).toBe(true);
    expect(seen(cat, "knocking")).toBe(1);
  });

  it("«−» ходить столами так само часто, як кіт без риси", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const choices: string[] = [];
      for (const level of [0, -1] as const) {
        const save = game();
        const cat = withCat(save, level === 0 ? {} : { knocking: level });
        cat.needs.play = 100;
        decide(save.current, cat, createRng(seed), { present: true });
        choices.push(`${cat.act.kind}:${cat.act.target}`);
      }
      expect(choices[1], `seed ${seed}`).toBe(choices[0]);
    }
  });

  it("«+», якого 5 хвилин не гладять, скидає дрібничку заради уваги — раз за візит", () => {
    let shows = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const save = game(seed);
      const cat = withCat(save, { knocking: 2 }, { x: 15.5, y: 2.5 });
      cat.needs.attention = 90;
      cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0, seen: true };
      let knocked = 0;
      for (let i = 0; i < 40; i++) {
        tickCats(save.current, 0.25, { present: true });
        if (cat.act.kind === "knock" && cat.act.showOff === true) {
          knocked += 1;
          break;
        }
        if (cat.act.kind !== "attention") break;
      }
      shows += knocked;
      // До 5 хвилин без ласки кіт не скидає нічого заради уваги.
      if (knocked > 0) expect(cat.act.target?.startsWith("trinket:")).toBe(true);
    }
    // 40% за візит у +2.
    expect(shows).toBeGreaterThan(3);
    expect(shows).toBeLessThan(15);
  });

  it("кіт без риси заради уваги нічого не скидає", () => {
    const save = game();
    const cat = withCat(save, {}, { x: 15.5, y: 2.5 });
    cat.needs.attention = 90;
    cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0, seen: true };
    for (let i = 0; i < 60 && cat.act.kind === "attention"; i++) tickCats(save.current, 0.25, { present: true });
    expect(save.current.home.trinkets).toBeUndefined();
  });
});

/** Куди кіт іде точити кігті: ціль дії за багатьох seed. */
function scratchTargets(level: TraitLevel | 0, runs = 200, boxes = false): Record<string, number> {
  const targets: Record<string, number> = {};
  for (let seed = 1; seed <= runs; seed++) {
    const save = game(seed);
    if (boxes) save.current.home.boxes = { food: { cheap: 2, premium: 0 } };
    const cat = withCat(save, level === 0 ? {} : { scratching: level });
    startScratch(save.current, cat, createRng(seed));
    const target = cat.act.target ?? "—";
    targets[target] = (targets[target] ?? 0) + 1;
  }
  return targets;
}

describe("«Дряпання»: де кіт точить кігті (§9.12, рішення автора 2026-10-25)", () => {
  it("без кігтеточки кіт без риси дере диван, «Бережливий» — ніколи: лише килимок чи коробки", () => {
    expect(scratchTargets(0)).toEqual({ sofa: 200 });
    const careful = scratchTargets(-2, 200, true);
    expect(careful["sofa"]).toBeUndefined();
    expect(careful["rug"]).toBeGreaterThan(50);
    expect(careful["boxes"]).toBeGreaterThan(50);
    // Коробок немає — лише килимок.
    expect(scratchTargets(-2)).toEqual({ rug: 200 });
  });

  it("«Любить кігтеточку» дере диван лише через раз, «Руйнівник диванів» інколи дере одвірок", () => {
    const fond = scratchTargets(-1);
    expect(fond["sofa"]).toBeGreaterThan(70);
    expect(fond["rug"]).toBeGreaterThan(70);
    const wrecker = scratchTargets(2);
    expect(wrecker["doorframe"]).toBeGreaterThan(30);
    expect(wrecker["doorframe"]).toBeLessThan(100);
    expect(scratchTargets(1)["doorframe"]).toBeUndefined();
  });

  it("одвірок — ремонт, як диван; килимок — нічого; прояв — на місці, на очах персонажа", () => {
    const save = game();
    // Персонаж у вітальні — бачить і прохід на кухню, і килим.
    Object.assign(save.current.character.body, { x: 14.5, y: 7.5 });
    const wrecker = withCat(save, { scratching: 2 }, { x: 16.5, y: 5.5 });
    const repairs = save.current.home.repairs;
    wrecker.act = { kind: "scratch", target: "doorframe", goal: null, minutes: SCRATCH.minutes, elapsed: 0 };
    const careful = withCat(save, { scratching: -2 }, { x: 10.5, y: 8.5 });
    careful.act = { kind: "scratch", target: "rug", goal: null, minutes: SCRATCH.minutes, elapsed: 0 };
    const { events, stop } = recordEvents();
    tickCats(save.current, SCRATCH.minutes + 0.1, { present: true });
    stop();
    expect(save.current.home.repairs).toBe(repairs + SOFA_REPAIR);
    expect(events.filter((e) => e.type === "scratched").map((e) => (e.type === "scratched" ? e.where : null)).sort()).toEqual(["doorframe", "rug"]);
    expect(seen(wrecker, "scratching")).toBe(1);
    expect(seen(careful, "scratching")).toBe(1);
  });

  it("точити кігті хоче й «Бережливий»: вага не нижча за половину звичайної", () => {
    let careful = 0;
    let plain = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const level of [0, -2] as const) {
        const save = game();
        const cat = withCat(save, level === 0 ? {} : { scratching: level });
        cat.needs.play = 100;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "scratch") {
          if (level === 0) plain += 1;
          else careful += 1;
        }
      }
    }
    expect(careful).toBeGreaterThan(plain * 0.35);
    expect(careful).toBeLessThan(plain);
  });

  it("проспавши від години, кіт з шансом 25% одразу точить кігті — і голодний; кому треба в лоток — спершу лоток", () => {
    let scratched = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const save = game(seed);
      const cat = withCat(save, {}, { x: 5.5, y: 8.5 });
      cat.act = { kind: "sleep", target: null, goal: null, minutes: 0.5, elapsed: 70 };
      cat.needs.fatigue = 5;
      cat.needs.hunger = 95;
      tickCats(save.current, 1, { present: true });
      if (cat.act.kind === "scratch") scratched += 1;
    }
    expect(scratched).toBeGreaterThan(12);
    expect(scratched).toBeLessThan(40);
    for (let seed = 1; seed <= 40; seed++) {
      const save = game(seed);
      const cat = withCat(save, {}, { x: 5.5, y: 8.5 });
      cat.act = { kind: "sleep", target: null, goal: null, minutes: 0.5, elapsed: 70 };
      cat.needs.fatigue = 5;
      cat.needs.toilet = 95;
      tickCats(save.current, 1, { present: true });
      expect(cat.act.kind).not.toBe("scratch");
    }
  });
});
