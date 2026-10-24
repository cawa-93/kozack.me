// Здоровий глузд від котів (§8.2, §9.12, правка автора 2026-10-23): пестощі, гра, коліна й кіт у полі зору.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { decide, watchCats } from "../src/sim/catai";
import { PLAY, WATCH_SANITY } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { startWork } from "../src/sim/work";
import type { Cat, Save } from "../src/sim/types";
import { standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.day = 8;
  save.current.minute = 14 * 60;
  return save;
}

function withCat(save: Save, at = { x: 4.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  return cat;
}

describe("здоровий глузд від котів (§9.12)", () => {
  it("кіт, що хоче уваги, хоче її всі 5 хвилин, які терпить: +2 за хвилину", () => {
    const save = game();
    const body = save.current.character.body;
    Object.assign(body, { x: 9.5, y: 8.5, facing: { x: 0, y: -1 } });
    const cat = withCat(save, { x: body.x, y: body.y - 0.6 });
    cat.needs.attention = 60;
    const { stats } = save.current.character;
    stats.sanity = 40;
    for (let i = 0; i < 10; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.activity?.kind).toBe("pet");
    // Увага −4 за хвилину (і трохи росте сама): за 5 хвилин — з 60 приблизно до 40, і весь час «хоче» (+2 за хвилину).
    expect(cat.needs.attention).toBeGreaterThanOrEqual(40);
    expect(cat.needs.attention).toBeLessThan(42);
    expect(stats.sanity).toBeGreaterThan(40 + 9.5);
  });

  it("гра з іграшкою — +4 за хвилину", () => {
    expect(PLAY.sanity).toBe(4);
  });

  it("до того, хто працює, кіт іде вже з увагою від 40", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    cat.needs.attention = 45;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).not.toBe("attention");
    startWork(save.current);
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).toBe("attention");
  });
});

describe("кіт у полі зору (§8.2, правка 2026-10-23)", () => {
  const watch = (setup: (save: Save, cats: Cat[]) => void): number => {
    const save = game();
    const cats = [withCat(save, { x: 4.5, y: 8.5 }), withCat(save, { x: 5.5, y: 8.5 })];
    standAt(save, "computer");
    setup(save, cats);
    const before = save.current.character.stats.sanity;
    watchCats(save.current, 60);
    return save.current.character.stats.sanity - before;
  };
  const act = (kind: "sleep" | "idle" | "hide") => ({ kind, target: null, goal: null, minutes: 60, elapsed: 0 });

  it("спить — +1 за годину, не спить — +3; кожен наступний кіт дає менше: другий — половину свого", () => {
    expect(watch((_, [a, b]) => { a!.act = act("sleep"); b!.act = act("hide"); })).toBeCloseTo(WATCH_SANITY.asleep);
    expect(watch((_, [a, b]) => { a!.act = act("idle"); b!.act = act("hide"); })).toBeCloseTo(WATCH_SANITY.awake);
    expect(watch((_, [a, b]) => { a!.act = act("sleep"); b!.act = act("sleep"); })).toBeCloseTo(1 + 1 / 2);
    // Найкращий — той, що не спить, хоч він і другий у списку.
    expect(watch((_, [a, b]) => { a!.act = act("sleep"); b!.act = act("idle"); })).toBeCloseTo(3 + 1 / 2);
    expect(watch((_, [a, b]) => { a!.act = act("idle"); b!.act = act("idle"); })).toBeCloseTo(3 + 3 / 2);
  });

  it("десять котів, що не сплять, — не вдесятеро більше, а ≈ +8,8", () => {
    const save = game();
    const cats = Array.from({ length: 10 }, (_, i) => withCat(save, { x: 2.5 + i, y: 8.5 }));
    for (const cat of cats) cat.act = act("idle");
    standAt(save, "computer");
    const before = save.current.character.stats.sanity;
    watchCats(save.current, 60);
    expect(save.current.character.stats.sanity - before).toBeCloseTo(3 * (1 + 1 / 2 + 1 / 3 + 1 / 4 + 1 / 5 + 1 / 6 + 1 / 7 + 1 / 8 + 1 / 9 + 1 / 10), 1);
  });

  it("схованого кота й кота в іншій кімнаті не видно", () => {
    expect(watch((_, [a, b]) => { a!.act = act("hide"); b!.act = act("hide"); })).toBe(0);
    expect(watch((save, [a, b]) => {
      a!.x = 15.5; a!.y = 2.5; b!.x = 16.5; b!.y = 2.5;
      a!.act = act("idle"); b!.act = act("idle");
      standAt(save, "bed");
    })).toBe(0);
  });
});
