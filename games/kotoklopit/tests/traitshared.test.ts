// Спільні механіки рис (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): пауза між оглушеннями,
// пауза шипіння, не більше двох нічних побудок.

import { describe, expect, it } from "vitest";

import { stun } from "../src/sim/body";
import { createCat } from "../src/sim/cat";
import { jealousy } from "../src/sim/catai";
import { STUN_PAUSE_MINUTES, HISS_PAUSE_MINUTES, WAKE_UP } from "../src/sim/config";
import { goToSleep, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  save.current.character.body.x = 9.5;
  save.current.character.body.y = 8.5;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("спільні паузи (§9.12, рішення автора 2026-10-25)", () => {
  it("персонажа оглушує не частіше ніж раз на 5 хвилин", () => {
    const save = game();
    const state = save.current;
    expect(stun(state)).toBe(true);
    expect(state.character.body.stun).toBeGreaterThan(0);
    state.character.body.stun = 0;
    state.minute += STUN_PAUSE_MINUTES - 1;
    expect(stun(state)).toBe(false);
    expect(state.character.body.stun).toBe(0);
    state.minute += 1;
    expect(stun(state)).toBe(true);
  });

  it("кіт шипить не частіше ніж раз на 20 хвилин, і без шипіння немає сварки", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const jealous = withCat(save, { jealousy: 2 }, { x: 7.5, y: 8.5 });
    const { events, stop } = recordEvents();
    jealousy(save.current, lucky);
    jealousy(save.current, lucky);
    const hissed = (): number => events.filter((e) => e.type === "hissed").length;
    expect(hissed()).toBe(1);
    expect(jealous.traits[0]?.seen).toBe(1);
    save.current.minute += HISS_PAUSE_MINUTES;
    jealousy(save.current, lucky);
    stop();
    expect(hissed()).toBe(2);
  });

  it("за ніч будять не більше двох котів", () => {
    let capped = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game(seed);
      for (let i = 0; i < 6; i++) withCat(save, { nocturnal: 2 }, { x: 3.5 + i, y: 8.5 });
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 2;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      const wakes = report?.wakeUps.length ?? 0;
      expect(wakes).toBeLessThanOrEqual(WAKE_UP.maxPerNight);
      if (wakes === WAKE_UP.maxPerNight) capped += 1;
    }
    expect(capped).toBeGreaterThan(0);
  });
});
