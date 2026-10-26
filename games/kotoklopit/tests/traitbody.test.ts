// Етап «Тіло й завершення» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): заздрісність між котами, теплолюбність
// (тепло, прохолодна плитка, спека й холод) і схильність до повноти (вага й ожиріння).

import { describe, expect, it } from "vitest";

import { giveTreat } from "../src/sim/care";
import { createCat, idleAct } from "../src/sim/cat";
import { envy, tickCats } from "../src/sim/catai";
import { ENVY } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { recordEvents, withCatCorner, hours } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 7.5 }, ageWeeks = 10): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Прожити стільки хвилин котячого життя чвертями хвилини (персонаж удома). */
function live(save: Save, minutes: number): void {
  for (let t = 0; t < minutes; t += 0.25) {
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present: true });
  }
}

describe("«Заздрісність»: видимі реакції (§9.12, рішення автора 2026-10-25)", () => {
  it("заздрісник поруч шипить на того, кому перепало, — прояв «+»", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const envious = withCat(save, { envy: 1 }, { x: 10.5, y: 7.5 });
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === envious.id && e.at === lucky.id)).toBe(true);
    expect(seen(envious, "envy")).toBe(1);
  });

  it("заздрісник здалеку підходить і шипить зблизька; не встиг зашипіти — заздрить мовчки, без прояву", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const envious = withCat(save, { envy: 2 }, { x: 5.5, y: 7.5 });
    const before = relation(save.current, envious, lucky);
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    expect(envious.act.kind).toBe("jealous");
    expect(events.some((e) => e.type === "hissed")).toBe(false);
    expect(relation(save.current, envious, lucky)).toBe(before + 2 * ENVY.relation);
    for (let i = 0; i < 80 && envious.act.kind === "jealous"; i++) live(save, 0.25);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === envious.id && e.at === lucky.id)).toBe(true);
    expect(seen(envious, "envy")).toBe(1);
    expect(seen(envious, "jealousy")).toBe(0);
    // Щойно шипів — удруге за хвилину не шипить (спільна пауза), і прояву немає.
    envy(save.current, lucky, "collar");
    live(save, 4);
    expect(seen(envious, "envy")).toBe(1);
  });

  it("щиросердий підходить, сідає поруч із тим, кого пригостили, і муркоче — прояв «−», а не «Ревнивості»", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 7.5 });
    const kind = withCat(save, { envy: -2, jealousy: -2 }, { x: 5.5, y: 7.5 });
    const before = relation(save.current, kind, lucky);
    const { events, stop } = recordEvents();
    envy(save.current, lucky, "collar");
    expect(kind.act.target).toBe(`cuddle:${lucky.id}`);
    live(save, 4);
    stop();
    expect(events.some((e) => e.type === "cat-cuddled" && e.cat === kind.id && e.with === lucky.id)).toBe(true);
    expect(relation(save.current, kind, lucky)).toBe(before + ENVY.cuddleRelation);
    expect(seen(kind, "envy")).toBe(1);
    expect(seen(kind, "jealousy")).toBe(0);
  });

  it("«Заздрісник» (+2) поруч з вами інколи вихоплює ласощі в кота на руках і з'їдає сам — прояв «+»", () => {
    let snatched = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const save = game(seed);
      const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
      const thief = withCat(save, { envy: 2 }, { x: 10.5, y: 8.5 });
      save.current.home.supplies.treats.cheap = 5;
      save.current.character.held = { kind: "cat", cat: lucky.id };
      const love = lucky.love;
      const { events, stop } = recordEvents();
      expect(giveTreat(save.current, "cheap", createRng(seed))).toBe(true);
      stop();
      expect(save.current.home.supplies.treats.cheap).toBe(4);
      if (!events.some((e) => e.type === "treat-snatched" && e.cat === thief.id && e.from === lucky.id)) {
        expect(lucky.love).toBeGreaterThan(love);
        continue;
      }
      snatched += 1;
      // Ласощі дісталися заздрісникові, а кіт на руках лишився ні з чим.
      expect(lucky.love).toBe(love);
      expect(lucky.treatAt).toBeUndefined();
      expect(thief.treatAt).toBeDefined();
      expect(seen(thief, "envy")).toBe(1);
    }
    expect(snatched).toBeGreaterThan(3);
    expect(snatched).toBeLessThan(20);
  });

  it("«Заздрісний» (+1) і далекий «Заздрісник» ласощів не вихоплюють", () => {
    for (const [level, x] of [[1, 10.5], [2, 13.5]] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const save = game(seed);
        const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
        withCat(save, { envy: level }, { x, y: 8.5 });
        save.current.home.supplies.treats.cheap = 5;
        save.current.character.held = { kind: "cat", cat: lucky.id };
        const { events, stop } = recordEvents();
        giveTreat(save.current, "cheap", createRng(seed));
        stop();
        expect(events.some((e) => e.type === "treat-snatched")).toBe(false);
      }
    }
  });
});
