// «Назад до гри» на сторінці титрів (§2.1): вкладку титрів, яку щойно відкрила гра, посилання закриває, а не відкриває другу
// вкладку гри. Чи титри відкрила гра — за адресою, з якої прийшли: адреса гри буває і з скісною рискою в кінці, і без неї, і з
// `index.html`.

import { describe, expect, it } from "vitest";

import { isGamePage } from "../src/credits/gamepage";

const CREDITS = "https://kozack.me/games/kotoklopit/credits.html";

describe("титри відкрила гра (§2.1)", () => {
  it("гра — будь-якою з її адрес", () => {
    for (const game of [
      "https://kozack.me/games/kotoklopit/",
      "https://kozack.me/games/kotoklopit",
      "https://kozack.me/games/kotoklopit/index.html",
      "https://kozack.me/games/kotoklopit/?from=menu",
    ]) {
      expect(isGamePage(game, CREDITS), game).toBe(true);
    }
  });

  it("не гра — інша сторінка, інша гра, інший сайт чи незрозуміла адреса", () => {
    for (const other of [
      "https://kozack.me/games/",
      "https://kozack.me/games/kotoklopit/credits.html",
      "https://kozack.me/games/other/",
      "https://example.com/games/kotoklopit/",
      "",
      "не адреса",
    ]) {
      expect(isGamePage(other, CREDITS), other).toBe(false);
    }
  });
});
