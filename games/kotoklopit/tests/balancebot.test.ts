// Бот балансу (`balance/bot.ts`, §11.2): поведінка, від якої залежить звіт, — щоб він міряв гру, а не вади бота.

import { describe, expect, it } from "vitest";

import { Bot } from "../balance/bot";
import { newGame } from "../src/sim/game";

describe("бот балансу", () => {
  it("безлад, що заступає ціль, прибирає там, де стоїть: два безлади, що заступають один одного, — за хвилини, а не ходінням між ними (рецензія пилососа 2026-11-02)", () => {
    // Розсипаний наповнювач біля двох лотків: від одного ціллю ставав інший, і goTo ↔ hold без меж водили бота між ними
    // годинами (у прогоні — до смерті від голоду, тут — до переповнення стеку за 855 хвилин).
    const save = newGame({ address: "she", difficulty: "hard", seed: 101, chronotype: "owl" });
    const state = save.current;
    state.cats = [];
    state.minute = 8 * 60;
    state.home.messes = [
      { id: 27, kind: "litter", x: 8.77, y: 3.73, cat: null },
      { id: 28, kind: "litter", x: 9.21, y: 3.78, cat: null },
    ];
    state.character.body.x = 11.5;
    state.character.body.y = 2.52;
    const bot = new Bot(save);
    (bot as unknown as { hold(id: string): void }).hold("mess:28");
    expect(save.current.home.messes).toEqual([]);
    expect(save.current.minute - 8 * 60).toBeLessThan(30);
  });
});
