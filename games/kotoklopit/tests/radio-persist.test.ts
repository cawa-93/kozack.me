import { afterEach, describe, expect, it, vi } from "vitest";

import { RADIO } from "../src/audio/config";
import { persistentFetch, trim, type ChunkCache } from "../src/audio/radio/persist";

/** Cache Storage у пам'яті: ключі в порядку додавання, як у браузері. */
function memoryCache(): ChunkCache & { size: () => number; has: (url: string) => boolean } {
  const entries = new Map<string, Response>();
  return {
    async match(url) {
      return entries.get(url)?.clone();
    },
    async put(url, response) {
      entries.delete(url);
      entries.set(url, response);
    },
    async keys() {
      return [...entries.keys()].map((url) => new Request(url));
    },
    async delete(request) {
      return entries.delete(request.url);
    },
    size: () => entries.size,
    has: (url) => entries.has(url),
  };
}

const bytes = (n: number): Response => new Response(new Uint8Array(n));
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const URL_A = "https://music.example/music/a-m48/0.mp3";

describe("шматки між сесіями (§8.10)", () => {
  it("вдруге шматок береться зі сховища, без мережі", async () => {
    const cache = memoryCache();
    const network = vi.fn(async () => bytes(100));
    const get = persistentFetch(async () => cache, network);
    expect((await get(URL_A)).byteLength).toBe(100);
    await settle();
    expect((await get(URL_A)).byteLength).toBe(100);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("нова сесія знаходить те, що збережено в минулій", async () => {
    const cache = memoryCache();
    await persistentFetch(async () => cache, async () => bytes(100))(URL_A);
    await settle();
    const network = vi.fn(async () => bytes(100));
    await persistentFetch(async () => cache, network)(URL_A);
    expect(network).not.toHaveBeenCalled();
  });

  it("помилку мережі не зберігає й повідомляє про неї", async () => {
    const cache = memoryCache();
    const get = persistentFetch(async () => cache, async () => new Response("", { status: 404 }));
    await expect(get(URL_A)).rejects.toThrow("404");
    await settle();
    expect(cache.size()).toBe(0);
  });

  it("без сховища — просто мережа", async () => {
    const network = vi.fn(async () => bytes(10));
    const get = persistentFetch(async () => {
      throw new Error("приватне вікно");
    }, network);
    expect((await get(URL_A)).byteLength).toBe(10);
    expect((await get(URL_A)).byteLength).toBe(10);
    expect(network).toHaveBeenCalledTimes(2);
  });

  describe("сховище, що не відповідає, не тримає запит вічно: черга шматків чекає лише застиглої мережі", () => {
    afterEach(() => vi.useRealTimers());

    /** Скільки байтів повернув запит, поки йде фальшивий годинник; 0 — ще чекає. */
    const ask = (get: (url: string) => Promise<ArrayBuffer>): { got: number } => {
      const result = { got: 0 };
      void get(URL_A).then((data) => (result.got = data.byteLength));
      return result;
    };

    it("шукання в сховищі зависло — за `RADIO.stallMs` шматок береться з мережі", async () => {
      vi.useFakeTimers();
      const cache = memoryCache();
      cache.match = () => new Promise(() => undefined);
      const result = ask(persistentFetch(async () => cache, async () => bytes(10)));
      await vi.advanceTimersByTimeAsync(RADIO.stallMs - 100);
      expect(result.got).toBe(0);
      await vi.advanceTimersByTimeAsync(200);
      expect(result.got).toBe(10);
    });

    it("сховище не відкривається — так само", async () => {
      vi.useFakeTimers();
      const result = ask(persistentFetch(() => new Promise(() => undefined), async () => bytes(10)));
      await vi.advanceTimersByTimeAsync(RADIO.stallMs + 100);
      expect(result.got).toBe(10);
    });
  });

  it("сховище, що відмовляє записувати, гри не ламає", async () => {
    const cache = memoryCache();
    cache.put = async () => {
      throw new Error("квота");
    };
    const get = persistentFetch(async () => cache, async () => bytes(10));
    expect((await get(URL_A)).byteLength).toBe(10);
    await settle();
  });

  it("лишає лише найновіші шматки в межах ліміту", async () => {
    const cache = memoryCache();
    for (let i = 0; i < 7; i++) await cache.put(`https://music.example/music/a-m48/${i}.mp3`, bytes(1));
    await trim(cache, 3);
    expect(cache.size()).toBe(3);
    expect(cache.has("https://music.example/music/a-m48/0.mp3")).toBe(false);
    expect(cache.has("https://music.example/music/a-m48/6.mp3")).toBe(true);
  });

  it("прибирає саме, коли назбиралось нових", async () => {
    const cache = memoryCache();
    const get = persistentFetch(async () => cache, async () => bytes(1), 10);
    for (let i = 0; i < 50; i++) await get(`https://music.example/music/a-m48/${i}.mp3`);
    await settle();
    await settle();
    expect(cache.size()).toBe(10);
  });
});
