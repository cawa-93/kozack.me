// Складність після «Переграти день / тиждень» (§5.2): переграють з тією складністю, що обрана зараз, а набране до порогів за
// складністю (прояви рис, години пошуку роботи, хвилини страви на плиті) зберігає свою частку — як при звичайному перемиканні.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { BURN_MINUTES } from "../src/sim/config";
import { setDifficulty } from "../src/sim/difficulty";
import { advance, newGame, replayDay, replayWeek } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Difficulty, GameState, Save } from "../src/sim/types";

/** Гра на важкій: кіт із рисою, яку вже трохи бачили, пошук роботи й страва на плиті — у знімках дня й тижня. */
function game(): Save {
  const save = newGame({ address: "she", difficulty: "hard", seed: 3 });
  const state = save.current;
  state.modifiers.day = null;
  const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 5.5, y: 8.5 } });
  cat.traits = [{ group: "playful", level: 1, seen: 2, known: false }];
  addCat(state, cat);
  state.job.unemployed = true;
  state.job.searchHours = 3;
  state.home.stove = { item: { kind: "meal", quality: "cheap" }, minutes: BURN_MINUTES.hard - 4 };
  save.dayStart = structuredClone(state);
  save.weekStart = structuredClone(state);
  return save;
}

/** Знімок, перемкнутий на `difficulty` звичайним перемиканням: таким має стати стан після перегравання. */
function switched(snapshot: GameState, difficulty: Difficulty): GameState {
  const expected = structuredClone(snapshot);
  setDifficulty(expected, difficulty);
  return expected;
}

/** Стан без того, що перегравання й так змінює: лічильник перегравань і потік поведінки (§6.1). */
const comparable = (state: GameState): unknown => ({ ...state, replays: 0, rng: { ...state.rng, behavior: 0 } });

describe("складність після перегравання (§5.2)", () => {
  it("змінив складність і переграв день — складність нова, а частки порогів ті самі, що й при перемиканні", () => {
    const save = game();
    advance(save, 120);
    setDifficulty(save.current, "easy");
    replayDay(save);
    expect(save.current.difficulty).toBe("easy");
    expect(comparable(save.current)).toEqual(comparable(switched(save.dayStart, "easy")));
  });

  it("змінив складність і переграв тиждень — складність нова; і наступне «Переграти день» — з нею ж", () => {
    const save = game();
    advance(save, 120);
    setDifficulty(save.current, "ukro");
    replayWeek(save);
    expect(save.current.difficulty).toBe("ukro");
    expect(comparable(save.current)).toEqual(comparable(switched(save.weekStart, "ukro")));
    advance(save, 60);
    replayDay(save);
    expect(save.current.difficulty).toBe("ukro");
  });

  it("програв на новій складності — переграють з нею, а змінена ще раз після програшу — з останньою", () => {
    const save = game();
    setDifficulty(save.current, "normal");
    save.current.end = "sanity";
    replayDay(save);
    expect(save.current.end).toBeNull();
    expect(save.current.difficulty).toBe("normal");
    save.current.end = "sanity";
    setDifficulty(save.current, "easy");
    replayDay(save);
    expect(save.current.difficulty).toBe("easy");
  });
});
