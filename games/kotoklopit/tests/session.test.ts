// Збереження в браузері (§2.1, §4.2): нечитабельне збереження не пропадає (перевірка циклу гри 2026-10-27).

import { afterEach, describe, expect, it } from "vitest";

import { loadSave, Session } from "../src/session";
import { newGame, SAVE_VERSION, serialize } from "../src/sim/game";

/** Сховище браузера для тесту: у Node його немає. */
function fakeStorage(items: Record<string, string>): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  };
}

/** Те, що `Session.restore` бере в браузера, крім сховища. */
function fakeBrowser(): void {
  Object.assign(globalThis, { window: { setInterval: () => 0 }, document: { addEventListener: () => undefined } });
}

const OTHER_VERSION = JSON.stringify({ version: SAVE_VERSION + 1, current: {} });

afterEach(() => {
  const browser = globalThis as { localStorage?: unknown; window?: unknown; document?: unknown };
  delete browser.localStorage;
  delete browser.window;
  delete browser.document;
});

describe("збереження в браузері", () => {
  it("читається збережена гра", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    fakeStorage({ "kotoklopit:save": serialize(save) });
    expect(loadSave()).toMatchObject({ save: { current: { seed: 3 } }, unreadable: null });
  });

  it("нечитабельне збереження (інша версія чи пошкоджене) відкладається окремо, щоб нова гра його не перезаписала", () => {
    const items: Record<string, string> = { "kotoklopit:save": OTHER_VERSION };
    fakeStorage(items);
    // Сцена отримує його текст, щоб запропонувати зберегти файлом (Ц3).
    expect(loadSave()).toEqual({ save: null, unreadable: OTHER_VERSION });
    expect(items["kotoklopit:save-unreadable"]).toBe(OTHER_VERSION);
  });

  it("збереження іншої версії не валить гру: вона починається з чистого стану", () => {
    const items: Record<string, string> = { "kotoklopit:save": OTHER_VERSION };
    fakeStorage(items);
    fakeBrowser();
    const session = Session.restore({ address: "she", difficulty: "normal" });
    expect(session.unreadable).toBe(OTHER_VERSION);
    expect(session.save).toMatchObject({ version: SAVE_VERSION, current: { day: 0, cats: [], album: [] } });
    session.persist();
    expect(items["kotoklopit:save"]).toBe(OTHER_VERSION);
  });

  it("доки картка про нечитабельне збереження без відповіді, автозбереження його не перезаписує", () => {
    const items: Record<string, string> = { "kotoklopit:save": OTHER_VERSION };
    fakeStorage(items);
    const session = new Session(newGame({ address: "she", difficulty: "normal", seed: 3 }));
    session.unreadable = loadSave().unreadable;
    session.persist();
    expect(items["kotoklopit:save"]).toBe(OTHER_VERSION);
    // Відповів — далі зберігається нова гра.
    session.unreadable = null;
    session.persist();
    expect(loadSave()).toMatchObject({ save: { current: { seed: 3 } }, unreadable: null });
  });
});
