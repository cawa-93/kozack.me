// Збереження в браузері (§2.1, §4.2): нечитабельне збереження не пропадає (перевірка циклу гри 2026-10-27).

import { afterEach, describe, expect, it } from "vitest";

import { loadSave } from "../src/session";
import { newGame, serialize } from "../src/sim/game";

/** Сховище браузера для тесту: у Node його немає. */
function fakeStorage(items: Record<string, string>): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  };
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("збереження в браузері", () => {
  it("читається збережена гра", () => {
    const save = newGame({ sex: "female", difficulty: "normal", seed: 3 });
    fakeStorage({ "kotoklopit:save": serialize(save) });
    expect(loadSave()?.current.seed).toBe(3);
  });

  it("нечитабельне збереження (інша версія чи пошкоджене) відкладається окремо, щоб нова гра його не перезаписала", () => {
    const items: Record<string, string> = { "kotoklopit:save": '{"version":1,"current":{}}' };
    fakeStorage(items);
    expect(loadSave()).toBeNull();
    expect(items["kotoklopit:save-unreadable"]).toBe('{"version":1,"current":{}}');
  });
});
