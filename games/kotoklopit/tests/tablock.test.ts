// Одна вкладка (§4.2): гра йде лише в одній вкладці браузера; друга показує, що гру відкрито в іншій, і продовжує сама, щойно
// ту закрили, — з тим, що та встигла зберегти.

import { afterEach, describe, expect, it } from "vitest";

import { loadSave, Session } from "../src/session";
import { TAB_BUSY } from "../src/texts";
import { GAME_LOCK, openGame, type TabPage } from "../src/tablock";

/** Web Locks одного сайту в браузері: замок за назвою, черга запитів, `ifAvailable`, `signal`. */
class FakeLocks {
  private readonly holders = new Map<string, () => void>();
  private readonly queues = new Map<string, (() => void)[]>();

  request(name: string, second: LockOptions | LockGrantedCallback<unknown>, third?: LockGrantedCallback<unknown>): Promise<unknown> {
    const options: LockOptions = typeof second === "function" ? {} : second;
    const callback = typeof second === "function" ? second : third!;
    return new Promise((resolve, reject) => {
      const grant = (): void => {
        let released = false;
        const release = (): void => {
          if (released) return;
          released = true;
          this.holders.delete(name);
          this.queues.get(name)?.shift()?.();
        };
        this.holders.set(name, release);
        void Promise.resolve()
          .then(() => callback({ name, mode: "exclusive" }))
          .then(
            (value) => {
              release();
              resolve(value);
            },
            (error: unknown) => {
              release();
              reject(error);
            },
          );
      };
      if (!this.holders.has(name)) grant();
      else if (options.ifAvailable) void Promise.resolve().then(() => callback(null)).then(resolve, reject);
      else {
        const queue = this.queues.get(name) ?? [];
        this.queues.set(name, queue);
        queue.push(grant);
        options.signal?.addEventListener("abort", () => {
          const at = queue.indexOf(grant);
          if (at < 0) return;
          queue.splice(at, 1);
          reject(new DOMException("Запит знято", "AbortError"));
        });
      }
    });
  }

  held(name: string): boolean {
    return this.holders.has(name);
  }

  /** Вкладку, що тримає замок, закрили: браузер відпускає його сам. */
  closeHolder(name: string): void {
    this.holders.get(name)?.();
  }
}

/** Вкладка для тесту: її події сторінки, перезавантаження й повідомлення на заставці. */
function fakeTab(locks: FakeLocks | undefined): {
  page: TabPage;
  fire: (type: "pagehide" | "pageshow", persisted: boolean) => void;
  reloads: () => number;
  busy: () => { shown: number; hidden: number };
} {
  const listeners: { type: string; listener: (persisted: boolean) => void }[] = [];
  let reloads = 0;
  const busy = { shown: 0, hidden: 0 };
  const page: TabPage = {
    locks: locks as unknown as TabPage["locks"],
    onPage: (type, listener) => listeners.push({ type, listener }),
    reload: () => reloads++,
    busy: () => {
      busy.shown++;
      return () => busy.hidden++;
    },
  };
  return {
    page,
    fire: (type, persisted) => listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(persisted)),
    reloads: () => reloads,
    busy: () => ({ ...busy }),
  };
}

/** Гра для тесту: скільки разів її зберегли. */
function fakeGame(): { persist: () => void; retire: () => void; saves: number } {
  const game = {
    saves: 0,
    persist: () => {
      game.saves++;
    },
    retire: () => undefined,
  };
  return game;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  const browser = globalThis as { localStorage?: unknown; window?: unknown; document?: unknown };
  delete browser.localStorage;
  delete browser.window;
  delete browser.document;
});

describe("одна вкладка (§4.2)", () => {
  it("без Web Locks (старий браузер, сторінка не з https) гра відкривається одразу, як досі", async () => {
    const tab = fakeTab(undefined);
    const game = fakeGame();
    await expect(openGame(tab.page, () => game)).resolves.toBe(game);
    expect(tab.busy().shown).toBe(0);
  });

  it("перша вкладка бере замок гри й відкриває гру без повідомлення; замок тримається, поки вкладка жива", async () => {
    expect(GAME_LOCK).toMatch(/^kotoklopit:/);
    const locks = new FakeLocks();
    const tab = fakeTab(locks);
    const game = fakeGame();
    await expect(openGame(tab.page, () => game)).resolves.toBe(game);
    expect(tab.busy().shown).toBe(0);
    await settle();
    expect(locks.held(GAME_LOCK)).toBe(true);
  });

  it("друга вкладка не відкриває гри, поки грає перша: повідомлення, а щойно першу закрили — гра", async () => {
    const locks = new FakeLocks();
    await openGame(fakeTab(locks).page, fakeGame);
    const second = fakeTab(locks);
    let opened = 0;
    const game = fakeGame();
    const opening = openGame(second.page, () => {
      opened++;
      return game;
    });
    await settle();
    expect(second.busy()).toEqual({ shown: 1, hidden: 0 });
    expect(opened).toBe(0);
    locks.closeHolder(GAME_LOCK);
    await expect(opening).resolves.toBe(game);
    expect(opened).toBe(1);
    expect(second.busy()).toEqual({ shown: 1, hidden: 1 });
    await settle();
    expect(locks.held(GAME_LOCK)).toBe(true);
  });

  it("друга вкладка читає збереження вже з замком: те, що перша встигла зберегти, закриваючись", async () => {
    const items: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    };
    const listeners: Record<string, (() => void)[]> = {};
    const on = (type: string, listener: () => void): void => {
      (listeners[type] ??= []).push(listener);
    };
    const document = { visibilityState: "visible", addEventListener: on };
    Object.assign(globalThis, { window: { setInterval: () => 0, addEventListener: on }, document });
    const restore = (): Session => Session.restore({ address: "she", difficulty: "normal" });

    const locks = new FakeLocks();
    const first = await openGame(fakeTab(locks).page, restore);
    first.persist();
    const second = openGame(fakeTab(locks).page, restore);
    await settle();
    // Перша вкладка ще грає; закриваючись, вона зберігає гру (`visibilitychange`), а вже потім браузер відпускає її замок.
    first.save.current.minute = 777;
    document.visibilityState = "hidden";
    listeners["visibilitychange"]?.forEach((listener) => listener());
    locks.closeHolder(GAME_LOCK);
    expect((await second).save.current.minute).toBe(777);
    expect(loadSave().save?.current.minute).toBe(777);
  });

  it("сторінка йде в кеш «назад-уперед» — зберігає гру й відпускає замок; повертається з кешу — перезавантажується", async () => {
    const locks = new FakeLocks();
    const first = fakeTab(locks);
    const game = fakeGame();
    await openGame(first.page, () => game);
    const second = fakeTab(locks);
    let opened = false;
    void openGame(second.page, () => {
      opened = true;
      return fakeGame();
    });
    await settle();
    first.fire("pagehide", true);
    expect(game.saves).toBe(1);
    await settle();
    expect(opened).toBe(true);
    // Повернулася з кешу: гра в ній уже застаріла, а замок — у другої; перезавантажившись, вона стане в чергу.
    first.fire("pageshow", true);
    expect(first.reloads()).toBe(1);
  });

  it("сторінка, що віддала замок із кешу, більше не зберігає: її застаріла гра не лягає поверх новішої", async () => {
    const items: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    };
    Object.assign(globalThis, {
      window: { setInterval: () => 0, addEventListener: () => undefined },
      document: { visibilityState: "visible", addEventListener: () => undefined },
    });
    const restore = (): Session => Session.restore({ address: "she", difficulty: "normal" });
    const locks = new FakeLocks();
    const tab = fakeTab(locks);
    const first = await openGame(tab.page, restore);
    first.save.current.minute = 500;
    tab.fire("pagehide", true);
    // Тим часом інша сторінка гри дістала замок, грала й зберегла новішу гру.
    const second = await openGame(fakeTab(locks).page, restore);
    expect(second.save.current.minute).toBe(500);
    second.save.current.minute = 900;
    second.persist();
    // Перша повертається з кешу й перезавантажується; вивантажуючись, вона ховається й зберігає (`visibilitychange`, `pagehide`).
    tab.fire("pageshow", true);
    expect(tab.reloads()).toBe(1);
    first.persist();
    expect(loadSave().save?.current.minute).toBe(900);
  });

  it("вкладку закривають (не в кеш) — замок відпускає сам браузер, коли сторінки вже немає: після автозбереження", async () => {
    const locks = new FakeLocks();
    const first = fakeTab(locks);
    await openGame(first.page, fakeGame);
    first.fire("pagehide", false);
    first.fire("pageshow", false);
    await settle();
    expect(locks.held(GAME_LOCK)).toBe(true);
    expect(first.reloads()).toBe(0);
  });

  it("вкладка, що чекає черги, іде в кеш — знімає свій запит: замок не дістанеться схованій вкладці", async () => {
    const locks = new FakeLocks();
    await openGame(fakeTab(locks).page, fakeGame);
    const second = fakeTab(locks);
    let opened = false;
    void openGame(second.page, () => {
      opened = true;
      return fakeGame();
    });
    await settle();
    second.fire("pagehide", true);
    locks.closeHolder(GAME_LOCK);
    await settle();
    expect(opened).toBe(false);
    expect(locks.held(GAME_LOCK)).toBe(false);
  });

  it("сторінка пішла в кеш ще до відповіді Web Locks — замка не бере: інакше він висів би в кеші, а інші вкладки чекали б", async () => {
    const locks = new FakeLocks();
    const tab = fakeTab(locks);
    let opened = false;
    void openGame(tab.page, () => {
      opened = true;
      return fakeGame();
    });
    tab.fire("pagehide", true);
    await settle();
    expect(opened).toBe(false);
    expect(locks.held(GAME_LOCK)).toBe(false);
  });

  it("Web Locks відмовили (помилка браузера) — гра відкривається, як без замка", async () => {
    const broken = {
      request: () => Promise.reject(new DOMException("Немає доступу", "SecurityError")),
    };
    const tab = fakeTab(undefined);
    const game = fakeGame();
    await expect(openGame({ ...tab.page, locks: broken as unknown as TabPage["locks"] }, () => game)).resolves.toBe(game);
  });

  it("повідомлення на заставці — що гру відкрито в іншій вкладці і що буде, коли ту закрити", () => {
    expect(TAB_BUSY.title).toMatch(/іншій вкладці/);
    expect(TAB_BUSY.body).toMatch(/Закрийте/);
  });
});

const pages = import.meta.glob<string>("../index.html", { query: "?raw", import: "default", eager: true });

describe("заставка: гру відкрито в іншій вкладці", () => {
  it("повідомлення замість смуги — тим самим місцем, що й «Гра не завантажилася» (`.boot-busy`)", () => {
    const html = pages["../index.html"] ?? "";
    expect(html).toMatch(/\.boot\.boot-busy \.boot-bar/);
    expect(html).toMatch(/\.boot\.boot-busy \.boot-fail/);
  });
});
