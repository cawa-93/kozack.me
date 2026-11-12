// Збереження в браузері (§2.1, §4.2): нечитабельне збереження не пропадає (перевірка циклу гри 2026-10-27).

import { afterEach, describe, expect, it } from "vitest";

import { loadSave, Session } from "../src/session";
import { newGame, SAVE_VERSION, serialize } from "../src/sim/game";

/** Сховище браузера для тесту: у Node його немає. `full` — переповнене: запис кидає помилку, як `QuotaExceededError`. */
function fakeStorage(items: Record<string, string>, full = false): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new Error("QuotaExceededError");
      items[key] = value;
    },
  };
}

/** Те, що `Session.restore` бере в браузера, крім сховища; `fire` — подія вікна чи документа. */
function fakeBrowser(): { fire: (type: string) => void; hide: () => void } {
  const listeners: Record<string, (() => void)[]> = {};
  const on = (type: string, listener: () => void): void => {
    (listeners[type] ??= []).push(listener);
  };
  const document = { visibilityState: "visible", addEventListener: on };
  Object.assign(globalThis, { window: { setInterval: () => 0, addEventListener: on }, document });
  const fire = (type: string): void => listeners[type]?.forEach((listener) => listener());
  return {
    fire,
    hide: () => {
      document.visibilityState = "hidden";
      fire("visibilitychange");
    },
  };
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

describe("автозбереження", () => {
  it("гра зберігається, коли вкладку ховають і коли сторінку закривають чи покидають (pagehide)", () => {
    const items: Record<string, string> = {};
    fakeStorage(items);
    const browser = fakeBrowser();
    const session = Session.restore({ address: "she", difficulty: "normal" });
    session.save.current.minute = 700;
    browser.hide();
    expect(loadSave().save?.current.minute).toBe(700);
    // Safari, покидаючи сторінку, не завжди каже, що вкладку сховано, — тоді зберігає `pagehide`: друга вкладка (§4.2,
    // «Одна вкладка») прочитає вже записане.
    session.save.current.minute = 701;
    browser.fire("pagehide");
    expect(loadSave().save?.current.minute).toBe(701);
  });
});

describe("запис у сховище браузера не вдався (§4.2)", () => {
  const game = (): Session => new Session(newGame({ address: "she", difficulty: "normal", seed: 3 }));

  it("сцена дізнається про це один раз за запуск, щоб сказати гравцеві й порадити зберегти гру файлом", () => {
    fakeStorage({}, true);
    const session = game();
    expect(session.takeSaveWarning()).toBe(false);
    session.persist();
    expect(session.takeSaveWarning()).toBe(true);
    expect(session.takeSaveWarning()).toBe(false);
    // Наступні невдалі записи — без нових повідомлень.
    session.persist();
    expect(session.takeSaveWarning()).toBe(false);
  });

  it("сховище заблоковане зовсім (звернення до нього кидає помилку) — так само", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("SecurityError");
      },
    });
    const session = game();
    session.persist();
    expect(session.takeSaveWarning()).toBe(true);
  });

  it("запис не вдався лише раз, а наступний удався — гра зберігається: казати нічого", () => {
    let full = true;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        if (full) throw new Error("QuotaExceededError");
      },
    };
    const session = game();
    session.persist();
    full = false;
    session.persist();
    expect(session.takeSaveWarning()).toBe(false);
    // Знову не вдався — сказати (і так само лише раз за запуск).
    full = true;
    session.persist();
    expect(session.takeSaveWarning()).toBe(true);
  });

  it("запис вдався — казати нічого", () => {
    fakeStorage({});
    const session = game();
    session.persist();
    expect(session.takeSaveWarning()).toBe(false);
  });

  it("сценарій режиму розробки нічого не пише — і не каже", () => {
    fakeStorage({}, true);
    const session = game();
    session.persistent = false;
    session.persist();
    expect(session.takeSaveWarning()).toBe(false);
  });
});
