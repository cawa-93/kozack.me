// Esc у повному екрані (§10): браузер на Esc сам виходить із повного екрана й клавіші сторінці не віддає, тож гра забирає її
// собі (Keyboard Lock, де він є). Відкриту картку Esc закриває (`tests/overlay.test.ts`), а Esc, якого ніхто не обробив,
// виводить із повного екрана, як і без перехоплення.

import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeKey {
  key: string;
  repeat: boolean;
  defaultPrevented: boolean;
}

/** Підставний браузер: повний екран, Keyboard Lock (де він є) і слухачі клавіш вікна. */
function browser(keyboardLock: boolean) {
  const lock = vi.fn(async (_keys: string[]) => undefined);
  const doc = {
    fullscreenEnabled: true,
    fullscreenElement: null as object | null,
    documentElement: {
      requestFullscreen: vi.fn(async () => {
        doc.fullscreenElement = {};
      }),
    },
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
    }),
  };
  const keydown: ((event: FakeKey) => void)[] = [];
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", keyboardLock ? { keyboard: { lock } } : {});
  vi.stubGlobal("screen", { orientation: { lock: async () => undefined } });
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: (event: FakeKey) => void) => {
      if (type === "keydown") keydown.push(listener);
    },
    removeEventListener: () => undefined,
  });
  /** Натиснути клавішу: слухачі гри, а за ними — картка (`handled`: вона обробила клавішу й зробила preventDefault). */
  const press = (key: string, handled: boolean, repeat = false): void => {
    const event: FakeKey = { key, repeat, defaultPrevented: false };
    for (const listener of keydown) listener(event);
    event.defaultPrevented = handled;
    vi.runAllTimers();
  };
  return { doc, lock, press };
}

describe("Esc у повному екрані (§10)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("у повному екрані гра забирає Esc собі (Keyboard Lock); браузер без нього входить у повний екран без помилки", async () => {
    const chrome = browser(true);
    const { toggleFullscreen } = await import("../src/screen");
    toggleFullscreen();
    await vi.waitFor(() => expect(chrome.lock).toHaveBeenCalledWith(["Escape"]));
    expect(chrome.doc.fullscreenElement).not.toBeNull();

    const firefox = browser(false);
    toggleFullscreen();
    await vi.waitFor(() => expect(firefox.doc.fullscreenElement).not.toBeNull());
  });

  it("Esc, якого картка не обробила, виводить із повного екрана; оброблений, інша клавіша й автоповтор — ні", async () => {
    vi.useFakeTimers();
    const { doc, press } = browser(true);
    const { escapeLeavesFullscreen } = await import("../src/screen");
    escapeLeavesFullscreen();
    doc.fullscreenElement = {};
    // Картка відкрита: вона обробляє Esc пізніше за слухача гри — гра чекає, доки спрацюють усі.
    press("Escape", true);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    press("Enter", false);
    press("Escape", false, true);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    // Картки немає — Esc виходить із повного екрана, як у браузері без перехоплення.
    press("Escape", false);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    // Поза повним екраном Esc нічого не робить.
    press("Escape", false);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
